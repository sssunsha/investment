// js/mdtfr/amounts.js
// 持仓金额管理：加载、保存、查询、刷新仓位百分比、渲染单元格
import { getMdtfrPoolDef } from './config.js';

// _amt[code_c] = 金额数值（0 = 未持仓）
const _amt = {};

// 缓存最近一次 mdtfrRenderAdvice 调用的标的列表，金额变化时重新渲染建议
let _lastMdtfrItems = null;

async function loadAmounts() {
  try {
    const res = await fetch('/api/cache/amounts');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        Object.assign(_amt, data);
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
    await fetch('/api/cache/amounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_amt),
    });
  } catch {}
}

/** 获取指定标的的持仓金额 */
function getAmt(code_c) { return parseFloat(_amt[code_c] || 0) || 0; }

/** 计算所有标的总金额 */
function getTotalAmt() {
  return getMdtfrPoolDef().reduce((s, d) => s + getAmt(d.code_c), 0);
}

/**
 * 仓位百分比（0~100，保留1位小数）
 * 总金额为0时返回0
 */
function getPosVal(code_c) {
  const total = getTotalAmt();
  if (total <= 0) return 0;
  return Math.round(getAmt(code_c) / total * 1000) / 10;
}

/** 更新所有行的持仓百分比展示（金额变化时全局刷新） */
function refreshAllPosPct() {
  const total = getTotalAmt();
  // 更新表格标题的总持仓市值
  const totalEl = document.getElementById('mdtfr-total-amt');
  if (totalEl) {
    totalEl.textContent = total > 0 ? `总持仓市值：¥${total.toLocaleString()}` : '';
  }
  getMdtfrPoolDef().forEach(d => {
    const pct = getPosVal(d.code_c);
    // 更新仓位百分比 td
    const td = document.getElementById(`mdtfr-pos-${d.code_c}`);
    if (td) {
      const el = td.querySelector('.pos-pct');
      if (el) {
        el.textContent = pct > 0 ? pct.toFixed(1) + '%' : '–';
        el.dataset.held = pct > 0;
      }
    }
    // 同步输入框高亮
    const inp = document.querySelector(`.amt-input[data-code="${d.code_c}"]`);
    if (inp) inp.dataset.held = pct > 0;
  });
}

/** 金额变化时触发 */
function onAmtChange(code_c, val) {
  const v = parseFloat(val) || 0;
  _amt[code_c] = v > 0 ? v : 0;
  saveAmounts();  // 异步持久化到后端 /api/cache/amounts
  refreshAllPosPct();
  // TODO: 在 advice.js 提取后，替换为 import { mdtfrRenderAdvice } from './advice.js'
  if (_lastMdtfrItems) window.mdtfrRenderAdvice?.(_lastMdtfrItems);
}

/** 生成金额输入框（仅输入框，仓位百分比在独立的 td 中） */
function mkAmtCell(code_c) {
  const v = getAmt(code_c);
  const held = v > 0;
  return `<input class="amt-input" type="number" min="0" step="1000"
    data-code="${code_c}" data-held="${held}"
    value="${v > 0 ? v : ''}" placeholder="0"
    oninput="onAmtChange('${code_c}',this.value)"
  />`;
}

/** 生成仓位百分比展示（独立 td 内容） */
function mkPosPct(code_c) {
  const pct = getPosVal(code_c);
  const held = pct > 0;
  return `<span class="pos-pct" data-code="${code_c}" data-held="${held}">${pct > 0 ? pct.toFixed(1) + '%' : '–'}</span>`;
}

export {
  loadAmounts, saveAmounts, getAmt, getTotalAmt,
  getPosVal, refreshAllPosPct, onAmtChange, mkAmtCell, mkPosPct,
  setLastMdtfrItems,
};

/** 供 advice.js 回写最新标的列表（金额变化时重新渲染建议用） */
export function setLastMdtfrItems(items) { _lastMdtfrItems = items; }
