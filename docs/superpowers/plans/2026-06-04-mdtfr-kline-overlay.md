# MDTFR K线图浮层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MDTFR 标的池动量监控表格每行新增 radio button，选中后在「20日均量」至「份额」列区域上方显示该标的新浪静态 ETF K 线图浮层，支持日K/周K/月K切换。

**Architecture:** 新建 `js/mdtfr/kline-overlay.js` 负责浮层 DOM 的全部逻辑（创建、定位、URL生成、开关）；`table.js` 只负责在 thead 和每个 tr 插入 radio td，并在 radio click 时调用 overlay 模块的公开函数；CSS 样式写入 `css/mdtfr.css`。

**Tech Stack:** Vanilla JS ES modules, 新浪静态图片 URL (`image.sinajs.cn`), CSS absolute positioning

---

## 文件变更清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `js/mdtfr/kline-overlay.js` | **新建** | 浮层 DOM、定位计算、图片 URL、周期切换、开/关 |
| `js/mdtfr/table.js` | 修改 | thead 加 radio 列；每行 tr 加 radio td；radio click 调用 overlay |
| `css/mdtfr.css` | 修改 | 浮层容器、标题栏、周期按钮、radio 样式 |

---

### Task 1: CSS 样式 — radio 列和 K 线图浮层

**Files:**
- Modify: `css/mdtfr.css`

- [ ] **Step 1: 在 `css/mdtfr.css` 末尾追加以下样式**

```css
/* ── K线图浮层 ── */
.kline-overlay {
  position: absolute;
  z-index: 20;
  background: rgba(15, 17, 23, 0.96);
  backdrop-filter: blur(4px);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
}

.kline-overlay-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface2);
}

.kline-overlay-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  flex: 1;
}

.kline-overlay-code {
  font-size: 11px;
  color: var(--text-dim);
}

.kline-period-btn {
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,.15);
  background: transparent;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  transition: all .15s;
}

.kline-period-btn.active,
.kline-period-btn:hover {
  background: rgba(255,255,255,.1);
  color: var(--text);
  border-color: rgba(255,255,255,.3);
}

.kline-close-btn {
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,.12);
  background: transparent;
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  margin-left: 4px;
  line-height: 1;
}

.kline-close-btn:hover {
  background: rgba(239,68,68,.2);
  color: var(--red);
  border-color: rgba(239,68,68,.4);
}

.kline-img-wrap {
  overflow: hidden;
  position: relative;
  /* 内容区比例 294/511 ≈ 57.5% */
  padding-bottom: 57.5%;
  height: 0;
  background: #fff;
}

.kline-img-wrap img {
  position: absolute;
  /* 裁去白边: left=19px, top=4px；原图 545px 宽，内容 511px 宽 → scale=545/511 */
  height: auto;
}

/* Radio button 列 */
.kline-radio-th {
  width: 32px;
  min-width: 32px;
  padding: 0 !important;
}

.kline-radio-td {
  text-align: center;
  padding: 0 !important;
  width: 32px;
}

.kline-radio {
  appearance: none;
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,.25);
  background: transparent;
  cursor: pointer;
  vertical-align: middle;
  transition: all .15s;
}

.kline-radio:checked {
  border-color: var(--green);
  background: var(--green);
  box-shadow: 0 0 6px rgba(34,197,94,.5);
}

.kline-radio:hover {
  border-color: rgba(255,255,255,.5);
}
```

- [ ] **Step 2: 验证样式加载无报错**

打开浏览器控制台，刷新 `http://localhost:9001/strategy#mdtfr`，确认 CSS 无语法报错。

- [ ] **Step 3: Commit**

```bash
git add css/mdtfr.css
git commit -m "feat(mdtfr): add CSS styles for kline overlay and radio column"
```

---

### Task 2: 新建 `kline-overlay.js` — 浮层核心逻辑

**Files:**
- Create: `js/mdtfr/kline-overlay.js`

- [ ] **Step 1: 创建文件，内容如下**

