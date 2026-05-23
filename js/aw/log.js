// js/aw/log.js — 操作日志（服务端 API）
import { fmtMoney } from '../utils.js';
import { getLastCalcResult } from './calc.js';
import {
  getAwAmt, setAwAmt, getAwShares, setAwShares, getAwCost, setAwCost, saveAwAmounts,
  refreshAwAllPosPct,
} from './amounts.js';
import { getAwAvailableAmt, setAwAvailableAmt, refreshAwTotalDisplay } from './aw-available.js';

const AW_LOG_API = '/api/cache/aw-rebalance-log';

// ── 本地缓存（避免频繁请求）──────────────────────────────────
let _logCache = null;

async function _fetchLog() {
  try {
    const res = await fetch(AW_LOG_API);
    if (res.ok) _logCache = await res.json();
    else         _logCache = [];
  } catch { _logCache = []; }
  return _logCache;
}

async function _saveLog(logs) {
  _logCache = logs;
  try {
    await fetch(AW_LOG_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logs),
    });
  } catch {}
}

export async function renderLog() {
  const logs = await _fetchLog();
  const tbody = document.getElementById('log-tbody');
  if (!tbody) return;
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="log-empty">暂无操作记录 — 完成计算后点击"保存为操作记录"</td></tr>`;
    return;
  }
  tbody.innerHTML = logs.slice().reverse().map((entry, ri) => {
    const realIdx = logs.length - 1 - ri;
    const opsHtml = (entry.ops || []).map(o =>
      `<span class="op-chip ${o.op==='赎回'?'op-sell':'op-buy'}">${o.op} ${o.name} ${fmtMoney(o.amount)}</span>`
    ).join(' ');
    return `<tr>
      <td style="white-space:nowrap;font-weight:600">${entry.date}</td>
      <td style="font-size:13px;color:var(--text-dim)">${(entry.triggerTypes||[]).join('、') || '手动'}</td>
      <td style="white-space:nowrap">${fmtMoney(entry.total)}</td>
      <td><div class="log-ops-cell">${opsHtml}</div></td>
      <td style="font-size:13px;color:var(--text-dim)">${entry.note || '–'}</td>
      <td><button class="log-del-btn" onclick="deleteLog(${realIdx})">删除</button></td>
    </tr>`;
  }).join('');
}

export async function saveToLog() {
  const result = getLastCalcResult();
  if (!result) return;
  const note = prompt('备注（可选）：', '') ?? '';
  const entry = {
    date:         new Date().toISOString().slice(0, 10),
    savedAt:      new Date().toISOString(),
    total:        result.total,
    available:    getAwAvailableAmt(),
    triggerTypes: [...new Set(result.triggers)],
    ops:          result.ops,
    note,
  };

  // ── 将 ops 应用到持仓金额/份额/成本 ──────────────────────────
  _applyOpsToPositions(result.ops);

  const logs = await _fetchLog();
  logs.push(entry);
  await _saveLog(logs);
  await renderLog();
  alert('✓ 已保存操作记录，持仓已同步更新');
}

function _applyOpsToPositions(ops) {
  if (!ops || ops.length === 0) return;

  const buys  = ops.filter(o => o.op === '申购');
  const sells = ops.filter(o => o.op === '赎回');

  sells.forEach(o => {
    const code    = o.code;
    const curAmt  = getAwAmt(code);
    if (curAmt <= 0) {
      setAwShares(code, 0);
      setAwCost(code, 0);
      return;
    }
    const redeemAmt  = Math.min(o.amount, curAmt);
    const ratio      = redeemAmt / curAmt;
    const newAmt     = curAmt - redeemAmt;
    const newShares  = getAwShares(code) * (1 - ratio);
    const newCost    = getAwCost(code)   * (1 - ratio);
    setAwAmt(code, newAmt);
    setAwShares(code, newShares);
    setAwCost(code, newCost);
  });

  buys.forEach(o => {
    const code   = o.code;
    const newAmt  = getAwAmt(code) + o.amount;
    const newCost = getAwCost(code) + o.amount;
    setAwAmt(code, newAmt);
    setAwCost(code, newCost);
    const closeEl = document.getElementById(`aw-close-${code}`);
    const nav     = closeEl ? Number.parseFloat(closeEl.textContent) : 0;
    if (nav > 0) {
      setAwShares(code, getAwShares(code) + o.amount / nav);
    }
  });

  const totalBuy  = buys.reduce((s, o) => s + o.amount, 0);
  const totalSell = sells.reduce((s, o) => s + o.amount, 0);
  const newAvail  = Math.max(0, getAwAvailableAmt() - totalBuy + totalSell);
  setAwAvailableAmt(newAvail);

  saveAwAmounts();
  refreshAwAllPosPct();
  refreshAwTotalDisplay();
}

export async function deleteLog(idx) {
  if (!confirm('确认删除该条记录？')) return;
  const logs = await _fetchLog();
  logs.splice(idx, 1);
  await _saveLog(logs);
  renderLog();
}

export async function clearLog() {
  if (!confirm('确认清空所有操作记录？此操作不可撤销。')) return;
  await _saveLog([]);
  renderLog();
}
