// js/mdtfr/available.js
// 可用金额管理：加载、保存、总金额计算、UI 刷新、持仓回溯恢复
import {
  getSumOfPositions, setAmts, saveAmounts,
  _getRawKey, _setRawKey,
} from './amounts.js';

let _available = 0;  // 可用金额（元）

// 注入 showToast 和 refreshAllPosPct（main.js 负责，避免循环依赖）
let _showToastFn = null;
let _refreshPosFn = null;
let _adviceRenderer = null;
let _lastItemsGetter = null;
export function setAvailableToastFn(fn)    { _showToastFn = fn; }
export function setAvailableRefreshFn(fn)  { _refreshPosFn = fn; }
export function setAvailableAdviceRenderer(fn) { _adviceRenderer = fn; }
export function setAvailableItemsGetter(fn)    { _lastItemsGetter = fn; }

/** 加载可用金额（必须在 loadAmounts() 之后调用，共享同一次 GET 响应） */
async function loadAvailable() {
  const v = _getRawKey('__available__');
  _available = parseFloat(v || 0) || 0;
}

/** 持久化：将 __available__ 写入 _rawData，然后 saveAmounts 合并写入 */
async function saveAvailable() {
  _setRawKey('__available__', _available);
  await saveAmounts();
}

/** 同时保存持仓金额和可用金额（持仓回溯恢复时使用） */
async function saveAll() {
  _setRawKey('__available__', _available);
  await saveAmounts();
}

function getAvailableAmt() { return _available; }
function setAvailableAmt(v) { _available = parseFloat(v) || 0; }

/** 总金额 = 可用金额 + 各标的持仓之和 */
function getTotalAmt() {
  return _available + getSumOfPositions();
}

/** 刷新页面上的总金额标签和可用金额输入框 */
function refreshTotalDisplay() {
  const total = getTotalAmt();
  const totalEl = document.getElementById('mdtfr-total-amt');
  if (totalEl) totalEl.textContent = total > 0 ? `总金额：¥${total.toLocaleString()}` : '总金额：¥0';
  const inp = document.getElementById('mdtfr-available-input');
  if (inp && document.activeElement !== inp) {
    inp.value = _available > 0 ? _available : '';
  }
}

/** 可用金额输入框 oninput 回调 */
async function onAvailableChange(val) {
  _available = parseFloat(val) || 0;
  await saveAvailable();
  refreshTotalDisplay();
  if (_refreshPosFn) _refreshPosFn();
  if (_lastItemsGetter && _adviceRenderer) {
    const items = _lastItemsGetter();
    if (items) _adviceRenderer(items);
  }
}

/**
 * 当 amounts.json 完全为空时，从 journal 向前回溯恢复持仓。
 * 最多回溯 6 个月，找到第一条含非空 holdings[] 的 journal 记录。
 */
async function recoverFromJournal() {
  const today = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = d.getFullYear().toString();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    try {
      const res = await fetch(`/api/cache/journal/${year}/${month}`);
      if (!res.ok) continue;
      const records = await res.json();
      if (!Array.isArray(records) || records.length === 0) continue;
      const sorted = [...records].sort((a, b) =>
        (b.data_date || '').localeCompare(a.data_date || ''));
      const rec = sorted.find(r => Array.isArray(r.holdings) && r.holdings.length > 0);
      if (!rec) continue;
      // 恢复各标的持仓
      const amtsObj = {};
      rec.holdings.forEach(h => { if (h.code_c) amtsObj[h.code_c] = h.amt || 0; });
      setAmts(amtsObj);
      _available = parseFloat(rec.available_amt || 0) || 0;
      await saveAll();
      refreshTotalDisplay();
      if (_refreshPosFn) _refreshPosFn();
      if (_showToastFn) _showToastFn(`已从 ${rec.data_date} 的复盘记录恢复持仓`, 'var(--cyan)');
      return true;
    } catch {}
  }
  return false;
}

export {
  loadAvailable, saveAvailable, saveAll,
  getAvailableAmt, setAvailableAmt,
  getTotalAmt, refreshTotalDisplay,
  onAvailableChange, recoverFromJournal,
};
