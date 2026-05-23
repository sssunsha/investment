// js/aw/calc.js — 再平衡计算核心
import { PORTFOLIO, ASSET_COLORS, getActiveAsset } from './config.js';
import { fmtMoney } from '../utils.js';
import { highlightMonitorRows, clearMonitorHighlights } from './monitor.js';
import { getAwAvailableAmt, getAwTotalAmt } from './aw-available.js';
import { getAwDynAmt } from './amounts.js';

let lastCalcResult = null;

// ── 自动判断检查类型 ──
function _detectCheckType() {
  const month = new Date().getMonth() + 1;
  return [4, 7, 10, 1].includes(month) ? 'quarterly' : 'monthly';
}

function calcRebalance() {
  _runCalc(_detectCheckType());
}

function _runCalc(checkType) {
  const assets = {};
  for (const a of PORTFOLIO) {
    assets[a.id] = getAwDynAmt(getActiveAsset(a).code);
  }

  // ── 确定有效总金额（持仓 + 可用金额）──
  const assetSum = Object.values(assets).reduce((s, v) => s + v, 0);
  const available = getAwAvailableAmt();
  const total     = assetSum + available;

  if (total <= 0) {
    document.getElementById('total-hint').innerHTML =
      '<span style="color:var(--red)">⚠ 请先在标的监控中录入持仓金额</span>';
    document.getElementById('check-type-banner').innerHTML = '';
    document.getElementById('compare-rows').innerHTML = '';
    document.getElementById('op-plans').style.display = 'none';
    document.getElementById('calc-result-card').style.display = 'block';
    return;
  }

  const totalMode = `✦ 总金额 = 持仓 ${fmtMoney(assetSum)} + 可用 ${fmtMoney(available)} = ${fmtMoney(total)}`;
  document.getElementById('total-hint').innerHTML =
    `<span style="color:var(--text-dim)">${totalMode}</span>`;

  const weights = {};
  for (const a of PORTFOLIO) { weights[a.id] = assets[a.id] / total; }

  // ── 极端熔断并行检查（始终运行，与主检查类型无关）──
  const realtimeAssets = PORTFOLIO.filter(a => Math.abs(weights[a.id] - a.target) >= 0.10);
  const realtimeTriggered = realtimeAssets.length > 0;

  // ── Trigger checks（按检查类型过滤）──
  const hs300w  = weights['hs300'];
  const zz500w  = weights['zz500'];
  const bond75w = weights['bond75'];
  const bond35w = weights['bond35'];
  const bond5w  = weights['bond5'];

  const triggerResults = [];
  const triggeredTypes = [];

  if (checkType === 'monthly') {
    // 每月检查日：仅常规阈值再平衡(±5%)
    const threshAssets = PORTFOLIO.filter(a => Math.abs(weights[a.id] - a.target) >= 0.05);
    triggerResults.push({
      label: '常规阈值再平衡 (±5%)',
      triggered: threshAssets.length > 0,
      detail: threshAssets.length ? `触发：${threshAssets.map(a=>a.label).join('、')}` : '所有资产偏差 < 5%',
    });
    if (threshAssets.length) triggeredTypes.push('常规阈值再平衡');

  } else if (checkType === 'quarterly') {
    // 每季度检查日：定期体检再平衡(±3%) + 内部结构再平衡
    const checkAssets = PORTFOLIO.filter(a => Math.abs(weights[a.id] - a.target) >= 0.03);
    triggerResults.push({
      label: '定期体检再平衡 (±3%)',
      triggered: checkAssets.length > 0,
      detail: checkAssets.length ? `触发：${checkAssets.map(a=>a.label).join('、')}` : '所有资产偏差 < 3%',
    });
    if (checkAssets.length) triggeredTypes.push('定期体检再平衡');

    const stockRatio = zz500w > 0 ? hs300w / zz500w : null;
    const stockTriggered = stockRatio != null && (stockRatio >= 3.0 || stockRatio <= 1.0);
    triggerResults.push({
      label: '股票内部结构 (1:1~3:1)',
      triggered: stockTriggered,
      detail: stockRatio != null
        ? `沪深300/中证500 = ${stockRatio.toFixed(2)}（安全区间 [1.0, 3.0]，目标约1.67）`
        : '中证500 为 0，无法计算',
    });
    if (stockTriggered) triggeredTypes.push('股票内部结构');

    const longBondW = bond75w + bond35w;
    const bondRatio = bond5w > 0 ? longBondW / bond5w : null;
    const bondTriggered = bondRatio != null && (bondRatio >= 2.0 || bondRatio <= 0.5);
    triggerResults.push({
      label: '债券内部结构 (1:2~2:1)',
      triggered: bondTriggered,
      detail: bondRatio != null
        ? `长债/中债 = ${bondRatio.toFixed(2)}（安全区间 [0.5, 2.0]，目标约1.5）`
        : '中债为 0，无法计算',
    });
    if (bondTriggered) triggeredTypes.push('债券内部结构');
  }

  // ── 渲染检查类型横幅 ──
  const _month = new Date().getMonth() + 1;
  let _bannerHtml = '';

  if (realtimeTriggered) {
    const _alertLines = realtimeAssets.map(a => {
      const _drift = (weights[a.id] - a.target) * 100;
      const _driftStr = (_drift >= 0 ? '+' : '') + _drift.toFixed(1) + '%';
      return `${a.label} 偏离 ${_driftStr}（目标${(a.target * 100).toFixed(0)}%，当前${(weights[a.id] * 100).toFixed(1)}%）`;
    }).join('；');
    _bannerHtml += `<div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);border-radius:8px;padding:10px 14px;margin-bottom:8px;color:var(--red);font-size:13px;font-weight:600;line-height:1.7">`
      + `⚡ 极端熔断！${_alertLines}<br>`
      + `<span style="font-weight:400;color:var(--text-dim)">建议立即执行再平衡，无需等待月度检查日</span></div>`;
  }

  if (checkType === 'quarterly') {
    _bannerHtml += `<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.28);border-radius:8px;padding:8px 14px;margin-bottom:10px;font-size:13px;color:var(--text-dim)">`
      + `📊 每季度检查日 ｜ 当前${_month}月，季度首月（4/7/10/1月），执行定期体检（±3%）及内部结构检查</div>`;
  } else {
    _bannerHtml += `<div style="background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.25);border-radius:8px;padding:8px 14px;margin-bottom:10px;font-size:13px;color:var(--text-dim)">`
      + `📅 每月检查日 ｜ 当前${_month}月，非季度首月，执行常规阈值检查（±5%）</div>`;
  }

  document.getElementById('check-type-banner').innerHTML = _bannerHtml;

  const primaryTriggered = triggeredTypes.length > 0;
  const anyTriggered = primaryTriggered || realtimeTriggered;
  const allTriggeredTypes = [...triggeredTypes, ...(realtimeTriggered ? ['极端熔断再平衡'] : [])];

  // ── Render trigger status badges ──
  document.getElementById('trigger-status').innerHTML =
    '<span style="font-size:13px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-right:4px">触发点：</span>' +
    triggerResults.map(t =>
      `<span class="sum-chip ${t.triggered ? 'sum-sell' : 'sum-ok'}" title="${t.detail}">${t.triggered ? '⚠' : '✓'} ${t.label}</span>`
    ).join('');

  // ── Per-asset target amount & diff ──
  const ops = PORTFOLIO.map(a => {
    const currentVal = assets[a.id];
    const targetVal  = total * a.target;
    const diff       = targetVal - currentVal;  // positive = need to buy
    const currentPct = weights[a.id];
    const drift      = currentPct - a.target;   // positive = overweight
    return { ...a, currentVal, targetVal, diff, currentPct, drift };
  });

  // Highlight monitor rows: red = sell, green = buy
  highlightMonitorRows(ops);

  // ── Render comparison rows ──
  document.getElementById('compare-rows').innerHTML = ops.map(op => {
    const isSell   = op.diff < -1;
    const isBuy    = op.diff >  1;
    const rowClass = isSell ? 'row-sell' : isBuy ? 'row-buy' : 'row-hold';
    const arrow    = isSell ? '↓' : isBuy ? '↑' : '→';
    const arrowCls = isSell ? 'arrow-sell' : isBuy ? 'arrow-buy' : 'arrow-hold';
    const opLabel  = isSell ? '赎 回' : isBuy ? '申 购' : '持 有';
    const opLblCls = isSell ? 'op-lbl-sell' : isBuy ? 'op-lbl-buy' : 'op-lbl-hold';
    const opAmtCls = isSell ? 'op-amt-sell' : isBuy ? 'op-amt-buy' : '';
    const driftPct = (op.drift * 100);
    const driftStr = (driftPct >= 0 ? '+' : '') + driftPct.toFixed(1) + '%';
    const driftCls = op.drift >  0.05 ? 'drift-hi' : op.drift < -0.05 ? 'drift-lo' : 'drift-ok';
    const accentColor = ASSET_COLORS[op.group];
    return `
      <div class="compare-row ${rowClass}">
        <div class="compare-cell">
          <div class="compare-fund-name" style="color:${accentColor}">${op.name}</div>
          <div class="compare-fund-sub">${op.label} · ${op.code}</div>
          <div class="compare-value">${fmtMoney(op.currentVal)}</div>
          <div class="compare-pct">
            ${(op.currentPct*100).toFixed(1)}%
            <span class="drift-badge ${driftCls}">${driftStr}</span>
          </div>
        </div>
        <div class="compare-mid-cell">
          <div class="compare-arrow ${arrowCls}">${arrow}</div>
          <div class="compare-op-label ${opLblCls}">${opLabel}</div>
          ${(isSell || isBuy)
            ? `<div class="compare-op-amount ${opAmtCls}">${isSell ? '-' : '+'}${fmtMoney(Math.abs(op.diff))}</div>`
            : `<div style="font-size:13px;color:var(--text-dim)">无需调整</div>`}
        </div>
        <div class="compare-cell right">
          <div class="compare-fund-name" style="color:${accentColor}">${op.name}</div>
          <div class="compare-fund-sub">${op.label}</div>
          <div class="compare-value">${fmtMoney(op.targetVal)}</div>
          <div class="compare-pct right" style="color:var(--text-dim)">${(op.target*100).toFixed(0)}%（目标）</div>
        </div>
      </div>`;
  }).join('');

  // ── Summary bar ──
  const sells     = ops.filter(o => o.diff < -1);
  const buys      = ops.filter(o => o.diff >  1);
  const totalSell = sells.reduce((s, o) => s + Math.abs(o.diff), 0);
  const totalBuy  = buys.reduce((s,  o) => s + o.diff, 0);

  const availableWarning = anyTriggered && totalBuy > available + totalSell
    ? `<span class="sum-chip" style="background:rgba(245,158,11,.15);color:var(--yellow)">⚠ 买入合计超出可用资金 ${fmtMoney(totalBuy - available - totalSell)}</span>`
    : '';
  document.getElementById('calc-summary').innerHTML = anyTriggered
    ? `<span class="sum-chip sum-sell">↓ 赎回合计：${fmtMoney(totalSell)}</span>
       <span class="sum-chip sum-buy">↑ 申购合计：${fmtMoney(totalBuy)}</span>
       <span class="sum-chip sum-info">可用：${fmtMoney(available)}</span>
       ${availableWarning}
       <span class="sum-chip sum-info" style="margin-left:auto">触发：${allTriggeredTypes.join(' / ')}</span>`
    : `<span class="sum-chip sum-ok">✓ 所有触发点均未触发，投资组合无需调整</span>`;

  // ── Operation plans ──
  if (anyTriggered && (sells.length > 0 || buys.length > 0)) {
    document.getElementById('op-plans').style.display = 'block';

    // Plan 1: Direct conversion – greedy match sellers → buyers
    const sellQ = sells.map(o => ({ ...o, rem: Math.abs(o.diff) }));
    const buyQ  = buys.map(o => ({ ...o, rem: o.diff }));
    const convPairs = [];
    let si = 0, bi = 0;
    while (si < sellQ.length && bi < buyQ.length) {
      const s = sellQ[si], b = buyQ[bi];
      const amt = Math.min(s.rem, b.rem);
      if (amt > 1) convPairs.push({ from: s, to: b, amount: amt });
      s.rem -= amt; b.rem -= amt;
      if (s.rem < 1) si++;
      if (b.rem < 1) bi++;
    }
    const extraSells = sellQ.filter(s => s.rem > 1);
    const extraBuys  = buyQ.filter(b => b.rem > 1);

    document.getElementById('plan-convert').innerHTML = `
      <div class="op-plan-head">
        <span>⚡</span><span>方案一：直接转换</span>
        <span class="op-plan-head-sub">同平台一步到位，无需等待资金到账</span>
      </div>
      <div class="op-plan-body">
        <div class="op-step">
          <div class="op-step-title">转换操作（共 ${convPairs.length} 笔）</div>
          <div class="op-step-items">
            ${convPairs.map(c => `
              <div class="op-convert-row">
                <div class="convert-from">↓ ${c.from.name}<div style="font-size:14px;color:var(--text-dim);font-weight:400">${c.from.code}</div></div>
                <span class="convert-arrow-icon">→</span>
                <div class="convert-to">↑ ${c.to.name}<div style="font-size:14px;color:var(--text-dim);font-weight:400">${c.to.code}</div></div>
                <span class="convert-amount">${fmtMoney(c.amount)}</span>
              </div>`).join('')}
          </div>
        </div>
        ${extraSells.length ? `
          <div class="op-step">
            <div class="op-step-title">⚠ 额外赎回（无对应申购匹配）</div>
            <div class="op-step-items">
              ${extraSells.map(s => `
                <div class="op-step-item sell-item">
                  <div class="op-item-meta">
                    <span class="op-item-name">${s.name}</span>
                    <span class="op-item-sub">${s.code}</span>
                  </div>
                  <span class="op-item-amount">-${fmtMoney(s.rem)}</span>
                </div>`).join('')}
            </div>
          </div>` : ''}
        ${extraBuys.length ? `
          <div class="op-step">
            <div class="op-step-title">⚠ 额外申购（超出赎回金额）</div>
            <div class="op-step-items">
              ${extraBuys.map(b => `
                <div class="op-step-item buy-item">
                  <div class="op-item-meta">
                    <span class="op-item-name">${b.name}</span>
                    <span class="op-item-sub">${b.code}</span>
                  </div>
                  <span class="op-item-amount">+${fmtMoney(b.rem)}</span>
                </div>`).join('')}
            </div>
          </div>` : ''}
        <div class="op-footnote">* 直接转换需平台支持（天天基金、蚂蚁财富等均支持跨公司转换）。转换当日完成，资金无需经过银行卡。</div>
      </div>`;

    // Plan 2: Sell then buy (stepwise)
    document.getElementById('plan-stepwise').innerHTML = `
      <div class="op-plan-head">
        <span>🔄</span><span>方案二：卖出后再买入</span>
        <span class="op-plan-head-sub">分步操作，适用所有平台</span>
      </div>
      <div class="op-plan-body">
        <div class="op-step">
          <div class="op-step-title">第一步（当日）：赎回超配资产</div>
          <div class="op-step-items">
            ${sells.map(s => `
              <div class="op-step-item sell-item">
                <div class="op-item-meta">
                  <span class="op-item-name">${s.name}</span>
                  <span class="op-item-sub">${s.code} · ${(s.currentPct*100).toFixed(1)}% → ${(s.target*100).toFixed(0)}%</span>
                </div>
                <span class="op-item-amount">-${fmtMoney(Math.abs(s.diff))}</span>
              </div>`).join('')}
          </div>
          <div class="op-footnote">* 赎回后 T+1～T+3 工作日到账。利用等待期间完成申购准备。</div>
        </div>
        <div class="op-step">
          <div class="op-step-title">第二步（资金到账后）：申购低配资产</div>
          <div class="op-step-items">
            ${buys.map(b => `
              <div class="op-step-item buy-item">
                <div class="op-item-meta">
                  <span class="op-item-name">${b.name}</span>
                  <span class="op-item-sub">${b.code} · ${(b.currentPct*100).toFixed(1)}% → ${(b.target*100).toFixed(0)}%</span>
                </div>
                <span class="op-item-amount">+${fmtMoney(b.diff)}</span>
              </div>`).join('')}
          </div>
          <div class="op-footnote">* 若赎回资金分批到账，可按各基金到账比例分批申购，降低短期波动风险。</div>
        </div>
      </div>`;

    document.getElementById('save-log-btn').style.display = 'inline-flex';
    lastCalcResult = {
      total,
      weights,
      ops: [...sells.map(o => ({ op: '赎回', name: o.name, code: o.code, amount: Math.abs(o.diff) })),
            ...buys.map(o  => ({ op: '申购', name: o.name, code: o.code, amount: o.diff }))],
      triggers: allTriggeredTypes,
    };
    // 自动保存复盘记录（静默模式）
    window.saveAwJournalRecord?.(true);
  } else {
    document.getElementById('op-plans').style.display = 'none';
    document.getElementById('save-log-btn').style.display = 'none';
    lastCalcResult = null;
  }

  document.getElementById('calc-result-card').style.display = 'block';
}

function resetCalc() {
  document.getElementById('total-hint').innerHTML = '';
  document.getElementById('check-type-banner').innerHTML = '';
  document.getElementById('calc-result-card').style.display = 'none';
  clearMonitorHighlights();
  lastCalcResult = null;
}

export function getLastCalcResult() { return lastCalcResult; }

export { calcRebalance, resetCalc };
