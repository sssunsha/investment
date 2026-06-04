# MDTFR 卖出建议显示份额 + ETF代码悬停提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在卖出/买入建议表格和手动卖出弹窗中同时显示份额数量，并在基金名称上增加鼠标悬停ETF三类代码提示。

**Architecture:** 复用 `table.js` 已有的 tooltip 函数（export化），在 `advice.js` 中补充 import 后为建议面板的基金名称 span 注入 data 属性并绑定事件；份额计算在各自渲染函数中就地完成，不新建模块。

**Tech Stack:** Vanilla JS ES modules, DOM innerHTML + querySelectorAll post-inject event binding

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `js/mdtfr/table.js` | Modify lines 206, 227 | export `showCodeTooltip` 和 `hideCodeTooltip` |
| `js/mdtfr/advice.js` | Modify | 新增 import，sellRows/buyRows 追加字段，opTable 追加份额，标的 span 加 data 属性，body 赋值后绑定 tooltip 事件 |
| `js/mdtfr/manual-sell.js` | Modify | `_renderBody` 取 totalShares，预设按钮追加份额，`_updatePreview` 追加份额 |

---

### Task 1: Export tooltip functions from table.js

**Files:**
- Modify: `js/mdtfr/table.js:206,227`

- [ ] **Step 1: 将 `showCodeTooltip` 和 `hideCodeTooltip` 改为 export**

在 `js/mdtfr/table.js` 中，将第 206 行和第 227 行的函数声明改为 export：

```js
// line 206 — 改为：
export function showCodeTooltip(target, codeC, aCode, etf) {

// line 227 — 改为：
export function hideCodeTooltip() {
```

- [ ] **Step 2: 验证模块语法无误**

```bash
node --input-type=module < /dev/null 2>&1 || true
# 在浏览器中打开 http://localhost:9001/strategy#mdtfr，确认控制台无 import 错误
```

- [ ] **Step 3: Commit**

```bash
git add js/mdtfr/table.js
git commit -m "refactor(mdtfr): export showCodeTooltip and hideCodeTooltip from table.js"
```

---

### Task 2: 更新 advice.js imports 并构建辅助数据

**Files:**
- Modify: `js/mdtfr/advice.js:1-6`

- [ ] **Step 1: 在 advice.js 顶部追加两行 import**

将文件开头 import 块从：
```js
import { escHtml } from '../utils.js';
import { setLastMdtfrItems } from './amounts.js';
import { getTotalAmt, getAvailableAmt } from './available.js';
import { mdtfrBuildAdvice, setLastAdviceData } from './advice-logic.js';
import { call, on } from './bus.js';
```

改为：
```js
import { escHtml } from '../utils.js';
import { setLastMdtfrItems, getShares } from './amounts.js';
import { getTotalAmt, getAvailableAmt } from './available.js';
import { mdtfrBuildAdvice, setLastAdviceData } from './advice-logic.js';
import { call, on } from './bus.js';
import { getMdtfrPoolDef } from './config.js';
import { showCodeTooltip, hideCodeTooltip } from './table.js';
```

- [ ] **Step 2: 在 `mdtfrRenderAdvice` 函数体靠前位置（解构 advice 之后，fmtRet 定义之前）构建 poolMap**

在 advice.js 第 28 行（解构 advice 的 `}` 行）之后，`fmtRet` 定义之前，插入：

```js
  // 构建 code_c → {code_a, etf} 映射，供 tooltip 和份额计算使用
  const poolMap = new Map(getMdtfrPoolDef().map(d => [d.code_c, { code_a: d.code_a, etf: d.etf }]));

  // 辅助：取标的最新收盘价（从 items 中找，无数据返回 0）
  const getLatestClose = (code_c) => items.find(x => x.code_c === code_c)?.latest_close || 0;
```

- [ ] **Step 3: 验证页面无 JS 报错**

在浏览器打开 `http://localhost:9001/strategy#mdtfr`，F12 确认控制台无报错。

- [ ] **Step 4: Commit**

```bash
git add js/mdtfr/advice.js
git commit -m "refactor(mdtfr): add imports and poolMap helper in advice.js"
```

