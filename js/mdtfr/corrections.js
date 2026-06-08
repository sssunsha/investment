// js/mdtfr/corrections.js
// T+1 结算修正：写入、执行、状态展示
import {
  getPendingCorrections, setPendingCorrections,
  saveAmounts, getShares, setShares,
  refreshAllPosPct,
} from './amounts.js';
import { refreshTotalDisplay, refreshPnlDisplay } from './available.js';
import { patchJournalTradeRecord } from './journal.js';
import { escHtml } from '../utils.js';

/**
 * 交易确认后调用：写入一条待修正记录。
 * @param {{ trade_date, code_c, name, trade_type, amt, estimated_price, estimated_shares }} entry
 */
export async function addPendingCorrection(entry) {
  const list = getPendingCorrections();
  list.push(entry);
  setPendingCorrections(list);
  await saveAmounts();
  renderCorrectionStatus();
}

/**
 * 撤销交易时调用：移除对应待修正记录。
 */
export async function removePendingCorrection(trade_date, code_c, trade_type) {
  const list = getPendingCorrections().filter(
    c => !(c.trade_date === trade_date && c.code_c === code_c && c.trade_type === trade_type)
  );
  setPendingCorrections(list);
  await saveAmounts();
  renderCorrectionStatus();
}

/**
 * 数据加载完成后调用：对所有满足条件的待修正记录执行修正。
 * @param {Array} poolItems - 当日加载完成的标的数组，含 code_c 和 latest_close
 */
export async function applyPendingCorrections(poolItems) {
  const today = new Date().toISOString().slice(0, 10);
  const list = getPendingCorrections();
  if (list.length === 0) return;

  const priceMap = new Map(
    poolItems
      .filter(x => !x.error && x.latest_close > 0)
      .map(x => [x.code_c, x.latest_close])
  );

  let anyApplied = false;
  const remaining = [];

  for (const entry of list) {
    const { trade_date, code_c, trade_type, amt, estimated_shares } = entry;

    // 条件1：严格晚于交易日
    if (today <= trade_date) { remaining.push(entry); continue; }
    // 条件2：今日有有效价格
    const todayClose = priceMap.get(code_c);
    if (!todayClose) { remaining.push(entry); continue; }

    // 执行修正
    const realShares = amt / todayClose;
    const deltaShares = trade_type === 'buy'
      ? realShares - estimated_shares       // 买入：实际多/少到的份额
      : estimated_shares - realShares;      // 卖出：多扣/少扣的份额，补回/追扣

    const currentShares = getShares(code_c);
    setShares(code_c, Math.max(0, currentShares + deltaShares));

    // 回写 journal
    const journalDate = entry.data_date || trade_date;
    if (trade_type === 'buy') {
      await patchJournalTradeRecord(journalDate, code_c, {
        shares: parseFloat(realShares.toFixed(4)),
        price: todayClose,
      });
    } else {
      await patchJournalTradeRecord(journalDate, code_c, {
        shares: parseFloat(realShares.toFixed(4)),
      });
    }

    anyApplied = true;
  }

  setPendingCorrections(remaining);
  await saveAmounts();

  if (anyApplied) {
    refreshAllPosPct();
    refreshTotalDisplay();
    refreshPnlDisplay();
  }

  renderCorrectionStatus();
}

// ── 状态指示器 ────────────────────────────────────────────────

export function renderCorrectionStatus() {
  const el = document.getElementById('mdtfr-correction-status');
  if (!el) return;
  const list = getPendingCorrections();
  if (list.length === 0) {
    el.textContent = '';
    el.style.display = 'none';
    return;
  }
  el.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;color:var(--yellow)';
  el.textContent = `⏳ ${list.length} 笔待结算`;
  el.onclick = openCorrectionDialog;
}

// ── 详情弹窗 ──────────────────────────────────────────────────

