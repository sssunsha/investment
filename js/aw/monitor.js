// js/aw/monitor.js — 全天候标的监控：表格渲染 + SSE 加载 + 缓存逻辑

import { PORTFOLIO } from './config.js';
import { escHtml } from '../utils.js';
import { awLog } from './debug.js';

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
  if (item.ret_1d === undefined) return false;  // 触发旧缓存重新获取新字段
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
  const dash = '<span style="color:var(--border)">–</span>';
  const sk   = (w) => skeleton ? `<div class="skeleton" style="width:${w}"></div>` : dash;

  const defs = _getAwPoolDef();
  const rows = defs.map(def => `<tr id="aw-row-${def.code}">
    <td>${_groupBadge(def.group)}</td>
    <td>${_labelBadge(def.label)}</td>
    <td style="font-weight:600">${escHtml(def.fullName)}</td>
    <td style="color:var(--text-dim);font-size:13px">${def.code}</td>
    <td id="aw-ret-${def.code}">${sk('60%')}</td>
    <td id="aw-ret15-${def.code}">${sk('55%')}</td>
    <td id="aw-ret5-${def.code}">${sk('55%')}</td>
    <td id="aw-ret1-${def.code}">${sk('55%')}</td>
    <td id="aw-close-${def.code}">${sk('70%')}</td>
    <td id="aw-ma20-${def.code}">${sk('55%')}</td>
    <td id="aw-ma60-${def.code}">${sk('55%')}</td>
  </tr>`).join('');

  wrap.innerHTML = `
    <div class="mdtfr-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>类别</th><th>类型</th><th>基金名称</th><th>代码</th>
          <th class="sortable" data-sort="ret_30d">近30日涨跌 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="ret_15d">近15日涨跌 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="ret_5d">近5日涨跌 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="ret_1d">上一日涨跌 <span class="sort-icon">⇅</span></th>
          <th>收盘价</th>
          <th class="sortable" data-sort="above_ma20">vs MA20 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="ma60_trend">MA60趋势 <span class="sort-icon">⇅</span></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  setTimeout(() => _awInitColumnSorting(), 0);
}

// ── 填充单行数据 ───────────────────────────────────────────────
function awFillRow(item) {
  const c = item.code_c;
  if (!document.getElementById(`aw-row-${c}`)) return;

  if (item.error) {
    const closeEl = document.getElementById(`aw-close-${c}`);
    if (closeEl) closeEl.innerHTML =
      `<span style="color:var(--text-dim);font-size:12px">${escHtml(item.error)}</span>`;
    ['ret','ret15','ret5','ret1','ma20','ma60'].forEach(k => {
      const el = document.getElementById(`aw-${k}-${c}`);
      if (el) el.innerHTML = '<span style="color:var(--border)">–</span>';
    });
    return;
  }

  const formatRet = (val) => {
    if (val == null) return '<span style="color:var(--border)">–</span>';
    const color = val > 0 ? 'var(--red)' : val < 0 ? 'var(--green)' : 'var(--text-dim)';
    const str = (val > 0 ? '+' : '') + (val * 100).toFixed(2) + '%';
    return `<span style="font-weight:700;color:${color}">${str}</span>`;
  };

  document.getElementById(`aw-ret-${c}`).innerHTML   = formatRet(item.ret_30d);
  document.getElementById(`aw-ret15-${c}`).innerHTML = formatRet(item.ret_15d);
  document.getElementById(`aw-ret5-${c}`).innerHTML  = formatRet(item.ret_5d);
  document.getElementById(`aw-ret1-${c}`).innerHTML  = formatRet(item.ret_1d);

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
  const ma60El = document.getElementById(`aw-ma60-${c}`);
  ma60El.innerHTML = (() => {
    const trend = item.ma60_trend;
    if (!trend) return '<span style="color:var(--border)">–</span>';
    const rate = item.ma60_rate != null
      ? `<span style="font-size:11px;opacity:.7;margin-left:3px">${item.ma60_rate > 0 ? '+' : ''}${item.ma60_rate.toFixed(2)}%</span>`
      : '';
    const cfg = {
      '趋势向好': ['var(--red)',    '↑'],
      '持续下行': ['var(--green)',  '↓'],
      '未达标':   ['var(--yellow)', '→'],
    };
    const [color, arrow] = cfg[trend] || ['var(--border)', '–'];
    return `<span style="color:${color}">${arrow} ${trend}</span>${rate}`;
  })();
  ma60El.dataset.trend      = item.ma60_trend      ?? '';
  ma60El.dataset.ma60       = item.ma60             ?? '';
  ma60El.dataset.ma60Avg5   = item.ma60_avg5        ?? '';
  ma60El.dataset.ma60Rate   = item.ma60_rate        ?? '';
  ma60El.dataset.hasUptick  = item.ma60_has_uptick  ?? '';
  ma60El.dataset.aboveAvg   = item.ma60_above_avg   ?? '';
  ma60El.style.cursor       = item.ma60_trend ? 'help' : '';
}

// ── 列排序 ────────────────────────────────────────────────────
let _awItems = [];
let _awCurrentSort = { column: null, direction: 'desc' };

function setAwItems(items) {
  _awItems = items || [];
}

function _awInitColumnSorting() {
  document.querySelectorAll('#aw-monitor-table-wrap .sortable').forEach(th => {
    th.addEventListener('click', () => _handleAwSort(th.dataset.sort, th));
  });
}

function _handleAwSort(sortKey, th) {
  if (_awItems.length === 0) return;

  if (_awCurrentSort.column === sortKey) {
    _awCurrentSort.direction = _awCurrentSort.direction === 'desc' ? 'asc' : 'desc';
  } else {
    _awCurrentSort.column = sortKey;
    _awCurrentSort.direction = 'desc';
  }

  document.querySelectorAll('#aw-monitor-table-wrap .sortable .sort-icon').forEach(icon => {
    icon.textContent = '⇅';
    icon.style.opacity = '0.3';
  });
  const icon = th.querySelector('.sort-icon');
  icon.textContent = _awCurrentSort.direction === 'desc' ? '↓' : '↑';
  icon.style.opacity = '1';

  _awSortAndRender(_awItems, sortKey);
}

function _awSortAndRender(items, sortKey) {
  const tbody = document.querySelector('#aw-monitor-table-wrap tbody');
  if (!tbody) return;

  const trendOrder = { '趋势向好': 3, '未达标': 2, '持续下行': 1 };
  const validItems = items.filter(x => !x.error);
  const errorItems = items.filter(x => x.error);

  validItems.sort((a, b) => {
    let aVal, bVal;
    switch (sortKey) {
      case 'ret_30d': case 'ret_15d': case 'ret_5d': case 'ret_1d':
        aVal = a[sortKey] ?? -Infinity;
        bVal = b[sortKey] ?? -Infinity;
        break;
      case 'above_ma20':
        aVal = a.above_ma20 ? 1 : 0;
        bVal = b.above_ma20 ? 1 : 0;
        break;
      case 'ma60_trend':
        aVal = trendOrder[a.ma60_trend] ?? 0;
        bVal = trendOrder[b.ma60_trend] ?? 0;
        break;
      default:
        return 0;
    }
    return _awCurrentSort.direction === 'desc' ? bVal - aVal : aVal - bVal;
  });

  validItems.forEach(item => {
    const row = document.getElementById(`aw-row-${item.code_c}`);
    if (row) tbody.appendChild(row);
  });
  errorItems.forEach(item => {
    const row = document.getElementById(`aw-row-${item.code_c}`);
    if (row) tbody.appendChild(row);
  });
}

// ── SSE EventSource 句柄（避免重复打开）─────────────────────────
let _awEventSource = null;

// ── 主加载入口 ─────────────────────────────────────────────────
async function loadAwPool() {
  _awCurrentSort = { column: null, direction: 'desc' };
  awLog('info', '开始加载全天候标的监控数据...');
  const btn = document.getElementById('aw-load-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 加载中'; }

  const today = new Date().toISOString().slice(0, 10);
  const wrap  = document.getElementById('aw-monitor-table-wrap');
  if (wrap && !wrap.querySelector('table')) awInitTable(false);

  // 读缓存
  let cached = null;
  try {
    cached = await _cacheGet(today);
    awLog('cache', cached ? `读取缓存成功（${Array.isArray(cached) ? cached.length : 0} 条）` : '无今日缓存');
  } catch (e) {
    awLog('error', `读取缓存失败: ${e.message}`);
  }

  const cachedMap = {};
  if (cached && Array.isArray(cached)) cached.forEach(x => { cachedMap[x.code_c] = x; });

  const defs = _getAwPoolDef();
  const incomplete = defs.filter(def => !_rowComplete(cachedMap[def.code]));
  awLog('info', `完整缓存行: ${defs.length - incomplete.length} / ${defs.length}`);

  if (incomplete.length === 0) {
    cached.forEach(awFillRow);
    setAwItems(cached);
    document.getElementById('aw-monitor-time').textContent = `缓存数据 · ${today}`;
    if (btn) { btn.disabled = false; btn.innerHTML = '↺ 刷新'; }
    awLog('done', '全部命中缓存，无需 SSE 请求');
    return;
  }

  // 有完整缓存行先填；不完整行设骨架屏
  Object.values(cachedMap).filter(_rowComplete).forEach(awFillRow);
  const sk = (w) => `<div class="skeleton" style="width:${w}"></div>`;
  incomplete.forEach(def => {
    ['ret','ret15','ret5','ret1','close','ma20','ma60'].forEach((k, i) => {
      const el = document.getElementById(`aw-${k}-${def.code}`);
      if (el) el.innerHTML = sk(['60%','55%','55%','55%','70%','55%','55%'][i]);
    });
  });

  if (_awEventSource) { _awEventSource.close(); }

  awLog('info', `打开 SSE /api/strategy/aw-pool/stream，待补全 ${incomplete.length} 行`);
  const collected = Object.values(cachedMap).filter(_rowComplete);
  const saveSnapshot = async () => {
    const snapshot = defs.map(def => collected.find(x => x.code_c === def.code)).filter(Boolean);
    try { await _cachePut(today, snapshot); } catch (e) { awLog('error', `缓存写入失败: ${e.message}`); }
    return snapshot;
  };

  const es = new EventSource('/api/strategy/aw-pool/stream');
  _awEventSource = es;

  es.onmessage = async (e) => {
    let d;
    try { d = JSON.parse(e.data); } catch { return; }

    if (d.type === 'progress') {
      awLog('info', `获取中: ${d.name}`);
    } else if (d.type === 'item') {
      const status = d.error ? `错误: ${d.error}` : `close=${d.latest_close} ret30d=${d.ret_30d != null ? (d.ret_30d * 100).toFixed(2) + '%' : 'N/A'} ma60=${d.ma60_trend}`;
      awLog(d.error ? 'error' : 'ok', `${d.name}（${d.code_c}）: ${status}`);
      const idx = collected.findIndex(x => x.code_c === d.code_c);
      if (idx >= 0) collected.splice(idx, 1, d); else collected.push(d);
      awFillRow(d);
      await saveSnapshot();
    } else if (d.type === 'error') {
      awLog('error', `SSE 服务端错误: ${d.msg}`);
      es.close();
      if (btn) { btn.disabled = false; btn.innerHTML = '↺ 重试'; }
    } else if (d.type === 'done') {
      es.close();
      const snapshot = await saveSnapshot();
      setAwItems(snapshot);
      document.getElementById('aw-monitor-time').textContent =
        `已更新 · ${d.last_updated ? d.last_updated.slice(0, 19) : today}`;
      if (btn) { btn.disabled = false; btn.innerHTML = '↺ 刷新'; }
      awLog('done', `加载完成，共 ${collected.length} 条数据`);
    }
  };

  es.onerror = () => {
    awLog('error', 'SSE 连接中断');
    es.close();
    if (btn) { btn.disabled = false; btn.innerHTML = '↺ 重试'; }
  };
}

// ── 清空缓存并重置 UI ──────────────────────────────────────────
async function clearAndResetAw() {
  _awCurrentSort = { column: null, direction: 'desc' };
  _awItems = [];
  const today = new Date().toISOString().slice(0, 10);
  try {
    await _cacheDelete(today);
    document.getElementById('aw-monitor-time').textContent = '缓存已清空';
    awInitTable(false);
    awLog('cache', '缓存已清空，UI 已重置');
  } catch (e) {
    awLog('error', `清空缓存失败: ${e.message}`);
  }
}

// ── 页面初始化入口（仅首次，避免重复渲染）─────────────────────
async function awMaybeInitEmpty() {
  const wrap = document.getElementById('aw-monitor-table-wrap');
  if (!wrap || wrap.querySelector('table')) return;
  awInitTable(false);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = await _cacheGet(today);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      cached.forEach(awFillRow);
      setAwItems(cached);
      document.getElementById('aw-monitor-time').textContent = `缓存数据 · ${today}`;
      awLog('cache', `页面初始化：命中今日缓存（${cached.length} 条）`);
    } else {
      awLog('info', '页面初始化：无今日缓存，等待用户手动加载');
    }
  } catch (e) {
    awLog('error', `初始化读取缓存失败: ${e.message}`);
  }
}

export { awMaybeInitEmpty, awInitTable, loadAwPool, awFillRow, clearAndResetAw };