---

### Task 3: sellRows/buyRows 追加份额和 code 字段

**Files:**
- Modify: `js/mdtfr/advice.js:213-248`（sellRows/buyRows 构建区段）

- [ ] **Step 1: sellRows 追加 `holdAmt`, `shares`, `code_a`, `etf` 字段**

将 `urgentSell.forEach` 区段（约 213-231 行）中每处 `sellRows.push({...})` 追加字段。共 4 个 push，逐一改动：

```js
// 排名跌出前6 — 全仓卖出
sellRows.push({ from: x.name, amt: x._amt, watch: false,
  to: '货币基金', note: `排名跌至 #${x._globalRank}，超出前6名`,
  holdAmt: x._amt, shares: getShares(x.code_c),
  code_c: x.code_c, code_a: poolMap.get(x.code_c)?.code_a, etf: poolMap.get(x.code_c)?.etf });

// 仓位超50% — 卖出超额
sellRows.push({ from: x.name, amt: x._amt - keepAmt, watch: false,
  to: '货币基金', note: `仓位 ${x._posVal.toFixed(1)}% 超出50%，保留 ${fmtY(keepAmt)}`,
  holdAmt: x._amt, shares: getShares(x.code_c),
  code_c: x.code_c, code_a: poolMap.get(x.code_c)?.code_a, etf: poolMap.get(x.code_c)?.etf });

// 跌破MA60 — 清仓
sellRows.push({ from: x.name, amt: x._amt, watch: false,
  to: '货币基金', note: `跌破60日均线，清仓：收盘 ${x.latest_close?.toFixed(3)} < MA60 ${x.ma60?.toFixed(3)}`,
  holdAmt: x._amt, shares: getShares(x.code_c),
  code_c: x.code_c, code_a: poolMap.get(x.code_c)?.code_a, etf: poolMap.get(x.code_c)?.etf });

// 连续MA20 — 减仓至15%
sellRows.push({ from: x.name, amt: x._amt - keepAmt, watch: false,
  to: '货币基金',
  note: `连续${ws?.days_below_ma20 || 2}日跌破MA20，减仓至15%，保留 ${fmtY(keepAmt)}`,
  holdAmt: x._amt, shares: getShares(x.code_c),
  code_c: x.code_c, code_a: poolMap.get(x.code_c)?.code_a, etf: poolMap.get(x.code_c)?.etf });
```

`watchSell.forEach` 区段的 push（约 240 行）同样追加：

```js
sellRows.push({ from: x.name, amt: sellAmt, watch: true, to: '货币基金', note: noteStr,
  holdAmt: x._amt, shares: getShares(x.code_c),
  code_c: x.code_c, code_a: poolMap.get(x.code_c)?.code_a, etf: poolMap.get(x.code_c)?.etf });
```

- [ ] **Step 2: buyRows 追加 `latest_close`, `code_a`, `etf` 字段**

`toBuy.forEach` 区段（约 242-248 行）的 push 改为：

```js
buyRows.push({ from: fromLabel, amt: totalAmt * 0.50, to: x.name, toCode: x.code_c, note: noteStr,
  latest_close: getLatestClose(x.code_c),
  code_a: poolMap.get(x.code_c)?.code_a, etf: poolMap.get(x.code_c)?.etf });
```

`finalType === 'incremental'` 区段的 push（约 263-271 行）同样追加：

```js
buyRows.push({
  from: '可用资金',
  amt: addAmt,
  to: x.name,
  toCode: x.code_c,
  note: `当前 ${fmtY(currentAmt)} → 目标 ${fmtY(targetAmt)}（含增量 ${fmtY(availableAmt)}）`,
  latest_close: getLatestClose(x.code_c),
  code_a: poolMap.get(x.code_c)?.code_a, etf: poolMap.get(x.code_c)?.etf,
});
```

- [ ] **Step 3: 验证页面正常渲染，无 JS 错误**

打开 `http://localhost:9001/strategy#mdtfr`，确认建议面板正常显示。

- [ ] **Step 4: Commit**

