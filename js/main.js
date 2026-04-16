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
import { openJournal, closeJournal, loadJournal, saveJournalRecord } from './mdtfr/journal.js';
import { mdtfrRenderAdvice, setJournalSaver }     from './mdtfr/advice.js';
import { setAdviceRenderer, loadAmounts, onAmtChange } from './mdtfr/amounts.js';

// ── 连接跨模块回调（避免循环依赖）────────────────────────────────
setJournalSaver(saveJournalRecord);        // advice → journal（自动复盘保存）
setAdviceRenderer(mdtfrRenderAdvice);      // amounts → advice（金额变化时重渲建议）

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
  // HTML 仍调用 clearMdtfrCache，挂载 clearAndResetMdtfr 作为向后兼容别名
  clearMdtfrCache: clearAndResetMdtfr,
  clearAndResetMdtfr,
  showConfirm, closeConfirm,
  openPoolAdjust, closePoolAdjust, applyPoolAdjust,
  toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug,
  openJournal, closeJournal, loadJournal,
  // HTML oninput 事件处理
  onAmtChange,
});

// ── 页面初始化 ──────────────────────────────────────────────
buildInputs();
renderLog();
loadAmounts();           // 异步加载持仓金额
initRebalanceDayStyle();
initHashRouter();        // 处理 #aw / #mdtfr hash 路由（含 mdtfrMaybeInitEmpty 调用）
