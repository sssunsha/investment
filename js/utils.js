// js/utils.js
export function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function pct(v, d = 2) {
  if (v == null) return '<span style="color:var(--text-dim)">–</span>';
  const s = (v * 100).toFixed(d) + '%';
  return `<span style="font-weight:600;color:${v >= 0 ? 'var(--green)' : 'var(--red)'}">${v > 0 ? '+' : ''}${s}</span>`;
}

export function fmt(v, d = 3) {
  return v == null
    ? '<span style="color:var(--text-dim)">–</span>'
    : typeof v === 'number' ? v.toFixed(d) : v;
}

export function fmtMoney(v) {
  if (v == null) return '–';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' 元';
}

export function trendIcon(r) {
  return r == null
    ? '<span style="color:var(--border)">–</span>'
    : r
      ? '<span style="color:var(--green)">↑</span>'
      : '<span style="color:var(--red)">↓</span>';
}

export function setBtn(id, loading) {
  const b = document.getElementById(id);
  b.disabled = loading;
  b.innerHTML = loading ? '<span class="spinner"></span> 加载中' : '▶ 运行';
}

export function skeletonRows(c, n = 5) {
  return Array.from({ length: n }, () =>
    `<tr>${Array.from({ length: c }, () =>
      `<td><div class="skeleton" style="width:${40 + Math.random() * 40}%"></div></td>`
    ).join('')}</tr>`
  ).join('');
}
