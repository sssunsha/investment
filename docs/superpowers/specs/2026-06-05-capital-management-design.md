# 资金存取管理功能设计文档

日期：2026-06-05

## 1. 背景与目标

用户需要在日常维护中向策略账户存入或抽出资金，并追踪累计净投入，以便随时查看整体回报率。

约束：
- 存取操作只能作用于**可用金额**，不得影响持仓金额
- 延续现有代码风格（小文件、单一职责、`__`前缀字段复用 amounts.json）

---

## 2. 数据模型

复用 `~/.investment/mdtfr_amounts.json`，新增两个字段：

```json
"__net_capital__": 10000,
"__capital_log__": [
  { "ts": "2026-05-01T10:00:00.000Z", "type": "deposit",  "amt": 10000, "note": "初始投入" },
  { "ts": "2026-06-10T09:30:00.000Z", "type": "withdraw", "amt": 2000,  "note": "取出备用" }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `__net_capital__` | number | 累计净投入 = Σ存入 − Σ抽出，随每次操作同步更新 |
| `__capital_log__` | array | 完整流水，只追加，最终由 `saveAmounts()` 一并持久化 |

**存入逻辑：**
1. `__available__` += amt
2. `__net_capital__` += amt
3. `__capital_log__` 追加 `{ ts, type: 'deposit', amt, note }`
4. 调用 `saveAmounts()` + `saveAvailable()`

**抽出逻辑：**
1. 校验 amt ≤ 当前 `__available__`，否则拒绝
2. `__available__` -= amt
3. `__net_capital__` -= amt
4. `__capital_log__` 追加 `{ ts, type: 'withdraw', amt, note }`
5. 调用 `saveAmounts()` + `saveAvailable()`

后端零改动——`saveAmounts()` 已有"合并所有 `__` 前缀字段写入"的逻辑。

---

## 3. UI 变化

### 3.1 section-head 标签区

```
总金额：¥10,763   总投入：¥10,000 · +7.63%   已实现 +¥763
```

- 新增 `<span id="mdtfr-net-capital">` 紧跟在 `mdtfr-total-amt` 之后、`mdtfr-total-pnl` 之前
- 收益率 = (总金额 − 总投入) / 总投入，正数红色、负数绿色（与现有收益标签风格一致）
- 总投入为 0 时不显示收益率，只显示 `总投入：¥0`

### 3.2 可用金额输入框旁 `±` 按钮

- 紧贴 `#mdtfr-available-input` 右侧，使用现有 `btn btn-ghost btn-sm` class
- 文字：`±`
- onclick：`openCapitalDialog()`

### 3.3 资金存取弹窗

- Overlay id：`capital-overlay`，复用现有 `manual-sell-overlay` 的 CSS class 和样式
- 两个 Tab：**存入** / **抽出**（默认选存入）
- 金额输入框（数字，min=1）+ 备注输入框（文字，选填，maxlength=100）
- 抽出时：实时校验，amt > available 时禁用确认按钮并显示红色提示文字
- 确认按钮：`✅ 确认存入` / `✅ 确认抽出`
- 弹窗下方：历史流水表格
  - 列：时间 / 类型（存入🟢 / 抽出🔴）/ 金额 / 备注
  - 最新在上，最多展示 20 条
  - 无记录时显示"暂无记录"

---

## 4. 新模块：`js/mdtfr/capital.js`

```
capital.js
├── getNetCapital()             读取 __net_capital__（默认 0）
├── getCapitalLog()             读取 __capital_log__（默认 []）
├── deposit(amt, note)          存入：更新 available + net_capital + log → 持久化 → 刷新 UI
├── withdraw(amt, note)         抽出：校验后同上
├── openCapitalDialog()         渲染弹窗内容并 classList.add('open')
├── closeCapitalDialog()        classList.remove('open')
└── refreshNetCapitalDisplay()  刷新 #mdtfr-net-capital 标签（总投入 + 收益率）
```

**依赖关系：**
- `amounts.js`：`_getRawKey`, `_setRawKey`, `saveAmounts`
- `available.js`：`getAvailableAmt`, `setAvailableAmt`, `saveAvailable`, `getTotalAmt`, `refreshTotalDisplay`

---

## 5. 现有文件改动

| 文件 | 改动内容 |
|------|----------|
| `js/mdtfr/available.js` | `refreshTotalDisplay()` 末尾调用 `refreshNetCapitalDisplay()`（需 import capital.js，注意循环依赖——用 bus.js 事件解耦） |
| `js/main.js` | import `openCapitalDialog`, `closeCapitalDialog`，挂到 `window` |
| `strategy_page.html` | 添加 `mdtfr-net-capital` span + `±` 按钮 + `capital-overlay` 弹窗 HTML |

### 循环依赖处理

`available.js` → `capital.js` → `available.js` 会形成循环。解法：在 `bus.js` 注册事件 `capital:refresh`，`capital.js` 监听它来刷新标签；`available.js` 在 `refreshTotalDisplay()` 末尾 `emit('capital:refresh')`，不直接 import capital.js。

---

## 6. 不涉及的文件

`advice.js`、`trade-confirm.js`、`manual-sell.js`、所有后端 router — **零改动**。
