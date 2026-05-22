// js/aw/aw-available.js — AW 可用金额、总金额、P&L 管理
import {
  getAwSumOfPositions, getAwRawKey, setAwRawKey, saveAwAmounts,
  getAwCost, getAwDynAmt, hasAwMktVal, refreshAwAllPosPct,
} from './amounts.js';
import { PORTFOLIO } from './config.js';
import { escHtml } from '../utils.js';

let _available = 0;

export function getAwAvailableAmt()  { return _available; }
export function setAwAvailableAmt(v) { _available = parseFloat(v) || 0; }

export function getAwTotalAmt() {
  return _available + getAwSumOfPositions();
}

export async function loadAwAvailable() {
  const v = getAwRawKey('__available__');
  _available = parseFloat(v || 0) || 0;
}

async function _saveAvailable() {
  setAwRawKey('__available__', _available);
  await saveAwAmounts();
}

export function refreshAwTotalDisplay() {
  const total = getAwTotalAmt();
  const totalEl = document.getElementById('aw-total-amt');
  if (totalEl) totalEl.textContent = total > 0 ? `总金额：¥${Math.round(total).toLocaleString()}` : '总金额：¥0';
  refreshAwPnlDisplay();
  const inp = document.getElementById('aw-available-input');
  if (inp && document.activeElement !== inp) {
    inp.value = _available > 0 ? _available : '';
  }
}

export function refreshAwPnlDisplay() {
  const pnlEl = document.getElementById('aw-total-pnl');
  if (!pnlEl) return;
  const { pnl, cost } = _computeAwTotalPnl();
  if (cost <= 0) { pnlEl.textContent = ''; return; }
  const sign = pnl >= 0 ? '+' : '';
  const pct  = (pnl / cost * 100).toFixed(2);
  pnlEl.textContent  = `总收益：${sign}¥${Math.round(pnl).toLocaleString()}（${sign}${pct}%）`;
  pnlEl.style.color  = pnl > 0 ? 'var(--red)' : pnl < 0 ? 'var(--green)' : 'var(--text-dim)';
}

function _computeAwTotalPnl() {
  let totalCost = 0, totalMktVal = 0;
  PORTFOLIO.forEach(a => {
    [a, a.alt].filter(Boolean).forEach(f => {
      const code = f.code;
      const cost = getAwCost(code);
      if (cost <= 0 || !hasAwMktVal(code)) return;
      totalCost   += cost;
      totalMktVal += getAwDynAmt(code);
    });
  });
  return { pnl: totalMktVal - totalCost, cost: totalCost };
}

export async function onAwAvailableChange(val) {
  _available = parseFloat(val) || 0;
  await _saveAvailable();
  refreshAwTotalDisplay();
  refreshAwAllPosPct();
}

// ── 收益明细弹窗 ───────────────────────────────────────────────
export function openAwPnlDialog() {
  document.getElementById('aw-pnl-overlay')?.classList.add('open');
  _loadAwPnlDialog();
}

export function closeAwPnlDialog() {
  document.getElementById('aw-pnl-overlay')?.classList.remove('open');
}

async function _loadAwPnlDialog() {
  const body = document.getElementById('aw-pnl-body');
  if (!body) return;
  body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">加载中...</div>';

  const th  = t => `<th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
  const td  = (t, extra='') => `<td style="padding:8px 10px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.04)${extra?';'+extra:''}">${t}</td>`;
  const clr = p => p > 0 ? 'var(--red)' : p < 0 ? 'var(--green)' : 'var(--text-dim)';
  const fmt = n => `¥${Math.round(n).toLocaleString()}`;
  const fmtPnl = (p, pct) => {
    if (p == null) return '–';
    const sign   = p >= 0 ? '+' : '';
    const pctStr = pct != null ? `<span style="font-size:11px;margin-left:4px">${sign}${pct.toFixed(2)}%</span>` : '';
    return `<span style="color:${clr(p)};font-weight:700">${sign}${fmt(p)}</span>${pctStr}`;
  };

  const holdings = [];
  PORTFOLIO.forEach(a => {
    [a, a.alt].filter(Boolean).forEach(f => {
      const code = f.code;
      const cost = getAwCost(code);
      if (cost <= 0) return;
      const mktVal = getAwDynAmt(code);
      const pnl    = mktVal - cost;
      holdings.push({
        name: f.fullName || f.name, code,
        cost, mktVal, pnl,
        pnlPct: cost > 0 ? pnl / cost * 100 : 0,
      });
    });
  });

  if (holdings.length === 0) {
    body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">暂无持仓成本记录（保存操作记录时自动更新）</div>';
    return;
  }

  const rows = holdings.map(h => `<tr>
    ${td(`<span style="font-weight:600">${escHtml(h.name)}</span><br><span style="color:var(--text-dim);font-size:11px">${h.code}</span>`)}
    ${td(fmt(h.cost))}
    ${td(fmt(h.mktVal))}
    ${td(fmtPnl(h.pnl, h.pnlPct))}
    ${td('<span style="background:rgba(245,158,11,.15);color:var(--yellow);font-size:11px;padding:1px 6px;border-radius:3px">持仓中</span>')}
  </tr>`).join('');

  body.innerHTML = `<div>
    <div style="font-size:13px;font-weight:700;color:var(--cyan);margin-bottom:8px">📦 当前持仓（未实现收益）</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${th('标的')}${th('买入成本')}${th('当前市值')}${th('收益')}${th('状态')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
