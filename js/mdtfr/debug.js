import { escHtml } from '../utils.js';

let _mdtfrLogs = [];
function mdtfrLog(level, msg) {
  const ts = new Date().toTimeString().slice(0,8);
  _mdtfrLogs.push({ts, level, msg});
  const el = document.getElementById('mdtfr-debug-log');
  if (!el) return;
  const color = level==='error'?'var(--red)':level==='ok'?'var(--green)':level==='cache'?'var(--purple)':level==='done'?'var(--cyan)':'var(--text-dim)';
  el.innerHTML += `<div><span style="color:var(--border)">[${ts}]</span> <span style="color:${color}">[${level.toUpperCase()}]</span> ${escHtml(msg)}</div>`;
  el.scrollTop = el.scrollHeight;
}
function toggleMdtfrDebug() {
  const drawer = document.getElementById('debug-drawer');
  if (drawer.classList.contains('open')) {
    closeDebugDrawer();
  } else {
    drawer.classList.add('open');
    document.getElementById('debug-drawer-overlay').classList.add('open');
    const log = document.getElementById('mdtfr-debug-log');
    if (log) log.scrollTop = log.scrollHeight;
  }
}
function closeDebugDrawer() {
  document.getElementById('debug-drawer').classList.remove('open');
  document.getElementById('debug-drawer-overlay').classList.remove('open');
}
function clearMdtfrDebug() {
  _mdtfrLogs = [];
  const el = document.getElementById('mdtfr-debug-log');
  if (el) el.innerHTML = '';
}

export { mdtfrLog, toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug };
