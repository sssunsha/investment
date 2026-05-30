// js/mdtfr/amounts.js
// 持仓金额管理：加载、保存、查询、刷新仓位百分比、渲染单元格
import { getMdtfrPoolDef } from './config.js';
import { emit, call, on, register } from './bus.js';

function _updateTotalLabel() {
  const el = document.getElementById('mdtfr-total-amt');
  if (!el) return;
  const t = call('getTotalAmt') ?? getSumOfPositions();
  el.textContent = t > 0 ? `总金额：¥${Math.round(t).toLocaleString()}` : '总金额：¥0';
}

// _rawData：服务端返回的原始 JSON（含 __available__ 及所有 code_c 键）
const _rawData = {};
// _amt[code_c] = 金额数值（0 = 未持仓），仅含非 __ 前缀键
const _amt = {};
// _mktVal[code_c] = 动态市值（份额×最新收盘价），不持久化；有值时优先用于展示和计算
const _mktVal = {};

// 缓存最近一次 mdtfrRenderAdvice 调用的标的列表，金额变化时重新渲染建议
let _lastMdtfrItems = null;

async function loadAmounts() {
  try {
    const res = await fetch('/api/cache/amounts');
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
  // 一次性迁移：若后端文件为空但 localStorage 有数据，迁移后清除
  if (Object.keys(_amt).length === 0) {
    try {
      const ls = JSON.parse(localStorage.getItem('mdtfr_amt') || '{}');
      if (Object.keys(ls).length > 0) {
        Object.assign(_amt, ls);
        await saveAmounts();
        localStorage.removeItem('mdtfr_amt');
      }
    } catch {}
  }
}

async function saveAmounts() {
  try {
    // 合并持仓金额与 __available__ 一起写入
    const payload = { ..._amt };
    if ('__available__' in _rawData) payload['__available__'] = _rawData['__available__'];
    if ('__shares__' in _rawData)    payload['__shares__']    = _rawData['__shares__'];
    if ('__cost__'   in _rawData)    payload['__cost__']      = _rawData['__cost__'];
    await fetch('/api/cache/amounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {}
}

/** 读取 _rawData 中任意键（供 available.js 读取 __available__）*/
function _getRawKey(key) { return _rawData[key]; }
/** 写入 _rawData 中任意键（供 available.js 写入 __available__）*/
function _setRawKey(key, value) { _rawData[key] = value; }

function _getSharesObj() {
  const s = _rawData['__shares__'];
  return (s && typeof s === 'object') ? s : {};
}
function _getCostObj() {
  const c = _rawData['__cost__'];
  return (c && typeof c === 'object') ? c : {};
}

export function getShares(code_c) { return parseFloat(_getSharesObj()[code_c] || 0) || 0; }
export function getCost(code_c)   { return parseFloat(_getCostObj()[code_c]   || 0) || 0; }

export function setShares(code_c, v) {
  if (!_rawData['__shares__']) _rawData['__shares__'] = {};
  _rawData['__shares__'][code_c] = parseFloat(v) || 0;
}
export function setCost(code_c, v) {
  if (!_rawData['__cost__']) _rawData['__cost__'] = {};
  _rawData['__cost__'][code_c] = parseFloat(v) || 0;
}

/** 获取指定标的的持仓金额 */
function getAmt(code_c) { return parseFloat(_amt[code_c] || 0) || 0; }

/** 动态持仓金额：有市值缓存时用 _mktVal（份额×最新价），否则用用户录入的 _amt */
function getDynAmt(code_c) {
  return code_c in _mktVal ? _mktVal[code_c] : getAmt(code_c);
}

/** 内存写入单个标的金额（不持久化，需手动调 saveAmounts）*/
function setAmt(code_c, value) {
  const v = parseFloat(value) || 0;
  _amt[code_c] = v > 0 ? v : 0;
}

/** 批量覆盖所有标的金额（用于 available.js 持仓回溯恢复）*/
function setAmts(obj) {
  Object.keys(_amt).forEach(k => { _amt[k] = 0; });
  Object.entries(obj).forEach(([k, v]) => {
    if (!k.startsWith('__')) _amt[k] = parseFloat(v) || 0;
  });
}

/** 各标的持仓之和（不含可用金额）*/
function getSumOfPositions() {
  return getMdtfrPoolDef().reduce((s, d) => s + getDynAmt(d.code_c), 0);
}

/** 仓位百分比（以 getTotalAmt 为分母；未注入时退化为持仓之和）*/
function getPosVal(code_c) {
  const total = call('getTotalAmt') ?? getSumOfPositions();
  if (total <= 0) return 0;
  return Math.round(getDynAmt(code_c) / total * 1000) / 10;
}

/** 更新所有行的持仓百分比展示 + 总金额标签 */
function refreshAllPosPct() {
  const total = call('getTotalAmt') ?? getSumOfPositions();
  getMdtfrPoolDef().forEach(d => {
    const pct = total > 0 ? Math.round(getDynAmt(d.code_c) / total * 1000) / 10 : 0;
    const td = document.getElementById(`mdtfr-pos-${d.code_c}`);
    if (td) {
      const el = td.querySelector('.pos-pct');
      if (el) { el.textContent = pct > 0 ? pct.toFixed(1) + '%' : '–'; el.dataset.held = pct > 0; }
    }
    const inp = document.querySelector(`.amt-input[data-code="${d.code_c}"]`);
    if (inp && document.activeElement !== inp) {
      inp.dataset.held = pct > 0;
      const v = getDynAmt(d.code_c);
      inp.value = v > 0 ? v : '';
    }
  });
}

/** 金额输入框变化时触发 */
function onAmtChange(code_c, val) {
  setAmt(code_c, val);
  saveAmounts();
  refreshAllPosPct();
  _updateTotalLabel();
  if (_lastMdtfrItems) emit('advice:render', _lastMdtfrItems);
}

/** 清零指定标的持仓金额 */
function clearAmt(code_c) {
  setAmt(code_c, 0);
  delete _mktVal[code_c];
  setShares(code_c, 0);
  setCost(code_c, 0);
  saveAmounts();
  refreshAllPosPct();
  _updateTotalLabel();
  // 同步清空输入框 value，并重置盈亏颜色
  const inp = document.querySelector(`.amt-input[data-code="${code_c}"]`);
  if (inp) { inp.value = ''; inp.dataset.held = false; inp.style.color = ''; }
  if (_lastMdtfrItems) emit('advice:render', _lastMdtfrItems);
}

/** 生成金额只读展示（输出 HTML 字符串） */
function mkAmtCell(code_c) {
  const v = getAmt(code_c);
  const held = v > 0;
  return `<div style="display:flex;align-items:center">
    <input class="amt-input" type="number" readonly
      id="mdtfr-amt-input-${code_c}"
      data-code="${code_c}" data-held="${held}"
      value="${v > 0 ? v : ''}" placeholder="–"
      style="cursor:default;pointer-events:none"
    />
  </div>`;
}

/** 备用标的：禁用状态的金额单元格（不可编辑） */
function mkDisabledAmtCell() {
  return `<div style="display:flex;align-items:center;opacity:0.35;pointer-events:none">
    <input class="amt-input" type="number" disabled placeholder="–" />
  </div>`;
}

/** 生成仓位百分比展示（独立 td 内容） */
function mkPosPct(code_c) {
  const total = call('getTotalAmt') ?? getSumOfPositions();
  const pct = total > 0 ? Math.round(getAmt(code_c) / total * 1000) / 10 : 0;
  const held = pct > 0;
  return `<span class="pos-pct" data-code="${code_c}" data-held="${held}">${pct > 0 ? pct.toFixed(1) + '%' : '–'}</span>`;
}

export function refreshAmtPnl(items) {
  let anyUpdated = false;
  items.forEach(item => {
    if (!item || item.error || item.latest_close == null) return;
    const c      = item.code_c;
    const shares = getShares(c);
    const cost   = getCost(c);
    if (shares > 0) {
      const curVal = Math.round(shares * item.latest_close);
      _mktVal[c] = curVal;          // 数据填充不依赖 DOM
      anyUpdated = true;
      const inp = document.getElementById(`mdtfr-amt-input-${c}`);
      if (inp && cost > 0) {
        // 颜色：涨红跌绿不变白（A股惯例）
        inp.style.color = curVal > cost ? 'var(--red)' : curVal < cost ? 'var(--green)' : '';
      }
    } else {
      const inp = document.getElementById(`mdtfr-amt-input-${c}`);
      if (inp) inp.style.color = '';
    }
  });
  if (anyUpdated) {
    refreshAllPosPct();
    _updateTotalLabel();
    emit('pnl:refresh');
    if (_lastMdtfrItems) emit('advice:render', _lastMdtfrItems);
  }
}

export {
  loadAmounts, saveAmounts,
  getAmt, getDynAmt, setAmt, setAmts, getSumOfPositions,
  getPosVal, refreshAllPosPct, onAmtChange, clearAmt,
  mkAmtCell, mkDisabledAmtCell, mkPosPct,
  _getRawKey, _setRawKey,
};
/** 供 advice.js 回写最新标的列表 */
export function setLastMdtfrItems(items) { _lastMdtfrItems = items; }
/** 供 journal.js / trade-confirm.js 读取最新标的列表 */
export function getLastMdtfrItems() { return _lastMdtfrItems; }
/** 判断指定标的是否已加载动态市值（用于避免成本=市值时误显示收益为0） */
export function hasMktVal(code_c) { return code_c in _mktVal; }

register('getLastItems', () => _lastMdtfrItems);
on('available:refresh', refreshAllPosPct);
