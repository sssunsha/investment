# MDTFR 资金管理与交易确认 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MDTFR 策略页面新增可用金额输入与总金额展示、买卖操作的确认/撤销按钮，以及页面刷新后从 journal 文件恢复持仓的能力。

**Architecture:** 扩展 `amounts.js`（增加 `_rawData` 层、`getSumOfPositions`、`setTotalAmtGetter` 注入点），新建 `available.js`（管理可用金额、`getTotalAmt()`、持仓回溯），新建 `trade-confirm.js`（确认/撤销逻辑与会话级快照），更新 `advice.js`/`journal.js`/`main.js` 以接入新模块。不新增后端接口，复用现有 `/api/cache/amounts` 和 `/api/cache/journal`。

**Tech Stack:** 原生 ES Module（无构建工具），FastAPI + Python，`~/.investment/` JSON 文件存储，uvicorn 9001 端口。

---

## 文件结构总览

| 路径 | 操作 | 职责说明 |
|------|------|---------|
| `js/mdtfr/amounts.js` | Modify | 增加 `_rawData`、`_getRawKey/_setRawKey`、`getSumOfPositions`、`setAmts`、`clearAmt`、`setTotalAmtGetter`；移除 `getTotalAmt()` |
| `js/mdtfr/available.js` | **Create** | 管理可用金额内存状态；暴露 `getTotalAmt()`、`refreshTotalDisplay()`、`onAvailableChange()`、`recoverFromJournal()` |
| `js/mdtfr/trade-confirm.js` | **Create** | 确认/撤销交易逻辑，会话级快照，操作 DOM 按钮状态 |
| `js/mdtfr/advice.js` | Modify | 从 `available.js` 导入 `getTotalAmt()`；渲染底部确认/撤销按钮区域 |
| `js/mdtfr/journal.js` | Modify | record 中附加 `available_amt`；增加 `setPendingConfirmAnnotation()` |
| `js/main.js` | Modify | 导入新模块；注入所有跨模块回调；挂载 `onAvailableChange/confirmTrade/undoTrade/clearAmt` 到 `window`；初始化 `loadAvailable` 和持仓回溯 |
| `strategy_page.html` | Modify | MDTFR section-head 内插入可用金额输入行 |
| `css/mdtfr.css` | Modify | 新增可用金额输入框、总金额标签、确认/撤销按钮、清零按钮样式 |

---

## Task 1: 扩展 `amounts.js` — 原始数据层 + 新导出

**Files:**
- Modify: `js/mdtfr/amounts.js`

- [ ] **Step 1: 用完整重写替换 `amounts.js`**

将 `js/mdtfr/amounts.js` 替换为以下完整内容（核心变更：增加 `_rawData` 存储原始 JSON 含 `__available__`；`saveAmounts` 合并 `__available__` 键；移除 `getTotalAmt`；增加 `getSumOfPositions`、`setAmts`、`clearAmt`、`setTotalAmtGetter`、`_getRawKey`、`_setRawKey`）：

```js
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
  Object.entries(obj).forEach(([k, v]) => { _amt[k] = parseFloat(v) || 0; });
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
  saveAmounts();
  refreshAllPosPct();
  if (_getTotalAmtFn) {
    const totalEl = document.getElementById('mdtfr-total-amt');
    if (totalEl) {
      const t = _getTotalAmtFn();
      totalEl.textContent = t > 0 ? `总金额：¥${t.toLocaleString()}` : '';
    }
  }
  // 同步清空输入框 value
  const inp = document.querySelector(`.amt-input[data-code="${code_c}"]`);
  if (inp) { inp.value = ''; inp.dataset.held = false; }
  if (_lastMdtfrItems && _adviceRenderer) _adviceRenderer(_lastMdtfrItems);
}

/** 生成金额输入框 + 清零按钮（输出 HTML 字符串） */
function mkAmtCell(code_c) {
  const v = getAmt(code_c);
  const held = v > 0;
  return `<div style="display:flex;gap:4px;align-items:center">
    <input class="amt-input" type="number" min="0" step="1000"
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
```

- [ ] **Step 2: 启动服务器，验证 amounts.js 语法正确**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
node --input-type=module < js/mdtfr/amounts.js 2>&1 | head -5
```

