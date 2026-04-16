# MDTFR 资金管理与交易确认 设计文档

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 MDTFR 策略页面新增可用金额管理、总金额展示、交易确认/撤销功能，以及页面刷新后的持仓自动恢复。

**Architecture:** 扩展现有 `amounts.js` 的存储结构（`__available__` 保留键），新增 `available.js` 和 `trade-confirm.js` 两个模块，`advice.js` 增加确认/撤销按钮渲染，`journal.js` 在复盘记录中附加 `available_amt`。后端 `routers/cache.py` 无需改动（`amounts` 接口已对任意 JSON 对象透传）。

**Tech Stack:** 原生 ES Module（无构建工具），FastAPI + Python 后端，`~/.investment/` JSON 文件存储。

---

## 一、数据模型

### `~/.investment/mdtfr_amounts.json`（现有文件扩展）

```json
{
  "__available__": 50000,
  "006131": 30000,
  "007301": 20000
}
```

- `__available__`：保留键，表示可用金额（货币基金/现金）。
- 其余键为 `code_c`，表示各标的持仓金额（元）。
- 一次 `GET /api/cache/amounts` 同时获取两者，无需新接口。

### `~/.investment/YYYY/MM/mdtfr_journal.json`（每条记录新增字段）

```json
{
  "data_date": "2026-04-16",
  "available_amt": 50000,
  "confirmed_at": "2026-04-16T10:30:00.000Z",
  "trade_records": [
    { "type": "sell", "name": "沪深300", "code_c": "006131", "amt": 30000, "watch": false },
    { "type": "buy",  "name": "半导体",  "code_c": "007301", "toCode": "007301", "amt": 50000 }
  ],
  "holdings": [...],
  "total_amt": 100000,
  "...": "其余现有字段不变"
}
```

- `available_amt`：每次保存复盘时附加，用于持仓回溯恢复。
- `confirmed_at`、`trade_records`：仅在用户点击「确认执行」后追加；撤销时移除。

---

## 二、新增文件

### `js/mdtfr/available.js`

职责：管理可用金额的内存状态、加载/保存，以及暴露新的 `getTotalAmt()`。

**导出接口：**
```js
export async function loadAvailable()         // 从 _amtsRaw['__available__'] 读取
export async function saveAvailable()         // 将 __available__ 写回 /api/cache/amounts
export function getAvailableAmt()             // 返回当前可用金额数值
export function setAvailableAmt(v)            // 更新内存值（不持久化）
export async function onAvailableChange(val)  // 输入框 oninput 回调：更新+保存+刷新
export function getTotalAmt()                 // 可用金额 + getSumOfPositions()
export function refreshTotalDisplay()         // 更新 #mdtfr-total-amt 和 #mdtfr-available-total 标签
```

**与 `amounts.js` 的协作：**
- `loadAvailable()` 在 `loadAmounts()` 完成后调用（共享同一个 HTTP 响应缓存）。
- `saveAvailable()` 在保存时合并 `__available__` 到现有 `_amt` 对象，一次 PUT 写入。
- `amounts.js` 新增导出 `getSumOfPositions()`，供 `available.js` 计算总金额。

---

### `js/mdtfr/trade-confirm.js`

职责：执行确认/撤销交易逻辑，维护会话级快照。

**导出接口：**
```js
export async function confirmTrade()   // 读取 _lastAdviceData，执行金额变更，写 journal
export async function undoTrade()      // 从快照恢复金额，更新 journal，清空快照
export function hasSnapshot()          // 是否有可撤销的快照（用于控制撤销按钮显示）
export function setAdviceRerenderer(cb) // 注入 mdtfrRenderAdvice，确认/撤销后重渲
```

**`confirmTrade()` 步骤：**
1. 读 `_lastAdviceData.sellRows` 和 `buyRows`。
2. 若 `getTotalAmt() === 0`，抛出提示并中止。
3. 保存快照：`{ prevAmts: snapshot of _amt, prevAvailable: getAvailableAmt() }`。
4. 更新金额：
   - 每条 `sellRow`（含 watch 行）：`_amt[code_c] -= sellRow.amt`；`available += sellRow.amt`。
   - 每条 `buyRow`：`_amt[toCode] += buyRow.amt`；`available -= buyRow.amt`。
5. 调用 `saveAmounts()` 和 `saveAvailable()`。
6. 向当天 journal 记录追加 `confirmed_at`、`available_amt`（更新后）、`trade_records`，POST `/api/cache/journal`。
7. 调用 `refreshAllPosPct()` 和 `refreshTotalDisplay()`。
8. 调用 `_adviceRerenderer(_lastMdtfrItems)` 重渲建议（持仓变化后建议也会变化）。

**`undoTrade()` 步骤：**
1. 从快照恢复 `_amt` 和 `available`。
2. 调用 `saveAmounts()` 和 `saveAvailable()`。
3. 从当天 journal 记录中删除 `confirmed_at` 和 `trade_records` 字段，POST 更新。
4. 清空快照。
5. 调用 `refreshAllPosPct()`、`refreshTotalDisplay()`、`_adviceRerenderer`。

**边界情况：**

| 场景 | 处理 |
|------|------|
| `getTotalAmt() === 0` | 确认按钮禁用，tooltip 提示「请先设置可用金额」 |
| `buyRow.amt > available`（超额） | 允许执行，`available` 可变为负数，用户知情 |
| 同一天多次确认 | journal upsert（按 `data_date`），快照替换为最新一次 |
| 页面刷新后撤销 | 快照已消失，撤销按钮不显示 |

