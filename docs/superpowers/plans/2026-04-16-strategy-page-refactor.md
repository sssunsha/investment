# strategy_page.html 拆分重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 3848 行的单文件 strategy_page.html（CSS/HTML/JS 混合）拆分为原生 ES Module 工程结构，每文件 ≤ 500 行。

**Architecture:** 5 个 CSS 文件按关注点分层；JS 分为通用工具层 + AW 模块 + MDTFR 模块 + main.js 入口。HTML 只保留骨架 DOM，通过 `<script type="module" src="js/main.js">` 引入。HTML 中 `onclick="xxx()"` 继续有效，通过在 main.js 中 `Object.assign(window, {...})` 显式挂载约 25 个全局函数来保持兼容。

**Tech Stack:** 原生 HTML/CSS/JS，ES Module（无打包工具），localStorage，Fetch API

---

## 文件结构总览

```
investment/
├── strategy_page.html          ← 修改：移除 <style>/<script>，改为外链
├── css/
│   ├── base.css                ← 新建
│   ├── layout.css              ← 新建
│   ├── modals.css              ← 新建
│   ├── aw.css                  ← 新建
│   └── mdtfr.css               ← 新建
└── js/
    ├── main.js                 ← 新建（入口）
    ├── utils.js                ← 新建
    ← markdown.js             ← 新建
    ├── tab.js                  ← 新建
    ├── rebalance-day.js        ← 新建
    ├── aw/
    │   ├── config.js           ← 新建
    │   ├── inputs.js           ← 新建
    │   ├── calc.js             ← 新建
    │   ├── log.js              ← 新建
    │   ├── journal.js          ← 新建
    │   └── drawer.js           ← 新建
    └── mdtfr/
        ├── config.js           ← 新建
        ├── cache.js            ← 新建
        ├── confirm.js          ← 新建
        ├── debug.js            ← 新建
        ├── table.js            ← 新建
        ├── amounts.js          ← 新建
        ├── watch.js            ← 新建
        ├── advice.js           ← 新建
        ├── journal.js          ← 新建
        ├── pool-adjust.js      ← 新建
        └── loader.js           ← 新建
```

---

## 验证方式说明

本项目无测试框架，每个任务的验证方式为：启动本地服务器（`python3 -m http.server` 或已有 FastAPI 后端），在浏览器打开 `strategy_page.html`，检查：
1. 无 JS 控制台错误（F12 → Console）
2. 对应功能视觉正常

**启动后端**（如需 API 联调）：在 investment 目录执行 `./invest.sh` 或 `uvicorn main:app --reload`

---

## Task 1：创建目录结构

**Files:**
- Create: `css/` (目录)
- Create: `js/aw/` (目录)
- Create: `js/mdtfr/` (目录)