```bash
git add js/mdtfr/advice.js
git commit -m "feat(mdtfr): add shares/code fields to sellRows and buyRows"
```

---

### Task 4: opTable 金额列追加份额显示

**Files:**
- Modify: `js/mdtfr/advice.js:286-304`（`opTable` 函数）

- [ ] **Step 1: 在 `opTable` 函数的 `rowsHtml` 生成中，`amtStr` 追加份额行**

找到 `opTable` 函数内 `amtStr` 变量定义（约 287 行）：

```js
const amtStr = `<span style="color:${amtClr};font-weight:700">${fmtY(r.amt)}</span>`;
```

替换为：

```js
const soldShares = (type === 'sell' && r.shares != null && r.holdAmt > 0)
  ? Math.round(r.shares * r.amt / r.holdAmt)
  : null;
const approxShares = (type === 'buy' && r.latest_close > 0)
  ? Math.round(r.amt / r.latest_close)
  : null;
const sharesNum = soldShares ?? approxShares;
const sharesHint = sharesNum != null
  ? `<div style="color:var(--text-dim);font-size:11px;margin-top:2px">约 ${sharesNum.toLocaleString()} 份</div>`
  : '';
const amtStr = `<span style="color:${amtClr};font-weight:700">${fmtY(r.amt)}</span>${sharesHint}`;
```

- [ ] **Step 2: 在 opTable 的 `fromStr` 卖出标的名称 span 追加 data 属性（用于 tooltip）**

找到 `fromStr` 定义（约 289-292 行）：

```js
const fromStr = r.from === '货币基金' || r.from === '可用资金'
  ? `<span style="color:var(--text-dim)">${r.from}</span>`
  : `<span style="color:#ff4d4d;font-weight:700;text-shadow:0 0 6px rgba(255,77,77,.6)">${r.from}</span>`;
```

替换为：

```js
const fromStr = r.from === '货币基金' || r.from === '可用资金'
  ? `<span style="color:var(--text-dim)">${r.from}</span>`
  : `<span style="color:#ff4d4d;font-weight:700;text-shadow:0 0 6px rgba(255,77,77,.6);cursor:help"
       data-code-c="${r.code_c||''}" data-code-a="${r.code_a||''}" data-etf="${r.etf||''}">${r.from}</span>`;
```

- [ ] **Step 3: 在 opTable 的 `toStr` 买入标的名称 span 追加 data 属性**

找到 `toStr` 定义（约 293-295 行）：

```js
const toStr = r.to === '货币基金'
  ? `<span style="color:var(--text-dim)">${r.to}</span>`
  : `<span style="color:var(--purple);font-weight:700">${r.to}</span>${r.toCode ? `<br><span style="color:var(--text-dim);font-size:11px">${r.toCode}</span>` : ''}`;
```

替换为：

```js
const toStr = r.to === '货币基金'
  ? `<span style="color:var(--text-dim)">${r.to}</span>`
  : `<span style="color:var(--purple);font-weight:700;cursor:help"
       data-code-c="${r.toCode||''}" data-code-a="${r.code_a||''}" data-etf="${r.etf||''}">${r.to}</span>${r.toCode ? `<br><span style="color:var(--text-dim);font-size:11px">${r.toCode}</span>` : ''}`;
```

- [ ] **Step 4: 验证建议面板金额列出现份额行**

打开 `http://localhost:9001/strategy#mdtfr`，触发换仓信号（或用测试数据），确认卖出/买入表格金额下方出现灰色小字"约 X,XXX 份"。

- [ ] **Step 5: Commit**

```bash
git add js/mdtfr/advice.js
git commit -m "feat(mdtfr): show estimated shares below amount in sell/buy table"
```

---

### Task 5: sellHtml 持仓名称追加 data 属性

**Files:**
- Modify: `js/mdtfr/advice.js:474-480`（sellHtml 持仓标题行）

- [ ] **Step 1: 在持仓标的名称 span 追加 data 属性**

找到 sellHtml 持仓块标题行（约 474-480 行）中：

