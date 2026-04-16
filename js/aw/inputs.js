// js/aw/inputs.js
import { PORTFOLIO, ASSET_COLORS, CAT_GROUPS, awAltSet, getActiveAsset, AW_ALT_KEY } from './config.js';

function buildInputs() {
  const el = document.getElementById('asset-inputs');
  el.innerHTML = CAT_GROUPS.map(g => {
    const items = PORTFOLIO.filter(a => a.group === g.key);
    const totalTarget = items.reduce((s, a) => s + a.target, 0);
    const color = ASSET_COLORS[g.key];
    return `
      <div class="cat-row">
        <div class="cat-label">
          <span class="cat-name" style="color:${color}">${g.label}</span>
          <span class="cat-pct">${(totalTarget * 100).toFixed(0)}%</span>
        </div>
        <div class="cat-inputs" style="grid-template-columns:repeat(${items.length},1fr)">
          ${items.map(a => {
            const active = getActiveAsset(a);
            const isAlt = awAltSet.has(a.id) && a.alt;
            return `
            <div class="form-field" data-id="${a.id}">
              <label class="form-label" style="color:${color}">${a.label}（目标 ${(a.target * 100).toFixed(0)}%）</label>
              <input class="form-input" id="inp-${a.id}" type="number" placeholder="当前市值（元）" min="0">
              <div class="form-sub-row">
                <span class="form-sub">${active.name} · (${active.fullName} - ${active.code})</span>
                ${a.alt ? `<button class="aw-alt-btn${isAlt ? ' active' : ''}" onclick="toggleAwAlt('${a.id}')" title="${isAlt ? '切换回：' + a.name : '切换为：' + a.alt.name}">⇄</button>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
}

function toggleAwAlt(id) {
  const a = PORTFOLIO.find(x => x.id === id);
  if (!a?.alt) return;
  if (awAltSet.has(id)) {
    awAltSet.delete(id);
  } else {
    awAltSet.add(id);
  }
  localStorage.setItem(AW_ALT_KEY, JSON.stringify([...awAltSet]));
  // 保留已填数值后重建
  const saved = {};
  PORTFOLIO.forEach(x => {
    const inp = document.getElementById('inp-' + x.id);
    if (inp?.value) saved[x.id] = inp.value;
  });
  buildInputs();
  Object.entries(saved).forEach(([xid, val]) => {
    const inp = document.getElementById('inp-' + xid);
    if (inp) inp.value = val;
  });
  const active = getActiveAsset(a);
  window.showAwToast?.(`已切换为：${active.name}（${active.code}）`);
}

function highlightInputs(ops) {
  // ops: array of {id, diff} where diff = targetVal - currentVal
  ops.forEach(({ id, diff }) => {
    const el = document.querySelector(`.form-field[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('field-sell', 'field-buy');
    if (diff < -1)      el.classList.add('field-sell');
    else if (diff > 1)  el.classList.add('field-buy');
  });
}

function clearHighlights() {
  document.querySelectorAll('.form-field[data-id]').forEach(el => {
    el.classList.remove('field-sell', 'field-buy');
  });
}

export { buildInputs, toggleAwAlt, highlightInputs, clearHighlights };
