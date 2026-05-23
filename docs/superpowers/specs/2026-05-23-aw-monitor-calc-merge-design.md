# AW 监控表与再平衡计算器合并设计

**日期：** 2026-05-23  
**范围：** `strategy_page.html`、`js/aw/calc.js`、`js/aw/inputs.js`、`js/aw/monitor.js`、`js/main.js`、`css/aw.css`

---

## 一、需求概述

将「再平衡计算器」顶部的资产输入区（`#asset-inputs`）整合进「全天候标的监控」表格，消除冗余的输入层。具体变化：

1. 主力/替代切换按钮移入监控表「类型」列
2. 目标占比（`target %`）在监控表中已有「仓位%」列，再新增「目标%」列展示期望权重
3. ⚡ 计算 / ↺ 重置 按钮移到监控 section-head
4. 计算后在监控表行上变色（买入绿/卖出红），取代原来输入框的高亮
5. 删除「再平衡计算器」卡片；`#calc-result` 提升为独立的「再平衡结果」卡片

---

## 二、页面布局

### 2.1 新卡片结构（从上到下）

```
┌─────────────────────────────────────────────────────────────┐
│ 📈 全天候标的监控                                              │
│  section-head：[总金额] [总收益] [可用金额] ... [⚡ 计算] [↺ 重置] [🐛] [🗑] [▶ 加载] │
│  监控表（含持仓金额输入、份额、仓位%、目标%，行高亮）            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 🧮 再平衡结果（默认隐藏，计算后展示）                           │
│  total-hint / check-type-banner / trigger-status            │
│  compare-rows / calc-summary / op-plans / save-log-btn      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 📋 再平衡操作记录（不变）                                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 删除的原「再平衡计算器」卡片

删除整个 `section-card`，内含：
- section-head（含原 ⚡/↺ 按钮）
- `#total-hint` div
- `#asset-inputs` div（所有 `inp-{id}` 输入框）

`#calc-result` 内容**原样保留**，移到新独立卡片中。

---

## 三、监控表变化

### 3.1 新增列：目标%

在「仓位%」列旁边新增一列「目标%」，只读显示 `(a.target * 100).toFixed(0) + '%'`。

建议列顺序（最后几列）：

```
... | 持仓金额(元) | 份额 | 仓位% | 目标% |
```

### 3.2 类型列：可点击切换

当 `a.alt` 存在时，类型列的 badge 变为可点击：

```html
<!-- 有替代基金时 -->
<span class="type-badge type-badge--clickable" onclick="toggleAwAlt('${a.id}')">
  主力 ⇄
</span>

<!-- 无替代基金时 -->
<span class="type-badge">主力</span>
```

激活态（`awAltSet.has(a.id)` 为 true）：替代行 badge 加 `type-badge--active` class（加粗/高亮描边），主力行 badge 加 `type-badge--dim` class（降低透明度）。

### 3.3 行 `data-asset-id` 属性

每行（主力行和替代行）加 `data-asset-id="{a.id}"` 属性，供行高亮使用：

```javascript
`<tr id="aw-row-${a.code}" data-asset-id="${a.id}">`
```

### 3.4 行高亮样式

计算后，`highlightMonitorRows(ops)` 根据 `op.diff` 给所有 `[data-asset-id="{id}"]` 行加 class：

| diff | class | 样式 |
|------|-------|------|
| `< -1` | `row-sell` | 红色背景（`rgba(239,68,68,.08)`） |
| `> +1` | `row-buy` | 绿色背景（`rgba(34,197,94,.08)`） |
| 其他 | 无 | 默认 |

`resetCalc()` 时调 `clearMonitorHighlights()` 清除所有 `row-sell` / `row-buy`。

---

## 四、计算逻辑变化（`js/aw/calc.js`）

### 4.1 持仓读取

```javascript
// 旧
assets[a.id] = parseFloat(document.getElementById('inp-' + a.id).value) || 0;

// 新：主力 + 替代之和
assets[a.id] = getAwDynAmt(a.code) + (a.alt ? getAwDynAmt(a.alt.code) : 0);
```

### 4.2 空持仓保护

`total <= 0` 时，将提示文字写入「再平衡结果」卡片的 `#total-hint`（位置不变，只是所在卡片变了）并 return。

### 4.3 高亮函数替换

- 删除 `import { highlightInputs, clearHighlights }` 
- 改为 `import { highlightMonitorRows, clearMonitorHighlights }` from `./monitor.js`（或 `./inputs.js` 保留该函数并重命名）
- `highlightInputs(ops)` → `highlightMonitorRows(ops)`
- `clearHighlights()` → `clearMonitorHighlights()`（在 `resetCalc()` 内调用）

---

## 五、`js/aw/inputs.js` 变化

### 5.1 删除函数