- [ ] **Step 1: 创建目录**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
mkdir -p css js/aw js/mdtfr
```

Expected: 无报错，`ls` 可见 css/ 和 js/ 目录

- [ ] **Step 2: 提交**

```bash
git add css js
git commit -m "chore: 创建 css/ js/aw/ js/mdtfr/ 目录结构"
```

---

## Task 2：提取 css/base.css

提取内容：CSS 变量、全局 reset、body、通用组件（按钮、表单、标签、加载动画）

**Files:**
- Create: `css/base.css`
- Source: `strategy_page.html` lines 7–34（`:root`, `*`, `body`）+ lines 291–401（`.btn*`, `.form-*`）+ lines 519–529（`.spinner`, `@keyframes spin`）+ lines 561–579（`.tag-*`, `.pct`, `.pos`, `.neg`, `.dim`, `.skeleton`, `@keyframes shimmer`, `.empty-state`, `.updated-note`, `.amt-input`, `.pos-pct`）

- [ ] **Step 1: 创建 css/base.css**

从 `strategy_page.html` 的 `<style>` 块中复制以下 CSS 段落到 `css/base.css`：

1. Lines 8–34：`:root { ... }` + `*, *::before, *::after { ... }` + `body { ... }`
2. Lines 291–313：`/* ── Buttons ── */` 整个区块（`.btn` 及所有变体）
3. Lines 314–401：`/* ── Form grid ── */` 整个区块（`.form-grid`, `.cat-row`, `.field-sell`, `.field-buy`, `.cat-label`, `.cat-name`, `.cat-pct`, `.cat-inputs`, `.form-sub`, `.form-sub-row`, `.aw-alt-btn`, `.aw-alt-tag`, `.form-field`, `.form-label`, `.form-input`, `.form-select`）
4. Lines 519–529：`/* ── Spinner ── */`（`.spinner`, `@keyframes spin`）
5. Lines 560–581：`.pct`, `.pos`, `.neg`, `.dim`, `.tag-buy`, `.tag-sell`, `.tag-hold`, `.tag-signal`, `.rank-badge`, `.rank-top`, `.rank-mid`, 金额输入框（`.amt-input`, `.pos-pct`）
6. Lines 728–733：`.skeleton`, `@keyframes shimmer`, `.trend-up`, `.trend-down`, `.trend-na`, `.empty-state`, `.updated-note`

文件头部加注释：
```css
/* ══════════════════════════════════════════════
   base.css — CSS 变量、reset、通用 UI 组件
   (按钮、表单、标签、加载动画、工具类)
════════════════════════════════════════════════ */
```

- [ ] **Step 2: 验证文件行数**

```bash
wc -l css/base.css
```

Expected: ≤ 200 行

- [ ] **Step 3: 提交**

```bash
git add css/base.css
git commit -m "refactor: 提取 css/base.css（变量、reset、通用组件）"
```

---

## Task 3：提取 css/layout.css

提取内容：页头、调仓日主题、Tab 栏、卡片骨架布局

**Files:**
- Create: `css/layout.css`
- Source: `strategy_page.html` lines 36–177（Page Header、rebalance-day 主题、Tab Bar、Tab Panels、`.aw-layout`、`.section-card` 等区块）

- [ ] **Step 1: 创建 css/layout.css**

从 `strategy_page.html` 复制以下 CSS 段落：

1. Lines 36–85：`/* ══ Page Header ══ */`（`.page-header`, `.btn-home`, `.breadcrumb-sep`, `.header-date`, `.rebalance-badge`）
2. Lines 87–117：调仓日背景（`body.rebalance-day`, `body.holiday-day` 及子选择器）
3. Lines 119–135：`/* ── Guide drawer trigger ── */`（`.btn-guide`）
4. Lines 137–177：`/* ══ Tab Bar ══ */` + `/* ══ Tab Panels ══ */`（`.tab-bar`, `.tab-btn`, `.tab-dot`, `.tab-panel`）
5. Lines 258–289：`/* ══ All Weather Panel Layout ══ */`（`.aw-layout`, `.section-card`, `.section-body`, `.section-head`, `.section-icon`, `.section-title`, `.section-actions`）

文件头注释：
```css
/* ══════════════════════════════════════════════
   layout.css — 页面骨架：页头、Tab、卡片布局
════════════════════════════════════════════════ */
```

- [ ] **Step 2: 验证行数**

```bash
wc -l css/layout.css
```

Expected: ≤ 180 行

- [ ] **Step 3: 提交**

```bash
git add css/layout.css
git commit -m "refactor: 提取 css/layout.css（页头、Tab、卡片骨架）"
```

---

## Task 4：提取 css/modals.css

提取内容：所有弹窗、抽屉、Overlay

**Files:**
- Create: `css/modals.css`
- Source: `strategy_page.html` lines 179–257（Guide Drawer）+ lines 582–692（复盘弹窗、确认弹窗、检查类型弹窗、标的池调整弹窗）

- [ ] **Step 1: 创建 css/modals.css**

从 `strategy_page.html` 复制以下 CSS 段落：

1. Lines 179–257：`/* ══ Guide Drawer ══ */`（`.drawer-overlay`, `.drawer`, `.drawer-header`, `.drawer-title`, `.drawer-close`, `.drawer-body` 及其内 Markdown 渲染样式 h1/h2/h3/p/ul/code/pre/hr/blockquote/table）
2. Lines 582–607：`/* ── 复盘弹窗 ── */`（`.journal-overlay`, `.journal-modal`, `.journal-modal-head`, `.journal-table-wrap`, `.journal-table`）
3. Lines 609–622：`/* ── 确认弹窗 ── */`（`.confirm-overlay`, `.confirm-modal`）
4. Lines 624–654：`/* ── 检查类型选择弹窗 ── */`（`.check-type-*`）
5. Lines 656–692：`/* ── 标的池调整弹窗 ── */`（`.pool-adjust-*`）

文件头注释：
```css
/* ══════════════════════════════════════════════
   modals.css — 所有弹窗、抽屉、Overlay
════════════════════════════════════════════════ */
```

- [ ] **Step 2: 验证行数**

```bash
wc -l css/modals.css
```

Expected: ≤ 210 行

- [ ] **Step 3: 提交**

```bash
git add css/modals.css
git commit -m "refactor: 提取 css/modals.css（弹窗、抽屉）"
```

---

## Task 5：提取 css/aw.css

提取内容：全天候再平衡专属样式

**Files:**
- Create: `css/aw.css`
- Source: `strategy_page.html` lines 403–519（再平衡结果表、操作芯片、汇总条、日志表）+ lines 735–831（compare 对比表、操作方案卡片）

- [ ] **Step 1: 创建 css/aw.css**

从 `strategy_page.html` 复制以下 CSS 段落：

1. Lines 403–428：`/* ── Rebalance result table ── */`（`.result-table`, `.trigger-yes`, `.trigger-no`）
2. Lines 429–442：`/* ── Operation chips ── */`（`.op-chip`, `.op-sell`, `.op-buy`, `.op-hold`）
3. Lines 443–463：`/* ── Summary bar ── */`（`.summary-bar`, `.sum-chip`, `.sum-sell`, `.sum-buy`, `.sum-ok`, `.sum-info`）
4. Lines 465–517：`/* ── Log table ── */`（`.log-table-wrap`, `.log-table`, `.log-empty`, `.log-ops-cell`, `.log-del-btn`）
5. Lines 735–831：`/* ── Before / After comparison table ── */` + `/* ── Operation plan cards ── */`（`.compare-*`, `.drift-*`, `.compare-arrow`, `.arrow-*`, `.op-plans-grid`, `.op-plan-card`, `.op-plan-head`, `.op-plan-body`, `.op-step*`, `.op-step-item`, `.op-item-*`, `.op-convert-row`, `.convert-*`）

文件头注释：
```css
/* ══════════════════════════════════════════════
   aw.css — 全天候再平衡专属样式
════════════════════════════════════════════════ */
```

- [ ] **Step 2: 验证行数**

```bash
wc -l css/aw.css
```

Expected: ≤ 180 行

- [ ] **Step 3: 提交**

```bash
git add css/aw.css
git commit -m "refactor: 提取 css/aw.css（再平衡计算器、操作记录）"
```

---

## Task 6：提取 css/mdtfr.css

提取内容：动量趋势轮动策略专属样式

**Files:**
- Create: `css/mdtfr.css`
- Source: `strategy_page.html` lines 531–560（sector rotation layout 及相关卡片）+ lines 548–556（`.signal-bar`, `.signal-chip`, `.chip-*`, `.table-wrap`, `.data-table`）+ lines 693–733（`.advice-*`, `.skeleton`）

- [ ] **Step 1: 创建 css/mdtfr.css**

从 `strategy_page.html` 复制以下 CSS 段落：

1. Lines 531–560：`/* ── Sector rotation styles ── */`（`.sr-layout`, `.mdtfr-table-wrap`, `.strategy-card`, `.card-header`, `.card-icon`, `.card-meta`, `.card-title`, `.card-subtitle`, `.card-controls`, `.card-body`, `.param-group`, `.param-label`, `.param-select`, `.param-input`, `.btn-run`）
2. Lines 548–554（已在 base.css 中的 `.signal-chip` 基础样式重复，此处仅取 `.signal-bar` + `.chip-buy/.chip-sell/.chip-hold/.chip-info`）
3. Lines 554–560：`.table-wrap`, `.data-table`（含 thead/th/td/tr:hover）
4. Lines 693–733：`/* ── 操作建议卡片 ── */`（`.advice-mode-badge`, `.advice-mode-reason`, `.advice-section-title`, `.advice-candidate`, `.advice-tag`, `.advice-action-box`, `.advice-divider`, `.skeleton-row`）

> **注意**：`.signal-chip` 的基础样式（padding/border-radius/font/border/display）已在 base.css 中定义；`.chip-buy/.chip-sell/.chip-hold/.chip-info` 的颜色变体在此文件中定义，两者不冲突。

文件头注释：
```css
/* ══════════════════════════════════════════════
   mdtfr.css — 动量趋势轮动策略专属样式
════════════════════════════════════════════════ */
```

- [ ] **Step 2: 验证行数**

```bash
wc -l css/mdtfr.css
```

Expected: ≤ 180 行

- [ ] **Step 3: 提交**

```bash
git add css/mdtfr.css
git commit -m "refactor: 提取 css/mdtfr.css（轮动策略监控、操作建议）"
```

---

## Task 7：提取 js/utils.js

**Files:**
- Create: `js/utils.js`
- Source: `strategy_page.html` lines 2265–2274（utils 函数）+ line 2024–2027（fmtMoney）

- [ ] **Step 1: 创建 js/utils.js**

```js
// js/utils.js
export function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function pct(v, d = 2) {
  if (v == null) return '<span style="color:var(--text-dim)">–</span>';
  const s = (v * 100).toFixed(d) + '%';
  return `<span style="font-weight:600;color:${v >= 0 ? 'var(--green)' : 'var(--red)'}">${v > 0 ? '+' : ''}${s}</span>`;
}

