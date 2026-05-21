// js/mdtfr/table.js
import { escHtml } from '../utils.js';
import { getMdtfrPoolDef, getInactiveDefs } from './config.js';
import { mkAmtCell, mkPosPct, getShares, getDynAmt, refreshAmtPnl, mkDisabledAmtCell } from './amounts.js';

function formatVol(v) {
  if (v == null) return '–';
  if (v >= 100000000) return (v / 100000000).toFixed(2) + '亿手';
  if (v >= 10000) return (v / 10000).toFixed(1) + '万手';
  return v.toLocaleString() + '手';
}

// ── 表格初始化（skeleton=true 显示加载动画，false 显示空占位）─
function mdtfrInitTable(skeleton = false) {
  const body = document.getElementById('mdtfr-body');
  const dash = '<span style="color:var(--border)">–</span>';
  const mkRow = (def) => `<tr id="mdtfr-row-${def.code_c}">
    <td id="mdtfr-rank-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:22px;height:22px;border-radius:50%"></div>' : dash}</td>
    <td id="mdtfr-name-${def.code_c}" style="font-weight:600;cursor:help" data-code-c="${def.code_c}" data-a-code="${def.code_a}" data-etf="${def.etf}">${(()=>{
      const gCfg = {宽基:['宽','var(--blue)'],行业:['行','var(--cyan)'],防御:['防','var(--purple)']};
      const [gc,gcol] = gCfg[def.group] || ['防','var(--purple)'];
      const offDeco = def.offensive ? 'text-decoration:underline;text-decoration-color:var(--red);text-underline-offset:2px' : '';
      return `<span style="${offDeco}">${escHtml(def.name)}</span><span style="font-size:10px;margin-left:5px;font-weight:700;color:${gcol}">${gc}</span>`;
    })()}</td>
    <td id="mdtfr-ret20-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:60%"></div>' : dash}</td>
    <td id="mdtfr-vol20-${def.code_c}" style="text-align:right;font-size:12px">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-ret10-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:60%"></div>' : dash}</td>
    <td id="mdtfr-vol10-${def.code_c}" style="text-align:right;font-size:12px">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-ret5-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-vol5-${def.code_c}" style="text-align:right;font-size:12px">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-ret1-${def.code_c}" style="cursor:help">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-vol1-${def.code_c}" style="text-align:right;font-size:12px">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-volsig-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:60%"></div>' : dash}</td>
    <td id="mdtfr-ma20-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-ma60-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-shares-${def.code_c}" style="text-align:right;color:var(--text-dim);font-size:13px">–</td>
    <td style="white-space:nowrap">${mkAmtCell(def.code_c)}</td>
    <td id="mdtfr-pos-${def.code_c}" style="text-align:right">${mkPosPct(def.code_c)}</td>
  </tr>`;

  const backupBadge = `<span style="font-size:11px;padding:1px 5px;border-radius:3px;font-weight:600;background:rgba(128,128,128,.12);color:var(--text-dim);margin-left:5px">⊡ 备用</span>`;
  const mkBackupRow = (def) => `<tr id="mdtfr-row-${def.code_c}" class="mdtfr-backup-row" data-backup="true">
    <td id="mdtfr-rank-${def.code_c}"><span class="rank-badge" style="background:rgba(128,128,128,.15);color:var(--text-dim);font-size:10px;padding:2px 5px">备</span></td>
    <td id="mdtfr-name-${def.code_c}" style="font-weight:600;color:var(--text-dim);cursor:help" data-code-c="${def.code_c}" data-a-code="${def.code_a}" data-etf="${def.etf}">${(()=>{
      const gCfg = {宽基:['宽','var(--blue)'],行业:['行','var(--cyan)'],防御:['防','var(--purple)']};
      const [gc,gcol] = gCfg[def.group] || ['防','var(--purple)'];
      const offDeco = def.offensive ? 'text-decoration:underline;text-decoration-color:var(--red);text-underline-offset:2px' : '';
      return `<span style="${offDeco}">${escHtml(def.name)}</span>${backupBadge}<span style="font-size:10px;margin-left:5px;font-weight:700;opacity:0.7;color:${gcol}">${gc}</span>`;
    })()}</td>
    <td id="mdtfr-ret20-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:60%"></div>' : dash}</td>
    <td id="mdtfr-vol20-${def.code_c}" style="text-align:right;font-size:12px">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-ret10-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:60%"></div>' : dash}</td>
    <td id="mdtfr-vol10-${def.code_c}" style="text-align:right;font-size:12px">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-ret5-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-vol5-${def.code_c}" style="text-align:right;font-size:12px">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-ret1-${def.code_c}" style="cursor:help">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-vol1-${def.code_c}" style="text-align:right;font-size:12px">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-volsig-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:60%"></div>' : dash}</td>
    <td id="mdtfr-ma20-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-ma60-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-shares-${def.code_c}" style="text-align:right;color:var(--text-dim);font-size:13px">–</td>
    <td style="white-space:nowrap">${mkDisabledAmtCell()}</td>
    <td id="mdtfr-pos-${def.code_c}" style="text-align:right"><span class="pos-pct" style="color:var(--text-dim)">–</span></td>
  </tr>`;

  body.innerHTML = `
    <div class="mdtfr-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>排名</th>
          <th>名称</th>
          <th class="sortable" data-sort="ret_20d">近20日涨跌 <span class="sort-icon">⇅</span></th>
          <th style="color:var(--text-dim);font-size:12px">20日均量</th>
          <th class="sortable" data-sort="ret_10d">近10日涨跌 <span class="sort-icon">⇅</span></th>
          <th style="color:var(--text-dim);font-size:12px">10日均量</th>
          <th class="sortable" data-sort="ret_5d">近5日涨跌 <span class="sort-icon">⇅</span></th>
          <th style="color:var(--text-dim);font-size:12px">5日均量</th>
          <th id="mdtfr-th-ret1" class="sortable" data-sort="ret_1d">上一日涨跌 <span class="sort-icon">⇅</span></th>
          <th style="color:var(--text-dim);font-size:12px">上一日量</th>
          <th class="sortable" data-sort="vol_ratio">量信号 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="above_ma20">收盘/MA20 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="ma60_trend">MA60趋势 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="shares">份额 <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="amount">金额(元) <span class="sort-icon">⇅</span></th>
          <th class="sortable" data-sort="position">持仓情况(%) <span class="sort-icon">⇅</span></th>
        </tr></thead>
        <tbody>
          ${getMdtfrPoolDef().map(mkRow).join('')}
          ${getInactiveDefs().map(mkBackupRow).join('')}
        </tbody>
      </table>
    </div>`;

  // Add tooltip functionality for 名称 hover
  setTimeout(() => {
    document.querySelectorAll('[id^="mdtfr-name-"]').forEach(el => {
      el.addEventListener('mouseenter', (e) => {
        showCodeTooltip(e.target, e.target.dataset.codeC, e.target.dataset.aCode, e.target.dataset.etf);
      });
      el.addEventListener('mouseleave', hideCodeTooltip);
    });

    // 收盘价悬浮提示（上一日涨跌列，委托到 tbody）
    const _tbody = document.querySelector('#mdtfr-body tbody');
    if (_tbody) {
      _tbody.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('[id^="mdtfr-ret1-"]');
        if (!cell?.dataset.close) return;
        _showCloseTooltip(cell);
      });
      _tbody.addEventListener('mouseout', (e) => {
        if (e.target.closest('[id^="mdtfr-ret1-"]')) hideCodeTooltip();
      });
    }

    // Add click handlers for sortable columns
    initColumnSorting();
  }, 0);
}