期望输出：无报错（或仅有 `fetch is not defined` 之类的运行时错误，语法错误才是真正问题）。

- [ ] **Step 3: Commit**

```bash
git add js/mdtfr/amounts.js
git commit -m "refactor(amounts): 增加 _rawData 层、getSumOfPositions、setTotalAmtGetter、clearAmt，移除 getTotalAmt"
```

---

## Task 2: 新建 `js/mdtfr/available.js`

**Files:**
- Create: `js/mdtfr/available.js`

- [ ] **Step 1: 创建文件**

```js
// js/mdtfr/available.js
// 可用金额管理：加载、保存、总金额计算、UI 刷新、持仓回溯恢复
import {
  getSumOfPositions, setAmts, saveAmounts,
  _getRawKey, _setRawKey,
} from './amounts.js';

let _available = 0;  // 可用金额（元）

// 注入 showToast 和 refreshAllPosPct（main.js 负责，避免循环依赖）
let _showToastFn = null;
let _refreshPosFn = null;
let _adviceRenderer = null;
let _lastItemsGetter = null;
export function setAvailableToastFn(fn)    { _showToastFn = fn; }
export function setAvailableRefreshFn(fn)  { _refreshPosFn = fn; }
export function setAvailableAdviceRenderer(fn) { _adviceRenderer = fn; }
export function setAvailableItemsGetter(fn)    { _lastItemsGetter = fn; }

/** 加载可用金额（必须在 loadAmounts() 之后调用，共享同一次 GET 响应） */
async function loadAvailable() {
  const v = _getRawKey('__available__');
  _available = parseFloat(v || 0) || 0;
}

/** 持久化：将 __available__ 写入 _rawData，然后 saveAmounts 合并写入 */
async function saveAvailable() {
  _setRawKey('__available__', _available);
  await saveAmounts();
}

/** 同时保存持仓金额和可用金额（持仓回溯恢复时使用） */
async function saveAll() {
  _setRawKey('__available__', _available);
  await saveAmounts();
}

function getAvailableAmt() { return _available; }
function setAvailableAmt(v) { _available = parseFloat(v) || 0; }

/** 总金额 = 可用金额 + 各标的持仓之和 */
function getTotalAmt() {
  return _available + getSumOfPositions();
}

/** 刷新页面上的总金额标签和可用金额输入框 */
function refreshTotalDisplay() {
  const total = getTotalAmt();
  const totalEl = document.getElementById('mdtfr-total-amt');
  if (totalEl) totalEl.textContent = total > 0 ? `总金额：¥${total.toLocaleString()}` : '总金额：¥0';
  const inp = document.getElementById('mdtfr-available-input');
  if (inp && document.activeElement !== inp) {
    inp.value = _available > 0 ? _available : '';
  }
}

/** 可用金额输入框 oninput 回调 */
async function onAvailableChange(val) {
  _available = parseFloat(val) || 0;
  await saveAvailable();
  refreshTotalDisplay();
  if (_refreshPosFn) _refreshPosFn();
  if (_lastItemsGetter && _adviceRenderer) {
    const items = _lastItemsGetter();
    if (items) _adviceRenderer(items);
  }
}

/**
 * 当 amounts.json 完全为空时，从 journal 向前回溯恢复持仓。
 * 最多回溯 6 个月，找到第一条含非空 holdings[] 的 journal 记录。
 */
async function recoverFromJournal() {
  const today = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = d.getFullYear().toString();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    try {
      const res = await fetch(`/api/cache/journal/${year}/${month}`);
      if (!res.ok) continue;
      const records = await res.json();
      if (!Array.isArray(records) || records.length === 0) continue;
      const sorted = [...records].sort((a, b) =>
        (b.data_date || '').localeCompare(a.data_date || ''));
      const rec = sorted.find(r => Array.isArray(r.holdings) && r.holdings.length > 0);
      if (!rec) continue;
      // 恢复各标的持仓
      const amtsObj = {};
      rec.holdings.forEach(h => { if (h.code_c) amtsObj[h.code_c] = h.amt || 0; });
      setAmts(amtsObj);
      _available = parseFloat(rec.available_amt || 0) || 0;
      await saveAll();
      refreshTotalDisplay();
      if (_refreshPosFn) _refreshPosFn();
      if (_showToastFn) _showToastFn(`已从 ${rec.data_date} 的复盘记录恢复持仓`, 'var(--cyan)');
      return true;
    } catch {}
  }
  return false;
}

export {
  loadAvailable, saveAvailable, saveAll,
  getAvailableAmt, setAvailableAmt,
  getTotalAmt, refreshTotalDisplay,
  onAvailableChange, recoverFromJournal,
};
```

