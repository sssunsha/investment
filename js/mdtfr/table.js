// js/mdtfr/table.js
import { escHtml } from '../utils.js';
import { getMdtfrPoolDef } from './config.js';
import { mdtfrLog } from './debug.js';

// ── 表格初始化（skeleton=true 显示加载动画，false 显示空占位）─
function mdtfrInitTable(skeleton = false) {
  // 重置排序状态
  window._mdtfrSorted = false;
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
    <td style="white-space:nowrap">${window.mkAmtCell?.(def.code_c) ?? dash}</td>
    <td id="mdtfr-pos-${def.code_c}" style="text-align:right">${window.mkPosPct?.(def.code_c) ?? dash}</td>
  </tr>`;
  body.innerHTML = `
    <div class="mdtfr-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>排名</th><th>属性</th><th>名称</th><th>C类代码</th><th>A类代码</th><th>场内ETF</th>
          <th>最新收盘</th><th>近20日涨跌</th><th>收盘/MA20</th><th>MA60趋势</th><th>金额(元)</th><th>持仓情况(%)</th>
        </tr></thead>
        <tbody>${getMdtfrPoolDef().map(mkRow).join('')}</tbody>
      </table>
    </div>`;
}

// ── 填充单行数据 ───────────────────────────────────────
function mdtfrFillRow(item) {
  const c = item.code_c;
  if (item.error) {
    document.getElementById(`mdtfr-close-${c}`).innerHTML = `<span style="color:var(--text-dim);font-size:12px">${escHtml(item.error)}</span>`;
    ['ret','ma20','ma60'].forEach(k => { document.getElementById(`mdtfr-${k}-${c}`).textContent = '–'; });
    return;
  }
  const ret = item.ret_20d;
  const retColor = ret > 0 ? 'var(--red)' : ret < 0 ? 'var(--green)' : 'var(--text-dim)';
  const retStr   = ret != null ? (ret>0?'+':'') + (ret*100).toFixed(2)+'%' : '–';

  document.getElementById(`mdtfr-close-${c}`).innerHTML =
    `${item.latest_close!=null?item.latest_close.toFixed(3):'–'}<span style="color:var(--border);font-size:12px;margin-left:4px">${item.latest_date||''}</span>`;
  document.getElementById(`mdtfr-ret-${c}`).innerHTML =
    `<span style="font-weight:700;color:${retColor}">${retStr}</span>`;
  document.getElementById(`mdtfr-ma20-${c}`).innerHTML = item.above_ma20==null ? '<span style="color:var(--border)">–</span>'
    : item.above_ma20 ? '<span style="color:var(--red)">↑ 站上</span>' : '<span style="color:var(--green)">↓ 跌破</span>';
  document.getElementById(`mdtfr-ma60-${c}`).innerHTML = (() => {
    const trend = item.ma60_trend;
    if (!trend) return '<span style="color:var(--border)">–</span>';
    const rate = item.ma60_rate != null ? `<span style="font-size:11px;opacity:.7;margin-left:3px">${item.ma60_rate>0?'+':''}${item.ma60_rate.toFixed(2)}%</span>` : '';
    const cfg = {
      '明确上行': ['var(--red)',    '↑↑'],
      '温和上行': ['var(--red)',    '↑ '],
      '走平':     ['var(--yellow)', '→ '],
      '温和下行': ['var(--green)',  '↓ '],
      '明确下行': ['var(--green)',  '↓↓'],
    };
    const [color, arrow] = cfg[trend] || ['var(--border)', '–'];
    return `<span style="color:${color}">${arrow} ${trend}</span>${rate}`;
  })();
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

// ── 判断单行数据是否完整 ──────────────────────────────────
function mdtfrRowComplete(item) {
  if (!item || item.error) return false;
  if (item.ret_20d == null || item.latest_close == null) return false;
  if (item.ma60_trend == null) return false;  // MA60 趋势未计算（数据不足）
  return true;
}

export { mdtfrInitTable, mdtfrFillRow, mdtfrFillRanks, mdtfrRenderFromCache, mdtfrRowComplete };
