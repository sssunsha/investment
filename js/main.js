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
import { loadMdtfrPool, toggleMdtfrSort, clearAndResetMdtfr } from './mdtfr/loader.js';
import { showConfirm, closeConfirm }              from './mdtfr/confirm.js';
import { openPoolAdjust, closePoolAdjust, applyPoolAdjust } from './mdtfr/pool-adjust.js';
import {
  toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug,
} from './mdtfr/debug.js';
import { openJournal, closeJournal, loadJournal, saveJournalRecord, showToast } from './mdtfr/journal.js';
import { mdtfrRenderAdvice, setJournalSaver }     from './mdtfr/advice.js';
import {
  setAdviceRenderer, loadAmounts, refreshAllPosPct,
  onAmtChange, clearAmt, setTotalAmtGetter,
  setLastMdtfrItems, getLastMdtfrItems, getSumOfPositions,
} from './mdtfr/amounts.js';
import {
  loadAvailable, onAvailableChange, refreshTotalDisplay,
  getTotalAmt, recoverFromJournal, getAvailableAmt,
  setAvailableToastFn, setAvailableRefreshFn,
  setAvailableAdviceRenderer, setAvailableItemsGetter,
} from './mdtfr/available.js';
import {
  confirmTrade, undoTrade, setAdviceRerenderer,
} from './mdtfr/trade-confirm.js';

// ── 连接跨模块回调（避免循环依赖）────────────────────────────────
setJournalSaver(saveJournalRecord);           // advice → journal（自动复盘保存）
setAdviceRenderer(mdtfrRenderAdvice);         // amounts → advice（金额变化时重渲建议）
setTotalAmtGetter(getTotalAmt);               // amounts.refreshAllPosPct 使用完整总金额
setAdviceRerenderer(mdtfrRenderAdvice);       // trade-confirm → advice
setAvailableToastFn(showToast);               // available.recoverFromJournal 提示
setAvailableRefreshFn(refreshAllPosPct);      // available.onAvailableChange 刷新仓位
setAvailableAdviceRenderer(mdtfrRenderAdvice);// available.onAvailableChange 重渲建议
setAvailableItemsGetter(getLastMdtfrItems);   // available 获取最新标的列表

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
  // 金额管理
  onAmtChange, clearAmt,
  onAvailableChange,
  // 交易确认/撤销
  confirmTrade, undoTrade,
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

  initHashRouter();  // 处理 #aw / #mdtfr hash 路由（含 mdtfrMaybeInitEmpty 调用）
})();
