# strategy_page.html 拆分重构设计文档

**日期**：2026-04-16  
**项目**：`/Users/I340818/workspace/personal/workspace/investment`  
**目标**：将 3848 行的单文件 HTML（CSS/HTML/JS 混合）拆分为模块化工程结构，每个文件不超过 500 行，使用原生 ES Module（`<script type="module">`），无需构建工具。

---

## 一、背景与约束

- 当前 `strategy_page.html`：3848 行，含 CSS 825 行 + HTML 296 行 + JS 2720 行
- 无构建工具（Vite/Webpack），使用原生 ES Module，现代浏览器直接支持
- HTML 中大量 `onclick="xxx()"` 内联事件，依赖全局函数
- 解决方案：在 `js/main.js` 中将需要被 HTML 调用的函数统一挂载到 `window`（约 25 个），HTML 不做改动

---

## 二、目录结构

```
investment/
├── strategy_page.html          ← 主入口，纯 HTML 骨架 (~160行)
│
├── css/
│   ├── base.css                ← CSS变量、reset、通用组件(btn/form/spinner) (~180行)
│   ├── layout.css              ← header、tab-bar、section-card、aw-layout (~160行)
│   ├── modals.css              ← 所有弹窗(journal/confirm/check-type/pool-adjust/drawer) (~180行)
│   ├── aw.css                  ← 再平衡专属(compare/summary-bar/op-plans/log-table) (~160行)
│   └── mdtfr.css               ← 轮动策略专属(signal-bar/advice/rank-badge/data-table) (~160行)
│
└── js/
    ├── main.js                 ← 唯一入口：import所有模块 + window挂载 (~60行)
    ├── utils.js                ← escHtml,pct,fmt,fmtMoney,trendIcon,setBtn,skeletonRows (~50行)
    ├── markdown.js             ← renderMarkdown(),inline(),buildList() (~110行)
    ├── tab.js                  ← switchTab(),initHashRouter() (~30行)
    ├── rebalance-day.js        ← formatDate,scheduledThursdays,applyStyle,initRebalanceDayStyle (~90行)
    │
    ├── aw/
    │   ├── config.js           ← PORTFOLIO,ASSET_COLORS,GUIDE_MD,getActiveAsset,awAltSet (~200行)
    │   ├── inputs.js           ← buildInputs(),toggleAwAlt(),highlightInputs(),clearHighlights() (~90行)
    │   ├── calc.js             ← calcRebalance(),_runCalc(),resetCalc(),checkType相关 (~350行)
    │   ├── log.js              ← loadLog(),saveLogData(),renderLog(),saveToLog(),deleteLog(),clearLog() (~80行)
    │   ├── journal.js          ← openAwJournal(),closeAwJournal(),loadAwJournal(),showAwToast() (~100行)
    │   └── drawer.js           ← openDrawer(),closeDrawer(),drawer渲染 (~40行)
    │
    └── mdtfr/
        ├── config.js           ← OFFENSIVE_CANDIDATES,MDTFR_POOL_BASE,loadActiveCodes(),buildMdtfrPool() (~80行)
        ├── cache.js            ← cacheGet(),cachePut(),cacheDelete(),clearMdtfrCache() (~60行)
        ├── table.js            ← mdtfrInitTable(),mdtfrFillRow(),mdtfrFillRanks(),mdtfrRenderFromCache() (~120行)
        ├── amounts.js          ← loadAmounts(),saveAmounts(),getAmt(),getTotalAmt(),mkAmtCell(),onAmtChange() (~100行)
        ├── watch.js            ← loadWatchState(),saveWatchState(),updateWatchState() (~120行)
        ├── advice.js           ← mdtfrBuildAdvice(),mdtfrRenderAdvice() (~200行)
        ├── journal.js          ← openJournal(),closeJournal(),loadJournal(),journalRow(),showToast() (~120行)
        ├── debug.js            ← mdtfrLog(),toggleMdtfrDebug(),closeDebugDrawer(),clearMdtfrDebug() (~60行)
        ├── pool-adjust.js      ← openPoolAdjust(),closePoolAdjust(),applyPoolAdjust() (~60行)
        ├── confirm.js          ← showConfirm(),closeConfirm() (~30行)
        └── loader.js           ← loadMdtfrPool(),mdtfrMaybeInitEmpty(),toggleMdtfrSort() (~130行)
```

