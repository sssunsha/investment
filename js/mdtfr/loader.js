// js/mdtfr/loader.js
// 数据加载入口：负责初始化表格、缓存优先加载、SSE 实时补全、清空缓存等编排逻辑

import { getMdtfrPoolDef } from './config.js';
import { cacheGet, cachePut, clearMdtfrCache } from './cache.js';
import { mdtfrLog, clearMdtfrDebug } from './debug.js';
import {
  mdtfrInitTable, mdtfrFillRow, mdtfrFillRanks,
  mdtfrRenderFromCache, mdtfrRowComplete,
} from './table.js';
import { loadAmounts, refreshAllPosPct } from './amounts.js';
import { loadWatchState, updateWatchState, saveWatchState } from './watch.js';
import { mdtfrRenderAdvice } from './advice.js';

// ── 仅在未初始化时渲染空表格，并尝试从本地 JSON 缓存填充当日数据 ──
async function mdtfrMaybeInitEmpty() {
  const body = document.getElementById('mdtfr-body');
  if (!body || !body.querySelector('.empty-state')) return; // 已有表格，跳过
  await loadAmounts();     // 先从文件加载金额，再渲染表格
  mdtfrInitTable(false);   // 渲染空表格结构（mkAmtCell 会读取已加载的 _amt）
  refreshAllPosPct();      // 渲染总持仓市值
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = await cacheGet(today);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      cached.forEach(mdtfrFillRow);
      await loadWatchState();
      await updateWatchState(cached);
      saveWatchState();
      mdtfrFillRanks(cached);
      mdtfrRenderAdvice(cached);
      document.getElementById('mdtfr-last-updated').textContent = `缓存数据 · ${today}`;
      mdtfrLog('cache', `页面初始化：命中今日缓存（${cached.length} 条）`);
    }
  } catch(e) {
    mdtfrLog('error', `读取缓存失败: ${e.message}`);
  }
}

// ── 排序按钮切换：按排名升序 / 恢复原始顺序 ────────────────────
let _mdtfrSorted = false;

function toggleMdtfrSort() {
  const tbody = document.querySelector('#mdtfr-body tbody');
  if (!tbody) return;
  const btn = document.getElementById('mdtfr-sort-btn');

  if (!_mdtfrSorted) {
    // 按排名升序排列（无排名的行移到末尾）
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const ra = parseInt(a.querySelector('[id^="mdtfr-rank-"] .rank-badge')?.textContent) || 999;
      const rb = parseInt(b.querySelector('[id^="mdtfr-rank-"] .rank-badge')?.textContent) || 999;
      return ra - rb;
    });
    rows.forEach(r => tbody.appendChild(r));
    btn.innerHTML = '↩ 恢复';
    btn.style.color = 'var(--cyan)';
    btn.style.borderColor = 'var(--cyan)';
    _mdtfrSorted = true;
  } else {
    // 恢复原始顺序（按 MDTFR_POOL_DEF 顺序）
    getMdtfrPoolDef().forEach(def => {
      const row = document.getElementById(`mdtfr-row-${def.code_c}`);
      if (row) tbody.appendChild(row);
    });
    btn.innerHTML = '↕ 排序';
    btn.style.color = '';
    btn.style.borderColor = '';
    _mdtfrSorted = false;
  }
}

// ── SSE EventSource 句柄（避免多次打开） ────────────────────────
let _mdtfrEventSource = null;

