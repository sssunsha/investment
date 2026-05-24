// js/aw/inputs.js
import { PORTFOLIO, awAltSet, getActiveAsset, AW_ALT_KEY } from './config.js';
import { getAwAmt } from './amounts.js';
import { refreshFundDrawerRow } from './monitor.js';

function toggleAwAlt(id) {
  const a = PORTFOLIO.find(x => x.id === id);
  if (!a?.alt) return;

  const currentActive = getActiveAsset(a);
  const currentAmt = getAwAmt(currentActive.code);
  if (currentAmt > 0) {
    const currentName = currentActive.name;
    window.showAwToast?.(
      `⚠ ${currentName} 中尚有持仓 ¥${currentAmt.toLocaleString('zh-CN')}，切换后请尽快赎回`,
      'var(--yellow)'
    );
  }

  if (awAltSet.has(id)) {
    awAltSet.delete(id);
  } else {
    awAltSet.add(id);
  }
  localStorage.setItem(AW_ALT_KEY, JSON.stringify([...awAltSet]));
  refreshFundDrawerRow(id);
}

export { toggleAwAlt };
