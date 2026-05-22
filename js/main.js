// js/main.js — 页面入口：import 所有模块，挂载全局函数，执行初始化

import { switchTab, initHashRouter }             from './tab.js';
import { initRebalanceDayStyle }                  from './rebalance-day.js';
import { buildInputs, toggleAwAlt, populateCalcInputsFromPositions } from './aw/inputs.js';
import {
  calcRebalance, resetCalc,
} from './aw/calc.js';
import { renderLog, saveToLog, deleteLog, clearLog } from './aw/log.js';
import {
  openAwJournal, closeAwJournal, loadAwJournal,
  saveAwJournalRecord, showAwToast,
} from './aw/journal.js';
import { openDrawer, closeDrawer }                from './aw/drawer.js';
import { awMaybeInitEmpty, loadAwPool, clearAndResetAw } from './aw/monitor.js';
import { loadAwAmounts, onAwAmtChange, clearAwAmt, refreshAwAllPosPct as refreshAwPosPct } from './aw/amounts.js';
import { loadAwAvailable, onAwAvailableChange, refreshAwTotalDisplay, openAwPnlDialog, closeAwPnlDialog } from './aw/aw-available.js';
import { toggleAwDebug, closeAwDebugDrawer, clearAwDebug } from './aw/debug.js';
import { loadMdtfrPool, toggleMdtfrSort, clearAndResetMdtfr } from './mdtfr/loader.js';
import { showConfirm, closeConfirm }              from './mdtfr/confirm.js';
import {
  toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug,
} from './mdtfr/debug.js';
import { openJournal, closeJournal, loadJournal, saveJournalRecord } from './mdtfr/journal.js';
import './mdtfr/advice.js';
import {
  loadAmounts, refreshAllPosPct,
  onAmtChange, clearAmt,
  getSumOfPositions,
} from './mdtfr/amounts.js';
import {
  loadAvailable, onAvailableChange, refreshTotalDisplay,
  recoverFromJournal, getAvailableAmt,
  openPnlDialog, closePnlDialog,
} from './mdtfr/available.js';
import {
  confirmTradeRow, undoTradeRow,
} from './mdtfr/trade-confirm.js';
import { register } from './mdtfr/bus.js';

// ── 连接跨模块回调（通过 EventBus）────────────────────────────────
register('journalSaver', saveJournalRecord);

// ── 挂载 HTML onclick 需要的全局函数 ──────────────────────────
Object.assign(window, {
  // 通用
  switchTab, openDrawer, closeDrawer,
  // AW 再平衡
  calcRebalance, resetCalc, toggleAwAlt,
  saveToLog, deleteLog, clearLog,
  // AW 复盘
  saveAwJournalRecord, showAwToast,
  openAwJournal, closeAwJournal, loadAwJournal,
  // MDTFR
  loadMdtfrPool, toggleMdtfrSort,
  clearMdtfrCache: clearAndResetMdtfr,
  clearAndResetMdtfr,
  showConfirm, closeConfirm,
  toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug,
  openJournal, closeJournal, loadJournal,
  // AW 监控
  loadAwPool, clearAndResetAw,
  toggleAwDebug, closeAwDebugDrawer, clearAwDebug,
  // AW 持仓金额
  onAwAmtChange, clearAwAmt,
  onAwAvailableChange,
  // AW 收益明细弹窗
  openAwPnlDialog, closeAwPnlDialog,
  // 金额管理
  onAmtChange, clearAmt,
  onAvailableChange,
  // 收益明细弹窗
  openPnlDialog, closePnlDialog,
  // 交易确认/撤销（行级）
  confirmTradeRow, undoTradeRow,
});

// ── 页面初始化 ──────────────────────────────────────────────
buildInputs();
renderLog();
initRebalanceDayStyle();

(async () => {
  // MDTFR 持仓初始化
  await loadAmounts();
  await loadAvailable();

  if (getSumOfPositions() === 0 && getAvailableAmt() === 0) {
    await recoverFromJournal();
  }

  refreshTotalDisplay();
  refreshAllPosPct();

  // AW 持仓初始化
  await loadAwAmounts();
  await loadAwAvailable();
  refreshAwTotalDisplay();
  refreshAwPosPct();
  populateCalcInputsFromPositions();

  await awMaybeInitEmpty();
  initHashRouter();
})();
