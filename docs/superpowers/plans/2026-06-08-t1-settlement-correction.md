# T+1 结算修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在场外 ETF T+1 结算机制下，交易确认时记录估算份额，下一个有效交易日数据加载后自动用真实净值修正份额，并在 UI 展示待结算状态徽章和详情弹窗。

**Architecture:** 将待修正记录存入 `amounts.json` 的 `__pending_corrections__` 键（与现有 `__shares__`/`__cost__` 同级）。新增 `corrections.js` 模块负责写入、执行修正、渲染状态指示器和详情弹窗。修正在 SSE 数据加载完成（`done` 事件）后触发，同步更新 `__shares__` 和 journal 历史记录。

**Tech Stack:** Vanilla JS ES modules, FastAPI (Python) 后端，本地 JSON 文件持久化，SSE 数据加载

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `js/mdtfr/corrections.js` | **新增** | 核心模块：`addPendingCorrection`、`removePendingCorrection`、`applyPendingCorrections`、状态指示器渲染、详情弹窗 |
| `js/mdtfr/amounts.js` | **修改** | 新增 `getPendingCorrections()` / `setPendingCorrections()` 读写 `__pending_corrections__` |
| `js/mdtfr/journal.js` | **修改** | 新增 `patchJournalTradeRecord(trade_date, code_c, fields)` |
| `js/mdtfr/trade-confirm.js` | **修改** | `confirmTradeRow` 成功后调用 `addPendingCorrection()` |
| `js/mdtfr/manual-sell.js` | **修改** | `_manualSellConfirm` 成功后调用 `addPendingCorrection()` |
| `js/mdtfr/loader.js` | **修改** | SSE `done` 和缓存命中路径末尾调用 `applyPendingCorrections(poolItems)` |
| `strategy_page.html` | **修改** | 新增待修正详情 overlay HTML 骨架 |

---

## Task 1: amounts.js — 新增 pending corrections 读写接口

**Files:**
- Modify: `js/mdtfr/amounts.js`

背景：`amounts.js` 的 `_rawData` 对象已保存 `__shares__`、`__cost__` 等内嵌键，`__pending_corrections__` 完全遵循同一模式。`_getRawKey`/`_setRawKey` 已有，但需要类型安全的具名 accessor。

- [ ] **Step 1: 在 amounts.js 中新增两个导出函数**

在 `amounts.js` 末尾（`export {` 之前）加入：

```js
/** 读取待修正记录列表 */
export function getPendingCorrections() {
  const v = _rawData['__pending_corrections__'];
  return Array.isArray(v) ? v : [];
}

/** 覆盖写入待修正记录列表（传空数组即清空） */
export function setPendingCorrections(list) {
  _rawData['__pending_corrections__'] = Array.isArray(list) ? list : [];
}
```

- [ ] **Step 2: 验证 saveAmounts 已覆盖 `__pending_corrections__`**

打开 `js/mdtfr/amounts.js`，找到 `saveAmounts` 函数中的 payload 构建块。当前代码：

```js
const payload = { ..._amt };
if ('__available__'    in _rawData) payload['__available__']    = _rawData['__available__'];
if ('__shares__'       in _rawData) payload['__shares__']       = _rawData['__shares__'];
if ('__cost__'         in _rawData) payload['__cost__']         = _rawData['__cost__'];
if ('__realized_pnl__' in _rawData) payload['__realized_pnl__'] = _rawData['__realized_pnl__'];
if ('__net_capital__'  in _rawData) payload['__net_capital__']  = _rawData['__net_capital__'];
if ('__capital_log__'  in _rawData) payload['__capital_log__']  = _rawData['__capital_log__'];
```

在最后一行 `__capital_log__` 之后添加一行：

```js
if ('__pending_corrections__' in _rawData) payload['__pending_corrections__'] = _rawData['__pending_corrections__'];
```

- [ ] **Step 3: 验证 loadAmounts 加载时 `__pending_corrections__` 自动进入 `_rawData`**

`loadAmounts` 中已有 `Object.assign(_rawData, data)`，所以服务端文件中的 `__pending_corrections__` 会自动加载进来。无需额外改动，但手动确认该行存在：

```js
// js/mdtfr/amounts.js loadAmounts():
Object.assign(_rawData, data);
Object.entries(data).forEach(([k, v]) => {
  if (!k.startsWith('__')) _amt[k] = parseFloat(v) || 0;
});
```

`__pending_corrections__` 以双下划线开头，不会被误写入 `_amt`。✓

- [ ] **Step 4: Commit**