// Column sorting functionality
let currentSort = { column: null, direction: 'desc' };
let _mdtfrItems = [];

function setMdtfrItems(items) {
  _mdtfrItems = items || [];
}

function initColumnSorting() {
  document.querySelectorAll('.sortable').forEach(th => {
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.addEventListener('click', () => {
      const sortKey = th.dataset.sort;
      handleColumnSort(sortKey, th);
    });
  });
}

function handleColumnSort(sortKey, th) {
  if (_mdtfrItems.length === 0) {
    console.warn('No data available for sorting');
    return;
  }

  if (currentSort.column === sortKey) {
    currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
  } else {
    currentSort.column = sortKey;
    currentSort.direction = 'desc';
  }

  document.querySelectorAll('.sortable .sort-icon').forEach(icon => {
    icon.textContent = '⇅';
    icon.style.opacity = '0.3';
  });
  const icon = th.querySelector('.sort-icon');
  icon.textContent = currentSort.direction === 'desc' ? '↓' : '↑';
  icon.style.opacity = '1';

  sortAndRenderTable(_mdtfrItems, sortKey);
}

function sortAndRenderTable(items, sortKey) {
  const tbody = document.querySelector('#mdtfr-body tbody');
  if (!tbody) return;

  // Separate backup rows from active pool rows
  const backupRows = [...tbody.querySelectorAll('tr[data-backup]')];
  const backupCodes = new Set(backupRows.map(tr => tr.id.replace('mdtfr-row-', '')));

  // Separate error items (these can't be sorted meaningfully)
  const errorItems = items.filter(x => x.error);
  // All valid items (both active pool and backup) should be sorted together
  const validItems = items.filter(x => !x.error);

  const totalAmt = validItems.reduce((sum, item) => sum + getDynAmt(item.code_c), 0);

  validItems.sort((a, b) => {
    let aVal, bVal;

    switch (sortKey) {
      case 'vol_ratio':
        aVal = a.vol_ratio ?? -Infinity;
        bVal = b.vol_ratio ?? -Infinity;
        break;
      case 'ret_20d':
      case 'ret_10d':
      case 'ret_5d':
      case 'ret_1d':
        aVal = a[sortKey] ?? -Infinity;
        bVal = b[sortKey] ?? -Infinity;
        break;
      case 'above_ma20':
        aVal = a.above_ma20 ? 1 : 0;
        bVal = b.above_ma20 ? 1 : 0;
        break;
      case 'ma60_trend': {
        const trendOrder = { '趋势向好': 3, '未达标': 2, '持续下行': 1 };
        aVal = trendOrder[a.ma60_trend] ?? 0;
        bVal = trendOrder[b.ma60_trend] ?? 0;
        break;
      }
      case 'shares':
        aVal = getShares(a.code_c);
        bVal = getShares(b.code_c);
        break;
      case 'amount':
        aVal = getDynAmt(a.code_c);
        bVal = getDynAmt(b.code_c);
        break;
      case 'position':
        aVal = totalAmt > 0 ? getDynAmt(a.code_c) / totalAmt : 0;
        bVal = totalAmt > 0 ? getDynAmt(b.code_c) / totalAmt : 0;
        break;
      default:
        return 0;
    }

    return currentSort.direction === 'desc' ? bVal - aVal : aVal - bVal;
  });

  // Render sorted valid items (includes both active pool and backup funds)
  validItems.forEach(item => {
    const row = document.getElementById(`mdtfr-row-${item.code_c}`);
    if (row) tbody.appendChild(row);
  });
  
  // Error rows always at the end (they have no valid data to sort)
  errorItems.forEach(item => {
    const row = document.getElementById(`mdtfr-row-${item.code_c}`);
    if (row) tbody.appendChild(row);
  });
}