```js
// js/mdtfr/kline-overlay.js
// K线图浮层：负责浮层 DOM 的创建、定位、图片 URL 生成、周期切换、开/关。

let _overlay = null;       // 当前浮层 DOM 元素
let _activePeriod = 'daily'; // 当前周期
let _activeCodeC = null;   // 当前选中的 code_c
let _activeEtf = null;     // 当前 ETF 代码
let _activeName = null;    // 当前基金名称

/** ETF 代码 → 新浪交易所前缀 */
function _exchange(etf) {
  return (etf.startsWith('1') || etf.startsWith('56')) ? 'sz' : 'sh';
}

/** 生成新浪静态图片 URL */
function _imgUrl(etf, period) {
  return `https://image.sinajs.cn/newchart/${period}/n/${_exchange(etf)}${etf}.gif`;
}

/** 计算浮层的 left/width：对齐「20日均量」列左边缘到「份额」列右边缘 */
function _calcPosition(wrap) {
  // 第4列(index 3) = 20日均量；第13列(index 12) = 份额
  const ths = wrap.querySelectorAll('thead th');
  if (ths.length < 13) return null;
  const wrapRect  = wrap.getBoundingClientRect();
  const leftRect  = ths[3].getBoundingClientRect();
  const rightRect = ths[12].getBoundingClientRect();
  return {
    left:  leftRect.left  - wrapRect.left,
    width: rightRect.right - leftRect.left,
  };
}

/** 更新浮层图片（切换周期或切换标的） */
function _updateImg(etf, period) {
  if (!_overlay) return;
  const wrap = _overlay.querySelector('.kline-img-wrap');
  const img  = wrap?.querySelector('img');
  if (!img) return;
  img.src = _imgUrl(etf, period) + '?t=' + Date.now();
}

/** 设置图片 CSS 裁剪（onload 后调用，用实际容器宽度计算 px 值） */
function _applyImgCrop(img) {
  const containerW = img.parentElement.offsetWidth;
  // 原图 545px 宽，内容 511px，scale = containerW / 511
  const scale = containerW / 511;
  img.style.width = (545 * scale) + 'px';
  img.style.top   = (-4  * scale) + 'px';
  img.style.left  = (-19 * scale) + 'px';
}

/** 创建浮层 DOM 并挂载到 .mdtfr-table-wrap */
function _createOverlay(wrap, name, etf, codeC) {
  const el = document.createElement('div');
  el.className = 'kline-overlay';
  el.id = 'mdtfr-kline-overlay';

  el.innerHTML = `
    <div class="kline-overlay-header">
      <span class="kline-overlay-name">${name}</span>
      <span class="kline-overlay-code">${_exchange(etf).toUpperCase()}:${etf}</span>
      <button class="kline-period-btn active" data-period="daily">日K</button>
      <button class="kline-period-btn" data-period="weekly">周K</button>
      <button class="kline-period-btn" data-period="monthly">月K</button>
      <button class="kline-close-btn" title="关闭">×</button>
    </div>
    <div class="kline-img-wrap">
      <img src="" alt="${name} K线图" crossorigin="anonymous">
    </div>`;

  // 周期切换
  el.querySelectorAll('.kline-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activePeriod = btn.dataset.period;
      el.querySelectorAll('.kline-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _updateImg(_activeEtf, _activePeriod);
    });
  });

  // 关闭按钮
  el.querySelector('.kline-close-btn').addEventListener('click', () => closeOverlay());

  // 图片加载后应用裁剪
  const img = el.querySelector('img');
  img.addEventListener('load', () => _applyImgCrop(img));

  // 窗口 resize 时重新计算裁剪
  const _resizeHandler = () => {
    _positionOverlay(wrap);
    _applyImgCrop(img);
  };
  window.addEventListener('resize', _resizeHandler);
  el._resizeHandler = _resizeHandler;

  wrap.appendChild(el);
  return el;
}

/** 设置浮层位置 */
function _positionOverlay(wrap) {
  if (!_overlay) return;
  const pos = _calcPosition(wrap);
  if (!pos) return;
  _overlay.style.left  = pos.left  + 'px';
  _overlay.style.width = pos.width + 'px';
  _overlay.style.top   = '0px';
}

