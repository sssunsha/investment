# 新增"继续持有"建议 + 修复 buyRows 重复买入 Bug

**日期：** 2026-05-07  
**文件：** `js/mdtfr/advice.js`

## 问题描述

1. **Bug**：`buyRows` 用 `buyCandidates` 而非 `toBuy` 填充，导致已持仓的标的也出现在"买入"操作表中（如持有科创50+半导体时，仍显示买入这两只各 ¥5,000）。

2. **功能缺失**：当持仓完全匹配目标（`finalType === 'hold'`）时，操作建议区只显示文字说明，没有结构化的"继续持有"表格，不够直观。

## 根因分析

`buyRows` 构建逻辑（原 line 274）：

```js
// 错误：包含了已持仓的候选标的
buyCandidates.forEach(x => {
  buyRows.push({ from: '货币基金', amt: totalAmt * 0.50, to: x.name, ... });
});
```

`toBuy` 已有正确定义 `= buyCandidates.filter(x => !holdingCodes.has(x.code_c))`，但没有被用于 `buyRows`。

## 修复方案

### 1. 修复 buyRows（line 274）

```js
// 修复后：只对未持仓的候选标的生成买入行
toBuy.forEach(x => {
  buyRows.push({ from: '货币基金', amt: totalAmt * 0.50, to: x.name, ... });
});
```

### 2. 新增 holdRows（line 279-286）

```js
const holdRows = [];
if (finalType === 'hold') {
  buyCandidates.forEach(x => {
    const h = holdings.find(hh => hh.code_c === x.code_c);
    if (h) holdRows.push({ name: h.name, code_c: h.code_c, amt: h._amt, pct: h._posVal });
  });
}
```

### 3. 新增 holdTable() 渲染函数（line 321-334）

渲染"🔵 继续持有"表格，显示标的名称、当前金额、仓位百分比、说明文字。

### 4. 更新 tablesHtml（line 336-342）

- `hasAnyOp` 加入 `holdRows.length > 0` 的判断
- 右列优先渲染 `holdTable`，无 holdRows 时回退到 `opTable(buyRows,'buy')`

## 最终效果

| 场景 | 左列 | 右列 |
|------|------|------|
| 维持现仓 | 无卖出操作 | 🔵 继续持有（表格） |
| 纯买入 | 无卖出操作 | 🟢 买入（表格） |
| 纯卖出 | 🔴 卖出（表格） | 无买入操作 |
| 换仓 | 🔴 卖出（表格） | 🟢 买入（表格） |