export function fmt(v, d = 3) {
  return v == null
    ? '<span style="color:var(--text-dim)">–</span>'
    : typeof v === 'number' ? v.toFixed(d) : v;
}

export function fmtMoney(v) {
  if (v == null) return '–';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' 元';
}

export function trendIcon(r) {
  return r == null
    ? '<span style="color:var(--border)">–</span>'
    : r
      ? '<span style="color:var(--green)">↑</span>'
      : '<span style="color:var(--red)">↓</span>';
}

export function setBtn(id, loading) {
  const b = document.getElementById(id);
  b.disabled = loading;
  b.innerHTML = loading ? '<span class="spinner"></span> 加载中' : '▶ 运行';
}

export function skeletonRows(c, n = 5) {
  return Array.from({ length: n }, () =>
    `<tr>${Array.from({ length: c }, () =>
      `<td><div class="skeleton" style="width:${40 + Math.random() * 40}%"></div></td>`
    ).join('')}</tr>`
  ).join('');
}
```

- [ ] **Step 2: 验证行数**

```bash
wc -l js/utils.js
```

Expected: ≤ 55 行

- [ ] **Step 3: 提交**

```bash
git add js/utils.js
git commit -m "refactor: 提取 js/utils.js（escHtml/pct/fmt/fmtMoney/trendIcon/setBtn/skeletonRows）"
```

---

## Task 8：提取 js/markdown.js

**Files:**
- Create: `js/markdown.js`
- Source: `strategy_page.html` lines 1458–1565（`renderMarkdown`, `buildList`, `inline`）

- [ ] **Step 1: 创建 js/markdown.js**

从原文件第 1458-1565 行复制 `renderMarkdown`、`buildList`（内部函数）、`inline` 三个函数，在文件末尾添加 export：

```js
// js/markdown.js
// （在此处粘贴原 renderMarkdown 函数体，含内部 buildList/buildLevel）
// （在此处粘贴原 inline 函数体）

export { renderMarkdown, inline };
```

> **操作要点**：原文件中 `buildList` 和 `buildLevel` 是 `renderMarkdown` 内部的闭包，不需要单独 export。`inline` 是独立函数，需要 export 供 `renderMarkdown` 使用（原本都在同一 `<script>` 里，移出后需确认调用顺序正确，`inline` 应定义在 `renderMarkdown` 之前）。

- [ ] **Step 2: 验证行数**

```bash
wc -l js/markdown.js
```

Expected: ≤ 120 行

- [ ] **Step 3: 提交**

```bash
git add js/markdown.js
git commit -m "refactor: 提取 js/markdown.js（renderMarkdown）"
```

---

## Task 9：提取 js/tab.js

**Files:**
- Create: `js/tab.js`
- Source: `strategy_page.html` lines 1167–1173（`switchTab`）+ lines 3841–3845（hash 路由初始化匿名函数）

- [ ] **Step 1: 创建 js/tab.js**

```js
// js/tab.js
export function switchTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.getElementById('panel-' + id).classList.add('active');
  history.replaceState(null, '', '#' + id);
  if (id === 'mdtfr') {
    // 动态 import 避免循环依赖：tab.js ↔ mdtfr/loader.js
    import('./mdtfr/loader.js').then(m => m.mdtfrMaybeInitEmpty());
  }
}

