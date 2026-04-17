import { escHtml } from '../utils.js';

let _awLogs = [];
function awLog(level, msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  _awLogs.push({ ts, level, msg });
  const el = document.getElementById('aw-debug-log');
  if (!el) return;
  const color = level === 'error' ? 'var(--red)' : level === 'ok' ? 'var(--green)' : level === 'cache' ? 'var(--purple)' : level === 'done' ? 'var(--cyan)' : 'var(--text-dim)';
  el.innerHTML += `<div><span style="color:var(--border)">[${ts}]</span> <span style="color:${color}">[${level.toUpperCase()}]</span> ${escHtml(msg)}</div>`;
  el.scrollTop = el.scrollHeight;
}
function toggleAwDebug() {
  const drawer = document.getElementById('aw-debug-drawer');
  if (drawer.classList.contains('open')) {
    closeAwDebugDrawer();
  } else {
    drawer.classList.add('open');
    document.getElementById('aw-debug-drawer-overlay').classList.add('open');
    const log = document.getElementById('aw-debug-log');
    if (log) log.scrollTop = log.scrollHeight;
  }
}
function closeAwDebugDrawer() {
  document.getElementById('aw-debug-drawer').classList.remove('open');
  document.getElementById('aw-debug-drawer-overlay').classList.remove('open');
}
function clearAwDebug() {
  _awLogs = [];
  const el = document.getElementById('aw-debug-log');
  if (el) el.innerHTML = '';
}

export { awLog, toggleAwDebug, closeAwDebugDrawer, clearAwDebug };