---

## 三、CSS 拆分细节

### css/base.css
- `:root` 所有 CSS 变量（`--bg`, `--surface`, `--border`, `--text` 等）
- `*` reset（box-sizing, margin, padding）
- `body` 基础样式
- 通用组件：`.btn` 及其变体（`-primary/-ghost/-sm/-success`）
- 表单：`.form-field / .form-label / .form-input / .form-grid`
- 辅助：`.spinner / .skeleton / .tag-* / .signal-chip / .empty-state / .updated-note / .op-footnote`

### css/layout.css
- 页头：`.page-header / .btn-home / .btn-guide / .header-date / .rebalance-badge`
- 调仓日/休市日主题：`body.rebalance-day / body.holiday-day`（含子元素覆盖）
- Tab：`.tab-bar / .tab-btn / .tab-dot / .tab-panel`
- 卡片骨架：`.aw-layout / .section-card / .section-head / .section-body / .section-icon / .section-title / .section-actions`

### css/modals.css
- Guide 抽屉：`.drawer-overlay / .drawer / .drawer-header / .drawer-body`（含 drawer-body 内 markdown 渲染：h1/h2/table/code/pre/blockquote）
- 复盘弹窗：`.journal-overlay / .journal-modal / .journal-modal-head / .journal-table-wrap`
- 确认弹窗：`.confirm-overlay / .confirm-modal / .confirm-btns`
- 检查类型弹窗：`.check-type-overlay / .check-type-modal / .check-type-option / .check-type-tag / .check-type-btns`
- 标的池调整弹窗：`.pool-adjust-overlay / .pool-adjust-modal / .pool-adjust-head / .pool-adjust-body / .pool-adjust-foot`

### css/aw.css
- 再平衡对比表：`.compare-wrap / .compare-head / .compare-head-cell / .compare-row`
- 操作芯片：`.op-chip（.buy/.sell/.hold）/ .op-arrow`
- 资产行：`.category-row / .asset-row / .asset-highlight`
- 汇总条：`.summary-bar`
- 操作方案：`.op-plans-grid / .op-plan-card / .op-plan-step`
- 操作记录表：`.log-table-wrap / .log-table`

### css/mdtfr.css
- 数据表格：`.data-table / .table-wrap`
- 信号条：`.signal-bar / .signal-chip`（`.chip-buy / .chip-hold / .chip-info`）
- 排名徽章：`.rank-badge（.rank-top / .rank-mid）`
- 操作建议：`.advice-card / .advice-header / .advice-section / .before-after-table`
- 标的池调整列表：`.pool-adjust-list / .pool-adjust-item`

**`<head>` 引入顺序（顺序不可乱）：**
```html
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/layout.css">
<link rel="stylesheet" href="css/modals.css">
<link rel="stylesheet" href="css/aw.css">
<link rel="stylesheet" href="css/mdtfr.css">
```

---

## 四、JS 模块接口

### 模块导出表

