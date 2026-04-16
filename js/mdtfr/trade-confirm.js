// js/mdtfr/trade-confirm.js
// 交易确认/撤销逻辑，维护会话级快照（页面刷新后消失）
import { getLastAdviceData } from './advice.js';
import {
  getAmt, setAmt, setAmts, saveAmounts,
  getSumOfPositions, refreshAllPosPct,
  getLastMdtfrItems,
} from './amounts.js';
import {
  getAvailableAmt, setAvailableAmt, saveAvailable,
  getTotalAmt, refreshTotalDisplay,
} from './available.js';
import { setPendingConfirmAnnotation } from './journal.js';
import { getMdtfrPoolDef } from './config.js';

// 会话级快照（仅内存，刷新后消失）
let _snapshot = null;

// 注入 advice 渲染函数（main.js 负责，避免循环依赖）
let _adviceRerenderer = null;
export function setAdviceRerenderer(fn) { _adviceRerenderer = fn; }

export function hasSnapshot() { return _snapshot !== null; }

/** 确认执行当前操作建议 */
export async function confirmTrade() {
  const advice = getLastAdviceData();
  if (!advice) return;

  if (getTotalAmt() === 0) {
    alert('请先在顶部输入可用金额，再确认执行。');
    return;
  }

  const { sellRows = [], buyRows = [] } = advice;

  // 保存快照（用于撤销）
  const amtSnapshot = {};
  const pool = getMdtfrPoolDef();
  pool.forEach(d => { amtSnapshot[d.code_c] = getAmt(d.code_c); });
  _snapshot = {
    amts: amtSnapshot,
    available: getAvailableAmt(),
    sellRows: sellRows.map(r => ({ ...r })),
    buyRows:  buyRows.map(r => ({ ...r })),
  };

  // 应用金额变更
  sellRows.forEach(row => {
    const code = pool.find(d => d.name === row.from)?.code_c || null;
    if (code) setAmt(code, Math.max(0, getAmt(code) - row.amt));
    setAvailableAmt(getAvailableAmt() + row.amt);
  });
  buyRows.forEach(row => {
    const code = row.toCode || (pool.find(d => d.name === row.to)?.code_c || null);
    if (code) setAmt(code, getAmt(code) + row.amt);
    setAvailableAmt(Math.max(0, getAvailableAmt() - row.amt));
  });

  // 持久化
  await saveAmounts();
  await saveAvailable();

  // 构建交易记录（注解 journal）
  const tradeRecords = [
    ...sellRows.map(r => ({ type: 'sell', name: r.from, amt: r.amt, watch: !!r.watch, note: r.note })),
    ...buyRows.map(r => ({ type: 'buy', name: r.to, code_c: r.toCode, amt: r.amt, note: r.note })),
  ];
  setPendingConfirmAnnotation({
    confirmed_at: new Date().toISOString(),
    trade_records: tradeRecords,
  });

  // 刷新 UI（重渲 advice 会触发 journal 自动保存）
  refreshAllPosPct();
  refreshTotalDisplay();
  const items = getLastMdtfrItems();
  if (items && _adviceRerenderer) _adviceRerenderer(items);

  // 更新按钮状态（重渲后 DOM 已重建，需重新获取）
  const confirmBtn = document.getElementById('mdtfr-confirm-btn');
  const undoBtn    = document.getElementById('mdtfr-undo-btn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '✅ 已执行 ✓'; }
  if (undoBtn)    undoBtn.style.display = '';
}

/** 撤销最近一次确认 */
export async function undoTrade() {
  if (!_snapshot) return;
  const { amts, available } = _snapshot;

  setAmts(amts);
  setAvailableAmt(available);
  await saveAmounts();
  await saveAvailable();

  _snapshot = null;

  // 重渲 advice（不带 annotation → journal 保存无 confirmed_at/trade_records）
  refreshAllPosPct();
  refreshTotalDisplay();
  const items = getLastMdtfrItems();
  if (items && _adviceRerenderer) _adviceRerenderer(items);
  // 按钮恢复由重渲初始化（confirm 可用，undo 隐藏）
}
