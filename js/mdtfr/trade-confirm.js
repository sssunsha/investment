// js/mdtfr/trade-confirm.js
// 交易确认/撤销逻辑：每行独立快照
import { getLastAdviceData } from './advice-logic.js';
import {
  getAmt, setAmt, saveAmounts,
  refreshAllPosPct, getLastMdtfrItems,
  getShares, getCost, setShares, setCost, addRealizedPnl,
} from './amounts.js';
import {
  getAvailableAmt, setAvailableAmt, saveAvailable,
  getTotalAmt, refreshTotalDisplay, refreshPnlDisplay,
} from './available.js';
import { setPendingConfirmAnnotation } from './journal.js';
import { getMdtfrPoolDef } from './config.js';
import { call } from './bus.js';
import { markWatchExecuted } from './watch.js';
import { addPendingCorrection, removePendingCorrection } from './corrections.js';

// 每行独立快照：rowId -> {code, prevAmt, prevAvailable}
const _rowSnapshots = new Map();

// journal 累计：跨多行确认累积 trade_records
let _journalAccum = { confirmed_at: null, trade_records: [] };

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
    sellPnl:       0,
  });

  // 应用变更
  let sellPnl = 0;
  if (type === 'sell') {
    if (code) {
      const snap    = _rowSnapshots.get(rowId);
      const prevAmt = snap.prevAmt || 0;
      const prevCost = snap.prevCost || 0;
      const ratio   = prevAmt > 0 ? Math.min(row.amt / prevAmt, 1) : 0;
      sellPnl = row.amt - prevCost * ratio;
      setAmt(code, Math.max(0, getAmt(code) - row.amt));
    }
    setAvailableAmt(getAvailableAmt() + row.amt);
  } else {
    if (code) setAmt(code, getAmt(code) + row.amt);
    setAvailableAmt(Math.max(0, getAvailableAmt() - row.amt));
  }

  // 计算份额变更（以当日确认时的最新净值为申购单价）
  let buyPrice = 0;
  let _mdtfrItem = null;
  if (code) {
    const items    = getLastMdtfrItems() || [];
    _mdtfrItem     = items.find(x => x.code_c === code) || null;
    buyPrice = _mdtfrItem?.latest_close || 0;

    if (buyPrice > 0) {
      if (type === 'sell') {
        const snap       = _rowSnapshots.get(rowId);
        const prevAmt    = snap.prevAmt || 0;
        const prevShares = snap.prevShares || 0;
        const ratio      = prevAmt > 0 ? Math.min(row.amt / prevAmt, 1) : 0;
        setShares(code, Math.max(0, prevShares - prevShares * ratio));
        setCost(code,   Math.max(0, (snap.prevCost || 0) * (1 - ratio)));
      } else {
        // buy：用当日最新净值（latest_close）计算申购份额
        setShares(code, getShares(code) + row.amt / buyPrice);
        setCost(code,   getCost(code)   + row.amt);
      }
    }
  }

  if (type === 'sell') {
    addRealizedPnl(sellPnl);
    _rowSnapshots.get(rowId).sellPnl = sellPnl;
  }

  await saveAmounts();
  await saveAvailable();
  refreshAllPosPct();
  refreshTotalDisplay();
  refreshPnlDisplay();

  // MA20 减仓已执行 → 标记 watch 条目，防止刷新后重复触发
  if (type === 'sell' && code) await markWatchExecuted(code);

  // 写入 journal 累计
  _accumulate(type, index, row);

  // 写入待修正记录（T+1 结算：今日价格为估算，次日修正）
  const today = new Date().toISOString().slice(0, 10);
  if (code && buyPrice > 0) {
    const estimatedShares = type === 'sell'
      ? (() => {
          const snap2 = _rowSnapshots.get(rowId);
          const ratio2 = (snap2?.prevAmt || 0) > 0 ? Math.min(row.amt / snap2.prevAmt, 1) : 0;
          return (snap2?.prevShares || 0) * ratio2;
        })()
      : row.amt / buyPrice;
    await addPendingCorrection({
      trade_date: today,
      data_date: _mdtfrItem?.latest_date || today,
      code_c: code,
      name: type === 'sell' ? row.from : row.to,
      trade_type: type,
      amt: row.amt,
      estimated_price: buyPrice,
      estimated_shares: parseFloat(estimatedShares.toFixed(4)),
    });
  }

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
  if (snap.sellPnl) addRealizedPnl(-snap.sellPnl);
  _rowSnapshots.delete(rowId);

  await saveAmounts();
  await saveAvailable();
  refreshAllPosPct();
  refreshTotalDisplay();
  refreshPnlDisplay();

  _removeFromAccum(rowId);

  // 撤销时移除对应的待修正记录
  const today = new Date().toISOString().slice(0, 10);
  if (snap.code) {
    const tradeType = rowId.startsWith('sell') ? 'sell' : 'buy';
    await removePendingCorrection(today, snap.code, tradeType);
  }

  _updateRowCell(rowId, false);
}

// ── 内部辅助 ──────────────────────────────────────────────────

function _accumulate(type, index, row) {
  _journalAccum.confirmed_at = new Date().toISOString();
  const rowId = `${type}-${index}`;
  const snap  = _rowSnapshots.get(rowId);
  const pool  = getMdtfrPoolDef();

  if (type === 'sell') {
    const code      = pool.find(d => d.name === row.from)?.code_c || null;
    const prevCost  = snap?.prevCost  || 0;
    const prevAmt   = snap?.prevAmt   || 0;
    const ratio     = prevAmt > 0 ? Math.min(row.amt / prevAmt, 1) : 0;
    const sellCost  = prevCost * ratio;
    const pnl       = row.amt - sellCost;
    const soldShares = (snap?.prevShares || 0) * ratio;
    _journalAccum.trade_records.push({
      type: 'sell', name: row.from, code_c: code,
      amt: row.amt, shares: parseFloat(soldShares.toFixed(4)),
      cost: parseFloat(sellCost.toFixed(2)), pnl: parseFloat(pnl.toFixed(2)),
      watch: !!row.watch, note: row.note || '', _rowId: rowId,
    });
  } else {
    const code      = row.toCode || pool.find(d => d.name === row.to)?.code_c || null;
    const items     = getLastMdtfrItems() || [];
    const item      = items.find(x => x.code_c === code);
    const price     = item?.latest_close || 0;
    const shares    = price > 0 ? row.amt / price : 0;
    _journalAccum.trade_records.push({
      type: 'buy', name: row.to, code_c: code,
      amt: row.amt, shares: parseFloat(shares.toFixed(4)),
      price: price, note: row.note || '', _rowId: rowId,
    });
  }
  _flushJournal();
}

function _removeFromAccum(rowId) {
  _journalAccum.trade_records = _journalAccum.trade_records.filter(r => r._rowId !== rowId);
  if (_journalAccum.trade_records.length === 0) {
    _journalAccum.confirmed_at = null;
    setPendingConfirmAnnotation(null);
    call('journalSaver', true);  } else {
    _flushJournal();
  }
}

function _flushJournal() {
  const clean = _journalAccum.trade_records.map(({ _rowId, ...rest }) => rest);
  setPendingConfirmAnnotation({
    confirmed_at: _journalAccum.confirmed_at,
    trade_records: clean,
  });
  call('journalSaver', true);
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