/**
 * 打开或切换浮层
 * @param {HTMLElement} wrap   - .mdtfr-table-wrap 元素
 * @param {string} codeC       - 标的 code_c
 * @param {string} etf         - 场内ETF代码（6位）
 * @param {string} name        - 基金名称
 */
export function openOverlay(wrap, codeC, etf, name) {
  if (_activeCodeC === codeC && _overlay) {
    // 同一标的再次点击 → 关闭
    closeOverlay();
    return;
  }

  // 关闭旧浮层（不同标的）
  if (_overlay) {
    _overlay.remove();
    if (_overlay._resizeHandler) window.removeEventListener('resize', _overlay._resizeHandler);
    _overlay = null;
  }

  _activeCodeC  = codeC;
  _activeEtf    = etf;
  _activeName   = name;
  _activePeriod = 'daily';

  _overlay = _createOverlay(wrap, name, etf, codeC);
  _positionOverlay(wrap);

  // 加载图片（加时间戳防缓存）
  const img = _overlay.querySelector('img');
  img.src = _imgUrl(etf, _activePeriod) + '?t=' + Date.now();
}

/** 关闭浮层，同时取消 radio 选中 */
export function closeOverlay() {
  if (_overlay) {
    if (_overlay._resizeHandler) window.removeEventListener('resize', _overlay._resizeHandler);
    _overlay.remove();
    _overlay = null;
  }
  _activeCodeC = null;
  _activeEtf   = null;
  _activeName  = null;
  // 取消所有 radio 选中
  document.querySelectorAll('input.kline-radio').forEach(r => { r.checked = false; });
}

