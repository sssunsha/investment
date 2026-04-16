// js/aw/journal.js — 复盘日志（服务端 API）
import { fmtMoney, escHtml } from '../utils.js';
import { PORTFOLIO, awAltSet, getActiveAsset } from './config.js';
import { getLastCalcResult } from './calc.js';

async function saveAwJournalRecord(silent = false) {
  if (!getLastCalcResult()) return;
  const today = new Date().toISOString().slice(0, 10);
  const record = {
    date:       today,
    saved_at:   new Date().toISOString(),
    total:      getLastCalcResult().total,
    triggers:   [...new Set(getLastCalcResult().triggers)],
    alt_codes:  [...awAltSet],   // 当日使用替代标的的 id 列表
    assets:     PORTFOLIO.map(a => {
      const active = getActiveAsset(a);
      return {
        id:           a.id,
        label:        a.label,
        name:         active.name,         // 实际使用的简称
        fullName:     active.fullName,     // 实际使用的全称
        code:         active.code,         // 实际使用的代号
        is_alt:       awAltSet.has(a.id),  // 是否用替代标的
        group:        a.group,
        target:       a.target,
        current:      getLastCalcResult().weights[a.id] || 0,
        value:        parseFloat(document.getElementById('inp-' + a.id).value) || 0,
      };
    }),
    ops: getLastCalcResult().ops,
  };
  try {
    const res = await fetch('/api/cache/aw-journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!silent) {
      const label = data.upserted ? '复盘已更新' : `已保存第 ${data.total} 条复盘记录`;
      showAwToast(`✅ ${label}`, 'var(--green)');
    }
  } catch(e) {
    if (!silent) showAwToast(`❌ 保存失败: ${e.message}`, 'var(--red)');
  }
}

function showAwToast(msg, color = 'var(--cyan)') {
  let el = document.getElementById('aw-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aw-toast';
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

function openAwJournal() {
  document.getElementById('aw-journal-overlay').classList.add('open');
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const picker = document.getElementById('aw-journal-month-picker');
  if (picker) picker.value = ym;
  loadAwJournal(ym);
}

function closeAwJournal() {
  document.getElementById('aw-journal-overlay').classList.remove('open');
}

async function loadAwJournal(ym) {
  if (!ym) {
    const now = new Date();
    ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }
  const [year, month] = ym.split('-');
  const body    = document.getElementById('aw-journal-body');
  const countEl = document.getElementById('aw-journal-count');
  body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">加载中...</div>';
  try {
    const res = await fetch(`/api/cache/aw-journal/${year}/${month}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const records = await res.json();
    countEl.textContent = `${year}年${month}月 · 共 ${records.length} 条记录`;
    if (records.length === 0) {
      body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">本月暂无复盘记录</div>';
      return;
    }
    const sorted = [...records].reverse();
    body.innerHTML = `<table class="journal-table">
      <thead><tr>
        <th>日期</th>
        <th>触发类型</th>
        <th>总市值</th>
        <th style="min-width:200px">资产配置（调仓前）</th>
        <th style="min-width:320px">再平衡操作</th>
      </tr></thead>
      <tbody>${sorted.map(r => awJournalRow(r)).join('')}</tbody>
    </table>`;
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px 0">加载失败: ${e.message}</div>`;
  }
}

function awJournalRow(r) {
  const dt = new Date(r.saved_at || r.date);
  const savedAt = r.saved_at
    ? `${new Date(r.saved_at).toLocaleDateString('zh-CN')} ${new Date(r.saved_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`
    : r.date;

  // 触发类型徽标
  const triggers = r.triggers || [];
  const trigHtml = triggers.length
    ? triggers.map(t => `<span style="background:rgba(245,158,11,.15);color:var(--yellow);font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;white-space:nowrap">${escHtml(t)}</span>`).join(' ')
    : `<span style="color:var(--text-dim);font-size:12px">无触发</span>`;

  // 资产配置（调仓前）：仅展示有偏差的资产
  const assets = r.assets || [];
  const assetsHtml = assets.map(a => {
    const curPct = (a.current * 100).toFixed(1);
    const tgtPct = (a.target  * 100).toFixed(0);
    const drift  = a.current - a.target;
    const driftStr = (drift >= 0 ? '+' : '') + (drift * 100).toFixed(1) + '%';
    const driftClr = Math.abs(drift) >= 0.05
      ? (drift > 0 ? 'var(--red)' : 'var(--green)')
      : 'var(--text-dim)';
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:2px 0;font-size:12px">
      <span style="color:var(--text-dim)">${escHtml(a.name)}</span>
      <span>${curPct}% <span style="color:${driftClr};font-size:11px">(${driftStr})</span></span>
    </div>`;
  }).join('');

  // 再平衡操作
  const ops = r.ops || [];
  const opsHtml = ops.length === 0
    ? `<span style="color:var(--text-dim);font-size:12px">无调仓操作</span>`
    : ops.map(o => {
        const isSell = o.op === '赎回';
        const clr = isSell ? 'var(--red)' : 'var(--green)';
        const badge = isSell
          ? `<span style="background:rgba(239,68,68,.12);color:var(--red);font-size:11px;font-weight:700;padding:1px 6px;border-radius:3px">🔴 赎回</span>`
          : `<span style="background:rgba(34,197,94,.12);color:var(--green);font-size:11px;font-weight:700;padding:1px 6px;border-radius:3px">🟢 申购</span>`;
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px">
          ${badge}
          <span style="color:var(--text)">${escHtml(o.name)}</span>
          <span style="color:${clr};font-weight:700;margin-left:auto;white-space:nowrap">${fmtMoney(o.amount)}</span>
        </div>`;
      }).join('');

  return `<tr>
    <td style="white-space:nowrap;color:var(--text-dim);font-size:12px">${savedAt}</td>
    <td style="vertical-align:top">${trigHtml}</td>
    <td style="white-space:nowrap;font-weight:700">¥${(r.total||0).toLocaleString('zh-CN',{maximumFractionDigits:0})}</td>
    <td style="vertical-align:top">${assetsHtml}</td>
    <td style="vertical-align:top">${opsHtml}</td>
  </tr>`;
}

export { saveAwJournalRecord, showAwToast, openAwJournal, closeAwJournal, loadAwJournal };
