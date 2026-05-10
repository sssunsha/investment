// js/mdtfr/available.js
// 可用金额管理：加载、保存、总金额计算、UI 刷新、持仓回溯恢复
import {
  getSumOfPositions, setAmts, saveAmounts,
  _getRawKey, _setRawKey,
  getCost, getDynAmt, hasMktVal,
} from './amounts.js';
import { getMdtfrPoolDef } from './config.js';
import { escHtml } from '../utils.js';

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

/** 计算总持仓盈亏（仅含有成本记录且已加载动态市值的标的） */
function _computeTotalPnl() {
  const defs = getMdtfrPoolDef();
  let totalCost = 0;
  let totalMktVal = 0;
  defs.forEach(d => {
    const cost = getCost(d.code_c);
    if (cost <= 0) return;
    if (!hasMktVal(d.code_c)) return;
    totalCost += cost;
    totalMktVal += getDynAmt(d.code_c);
  });
  return { pnl: totalMktVal - totalCost, cost: totalCost };
}

/** 刷新页面上的总收益标签 */
export function refreshPnlDisplay() {
  const pnlEl = document.getElementById('mdtfr-total-pnl');
  if (!pnlEl) return;
  const { pnl, cost } = _computeTotalPnl();
  if (cost <= 0) { pnlEl.textContent = ''; return; }
  const sign = pnl >= 0 ? '+' : '';
  const pct = (pnl / cost * 100).toFixed(2);
  pnlEl.textContent = `总收益：${sign}¥${Math.round(pnl).toLocaleString()}（${sign}${pct}%）`;
  pnlEl.style.color = pnl > 0 ? 'var(--red)' : pnl < 0 ? 'var(--green)' : 'var(--text-dim)';
}