| 函数 | 原因 |
|------|------|
| `buildInputs()` | 生成 `#asset-inputs` 表单，不再需要 |
| `populateCalcInputsFromPositions()` | 回填 `#inp-{id}`，不再需要 |

### 5.2 重命名/移动函数

| 旧 | 新 | 说明 |
|----|----|----|
| `highlightInputs(ops)` | `highlightMonitorRows(ops)` | 改为操作监控行 `data-asset-id` |
| `clearHighlights()` | `clearMonitorHighlights()` | 清除监控行 `row-sell`/`row-buy` |

新实现：

```javascript
export function highlightMonitorRows(ops) {
  // 先清除
  document.querySelectorAll('[data-asset-id]').forEach(row => {
    row.classList.remove('row-sell', 'row-buy');
  });
  ops.forEach(op => {
    document.querySelectorAll(`[data-asset-id="${op.id}"]`).forEach(row => {
      if (op.diff < -1) row.classList.add('row-sell');
      else if (op.diff > 1) row.classList.add('row-buy');
    });
  });
}

export function clearMonitorHighlights() {
  document.querySelectorAll('[data-asset-id]').forEach(row => {
    row.classList.remove('row-sell', 'row-buy');
  });
}
```

### 5.3 `toggleAwAlt` 精简

删除内部对 `buildInputs()` 和 `populateCalcInputsFromPositions()` 的调用。新流程：

1. `awAltSet` 加/移除 `id`
2. 持久化到 localStorage
3. 刷新监控表类型列视觉状态（调 `refreshAwTypeBadges()`，由 monitor.js 提供）
4. 显示 toast

---

## 六、`js/aw/monitor.js` 变化

### 6.1 新增导出函数

```javascript
export function refreshAwTypeBadges()
```

遍历所有有 alt 的资产，根据 `awAltSet.has(a.id)` 更新类型列 badge 的 active/dim class。

### 6.2 `highlightMonitorRows` / `clearMonitorHighlights`

可将这两个函数放在 `inputs.js`（保持当前依赖关系）或 `monitor.js`（更符合职责）。**建议放在 `monitor.js`** 并从 `calc.js` import。

---

## 七、`js/main.js` 变化

删除：
- `import { buildInputs, populateCalcInputsFromPositions }` 的引用
- `buildInputs()` 调用（在初始化 IIFE 外的顶层调用）
- `populateCalcInputsFromPositions` 的 window 挂载（如有）

---

## 八、`css/aw.css` 新增样式

```css
/* 监控表行高亮 */
.aw-table tbody tr.row-sell {
  background: rgba(239, 68, 68, .08);
}
.aw-table tbody tr.row-buy {
  background: rgba(34, 197, 94, .08);
}

/* 类型切换 badge */
.type-badge--clickable {
  cursor: pointer;
  user-select: none;
}
.type-badge--clickable:hover {
  opacity: .8;
}
.type-badge--active {
  font-weight: 700;
  outline: 1px solid currentColor;
}
.type-badge--dim {
  opacity: .4;
}
```

---

## 九、文件变更清单

| 文件 | 变更说明 |
|------|---------|
| `strategy_page.html` | 删除「再平衡计算器」卡片；新建「再平衡结果」独立卡片；监控 section-head 加 ⚡/↺ 按钮 |
| `js/aw/calc.js` | 改读 `_awAmt`（主力+替代）；调 `highlightMonitorRows`/`clearMonitorHighlights` |
| `js/aw/inputs.js` | 删 `buildInputs`、`populateCalcInputsFromPositions`；重命名高亮函数；精简 `toggleAwAlt`；新增 import `refreshAwTypeBadges` from `./monitor.js` |
| `js/aw/monitor.js` | 类型列可点击；每行加 `data-asset-id`；新增「目标%」列；新增 `highlightMonitorRows`、`clearMonitorHighlights`、`refreshAwTypeBadges` |
| `js/main.js` | 移除 `buildInputs`、`populateCalcInputsFromPositions` 的 import 和调用 |
| `css/aw.css` | 新增 `.row-sell`、`.row-buy`、`.type-badge--*` 样式 |

---

## 十、边界情况

| 场景 | 处理 |
|------|------|
| 主力和替代都有持仓 | `assets[a.id] = primary + alt`，两行都高亮 |
| 全部持仓为 0 且可用为 0 | `total <= 0`，在 `#total-hint` 显示红色提示，不展示结果卡片 |
| 无 alt 基金的资产 | 类型列显示静态「主力」badge，不可点击；`a.alt.code` 不存在时 `getAwDynAmt` 返回 0 |
| 重置后再计算 | `clearMonitorHighlights()` 清除行颜色；结果卡片再次隐藏 |
| 监控数据未加载（持仓全为录入市值） | 与当前逻辑一致，`getAwDynAmt` 返回录入值 |
