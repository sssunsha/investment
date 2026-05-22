# AW 再平衡检查类型自动判断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将再平衡计算器的"检查类型选择弹窗"改为自动判断（根据当前月份），并始终并行运行 ±10% 极端熔断检查，在结果区顶部展示判断依据横幅。

**Architecture:** `_detectCheckType()` 根据当前月份返回 `'quarterly'`（4/7/10/1 月）或 `'monthly'`（其他月份）；`calcRebalance()` 直接调用 `_runCalc(_detectCheckType())`，不再开启弹窗；`_runCalc` 内部始终额外计算 ±10% 熔断检查，并在 `#check-type-banner` 渲染判断横幅。删除弹窗 DOM、三个弹窗函数及相关的 main.js 导入。

**Tech Stack:** 原生 ES Modules（无构建工具），Vanilla JS，HTML5，无 JS 测试框架（浏览器手工验证）

---

## File Map

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `js/aw/calc.js` | 修改 | 新增 `_detectCheckType()`，改造 `calcRebalance()`，删除 3 个弹窗函数，`_runCalc` 增加并行熔断检查及横幅渲染 |
| `strategy_page.html` | 修改 | 在 `#calc-result` 内增加 `#check-type-banner` div；删除 `check-type-overlay` 弹窗区块 |
| `js/main.js` | 修改 | 移除 `selectCheckType / closeCheckTypePicker / confirmCheckType` 的 import 和 window 挂载 |
| `strategy/ray_dalio_all_weather.md` | 修改 | 季度检查时间节点：3/6/9/12月 → 4/7/10/1月 |

---

### Task 1: calc.js 全量改造 + strategy_page.html DOM 同步

这两个文件必须在同一 task 内完成：`_runCalc` 写入 `#check-type-banner`，若 DOM 里没有这个 div 会抛错；`calcRebalance` 不再打开弹窗，若弹窗 DOM 已删除但函数还在打开它也会报错。两个文件需一次提交。

**Files:**
- Modify: `js/aw/calc.js`
- Modify: `strategy_page.html`

---

- [ ] **Step 1: 删除 calc.js 顶部的 `_pendingCheckType` 变量和三个弹窗函数**

在 `js/aw/calc.js` 中，删除第 10–32 行（含注释行），即整个以下区块：

```javascript
// ── 检查类型选择器 ──
let _pendingCheckType = 'monthly';

function calcRebalance() {
  document.getElementById('check-type-overlay').classList.add('open');
}

function selectCheckType(type, labelEl) {
  _pendingCheckType = type;
  document.querySelectorAll('.check-type-option').forEach(el => el.classList.remove('selected'));
  labelEl.classList.add('selected');
  const radio = labelEl.querySelector('input[type=radio]');
  if (radio) radio.checked = true;
}

function closeCheckTypePicker() {
  document.getElementById('check-type-overlay').classList.remove('open');
}

function confirmCheckType() {
  closeCheckTypePicker();
  _runCalc(_pendingCheckType);
}
```

替换为以下两个函数：

```javascript
// ── 自动判断检查类型 ──
function _detectCheckType() {
  const month = new Date().getMonth() + 1;
  return [4, 7, 10, 1].includes(month) ? 'quarterly' : 'monthly';
}

function calcRebalance() {
  _runCalc(_detectCheckType());
}
```

---

- [ ] **Step 2: 在 `_runCalc` 中（权重计算之后、triggerResults 构建之前）插入极端熔断并行检查**

当前权重计算块结束于（`_runCalc` 内）：

```javascript
  const weights = {};
  for (const a of PORTFOLIO) { weights[a.id] = assets[a.id] / total; }
```

在这两行**之后**（即 `// ── Trigger checks` 注释之前）插入：

```javascript

  // ── 极端熔断并行检查（始终运行，与主检查类型无关）──
  const realtimeAssets = PORTFOLIO.filter(a => Math.abs(weights[a.id] - a.target) >= 0.10);
  const realtimeTriggered = realtimeAssets.length > 0;
```

