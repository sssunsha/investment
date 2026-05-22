// js/aw/amounts.js — AW 全天候策略持仓金额/份额/成本管理
import { PORTFOLIO, getActiveAsset } from './config.js';

const AW_AMOUNTS_API = '/api/cache/aw-amounts';

const _rawData = {};   // 含 __available__, __shares__, __cost__ 等特殊键
const _amt     = {};   // code → 持仓金额（数值）
const _mktVal  = {};   // code → 动态市值（份额×最新净值），不持久化

// ── 内部：总金额（不依赖 aw-available.js，避免循环依赖）───────
function _getTotal() {
  const available = parseFloat(_rawData['__available__'] || 0) || 0;
  return available + getAwSumOfPositions();
}

// ── 份额/成本辅助 ──────────────────────────────────────────────
function _getSharesObj() {
  const s = _rawData['__shares__'];
  return (s && typeof s === 'object') ? s : {};
}
function _getCostObj() {
  const c = _rawData['__cost__'];
  return (c && typeof c === 'object') ? c : {};
}

export function getAwShares(code) { return parseFloat(_getSharesObj()[code] || 0) || 0; }
export function getAwCost(code)   { return parseFloat(_getCostObj()[code]   || 0) || 0; }

export function setAwShares(code, v) {
  if (!_rawData['__shares__']) _rawData['__shares__'] = {};
  _rawData['__shares__'][code] = parseFloat(v) || 0;
}
export function setAwCost(code, v) {
  if (!_rawData['__cost__']) _rawData['__cost__'] = {};
  _rawData['__cost__'][code] = parseFloat(v) || 0;
}

// ── 金额读写 ───────────────────────────────────────────────────
export function getAwAmt(code)    { return parseFloat(_amt[code] || 0) || 0; }
export function getAwDynAmt(code) { return code in _mktVal ? _mktVal[code] : getAwAmt(code); }
export function hasAwMktVal(code) { return code in _mktVal; }

export function setAwAmt(code, value) {
  const v = parseFloat(value) || 0;
  _amt[code] = v > 0 ? v : 0;
}

/** _rawData 访问器（供 aw-available.js 管理 __available__ 字段）*/
export function getAwRawKey(key)         { return _rawData[key]; }
export function setAwRawKey(key, value)  { _rawData[key] = value; }

export function getAwSumOfPositions() {
  return Object.values(_amt).reduce((s, v) => s + (parseFloat(v) || 0), 0);
}

// ── 持久化 ─────────────────────────────────────────────────────
export async function loadAwAmounts() {
  try {
    const res = await fetch(AW_AMOUNTS_API);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        Object.assign(_rawData, data);
        Object.entries(data).forEach(([k, v]) => {
          if (!k.startsWith('__')) _amt[k] = parseFloat(v) || 0;
        });
      }
    }
  } catch {}
}

