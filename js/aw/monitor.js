// js/aw/monitor.js — 全天候标的监控：表格渲染 + SSE 加载 + 缓存逻辑

import { PORTFOLIO, ASSET_COLORS } from './config.js';
import { escHtml } from '../utils.js';

// ── 14行标的定义（主力在前，替代在后，按 PORTFOLIO 顺序）────────
function _getAwPoolDef() {
  const defs = [];
  for (const asset of PORTFOLIO) {
    defs.push({ ...asset, label: '主力', baostock_code: asset.baostock_code });
    defs.push({ ...asset, ...asset.alt, id: asset.id, group: asset.group,
                label: '替代', baostock_code: asset.alt.baostock_code });
  }
  return defs;
}

// ── 缓存 helpers（REST API → ~/.investment/YYYY/MM/aw_pool.json）──
async function _cacheGet(date) {
  const res = await fetch(`/api/cache/aw-pool/${date}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取AW缓存失败: ${res.status}`);
  return res.json();
}

async function _cachePut(date, value) {
  const res = await fetch(`/api/cache/aw-pool/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`写入AW缓存失败: ${res.status}`);
}

async function _cacheDelete(date) {
  const res = await fetch(`/api/cache/aw-pool/${date}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除AW缓存失败: ${res.status}`);
}

// ── 单行完整性检查 ─────────────────────────────────────────────
function _rowComplete(item) {
  if (!item || item.error) return false;
  if (item.ret_30d == null || item.latest_close == null) return false;
  if (item.ma60_trend == null) return false;
  return true;
}

// ── 类别 badge ─────────────────────────────────────────────────
function _groupBadge(group) {
  const map = {
    stock:  { bg: 'rgba(59,130,246,.15)',  color: 'var(--blue)',   label: '股票' },
    bond_l: { bg: 'rgba(6,182,212,.15)',   color: 'var(--cyan)',   label: '长期债' },
    bond_m: { bg: 'rgba(168,85,247,.15)',  color: 'var(--purple)', label: '中期债' },
    gold:   { bg: 'rgba(234,179,8,.15)',   color: 'var(--yellow)', label: '黄金' },
    comm:   { bg: 'rgba(249,115,22,.15)',  color: 'var(--orange)', label: '商品' },
  };
  const { bg, color, label } = map[group] || map.stock;
  return `<span style="font-size:12px;padding:2px 7px;border-radius:4px;font-weight:700;background:${bg};color:${color}">${label}</span>`;
}

// ── 类型 badge (主力/替代) ──────────────────────────────────────
function _labelBadge(label) {
  const isPrimary = label === '主力';
  const bg    = isPrimary ? 'rgba(34,197,94,.12)'  : 'rgba(148,163,184,.12)';
  const color = isPrimary ? 'var(--green)'         : 'var(--text-dim)';
  return `<span style="font-size:11px;padding:1px 6px;border-radius:3px;font-weight:600;background:${bg};color:${color}">${label}</span>`;
}

// ── 表格初始化（skeleton=true 显示加载动画，false 显示空占位）──
function awInitTable(skeleton = false) {
  const wrap = document.getElementById('aw-monitor-table-wrap');
  if (!wrap) return;
  const sortBtn = document.getElementById('aw-sort-btn');
  if (sortBtn) { sortBtn.style.display = 'none'; sortBtn.innerHTML = '↕ 排序'; sortBtn.style.color = ''; sortBtn.style.borderColor = ''; }
  const dash = '<span style="color:var(--border)">–</span>';
  const sk   = (w) => skeleton ? `<div class="skeleton" style="width:${w}"></div>` : dash;

  const defs = _getAwPoolDef();
  const rows = defs.map(def => `<tr id="aw-row-${def.code}">
    <td>${_groupBadge(def.group)}</td>
    <td>${_labelBadge(def.label)}</td>
    <td style="font-weight:600">${escHtml(def.fullName)}</td>
    <td style="color:var(--text-dim);font-size:13px">${def.code}</td>
    <td id="aw-ret-${def.code}">${sk('60%')}</td>
    <td id="aw-close-${def.code}">${sk('70%')}</td>
    <td id="aw-ma20-${def.code}">${sk('55%')}</td>
    <td id="aw-ma60-${def.code}">${sk('55%')}</td>
  </tr>`).join('');

  wrap.innerHTML = `
    <div class="mdtfr-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>类别</th><th>类型</th><th>基金名称</th><th>代码</th>
          <th>近30日涨跌</th><th>收盘价</th><th>vs MA20</th><th>MA60趋势</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── 填充单行数据 ───────────────────────────────────────────────
function awFillRow(item) {
  const c = item.code_c;
  if (!document.getElementById(`aw-row-${c}`)) return;

  if (item.error) {
    document.getElementById(`aw-close-${c}`).innerHTML =
      `<span style="color:var(--text-dim);font-size:12px">${escHtml(item.error)}</span>`;
    ['ret','ma20','ma60'].forEach(k => {
      const el = document.getElementById(`aw-${k}-${c}`);
      if (el) el.innerHTML = '<span style="color:var(--border)">–</span>';
    });
    return;
  }

  // 近30日涨跌
  const ret = item.ret_30d;
  const retColor = ret > 0 ? 'var(--red)' : ret < 0 ? 'var(--green)' : 'var(--text-dim)';
  const retStr   = ret != null ? (ret > 0 ? '+' : '') + (ret * 100).toFixed(2) + '%' : '–';
  document.getElementById(`aw-ret-${c}`).innerHTML =
    `<span style="font-weight:700;color:${retColor}">${retStr}</span>`;

  // 收盘价
  document.getElementById(`aw-close-${c}`).textContent =
    item.latest_close != null ? item.latest_close.toFixed(3) : '–';

  // vs MA20
  document.getElementById(`aw-ma20-${c}`).innerHTML = (() => {
    if (item.above_ma20 == null) return '<span style="color:var(--border)">–</span>';
    const icon  = item.above_ma20 ? '✓' : '✗';
    const color = item.above_ma20 ? 'var(--green)' : 'var(--red)';
    const ma20s = item.ma20 != null ? item.ma20.toFixed(3) : '';
    return `<span style="color:${color}">${icon}</span><span style="color:var(--text-dim);font-size:12px;margin-left:4px">${ma20s}</span>`;
  })();

  // MA60趋势
  document.getElementById(`aw-ma60-${c}`).innerHTML = (() => {
    const trend = item.ma60_trend;
    if (!trend) return '<span style="color:var(--border)">–</span>';
    const rate = item.ma60_rate != null
      ? `<span style="font-size:11px;opacity:.7;margin-left:3px">${item.ma60_rate > 0 ? '+' : ''}${item.ma60_rate.toFixed(2)}%</span>`
      : '';
    const cfg = {
      '趋势向好': ['var(--green)', '↑'],
      '持续下行': ['var(--red)',   '↓'],
      '未达标':   ['var(--yellow)','→'],
    };
    const [color, arrow] = cfg[trend] || ['var(--border)', '–'];
    return `<span style="color:${color}">${arrow} ${trend}</span>${rate}`;
  })();
}

// ── 排序 ───────────────────────────────────────────────────────
let _awSorted = false;

function toggleAwSort() {
  const tbody = document.querySelector('#aw-monitor-table-wrap tbody');
  if (!tbody) return;
  const btn = document.getElementById('aw-sort-btn');

  if (!_awSorted) {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const getRet = (row) => {
        const el = row.querySelector('[id^="aw-ret-"] span');
        if (!el) return -Infinity;
        const t = el.textContent.replace('%', '').replace('+', '');
        return parseFloat(t) || -Infinity;
      };
      return getRet(b) - getRet(a);
    });
    rows.forEach(r => tbody.appendChild(r));
    btn.innerHTML = '↩ 恢复';
    btn.style.color = 'var(--cyan)';
    btn.style.borderColor = 'var(--cyan)';
    _awSorted = true;
  } else {
    _getAwPoolDef().forEach(def => {
      const row = document.getElementById(`aw-row-${def.code}`);
      if (row) tbody.appendChild(row);
    });
    btn.innerHTML = '↕ 排序';
    btn.style.color = '';
    btn.style.borderColor = '';
    _awSorted = false;
  }
}