---

- [ ] **Step 3: 删除 `_runCalc` 中已无用的 `checkTypeLabel` 变量定义**

定位并删除这几行（在 `triggerResults` 和 `triggeredTypes` 声明附近）：

```javascript
  const checkTypeLabel = {
    monthly:   '📅 每月检查日',
    quarterly: '📊 每季度检查日',
    realtime:  '⚡ 实时监控',
  }[checkType] || '';
```

---

- [ ] **Step 4: 在 `_runCalc` 中，`triggerResults` / `triggeredTypes` 构建完毕后，新增 `#check-type-banner` 渲染逻辑**

将以下代码块插入在 `const anyTriggered = triggeredTypes.length > 0;` 这一行**之前**：

```javascript
  // ── 渲染检查类型横幅 ──
  const _month = new Date().getMonth() + 1;
  let _bannerHtml = '';

  if (realtimeTriggered) {
    const _alertLines = realtimeAssets.map(a => {
      const _drift = (weights[a.id] - a.target) * 100;
      const _driftStr = (_drift >= 0 ? '+' : '') + _drift.toFixed(1) + '%';
      return `${a.label} 偏离 ${_driftStr}（目标${(a.target * 100).toFixed(0)}%，当前${(weights[a.id] * 100).toFixed(1)}%）`;
    }).join('；');
    _bannerHtml += `<div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);border-radius:8px;padding:10px 14px;margin-bottom:8px;color:var(--red);font-size:13px;font-weight:600;line-height:1.7">`
      + `⚡ 极端熔断！${_alertLines}<br>`
      + `<span style="font-weight:400;color:var(--text-dim)">建议立即执行再平衡，无需等待月度检查日</span></div>`;
  }

  if (checkType === 'quarterly') {
    _bannerHtml += `<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.28);border-radius:8px;padding:8px 14px;margin-bottom:10px;font-size:13px;color:var(--text-dim)">`
      + `📊 每季度检查日 ｜ 当前${_month}月，季度首月（4/7/10/1月），执行定期体检（±3%）及内部结构检查</div>`;
  } else {
    _bannerHtml += `<div style="background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.25);border-radius:8px;padding:8px 14px;margin-bottom:10px;font-size:13px;color:var(--text-dim)">`
      + `📅 每月检查日 ｜ 当前${_month}月，非季度首月，执行常规阈值检查（±5%）</div>`;
  }

  document.getElementById('check-type-banner').innerHTML = _bannerHtml;
```

---

- [ ] **Step 5: 更新 `anyTriggered` 计算，加入极端熔断**

将：

```javascript
  const anyTriggered = triggeredTypes.length > 0;
```

替换为：

```javascript
  const primaryTriggered = triggeredTypes.length > 0;
  const anyTriggered = primaryTriggered || realtimeTriggered;
  const allTriggeredTypes = [...triggeredTypes, ...(realtimeTriggered ? ['极端熔断再平衡'] : [])];
```

---

- [ ] **Step 6: 更新 trigger-status 渲染，移除 checkTypeLabel 前缀（信息已移至横幅）**

将：

```javascript
  document.getElementById('trigger-status').innerHTML =
    `<span style="font-size:13px;font-weight:700;color:var(--cyan);margin-right:4px">${checkTypeLabel}</span>` +
    '<span style="font-size:13px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-right:4px">触发点：</span>' +
    triggerResults.map(t =>
      `<span class="sum-chip ${t.triggered ? 'sum-sell' : 'sum-ok'}" title="${t.detail}">${t.triggered ? '⚠' : '✓'} ${t.label}</span>`
    ).join('');
```

替换为：

```javascript
  document.getElementById('trigger-status').innerHTML =
    '<span style="font-size:13px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-right:4px">触发点：</span>' +
    triggerResults.map(t =>
      `<span class="sum-chip ${t.triggered ? 'sum-sell' : 'sum-ok'}" title="${t.detail}">${t.triggered ? '⚠' : '✓'} ${t.label}</span>`
    ).join('');
