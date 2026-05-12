// js/mdtfr/table.js
import { escHtml } from '../utils.js';
import { getMdtfrPoolDef } from './config.js';
import { mkAmtCell, mkPosPct, getShares, refreshAmtPnl } from './amounts.js';

// ── 表格初始化（skeleton=true 显示加载动画，false 显示空占位）─
function mdtfrInitTable(skeleton = false) {
  // 重置排序按钮 UI（_mdtfrSorted 状态由 loader.js/toggleMdtfrSort 管理）
  const sortBtn = document.getElementById('mdtfr-sort-btn');
  if (sortBtn) { sortBtn.style.display = 'none'; sortBtn.innerHTML = '↕ 排序'; sortBtn.style.color = ''; sortBtn.style.borderColor = ''; }
  const body = document.getElementById('mdtfr-body');
  const dash = '<span style="color:var(--border)">–</span>';
  const mkRow = (def) => `<tr id="mdtfr-row-${def.code_c}">
    <td id="mdtfr-rank-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:22px;height:22px;border-radius:50%"></div>' : dash}</td>
    <td>${(()=>{
      const cfg = {宽基:['rgba(59,130,246,.15)','var(--blue)','📊 宽基'],行业:['rgba(6,182,212,.15)','var(--cyan)','⚙ 行业'],防御:['rgba(168,85,247,.15)','var(--purple)','🛡 防御']};
      const [bg,color,label] = cfg[def.group]||cfg['防御'];
      const offTag = def.offensive
        ? `<span style="font-size:11px;padding:1px 5px;border-radius:3px;font-weight:600;background:rgba(239,68,68,.12);color:var(--red);margin-left:5px">⚔ 进攻</span>`
        : '';
      return `<span style="font-size:12px;padding:2px 7px;border-radius:4px;font-weight:700;background:${bg};color:${color}">${label}</span>${offTag}`;
    })()}</td>
    <td style="font-weight:600">${escHtml(def.name)}</td>
    <td style="color:var(--text-dim);font-size:13px">${def.code_c}</td>
    <td style="color:var(--text-dim);font-size:13px">${def.code_a}</td>
    <td style="color:var(--text-dim);font-size:13px">${def.etf}</td>
    <td id="mdtfr-close-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:70%"></div>' : dash}</td>
    <td id="mdtfr-ret-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:60%"></div>' : dash}</td>
    <td id="mdtfr-ma20-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-ma60-${def.code_c}">${skeleton ? '<div class="skeleton" style="width:55%"></div>' : dash}</td>
    <td id="mdtfr-shares-${def.code_c}" style="text-align:right;color:var(--text-dim);font-size:13px">–</td>
    <td style="white-space:nowrap">${mkAmtCell(def.code_c)}</td>
    <td id="mdtfr-pos-${def.code_c}" style="text-align:right">${mkPosPct(def.code_c)}</td>
  </tr>`;
  body.innerHTML = `
    <div class="mdtfr-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>排名</th><th>属性</th><th>名称</th><th>C类代码</th><th>A类代码</th><th>场内ETF</th>
          <th>最新收盘</th><th>近20日涨跌</th><th>收盘/MA20</th><th>MA60趋势</th><th>份额</th><th>金额(元)</th><th>持仓情况(%)</th>
        </tr></thead>
        <tbody>${getMdtfrPoolDef().map(mkRow).join('')}</tbody>
      </table>
    </div>`;
}

// ── 填充单行数据 ───────────────────────────────────────
function mdtfrFillRow(item) {
  const c = item.code_c;
  if (!document.getElementById(`mdtfr-close-${c}`)) return;
  if (item.error) {
    document.getElementById(`mdtfr-close-${c}`).innerHTML = `<span style="color:var(--text-dim);font-size:12px">${escHtml(item.error)}</span>`;
    ['ret','ma20','ma60'].forEach(k => { document.getElementById(`mdtfr-${k}-${c}`).textContent = '–'; });
    return;
  }
  const ret = item.ret_20d;
  const retColor = ret > 0 ? 'var(--red)' : ret < 0 ? 'var(--green)' : 'var(--text-dim)';
  const retStr   = ret != null ? (ret>0?'+':'') + (ret*100).toFixed(2)+'%' : '–';

  document.getElementById(`mdtfr-close-${c}`).innerHTML =
    `${item.latest_close!=null?item.latest_close.toFixed(3):'–'}<span style="font-size:11px;padding:1px 4px;border-radius:3px;background:rgba(6,182,212,.12);color:var(--cyan);font-weight:600;margin-left:5px">C类</span><span style="color:var(--border);font-size:12px;margin-left:4px">${item.latest_date||''}</span>`;
  document.getElementById(`mdtfr-ret-${c}`).innerHTML =
    `<span style="font-weight:700;color:${retColor}">${retStr}</span>`;
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
  // 有数据后显示排序按钮
  const sortBtn = document.getElementById('mdtfr-sort-btn');
  if (sortBtn) sortBtn.style.display = '';
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
  return true;
}

export { mdtfrInitTable, mdtfrFillRow, mdtfrFillRanks, mdtfrRenderFromCache, mdtfrRowComplete };