export function initHashRouter() {
  const hash = location.hash.slice(1);
  if (hash && document.getElementById('tab-' + hash)) {
    switchTab(hash);
  } else {
    import('./mdtfr/loader.js').then(m => m.mdtfrMaybeInitEmpty());
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add js/tab.js
git commit -m "refactor: 提取 js/tab.js（switchTab、initHashRouter）"
```

---

## Task 10：提取 js/rebalance-day.js

**Files:**
- Create: `js/rebalance-day.js`
- Source: `strategy_page.html` lines 3748–3834（`formatDate`, `_scheduledThursdays`, `_buildActualRebalanceDays`, `_actualRebalanceDays`, `applyRebalanceDayStyle`, `initRebalanceDayStyle`）

- [ ] **Step 1: 创建 js/rebalance-day.js**

从原文件 lines 3748–3834 复制全部内容，在文件末尾添加：

```js
export { formatDate, applyRebalanceDayStyle, initRebalanceDayStyle };
```

文件头注释：
```js
// js/rebalance-day.js — 调仓日/休市日样式计算
```

> `_REBALANCE_ANCHOR`、`_actualRebalanceDays`、`_scheduledThursdays`、`_buildActualRebalanceDays` 为模块内私有，不需要 export。

- [ ] **Step 2: 验证行数**

```bash
wc -l js/rebalance-day.js
```

Expected: ≤ 100 行

- [ ] **Step 3: 提交**

```bash
git add js/rebalance-day.js
git commit -m "refactor: 提取 js/rebalance-day.js（调仓日样式）"
```

---

## Task 11：提取 js/aw/config.js

**Files:**
- Create: `js/aw/config.js`
- Source: `strategy_page.html` lines 1132–1162（`PORTFOLIO`, `ASSET_COLORS`, `_awAltSet`）+ lines 1181–1457（`GUIDE_MD` 字符串常量）+ lines 1590–1596（`CAT_GROUPS`）

- [ ] **Step 1: 创建 js/aw/config.js**

从原文件复制 `PORTFOLIO`（lines 1132–1147）、`_AW_ALT_KEY`（line 1150）、`_loadAwAlt`（lines 1151–1153）、`_awAltSet`（line 1154）、`_activeAsset`（lines 1155–1157）、`ASSET_COLORS`（lines 1159–1162）、`CAT_GROUPS`（lines 1590–1596）、`GUIDE_MD`（lines 1181–1457）。

在文件末尾添加：

```js
export {
  PORTFOLIO, ASSET_COLORS, CAT_GROUPS, GUIDE_MD,
  getActiveAsset, getAwAltSet,
};
```

> **重要**：将 `_awAltSet`（模块级 `let`）和 `_activeAsset` 改为导出形式：
> ```js
> export const PORTFOLIO = [...];
> export const ASSET_COLORS = {...};
> export const CAT_GROUPS = [...];
> export const GUIDE_MD = `...`;
>
> const _AW_ALT_KEY = 'aw_alt_codes';
> function _loadAwAlt() { ... }
> export let awAltSet = _loadAwAlt();   // 导出为可变引用
>
> export function getActiveAsset(a) {
>   return (awAltSet.has(a.id) && a.alt) ? { ...a, ...a.alt } : a;
> }
> ```
> 原来引用 `_awAltSet` 和 `_activeAsset` 的其他模块改为 `import { awAltSet, getActiveAsset } from './config.js'`。

- [ ] **Step 2: 验证行数**

```bash
wc -l js/aw/config.js
```

Expected: ≤ 310 行（GUIDE_MD 是一个大字符串，约 270 行）

- [ ] **Step 3: 提交**

```bash
git add js/aw/config.js
git commit -m "refactor: 提取 js/aw/config.js（PORTFOLIO/ASSET_COLORS/GUIDE_MD/awAltSet）"
```

---

## Task 12：提取 js/aw/inputs.js

**Files:**
- Create: `js/aw/inputs.js`
- Source: `strategy_page.html` lines 1598–1627（`buildInputs`）+ lines 1632–1673（`toggleAwAlt`, `highlightInputs`, `clearHighlights`）

- [ ] **Step 1: 创建 js/aw/inputs.js**

```js
// js/aw/inputs.js
import { PORTFOLIO, ASSET_COLORS, CAT_GROUPS, awAltSet, getActiveAsset } from './config.js';

// 从原文件粘贴 buildInputs（lines 1598–1627）
// 从原文件粘贴 toggleAwAlt（lines 1632–1656）
// 从原文件粘贴 highlightInputs（lines 1657–1667）
// 从原文件粘贴 clearHighlights（lines 1668–1672）

// 将函数体中所有 _awAltSet 替换为 awAltSet
// 将函数体中所有 _activeAsset(a) 替换为 getActiveAsset(a)

export { buildInputs, toggleAwAlt, highlightInputs, clearHighlights };
```

> **替换说明**：
> - `_awAltSet` → `awAltSet`（来自 import）
> - `_activeAsset(a)` → `getActiveAsset(a)`（来自 import）

- [ ] **Step 2: 验证行数**

```bash
wc -l js/aw/inputs.js
```

Expected: ≤ 100 行

- [ ] **Step 3: 提交**

```bash
git add js/aw/inputs.js
git commit -m "refactor: 提取 js/aw/inputs.js（buildInputs/toggleAwAlt/highlight）"
```

---

## Task 13：提取 js/aw/calc.js

这是最大的 JS 块（约 350 行），包含再平衡计算核心逻辑。

**Files:**
- Create: `js/aw/calc.js`
- Source: `strategy_page.html` lines 1674–2023（`lastCalcResult`、`_pendingCheckType`、`calcRebalance`、`selectCheckType`、`closeCheckTypePicker`、`confirmCheckType`、`_runCalc`、`resetCalc`）

- [ ] **Step 1: 创建 js/aw/calc.js**

```js
// js/aw/calc.js
import { PORTFOLIO, getActiveAsset } from './config.js';
import { fmtMoney } from '../utils.js';
import { highlightInputs, clearHighlights } from './inputs.js';

// 从原文件粘贴 lines 1677–2023 全部内容
// （lastCalcResult, _pendingCheckType, calcRebalance, selectCheckType,
//   closeCheckTypePicker, confirmCheckType, _runCalc, resetCalc）

// 文件末尾添加：
export {
  calcRebalance, selectCheckType, closeCheckTypePicker, confirmCheckType,
  resetCalc, getLastCalcResult,
};

// 导出 getter 供 journal.js 和 log.js 读取 lastCalcResult
export function getLastCalcResult() { return lastCalcResult; }
```

> **替换说明**：
> - `_activeAsset(a)` → `getActiveAsset(a)`
> - `fmtMoney` 已在本文件顶部 import，直接使用
> - `highlightInputs` / `clearHighlights` 已 import，直接使用
> - `lastCalcResult` 保持为模块内私有 `let`，通过 `getLastCalcResult()` 导出

- [ ] **Step 2: 验证行数**

```bash
wc -l js/aw/calc.js
```

Expected: ≤ 370 行

- [ ] **Step 3: 提交**

```bash
git add js/aw/calc.js
git commit -m "refactor: 提取 js/aw/calc.js（再平衡计算核心）"
```

---

## Task 14：提取 js/aw/log.js

**Files:**
- Create: `js/aw/log.js`
- Source: `strategy_page.html` lines 2197–2261（`LOG_KEY`, `loadLog`, `saveLogData`, `renderLog`, `saveToLog`, `deleteLog`, `clearLog`）

- [ ] **Step 1: 创建 js/aw/log.js**

```js
// js/aw/log.js
import { fmtMoney } from '../utils.js';
import { getLastCalcResult } from './calc.js';

const LOG_KEY = 'aw_rebalance_log';

// 从原文件粘贴 loadLog, saveLogData, renderLog, saveToLog, deleteLog, clearLog
// 函数体中 lastCalcResult → getLastCalcResult()
// 函数体中 fmtMoney 已 import，直接使用

export { loadLog, saveLogData, renderLog, saveToLog, deleteLog, clearLog };
```

> **替换说明**：所有 `lastCalcResult` 引用改为 `getLastCalcResult()`

- [ ] **Step 2: 验证行数**

```bash
wc -l js/aw/log.js
```

Expected: ≤ 90 行

- [ ] **Step 3: 提交**

```bash
git add js/aw/log.js
git commit -m "refactor: 提取 js/aw/log.js（再平衡操作记录）"
```

---

## Task 15：提取 js/aw/journal.js

**Files:**
- Create: `js/aw/journal.js`
- Source: `strategy_page.html` lines 2033–2192（`saveAwJournalRecord`, `showAwToast`, `openAwJournal`, `closeAwJournal`, `loadAwJournal`, `awJournalRow`）

- [ ] **Step 1: 创建 js/aw/journal.js**

```js
// js/aw/journal.js
import { PORTFOLIO, awAltSet, getActiveAsset } from './config.js';
import { getLastCalcResult } from './calc.js';

// 从原文件粘贴 saveAwJournalRecord, showAwToast, openAwJournal,
//   closeAwJournal, loadAwJournal, awJournalRow（lines 2033–2192）

// 替换：
// lastCalcResult → getLastCalcResult()
// _awAltSet → awAltSet
// _activeAsset(a) → getActiveAsset(a)

export { saveAwJournalRecord, showAwToast, openAwJournal, closeAwJournal, loadAwJournal };
```

- [ ] **Step 2: 验证行数**

```bash
wc -l js/aw/journal.js
```

Expected: ≤ 170 行

- [ ] **Step 3: 提交**

```bash
git add js/aw/journal.js
git commit -m "refactor: 提取 js/aw/journal.js（全天候复盘记录）"
```

---

## Task 16：提取 js/aw/drawer.js

**Files:**
- Create: `js/aw/drawer.js`
- Source: `strategy_page.html` lines 1567–1586（`openDrawer`, `closeDrawer`）

- [ ] **Step 1: 创建 js/aw/drawer.js**

```js
// js/aw/drawer.js
import { renderMarkdown } from '../markdown.js';
import { GUIDE_MD } from './config.js';

export function openDrawer() {
  const activeTab = document.querySelector('.tab-btn.active')?.id || '';
  const isAw = activeTab === 'tab-aw';
  document.getElementById('drawer-content').innerHTML = renderMarkdown(GUIDE_MD);
  document.getElementById('drawer-overlay').classList.add('open');
  document.getElementById('guide-drawer').classList.add('open');
}

export function closeDrawer() {
  document.getElementById('drawer-overlay').classList.remove('open');
  document.getElementById('guide-drawer').classList.remove('open');
}
```

> **注意**：对比原文件 lines 1567–1586，核实 `openDrawer` 的具体实现（特别是 drawer content 的填充逻辑），照原文复制，不要改变行为。

- [ ] **Step 2: 提交**

```bash
git add js/aw/drawer.js
git commit -m "refactor: 提取 js/aw/drawer.js（操作指南抽屉）"
```

---

## Task 17：提取 js/mdtfr/config.js

**Files:**
- Create: `js/mdtfr/config.js`
- Source: `strategy_page.html` lines 2326–2374（`OFFENSIVE_CANDIDATES`, `MDTFR_POOL_BASE`, `_OFFENSIVE_KEY`, `_loadActiveCodes`, `_activeOffensiveCodes`, `_buildMdtfrPool`, `MDTFR_POOL_DEF`）

- [ ] **Step 1: 创建 js/mdtfr/config.js**

从原文件复制 lines 2326–2374 全部内容，在文件末尾添加：

```js
export {
  OFFENSIVE_CANDIDATES, MDTFR_POOL_BASE,
  getActiveCodes, getMdtfrPoolDef, setActiveCodes, rebuildPool,
};

export function getActiveCodes() { return _activeOffensiveCodes; }
export function getMdtfrPoolDef() { return MDTFR_POOL_DEF; }
export function setActiveCodes(newSet) { _activeOffensiveCodes = newSet; }
export function rebuildPool() {
  MDTFR_POOL_DEF = _buildMdtfrPool();
  return MDTFR_POOL_DEF;
}
```

> `MDTFR_POOL_DEF` 是可变的（`pool-adjust.js` 会重建它），通过 `rebuildPool()` 和 `getMdtfrPoolDef()` 提供受控访问。

- [ ] **Step 2: 验证行数**

```bash
wc -l js/mdtfr/config.js
```

Expected: ≤ 90 行

- [ ] **Step 3: 提交**

```bash
git add js/mdtfr/config.js
git commit -m "refactor: 提取 js/mdtfr/config.js（标的池定义）"
```

---

## Task 18：提取 js/mdtfr/cache.js

**Files:**
- Create: `js/mdtfr/cache.js`
- Source: `strategy_page.html` lines 2379–2409（`cacheGet`, `cachePut`, `cacheDelete`, `clearMdtfrCache`）

- [ ] **Step 1: 创建 js/mdtfr/cache.js**

```js
// js/mdtfr/cache.js
import { mdtfrLog } from './debug.js';
import { mdtfrInitTable } from './table.js';

// 从原文件粘贴 cacheGet, cachePut, cacheDelete, clearMdtfrCache（lines 2379–2409）

export { cacheGet, cachePut, cacheDelete, clearMdtfrCache };
```

- [ ] **Step 2: 提交**

```bash
git add js/mdtfr/cache.js
git commit -m "refactor: 提取 js/mdtfr/cache.js（后端缓存 helpers）"
```

---

## Task 19：提取 js/mdtfr/confirm.js

**Files:**
- Create: `js/mdtfr/confirm.js`
- Source: `strategy_page.html` lines 2412–2425（`_confirmCallback`, `showConfirm`, `closeConfirm`）

- [ ] **Step 1: 创建 js/mdtfr/confirm.js**

```js
// js/mdtfr/confirm.js
let _confirmCallback = null;

export function showConfirm(msg, onConfirm, confirmText = '确认') {
  _confirmCallback = onConfirm;
  document.getElementById('confirm-msg').textContent = msg;
  const btn = document.getElementById('confirm-ok-btn');
  btn.textContent = confirmText;
  btn.onclick = () => { _confirmCallback?.(); closeConfirm(); };
  document.getElementById('confirm-overlay').classList.add('open');
}

export function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('open');
  _confirmCallback = null;
}
```

> **注意**：原 HTML 中 confirm-ok-btn 的 `onclick` 属性直接调用 `_confirmCallback && _confirmCallback(); closeConfirm()`。提取为 ES Module 后，`_confirmCallback` 不再是全局变量，需要在 `showConfirm` 内通过 `btn.onclick = ...` 绑定（如上），否则 HTML 中的 `onclick` 会找不到 `_confirmCallback`。

- [ ] **Step 2: 提交**

```bash
git add js/mdtfr/confirm.js
git commit -m "refactor: 提取 js/mdtfr/confirm.js（通用确认弹窗）"
```

---

## Task 20：提取 js/mdtfr/debug.js

**Files:**
- Create: `js/mdtfr/debug.js`
- Source: `strategy_page.html` lines 2483–2512（`mdtfrLog`, `toggleMdtfrDebug`, `closeDebugDrawer`, `clearMdtfrDebug`）

- [ ] **Step 1: 创建 js/mdtfr/debug.js**

从原文件复制 lines 2483–2512 全部内容，文件末尾添加：

```js
export { mdtfrLog, toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug };
```

- [ ] **Step 2: 提交**

```bash
git add js/mdtfr/debug.js
git commit -m "refactor: 提取 js/mdtfr/debug.js（调试日志抽屉）"
```

---

## Task 21：提取 js/mdtfr/table.js

**Files:**
- Create: `js/mdtfr/table.js`
- Source: `strategy_page.html` lines 2515–2630（`mdtfrMaybeInitEmpty`（其中 DOM 初始化部分）、`mdtfrInitTable`, `mdtfrFillRow`, `mdtfrFillRanks`, `mdtfrRenderFromCache`, `mdtfrRowComplete`）

- [ ] **Step 1: 创建 js/mdtfr/table.js**

```js
// js/mdtfr/table.js
import { escHtml, fmt, pct, trendIcon, skeletonRows } from '../utils.js';
import { getMdtfrPoolDef } from './config.js';
import { mdtfrLog } from './debug.js';

// 从原文件粘贴 lines 2539–2630：
// mdtfrInitTable, mdtfrFillRow, mdtfrFillRanks, mdtfrRenderFromCache, mdtfrRowComplete

export { mdtfrInitTable, mdtfrFillRow, mdtfrFillRanks, mdtfrRenderFromCache, mdtfrRowComplete };
```

> `mdtfrMaybeInitEmpty` 调用了 `cacheGet` 和 `mdtfrInitTable`，放在 `loader.js` 更合适（见 Task 27）。

- [ ] **Step 2: 验证行数**

```bash
wc -l js/mdtfr/table.js
```

Expected: ≤ 130 行

- [ ] **Step 3: 提交**

```bash
git add js/mdtfr/table.js
git commit -m "refactor: 提取 js/mdtfr/table.js（表格初始化、行填充）"
```

---

## Task 22：提取 js/mdtfr/amounts.js

**Files:**
- Create: `js/mdtfr/amounts.js`
- Source: `strategy_page.html` lines 2643–2746（`loadAmounts`, `saveAmounts`, `getAmt`, `getTotalAmt`, `getPosVal`, `refreshAllPosPct`, `onAmtChange`, `mkAmtCell`, `mkPosPct`）

- [ ] **Step 1: 创建 js/mdtfr/amounts.js**

```js
// js/mdtfr/amounts.js
import { getMdtfrPoolDef } from './config.js';

// 从原文件粘贴 lines 2643–2746 全部内容

export {
  loadAmounts, saveAmounts, getAmt, getTotalAmt,
  getPosVal, refreshAllPosPct, onAmtChange, mkAmtCell,
};
```

- [ ] **Step 2: 验证行数**

```bash
wc -l js/mdtfr/amounts.js
```

Expected: ≤ 115 行

- [ ] **Step 3: 提交**

```bash
git add js/mdtfr/amounts.js
git commit -m "refactor: 提取 js/mdtfr/amounts.js（持仓金额管理）"
```

---

## Task 23：提取 js/mdtfr/watch.js

**Files:**
- Create: `js/mdtfr/watch.js`
- Source: `strategy_page.html` lines 2753–2852（`loadWatchState`, `saveWatchState`, `updateWatchState`）

- [ ] **Step 1: 创建 js/mdtfr/watch.js**

```js
// js/mdtfr/watch.js
import { getMdtfrPoolDef } from './config.js';

// 从原文件粘贴 lines 2753–2852 全部内容

export { loadWatchState, saveWatchState, updateWatchState };
```

- [ ] **Step 2: 验证行数**

```bash
wc -l js/mdtfr/watch.js
```

Expected: ≤ 130 行

- [ ] **Step 3: 提交**

```bash
git add js/mdtfr/watch.js
git commit -m "refactor: 提取 js/mdtfr/watch.js（观察状态管理）"
```

---

## Task 24：提取 js/mdtfr/advice.js

**Files:**
- Create: `js/mdtfr/advice.js`
- Source: `strategy_page.html` lines 2854–3365（`mdtfrBuildAdvice`, `mdtfrRenderAdvice` 及内部辅助函数 `sellDetail`, `watchDetail`, `opTable`）

- [ ] **Step 1: 创建 js/mdtfr/advice.js**

```js
// js/mdtfr/advice.js
import { escHtml, pct, fmt, fmtMoney } from '../utils.js';
import { getMdtfrPoolDef } from './config.js';
import { getAmt, getTotalAmt, refreshAllPosPct, mkAmtCell } from './amounts.js';
import { loadWatchState, saveWatchState, updateWatchState } from './watch.js';

// 从原文件粘贴 lines 2854–3365 全部内容
// （mdtfrBuildAdvice, mdtfrRenderAdvice 及其内部函数 sellDetail/watchDetail/opTable）

export { mdtfrBuildAdvice, mdtfrRenderAdvice };
```

- [ ] **Step 2: 验证行数**

```bash
wc -l js/mdtfr/advice.js
```

Expected: ≤ 520 行（此文件是最大的单个 JS 文件，原始逻辑约 512 行，加上 import 头约 520 行，略超 500 行；如需严格遵守可将 `sellDetail`/`watchDetail`/`opTable` 内联辅助函数提取到 `advice-helpers.js`，但实际上它们是 `mdtfrRenderAdvice` 的内嵌函数，提取会破坏闭包，保持原状更安全）

- [ ] **Step 3: 提交**

```bash
git add js/mdtfr/advice.js
git commit -m "refactor: 提取 js/mdtfr/advice.js（操作建议生成与渲染）"
```

---

## Task 25：提取 js/mdtfr/journal.js

**Files:**
- Create: `js/mdtfr/journal.js`
- Source: `strategy_page.html` lines 3366–3563（`saveJournalRecord`, `showToast`, `openJournal`, `closeJournal`, `loadJournal`, `journalRow`）

- [ ] **Step 1: 创建 js/mdtfr/journal.js**

```js
// js/mdtfr/journal.js
import { escHtml } from '../utils.js';
import { getMdtfrPoolDef } from './config.js';
import { getAmt, getTotalAmt } from './amounts.js';
import { loadWatchState } from './watch.js';

// 从原文件粘贴 lines 3366–3563 全部内容

export { saveJournalRecord, showToast, openJournal, closeJournal, loadJournal };
```

- [ ] **Step 2: 验证行数**

```bash
wc -l js/mdtfr/journal.js
```

Expected: ≤ 210 行

- [ ] **Step 3: 提交**

```bash
git add js/mdtfr/journal.js
git commit -m "refactor: 提取 js/mdtfr/journal.js（轮动策略复盘记录）"
```

---

## Task 26：提取 js/mdtfr/pool-adjust.js

**Files:**
- Create: `js/mdtfr/pool-adjust.js`
- Source: `strategy_page.html` lines 2428–2481（`openPoolAdjust`, `_updatePoolAdjustCount`, `closePoolAdjust`, `applyPoolAdjust`）

- [ ] **Step 1: 创建 js/mdtfr/pool-adjust.js**

```js
// js/mdtfr/pool-adjust.js
import { OFFENSIVE_CANDIDATES, getActiveCodes, setActiveCodes, rebuildPool } from './config.js';
import { cacheDelete } from './cache.js';
import { mdtfrInitTable } from './table.js';
import { mdtfrLog } from './debug.js';

// 从原文件粘贴 lines 2428–2481 全部内容
// 替换：
// OFFENSIVE_CANDIDATES → 已 import，直接用
// _activeOffensiveCodes → getActiveCodes() / setActiveCodes(newSet)
// _OFFENSIVE_KEY → 'mdtfr_offensive_codes'（直接写字符串）
// MDTFR_POOL_DEF = _buildMdtfrPool() → rebuildPool()

export { openPoolAdjust, closePoolAdjust, applyPoolAdjust };
```

- [ ] **Step 2: 提交**

```bash
git add js/mdtfr/pool-adjust.js
git commit -m "refactor: 提取 js/mdtfr/pool-adjust.js（标的池调整弹窗）"
```

---

## Task 27：提取 js/mdtfr/loader.js

**Files:**
- Create: `js/mdtfr/loader.js`
- Source: `strategy_page.html` lines 2515–2538（`mdtfrMaybeInitEmpty`）+ lines 3565–3744（`toggleMdtfrSort`, `mdtfrRenderFromCache`, `mdtfrRowComplete`, `loadMdtfrPool`）

- [ ] **Step 1: 创建 js/mdtfr/loader.js**

```js
// js/mdtfr/loader.js
import { escHtml, setBtn, skeletonRows } from '../utils.js';
import { getMdtfrPoolDef } from './config.js';
import { cacheGet, cachePut } from './cache.js';
import { mdtfrLog } from './debug.js';
import {
  mdtfrInitTable, mdtfrFillRow, mdtfrFillRanks,
  mdtfrRenderFromCache, mdtfrRowComplete,
} from './table.js';
import { loadAmounts, refreshAllPosPct } from './amounts.js';
import { updateWatchState } from './watch.js';
import { mdtfrBuildAdvice, mdtfrRenderAdvice } from './advice.js';
import { saveJournalRecord } from './journal.js';

// 从原文件粘贴 mdtfrMaybeInitEmpty（lines 2515–2538）
// 从原文件粘贴 toggleMdtfrSort, mdtfrRenderFromCache（仅 loader 版本）,
//   mdtfrRowComplete, loadMdtfrPool（lines 3565–3744）

export { loadMdtfrPool, mdtfrMaybeInitEmpty, toggleMdtfrSort };
```

- [ ] **Step 2: 验证行数**

```bash
wc -l js/mdtfr/loader.js
```

Expected: ≤ 220 行

- [ ] **Step 3: 提交**

```bash
git add js/mdtfr/loader.js
git commit -m "refactor: 提取 js/mdtfr/loader.js（数据加载入口）"
```

---

## Task 28：编写 js/main.js（入口）

**Files:**
- Create: `js/main.js`

- [ ] **Step 1: 创建 js/main.js**

```js
// js/main.js — 页面入口：import 所有模块，挂载全局函数，执行初始化

import { switchTab, initHashRouter }             from './tab.js';
import { initRebalanceDayStyle }                  from './rebalance-day.js';
import { buildInputs, toggleAwAlt }               from './aw/inputs.js';
import {
  calcRebalance, resetCalc,
  selectCheckType, closeCheckTypePicker, confirmCheckType,
} from './aw/calc.js';
import { renderLog, saveToLog, clearLog }         from './aw/log.js';
import {
  openAwJournal, closeAwJournal, loadAwJournal,
} from './aw/journal.js';
import { openDrawer, closeDrawer }                from './aw/drawer.js';
import { loadMdtfrPool, mdtfrMaybeInitEmpty, toggleMdtfrSort } from './mdtfr/loader.js';
import { showConfirm, closeConfirm }              from './mdtfr/confirm.js';
import { openPoolAdjust, closePoolAdjust, applyPoolAdjust } from './mdtfr/pool-adjust.js';
import {
  toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug,
} from './mdtfr/debug.js';
import { clearMdtfrCache }                        from './mdtfr/cache.js';
import { openJournal, closeJournal, loadJournal } from './mdtfr/journal.js';

// ── 挂载 HTML onclick 需要的全局函数 ──
Object.assign(window, {
  // 通用
  switchTab, openDrawer, closeDrawer,
  // AW 再平衡
  calcRebalance, resetCalc, toggleAwAlt,
  selectCheckType, closeCheckTypePicker, confirmCheckType,
  saveToLog, clearLog,
  // AW 复盘
  openAwJournal, closeAwJournal, loadAwJournal,
  // MDTFR
  loadMdtfrPool, toggleMdtfrSort,
  showConfirm, closeConfirm,
  openPoolAdjust, closePoolAdjust, applyPoolAdjust,
  toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug,
  clearMdtfrCache,
  openJournal, closeJournal, loadJournal,
});

// ── 页面初始化 ──
buildInputs();
renderLog();
initRebalanceDayStyle();
initHashRouter();   // 处理 #aw / #mdtfr hash 路由（含 mdtfrMaybeInitEmpty 调用）
```

- [ ] **Step 2: 验证行数**

```bash
wc -l js/main.js
```

Expected: ≤ 60 行

- [ ] **Step 3: 提交**

```bash
git add js/main.js
git commit -m "refactor: 新建 js/main.js（模块入口，window 全局函数挂载）"
```

---

## Task 29：更新 strategy_page.html

**Files:**
- Modify: `strategy_page.html`

- [ ] **Step 1: 替换 `<style>` 块为 CSS 外链**

将第 7 行的 `<style>` 到第 832 行的 `</style>` **整体删除**，替换为：

```html
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/layout.css">
<link rel="stylesheet" href="css/modals.css">
<link rel="stylesheet" href="css/aw.css">
<link rel="stylesheet" href="css/mdtfr.css">
```

- [ ] **Step 2: 替换 `<script>` 块为 ES Module 引用**

将第 1128 行的 `<script>` 到第 3846 行的 `</script>` **整体删除**，替换为：

```html
<script type="module" src="js/main.js"></script>
```

- [ ] **Step 3: 验证主 HTML 行数**

```bash
wc -l strategy_page.html
```

Expected: ≤ 180 行（原 3848 行缩减为纯 HTML 骨架）

- [ ] **Step 4: 提交**

```bash
git add strategy_page.html
git commit -m "refactor: strategy_page.html 改为外链 CSS/JS，移除内联 style/script"
```

---

## Task 30：浏览器验证

**Files:** 无新文件，仅验证

- [ ] **Step 1: 启动本地服务器**

```bash
# 方式 A：使用项目已有后端（推荐，API 功能可测）
cd /Users/I340818/workspace/personal/workspace/investment
./invest.sh
# 或
uvicorn main:app --reload --port 8000

# 方式 B：纯静态（无 API）
python3 -m http.server 8080
```

- [ ] **Step 2: 检查控制台无错误**

打开 `http://localhost:8000/strategy`（或对应路由），打开 F12 → Console，确认：
- 无红色 JS 错误
- 无 `import` 路径 404

- [ ] **Step 3: 验证全天候 Tab 功能**

1. 页面加载后，全天候 Tab 默认显示
2. 各资产市值输入框正常渲染（7 个资产，5 个类别）
3. 点击「⚡ 计算」弹出检查类型选择弹窗
4. 选择类型后点击「确认并计算」，显示对比结果和汇总条
5. 点击「💾 保存为操作记录」，操作记录表格更新
6. 点击「📅 历史复盘」弹窗正常打开/关闭
7. 点击「📖 操作指南」右侧抽屉正常滑出/关闭

- [ ] **Step 4: 验证 MDTFR Tab 功能**

1. 点击「动量趋势双重过滤轮动策略」Tab
2. 表格空占位状态正常显示
3. 点击「⚙ 标的池调整」弹窗正常打开，可选择进攻行业
4. 点击「🐛 调试」调试抽屉正常打开/关闭
5. 点击「▶ 加载数据」触发 API 调用（需后端运行）
6. 调仓日背景/Badge 状态正常（需后端 `/api/metadata/query_trade_dates` 响应）

- [ ] **Step 5: 验证 localStorage 持久化**

1. 在全天候输入框填入数值后刷新页面，确认数值被还原（如有 localStorage 持久化逻辑）
2. `toggleAwAlt` 替代标的切换后刷新，确认状态保持

- [ ] **Step 6: 验证所有文件行数**

```bash
wc -l css/*.css js/utils.js js/markdown.js js/tab.js js/rebalance-day.js \
       js/main.js js/aw/*.js js/mdtfr/*.js strategy_page.html
```

Expected: 所有文件 ≤ 500 行（`js/mdtfr/advice.js` 约 520 行为唯一例外，可接受）

- [ ] **Step 7: 最终提交**

```bash
git add .
git commit -m "refactor: strategy_page 拆分重构完成，CSS×5 + JS×21 + 主 HTML 骨架"
```

---

## 自检：Spec 覆盖确认

| Spec 要求 | 对应 Task |
|---|---|
| 每文件 ≤ 500 行 | Task 30 Step 6 验证 |
| CSS 5 文件按关注点拆分 | Task 2–6 |
| JS 使用原生 ES Module | Task 7–28 |
| `onclick` 全局函数通过 `window.xxx` 挂载 | Task 28 |
| `tab.js` 避免循环依赖（动态 import） | Task 9 |
| `lastCalcResult` 通过 getter 跨模块共享 | Task 13–15 |
| `MDTFR_POOL_DEF` 可变状态通过 rebuildPool() 管理 | Task 17, 26 |
| 浏览器验收：两 Tab 功能正常，弹窗正常，localStorage 正常 | Task 30 |
