// js/aw/monitor.js — 全天候标的监控：表格渲染 + SSE 加载 + 缓存逻辑

import { PORTFOLIO, awAltSet, getActiveAsset } from './config.js';
import { escHtml } from '../utils.js';
import { awLog } from './debug.js';
import { mkAwAmtCell, mkAwSharesCell, mkAwPosPct, refreshAwAmtPnl, getAwShares } from './amounts.js';
import { refreshStaleChip } from './stale-positions.js';
import { openAwOverlay, closeAwOverlay, getAwActiveCode } from './kline-overlay.js';

// ── 7行活跃标的定义（每个资产取当前活跃基金）──────────────────
function _getAwPoolDef() {
  return PORTFOLIO.map(asset => {
    const active = getActiveAsset(asset);
    const label = awAltSet.has(asset.id) ? '替代' : '主力';
    return { ...asset, ...active, id: asset.id, group: asset.group, target: asset.target, label, altExists: !!asset.alt };
  });
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
  if (item.ret_1y === undefined || item.latest_close == null) return false;
  if (item.ma60_trend == null) return false;
  if (item.ret_1m === undefined) return false;  // 触发旧缓存重新获取新字段
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
function _labelBadge(def) {
  const isPrimary = def.label === '主力';
  const bg    = isPrimary ? 'rgba(34,197,94,.12)'  : 'rgba(148,163,184,.12)';
  const color = isPrimary ? 'var(--green)'         : 'var(--text-dim)';
  return `<span style="font-size:11px;padding:1px 6px;border-radius:3px;font-weight:600;background:${bg};color:${color}">${def.label}</span>`;
}

// ── 抽屉单行构建 ──────────────────────────────────────────────
function _buildDrawerRow(asset) {
  const altActive = awAltSet.has(asset.id);
  const hasAlt    = !!asset.alt;
  const activeStyle = 'background:rgba(34,197,94,.18);color:var(--green);border-color:rgba(34,197,94,.5);font-weight:700';
  const dimStyle    = 'background:transparent;color:var(--text-dim);border-color:var(--border)';

  const toggleHtml = hasAlt ? `
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
      <button class="btn btn-sm" style="${!altActive ? activeStyle : dimStyle};font-size:12px;padding:2px 10px"
        ${altActive ? `onclick="toggleAwAlt('${asset.id}')"` : ''}>● 主力</button>
      <button class="btn btn-sm" style="${altActive ? activeStyle : dimStyle};font-size:12px;padding:2px 10px"
        ${!altActive ? `onclick="toggleAwAlt('${asset.id}')"` : ''}>○ 替代</button>
    </div>
    <div style="flex:1;min-width:150px;font-size:13px;color:var(--text-dim)">
      ${asset.alt.fullName} <span style="opacity:.6">${asset.alt.code}</span>
    </div>` : `<span style="font-size:12px;color:var(--text-dim);opacity:.5">无替代标的</span>`;

  return `<div id="aw-drawer-row-${asset.id}" style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap">
    ${_groupBadge(asset.group)}
    <div style="flex:1;min-width:160px;font-size:13px;color:var(--text-dim)">
      ${asset.fullName} <span style="opacity:.6">${asset.code}</span>
    </div>
    ${toggleHtml}
    <span style="font-size:12px;color:var(--text-dim);flex-shrink:0;margin-left:auto">${(asset.target * 100).toFixed(0)}%</span>
  </div>`;
}

// ── 从 baostock_code 提取 ETF 代码（如 'sh.510300' → '510300'）──
function _extractEtf(baostock_code) {
  if (!baostock_code) return '';
  const parts = baostock_code.split('.');
  return parts.length === 2 ? parts[1] : '';
}

// ── 表格初始化（skeleton=true 显示加载动画，false 显示空占位）──
function awInitTable(skeleton = false) {
  const wrap = document.getElementById('aw-monitor-table-wrap');
  if (!wrap) return;
  const dash = '<span style="color:var(--border)">–</span>';
  const sk   = (w) => skeleton ? `<div class="skeleton" style="width:${w}"></div>` : dash;

  const defs = _getAwPoolDef();
  const rows = defs.map(def => {
    const etf = _extractEtf(def.baostock_code);
    const radioTd = etf
      ? `<td class="kline-radio-td"><input class="kline-radio" type="radio" name="aw-kline-select" value="${def.code}" data-etf="${etf}" data-name="${escHtml(def.fullName)}"></td>`
      : `<td class="kline-radio-td"></td>`;
    return `<tr id="aw-row-${def.code}" data-asset-id="${def.id}">
    ${radioTd}
    <td>${_groupBadge(def.group)}</td>
    <td id="aw-type-${def.code}">${_labelBadge(def)}</td>
    <td style="font-weight:600">${escHtml(def.fullName)}</td>
    <td style="color:var(--text-dim);font-size:13px">${def.code}</td>
    <td id="aw-ret1y-${def.code}">${sk('60%')}</td>
    <td id="aw-ret6m-${def.code}">${sk('55%')}</td>
    <td id="aw-ret3m-${def.code}">${sk('55%')}</td>
    <td id="aw-ret1m-${def.code}">${sk('55%')}</td>
    <td id="aw-close-${def.code}">${sk('70%')}</td>
    <td id="aw-ma20-${def.code}">${sk('55%')}</td>
    <td id="aw-ma60-${def.code}">${sk('55%')}</td>
    <td id="aw-amt-cell-${def.code}">${mkAwAmtCell(def.code)}</td>
    <td id="aw-shares-cell-${def.code}">${mkAwSharesCell(def.code)}</td>
    <td>${mkAwPosPct(def.code)}</td>
    <td style="text-align:right;color:var(--text-dim);font-size:13px">${(def.target * 100).toFixed(0)}%</td>
  </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="mdtfr-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th class="kline-radio-th"></th>
          <th>类别</th><th>类型</th><th>基金名称</th><th>代码</th>
          <th class="sortable" data-sort="ret_1y">近一年涨跌 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="ret_6m">近6个月涨跌 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="ret_3m">近3个月涨跌 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="ret_1m">近1个月涨跌 <span class="sort-icon">⇅</span></th>
          <th>收盘价</th>
          <th class="sortable" data-sort="above_ma20">vs MA20 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="ma60_trend">MA60趋势 <span class="sort-icon">⇅</span></th>
          <th style="min-width:160px">持仓金额(元)</th>
          <th>份额</th>
          <th>仓位%</th>
          <th>目标%</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  setTimeout(() => {
    _awInitColumnSorting();
    _awInitKlineRadio();
  }, 0);
}

// ── K线图 radio 事件绑定 ──────────────────────────────────────────
function _awInitKlineRadio() {
  document.querySelectorAll('#aw-monitor-table-wrap input.kline-radio').forEach(radio => {
    radio.addEventListener('click', () => {
      const code = radio.value;
      const etf  = radio.dataset.etf;
      const name = radio.dataset.name;
      const wrap = radio.closest('.mdtfr-table-wrap');
      if (getAwActiveCode() === code) {
        radio.checked = false;
        closeAwOverlay();
      } else {
        openAwOverlay(wrap, code, etf, name);
      }
    });
  });
}

// ── MA60趋势 HTML 片段 ─────────────────────────────────────────
function _ma60Html(item) {
  const trend = item.ma60_trend;
  if (!trend) return '<span style="color:var(--border)">–</span>';
  let rateHtml = '';
  if (item.ma60_rate != null) {
    const sign = item.ma60_rate > 0 ? '+' : '';
    rateHtml = `<span style="font-size:11px;opacity:.7;margin-left:3px">${sign}${item.ma60_rate.toFixed(2)}%</span>`;
  }
  const cfg = {
    '趋势向好': ['var(--red)',    '↑'],
    '持续下行': ['var(--green)',  '↓'],
    '未达标':   ['var(--yellow)', '→'],
  };
  const [color, arrow] = cfg[trend] || ['var(--border)', '–'];
  return `<span style="color:${color}">${arrow} ${trend}</span>${rateHtml}`;
}

// ── 填充单行数据 ───────────────────────────────────────────────
function awFillRow(item) {
  const c = item.code_c;
  if (!document.getElementById(`aw-row-${c}`)) return;

  if (item.error) {
    const closeEl = document.getElementById(`aw-close-${c}`);
    if (closeEl) closeEl.innerHTML =
      `<span style="color:var(--text-dim);font-size:12px">${escHtml(item.error)}</span>`;
    ['ret1y','ret6m','ret3m','ret1m','ma20','ma60'].forEach(k => {
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

  document.getElementById(`aw-ret1y-${c}`).innerHTML = formatRet(item.ret_1y);
  document.getElementById(`aw-ret6m-${c}`).innerHTML = formatRet(item.ret_6m);
  document.getElementById(`aw-ret3m-${c}`).innerHTML = formatRet(item.ret_3m);
  document.getElementById(`aw-ret1m-${c}`).innerHTML = formatRet(item.ret_1m);

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
  ma60El.innerHTML = _ma60Html(item);
  ma60El.dataset.trend      = item.ma60_trend      ?? '';
  ma60El.dataset.ma60       = item.ma60             ?? '';
  ma60El.dataset.ma60Avg5   = item.ma60_avg5        ?? '';
  ma60El.dataset.ma60Rate   = item.ma60_rate        ?? '';
  ma60El.dataset.hasUptick  = item.ma60_has_uptick  ?? '';
  ma60El.dataset.aboveAvg   = item.ma60_above_avg   ?? '';
  ma60El.style.cursor       = item.ma60_trend ? 'help' : '';

  // 更新份额展示
  const sharesEl = document.getElementById(`aw-shares-cell-${c}`);
  if (sharesEl) {
    const shares = getAwShares(c);
    const cost   = Number.parseFloat(sharesEl.dataset.cost || 0);
    const nav    = cost > 0 && shares > 0 ? (cost / shares).toFixed(4) : '–';
    const tip    = shares > 0 ? `title="份额: ${shares.toFixed(2)} / 成本: ¥${Math.round(cost).toLocaleString()} / 均价: ${nav}"` : '';
    sharesEl.innerHTML = `<span style="font-size:13px;color:var(--text-dim);cursor:${shares>0?'help':'default'}" ${tip}>${shares > 0 ? shares.toFixed(2) : '–'}</span>`;
  }

  // 用最新净值刷新动态市值 + 盈亏颜色
  refreshAwAmtPnl([item]);
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
      case 'ret_1y': case 'ret_6m': case 'ret_3m': case 'ret_1m':
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
    ['ret1y','ret6m','ret3m','ret1m','close','ma20','ma60'].forEach((k, i) => {
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
      const status = d.error ? `错误: ${d.error}` : `close=${d.latest_close} ret1y=${d.ret_1y != null ? (d.ret_1y * 100).toFixed(2) + '%' : 'N/A'} ma60=${d.ma60_trend}`;
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

// ── 监控行高亮（计算后调用）──────────────────────────────────
export function highlightMonitorRows(ops) {
  document.querySelectorAll('[data-asset-id]').forEach(row => {
    row.classList.remove('row-sell', 'row-buy');
  });
  ops.forEach(({ id, diff }) => {
    document.querySelectorAll(`[data-asset-id="${id}"]`).forEach(row => {
      if (diff < -1)     row.classList.add('row-sell');
      else if (diff > 1) row.classList.add('row-buy');
    });
  });
}

// ── 清除监控行高亮（重置时调用）──────────────────────────────
export function clearMonitorHighlights() {
  document.querySelectorAll('[data-asset-id]').forEach(row => {
    row.classList.remove('row-sell', 'row-buy');
  });
}

// ── 标的调整抽屉 ───────────────────────────────────────────────
export function openFundDrawer() {
  const body = document.getElementById('aw-fund-drawer-body');
  if (!body) return;
  body.innerHTML = PORTFOLIO.map(_buildDrawerRow).join('');
  document.getElementById('aw-fund-drawer')?.classList.add('open');
}

export function closeFundDrawer() {
  document.getElementById('aw-fund-drawer')?.classList.remove('open');
  awInitTable();
  if (_awItems.length > 0) _awItems.forEach(awFillRow);
  refreshStaleChip();
}

export function refreshFundDrawerRow(id) {
  const rowEl = document.getElementById(`aw-drawer-row-${id}`);
  if (!rowEl) return;
  const asset = PORTFOLIO.find(a => a.id === id);
  if (!asset) return;
  rowEl.outerHTML = _buildDrawerRow(asset);
}

export { awMaybeInitEmpty, awInitTable, loadAwPool, awFillRow, clearAndResetAw };
