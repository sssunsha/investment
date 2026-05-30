# 手动卖出 + 历史复盘精简 设计文档

日期：2026-05-30  
范围：`/js/mdtfr/` 模块，`strategy_page.html`

---

## 背景

用户希望在策略页面 `#mdtfr` 中支持：
1. 不依赖系统卖出信号，手动主动卖出某持仓标的（支持部分/全仓）
2. 手动卖出操作写入历史复盘
3. 卖出后实时更新可用金额、持仓金额、仓位百分比
4. 历史复盘只保留真实交易操作记录，去掉每次建议刷新时的自动快照

---

## 功能 1：手动卖出弹窗

### 触发入口

在 `advice.js` 的卖出条件分析区域，每个持仓卡片标题行右侧增加「手动卖出」按钮：

```html
<button onclick="openManualSellDialog('${code_c}')" ...>手动卖出</button>
```

按钮样式：小号、灰色边框、不抢主要操作视觉焦点。

### 弹窗 DOM

新增一个 overlay `id="manual-sell-overlay"`，与现有 `journal-overlay` 使用相同 CSS 类（`.journal-overlay` / `.journal-modal`），在 `strategy_page.html` 中追加：

```html
<div class="journal-overlay" id="manual-sell-overlay" onclick="if(event.target===this)closeManualSellDialog()">
  <div class="journal-modal" style="max-width:480px">
    <div class="journal-modal-head">
      <span id="manual-sell-title">手动卖出</span>
      <button onclick="closeManualSellDialog()">✕</button>
    </div>
    <div id="manual-sell-body"></div>
  </div>
</div>
```

### 弹窗内容（由 `manual-sell.js` 动态渲染）

- 标的名称 + 当前持仓金额（只读展示）
- 快捷比例按钮：`25%` / `50%` / `75%` / `全仓`（默认选中全仓）
- 自定义金额输入框，与比例按钮双向联动：
  - 点击比例按钮 → 填入对应金额，高亮该按钮
  - 手动输入金额 → 匹配最近比例档位时高亮对应按钮，否则全部取消高亮
- 动态显示：`卖出 ¥X → 货币基金 | 剩余持仓 ¥Y`
- 备注输入框（选填，placeholder：如"止盈/调仓/资金需求"）
- 底部按钮：`确认卖出`（红色）+ `取消`

### 校验

- 卖出金额 ≤ 当前持仓金额（输入超额时禁用确认按钮并提示）
- 卖出金额 > 0

---

## 功能 2：执行逻辑

新增文件 `js/mdtfr/manual-sell.js`，职责单一：手动卖出弹窗的展示与执行。

### `openManualSellDialog(code_c)`

从 `getLastMdtfrItems()` 取得标的名称和最新净值，从 `getDynAmt(code_c)` 取得当前持仓金额，渲染弹窗内容。

### `confirmManualSell(code_c, amt, note)`

执行顺序与 `trade-confirm.js` 中的 sell 分支保持一致：

1. `setAmt(code_c, max(0, prevAmt - amt))`
2. `setAvailableAmt(available + amt)`
3. 按卖出比例减少 shares 和 cost（`ratio = amt / prevAmt`）
4. `saveAmounts()` + `saveAvailable()`
5. `refreshAllPosPct()` + `refreshTotalDisplay()`
6. 构造 `trade_records`：`{ type:'sell', name, code_c, amt, note, manual:true }`
7. 调用 `setPendingConfirmAnnotation` + `call('journalSaver', true)` 写入 journal
8. 触发 `emit('advice:render', lastItems)` 刷新建议面板
9. 关闭弹窗，显示 toast：`✅ 已手动卖出 {name} ¥{amt}`

---

## 功能 3：历史复盘只保留真实操作记录

### 当前问题

`call('journalSaver', true)` 在每次 `advice:render` 后都被触发，每次建议刷新（包含无任何操作的情况）都写一条 journal 记录，导致历史复盘充斥大量"建议快照"而非真实操作记录。

### 改动

**`journal.js` - `saveJournalRecord`：**

在函数入口加守卫：

```js
async function saveJournalRecord(silent = false) {
  const annotation = _pendingAnnotation;
  // 只在有真实交易记录时写入
  if (!annotation || !annotation.trade_records || annotation.trade_records.length === 0) return;
  // ... 原有逻辑
}
```

`pool_snapshot` 和 `watch_snapshot` 仍然写入（用于 `recoverFromJournal` 持仓恢复），但只在有交易时才写。

**影响评估：**
- `recoverFromJournal`：只查含 `holdings[]` 的记录，不受影响（手动卖出和建议确认都含 holdings）
- `_loadPnlDialog`：依赖 `trade_records`，正好只在有交易的记录中查找，反而更准确
- 建议面板刷新：不再产生噪声记录

---

## 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `js/mdtfr/manual-sell.js` | 新增 | 弹窗渲染 + 执行逻辑 |
| `js/mdtfr/journal.js` | 修改 | `saveJournalRecord` 加守卫，无交易时跳过 |
| `js/mdtfr/advice.js` | 修改 | 每个持仓卡片标题行加「手动卖出」按钮 |
| `strategy_page.html` | 修改 | 追加 `manual-sell-overlay` DOM，引入 `manual-sell.js` |
| `js/main.js` | 修改（视情况） | 将 `openManualSellDialog` / `closeManualSellDialog` / `confirmManualSell` 挂载到 `window` |

---

## 不在范围内

- 手动买入（未被请求）
- 多标的批量手动卖出
- 对历史 journal 记录的清理/迁移（旧快照记录保留，不删除）