---

## 三、修改文件

### `js/mdtfr/amounts.js`

- 移除 `getTotalAmt()`（改由 `available.js` 提供）。
- 新增导出 `getSumOfPositions()`：`getMdtfrPoolDef().reduce((s, d) => s + getAmt(d.code_c), 0)`。
- `saveAmounts()` 改为合并 `__available__` 键后再 PUT（或由 `available.js` 统一写入，两者取一，以 `available.js` 为主）。
- `onAmtChange()` 改为调用 `refreshTotalDisplay()`（来自 `available.js`）替换原来的总金额刷新逻辑。
- `refreshAllPosPct()` 中总金额 `total` 改为调用 `available.js` 的 `getTotalAmt()`。

### `js/mdtfr/advice.js`

- 从 `available.js` 导入 `getTotalAmt()`，替换从 `amounts.js` 的导入。
- 渲染函数末尾（`body.innerHTML = ...` 之后）追加确认/撤销按钮区域 HTML：
  ```html
  <!-- 仅当 finalType ∈ {buy, sell, swap} 时渲染 -->
  <div id="mdtfr-trade-actions" style="padding:12px 20px;border-top:...">
    <button id="mdtfr-confirm-btn" onclick="confirmTrade()">✅ 确认执行</button>
    <button id="mdtfr-undo-btn"    onclick="undoTrade()"   style="display:none">↺ 撤销</button>
  </div>
  ```
- 每次重渲时根据 `hasSnapshot()` 决定撤销按钮的显示状态。

### `js/mdtfr/journal.js`

- `saveJournalRecord()` 中，record 对象新增 `available_amt: getAvailableAmt()`。
- 导入 `getAvailableAmt` 来自 `available.js`。

### `js/main.js`

- 新增导入 `available.js` 的 `loadAvailable`、`onAvailableChange`、`refreshTotalDisplay`。
- 新增导入 `trade-confirm.js` 的 `confirmTrade`、`undoTrade`。
- 初始化顺序：`loadAmounts()` → `loadAvailable()` → 持仓回溯检查（若需要）。
- `Object.assign(window, {...})` 追加 `onAvailableChange`、`confirmTrade`、`undoTrade`。

### `strategy_page.html`

在 `#panel-mdtfr` 的 section-head 内，`mdtfr-total-amt` 前插入：
```html
<span style="...">
  <label>可用金额(元)：</label>
  <input id="mdtfr-available-input" type="number" min="0" step="1000"
    placeholder="0" oninput="onAvailableChange(this.value)">
</span>
<span id="mdtfr-available-total" style="...">总金额：¥0</span>
```

### `css/mdtfr.css`

新增样式：
- `#mdtfr-available-input`：与现有 `.amt-input` 风格一致，宽度约 140px。
- `#mdtfr-available-total`：黄色粗体，与现有 `#mdtfr-total-amt` 区分。
- `#mdtfr-confirm-btn`：绿色实底按钮。
- `#mdtfr-undo-btn`：灰色边框按钮。
- `.amt-clear-btn`：每行持仓清零按钮（小 ×，灰色，hover 变红）。

### `js/mdtfr/table.js`

- `mkAmtCell()` 输出改为包含清零按钮：
  ```html
  <div style="display:flex;gap:4px;align-items:center">
    <input class="amt-input" ...>
    <button class="amt-clear-btn" onclick="clearAmt('${code_c}')" title="清零">×</button>
  </div>
  ```
- `clearAmt(code_c)` 函数：将该标的金额设为 0，调用 `onAmtChange(code_c, 0)`（复用现有逻辑）。
- 在 `main.js` 中挂载 `clearAmt` 到 `window`。

---

## 四、持仓回溯恢复流程

```
页面初始化
  ↓
loadAmounts() + loadAvailable() 完成后
  ↓
getSumOfPositions() === 0 且 getAvailableAmt() === 0 ？
  ├── 否 → 正常渲染
  └── 是 → 触发回溯
           ↓
           逐月向前请求 GET /api/cache/journal/{year}/{month}
           （最多回溯 6 个月）
           ↓
           找到第一条含非空 holdings[] 的记录
           ↓
           用 holdings[].amt 写入 _amt
           用 available_amt 写入 _available（若无此字段则设为 0）
           ↓
           POST saveAmounts() + saveAvailable() 写回文件
           ↓
           showToast(`已从 ${data_date} 的复盘记录恢复持仓`)
           ↓
           refreshAllPosPct() + refreshTotalDisplay()
```

回溯逻辑封装在 `available.js` 的 `recoverFromJournal()` 函数中，由 `main.js` 在初始化阶段调用。

---

## 五、模块依赖关系（更新后）

```
main.js
  ├── available.js      ← amounts.js (getSumOfPositions)
  ├── amounts.js
  ├── trade-confirm.js  ← available.js, amounts.js, advice.js (getLastAdviceData), journal.js
  ├── advice.js         ← available.js (getTotalAmt), amounts.js, watch.js
  └── journal.js        ← available.js (getAvailableAmt), amounts.js, advice.js
```

循环依赖处理：`trade-confirm.js` 通过 `setAdviceRerenderer(cb)` 回调注入渲染函数（与现有 `setJournalSaver`、`setAdviceRenderer` 模式一致）。

---

## 六、不在本次范围内

- 多次撤销（仅支持最近一次）
- 交易记录的独立查询页面
- 买入成本价记录（止损计算仍为人工确认）
