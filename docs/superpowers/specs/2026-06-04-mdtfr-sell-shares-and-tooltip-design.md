# 设计文档：卖出建议显示份额 + ETF代码悬停提示

## 背景

用户在换仓/卖出界面中，操作平台（场内ETF）以**份额**为单位，但建议面板只显示金额（¥）。此外，建议面板的标的名称没有悬停ETF代码提示，需要手动查表。本次改动解决这两个问题。

---

## 功能1：卖出/买入建议及手动卖出弹窗中同时显示份额

### 需求说明

- 卖出建议金额旁边补充对应份额数：`¥12,345（约 1,234 份）`
- 买入建议金额旁边补充估算份额：`¥50,000（约 5,000 份）`
- 手动卖出弹窗（`manual-sell.js`）：预设按钮、自定义输入预览均同步显示份额

### 计算方式

| 场景 | 计算方式 | 说明 |
|------|----------|------|
| 卖出（持仓标的） | `soldShares = getShares(code_c) × (sellAmt / holdAmt)` | 用持仓份额×卖出比例，比用价格估算更精确 |
| 买入（目标标的） | `approxShares = round(buyAmt / latest_close)` | 估算，`latest_close` 从 items 中取 |
| 手动卖出弹窗 | `sellShares = totalShares × (sellAmt / curAmt)` | 同上，`totalShares = getShares(code_c)` |

### 涉及文件及改动点

**`js/mdtfr/advice.js`**
- 新增 import：`getShares` from `./amounts.js`，`getMdtfrPoolDef` from `./config.js`
- `sellRows` 每行追加：`holdAmt`（x._amt）、`shares`（getShares(x.code_c)）、`latest_close`
- `buyRows` 每行追加：`latest_close`（从 items 对应条目取）
- `opTable()` 金额列追加份额行：
  - 卖出行：`soldShares = round(r.shares × r.amt / r.holdAmt)`
  - 买入行：`approxShares = r.latest_close > 0 ? round(r.amt / r.latest_close) : null`
  - 仅当份额可计算时显示，格式：金额下方 `<span style="color:var(--text-dim);font-size:11px">约 X,XXX 份</span>`

**`js/mdtfr/manual-sell.js`**
- `_renderBody` 中通过 `getShares(code_c)` 获取总份额 `totalShares`
- 预设按钮追加第二行份额：`约 X,XXX 份`（灰色小字）
- `_updatePreview(amt, curAmt, totalShares)` 追加份额显示：`卖出 ¥XX,XXX（约 X,XXX 份）→ 货币基金`
- `_manualSellSelectPreset` / `_manualSellOnInput` 传递 `totalShares` 参数

---

## 功能2：标的名称悬停显示ETF三类代码

### 需求说明

- 在 advice 面板的卖出表格（`fromStr`）、买入表格（`toStr`）的基金名称上，鼠标悬停时弹出气泡提示，内容与表格列的 tooltip 一致：
  ```
  C类代码: 006131
  A类代码: 460300
  场内ETF: 510300
  ```
- 同样适用于卖出条件区域每个持仓标的名称

### 实现方案

复用 `table.js` 中已有的 `showCodeTooltip` / `hideCodeTooltip` 函数（当前为模块私有）：

**`js/mdtfr/table.js`**
- 将 `showCodeTooltip` 和 `hideCodeTooltip` 改为 `export function`

**`js/mdtfr/advice.js`**
- import `showCodeTooltip, hideCodeTooltip` from `./table.js`
- 构建 `poolMap: Map<code_c, {code_a, etf}>`，从 `getMdtfrPoolDef()` 生成（已需要 import 做份额功能）
- 在 `opTable()` 中，卖出行的 `fromStr` 和买入行的 `toStr` 的基金名称 `<span>` 追加 data 属性：
  `data-code-c="..." data-code-a="..." data-etf="..."`
- 在卖出条件区域（`sellHtml`）的持仓名称 span 同样追加 data 属性
- `body.innerHTML = ...` 赋值后，立即执行：
  ```js
  body.querySelectorAll('[data-code-c]').forEach(el => {
    el.style.cursor = 'help';
    el.addEventListener('mouseenter', e => showCodeTooltip(e.target, e.target.dataset.codeC, e.target.dataset.codeA, e.target.dataset.etf));
    el.addEventListener('mouseleave', hideCodeTooltip);
  });
  ```

---

## 不改动范围

- `config.js` — 数据结构不变
- `trade-confirm.js` — 不涉及
- CSS — 无新样式，复用现有 tooltip class 和 inline style

---

## 验证标准

1. 卖出操作表格金额列：¥ 下方出现灰色小字份额
2. 买入操作表格金额列：¥ 下方出现灰色小字估算份额
3. 手动卖出弹窗预设按钮：第二行显示份额
4. 手动卖出弹窗输入/预设选中时：预览行显示 `（约 X,XXX 份）`
5. 悬停卖出表格的基金名称 → 弹出三类代码气泡
6. 悬停买入表格的基金名称 → 弹出三类代码气泡
7. 悬停卖出条件区域持仓名称 → 弹出三类代码气泡
