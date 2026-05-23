// js/aw/inputs.js
import { PORTFOLIO, awAltSet, getActiveAsset, AW_ALT_KEY } from './config.js';
import { refreshAwTypeBadges } from './monitor.js';

function toggleAwAlt(id) {
  const a = PORTFOLIO.find(x => x.id === id);
  if (!a?.alt) return;
  if (awAltSet.has(id)) {
    awAltSet.delete(id);
  } else {
    awAltSet.add(id);
  }
  localStorage.setItem(AW_ALT_KEY, JSON.stringify([...awAltSet]));
  refreshAwTypeBadges();
  const active = getActiveAsset(a);
  window.showAwToast?.(`已切换为：${active.name}（${active.code}）`);
}

export { toggleAwAlt };