export async function saveAwAmounts() {
  try {
    const payload = { ..._amt };
    if ('__available__' in _rawData) payload['__available__'] = _rawData['__available__'];
    if ('__shares__'    in _rawData) payload['__shares__']    = _rawData['__shares__'];
    if ('__cost__'      in _rawData) payload['__cost__']      = _rawData['__cost__'];
    await fetch(AW_AMOUNTS_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {}
}

// ── UI 刷新 ────────────────────────────────────────────────────
export function refreshAwAllPosPct() {
  const total = _getTotal();
  const codes = new Set([...Object.keys(_amt), ...Object.keys(_mktVal)]);
  codes.forEach(code => {
    const pct = total > 0 ? Math.round(getAwDynAmt(code) / total * 1000) / 10 : 0;
    const span = document.querySelector(`#aw-pos-${code} .aw-pos-pct`);
    if (span) {
      span.textContent  = pct > 0 ? pct.toFixed(1) + '%' : '–';
      span.dataset.held = String(pct > 0);
    }
  });
  _updateAwTotalLabel(total);
}

function _updateAwTotalLabel(total) {
  const el = document.getElementById('aw-total-amt');
  if (!el) return;
  el.textContent = total > 0 ? `总金额：¥${Math.round(total).toLocaleString()}` : '总金额：¥0';
}

/** 加载行情后调用，用份额×净值计算动态市值并刷新颜色 */
export function refreshAwAmtPnl(items) {
  let anyUpdated = false;
  items.forEach(item => {
    if (!item || item.error || item.latest_close == null) return;
    const c      = item.code_c;   // AW池中 code_c 即 A类基金代码
    const shares = getAwShares(c);
    const cost   = getAwCost(c);
    if (shares > 0) {
      const curVal = Math.round(shares * item.latest_close);
      _mktVal[c] = curVal;
      anyUpdated = true;
      const inp = document.getElementById(`aw-amt-input-${c}`);
      if (inp && cost > 0) {
        inp.style.color = curVal > cost ? 'var(--red)' : curVal < cost ? 'var(--green)' : '';
      }
    } else {
      const inp = document.getElementById(`aw-amt-input-${c}`);
      if (inp) inp.style.color = '';
    }
  });
  if (anyUpdated) refreshAwAllPosPct();
}

// ── 输入框回调 ─────────────────────────────────────────────────
export function onAwAmtChange(code, val) {
  setAwAmt(code, val);
  saveAwAmounts();
  refreshAwAllPosPct();
  _syncCalcInput(code);
}

export function clearAwAmt(code) {
  setAwAmt(code, 0);
  delete _mktVal[code];
  setAwShares(code, 0);
  setAwCost(code, 0);
  saveAwAmounts();
  refreshAwAllPosPct();
  const inp = document.getElementById(`aw-amt-input-${code}`);
  if (inp) { inp.value = ''; inp.dataset.held = 'false'; inp.style.color = ''; }
  _syncCalcInput(code);
}

/** 监控表格金额变化 → 同步更新计算器 #inp-{id} */
function _syncCalcInput(code) {
  const asset = PORTFOLIO.find(a => getActiveAsset(a).code === code);
  if (!asset) return;
  const inp = document.getElementById('inp-' + asset.id);
  if (inp && document.activeElement !== inp) {
    const v = getAwDynAmt(code);
    inp.value = v > 0 ? v : '';
  }
}

// ── HTML 构建辅助 ──────────────────────────────────────────────
export function mkAwAmtCell(code) {
  const v    = getAwAmt(code);
  const held = v > 0;
  return `<div style="display:flex;gap:4px;align-items:center">
    <input class="amt-input" type="number" min="0" step="100"
      id="aw-amt-input-${code}"
      data-code="${code}" data-held="${held}"
      value="${v > 0 ? v : ''}" placeholder="0"
      oninput="onAwAmtChange('${code}',this.value)"
    />
    <button class="amt-clear-btn" onclick="clearAwAmt('${code}')" title="清零">×</button>
  </div>`;
}

export function mkAwSharesCell(code) {
  const shares = getAwShares(code);
  const cost   = getAwCost(code);
  const nav    = cost > 0 && shares > 0 ? (cost / shares).toFixed(4) : '–';
  const tip    = shares > 0
    ? `title="份额: ${shares.toFixed(2)} / 成本: ¥${Math.round(cost).toLocaleString()} / 均价: ${nav}"`
    : '';
  return `<span id="aw-shares-${code}" style="font-size:13px;color:var(--text-dim);cursor:${shares>0?'help':'default'}" ${tip}>${shares > 0 ? shares.toFixed(2) : '–'}</span>`;
}

export function mkAwPosPct(code) {
  const total = _getTotal();
  const pct   = total > 0 ? Math.round(getAwDynAmt(code) / total * 1000) / 10 : 0;
  return `<span id="aw-pos-${code}"><span class="aw-pos-pct" data-code="${code}" data-held="${pct > 0}">${pct > 0 ? pct.toFixed(1) + '%' : '–'}</span></span>`;
}
