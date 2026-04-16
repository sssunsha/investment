// js/mdtfr/pool-adjust.js
// 标的池调整弹窗相关函数
import { OFFENSIVE_CANDIDATES, getActiveCodes, setActiveCodes } from './config.js';
import { cacheDelete } from './cache.js';
import { mdtfrInitTable } from './table.js';
import { showToast } from './journal.js';

function openPoolAdjust() {
  const list = document.getElementById('pool-adjust-list');
  list.innerHTML = '';
  const activeCodes = getActiveCodes();
  OFFENSIVE_CANDIDATES.forEach(c => {
    const checked = activeCodes.has(c.code_c);
    const item = document.createElement('label');
    item.className = 'pool-adjust-item' + (checked ? ' selected' : '');
    item.innerHTML = `
      <input type="checkbox" value="${c.code_c}" ${checked ? 'checked' : ''}>
      <div style="flex:1">
        <div class="pai-name">${c.name}</div>
        <div class="pai-code">${c.code_c} · ETF ${c.etf}</div>
        <div class="pai-desc">${c.desc}</div>
      </div>`;
    const cb = item.querySelector('input');
    cb.addEventListener('change', () => {
      item.classList.toggle('selected', cb.checked);
      _updatePoolAdjustCount();
    });
    list.appendChild(item);
  });
  _updatePoolAdjustCount();
  document.getElementById('pool-adjust-overlay').classList.add('open');
}

function _updatePoolAdjustCount() {
  const checked = document.querySelectorAll('#pool-adjust-list input:checked').length;
  const el = document.getElementById('pool-adjust-count');
  const okBtn = document.getElementById('pool-adjust-ok');
  el.textContent = `已选 ${checked} / 2`;
  el.className = 'pool-adjust-count' + (checked !== 2 ? ' warn' : '');
  okBtn.disabled = checked !== 2;
}

function closePoolAdjust() {
  document.getElementById('pool-adjust-overlay').classList.remove('open');
}

async function applyPoolAdjust() {
  const checked = [...document.querySelectorAll('#pool-adjust-list input:checked')].map(cb => cb.value);
  if (checked.length !== 2) return;
  setActiveCodes(new Set(checked));
  closePoolAdjust();
  // 清空今日缓存，重置表格
  const today = new Date().toISOString().slice(0, 10);
  try { await cacheDelete(today); } catch(_) {}
  mdtfrInitTable(false);
  const names = checked.map(code => OFFENSIVE_CANDIDATES.find(c => c.code_c === code)?.name ?? code).join('、');
  showToast(`标的池已更新：进攻行业 → ${names}`);
}

export { openPoolAdjust, closePoolAdjust, applyPoolAdjust };
