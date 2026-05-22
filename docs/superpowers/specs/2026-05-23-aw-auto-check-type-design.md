# AW 再平衡检查类型自动判断设计

**日期：** 2026-05-23  
**范围：** `js/aw/calc.js`、`strategy_page.html`、`js/main.js`、`strategy/ray_dalio_all_weather.md`

---

## 一、需求概述

当前再平衡计算器在用户点击「⚡ 计算」时弹出模态框，要求手动选择检查类型（每月/每季度/实时监控）。改为：**自动根据当前月份判断检查类型，在结果区醒目位置展示判断依据，并始终额外运行极端熔断检查**。

---

## 二、自动检测逻辑

### 2.1 检查类型判断规则

```
当前月份 ∈ {4, 7, 10, 1} → quarterly（每季度检查日）
其他月份                  → monthly（每月检查日）
```

说明：4/7/10/1 月为每季度首月（新季度第一个交易日由用户自行在首月执行）。

### 2.2 极端熔断检查

始终额外运行 ±10% 极端熔断检查，与主检查类型并行。检测逻辑：

```javascript
const realtimeAssets = PORTFOLIO.filter(a => Math.abs(weights[a.id] - a.target) >= 0.10);
const realtimeTriggered = realtimeAssets.length > 0;
```

若触发，在主横幅**上方**额外显示红色警报横幅，列出所有偏离 ≥ ±10% 的资产。

---

## 三、UI 设计

### 3.1 结果区顶部横幅

在 `#calc-result` 内、`#trigger-status` 之前新增 `#check-type-banner` div。

**极端熔断警报（触发时显示，位于最上方）：**

```
┌────────────────────────────────────────────────────────────┐
│ ⚡ 极端熔断！黄金 偏离 +11.2%（目标10%，当前21.2%）           │
│   建议立即执行再平衡，无需等待月度检查日                        │
└────────────────────────────────────────────────────────────┘
```

**主检查类型横幅（始终显示）：**

每月检查日（非 4/7/10/1 月）：
```
📅 每月检查日 ｜ 当前X月，非季度首月，执行常规阈值检查（±5%）
```

每季度检查日（4/7/10/1 月）：
```
📊 每季度检查日 ｜ 当前X月，季度首月（4/7/10/1月），执行定期体检（±3%）及内部结构检查
```

### 3.2 触发点 chips

不变，仍展示当前主检查类型的触发结果：
- monthly：1 个 chip（常规阈值再平衡 ±5%）
- quarterly：3 个 chips（定期体检再平衡 ±3%、股票内部结构、债券内部结构）

极端熔断的信息展示在警报横幅中，不额外添加 chip。

### 3.3 操作建议区（op-plans）

`anyTriggered = primaryTriggered || realtimeTriggered`，只要任一检查触发，就展示操作方案和保存按钮。操作方案的买卖金额仍基于全量移动到目标比例（与现在逻辑一致）。

---

## 四、删除内容

### 4.1 弹窗 DOM（strategy_page.html）

删除整个 `<!-- 检查类型选择弹窗 -->` 区块（`check-type-overlay` div 及其所有内容）。

### 4.2 calc.js 函数

删除：
- `selectCheckType(type, labelEl)` — 弹窗选项点击回调
- `closeCheckTypePicker()` — 关闭弹窗
- `confirmCheckType()` — 确认并执行计算

保留并改造：
- `calcRebalance()` → 直接调用 `_runCalc(_detectCheckType())`，不再开启弹窗

新增：
- `_detectCheckType()` → 返回 `'quarterly'` 或 `'monthly'`

### 4.3 main.js

从 import 和 `Object.assign(window, {...})` 中移除：
- `selectCheckType`
- `closeCheckTypePicker`
- `confirmCheckType`

---

## 五、文档更新（strategy/ray_dalio_all_weather.md）

| 位置 | 原文 | 改为 |
|------|------|------|
| 再平衡触发矩阵表 - 定期体检行 | 每季度末 (3/6/9/12月) | 每季度初 (4/7/10/1月第一个交易日) |
| 再平衡触发矩阵表 - 内部结构行 | 仅在季度体检时检查 | 仅在季度体检时检查（4/7/10/1月） |
| 关键时间节点备忘 | 季度末：定期再平衡检查 | 季度初（4/7/10/1月第一个交易日）：定期再平衡检查 |

---

## 六、文件变更清单

| 文件 | 变更说明 |
|------|---------|
| `js/aw/calc.js` | 新增 `_detectCheckType()`；改造 `calcRebalance()`；删除 3 个弹窗函数；`_runCalc` 增加 ±10% 并行检查及横幅渲染 |
| `strategy_page.html` | 删除 `check-type-overlay` 弹窗 div |
| `js/main.js` | 移除 3 个弹窗函数的 import 和 window 挂载 |
| `strategy/ray_dalio_all_weather.md` | 更新季度检查时间节点：3/6/9/12月 → 4/7/10/1月 |

---

## 七、边界情况

| 场景 | 处理 |
|------|------|
| 4/7/10/1 月同时触发 ±10% 熔断 | 两个横幅均显示：警报在上，季度横幅在下 |
| 月度月触发 ±10% 熔断 | 警报横幅在上，月度横幅在下，操作方案正常展示 |
| 没有任何触发 | 只显示主横幅；触发点显示「✓ 未触发」chips；无操作方案 |
| 持仓/可用金额均为 0 | 与现有逻辑一致，显示红色提示，不进入横幅展示 |