```

---

- [ ] **Step 7: 更新 summary bar 使用 `allTriggeredTypes`**

将 summary bar 渲染中的：

```javascript
       <span class="sum-chip sum-info" style="margin-left:auto">触发：${triggeredTypes.join(' / ')}</span>`
```

替换为：

```javascript
       <span class="sum-chip sum-info" style="margin-left:auto">触发：${allTriggeredTypes.join(' / ')}</span>`
```

（注意：`availableWarning` 计算用到 `anyTriggered`，已在 Step 5 中正确更新，无需额外修改。）

---

- [ ] **Step 8: 更新 `lastCalcResult` 使用 `allTriggeredTypes`**

将：

```javascript
      triggers: triggeredTypes,
```

替换为：

```javascript
      triggers: allTriggeredTypes,
```

---

- [ ] **Step 9: 更新 calc.js 的 export，移除三个已删除函数**

将文件末尾的：

```javascript
export {
  calcRebalance, selectCheckType, closeCheckTypePicker, confirmCheckType,
  resetCalc,
};
```

替换为：

```javascript
export { calcRebalance, resetCalc };
```

---

- [ ] **Step 10: 在 `strategy_page.html` 中，于 `#calc-result` 内 `#trigger-status` 之前插入 `#check-type-banner`**

定位：

```html
          <!-- 触发点状态 -->
          <div id="trigger-status" style="margin-bottom:14px; display:flex; flex-wrap:wrap; gap:8px; align-items:center">
```

在这一行**之前**插入：

```html
          <!-- 检查类型横幅（自动判断，始终显示） -->
          <div id="check-type-banner" style="margin-bottom:4px"></div>

```

---

- [ ] **Step 11: 删除 `strategy_page.html` 中整个 `check-type-overlay` 弹窗区块**

删除以下完整区块（共 44 行，从注释到最后一个 `</div>`）：

```html
<!-- 检查类型选择弹窗 -->
<div class="check-type-overlay" id="check-type-overlay">
  <div class="check-type-modal">
    <h3>选择检查类型</h3>
    <p class="check-type-sub">不同检查日对应不同的再平衡触发机制，请根据实际情况选择：</p>
    <div class="check-type-options">
      <label class="check-type-option selected" onclick="selectCheckType('monthly', this)">
        <input type="radio" name="check-type" value="monthly" checked>
        <div class="check-type-option-text">
          <span class="check-type-option-label">📅 每月检查日</span>
          <span class="check-type-option-desc">每月第一个交易日执行的常规检查</span>
          <div class="check-type-option-tags">
            <span class="check-type-tag">常规阈值再平衡 ±5%</span>
          </div>
        </div>
      </label>
      <label class="check-type-option" onclick="selectCheckType('quarterly', this)">
        <input type="radio" name="check-type" value="quarterly">
        <div class="check-type-option-text">
          <span class="check-type-option-label">📊 每季度检查日</span>
          <span class="check-type-option-desc">每季度末（3/6/9/12月）执行的定期体检</span>
          <div class="check-type-option-tags">
            <span class="check-type-tag">定期体检再平衡 ±3%</span>
            <span class="check-type-tag">内部结构再平衡</span>
          </div>
        </div>
      </label>
      <label class="check-type-option" onclick="selectCheckType('realtime', this)">
        <input type="radio" name="check-type" value="realtime">
        <div class="check-type-option-text">
          <span class="check-type-option-label">⚡ 实时监控</span>
          <span class="check-type-option-desc">盘中或收盘后发现市场大幅波动时触发</span>
          <div class="check-type-option-tags">
            <span class="check-type-tag">极端熔断再平衡 ±10%</span>
          </div>
        </div>
      </label>
    </div>
    <div class="check-type-btns">
      <button class="btn btn-ghost btn-sm" onclick="closeCheckTypePicker()">取消</button>
      <button class="btn btn-primary btn-sm" onclick="confirmCheckType()">确认并计算</button>
    </div>
  </div>
</div>
```

---

