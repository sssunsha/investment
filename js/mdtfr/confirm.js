// js/mdtfr/confirm.js
let _confirmCallback = null;

export function showConfirm(msg, onConfirm, confirmText = '确认') {
  _confirmCallback = onConfirm;
  document.getElementById('confirm-msg').textContent = msg;
  const btn = document.getElementById('confirm-ok-btn');
  btn.textContent = confirmText;
  btn.onclick = () => { _confirmCallback?.(); closeConfirm(); };
  document.getElementById('confirm-overlay').classList.add('open');
}

export function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('open');
  _confirmCallback = null;
}