```js
<span style="color:var(--text)">${escHtml(x.name)}</span>
<span style="color:var(--text-dim);font-size:12px;font-weight:400">${x.code_c}</span>
```

替换为：

```js
<span style="color:var(--text);cursor:help"
  data-code-c="${x.code_c}" data-code-a="${poolMap.get(x.code_c)?.code_a||''}" data-etf="${poolMap.get(x.code_c)?.etf||''}">${escHtml(x.name)}</span>
<span style="color:var(--text-dim);font-size:12px;font-weight:400">${x.code_c}</span>
```

- [ ] **Step 2: Commit**

```bash
git add js/mdtfr/advice.js
git commit -m "feat(mdtfr): add data attributes to holding names in sell conditions section"
```

---

### Task 6: body.innerHTML 赋值后绑定 tooltip 事件

**Files:**
- Modify: `js/mdtfr/advice.js:517-531`（body.innerHTML 赋值行之后）

- [ ] **Step 1: 在 `body.innerHTML = ...` 赋值行之后插入事件绑定**

找到 `body.innerHTML = \`` 赋值（约 517 行，以 `card.style.display = '';` 结尾于约 530 行），在 `card.style.display = '';` **之前**插入：

```js
  // 为所有带 data-code-c 的标的名称绑定 tooltip
  body.querySelectorAll('[data-code-c]').forEach(el => {
    el.addEventListener('mouseenter', e =>
      showCodeTooltip(e.target, e.target.dataset.codeC, e.target.dataset.codeA, e.target.dataset.etf));
    el.addEventListener('mouseleave', hideCodeTooltip);
  });
```

- [ ] **Step 2: 验证悬停效果**

打开 `http://localhost:9001/strategy#mdtfr`，将鼠标悬停在建议面板的卖出标的名称、买入标的名称、以及卖出条件区域的持仓名称上，确认弹出三类代码气泡（C类/A类/场内ETF）。

- [ ] **Step 3: Commit**

```bash
git add js/mdtfr/advice.js
git commit -m "feat(mdtfr): bind ETF code tooltip on fund name hover in advice panel"
```

---

### Task 7: manual-sell.js 弹窗显示份额

**Files:**
- Modify: `js/mdtfr/manual-sell.js:31-141`

- [ ] **Step 1: `_renderBody` 中获取 totalShares**

在 `_renderBody(code_c, name, curAmt)` 函数体开头（`const body = ...` 之后）追加：

```js
  const totalShares = getShares(code_c);
  const fmtShares = n => n > 0 ? `约 ${Math.round(n).toLocaleString()} 份` : '';
```

- [ ] **Step 2: 预设按钮追加份额行**

找到 presets 渲染模板（约 52-59 行）：

```js
${p.label}<br>
<span style="font-size:11px;font-weight:400;color:var(--text-dim)">${fmtY(Math.round(curAmt * p.ratio))}</span>
```

替换为：

```js
${p.label}<br>
<span style="font-size:11px;font-weight:400;color:var(--text-dim)">${fmtY(Math.round(curAmt * p.ratio))}</span>
${totalShares > 0 ? `<br><span style="font-size:10px;font-weight:400;color:var(--text-dim);opacity:0.7">${fmtShares(totalShares * p.ratio)}</span>` : ''}
```

- [ ] **Step 3: `_manualSellSelectPreset` 和 `_manualSellOnInput` 传递 totalShares**

将 `window._manualSellSelectPreset` 调用链（约 94-103 行）改为传递 totalShares。先修改 `_updatePreview` 签名：

```js
// 原签名
function _updatePreview(amt, curAmt) {

// 新签名
function _updatePreview(amt, curAmt, totalShares = 0) {
```

在 `_updatePreview` 函数体中，找到 `el.innerHTML = ...` 行（约 140 行）：

```js
  el.innerHTML = `卖出 <span style="color:var(--red);font-weight:600">${fmtY(amt)}</span> → 货币基金　剩余持仓 <span style="color:var(--yellow);font-weight:600">${fmtY(remain)}</span>`;
```

替换为：

