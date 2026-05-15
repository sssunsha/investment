// js/main.js — 页面入口：import 所有模块，挂载全局函数，执行初始化

import { switchTab, initHashRouter }             from './tab.js';
import { initRebalanceDayStyle }                  from './rebalance-day.js';
import { buildInputs, toggleAwAlt }               from './aw/inputs.js';
import {
  calcRebalance, resetCalc,
  selectCheckType, closeCheckTypePicker, confirmCheckType,
} from './aw/calc.js';
import { renderLog, saveToLog, deleteLog, clearLog } from './aw/log.js';
import {
  openAwJournal, closeAwJournal, loadAwJournal,
  saveAwJournalRecord, showAwToast,
} from './aw/journal.js';
import { openDrawer, closeDrawer }                from './aw/drawer.js';
import { awMaybeInitEmpty, loadAwPool, clearAndResetAw } from './aw/monitor.js';
import { toggleAwDebug, closeAwDebugDrawer, clearAwDebug } from './aw/debug.js';
import { loadMdtfrPool, toggleMdtfrSort, clearAndResetMdtfr } from './mdtfr/loader.js';
import { showConfirm, closeConfirm }              from './mdtfr/confirm.js';
import { openPoolAdjust, closePoolAdjust, applyPoolAdjust } from './mdtfr/pool-adjust.js';
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
  selectCheckType, closeCheckTypePicker, confirmCheckType,
  saveToLog, deleteLog, clearLog,
  // AW 复盘
  saveAwJournalRecord, showAwToast,
  openAwJournal, closeAwJournal, loadAwJournal,
  // MDTFR
  loadMdtfrPool, toggleMdtfrSort,
  clearMdtfrCache: clearAndResetMdtfr,
  clearAndResetMdtfr,
  showConfirm, closeConfirm,
  openPoolAdjust, closePoolAdjust, applyPoolAdjust,
  toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug,
  openJournal, closeJournal, loadJournal,
  // AW 监控
  loadAwPool, clearAndResetAw,
  toggleAwDebug, closeAwDebugDrawer, clearAwDebug,
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

// 异步初始化序列：loadAmounts → loadAvailable → 持仓回溯（若需要）→ 刷新 UI
(async () => {
  await loadAmounts();
  await loadAvailable();

  // 若持仓和可用金额均为 0，尝试从 journal 回溯恢复
  if (getSumOfPositions() === 0 && getAvailableAmt() === 0) {
    await recoverFromJournal();
  }

  refreshTotalDisplay();
  refreshAllPosPct();

  await awMaybeInitEmpty();
  initHashRouter();  // 处理 #aw / #mdtfr hash 路由（含 mdtfrMaybeInitEmpty 调用）
})();