export function openCorrectionDialog() {
  const overlay = document.getElementById('correction-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  _renderCorrectionBody();
}

export function closeCorrectionDialog() {
  document.getElementById('correction-overlay')?.classList.remove('open');
}

async function _renderCorrectionBody() {
  const body = document.getElementById('correction-body');
  if (!body) return;
  const list = getPendingCorrections();

  if (list.length === 0) {
    body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0;text-align:center">暂无待结算记录</div>';
    return;
  }

  body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0;text-align:center">加载中...</div>';

  // 收集所有涉及的 data_date（去重），从 journal 加载完整操作记录
  const dateDates = [...new Set(list.map(e => e.data_date || e.trade_date))];
  // pending corrections 按 code_c 建立快速查找
  const corrMap = new Map(list.map(e => [e.code_c, e]));

  // 按 data_date 拉取 journal 记录，合并所有 trade_records
  const allTrades = [];
  for (const dd of dateDates) {
    const [year, month] = [dd.slice(0, 4), dd.slice(5, 7)];
    try {
      const res = await fetch(`/api/cache/journal/${year}/${month}`);
      if (!res.ok) continue;
      const records = await res.json();
      if (!Array.isArray(records)) continue;
      const rec = records.find(r => r.data_date === dd);
      if (!rec || !Array.isArray(rec.trade_records)) continue;
      for (const tr of rec.trade_records) {
        allTrades.push({ ...tr, _dataDate: dd, _corr: corrMap.get(tr.code_c) || null });
      }
    } catch {}
  }

  const fmtY = n => (n == null ? '–' : '¥' + Math.round(n).toLocaleString());
  const fmtN = n => (n == null ? '–' : n.toLocaleString(undefined, { maximumFractionDigits: 4 }));

  const jth = t => `<th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
  const jtd = (t, extra='') => `<td style="padding:7px 10px;font-size:13px;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,.04);${extra}">${t}</td>`;

  const rowsHtml = allTrades.map(tr => {
    const isSell = tr.type === 'sell';
    const badge = isSell
      ? `<span style="background:rgba(239,68,68,.15);color:var(--red);font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px">🔴 卖出</span>`
      : `<span style="background:rgba(34,197,94,.15);color:var(--green);font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px">🟢 买入</span>`;

    const amtClr = isSell ? 'var(--red)' : 'var(--green)';
    const codeSpan = tr.code_c ? `<br><span style="color:var(--text-dim);font-size:11px">${escHtml(tr.code_c)}</span>` : '';
    const nameHtml = `<span style="font-weight:600">${escHtml(tr.name || '–')}</span>${codeSpan}`;

    // 份额列：若有待修正条目则标注估算中
    const corrEntry = tr._corr;
    let sharesHtml;
    if (corrEntry) {
      sharesHtml = `<span style="color:var(--yellow)">${fmtN(tr.shares)}</span><br><span style="background:rgba(245,158,11,.15);color:var(--yellow);font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px">估算中</span>`;
    } else {
      sharesHtml = `<span style="color:var(--text-dim)">${fmtN(tr.shares)}</span>`;
    }

    // 净值列
    let priceHtml;
    if (tr.price != null) {
      priceHtml = `<span style="color:var(--text-dim)">${tr.price}</span>`;
    } else if (corrEntry) {
      priceHtml = `<span style="color:var(--yellow)">${corrEntry.estimated_price}</span><br><span style="font-size:10px;color:var(--text-dim)">估算</span>`;
    } else {
      priceHtml = '–';
    }

    const manualBadge = tr.manual ? `<span style="color:var(--text-dim);font-size:11px">手动</span> ` : '';
    const noteHtml = `<span style="color:var(--text-dim);font-size:12px">${manualBadge}${escHtml(tr.note || '')}</span>`;

    return `<tr>
      ${jtd(`<span style="color:var(--text-dim);font-size:12px">${tr._dataDate}</span>`)}
      ${jtd(badge)}
      ${jtd(nameHtml)}
      ${jtd(`<span style="color:${amtClr};font-weight:700">${fmtY(tr.amt)}</span>`)}
      ${jtd(sharesHtml)}
      ${jtd(priceHtml)}
      ${jtd(noteHtml)}
    </tr>`;
  }).join('');

  const emptyMsg = allTrades.length === 0
    ? '<div style="color:var(--text-dim);padding:20px 0;text-align:center">未找到对应的操作记录</div>'
    : '';

  body.innerHTML = `
    <div style="padding:0 0 12px;color:var(--text-dim);font-size:13px">
      以下为当日操作记录，份额标注 <span style="color:var(--yellow);font-weight:600">估算中</span> 的项目将在下一交易日收盘数据加载后自动修正。
    </div>
    ${emptyMsg || `<table style="width:100%;border-collapse:collapse">
      <thead><tr>
        ${jth('数据日期')}${jth('类型')}${jth('标的')}${jth('金额')}${jth('份额')}${jth('净值')}${jth('备注')}
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`}
    <div style="margin-top:14px;padding:10px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:6px;font-size:12px;color:var(--yellow)">
      ⚠ 非交易日不会触发修正。修正完成后估算标注将消失，此提示自动清除。
    </div>`;
}