```bash
git add js/mdtfr/amounts.js
git commit -m "feat(corrections): add getPendingCorrections/setPendingCorrections to amounts.js"
```

---

## Task 2: journal.js — 新增 patchJournalTradeRecord

**Files:**
- Modify: `js/mdtfr/journal.js`

背景：修正后需要回写 journal 中对应 trade record 的 `shares`/`price` 字段。journal 存储在服务端 `~/.investment/YYYY/MM/mdtfr_journal.json`，按 `data_date` upsert。`patchJournalTradeRecord` 先 GET 当月数据，找到 `data_date === trade_date` 的记录，在其 `trade_records` 中找到 `code_c` 匹配的条目，合并 `fields`，再 POST 回写。

- [ ] **Step 1: 在 journal.js 中新增 patchJournalTradeRecord**

在 `export {` 行之前添加：

```js
/**
 * 修正 journal 中指定 trade record 的字段。
 * @param {string} trade_date - YYYY-MM-DD，对应 journal record 的 data_date
 * @param {string} code_c - 标的基金代码
 * @param {Object} fields - 要合并的字段，如 { shares: 12345.67, price: 1.250 }
 */
export async function patchJournalTradeRecord(trade_date, code_c, fields) {
  const [year, month] = [trade_date.slice(0, 4), trade_date.slice(5, 7)];
  try {
    const res = await fetch(`/api/cache/journal/${year}/${month}`);
    if (!res.ok) return;
    const records = await res.json();
    if (!Array.isArray(records)) return;

    const recIdx = records.findIndex(r => r.data_date === trade_date);
    if (recIdx < 0) return;

    const rec = records[recIdx];
    if (!Array.isArray(rec.trade_records)) return;

    const trIdx = rec.trade_records.findIndex(tr => tr.code_c === code_c);
    if (trIdx < 0) return;

    rec.trade_records[trIdx] = { ...rec.trade_records[trIdx], ...fields, settled: true };

    await fetch('/api/cache/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec),
    });
  } catch {}
}
```

- [ ] **Step 2: Commit**

```bash
git add js/mdtfr/journal.js
git commit -m "feat(corrections): add patchJournalTradeRecord to journal.js"
```

---

## Task 3: corrections.js — 核心模块

**Files:**
- Create: `js/mdtfr/corrections.js`

这是最核心的模块。包含：
1. `addPendingCorrection(entry)` — 交易确认后写入估算记录
2. `removePendingCorrection(trade_date, code_c, trade_type)` — 撤销时移除
3. `applyPendingCorrections(poolItems)` — 数据加载后执行修正
4. `renderCorrectionStatus()` — 渲染状态指示器
5. `openCorrectionDialog()` / `closeCorrectionDialog()` — 详情弹窗

- [ ] **Step 1: 创建 corrections.js**