- [ ] **Step 12: 浏览器验证（5 月份 = monthly）**

打开 `http://localhost:9001/strategy#aw`，录入若干持仓金额，点击「⚡ 计算」：

期望：
- 不弹出选择弹窗，直接展示结果区
- `#calc-result` 顶部出现蓝紫色横幅：`📅 每月检查日 ｜ 当前5月，非季度首月，执行常规阈值检查（±5%）`
- 若某资产偏离 ≥ 10%，红色警报横幅在上方，月度横幅在下方

---

- [ ] **Step 13: 提交**

```bash
git add js/aw/calc.js strategy_page.html
git commit -m "feat(aw): 再平衡检查类型改为自动判断，始终并行运行极端熔断检查"
```

---

### Task 2: main.js — 移除三个弹窗函数的 import 和 window 挂载

**Files:**
- Modify: `js/main.js`

---

- [ ] **Step 1: 更新 calc.js import，移除三个已删除函数**

将：

```javascript
import {
  calcRebalance, resetCalc,
  selectCheckType, closeCheckTypePicker, confirmCheckType,
} from './aw/calc.js';
```

替换为：

```javascript
import { calcRebalance, resetCalc } from './aw/calc.js';
```

---

- [ ] **Step 2: 从 `Object.assign(window, {...})` 中移除三个函数**

将：

```javascript
  // AW 再平衡
  calcRebalance, resetCalc, toggleAwAlt,
  selectCheckType, closeCheckTypePicker, confirmCheckType,
```

替换为：

```javascript
  // AW 再平衡
  calcRebalance, resetCalc, toggleAwAlt,
```

---

- [ ] **Step 3: 浏览器验证**

打开 `http://localhost:9001/strategy#aw`，检查浏览器 Console 无 `selectCheckType is not defined` 等错误，⚡ 计算功能正常。

---

- [ ] **Step 4: 提交**

```bash
git add js/main.js
git commit -m "chore(aw): 从 main.js 移除弹窗函数 import 和 window 挂载"
```

---

### Task 3: strategy/ray_dalio_all_weather.md — 更新季度检查时间节点

**Files:**
- Modify: `strategy/ray_dalio_all_weather.md`

---

- [ ] **Step 1: 更新再平衡触发矩阵表 — 定期体检行**

定位并替换（约第 108 行）：

原文：
```markdown
| **定期体检再平衡** | **每季度末** (3/6/9/12月) | **无条件检查**        | 即使未触发±5%，若季度末偏离度超过 **±3%**，也进行微调。防止资产在"阈值边缘"长期漂移。                      |
```

改为：
```markdown
| **定期体检再平衡** | **每季度初** (4/7/10/1月第一个交易日) | **无条件检查**        | 即使未触发±5%，若季度初偏离度超过 **±3%**，也进行微调。防止资产在"阈值边缘"长期漂移。                      |
```

---

- [ ] **Step 2: 更新再平衡触发矩阵表 — 内部结构行**

定位并替换（约第 110 行）：

原文：
```markdown
| **内部结构再平衡** | **仅在季度体检时检查**    | **比例偏离 > 50%**    | 仅在股票内部(300/500)或债券内部(国开/国债)比例严重失衡时调整。平时不做内部倒仓。                           |
```

改为：
```markdown
| **内部结构再平衡** | **仅在季度体检时检查**（4/7/10/1月） | **比例偏离 > 50%**    | 仅在股票内部(300/500)或债券内部(国开/国债)比例严重失衡时调整。平时不做内部倒仓。                           |
```

---

- [ ] **Step 3: 更新关键时间节点备忘**

定位（约第 238 行）：

原文：
```markdown
- **季度末**：定期再平衡检查
```

改为：
```markdown
- **季度初（4/7/10/1月第一个交易日）**：定期再平衡检查
```

---

- [ ] **Step 4: 提交**

```bash
git add strategy/ray_dalio_all_weather.md
git commit -m "docs(strategy): 季度再平衡检查时间节点更正为季度初（4/7/10/1月）"
```
