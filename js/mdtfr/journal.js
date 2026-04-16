// js/mdtfr/journal.js
// 轮动策略复盘记录：保存、展示历史复盘弹窗
import { escHtml } from '../utils.js';
import { getLastMdtfrItems } from './amounts.js';
import { getWatchState } from './watch.js';
import { getLastAdviceData } from './advice.js';
import { getAvailableAmt } from './available.js';

// 供 trade-confirm.js 注入确认注解（confirmed_at + trade_records）
let _pendingAnnotation = null;
export function setPendingConfirmAnnotation(data) { _pendingAnnotation = data; }

async function saveJournalRecord(silent = false) {
  const _lastMdtfrItems = getLastMdtfrItems();
  const _lastAdviceData = getLastAdviceData();
  if (!_lastMdtfrItems || !_lastAdviceData) return;
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
  // 默认加载当月
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const picker = document.getElementById('journal-month-picker');
  if (picker) picker.value = ym;
  loadJournal(ym);
}

function closeJournal() {
  document.getElementById('journal-overlay')?.classList.remove('open');
}

async function loadJournal(ym) {
  // ym: "YYYY-MM"（可选，默认当月）
  if (!ym) {
    const now = new Date();
    ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }
  const [year, month] = ym.split('-');
  const body = document.getElementById('journal-body');
  const countEl = document.getElementById('journal-count');
  if (!body || !countEl) return;
  body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">加载中...</div>';
  try {
    const res = await fetch(`/api/cache/journal/${year}/${month}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const records = await res.json();
    countEl.textContent = `${year}年${month}月 · 共 ${records.length} 条记录`;
    if (records.length === 0) {
      body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">本月暂无复盘记录</div>';
      return;
    }
    // 倒序展示（最新在前）
    const sorted = [...records].reverse();
    body.innerHTML = `<table class="journal-table">
      <thead><tr>
        <th>保存时间</th>
        <th>数据日期</th>
        <th>市场模式</th>
        <th>持仓标的</th>
        <th>总金额</th>
        <th style="min-width:480px">操作建议 &amp; 操作明细</th>
      </tr></thead>
      <tbody>${sorted.map(r => journalRow(r)).join('')}</tbody>
    </table>`;
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px 0">加载失败: ${e.message}</div>`;
  }
}

function journalRow(r) {
  const dt = new Date(r.saved_at);
  const savedAt = `${dt.toLocaleDateString('zh-CN')} ${dt.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})}`;

  const holdingsHtml = (r.holdings || []).map(h =>
    `<div style="white-space:nowrap">${escHtml(h.name)} <span style="color:var(--yellow);font-weight:600">¥${(h.amt||0).toLocaleString()}</span> <span style="color:var(--text-dim);font-size:12px">(${h.pos_pct}%)</span></div>`
  ).join('') || '<span style="color:var(--text-dim)">空仓</span>';

  const typeColors = {
    hold: 'var(--cyan)', buy: 'var(--green)', sell: 'var(--red)',
    swap: 'var(--yellow)', watch: 'var(--yellow)', wait: 'var(--text-dim)',
  };
  const adviceColor = typeColors[r.finalType] || 'var(--text-dim)';

  const modeHtml = r.is_attack
    ? `<span style="color:var(--red);font-size:12px;font-weight:600">⚔ 进攻</span>`
    : `<span style="color:var(--blue);font-size:12px;font-weight:600">🛡 防守</span>`;

  // ── 操作明细：单张合并表 ────────────────────────────────
  const sell = r.sellRows || [];
  const buy  = r.buyRows  || [];

  const opHtml = (() => {
    // 标题
    const titleHtml = `<div style="font-size:14px;font-weight:800;color:${adviceColor};margin-bottom:8px">${escHtml(r.finalTitle||'–')}</div>`;

    if (sell.length === 0 && buy.length === 0) {
      const fallback = (r.finalLines||[]).map(l =>
        `<div style="font-size:12px;color:var(--text-dim);line-height:1.7">${escHtml(l)}</div>`
      ).join('');
      return titleHtml + (fallback || '<span style="color:var(--text-dim);font-size:12px">无操作</span>');
    }

    // th / td helpers（inline，避免与外部 th/td helper 冲突）
    const jth = (t) => `<th style="padding:6px 8px;text-align:left;font-size:11px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
    const jtd = (t, extra='') => `<td style="padding:5px 8px;font-size:12px;vertical-align:top;border-bottom:1px solid rgba(255,255,255,.04);${extra}">${t}</td>`;

    // 合并 sell + buy 为一组行，每行带"类型"列
    const allRows = [
      ...sell.map(row => ({ ...row, _type: 'sell' })),
      ...buy.map(row  => ({ ...row, _type: 'buy'  })),
    ];

    const rowsHtml = allRows.map(row => {
      const isSell  = row._type === 'sell';
      const isWatch = !!row.watch;
      const amtClr  = isWatch ? 'var(--yellow)' : (isSell ? 'var(--red)' : 'var(--green)');

      // 类型标签
      const typeBadge = isWatch
        ? `<span style="background:rgba(245,158,11,.18);color:var(--yellow);font-size:11px;font-weight:700;padding:1px 6px;border-radius:3px">⚠ 关注</span>`
        : isSell
          ? `<span style="background:rgba(239,68,68,.12);color:var(--red);font-size:11px;font-weight:700;padding:1px 6px;border-radius:3px">🔴 卖出</span>`
          : `<span style="background:rgba(34,197,94,.12);color:var(--green);font-size:11px;font-weight:700;padding:1px 6px;border-radius:3px">🟢 买入</span>`;

      // 原标的
      const fromHtml = row.from === '货币基金'
        ? `<span style="color:var(--text-dim)">${escHtml(row.from)}</span>`
        : `<span style="color:#ff4d4d;font-weight:700;text-shadow:0 0 5px rgba(255,77,77,.5)">${escHtml(row.from)}</span>`;

      // 现标的
      const toHtml = row.to === '货币基金'
        ? `<span style="color:var(--text-dim)">${escHtml(row.to)}</span>`
        : `<span style="color:var(--purple);font-weight:700">${escHtml(row.to)}</span>${row.toCode ? `<br><span style="color:var(--text-dim);font-size:11px">${escHtml(row.toCode)}</span>` : ''}`;

      const amtHtml = `<span style="color:${amtClr};font-weight:700">${escHtml(row.amtText||'')}</span>`;

      return `<tr>
        ${jtd(typeBadge)}
        ${jtd(fromHtml)}
        ${jtd(amtHtml)}
        ${jtd(toHtml)}
        ${jtd(`<span style="color:var(--text-dim)">${escHtml(row.note||'')}</span>`)}
      </tr>`;
    }).join('');

    const table = `<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.07)">
      <thead><tr>${jth('类型')}${jth('原标的')}${jth('金额')}${jth('现标的')}${jth('说明')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

    return titleHtml + table;
  })();

  return `<tr>
    <td style="white-space:nowrap;color:var(--text-dim);font-size:12px">${savedAt}</td>
    <td style="white-space:nowrap;font-size:12px">${r.data_date||'–'}</td>
    <td>${modeHtml}</td>
    <td>${holdingsHtml}</td>
    <td style="white-space:nowrap;font-weight:700">¥${(r.total_amt||0).toLocaleString()}</td>
    <td>${opHtml}</td>
  </tr>`;
}

export { saveJournalRecord, showToast, openJournal, closeJournal, loadJournal };