// Tooltip for C类代码
function showCodeTooltip(target, codeC, aCode, etf) {
  let tooltip = document.getElementById('mdtfr-code-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'mdtfr-code-tooltip';
    tooltip.className = 'mdtfr-code-tooltip';
    document.body.appendChild(tooltip);
  }

  tooltip.innerHTML = `
    <div style="margin-bottom:6px"><span style="color:#999">C类代码:</span> <span style="margin-left:8px;font-weight:500">${codeC || '–'}</span></div>
    <div style="margin-bottom:6px"><span style="color:#999">A类代码:</span> <span style="margin-left:8px;font-weight:500">${aCode || '–'}</span></div>
    <div><span style="color:#999">场内ETF:</span> <span style="margin-left:8px;font-weight:500">${etf || '–'}</span></div>
  `;
  
  const rect = target.getBoundingClientRect();
  tooltip.style.display = 'block';
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

function hideCodeTooltip() {
  const tooltip = document.getElementById('mdtfr-code-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

function _showCloseTooltip(target) {
  const close = Number.parseFloat(target.dataset.close);
  const date  = target.dataset.date;
  let tip = document.getElementById('mdtfr-code-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'mdtfr-code-tooltip';
    tip.className = 'mdtfr-code-tooltip';
    document.body.appendChild(tip);
  }
  const priceStr = Number.isNaN(close) ? '–' : close.toFixed(3);
  tip.innerHTML = `<div><span style="color:#999">C类收盘价:</span> <span style="margin-left:6px;font-weight:600">${priceStr}</span></div>`
    + (date ? `<div style="margin-top:4px;color:var(--text-dim);font-size:11px">${date}</div>` : '');
  const rect = target.getBoundingClientRect();
  tip.style.display = 'block';
  tip.style.left = `${rect.left + window.scrollX}px`;
  tip.style.top  = `${rect.bottom + window.scrollY + 5}px`;
}

function _updateRet1Header(date) {
  if (!date) return;
  const el = document.getElementById('mdtfr-th-ret1');
  if (el) el.innerHTML = `上一日涨跌 <span class="sort-icon">⇅</span><br><span style="color:var(--text-dim);font-weight:400">${date}</span>`;
}

// ── 量信号渲染（抽取为独立函数，降低 mdtfrFillRow 复杂度）──
const _VOL_SIG_CFG = {
  '巨额放量': ['var(--red)',    'rgba(239,68,68,.2)'],
  '放量':     ['var(--red)',    'rgba(239,68,68,.12)'],
  '温和放量': ['var(--yellow)', 'rgba(245,158,11,.15)'],
  '正常':     ['var(--text-dim)', 'rgba(128,128,128,.1)'],
  '温和缩量': ['var(--green)',  'rgba(34,197,94,.1)'],
  '缩量':     ['var(--green)',  'rgba(34,197,94,.15)'],
  '巨额缩量': ['var(--green)',  'rgba(34,197,94,.2)'],
};
function _renderVolSignal(c, signal) {
  const el = document.getElementById(`mdtfr-volsig-${c}`);
  if (!el) return;
  if (signal == null) { el.innerHTML = '<span style="color:var(--border)">–</span>'; return; }
  const [sc, bg] = _VOL_SIG_CFG[signal] || ['var(--text-dim)', 'var(--surface2)'];
  el.innerHTML = `<span style="font-size:11px;padding:2px 7px;border-radius:4px;font-weight:700;background:${bg};color:${sc}">${signal}</span>`;
}

// ── 填充单行数据 ───────────────────────────────────────
function mdtfrFillRow(item) {
  const c = item.code_c;
  if (!document.getElementById(`mdtfr-ret1-${c}`)) return;
  if (item.error) {
    document.getElementById(`mdtfr-ret20-${c}`).innerHTML = `<span style="color:var(--text-dim);font-size:12px">${escHtml(item.error)}</span>`;
    ['volsig','vol20','ret10','vol10','ret5','vol5','ret1','vol1','ma20','ma60'].forEach(k => {
      const el = document.getElementById(`mdtfr-${k}-${c}`);
      if (el) el.textContent = '–';
    });
    return;
  }
  // Helper function to format return percentage
  const formatRet = (ret) => {
    if (ret == null) return '–';
    const color = ret > 0 ? 'var(--red)' : ret < 0 ? 'var(--green)' : 'var(--text-dim)';
    const str = (ret>0?'+':'') + (ret*100).toFixed(2)+'%';
    return `<span style="font-weight:700;color:${color}">${str}</span>`;
  };

  // 存储收盘价和日期，供上一日涨跌列悬浮提示使用
  const _ret1El = document.getElementById(`mdtfr-ret1-${c}`);
  if (_ret1El) {
    _ret1El.dataset.close = item.latest_close ?? '';
    _ret1El.dataset.date  = item.latest_date  ?? '';
  }
  _updateRet1Header(item.latest_date);

  // 填充各涨跌列及均量列
  document.getElementById(`mdtfr-ret20-${c}`).innerHTML = formatRet(item.ret_20d);
  const _vol20El = document.getElementById(`mdtfr-vol20-${c}`);
  if (_vol20El) _vol20El.innerHTML = `<span style="color:var(--text-dim)">${formatVol(item.vol_avg_20d)}</span>`;
  document.getElementById(`mdtfr-ret10-${c}`).innerHTML = formatRet(item.ret_10d);
  const _vol10El = document.getElementById(`mdtfr-vol10-${c}`);
  if (_vol10El) _vol10El.innerHTML = `<span style="color:var(--text-dim)">${formatVol(item.vol_avg_10d)}</span>`;
  document.getElementById(`mdtfr-ret5-${c}`).innerHTML = formatRet(item.ret_5d);
  const _vol5El = document.getElementById(`mdtfr-vol5-${c}`);
  if (_vol5El) _vol5El.innerHTML = `<span style="color:var(--text-dim)">${formatVol(item.vol_avg_5d)}</span>`;
  _ret1El.innerHTML = formatRet(item.ret_1d);
  const _vol1El = document.getElementById(`mdtfr-vol1-${c}`);
  if (_vol1El) _vol1El.innerHTML = `<span style="color:var(--text-dim)">${formatVol(item.vol_1d)}</span>`;
  // 量信号
  _renderVolSignal(c, item.vol_signal);
  document.getElementById(`mdtfr-ma20-${c}`).innerHTML = item.above_ma20==null ? '<span style="color:var(--border)">–</span>'
    : item.above_ma20 ? '<span style="color:var(--red)">↑ 站上</span>' : '<span style="color:var(--green)">↓ 跌破</span>';
  const ma60El = document.getElementById(`mdtfr-ma60-${c}`);
  ma60El.innerHTML = (() => {
    const trend = item.ma60_trend;
    if (!trend) return '<span style="color:var(--border)">–</span>';
    const rate = item.ma60_rate != null ? `<span style="font-size:11px;opacity:.7;margin-left:3px">${item.ma60_rate>0?'+':''}${item.ma60_rate.toFixed(2)}%</span>` : '';
    const cfg = {
      '趋势向好': ['var(--red)',    '↑'],
      '未达标':   ['var(--yellow)', '→'],
      '持续下行': ['var(--green)',  '↓'],
    };
    const [color, arrow] = cfg[trend] || ['var(--border)', '–'];
    return `<span style="color:${color}">${arrow} ${trend}</span>${rate}`;
  })();
  // 存储 tooltip 所需字段
  ma60El.dataset.trend      = item.ma60_trend      ?? '';
  ma60El.dataset.ma60       = item.ma60             ?? '';
  ma60El.dataset.ma60Avg5   = item.ma60_avg5        ?? '';
  ma60El.dataset.ma60Rate   = item.ma60_rate        ?? '';
  ma60El.dataset.hasUptick  = item.ma60_has_uptick  ?? '';
  ma60El.dataset.aboveAvg   = item.ma60_above_avg   ?? '';
  ma60El.style.cursor       = item.ma60_trend ? 'help' : '';
  // 更新份额单元格
  const sharesEl = document.getElementById(`mdtfr-shares-${c}`);
  if (sharesEl) {
    const shares = getShares(c);
    sharesEl.textContent = shares > 0 ? shares.toFixed(2) : '–';
  }
  // 触发盈亏颜色更新
  refreshAmtPnl([item]);
}

// ── 计算并填充排名 ─────────────────────────────────────
function mdtfrFillRanks(items) {
  const valid = items.filter(x => !x.error && x.ret_20d != null);
  valid.sort((a, b) => b.ret_20d - a.ret_20d);
  valid.forEach((x, i) => { x.rank = i + 1; });
  items.forEach(x => {
    const el = document.getElementById(`mdtfr-rank-${x.code_c}`);
    if (!el) return;
    if (x.rank == null) { el.innerHTML = '<span style="color:var(--border)">–</span>'; return; }
    const color = x.ret_20d > 0 ? 'var(--red)' : x.ret_20d < 0 ? 'var(--green)' : 'var(--text-dim)';
    const bg    = x.ret_20d > 0 ? 'rgba(239,68,68,.2)' : x.ret_20d < 0 ? 'rgba(34,197,94,.2)' : 'var(--surface2)';
    el.innerHTML = `<span class="rank-badge" style="background:${bg};color:${color}">${x.rank}</span>`;
  });
}

// ── 从缓存渲染 ─────────────────────────────────────────
function mdtfrRenderFromCache(items) {
  mdtfrInitTable(true);
  items.forEach(mdtfrFillRow);
  mdtfrFillRanks(items);
}

// ── MA60 tooltip ───────────────────────────────────────────────
function _buildMa60Tooltip(el) {
  const trend     = el.dataset.trend;
  const ma60      = parseFloat(el.dataset.ma60);
  const ma60Avg5  = parseFloat(el.dataset.ma60Avg5);
  const rate      = parseFloat(el.dataset.ma60Rate);
  const hasUptick = el.dataset.hasUptick;
  const aboveAvg  = el.dataset.aboveAvg;

  if (!trend) return null;

  const ok  = (v) => `<span style="color:var(--red)">✓</span> ${v}`;
  const ng  = (v) => `<span style="color:var(--green)">✗</span> ${v}`;
  const dim = (v) => `<span style="color:var(--text-dim);font-size:12px">${v}</span>`;

  // 均线是否出现拐头
  const c1 = hasUptick === 'true'
    ? ok('均线近期出现向上拐头')
    : hasUptick === 'false'
    ? ng('均线近期未出现拐头（持续走平或下行）')
    : dim('拐头判断：历史数据不足 66 条');

  // 均线是否站上近5日均值
  const ma60Str  = isNaN(ma60)     ? '–' : ma60.toFixed(3);
  const avgStr   = isNaN(ma60Avg5) ? '–' : ma60Avg5.toFixed(3);
  const c2 = aboveAvg === 'true'
    ? ok(`均线站上近5日均值（${ma60Str} ≥ 均值 ${avgStr}）`)
    : aboveAvg === 'false'
    ? ng(`均线低于近5日均值（${ma60Str} < 均值 ${avgStr}）`)
    : dim('均值对比：历史数据不足 66 条');

  const rateStr = isNaN(rate) ? ''
    : `<div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--border);color:var(--text-dim);font-size:11px">`
    + `5日均线变化率：<span style="color:${rate>0?'var(--red)':rate<0?'var(--green)':'var(--text-dim)'}; font-weight:700">${rate>0?'+':''}${rate.toFixed(2)}%</span></div>`;

  const trendColor = trend === '趋势向好' ? 'var(--red)' : trend === '持续下行' ? 'var(--green)' : 'var(--yellow)';
  return `<div style="font-weight:700;margin-bottom:10px;color:${trendColor};font-size:14px">${trend}</div>`
       + `<div style="margin-bottom:5px">${c1}</div>`
       + `<div>${c2}</div>`
       + rateStr;
}

function initMa60Tooltip() {
  const tip = document.createElement('div');
  tip.id = 'ma60-tooltip';
  tip.style.cssText = 'position:fixed;z-index:9999;display:none;pointer-events:none;'
    + 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;'
    + 'padding:12px 14px;font-size:13px;line-height:1.7;max-width:300px;'
    + 'box-shadow:0 4px 20px rgba(0,0,0,.5)';
  document.body.appendChild(tip);

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[id^="mdtfr-ma60-"], [id^="aw-ma60-"]');
    if (!el || !el.dataset.trend) return;
    const html = _buildMa60Tooltip(el);
    if (!html) return;
    tip.innerHTML = html;
    tip.style.display = 'block';
  });

  document.addEventListener('mousemove', (e) => {
    if (tip.style.display === 'none') return;
    const x = e.clientX + 14;
    const y = e.clientY + 14;
    const tipW = tip.offsetWidth, tipH = tip.offsetHeight;
    tip.style.left = (x + tipW > window.innerWidth  ? e.clientX - tipW - 10 : x) + 'px';
    tip.style.top  = (y + tipH > window.innerHeight ? e.clientY - tipH - 10 : y) + 'px';
  });

  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[id^="mdtfr-ma60-"], [id^="aw-ma60-"]');
    if (el) tip.style.display = 'none';
  });
}

initMa60Tooltip();


function mdtfrRowComplete(item) {
  if (!item || item.error) return false;
  if (item.ret_20d == null || item.latest_close == null) return false;
  if (item.ma60_trend == null) return false;  // MA60 趋势未计算（数据不足）
  if (item.vol_1d === undefined) return false;
  return true;
}

export { mdtfrInitTable, mdtfrFillRow, mdtfrFillRanks, mdtfrRenderFromCache, mdtfrRowComplete, setMdtfrItems };