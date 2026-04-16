// js/aw/log.js — 操作日志（本地 localStorage）
import { fmtMoney } from '../utils.js';
import { getLastCalcResult } from './calc.js';

const LOG_KEY = 'aw_rebalance_log';

function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}

function saveLogData(data) {
  localStorage.setItem(LOG_KEY, JSON.stringify(data));
}

function renderLog() {
  const logs = loadLog();
  const tbody = document.getElementById('log-tbody');
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="log-empty">暂无操作记录 — 完成计算后点击"保存为操作记录"</td></tr>`;
    return;
  }
  tbody.innerHTML = logs.slice().reverse().map((entry, ri) => {
    const realIdx = logs.length - 1 - ri;
    const opsHtml = (entry.ops || []).map(o =>
      `<span class="op-chip ${o.op==='赎回'?'op-sell':'op-buy'}">${o.op} ${o.name} ${fmtMoney(o.amount)}</span>`
    ).join(' ');
    return `<tr>
      <td style="white-space:nowrap;font-weight:600">${entry.date}</td>
      <td style="font-size:13px;color:var(--text-dim)">${(entry.triggerTypes||[]).join('、') || '手动'}</td>
      <td style="white-space:nowrap">${fmtMoney(entry.total)}</td>
      <td><div class="log-ops-cell">${opsHtml}</div></td>
      <td style="font-size:13px;color:var(--text-dim)">${entry.note || '–'}</td>
      <td><button class="log-del-btn" onclick="deleteLog(${realIdx})">删除</button></td>
    </tr>`;
  }).join('');
}

function saveToLog() {
  if (!getLastCalcResult()) return;
  const note = prompt('备注（可选）：', '') ?? '';
  const entry = {
    date: new Date().toISOString().slice(0, 10),
    total: getLastCalcResult().total,
    triggerTypes: [...new Set(getLastCalcResult().triggers)],
    ops: getLastCalcResult().ops,
    note,
    savedAt: new Date().toISOString(),
  };
  const logs = loadLog();
  logs.push(entry);
  saveLogData(logs);
  renderLog();
  alert('✓ 已保存操作记录');
}

function deleteLog(idx) {
  if (!confirm('确认删除该条记录？')) return;
  const logs = loadLog();
  logs.splice(idx, 1);
  saveLogData(logs);
  renderLog();
}

function clearLog() {
  if (!confirm('确认清空所有操作记录？此操作不可撤销。')) return;
  saveLogData([]);
  renderLog();
}

export { loadLog, saveLogData, renderLog, saveToLog, deleteLog, clearLog };