/** 当前选中的 code_c（供 table.js toggle 判断） */
export function getActiveCodeC() { return _activeCodeC; }
```

- [ ] **Step 2: 验证文件语法（grep 关键导出）**

```bash
grep -n "^export function" js/mdtfr/kline-overlay.js
```

期望输出：
```
XX:export function openOverlay(wrap, codeC, etf, name) {
XX:export function closeOverlay() {
XX:export function getActiveCodeC() { return _activeCodeC; }
```

- [ ] **Step 3: Commit**

```bash
git add js/mdtfr/kline-overlay.js
git commit -m "feat(mdtfr): add kline-overlay.js with overlay open/close/position logic"
```

---

### Task 3: 修改 `table.js` — 插入 radio 列并绑定事件

**Files:**
- Modify: `js/mdtfr/table.js`

- [ ] **Step 1: 在 `table.js` 顶部 import 区追加 overlay 导入**

当前 import 区（第 1-4 行）：
```js
// js/mdtfr/table.js
import { escHtml } from '../utils.js';
import { getMdtfrPoolDef } from './config.js';
import { mkAmtCell, mkPosPct, getShares, getDynAmt, refreshAmtPnl } from './amounts.js';
```

改为：
```js
// js/mdtfr/table.js
import { escHtml } from '../utils.js';
import { getMdtfrPoolDef } from './config.js';
import { mkAmtCell, mkPosPct, getShares, getDynAmt, refreshAmtPnl } from './amounts.js';
import { openOverlay, closeOverlay, getActiveCodeC } from './kline-overlay.js';
```

- [ ] **Step 2: 在 `mkRow` 函数中，`<tr>` 的第一个 `<td>` 前插入 radio td**

找到 `mkRow` 函数的 return 语句（第 17 行），当前第一个 td 是排名列：
```js
  const mkRow = (def) => `<tr id="mdtfr-row-${def.code_c}">
    <td id="mdtfr-rank-${def.code_c}">...
```

改为（在 `<tr>` 后、排名 td 前插入 radio td）：
```js
  const mkRow = (def) => `<tr id="mdtfr-row-${def.code_c}">
    <td class="kline-radio-td"><input class="kline-radio" type="radio" name="kline-select" value="${def.code_c}" data-etf="${def.etf}" data-name="${escHtml(def.name)}"></td>
    <td id="mdtfr-rank-${def.code_c}">...
```

- [ ] **Step 3: 在 `<thead>` 第一个 `<th>` 前插入空白 radio 列头**

找到 thead（第 43-44 行）：
```js
        <thead><tr>
          <th>排名</th>
```

改为：
```js
        <thead><tr>
          <th class="kline-radio-th"></th>
          <th>排名</th>
```

- [ ] **Step 4: 在 `.mdtfr-table-wrap` div 上加 `position:relative` style**

找到第 41 行：
```js
    <div class="mdtfr-table-wrap">
```

改为：
```js
    <div class="mdtfr-table-wrap" style="position:relative">
```

- [ ] **Step 5: 在 `mdtfrInitTable` 的 `setTimeout` 回调末尾追加 radio 事件绑定**

找到 `setTimeout` 块（第 68 行开始），在其回调函数末尾（所有现有代码之后，`}` 闭合之前）追加：

```js
    // K线图 radio 事件绑定
    const wrap = document.querySelector('.mdtfr-table-wrap');
    document.querySelectorAll('input.kline-radio').forEach(radio => {
      radio.addEventListener('click', () => {
        const codeC = radio.value;
        const etf   = radio.dataset.etf;
        const name  = radio.dataset.name;
        if (getActiveCodeC() === codeC) {
          // 同一标的再次点击 → toggle 关闭
          radio.checked = false;
          closeOverlay();
        } else {
          openOverlay(wrap, codeC, etf, name);
        }
      });
    });
```

- [ ] **Step 6: 验证 grep 确认改动正确**

```bash
grep -n "kline-radio\|openOverlay\|closeOverlay\|kline-radio-th" js/mdtfr/table.js
```

期望输出包含：`kline-radio-th`、`kline-radio-td`、`kline-radio`、`openOverlay`、`closeOverlay`、`getActiveCodeC`

- [ ] **Step 7: Commit**

```bash
git add js/mdtfr/table.js
git commit -m "feat(mdtfr): add radio column to pool table and wire kline overlay"
```

---

### Task 4: 验收测试

**Files:**（无代码修改，纯验收）

- [ ] **Step 1: 启动服务并打开页面**

```bash
# 确认服务已运行
curl -s http://localhost:9001/strategy -o /dev/null -w "%{http_code}\n"
```

打开 `http://localhost:9001/strategy#mdtfr`，点击「▶ 加载数据」。

- [ ] **Step 2: 验证 radio 列出现**

表格每行最左侧应有一个小圆形 radio button，表头最左列为空白。

- [ ] **Step 3: 验证浮层打开**

点击任意一行的 radio → 浮层出现，位置覆盖「20日均量」至「份额」列，显示该标的 K 线图（图片可能需要 1-2 秒加载）。

- [ ] **Step 4: 验证周期切换**

浮层打开后，点击「周K」→ 图片更新为周线图；点击「月K」→ 月线图；点击「日K」→ 日线图。

- [ ] **Step 5: 验证关闭方式**

a. 点击浮层右上角「×」→ 浮层消失，radio 取消选中  
b. 再次点击同一 radio → 浮层消失  
c. 点击另一行 radio → 浮层切换到新标的

- [ ] **Step 6: 验证多个标的图片可加载**

分别点击「沪深300」(510300→sh)、「创业板」(159915→sz)、「半导体」(512480→sh)、「中药」(560080→sh)，确认每张图片均能正确显示（前缀规则覆盖各种开头）。

- [ ] **Step 7: 运行测试套件**

```bash
npm test
```

期望：76 tests passed（无新失败）

- [ ] **Step 8: 最终 commit（如有遗漏样式微调）**

```bash
git add -p  # 只 stage 实际改动
git commit -m "fix(mdtfr): kline overlay style tweaks after manual verification"
```

---

## 验证清单

1. [ ] 表格每行最前面有 radio button
2. [ ] 点击 radio → 浮层出现在「20日均量」至「份额」列上方，显示对应 ETF 日K图
3. [ ] 日K / 周K / 月K 切换按钮正常工作
4. [ ] 点击「×」或同一 radio → 浮层消失，radio 取消选中
5. [ ] 切换到另一标的 → 浮层更新内容
6. [ ] 所有前缀验证：sz(15x/56x)、sh(51x/58x/518x) 图片均可加载
7. [ ] 浮层不遮挡表格左侧排名/名称/涨跌列
8. [ ] 窗口 resize 后浮层位置和图片裁剪自动更新
