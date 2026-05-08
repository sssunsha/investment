# Bug 修复：确认买入后金额列仍显示 0

**日期：** 2026-05-07  
**文件：** `js/mdtfr/amounts.js`

## 问题描述

在策略分析页面（`/strategy#mdtfr`）操作建议区，点击「✅ 确认」执行买入操作后：

- **持仓情况(%)** 列：已正确更新（显示正确仓位百分比）
- **金额(元)** 列的 input 框：依然显示 0（未更新）

## 根因分析

`refreshAllPosPct()`（`amounts.js:118`）在每次确认交易后被调用，负责刷新页面上各标的的展示状态。

原来的实现只更新了：
1. `.pos-pct` 元素的文本（仓位百分比 ✅）
2. `input.dataset.held`（CSS 样式标记 ✅）

**遗漏了：** `input.value`（输入框显示的金额数值 ❌）

由于内存中 `_amt[code_c]` 已被 `setAmt()` 正确更新，仓位百分比计算结果是正确的，但 DOM 上的 input value 没有同步，导致视觉上金额仍为 0。

## 修复方案

在 `refreshAllPosPct()` 中，找到对应 input 后同步更新 `inp.value`：

```js
// 修复前
const inp = document.querySelector(`.amt-input[data-code="${d.code_c}"]`);
if (inp) inp.dataset.held = pct > 0;

// 修复后
const inp = document.querySelector(`.amt-input[data-code="${d.code_c}"]`);
if (inp) {
  inp.dataset.held = pct > 0;
  const v = getAmt(d.code_c);
  inp.value = v > 0 ? v : '';
}
```

## 影响范围

- 仅修改 `refreshAllPosPct()` 内的 DOM 同步逻辑
- 不影响数据持久化（saveAmounts）
- 不影响仓位百分比计算
- 买入确认、卖出确认、撤销操作均会调用此函数，均受益
