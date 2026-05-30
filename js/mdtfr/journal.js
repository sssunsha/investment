// js/mdtfr/journal.js
// 轮动策略复盘记录：保存、展示历史复盘弹窗
import { escHtml } from '../utils.js';
import { getLastMdtfrItems } from './amounts.js';
import { getWatchState } from './watch.js';
import { getLastAdviceData } from './advice-logic.js';
import { getAvailableAmt } from './available.js';
import { on } from './bus.js';

// 供 trade-confirm.js 注入确认注解（confirmed_at + trade_records）
let _pendingAnnotation = null;
export function setPendingConfirmAnnotation(data) { _pendingAnnotation = data; }

async function saveJournalRecord(silent = false) {
  const _lastMdtfrItems = getLastMdtfrItems();
  const _lastAdviceData = getLastAdviceData();
  if (!_lastMdtfrItems || !_lastAdviceData) return;

  // 只在有真实交易记录时写入
  const annotation = _pendingAnnotation;
  if (!annotation || !Array.isArray(annotation.trade_records) || annotation.trade_records.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const record = {
    saved_at:    new Date().toISOString(),
    data_date:   _lastMdtfrItems.find(x => x.latest_date)?.latest_date || today,
    ..._lastAdviceData,
    available_amt: getAvailableAmt(),
    ...(_pendingAnnotation || {}),
    pool_snapshot: _lastMdtfrItems
      .filter(x => !x.error && x.ret_20d != null)
      .map(x => ({
        name: x.name, code_c: x.code_c, group: x.group,
        latest_close: x.latest_close, ret_20d: x.ret_20d,
        above_ma20: x.above_ma20, ma60: x.ma60, ma20: x.ma20,
        ma60_trend: x.ma60_trend, ma60_rate: x.ma60_rate,
        rank: x.rank,
      })),
    watch_snapshot: getWatchState().map(w => ({ ...w })),
  };
  _pendingAnnotation = null;  // 使用后立即清空
  try {
    const res = await fetch('/api/cache/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!silent) {
      const label = data.upserted ? '复盘已更新' : `已保存第 ${data.total} 条复盘记录`;
      showToast(`✅ ${label}`, 'var(--green)');
    }
  } catch(e) {
    if (!silent) showToast(`❌ 保存失败: ${e.message}`, 'var(--red)');
  }
}

function showToast(msg, color = 'var(--cyan)') {
  let el = document.getElementById('mdtfr-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mdtfr-toast';
    el.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:2000;transition:opacity .3s;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = 'var(--surface)';
  el.style.border = `1px solid ${color}`;
  el.style.color = color;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// ── 历史复盘弹窗 ─────────────────────────────────────────────
function openJournal() {
  const overlay = document.getElementById('journal-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  const year = String(new Date().getFullYear());
  const picker = document.getElementById('journal-year-picker');
  if (picker) picker.value = year;
  loadJournal(year);
}

function closeJournal() {
  document.getElementById('journal-overlay')?.classList.remove('open');
}

async function loadJournal(year) {
  if (!year) year = String(new Date().getFullYear());
  const body    = document.getElementById('journal-body');
  const countEl = document.getElementById('journal-count');
  if (!body || !countEl) return;
  body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">加载中...</div>';
  try {
    // 加载全年 12 个月，合并所有 trade_records
    const allTrades = [];
    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, '0');
      const res = await fetch(`/api/cache/journal/${year}/${month}`);
      if (!res.ok) continue;
      const records = await res.json();
      for (const r of records) {
        const trades = r.trade_records;
        if (!trades || trades.length === 0) continue;
        const ts = r.confirmed_at || r.saved_at;
        for (const tr of trades) {
          allTrades.push({ ...tr, _ts: ts, _dataDate: r.data_date });
        }
      }
    }
    // 倒序（最新在前）
    allTrades.sort((a, b) => (b._ts || '').localeCompare(a._ts || ''));

    countEl.textContent = `${year}年 · 共 ${allTrades.length} 条操作记录`;
    if (allTrades.length === 0) {
      body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">本年暂无操作记录</div>';
      return;
    }

    const jth = t => `<th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
    const jtd = (t, extra='') => `<td style="padding:7px 10px;font-size:13px;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,.04);${extra}">${t}</td>`;
    const fmtY = n => (n == null ? '–' : '¥' + Math.round(n).toLocaleString());
    const fmtN = n => (n == null ? '–' : n.toLocaleString(undefined, {maximumFractionDigits: 4}));

    const rowsHtml = allTrades.map(tr => {
      const dt = new Date(tr._ts || '');
      const timeStr = isNaN(dt) ? '–' : `${dt.toLocaleDateString('zh-CN')} ${dt.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
      const isSell = tr.type === 'sell';

      const badge = isSell
        ? `<span style="background:rgba(239,68,68,.15);color:var(--red);font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px;white-space:nowrap">🔴 卖出</span>`
        : `<span style="background:rgba(34,197,94,.15);color:var(--green);font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px;white-space:nowrap">🟢 买入</span>`;

      const nameHtml = `<span style="font-weight:600;color:var(--text)">${escHtml(tr.name || '–')}</span>${tr.code_c ? `<br><span style="color:var(--text-dim);font-size:11px">${escHtml(tr.code_c)}</span>` : ''}`;

      const amtClr  = isSell ? 'var(--red)' : 'var(--green)';
      const amtHtml = `<span style="color:${amtClr};font-weight:700">${fmtY(tr.amt)}</span>`;

      const sharesHtml = tr.shares != null
        ? `<span style="color:var(--text-dim)">${fmtN(tr.shares)}</span>`
        : '–';

      // 成本列：卖出显示分摊成本，买入显示买入金额（即成本）
      const costVal = isSell ? tr.cost : tr.amt;
      const costHtml = costVal != null ? `<span style="color:var(--text-dim)">${fmtY(costVal)}</span>` : '–';

      // 收益列：卖出显示 pnl，买入显示买入净值
      let extraHtml;
      if (isSell) {
        if (tr.pnl != null) {
          const pnlSign = tr.pnl >= 0 ? '+' : '';
          const pnlPct  = tr.cost > 0 ? (tr.pnl / tr.cost * 100).toFixed(2) : null;
          const pnlClr  = tr.pnl > 0 ? 'var(--red)' : tr.pnl < 0 ? 'var(--green)' : 'var(--text-dim)';
          extraHtml = `<span style="color:${pnlClr};font-weight:700">${pnlSign}${fmtY(tr.pnl)}</span>${pnlPct != null ? `<br><span style="color:${pnlClr};font-size:11px">${pnlSign}${pnlPct}%</span>` : ''}`;
        } else {
          extraHtml = '<span style="color:var(--text-dim)">–</span>';
        }
      } else {
        extraHtml = tr.price != null
          ? `<span style="color:var(--text-dim)">净值 ${tr.price}</span>`
          : '<span style="color:var(--text-dim)">–</span>';
      }

      const manualBadge = tr.manual ? `<span style="color:var(--text-dim);font-size:11px">手动</span> ` : '';
      const noteHtml = `<span style="color:var(--text-dim);font-size:12px">${manualBadge}${escHtml(tr.note || '')}</span>`;

      return `<tr>
        ${jtd(`<span style="color:var(--text-dim);font-size:12px;white-space:nowrap">${timeStr}</span>`)}
        ${jtd(badge)}
        ${jtd(nameHtml)}
        ${jtd(amtHtml)}
        ${jtd(sharesHtml)}
        ${jtd(costHtml)}
        ${jtd(extraHtml)}
        ${jtd(noteHtml)}
      </tr>`;
    }).join('');

    body.innerHTML = `<table class="journal-table">
      <thead><tr>
        ${jth('时间')}${jth('类型')}${jth('标的')}${jth('金额')}${jth('份额')}${jth('成本')}${jth('收益 / 净值')}${jth('备注')}
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px 0">加载失败: ${e.message}</div>`;
  }
}

export { saveJournalRecord, showToast, openJournal, closeJournal, loadJournal, loadRecentJournalRecords };

on('mdtfr:toast', ({ msg, color }) => showToast(msg, color));

async function loadRecentJournalRecords(months = 6) {
  const now = new Date();
  const allRecs = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear().toString();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    try {
      const res = await fetch(`/api/cache/journal/${year}/${month}`);
      if (!res.ok) continue;
      const recs = await res.json();
      if (Array.isArray(recs)) allRecs.push(...recs);
    } catch {}
  }
  return allRecs;
}