```js
  const sharesHint = totalShares > 0
    ? ` <span style="color:var(--text-dim);font-size:11px">（约 ${Math.round(totalShares * amt / curAmt).toLocaleString()} 份）</span>`
    : '';
  el.innerHTML = `卖出 <span style="color:var(--red);font-weight:600">${fmtY(amt)}</span>${sharesHint} → 货币基金　剩余持仓 <span style="color:var(--yellow);font-weight:600">${fmtY(remain)}</span>`;
```

- [ ] **Step 4: 在 `_renderBody` 末尾默认调用时传入 totalShares**

找到 `_renderBody` 末尾（约 94 行）：

```js
  window._manualSellSelectPreset(1.0, curAmt);
```

改为：

```js
  window._manualSellSelectPreset(1.0, curAmt, totalShares);
```

- [ ] **Step 5: `window._manualSellSelectPreset` 中传递 totalShares 给 `_updatePreview`**

找到 `window._manualSellSelectPreset` 函数（约 97-104 行）：

```js
window._manualSellSelectPreset = function(ratio, curAmt) {
  const amt = Math.round(curAmt * ratio);
  const input = document.getElementById('manual-sell-amt-input');
  if (input) { input.value = amt; }
  _updatePresetHighlight(ratio);
  _updatePreview(amt, curAmt);
  _updateConfirmBtn(amt, curAmt);
};
```

改为：

```js
window._manualSellSelectPreset = function(ratio, curAmt, totalShares = 0) {
  const amt = Math.round(curAmt * ratio);
  const input = document.getElementById('manual-sell-amt-input');
  if (input) { input.value = amt; }
  _updatePresetHighlight(ratio);
  _updatePreview(amt, curAmt, totalShares);
  _updateConfirmBtn(amt, curAmt);
};
```

- [ ] **Step 6: `window._manualSellOnInput` 通过 dataset 或闭包传入 totalShares**

由于 `_manualSellOnInput` 是通过 `oninput="window._manualSellOnInput(${curAmt})"` HTML 属性调用，无法直接传 totalShares。改为也传入：

在 `_renderBody` HTML template 中（约 67 行）：

```js
oninput="window._manualSellOnInput(${curAmt})"
```

改为：

```js
oninput="window._manualSellOnInput(${curAmt}, ${totalShares})"
```

并修改 `window._manualSellOnInput` 签名：

```js
window._manualSellOnInput = function(curAmt, totalShares = 0) {
  const input = document.getElementById('manual-sell-amt-input');
  const amt = parseInt(input?.value || '0', 10) || 0;
  const presets = [0.25, 0.50, 0.75, 1.00];
  const matchedRatio = presets.find(r => Math.abs(Math.round(curAmt * r) - amt) <= 1) ?? null;
  _updatePresetHighlight(matchedRatio);
  _updatePreview(amt, curAmt, totalShares);
  _updateConfirmBtn(amt, curAmt);
};
```

- [ ] **Step 7: 验证手动卖出弹窗**

打开 `http://localhost:9001/strategy#mdtfr`，点击某持仓标的的"手动卖出"按钮，确认：
1. 预设按钮（25%/50%/75%/全仓）下方各有灰色小字份额
2. 输入金额后预览行显示 `（约 X,XXX 份）`

- [ ] **Step 8: Commit**

```bash
git add js/mdtfr/manual-sell.js
git commit -m "feat(mdtfr): show shares in manual sell dialog presets and preview"
```

---

## 验证清单

1. [ ] 卖出操作表格金额列：¥ 下方出现灰色小字"约 X,XXX 份"
2. [ ] 买入操作表格金额列：¥ 下方出现灰色小字估算份额
3. [ ] 手动卖出弹窗预设按钮：第三行显示份额
4. [ ] 手动卖出弹窗输入/预设时：预览行追加"（约 X,XXX 份）"
5. [ ] 悬停卖出表格基金名称 → 弹出三类代码气泡
6. [ ] 悬停买入表格基金名称 → 弹出三类代码气泡
7. [ ] 悬停卖出条件区域持仓名称 → 弹出三类代码气泡
8. [ ] 无持仓份额数据（totalShares=0）时不显示份额行（不出现"约 0 份"）