| 文件 | 导出 | 依赖 |
|---|---|---|
| `utils.js` | `escHtml, pct, fmt, fmtMoney, trendIcon, setBtn, skeletonRows` | 无 |
| `markdown.js` | `renderMarkdown` | 无 |
| `tab.js` | `switchTab, initHashRouter` | `mdtfr/loader.js`（动态import，避免循环） |
| `rebalance-day.js` | `initRebalanceDayStyle, applyRebalanceDayStyle` | 无 |
| `aw/config.js` | `PORTFOLIO, ASSET_COLORS, GUIDE_MD, getActiveAsset, awAltSet` | 无 |
| `aw/inputs.js` | `buildInputs, toggleAwAlt, highlightInputs, clearHighlights` | `aw/config.js` |
| `aw/calc.js` | `calcRebalance, resetCalc, selectCheckType, closeCheckTypePicker, confirmCheckType` | `aw/config.js, utils.js, aw/inputs.js` |
| `aw/log.js` | `loadLog, saveLogData, renderLog, saveToLog, deleteLog, clearLog` | `utils.js` |
| `aw/journal.js` | `openAwJournal, closeAwJournal, loadAwJournal, awJournalRow, showAwToast` | `utils.js` |
| `aw/drawer.js` | `openDrawer, closeDrawer` | `markdown.js, aw/config.js` |
| `mdtfr/config.js` | `OFFENSIVE_CANDIDATES, MDTFR_POOL_BASE, loadActiveCodes, buildMdtfrPool` | 无 |
| `mdtfr/cache.js` | `cacheGet, cachePut, cacheDelete, clearMdtfrCache` | 无 |
| `mdtfr/table.js` | `mdtfrInitTable, mdtfrFillRow, mdtfrFillRanks, mdtfrRenderFromCache` | `utils.js, mdtfr/config.js` |
| `mdtfr/amounts.js` | `loadAmounts, saveAmounts, getAmt, getTotalAmt, getPosVal, mkAmtCell, refreshAllPosPct, onAmtChange` | `utils.js` |
| `mdtfr/watch.js` | `loadWatchState, saveWatchState, updateWatchState` | `mdtfr/config.js` |
| `mdtfr/advice.js` | `mdtfrBuildAdvice, mdtfrRenderAdvice` | `utils.js, mdtfr/amounts.js, mdtfr/watch.js` |
| `mdtfr/journal.js` | `openJournal, closeJournal, loadJournal, journalRow, showToast` | `utils.js` |
| `mdtfr/debug.js` | `mdtfrLog, toggleMdtfrDebug, closeDebugDrawer, clearMdtfrDebug` | 无 |
| `mdtfr/pool-adjust.js` | `openPoolAdjust, closePoolAdjust, applyPoolAdjust` | `mdtfr/config.js` |
| `mdtfr/confirm.js` | `showConfirm, closeConfirm` | 无 |
| `mdtfr/loader.js` | `loadMdtfrPool, mdtfrMaybeInitEmpty, toggleMdtfrSort` | 上面所有 mdtfr/* |

### main.js 结构（window 挂载清单）

```js
// 挂载 HTML onclick 所需的全局函数（共 ~25 个）
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
```

### 循环依赖预防

`tab.js` 中 `switchTab()` 调用 `mdtfrMaybeInitEmpty()`，若静态 import 会形成 `tab ↔ loader` 循环。解决方式：在 `tab.js` 内使用动态 import：

```js
// tab.js
async function switchTab(id) {
  // ...
  if (id === 'mdtfr') {
    const { mdtfrMaybeInitEmpty } = await import('./mdtfr/loader.js');
    mdtfrMaybeInitEmpty();
  }
}
```

---

## 五、主 HTML 结构

`strategy_page.html` 拆分后只保留：
1. `<head>`：meta + title + 5 个 `<link rel="stylesheet">`
2. `<body>`：页头、tab-bar、两个 tab-panel、所有弹窗 DOM（不变）
3. 页尾一行：`<script type="module" src="js/main.js"></script>`

原有 `<style>` 和 `<script>` 块完全移除。

---

## 六、实施顺序

1. 创建目录结构（`css/`, `js/aw/`, `js/mdtfr/`）
2. 拆分 CSS（5 个文件）
3. 拆分 JS 工具层（`utils.js`, `markdown.js`, `tab.js`, `rebalance-day.js`）
4. 拆分 AW 模块（`aw/config.js` → `aw/inputs.js` → `aw/calc.js` → `aw/log.js` → `aw/journal.js` → `aw/drawer.js`，按依赖顺序）
5. 拆分 MDTFR 模块（`mdtfr/config.js` → `mdtfr/cache.js` → `mdtfr/table.js` → `mdtfr/amounts.js` → `mdtfr/watch.js` → `mdtfr/advice.js` → `mdtfr/journal.js` → `mdtfr/debug.js` → `mdtfr/pool-adjust.js` → `mdtfr/confirm.js` → `mdtfr/loader.js`）
6. 编写 `js/main.js`（import 所有模块 + window 挂载 + 初始化调用）
7. 更新 `strategy_page.html`（移除内联 CSS/JS，改为外链）
8. 浏览器验证两个 Tab 功能正常

---

## 七、验收标准

- [ ] 所有文件行数 ≤ 500 行
- [ ] 浏览器打开 `strategy_page.html`，全天候 Tab 再平衡计算功能正常
- [ ] 动量趋势 Tab 加载数据、操作建议渲染正常
- [ ] 弹窗（复盘/确认/检查类型/标的池调整/Guide 抽屉）均可正常打开关闭
- [ ] localStorage 持久化功能（持仓金额、观察状态、操作记录）正常
- [ ] 调仓日/休市日背景主题正常切换
- [ ] 无 JS 控制台报错