// ── SSE EventSource 句柄（避免重复打开）─────────────────────────
let _awEventSource = null;

// ── 主加载入口 ─────────────────────────────────────────────────
async function loadAwPool() {
  const btn = document.getElementById('aw-load-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 加载中'; }

  const today = new Date().toISOString().slice(0, 10);
  const wrap  = document.getElementById('aw-monitor-table-wrap');
  if (wrap && !wrap.querySelector('table')) awInitTable(false);

  // 读缓存
  let cached = null;
  try { cached = await _cacheGet(today); } catch (e) { console.warn('AW缓存读取失败', e); }

  const cachedMap = {};
  if (cached && Array.isArray(cached)) cached.forEach(x => { cachedMap[x.code_c] = x; });

  const defs = _getAwPoolDef();
  const incomplete = defs.filter(def => !_rowComplete(cachedMap[def.code]));

  if (incomplete.length === 0) {
    cached.forEach(awFillRow);
    document.getElementById('aw-monitor-time').textContent = `缓存数据 · ${today}`;
    const sortBtn = document.getElementById('aw-sort-btn');
    if (sortBtn) sortBtn.style.display = '';
    if (btn) { btn.disabled = false; btn.innerHTML = '↺ 刷新'; }
    return;
  }

  // 有完整缓存行先填；不完整行设骨架屏
  Object.values(cachedMap).filter(_rowComplete).forEach(awFillRow);
  const sk = (w) => `<div class="skeleton" style="width:${w}"></div>`;
  incomplete.forEach(def => {
    ['ret','close','ma20','ma60'].forEach((k, i) => {
      const el = document.getElementById(`aw-${k}-${def.code}`);
      if (el) el.innerHTML = sk(['60%','70%','55%','55%'][i]);
    });
  });

  if (_awEventSource) { _awEventSource.close(); }

  const collected = Object.values(cachedMap).filter(_rowComplete);
  const saveSnapshot = async () => {
    const snapshot = defs.map(def => collected.find(x => x.code_c === def.code)).filter(Boolean);
    try { await _cachePut(today, snapshot); } catch (e) { console.warn('AW缓存写入失败', e); }
    return snapshot;
  };

  const es = new EventSource('/api/strategy/aw-pool/stream');
  _awEventSource = es;

  es.onmessage = async (e) => {
    let d;
    try { d = JSON.parse(e.data); } catch { return; }

    if (d.type === 'progress') {
      // 可选：前端进度日志
    } else if (d.type === 'item') {
      const idx = collected.findIndex(x => x.code_c === d.code_c);
      if (idx >= 0) collected.splice(idx, 1, d); else collected.push(d);
      awFillRow(d);
      await saveSnapshot();
    } else if (d.type === 'error') {
      console.error('AW SSE error:', d.msg);
      es.close();
      if (btn) { btn.disabled = false; btn.innerHTML = '↺ 重试'; }
    } else if (d.type === 'done') {
      es.close();
      await saveSnapshot();
      document.getElementById('aw-monitor-time').textContent =
        `已更新 · ${d.last_updated ? d.last_updated.slice(0, 19) : today}`;
      const sortBtn = document.getElementById('aw-sort-btn');
      if (sortBtn) sortBtn.style.display = '';
      if (btn) { btn.disabled = false; btn.innerHTML = '↺ 刷新'; }
    }
  };

  es.onerror = () => {
    console.error('AW SSE 连接中断');
    es.close();
    if (btn) { btn.disabled = false; btn.innerHTML = '↺ 重试'; }
  };
}

// ── 清空缓存并重置 UI ──────────────────────────────────────────
async function clearAndResetAw() {
  _awSorted = false;
  const today = new Date().toISOString().slice(0, 10);
  try {
    await _cacheDelete(today);
    document.getElementById('aw-monitor-time').textContent = '缓存已清空';
    awInitTable(false);  // awInitTable already hides sort button
  } catch (e) {
    console.error('清空AW缓存失败', e);
  }
}

// ── 页面初始化入口（仅首次，避免重复渲染）─────────────────────
async function awMaybeInitEmpty() {
  const wrap = document.getElementById('aw-monitor-table-wrap');
  if (!wrap || wrap.querySelector('table')) return; // 已初始化
  awInitTable(false);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = await _cacheGet(today);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      cached.forEach(awFillRow);
      document.getElementById('aw-monitor-time').textContent = `缓存数据 · ${today}`;
      const sortBtn = document.getElementById('aw-sort-btn');
      if (sortBtn) sortBtn.style.display = '';
    }
  } catch (e) {
    console.warn('AW初始化缓存读取失败', e);
  }
}

export { awMaybeInitEmpty, awInitTable, loadAwPool, awFillRow, clearAndResetAw, toggleAwSort };
