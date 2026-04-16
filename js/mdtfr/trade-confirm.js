// js/mdtfr/trade-confirm.js
// 交易确认/撤销逻辑：每行独立快照
import { getLastAdviceData } from './advice.js';
import {
  getAmt, setAmt, setAmts, saveAmounts,
  refreshAllPosPct, getLastMdtfrItems,
  getShares, getCost, setShares, setCost,
} from './amounts.js';
import {
  getAvailableAmt, setAvailableAmt, saveAvailable,
  getTotalAmt, refreshTotalDisplay,
} from './available.js';
import { setPendingConfirmAnnotation } from './journal.js';
import { getMdtfrPoolDef } from './config.js';

// 每行独立快照：rowId -> {code, prevAmt, prevAvailable}
const _rowSnapshots = new Map();

// journal 累计：跨多行确认累积 trade_records
let _journalAccum = { confirmed_at: null, trade_records: [] };

// 注入回调
let _adviceRerenderer = null;
let _journalSaverFn   = null;
export function setAdviceRerenderer(fn)       { _adviceRerenderer = fn; }
export function setRowConfirmJournalSaver(fn) { _journalSaverFn = fn; }

/** 在 advice 重渲前由 main.js 调用，清除所有行快照和 journal 累计 */
export function clearRowSnapshots() {
  _rowSnapshots.clear();
  _journalAccum = { confirmed_at: null, trade_records: [] };
}

export function hasRowSnapshot(rowId) { return _rowSnapshots.has(rowId); }

/** 确认执行单行交易
 * @param {string} type  - 'sell' | 'buy'
 * @param {number} index - sellRows 或 buyRows 中的索引
 */
export async function confirmTradeRow(type, index) {
  if (getTotalAmt() === 0) {
    alert('请先在顶部输入可用金额，再确认执行。');
    return;
  }
  const rowId = `${type}-${index}`;
  if (_rowSnapshots.has(rowId)) return; // 防止重复确认

  const advice = getLastAdviceData();
  if (!advice) return;

  const rows = type === 'sell' ? (advice.sellRows || []) : (advice.buyRows || []);
  const row  = rows[index];
  if (!row) return;

  const pool = getMdtfrPoolDef();
  let code = null;
  if (type === 'sell') {
    code = pool.find(d => d.name === row.from)?.code_c || null;
  } else {
    code = row.toCode || pool.find(d => d.name === row.to)?.code_c || null;
  }

  // 保存行快照
  _rowSnapshots.set(rowId, {
    code,
    prevAmt:       code ? getAmt(code)    : null,
    prevAvailable: getAvailableAmt(),
    prevShares:    code ? getShares(code) : null,
    prevCost:      code ? getCost(code)   : null,
  });

  // 应用变更
  if (type === 'sell') {
    if (code) setAmt(code, Math.max(0, getAmt(code) - row.amt));
    setAvailableAmt(getAvailableAmt() + row.amt);
  } else {
    if (code) setAmt(code, getAmt(code) + row.amt);
    setAvailableAmt(Math.max(0, getAvailableAmt() - row.amt));
  }

  // 计算份额变更（以前一日收盘价为单价）
  if (code) {
    const items     = getLastMdtfrItems() || [];
    const item      = items.find(x => x.code_c === code);
    const prevClose = item?.prev_close || item?.latest_close || 0;

    if (prevClose > 0) {
      if (type === 'sell') {
        const snap       = _rowSnapshots.get(rowId);
        const prevAmt    = snap.prevAmt || 0;
        const prevShares = snap.prevShares || 0;
        const ratio      = prevAmt > 0 ? Math.min(row.amt / prevAmt, 1) : 0;
        setShares(code, Math.max(0, prevShares - prevShares * ratio));
        setCost(code,   Math.max(0, getCost(code) * (1 - ratio)));
      } else {
        // buy
        setShares(code, getShares(code) + row.amt / prevClose);
        setCost(code,   getCost(code)   + row.amt);
      }
    }
  }

  await saveAmounts();
  await saveAvailable();
  refreshAllPosPct();
  refreshTotalDisplay();

  // 写入 journal 累计
  _accumulate(type, index, row);

  // 只更新这一行的操作列，不全量重渲
  _updateRowCell(rowId, true);
}

/** 撤销单行确认 */
export async function undoTradeRow(type, index) {
  const rowId = `${type}-${index}`;
  const snap  = _rowSnapshots.get(rowId);
  if (!snap) return;

  if (snap.code !== null && snap.prevAmt    !== null) setAmt(snap.code,    snap.prevAmt);
  if (snap.code !== null && snap.prevShares !== null) setShares(snap.code, snap.prevShares);
  if (snap.code !== null && snap.prevCost   !== null) setCost(snap.code,   snap.prevCost);
  setAvailableAmt(snap.prevAvailable);
  _rowSnapshots.delete(rowId);

  await saveAmounts();
  await saveAvailable();
  refreshAllPosPct();
  refreshTotalDisplay();

  _removeFromAccum(rowId);
  _updateRowCell(rowId, false);
}

// ── 内部辅助 ──────────────────────────────────────────────────

function _accumulate(type, index, row) {
  _journalAccum.confirmed_at = new Date().toISOString();
  const rowId = `${type}-${index}`;
  const rec = type === 'sell'
    ? { type: 'sell', name: row.from, amt: row.amt, watch: !!row.watch, note: row.note || '', _rowId: rowId }
    : { type: 'buy',  name: row.to,   amt: row.amt, code_c: row.toCode, note: row.note || '', _rowId: rowId };
  _journalAccum.trade_records.push(rec);
  _flushJournal();
}

function _removeFromAccum(rowId) {
  _journalAccum.trade_records = _journalAccum.trade_records.filter(r => r._rowId !== rowId);
  if (_journalAccum.trade_records.length === 0) {
    _journalAccum.confirmed_at = null;
    setPendingConfirmAnnotation(null);
    if (_journalSaverFn) _journalSaverFn(true);
  } else {
    _flushJournal();
  }
}

function _flushJournal() {
  const clean = _journalAccum.trade_records.map(({ _rowId, ...rest }) => rest);
  setPendingConfirmAnnotation({
    confirmed_at: _journalAccum.confirmed_at,
    trade_records: clean,
  });
  if (_journalSaverFn) _journalSaverFn(true);
}

function _updateRowCell(rowId, confirmed) {
  const cell = document.getElementById(`mdtfr-row-action-${rowId}`);
  if (!cell) return;
  const parts = rowId.split('-');
  const type  = parts[0];
  const idx   = parts[1];
  if (confirmed) {
    cell.innerHTML =
      `<span style="color:var(--green);font-size:12px;white-space:nowrap;font-weight:600">✅ 已执行</span>` +
      `<button class="btn-row-undo" onclick="undoTradeRow('${type}',${idx})" title="撤销此行">↺</button>`;
  } else {
    cell.innerHTML =
      `<button class="btn-row-confirm" onclick="confirmTradeRow('${type}',${idx})" title="确认执行此行">✅ 确认</button>`;
  }
}
