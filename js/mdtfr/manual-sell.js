// js/mdtfr/manual-sell.js
import { getDynAmt, setAmt, saveAmounts, getShares, getCost, setShares, setCost, getLastMdtfrItems, refreshAllPosPct, scaleMktVal, addRealizedPnl } from './amounts.js';
import { getAvailableAmt, setAvailableAmt, saveAvailable, refreshTotalDisplay, refreshPnlDisplay } from './available.js';
import { setPendingConfirmAnnotation } from './journal.js';
import { getMdtfrPoolDef } from './config.js';
import { markWatchExecuted } from './watch.js';
import { call, emit } from './bus.js';
import { addPendingCorrection } from './corrections.js';

// 当前打开弹窗的标的 code_c
let _activeCode = null;

export function openManualSellDialog(code_c) {
  _activeCode = code_c;
  const items = getLastMdtfrItems() || [];
  const item  = items.find(x => x.code_c === code_c);
  const name  = item?.name || getMdtfrPoolDef().find(d => d.code_c === code_c)?.name || code_c;
  const curAmt = getDynAmt(code_c);

  const overlay = document.getElementById('manual-sell-overlay');
  if (!overlay) return;

  document.getElementById('manual-sell-title').textContent = `手动卖出 · ${name}`;
  _renderBody(code_c, name, curAmt);
  overlay.classList.add('open');
}

export function closeManualSellDialog() {
  document.getElementById('manual-sell-overlay')?.classList.remove('open');
  _activeCode = null;
}

function _renderBody(code_c, name, curAmt) {
  const body = document.getElementById('manual-sell-body');
  if (!body) return;

  const totalShares = getShares(code_c);
  const fmtShares = n => n > 0 ? `约 ${Math.round(n).toLocaleString()} 份` : '';
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const presets = [
    { label: '25%', id: 'manual-preset-25pct', ratio: 0.25 },
    { label: '50%', id: 'manual-preset-50pct', ratio: 0.50 },
    { label: '75%', id: 'manual-preset-75pct', ratio: 0.75 },
    { label: '全仓', id: 'manual-preset-full', ratio: 1.00 },
  ];

  body.innerHTML = `
    <div style="padding:20px 24px 24px">
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">
        当前持仓：<span style="color:var(--yellow);font-weight:700">${fmtY(curAmt)}</span>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">卖出比例</div>
        <div style="display:flex;gap:8px">
          ${presets.map(p => `
            <button id="${p.id}"
              onclick="window._manualSellSelectPreset(${p.ratio}, ${curAmt}, ${totalShares})"
              style="flex:1;padding:8px 4px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:var(--text);transition:all .15s">
              ${p.label}<br>
              <span style="font-size:11px;font-weight:400;color:var(--text-dim)">${fmtY(Math.round(curAmt * p.ratio))}</span>
              ${totalShares > 0 ? `<br><span style="font-size:10px;font-weight:400;color:var(--text-dim);opacity:0.7">${fmtShares(totalShares * p.ratio)}</span>` : ''}
            </button>
          `).join('')}
        </div>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">自定义金额（元）</div>
        <input id="manual-sell-amt-input" type="number" min="1" step="100"
          placeholder="输入卖出金额"
          oninput="window._manualSellOnInput(${curAmt}, ${totalShares})"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:14px" />
        <div id="manual-sell-preview" style="font-size:12px;color:var(--text-dim);margin-top:6px;min-height:18px"></div>
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">备注（选填）</div>
        <input id="manual-sell-note" type="text" maxlength="100"
          placeholder="如：止盈 / 调仓 / 资金需求"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:13px" />
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="closeManualSellDialog()"
          style="padding:8px 18px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;color:var(--text-dim);font-size:13px;cursor:pointer">
          取消
        </button>
        <button id="manual-sell-confirm-btn"
          onclick="window._manualSellConfirm('${code_c}', '${name}', ${curAmt})"
          disabled
          style="padding:8px 20px;border-radius:6px;border:none;background:rgba(239,68,68,.7);color:#fff;font-size:13px;font-weight:700;cursor:not-allowed;opacity:0.5">
          确认卖出
        </button>
      </div>
    </div>`;

  // 默认选中全仓
  window._manualSellSelectPreset(1.0, curAmt, totalShares);
}

window._manualSellSelectPreset = function(ratio, curAmt, totalShares = 0) {
  const amt = Math.round(curAmt * ratio);
  const input = document.getElementById('manual-sell-amt-input');
  if (input) { input.value = amt; }
  _updatePresetHighlight(ratio);
  _updatePreview(amt, curAmt, totalShares);
  _updateConfirmBtn(amt, curAmt);
};

window._manualSellOnInput = function(curAmt, totalShares = 0) {
  const input = document.getElementById('manual-sell-amt-input');
  const amt = parseInt(input?.value || '0', 10) || 0;
  // 匹配预设比例（误差 ±1 元）
  const presets = [0.25, 0.50, 0.75, 1.00];
  const matchedRatio = presets.find(r => Math.abs(Math.round(curAmt * r) - amt) <= 1) ?? null;
  _updatePresetHighlight(matchedRatio);
  _updatePreview(amt, curAmt, totalShares);
  _updateConfirmBtn(amt, curAmt);
};