/** 刷新页面上的总金额标签和可用金额输入框 */
function refreshTotalDisplay() {
  const total = getTotalAmt();
  const totalEl = document.getElementById('mdtfr-total-amt');
  if (totalEl) totalEl.textContent = total > 0 ? `总金额：¥${total.toLocaleString()}` : '总金额：¥0';
  refreshPnlDisplay();
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

// ── 收益明细弹窗 ──────────────────────────────────────────────

export function openPnlDialog() {
  const overlay = document.getElementById('pnl-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  _loadPnlDialog();
}

export function closePnlDialog() {
  document.getElementById('pnl-overlay')?.classList.remove('open');
}

async function _loadPnlDialog() {
  const body = document.getElementById('pnl-body');
  if (!body) return;
  body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">加载中...</div>';

  const defs = getMdtfrPoolDef();

  // 扫描最近 6 个月 journal，查找买入日期和历史成交对
  const now = new Date();
  let allRecs = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear().toString();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    try {
      const res = await fetch(`/api/cache/journal/${year}/${month}`);
      if (!res.ok) continue;
      const recs = await res.json();
      if (Array.isArray(recs)) allRecs = allRecs.concat(recs);
    } catch {}
  }
  allRecs.sort((a, b) => (a.data_date || '').localeCompare(b.data_date || ''));

  // 找到每个标的的最早买入日期
  const buyDateMap = {};
  allRecs.forEach(rec => {
    if (!rec.trade_records) return;
    const date = rec.confirmed_at ? rec.confirmed_at.slice(0, 10) : rec.data_date;
    rec.trade_records.forEach(tr => {
      if (tr.type === 'buy' && tr.code_c && !(tr.code_c in buyDateMap)) {
        buyDateMap[tr.code_c] = date;
      }
    });
  });

  // 提取历史成交对（buy → sell）
  const historicalTrades = [];
  const openBuys = {};
  allRecs.forEach(rec => {
    if (!rec.trade_records) return;
    const date = rec.confirmed_at ? rec.confirmed_at.slice(0, 10) : rec.data_date;
    rec.trade_records.forEach(tr => {
      if (tr.type === 'buy' && tr.code_c) {
        openBuys[tr.code_c] = { buyDate: date, buyAmt: tr.amt, name: tr.name || '' };
      } else if (tr.type === 'sell') {
        const def = defs.find(d => d.name === tr.name);
        const code = tr.code_c || def?.code_c || null;
        const prev = code ? openBuys[code] : null;
        historicalTrades.push({
          name: tr.name,
          code_c: code,
          buyDate: prev?.buyDate || '–',
          sellDate: date,
          buyAmt: prev?.buyAmt || 0,
          sellAmt: tr.amt,
          pnl: prev ? tr.amt - prev.buyAmt : null,
          holdDays: prev ? Math.round((new Date(date) - new Date(prev.buyDate)) / 864e5) : null,
        });
        if (code) delete openBuys[code];
      }
    });
  });

  // 当前持仓
  const holdings = defs
    .filter(d => getCost(d.code_c) > 0)
    .map(d => {
      const cost = getCost(d.code_c);
      const mktVal = getDynAmt(d.code_c);
      const pnl = mktVal - cost;
      const buyDate = buyDateMap[d.code_c] || null;
      const holdDays = buyDate ? Math.round((now - new Date(buyDate)) / 864e5) : null;
      return { ...d, cost, mktVal, pnl, pnlPct: cost > 0 ? pnl / cost * 100 : 0, buyDate, holdDays };
    });

  // 渲染辅助
  const th = t => `<th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
  const td = (t, extra = '') => `<td style="padding:8px 10px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.04)${extra ? ';' + extra : ''}">${t}</td>`;
  const pnlClr = p => p > 0 ? 'var(--red)' : p < 0 ? 'var(--green)' : 'var(--text-dim)';
  const fmtAmt = n => `¥${Math.round(n).toLocaleString()}`;
  const fmtPnl = (p, pct) => {
    if (p == null) return '–';
    const sign = p >= 0 ? '+' : '';
    const pctStr = pct != null ? `<span style="font-size:11px;margin-left:4px">${sign}${pct.toFixed(2)}%</span>` : '';
    return `<span style="color:${pnlClr(p)};font-weight:700">${sign}${fmtAmt(p)}</span>${pctStr}`;
  };

  let html = '';

  // 当前持仓区块
  if (holdings.length > 0) {
    const rows = holdings.map(h => `<tr>
      ${td(`<span style="font-weight:600">${escHtml(h.name)}</span><br><span style="color:var(--text-dim);font-size:11px">${h.code_c}</span>`)}
      ${td(fmtAmt(h.cost))}
      ${td(fmtAmt(h.mktVal))}
      ${td(fmtPnl(h.pnl, h.pnlPct))}
      ${td('<span style="background:rgba(245,158,11,.15);color:var(--yellow);font-size:11px;padding:1px 6px;border-radius:3px">持仓中</span>')}
      ${td(h.holdDays != null ? `${h.holdDays}天` : h.buyDate ? h.buyDate : '–')}
    </tr>`).join('');
    html += `<div style="margin-bottom:24px">
      <div style="font-size:13px;font-weight:700;color:var(--cyan);margin-bottom:8px">📦 当前持仓（未实现收益）</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${th('标的')}${th('买入成本')}${th('当前市值')}${th('收益')}${th('状态')}${th('持仓时间')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // 历史成交区块
  html += `<div>
    <div style="font-size:13px;font-weight:700;color:var(--cyan);margin-bottom:8px">📋 历史交易记录（已结算）</div>`;
  if (historicalTrades.length === 0) {
    html += `<div style="color:var(--text-dim);font-size:13px;padding:16px 0">暂无历史已结算交易记录（通过操作建议中的「✅ 确认」按钮执行交易后自动记录）</div>`;
  } else {
    const rows = historicalTrades.map(t => {
      const pct = t.buyAmt > 0 && t.pnl != null ? t.pnl / t.buyAmt * 100 : null;
      return `<tr>
        ${td(`<span style="font-weight:600">${escHtml(t.name)}</span>${t.code_c ? `<br><span style="color:var(--text-dim);font-size:11px">${t.code_c}</span>` : ''}`)}
        ${td(t.buyDate)}
        ${td(t.sellDate)}
        ${td(fmtAmt(t.buyAmt))}
        ${td(fmtAmt(t.sellAmt))}
        ${td(fmtPnl(t.pnl, pct))}
        ${td(t.holdDays != null ? `${t.holdDays}天` : '–')}
      </tr>`;
    }).join('');
    html += `<table style="width:100%;border-collapse:collapse">
      <thead><tr>${th('标的')}${th('买入日期')}${th('卖出日期')}${th('买入金额')}${th('卖出金额')}${th('收益')}${th('持仓时间')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
  html += '</div>';

  body.innerHTML = html || '<div style="color:var(--text-dim);padding:20px 0">暂无持仓记录</div>';
}

export {
  loadAvailable, saveAvailable, saveAll,
  getAvailableAmt, setAvailableAmt,
  getTotalAmt, refreshTotalDisplay,
  onAvailableChange, recoverFromJournal,
};