// ── 主入口：缓存优先，不完整行触发定向 SSE 补全 ─────────────────
async function loadMdtfrPool() {
  const btn = document.getElementById('mdtfr-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 检查缓存';
  clearMdtfrDebug();

  const today = new Date().toISOString().slice(0, 10);

  // 先确保表格结构存在
  const body = document.getElementById('mdtfr-body');
  if (body.querySelector('.empty-state')) mdtfrInitTable(false);

  // 读取今日缓存
  let cached = null;
  try { cached = await cacheGet(today); } catch(e) { mdtfrLog('error', `读取缓存失败: ${e.message}`); }

  // 构建缓存 Map，检测不完整行
  const cachedMap = {};
  if (cached && Array.isArray(cached)) cached.forEach(x => { cachedMap[x.code_c] = x; });

  const poolDef = getMdtfrPoolDef();
  const incomplete = poolDef.filter(def => !mdtfrRowComplete(cachedMap[def.code_c]));

  if (incomplete.length === 0) {
    // 全部完整：直接渲染，不调用 SDK
    mdtfrLog('cache', `今日缓存完整（${cached.length} 条），跳过 SDK 分析`);
    cached.forEach(mdtfrFillRow);
    await loadWatchState();
    await updateWatchState(cached);
    saveWatchState();
    mdtfrFillRanks(cached);
    mdtfrRenderAdvice(cached);
    document.getElementById('mdtfr-last-updated').textContent = `缓存数据 · ${today}`;
    btn.disabled = false;
    btn.innerHTML = '↺ 刷新';
    return;
  }

  // 有不完整行：只对这些行设骨架屏，其余保持现有数据
  const skeletonCell = w => `<div class="skeleton" style="width:${w}"></div>`;

  if (Object.keys(cachedMap).length > 0) {
    // 先把完整缓存行填进去
    Object.values(cachedMap).filter(mdtfrRowComplete).forEach(mdtfrFillRow);
  }
  incomplete.forEach(def => {
    ['close','ret','ma20','ma60'].forEach((k, i) => {
      const el = document.getElementById(`mdtfr-${k}-${def.code_c}`);
      if (el) el.innerHTML = skeletonCell(['70%','60%','55%','55%'][i]);
    });
    const rankEl = document.getElementById(`mdtfr-rank-${def.code_c}`);
    if (rankEl) rankEl.innerHTML = skeletonCell('22px');
  });

  const codesParam = incomplete.map(d => d.code_c).join(',');
  const isPartial = incomplete.length < poolDef.length;
  if (isPartial) {
    mdtfrLog('info', `缓存中 ${incomplete.length} 行不完整（${incomplete.map(d=>d.name).join('、')}），仅重新获取这些行`);
  } else {
    mdtfrLog('info', `无今日缓存，开始拉取全部数据 — ${today}`);
    mdtfrInitTable(true);
  }

  if (_mdtfrEventSource) { _mdtfrEventSource.close(); }

  // collected 从已有完整缓存出发，SSE 新数据会覆盖不完整行
  const collected = Object.values(cachedMap).filter(mdtfrRowComplete);
  const url = `/api/strategy/mdtfr-pool/stream${codesParam ? '?codes=' + codesParam : ''}`;
  const es = new EventSource(url);
  _mdtfrEventSource = es;

  // 将 collected 当前快照按文档顺序写入本地 JSON 文件
  const saveSnapshot = async (label) => {
    const snapshot = poolDef
      .map(def => collected.find(x => x.code_c === def.code_c))
      .filter(Boolean);
    try {
      await cachePut(today, snapshot);
      if (label) mdtfrLog('cache', `已写入缓存 · ${label} · 共 ${snapshot.length} 条`);
    } catch(e) {
      mdtfrLog('error', `写入缓存失败: ${e.message}`);
    }
    return snapshot;
  };

  es.onmessage = async (e) => {
    let d;
    try { d = JSON.parse(e.data); } catch { return; }

    if (d.type === 'progress') {
      mdtfrLog('info', `[${d.name}] ${d.msg}`);
    } else if (d.type === 'item') {
      // 用新数据替换或追加到 collected，立即写入缓存
      const idx = collected.findIndex(x => x.code_c === d.code_c);
      if (idx >= 0) collected.splice(idx, 1, d); else collected.push(d);
      mdtfrFillRow(d);
      if (d.error) {
        mdtfrLog('error', `[${d.name}] ⚠ ${d.error}`);
      } else {
        const r = d.ret_20d != null ? (d.ret_20d>0?'+':'')+(d.ret_20d*100).toFixed(2)+'%' : '–';
        mdtfrLog('ok', `[${d.name}] 完成 · 近20日: ${r} · MA20:${d.above_ma20?'站上':'跌破'} · MA60:${d.ma60_trend||'N/A'}${d.ma60_rate!=null?' ('+(d.ma60_rate>0?'+':'')+d.ma60_rate.toFixed(2)+'%)':''}`);
      }
      await saveSnapshot(d.name);  // 每条数据到达即写入本地 JSON 文件
    } else if (d.type === 'error') {
      mdtfrLog('error', `BaoStock 错误: ${d.msg}`);
      es.close();
      btn.disabled = false; btn.innerHTML = '↺ 重试';
    } else if (d.type === 'done') {
      es.close();
      // 最终排名/建议在全部数据到齐后统一计算
      const orderedCollected = await saveSnapshot('全部完成');
      await loadWatchState();
      await updateWatchState(orderedCollected);
      saveWatchState();
      mdtfrFillRanks(orderedCollected);
      mdtfrRenderAdvice(orderedCollected);
      mdtfrLog('done', `补全完成 · ${d.last_updated}`);
      document.getElementById('mdtfr-last-updated').textContent = `已更新 · ${d.last_updated ? d.last_updated.slice(0,19) : today}`;
      btn.disabled = false; btn.innerHTML = '↺ 刷新';
    }
  };

  es.onerror = () => {
    mdtfrLog('error', 'SSE 连接中断');
    es.close();
    btn.disabled = false; btn.innerHTML = '↺ 重试';
  };
}

// ── 清空缓存并重置 UI（在 cache.js 纯数据层上增加 UI 副作用）──────
async function clearAndResetMdtfr() {
  _mdtfrSorted = false;  // 同步重置排序状态，避免模块分离后 table.js 无法重置该标志
  const today = new Date().toISOString().slice(0, 10);
  try {
    await clearMdtfrCache();
    mdtfrLog('cache', `已清空 ${today} 的缓存数据，下次加载将重新获取`);
    document.getElementById('mdtfr-last-updated').textContent = '缓存已清空';
    mdtfrInitTable(false);
  } catch(e) {
    mdtfrLog('error', `清空缓存失败: ${e.message}`);
  }
}

export { loadMdtfrPool, mdtfrMaybeInitEmpty, toggleMdtfrSort, clearAndResetMdtfr };
