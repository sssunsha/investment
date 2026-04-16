// js/mdtfr/amounts.js
// 持仓金额管理：加载、保存、查询、刷新仓位百分比、渲染单元格
import { getMdtfrPoolDef } from './config.js';

// _rawData：服务端返回的原始 JSON（含 __available__ 及所有 code_c 键）
const _rawData = {};
// _amt[code_c] = 金额数值（0 = 未持仓），仅含非 __ 前缀键
const _amt = {};

// 缓存最近一次 mdtfrRenderAdvice 调用的标的列表，金额变化时重新渲染建议
let _lastMdtfrItems = null;

// 供 main.js 注入，避免 amounts → advice 循环依赖
let _adviceRenderer = null;
export function setAdviceRenderer(cb) { _adviceRenderer = cb; }

// 供 main.js 注入 available.js 的 getTotalAmt()，避免循环依赖
let _getTotalAmtFn = null;
export function setTotalAmtGetter(fn) { _getTotalAmtFn = fn; }

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
  return getMdtfrPoolDef().reduce((s, d) => s + getAmt(d.code_c), 0);
}

/** 仓位百分比（以 getTotalAmt 为分母；未注入时退化为持仓之和）*/
function getPosVal(code_c) {
  const total = _getTotalAmtFn ? _getTotalAmtFn() : getSumOfPositions();
  if (total <= 0) return 0;
  return Math.round(getAmt(code_c) / total * 1000) / 10;
}

/** 更新所有行的持仓百分比展示 + 总金额标签 */
function refreshAllPosPct() {
  const total = _getTotalAmtFn ? _getTotalAmtFn() : getSumOfPositions();
  getMdtfrPoolDef().forEach(d => {
    const pct = total > 0 ? Math.round(getAmt(d.code_c) / total * 1000) / 10 : 0;
    const td = document.getElementById(`mdtfr-pos-${d.code_c}`);
    if (td) {
      const el = td.querySelector('.pos-pct');
      if (el) { el.textContent = pct > 0 ? pct.toFixed(1) + '%' : '–'; el.dataset.held = pct > 0; }
    }
    const inp = document.querySelector(`.amt-input[data-code="${d.code_c}"]`);
    if (inp) inp.dataset.held = pct > 0;
  });
}

/** 金额输入框变化时触发 */
function onAmtChange(code_c, val) {
  setAmt(code_c, val);
  saveAmounts();
  refreshAllPosPct();
  if (_getTotalAmtFn) {
    const totalEl = document.getElementById('mdtfr-total-amt');
    if (totalEl) {
      const t = _getTotalAmtFn();
      totalEl.textContent = t > 0 ? `总金额：¥${t.toLocaleString()}` : '';
    }
  }
  if (_lastMdtfrItems && _adviceRenderer) _adviceRenderer(_lastMdtfrItems);
}

/** 清零指定标的持仓金额 */
function clearAmt(code_c) {
  setAmt(code_c, 0);
  setShares(code_c, 0);
  setCost(code_c, 0);
  saveAmounts();
  refreshAllPosPct();
  if (_getTotalAmtFn) {
    const totalEl = document.getElementById('mdtfr-total-amt');
    if (totalEl) {
      const t = _getTotalAmtFn();
      totalEl.textContent = t > 0 ? `总金额：¥${t.toLocaleString()}` : '';
    }
  }
  // 同步清空输入框 value，并重置盈亏颜色
  const inp = document.querySelector(`.amt-input[data-code="${code_c}"]`);
  if (inp) { inp.value = ''; inp.dataset.held = false; inp.style.color = ''; }
  if (_lastMdtfrItems && _adviceRenderer) _adviceRenderer(_lastMdtfrItems);
}

/** 生成金额输入框 + 清零按钮（输出 HTML 字符串） */
function mkAmtCell(code_c) {
  const v = getAmt(code_c);
  const held = v > 0;
  return `<div style="display:flex;gap:4px;align-items:center">
    <input class="amt-input" type="number" min="0" step="1000"
      id="mdtfr-amt-input-${code_c}"
      data-code="${code_c}" data-held="${held}"
      value="${v > 0 ? v : ''}" placeholder="0"
      oninput="onAmtChange('${code_c}',this.value)"
    />
    <button class="amt-clear-btn" onclick="clearAmt('${code_c}')" title="清零">×</button>
  </div>`;
}

/** 生成仓位百分比展示（独立 td 内容） */
function mkPosPct(code_c) {
  const total = _getTotalAmtFn ? _getTotalAmtFn() : getSumOfPositions();
  const pct = total > 0 ? Math.round(getAmt(code_c) / total * 1000) / 10 : 0;
  const held = pct > 0;
  return `<span class="pos-pct" data-code="${code_c}" data-held="${held}">${pct > 0 ? pct.toFixed(1) + '%' : '–'}</span>`;
}

export function refreshAmtPnl(items) {
  items.forEach(item => {
    if (!item || item.error || item.latest_close == null) return;
    const c      = item.code_c;
    const shares = getShares(c);
    const cost   = getCost(c);
    const inp    = document.getElementById(`mdtfr-amt-input-${c}`);
    if (!inp) return;
    if (shares > 0 && cost > 0) {
      const curVal = shares * item.latest_close;
      inp.style.color = curVal >= cost ? 'var(--green)' : 'var(--red)';
    } else {
      inp.style.color = '';
    }
  });
}

export {
  loadAmounts, saveAmounts,
  getAmt, setAmt, setAmts, getSumOfPositions,
  getPosVal, refreshAllPosPct, onAmtChange, clearAmt,
  mkAmtCell, mkPosPct,
  _getRawKey, _setRawKey,
};
/** 供 advice.js 回写最新标的列表 */
export function setLastMdtfrItems(items) { _lastMdtfrItems = items; }
/** 供 journal.js / trade-confirm.js 读取最新标的列表 */
export function getLastMdtfrItems() { return _lastMdtfrItems; }