function _updatePresetHighlight(ratio) {
  const presets = [
    { id: 'manual-preset-25pct', ratio: 0.25 },
    { id: 'manual-preset-50pct', ratio: 0.50 },
    { id: 'manual-preset-75pct', ratio: 0.75 },
    { id: 'manual-preset-full',  ratio: 1.00 },
  ];
  presets.forEach(p => {
    const btn = document.getElementById(p.id);
    if (!btn) return;
    const active = p.ratio === ratio;
    btn.style.background = active ? 'rgba(239,68,68,.25)' : 'rgba(255,255,255,.05)';
    btn.style.border     = active ? '1px solid rgba(239,68,68,.6)' : '1px solid rgba(255,255,255,.15)';
    btn.style.color      = active ? 'var(--red)' : 'var(--text)';
  });
}

function _updatePreview(amt, curAmt, totalShares = 0) {
  const el = document.getElementById('manual-sell-preview');
  if (!el) return;
  if (amt <= 0) { el.textContent = ''; return; }
  const remain = Math.max(0, curAmt - amt);
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const sharesHint = totalShares > 0
    ? ` <span style="color:var(--text-dim);font-size:11px">（约 ${Math.round(totalShares * amt / curAmt).toLocaleString()} 份）</span>`
    : '';
  el.innerHTML = `卖出 <span style="color:var(--red);font-weight:600">${fmtY(amt)}</span>${sharesHint} → 货币基金　剩余持仓 <span style="color:var(--yellow);font-weight:600">${fmtY(remain)}</span>`;
}

function _updateConfirmBtn(amt, curAmt) {
  const btn = document.getElementById('manual-sell-confirm-btn');
  if (!btn) return;
  const valid = amt > 0 && amt <= curAmt;
  btn.disabled         = !valid;
  btn.style.opacity    = valid ? '1' : '0.5';
  btn.style.cursor     = valid ? 'pointer' : 'not-allowed';
  btn.style.background = valid ? 'rgba(239,68,68,.9)' : 'rgba(239,68,68,.7)';
}

window._manualSellConfirm = async function(code_c, name, curAmt) {
  const input     = document.getElementById('manual-sell-amt-input');
  const noteInput = document.getElementById('manual-sell-note');
  const amt  = parseInt(input?.value || '0', 10) || 0;
  const note = noteInput?.value?.trim() || '';

  if (amt <= 0 || amt > curAmt) return;

  // 金额 / 份额 / 成本更新（与 trade-confirm.js sell 分支一致）
  const prevAmt    = getDynAmt(code_c);
  const prevShares = getShares(code_c);
  const ratio      = prevAmt > 0 ? Math.min(amt / prevAmt, 1) : 0;

  setAmt(code_c, Math.max(0, prevAmt - amt));
  setAvailableAmt(getAvailableAmt() + amt);
  const prevCost = getCost(code_c);
  setShares(code_c, Math.max(0, prevShares - prevShares * ratio));
  setCost(code_c,   Math.max(0, prevCost * (1 - ratio)));
  scaleMktVal(code_c, 1 - ratio);

  const sellCost = prevCost * ratio;
  const pnl      = amt - sellCost;
  addRealizedPnl(pnl);

  await saveAmounts();
  await saveAvailable();
  refreshAllPosPct();
  refreshTotalDisplay();
  refreshPnlDisplay();
  await markWatchExecuted(code_c);

  // 写入 journal
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const soldShares = prevShares * ratio;
  setPendingConfirmAnnotation({
    confirmed_at: new Date().toISOString(),
    trade_records: [{
      type: 'sell', name, code_c, amt,
      shares: parseFloat(soldShares.toFixed(4)),
      cost: parseFloat(sellCost.toFixed(2)),
      pnl: parseFloat(pnl.toFixed(2)),
      note: note || `手动卖出 ${fmtY(amt)}`,
      manual: true,
    }],
  });
  // 静默保存，手动卖出 toast 已足够
  call('journalSaver', true);

  // 刷新建议面板
  const lastItems = call('getLastItems');
  if (lastItems) emit('advice:render', lastItems);

  // 写入待修正记录（T+1 结算）
  const items2 = getLastMdtfrItems() || [];
  const item2  = items2.find(x => x.code_c === code_c);
  const sellPrice = item2?.latest_close || 0;
  const today2 = new Date().toISOString().slice(0, 10);
  if (sellPrice > 0) {
    await addPendingCorrection({
      trade_date: today2,
      code_c,
      name,
      trade_type: 'sell',
      amt,
      estimated_price: sellPrice,
      estimated_shares: parseFloat((prevShares * ratio).toFixed(4)),
    });
  }

  closeManualSellDialog();

  const { showToast } = await import('./journal.js');
  showToast(`✅ 已手动卖出 ${name} ${fmtY(amt)}`, 'var(--red)');
};