- [ ] **Step 2: 语法检查**

```bash
node --input-type=module < js/mdtfr/available.js 2>&1 | head -5
```

期望：无语法错误（运行时 fetch/document 错误可忽略）。

- [ ] **Step 3: Commit**

```bash
git add js/mdtfr/available.js
git commit -m "feat(available): 新建可用金额管理模块，含 getTotalAmt 和持仓回溯恢复"
```

---

## Task 3: 新建 `js/mdtfr/trade-confirm.js`

**Files:**
- Create: `js/mdtfr/trade-confirm.js`

- [ ] **Step 1: 创建文件**

```js
// js/mdtfr/trade-confirm.js
// 交易确认/撤销逻辑，维护会话级快照（页面刷新后消失）
import { getLastAdviceData } from './advice.js';
import {
  getAmt, setAmt, setAmts, saveAmounts,
  getSumOfPositions, refreshAllPosPct,
  getLastMdtfrItems,
} from './amounts.js';
import {
  getAvailableAmt, setAvailableAmt, saveAvailable,
  getTotalAmt, refreshTotalDisplay,
} from './available.js';
import { setPendingConfirmAnnotation } from './journal.js';
import { getMdtfrPoolDef } from './config.js';

// 会话级快照（仅内存，刷新后消失）
let _snapshot = null;

// 注入 advice 渲染函数（main.js 负责，避免循环依赖）
let _adviceRerenderer = null;
export function setAdviceRerenderer(fn) { _adviceRerenderer = fn; }

export function hasSnapshot() { return _snapshot !== null; }

/** 确认执行当前操作建议 */
export async function confirmTrade() {
  const advice = getLastAdviceData();
  if (!advice) return;

  if (getTotalAmt() === 0) {
    alert('请先在顶部输入可用金额，再确认执行。');
    return;
  }

  const { sellRows = [], buyRows = [] } = advice;

  // 保存快照（用于撤销）
  const amtSnapshot = {};
  const pool = getMdtfrPoolDef();
  pool.forEach(d => { amtSnapshot[d.code_c] = getAmt(d.code_c); });
  _snapshot = {
    amts: amtSnapshot,
    available: getAvailableAmt(),
    sellRows: sellRows.map(r => ({ ...r })),
    buyRows:  buyRows.map(r => ({ ...r })),
  };

  // 应用金额变更
  sellRows.forEach(row => {
    if (!row.watch || true) {  // watch 行也执行
      const code = row.from === '货币基金' ? null
        : (pool.find(d => d.name === row.from)?.code_c || null);
      if (code) setAmt(code, Math.max(0, getAmt(code) - row.amt));
      setAvailableAmt(getAvailableAmt() + row.amt);
    }
  });
  buyRows.forEach(row => {
    const code = row.toCode || (pool.find(d => d.name === row.to)?.code_c || null);
    if (code) setAmt(code, getAmt(code) + row.amt);
    setAvailableAmt(Math.max(0, getAvailableAmt() - row.amt));
  });

  // 持久化
  await saveAmounts();
  await saveAvailable();

  // 构建交易记录（注解 journal）
  const tradeRecords = [
    ...sellRows.map(r => ({ type: 'sell', name: r.from, amt: r.amt, watch: !!r.watch, note: r.note })),
    ...buyRows.map(r => ({ type: 'buy', name: r.to, code_c: r.toCode, amt: r.amt, note: r.note })),
  ];
  setPendingConfirmAnnotation({
    confirmed_at: new Date().toISOString(),
    trade_records: tradeRecords,
  });

  // 刷新 UI（重渲 advice 会触发 journal 自动保存）
  refreshAllPosPct();
  refreshTotalDisplay();
  const items = getLastMdtfrItems();
  if (items && _adviceRerenderer) _adviceRerenderer(items);

  // 更新按钮状态（重渲后 DOM 已重建，需重新获取）
  const confirmBtn = document.getElementById('mdtfr-confirm-btn');
  const undoBtn    = document.getElementById('mdtfr-undo-btn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '✅ 已执行 ✓'; }
  if (undoBtn)    undoBtn.style.display = '';
}

/** 撤销最近一次确认 */
export async function undoTrade() {
  if (!_snapshot) return;
  const { amts, available } = _snapshot;

  setAmts(amts);
  setAvailableAmt(available);
  await saveAmounts();
  await saveAvailable();

  _snapshot = null;

  // 重渲 advice（不带 annotation → journal 保存无 confirmed_at/trade_records）
  refreshAllPosPct();
  refreshTotalDisplay();
  const items = getLastMdtfrItems();
  if (items && _adviceRerenderer) _adviceRerenderer(items);
  // 按钮恢复由重渲初始化（confirm 可用，undo 隐藏）
}
```