```js
// js/mdtfr/corrections.js
// T+1 结算修正：写入、执行、状态展示
import {
  getPendingCorrections, setPendingCorrections,
  saveAmounts, getShares, setShares,
} from './amounts.js';
import { refreshAllPosPct } from './amounts.js';
import { refreshTotalDisplay, refreshPnlDisplay } from './available.js';
import { patchJournalTradeRecord } from './journal.js';
import { escHtml } from '../utils.js';

/**
 * 交易确认后调用：写入一条待修正记录。
 * @param {{ trade_date, code_c, name, trade_type, amt, estimated_price, estimated_shares }} entry
 */
export async function addPendingCorrection(entry) {
  const list = getPendingCorrections();
  list.push(entry);
  setPendingCorrections(list);
  await saveAmounts();
  renderCorrectionStatus();
}

/**
 * 撤销交易时调用：移除对应待修正记录。
 */
export async function removePendingCorrection(trade_date, code_c, trade_type) {
  const list = getPendingCorrections().filter(
    c => !(c.trade_date === trade_date && c.code_c === code_c && c.trade_type === trade_type)
  );
  setPendingCorrections(list);
  await saveAmounts();
  renderCorrectionStatus();
}

/**
 * 数据加载完成后调用：对所有满足条件的待修正记录执行修正。
 * @param {Array} poolItems - 当日加载完成的标的数组，含 code_c 和 latest_close
 */
export async function applyPendingCorrections(poolItems) {
  const today = new Date().toISOString().slice(0, 10);
  const list = getPendingCorrections();
  if (list.length === 0) return;

  const priceMap = new Map(
    poolItems
      .filter(x => !x.error && x.latest_close > 0)
      .map(x => [x.code_c, x.latest_close])
  );

  let anyApplied = false;
  const remaining = [];

  for (const entry of list) {
    const { trade_date, code_c, trade_type, amt, estimated_shares } = entry;

    // 条件1：严格晚于交易日
    if (today <= trade_date) { remaining.push(entry); continue; }
    // 条件2：今日有有效价格
    const todayClose = priceMap.get(code_c);
    if (!todayClose) { remaining.push(entry); continue; }

    // 执行修正
    const realShares = amt / todayClose;
    const deltaShares = trade_type === 'buy'
      ? realShares - estimated_shares       // 买入：实际多/少到的份额
      : estimated_shares - realShares;      // 卖出：多扣/少扣的份额，补回/追扣

    const currentShares = getShares(code_c);
    setShares(code_c, Math.max(0, currentShares + deltaShares));

    // 回写 journal
    if (trade_type === 'buy') {
      await patchJournalTradeRecord(trade_date, code_c, {
        shares: parseFloat(realShares.toFixed(4)),
        price: todayClose,
      });
    } else {
      await patchJournalTradeRecord(trade_date, code_c, {
        shares: parseFloat(realShares.toFixed(4)),
      });
    }

    anyApplied = true;
  }

  setPendingCorrections(remaining);
  await saveAmounts();

  if (anyApplied) {
    refreshAllPosPct();
    refreshTotalDisplay();
    refreshPnlDisplay();
  }

  renderCorrectionStatus();
}

// ── 状态指示器 ────────────────────────────────────────────────

export function renderCorrectionStatus() {
  const el = document.getElementById('mdtfr-correction-status');
  if (!el) return;
  const list = getPendingCorrections();
  if (list.length === 0) {
    el.textContent = '';
    el.style.display = 'none';
    return;
  }
  el.style.display = 'inline-flex';
  el.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;color:var(--yellow)';
  el.textContent = `⏳ ${list.length} 笔待结算`;
  el.onclick = openCorrectionDialog;
}

// ── 详情弹窗 ──────────────────────────────────────────────────

export function openCorrectionDialog() {
  const overlay = document.getElementById('correction-overlay');
  if (!overlay) return;
  _renderCorrectionBody();
  overlay.classList.add('open');
}

export function closeCorrectionDialog() {
  document.getElementById('correction-overlay')?.classList.remove('open');
}

function _renderCorrectionBody() {
  const body = document.getElementById('correction-body');
  if (!body) return;
  const list = getPendingCorrections();

  if (list.length === 0) {
    body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0;text-align:center">暂无待结算记录</div>';
    return;
  }

  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const fmtN = n => n != null ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '–';

  const jth = t => `<th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
  const jtd = (t, extra='') => `<td style="padding:7px 10px;font-size:13px;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,.04);${extra}">${t}</td>`;

  const rowsHtml = list.map(entry => {
    const isBuy = entry.trade_type === 'buy';
    const badge = isBuy
      ? `<span style="background:rgba(34,197,94,.15);color:var(--green);font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px">🟢 买入</span>`
      : `<span style="background:rgba(239,68,68,.15);color:var(--red);font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px">🔴 卖出</span>`;
    return `<tr>
      ${jtd(`<span style="color:var(--text-dim);font-size:12px">${entry.trade_date}</span>`)}
      ${jtd(badge)}
      ${jtd(`<span style="font-weight:600">${escHtml(entry.name)}</span><br><span style="color:var(--text-dim);font-size:11px">${escHtml(entry.code_c)}</span>`)}
      ${jtd(`<span style="color:${isBuy ? 'var(--green)' : 'var(--red)'};font-weight:700">${fmtY(entry.amt)}</span>`)}
      ${jtd(`<span style="color:var(--text-dim)">${entry.estimated_price}</span>`)}
      ${jtd(`<span style="color:var(--text-dim)">${fmtN(entry.estimated_shares)}</span>`)}
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div style="padding:0 0 12px;color:var(--text-dim);font-size:13px">
      以下交易基于 T-1 估算净值记录，将在下一交易日收盘数据加载后自动修正份额。
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        ${jth('交易日')}${jth('类型')}${jth('标的')}${jth('金额')}${jth('估算净值')}${jth('估算份额')}
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div style="margin-top:14px;padding:10px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:6px;font-size:12px;color:var(--yellow)">
      ⚠ 非交易日不会触发修正。修正完成后此列表将自动清空。
    </div>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/mdtfr/corrections.js
git commit -m "feat(corrections): add corrections.js core module"
```

---

## Task 4: strategy_page.html — 新增 overlay 骨架

**Files:**
- Modify: `strategy_page.html`

- [ ] **Step 1: 查看 strategy_page.html 中 journal-overlay 的 HTML 结构**

在 `strategy_page.html` 中搜索 `journal-overlay`，找到 overlay div 的完整结构，用于参照。

- [ ] **Step 2: 新增 correction-overlay 和状态指示器**

在 `strategy_page.html` 中找到 `journal-overlay` div，在其**之后**插入：

```html
<!-- T+1 待结算修正弹窗 -->
<div id="correction-overlay" class="journal-overlay">
  <div class="journal-panel">
    <div class="journal-header">
      <span class="journal-title">⏳ 待结算修正</span>
      <button class="journal-close" onclick="closeCorrectionDialog()">×</button>
    </div>
    <div class="journal-content">
      <div id="correction-body"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: 在"分析时间"span 旁新增状态指示器 span**

在 `strategy_page.html` 中搜索 `mdtfr-advice-time`，找到该 span 所在行，在其**之后**插入：

```html
<span id="mdtfr-correction-status" style="display:none;margin-left:10px"></span>
```

整体结构示例（原有的 tspan 保留不变）：

```html
<span id="mdtfr-advice-time" style="...">分析时间: ...</span>
<span id="mdtfr-correction-status" style="display:none;margin-left:10px"></span>
```

- [ ] **Step 4: 在 script 标签中暴露 closeCorrectionDialog 到 window**

在 `strategy_page.html` 底部找到 mdtfr 模块的 import/window 绑定块，添加：

```js
import { closeCorrectionDialog } from './js/mdtfr/corrections.js';
window.closeCorrectionDialog = closeCorrectionDialog;
```

- [ ] **Step 5: Commit**

```bash
git add strategy_page.html
git commit -m "feat(corrections): add correction overlay and status indicator to strategy_page.html"
```

---

## Task 5: trade-confirm.js — 交易确认后写入 pending correction

**Files:**
- Modify: `js/mdtfr/trade-confirm.js`

- [ ] **Step 1: 在 trade-confirm.js 顶部 import corrections**

在现有 import 块末尾添加：

```js
import { addPendingCorrection, removePendingCorrection } from './corrections.js';
```

- [ ] **Step 2: 在 confirmTradeRow 成功路径末尾调用 addPendingCorrection**

找到 `confirmTradeRow` 中 `_updateRowCell(rowId, true)` 这行（函数末尾），在其**之前**（`_accumulate` 调用之后）插入：

```js
  // 写入待修正记录（T+1 结算：今日价格为估算，次日修正）
  const today = new Date().toISOString().slice(0, 10);
  if (code && buyPrice > 0) {
    const estimatedShares = type === 'sell'
      ? (() => {
          const snap2 = _rowSnapshots.get(rowId);
          const ratio2 = (snap2?.prevAmt || 0) > 0 ? Math.min(row.amt / snap2.prevAmt, 1) : 0;
          return (snap2?.prevShares || 0) * ratio2;
        })()
      : row.amt / buyPrice;
    await addPendingCorrection({
      trade_date: today,
      code_c: code,
      name: type === 'sell' ? row.from : row.to,
      trade_type: type,
      amt: row.amt,
      estimated_price: buyPrice,
      estimated_shares: parseFloat(estimatedShares.toFixed(4)),
    });
  }
```

注意：`buyPrice` 在 `confirmTradeRow` 中已定义为 `item?.latest_close || 0`，复用即可。

- [ ] **Step 3: 在 undoTradeRow 中移除对应 pending correction**

找到 `undoTradeRow` 函数，在 `_removeFromAccum(rowId)` 之后插入：

```js
  // 撤销时移除对应的待修正记录
  const today = new Date().toISOString().slice(0, 10);
  if (snap.code) {
    const tradeType = rowId.startsWith('sell') ? 'sell' : 'buy';
    await removePendingCorrection(today, snap.code, tradeType);
  }
```

- [ ] **Step 4: Commit**

```bash
git add js/mdtfr/trade-confirm.js
git commit -m "feat(corrections): write pending correction on confirmTradeRow, remove on undo"
```

---

## Task 6: manual-sell.js — 手动卖出写入 pending correction

**Files:**
- Modify: `js/mdtfr/manual-sell.js`

- [ ] **Step 1: 在 manual-sell.js 顶部 import corrections**

在现有 import 块末尾添加：

```js
import { addPendingCorrection } from './corrections.js';
```

- [ ] **Step 2: 在 _manualSellConfirm 成功路径末尾调用 addPendingCorrection**

找到 `_manualSellConfirm` 函数中 `closeManualSellDialog()` 调用**之前**，插入：

```js
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
```

注意：`prevShares` 和 `ratio` 在 `_manualSellConfirm` 中已定义，直接复用。`getLastMdtfrItems` 已从 `amounts.js` 导入。

- [ ] **Step 3: Commit**

```bash
git add js/mdtfr/manual-sell.js
git commit -m "feat(corrections): write pending correction on manual sell"
```

---

## Task 7: loader.js — 数据加载完成后触发修正

**Files:**
- Modify: `js/mdtfr/loader.js`

- [ ] **Step 1: 在 loader.js 顶部 import corrections**

在现有 import 块末尾添加：

```js
import { applyPendingCorrections, renderCorrectionStatus } from './corrections.js';
```

- [ ] **Step 2: 在 SSE done 事件末尾调用 applyPendingCorrections**

找到 SSE `done` 事件处理块，定位到：

```js
        mdtfrRenderAdvice(poolItems);
        mdtfrLog('done', `补全完成 · ${d.last_updated}`);
```

在 `mdtfrRenderAdvice(poolItems)` **之后**插入：

```js
        await applyPendingCorrections(poolItems);
```

- [ ] **Step 3: 在缓存命中路径末尾同样触发**

找到缓存完整时的处理块（`if (incomplete.length === 0)`），定位到：

```js
    mdtfrRenderAdvice(poolItems);
    document.getElementById('mdtfr-last-updated').textContent = `缓存数据 · ${today}`;
    btn.disabled = false;
    btn.innerHTML = '↺ 刷新';
    return;
```

在 `mdtfrRenderAdvice(poolItems)` **之后**插入：

```js
    await applyPendingCorrections(poolItems);
```

- [ ] **Step 4: 在 mdtfrMaybeInitEmpty 缓存命中路径末尾渲染状态指示器**

找到 `mdtfrMaybeInitEmpty` 函数中缓存命中后：

```js
      mdtfrRenderAdvice(poolItems);
      document.getElementById('mdtfr-last-updated').textContent = `缓存数据 · ${today}`;
```

在 `mdtfrRenderAdvice(poolItems)` **之后**插入：

```js
      await applyPendingCorrections(poolItems);
```

- [ ] **Step 5: Commit**

```bash
git add js/mdtfr/loader.js
git commit -m "feat(corrections): trigger applyPendingCorrections after data load"
```

---

## Task 8: 端对端验证

- [ ] **Step 1: 启动开发服务器**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
python main.py
# 或
uvicorn main:app --reload --port 9001
```

打开 http://localhost:9001/strategy#mdtfr

- [ ] **Step 2: 模拟交易确认，验证 pending correction 写入**

1. 加载数据后，在买入或卖出表格中点击「✅ 确认」
2. 打开浏览器 DevTools → Application → 查看 `~/.investment/mdtfr_amounts.json`（或 `GET /api/cache/amounts`）
3. 确认 `__pending_corrections__` 数组中有新增记录，字段完整（trade_date 为今日、estimated_price 非零）
4. 页面顶部"分析时间"右侧出现黄色 `⏳ N 笔待结算` 徽章

- [ ] **Step 3: 点击徽章，验证详情弹窗**

1. 点击 `⏳ N 笔待结算` 徽章
2. 弹窗打开，显示交易日期、类型徽章、标的名称/代码、金额、估算净值、估算份额
3. 底部有黄色提示文字
4. 点击 × 关闭弹窗

- [ ] **Step 4: 模拟修正触发（修改 trade_date 为昨日）**

为了验证修正逻辑，直接编辑 `~/.investment/mdtfr_amounts.json`，将 `__pending_corrections__[0].trade_date` 改为昨日日期（如 `2026-06-07`）。

刷新页面，点击「↺ 刷新」触发数据加载。

数据加载完成后：
- 控制台无报错
- `GET /api/cache/amounts` 中 `__pending_corrections__` 该条已消失（已修正）
- `__shares__` 对应 code_c 数值已更新
- journal 对应记录的 `shares` 字段已更新（通过 `GET /api/cache/journal/YYYY/MM` 验证）
- 黄色徽章消失

- [ ] **Step 5: 验证撤销（undo）移除 pending correction**

重新确认一笔交易，确认 pending correction 写入后，点击「↺ 撤销」。
验证 `__pending_corrections__` 中该条已移除，徽章消失。

- [ ] **Step 6: 验证手动卖出也写入 pending correction**

点击标的行的「手动卖出」按钮，选择金额后确认。
验证 `__pending_corrections__` 有新记录，`manual: true` 在 journal 中存在，徽章出现。

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(corrections): T+1 settlement correction — end-to-end verified"
```
