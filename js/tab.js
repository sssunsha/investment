// js/tab.js

export function switchTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.getElementById('panel-' + id).classList.add('active');
  history.replaceState(null, '', '#' + id);
  if (id === 'mdtfr') {
    // 动态 import 避免循环依赖：tab.js ↔ mdtfr/loader.js
    import('./mdtfr/loader.js').then(m => m.mdtfrMaybeInitEmpty());
  }
}

export function initHashRouter() {
  const hash = location.hash.slice(1);
  if (hash && document.getElementById('tab-' + hash)) {
    switchTab(hash);
  } else {
    import('./mdtfr/loader.js').then(m => m.mdtfrMaybeInitEmpty());
  }
}