- [ ] **Step 2: 语法检查**

```bash
node --input-type=module < js/mdtfr/trade-confirm.js 2>&1 | head -5
```

- [ ] **Step 3: Commit**

```bash
git add js/mdtfr/trade-confirm.js
git commit -m "feat(trade-confirm): 新建交易确认/撤销模块，含会话级快照"
```

---

## Task 4: 更新 `js/mdtfr/journal.js` — 附加 `available_amt` 和 `setPendingConfirmAnnotation`

**Files:**
- Modify: `js/mdtfr/journal.js`

- [ ] **Step 1: 在文件顶部 import 区增加 `getAvailableAmt` 导入**

在 [journal.js:4-6](js/mdtfr/journal.js#L4-L6) 现有三行 import 后新增：

```js
import { getAvailableAmt } from './available.js';
```

- [ ] **Step 2: 在 import 之后增加 `_pendingAnnotation` 变量和导出函数**

在 [journal.js:8](js/mdtfr/journal.js#L8)（`async function saveJournalRecord` 之前）插入：

```js
// 供 trade-confirm.js 注入确认注解（confirmed_at + trade_records）
let _pendingAnnotation = null;
export function setPendingConfirmAnnotation(data) { _pendingAnnotation = data; }
```

- [ ] **Step 3: 在 `saveJournalRecord` 的 record 对象中增加 `available_amt` 和 annotation**

找到 [journal.js:13-27](js/mdtfr/journal.js#L13-L27) 的 `record` 对象定义，替换为：

```js
  const record = {
    saved_at:    new Date().toISOString(),
    data_date:   _lastMdtfrItems.find(x => x.latest_date)?.latest_date || today,
    ..._lastAdviceData,
    available_amt: getAvailableAmt(),
    ...(_pendingAnnotation || {}),
    pool_snapshot: _lastMdtfrItems
      .filter(x => !x.error && x.ret_20d != null)
      .map(x => ({
        name: x.name, code_c: x.code_c, group: x.group,
        latest_close: x.latest_close, ret_20d: x.ret_20d,
        above_ma20: x.above_ma20, ma60: x.ma60, ma20: x.ma20,
        ma60_trend: x.ma60_trend, ma60_rate: x.ma60_rate,
        rank: x.rank,
      })),
    watch_snapshot: getWatchState().map(w => ({ ...w })),
  };
  _pendingAnnotation = null;  // 使用后立即清空
```

- [ ] **Step 4: 浏览器验证语法（uvicorn 已启动时）**

```bash
curl -s http://localhost:9001/js/mdtfr/journal.js | head -5
```

期望：返回 JS 文件内容（HTTP 200），无 500 错误。

- [ ] **Step 5: Commit**

```bash
git add js/mdtfr/journal.js
git commit -m "feat(journal): record 附加 available_amt，支持 setPendingConfirmAnnotation"
```

---

## Task 5: 更新 `js/mdtfr/advice.js` — 使用新 `getTotalAmt` + 确认/撤销按钮

**Files:**
- Modify: `js/mdtfr/advice.js`

- [ ] **Step 1: 修改 import 行**

将 [advice.js:4](js/mdtfr/advice.js#L4) 的：

```js
import { getAmt, getTotalAmt, getPosVal, setLastMdtfrItems } from './amounts.js';
```

替换为：

```js
import { getAmt, getPosVal, setLastMdtfrItems } from './amounts.js';
import { getTotalAmt } from './available.js';
```

- [ ] **Step 2: 在 `mdtfrRenderAdvice` 函数末尾（`body.innerHTML = ...` 赋值之后，`card.style.display = ''` 之前）插入确认/撤销按钮 HTML 生成逻辑**

在 [advice.js:474](js/mdtfr/advice.js#L474)（`body.innerHTML = \`...\`` 赋值行）之后、[advice.js:487](js/mdtfr/advice.js#L487)（`card.style.display = ''`）之前，插入：

```js
  // ── 确认/撤销按钮（仅 buy/sell/swap 时显示）────────────────────
  const needsTradeAction = ['buy', 'sell', 'swap'].includes(finalType);
  const noCapital = getTotalAmt() === 0;
  const tradeActionsHtml = needsTradeAction ? `
    <div id="mdtfr-trade-actions" style="padding:12px 20px 16px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button id="mdtfr-confirm-btn" class="btn-trade-confirm"
        onclick="confirmTrade()" ${noCapital ? 'disabled title="请先在顶部输入可用金额"' : ''}>
        ✅ 确认执行
      </button>
      <button id="mdtfr-undo-btn" class="btn-trade-undo"
        onclick="undoTrade()" style="display:none">
        ↺ 撤销
      </button>
      ${noCapital ? '<span style="font-size:12px;color:var(--red)">⚠ 请先在顶部输入可用金额</span>' : ''}
    </div>` : '';

  body.innerHTML = body.innerHTML + tradeActionsHtml;
```

注意：此处将按钮区域 **追加** 到 `body.innerHTML` 末尾（不替换），因为 `body.innerHTML` 在前一步已完整赋值。

实际操作：找到 [advice.js:486](js/mdtfr/advice.js#L486) 的 `card.style.display = '';` 这一行，在它之前插入上述代码块。

- [ ] **Step 3: 浏览器中打开 http://localhost:9001/strategy#mdtfr，加载数据后检查建议卡片底部**

期望：`buy/sell/swap` 场景下出现「✅ 确认执行」按钮；`hold/wait/watch` 场景下无按钮。

- [ ] **Step 4: Commit**

```bash
git add js/mdtfr/advice.js
git commit -m "feat(advice): 使用 available.js 的 getTotalAmt，底部渲染确认/撤销按钮"
```

---

## Task 6: 更新 `strategy_page.html` — 插入可用金额输入行

**Files:**
- Modify: `strategy_page.html`

- [ ] **Step 1: 在 MDTFR section-head 中，`mdtfr-last-updated` span 之前插入可用金额输入行**

找到 [strategy_page.html:147-148](strategy_page.html#L147-L148)：

```html
        <span id="mdtfr-total-amt" style="font-size:13px;font-weight:700;color:var(--yellow);margin-left:12px"></span>
        <span id="mdtfr-last-updated" style="font-size:13px;color:var(--text-dim);margin-left:8px;flex:1"></span>
```

替换为：

```html
        <span id="mdtfr-total-amt" style="font-size:13px;font-weight:700;color:var(--yellow);margin-left:12px">总金额：¥0</span>
        <span id="mdtfr-last-updated" style="font-size:13px;color:var(--text-dim);margin-left:8px;flex:1"></span>
        <span class="available-input-wrap">
          <label class="available-label">可用金额(元)：</label>
          <input id="mdtfr-available-input" class="available-input" type="number" min="0" step="1000"
            placeholder="0" oninput="onAvailableChange(this.value)">
        </span>
```

- [ ] **Step 2: 刷新页面，检查 section-head 中出现可用金额输入框**

```bash
curl -s http://localhost:9001/strategy | grep 'mdtfr-available-input'
```

期望：输出包含 `mdtfr-available-input`。

- [ ] **Step 3: Commit**

```bash
git add strategy_page.html
git commit -m "feat(html): MDTFR 面板顶部新增可用金额输入框"
```

---

## Task 7: 更新 `css/mdtfr.css` — 新增样式

**Files:**
- Modify: `css/mdtfr.css`

- [ ] **Step 1: 在 `css/mdtfr.css` 末尾追加以下样式**

```css
  /* ── 可用金额输入行 ── */
  .available-input-wrap {
    display: flex; align-items: center; gap: 6px;
    background: rgba(245,158,11,.08); border: 1px solid rgba(245,158,11,.25);
    border-radius: 8px; padding: 5px 12px;
  }
  .available-label { font-size: 12px; color: var(--yellow); font-weight: 600; white-space: nowrap; }
  .available-input {
    background: transparent; border: none; color: var(--yellow);
    font-size: 14px; font-weight: 700; font-family: inherit;
    width: 120px; outline: none;
  }
  .available-input::placeholder { color: rgba(245,158,11,.4); }
  .available-input::-webkit-inner-spin-button,
  .available-input::-webkit-outer-spin-button { opacity: .4; }

  /* ── 持仓清零按钮（表格内） ── */
  .amt-clear-btn {
    background: transparent; border: 1px solid rgba(255,255,255,.15);
    color: var(--text-dim); padding: 1px 6px; border-radius: 4px;
    font-size: 13px; cursor: pointer; line-height: 1; flex-shrink: 0;
    transition: background .15s, border-color .15s, color .15s;
  }
  .amt-clear-btn:hover { background: rgba(239,68,68,.15); border-color: var(--red); color: var(--red); }

  /* ── 确认/撤销按钮 ── */
  .btn-trade-confirm {
    background: rgba(34,197,94,.12); border: 1px solid rgba(34,197,94,.4);
    color: var(--green); padding: 7px 18px; border-radius: 7px;
    font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit;
    transition: background .15s, border-color .15s;
  }
  .btn-trade-confirm:hover:not(:disabled) {
    background: rgba(34,197,94,.22); border-color: var(--green);
  }
  .btn-trade-confirm:disabled {
    opacity: .7; cursor: not-allowed; background: rgba(34,197,94,.06);
  }
  .btn-trade-undo {
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.2);
    color: var(--text-dim); padding: 7px 16px; border-radius: 7px;
    font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
    transition: background .15s, border-color .15s, color .15s;
  }
  .btn-trade-undo:hover { background: rgba(245,158,11,.1); border-color: var(--yellow); color: var(--yellow); }
```

- [ ] **Step 2: 浏览器刷新，确认新样式生效**

```bash
curl -s http://localhost:9001/css/mdtfr.css | grep 'available-input-wrap'
```

期望：返回 `.available-input-wrap` 样式规则。

- [ ] **Step 3: Commit**

```bash
git add css/mdtfr.css
git commit -m "feat(css): 新增可用金额输入框、清零按钮、确认/撤销按钮样式"
```

---

## Task 8: 更新 `js/main.js` — 导入新模块，注入所有回调，初始化序列

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: 将 `js/main.js` 替换为以下完整内容**

```js
// js/main.js — 页面入口：import 所有模块，挂载全局函数，执行初始化

import { switchTab, initHashRouter }             from './tab.js';
import { initRebalanceDayStyle }                  from './rebalance-day.js';
import { buildInputs, toggleAwAlt }               from './aw/inputs.js';
import {
  calcRebalance, resetCalc,
  selectCheckType, closeCheckTypePicker, confirmCheckType,
} from './aw/calc.js';
import { renderLog, saveToLog, deleteLog, clearLog } from './aw/log.js';
import {
  openAwJournal, closeAwJournal, loadAwJournal,
  saveAwJournalRecord, showAwToast,
} from './aw/journal.js';
import { openDrawer, closeDrawer }                from './aw/drawer.js';
import { loadMdtfrPool, toggleMdtfrSort, clearAndResetMdtfr } from './mdtfr/loader.js';
import { showConfirm, closeConfirm }              from './mdtfr/confirm.js';
import { openPoolAdjust, closePoolAdjust, applyPoolAdjust } from './mdtfr/pool-adjust.js';
import {
  toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug,
} from './mdtfr/debug.js';
import { openJournal, closeJournal, loadJournal, saveJournalRecord, showToast } from './mdtfr/journal.js';
import { mdtfrRenderAdvice, setJournalSaver }     from './mdtfr/advice.js';
import {
  setAdviceRenderer, loadAmounts, refreshAllPosPct,
  onAmtChange, clearAmt, setTotalAmtGetter,
  setLastMdtfrItems, getLastMdtfrItems, getSumOfPositions,
} from './mdtfr/amounts.js';

// ── 连接跨模块回调（避免循环依赖）────────────────────────────────
setJournalSaver(saveJournalRecord);           // advice → journal（自动复盘保存）
setAdviceRenderer(mdtfrRenderAdvice);         // amounts → advice（金额变化时重渲建议）
setTotalAmtGetter(getTotalAmt);               // amounts.refreshAllPosPct 使用完整总金额
setAdviceRerenderer(mdtfrRenderAdvice);       // trade-confirm → advice
setAvailableToastFn(showToast);               // available.recoverFromJournal 提示
setAvailableRefreshFn(refreshAllPosPct);      // available.onAvailableChange 刷新仓位
setAvailableAdviceRenderer(mdtfrRenderAdvice);// available.onAvailableChange 重渲建议
setAvailableItemsGetter(getLastMdtfrItems);   // available 获取最新标的列表

// ── 挂载 HTML onclick 需要的全局函数 ──────────────────────────
Object.assign(window, {
  // 通用
  switchTab, openDrawer, closeDrawer,
  // AW 再平衡
  calcRebalance, resetCalc, toggleAwAlt,
  selectCheckType, closeCheckTypePicker, confirmCheckType,
  saveToLog, deleteLog, clearLog,
  // AW 复盘
  saveAwJournalRecord, showAwToast,
  openAwJournal, closeAwJournal, loadAwJournal,
  // MDTFR
  loadMdtfrPool, toggleMdtfrSort,
  clearMdtfrCache: clearAndResetMdtfr,
  clearAndResetMdtfr,
  showConfirm, closeConfirm,
  openPoolAdjust, closePoolAdjust, applyPoolAdjust,
  toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug,
  openJournal, closeJournal, loadJournal,
  // 金额管理
  onAmtChange, clearAmt,
  onAvailableChange,
  // 交易确认/撤销
  confirmTrade, undoTrade,
});

// ── 页面初始化 ──────────────────────────────────────────────
buildInputs();
renderLog();
initRebalanceDayStyle();

// 异步初始化序列：loadAmounts → loadAvailable → 持仓回溯（若需要）→ 刷新 UI
(async () => {
  await loadAmounts();
  await loadAvailable();

  // 若持仓和可用金额均为 0，尝试从 journal 回溯恢复
  if (getSumOfPositions() === 0 && getAvailableAmt() === 0) {
    await recoverFromJournal();
  }

  refreshTotalDisplay();
  refreshAllPosPct();

  initHashRouter();  // 处理 #aw / #mdtfr hash 路由（含 mdtfrMaybeInitEmpty 调用）
})();
```

**注意：** 原来的 `loadAmounts()` 调用和 `initHashRouter()` 移入 async IIFE，确保加载顺序正确。

- [ ] **Step 2: 浏览器打开 http://localhost:9001/strategy 确认页面无 JS 错误**

打开浏览器开发者工具 Console 面板，刷新页面，确认：
- 无红色错误
- 可切换 tab（`#aw` / `#mdtfr` hash 路由正常）

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat(main): 接入 available.js 和 trade-confirm.js，异步初始化含持仓回溯"
```

---

## Task 9: 端到端验证

**Files:** 无代码改动，仅验证步骤。

- [ ] **Step 1: 启动服务器**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
uvicorn main:app --reload --port 9001
```

- [ ] **Step 2: 验证可用金额输入与总金额显示**

1. 打开 http://localhost:9001/strategy#mdtfr
2. 在顶部「可用金额」输入框填入 `100000`
3. 期望：「总金额：¥100,000」标签更新
4. 刷新页面，期望：可用金额输入框仍显示 100000（已持久化）

- [ ] **Step 3: 验证各标的持仓百分比以总金额为基准**

1. 在「中证500」行金额输入框填入 `30000`
2. 期望：持仓情况列显示 `23.1%`（30000 / 130000）
3. 总金额标签更新为「总金额：¥130,000」

- [ ] **Step 4: 验证清零按钮**

1. 点击「中证500」行的 `×` 按钮
2. 期望：金额输入框清空，持仓比例显示「–」，总金额恢复为 ¥100,000

- [ ] **Step 5: 验证确认/撤销按钮（需要有操作建议）**

1. 设置可用金额 100000（空仓）
2. 点击「▶ 加载数据」等待行情加载完毕
3. 若建议卡片出现「买入」操作，期望底部有「✅ 确认执行」按钮
4. 点击确认，期望：
   - 按钮变为「✅ 已执行 ✓」且禁用
   - 「↺ 撤销」按钮出现
   - 对应标的金额输入框更新
   - 可用金额减少
5. 点击撤销，期望：
   - 金额恢复原值
   - 「✅ 确认执行」按钮恢复可用
   - 「↺ 撤销」按钮隐藏

- [ ] **Step 6: 验证 journal 记录含 available_amt 和 confirmed_at**

```bash
cat ~/.investment/$(date +%Y)/$(date +%m)/mdtfr_journal.json | python3 -m json.tool | grep -A2 '"available_amt"'
```

期望：输出包含 `available_amt` 字段；执行确认后再检查，应出现 `confirmed_at` 和 `trade_records` 字段。

- [ ] **Step 7: 验证持仓回溯（删除 amounts.json 后重新加载）**

```bash
rm ~/.investment/mdtfr_amounts.json
```

刷新页面，期望：持仓和可用金额从最近的 journal 记录中恢复，并显示 toast 提示「已从 YYYY-MM-DD 的复盘记录恢复持仓」。

- [ ] **Step 8: 最终 Commit（若有未提交的验证性小修复）**

```bash
git status
# 若有改动：
git add <修改的文件>
git commit -m "fix: 端到端验证发现的小问题修复"
```

---

## 依赖关系总览

```
main.js
  ├── available.js ──→ amounts.js (getSumOfPositions, _getRawKey, _setRawKey, setAmts, saveAmounts)
  ├── amounts.js
  ├── trade-confirm.js ──→ advice.js (getLastAdviceData)
  │                   ──→ amounts.js (getAmt, setAmt, setAmts, saveAmounts, getLastMdtfrItems, refreshAllPosPct)
  │                   ──→ available.js (getAvailableAmt, setAvailableAmt, saveAvailable, getTotalAmt, refreshTotalDisplay)
  │                   ──→ journal.js (setPendingConfirmAnnotation)
  ├── advice.js ──→ available.js (getTotalAmt)
  │            ──→ amounts.js (getAmt, getPosVal, setLastMdtfrItems)
  └── journal.js ──→ available.js (getAvailableAmt)
                 ──→ amounts.js (getLastMdtfrItems)
                 ──→ advice.js (getLastAdviceData)
```

无循环依赖。所有跨模块回调通过 `main.js` 的 `set*` 注入函数连接。
