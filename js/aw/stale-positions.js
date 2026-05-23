// js/aw/stale-positions.js — 未赎回持仓检测与管理
import { PORTFOLIO, awAltSet } from './config.js';
import { getAwAmt, getAwShares, setAwAmt, setAwShares, setAwCost, saveAwAmounts } from './amounts.js';
import { getAwAvailableAmt, setAwAvailableAmt, refreshAwTotalDisplay } from './aw-available.js';
import { escHtml } from '../utils.js';

export function getStalePositions() {
  return PORTFOLIO.flatMap(a => {
    if (!a.alt) return [];
    const inactiveCode = awAltSet.has(a.id) ? a.code : a.alt.code;
    const inactiveName = awAltSet.has(a.id) ? a.fullName : a.alt.fullName;
    const amt = getAwAmt(inactiveCode);
    if (amt <= 0) return [];
    return [{ id: a.id, code: inactiveCode, name: inactiveName, amt }];
  });
}

export function refreshStaleChip() {
  const n = getStalePositions().length;
  const el = document.getElementById('aw-stale-chip');
  if (!el) return;
  el.textContent = `⚠ ${n} 笔待赎回`;
  el.style.display = n > 0 ? '' : 'none';
}

export function redeemStalePosition(code) {
  const shares = getAwShares(code);
  const closeEl = document.getElementById(`aw-close-${code}`);
  const closePrice = closeEl ? parseFloat(closeEl.textContent) : 0;
  const redeemAmt = (shares > 0 && closePrice > 0)
    ? shares * closePrice
    : getAwAmt(code);

  setAwAmt(code, 0);
  setAwShares(code, 0);
  setAwCost(code, 0);
  setAwAvailableAmt(getAwAvailableAmt() + redeemAmt);
  saveAwAmounts();
  refreshAwTotalDisplay();
  refreshStaleChip();

  const row = document.getElementById(`aw-stale-row-${code}`);
  if (row) row.remove();
  const body = document.getElementById('aw-stale-body');
  if (body && body.children.length === 0) closeStaleDialog();
}

export function openStaleDialog() {
  const positions = getStalePositions();
  if (positions.length === 0) return;
  const body = document.getElementById('aw-stale-body');
  if (!body) return;

  const fmtAmt = v => `¥${Math.round(v).toLocaleString()}`;
  body.innerHTML = positions.map(p => {
    const shares = getAwShares(p.code);
    const closeEl = document.getElementById(`aw-close-${p.code}`);
    const closePrice = closeEl ? parseFloat(closeEl.textContent) : 0;
    const usedEstimate = shares > 0 && closePrice > 0;
    const estimatedAmt = usedEstimate ? shares * closePrice : p.amt;
    return `<div id="aw-stale-row-${p.code}" style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)">
      <div>
        <div style="font-weight:600;font-size:14px">${escHtml(p.name)}</div>
        <div style="color:var(--text-dim);font-size:12px;margin-top:2px">${p.code} · 录入金额 ${fmtAmt(p.amt)}</div>
        <div style="color:var(--text-dim);font-size:12px;margin-top:1px">
          估算赎回金额：${fmtAmt(estimatedAmt)}
          <span style="opacity:.6">${usedEstimate
            ? `（${shares.toFixed(2)} 份 × ${closePrice.toFixed(3)}）`
            : '（无行情，以录入金额估算）'}</span>
        </div>
      </div>
      <button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:var(--red);border-color:rgba(239,68,68,.3);white-space:nowrap;flex-shrink:0"
        onclick="redeemStalePosition('${p.code}')">确认赎回</button>
    </div>`;
  }).join('');

  document.getElementById('aw-stale-overlay')?.classList.add('open');
}

export function closeStaleDialog() {
  document.getElementById('aw-stale-overlay')?.classList.remove('open');
}
