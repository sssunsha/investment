# T+1 结算修正设计文档

## 背景

场外 ETF 采用 T+1 结算机制：用户在某交易日（T 日）确认买入/卖出操作时，系统使用的是前一交易日（T-1 日）的收盘价作为参考净值。但实际成交净值以 T 日收盘价为准，因此：

- **买入**：实际获得的份额 = 买入金额 / T 日收盘价（而非 T-1 日价格计算的估算份额）
- **卖出**：实际赎回扣减的份额 = 卖出金额 / T 日收盘价（而非 T-1 日价格计算的估算份额）

当前系统在交易确认时直接用 `latest_close`（T-1 价）记录份额，导致 `__shares__`、`__cost__`、`__realized_pnl__` 和 journal 历史记录均为估算值。需要在下一个有效交易日数据加载后自动修正。

---

## 方案选择

采用**方案 C**：在 `amounts.json` 的 `__pending_corrections__` 键中存储待修正项，数据加载完成后自动修正，无需新增后端 API。

---

## 数据结构

### `__pending_corrections__`（写入 `amounts.json`）

```json
{
  "__pending_corrections__": [
    {
      "trade_date": "2026-06-06",
      "code_c": "007467",
      "name": "红利低波动",
      "trade_type": "buy",
      "amt": 50000,
      "estimated_price": 1.234,
      "estimated_shares": 40518.6386
    },
    {
      "trade_date": "2026-06-06",
      "code_c": "006131",
      "name": "沪深300",
      "trade_type": "sell",
      "amt": 30000,
      "estimated_price": 2.101,
      "estimated_shares": 14278.9148
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 含义 |
|------|------|------|
| `trade_date` | string (YYYY-MM-DD) | 操作当日（T 日），也是结算参考日 |
| `code_c` | string | 标的 C 类基金代码 |
| `name` | string | 标的名称（用于展示） |
| `trade_type` | `"buy"` \| `"sell"` | 交易类型 |
| `amt` | number | 交易金额（元），已确定，不需修正 |
| `estimated_price` | number | 确认时使用的 T-1 收盘价（估算净值） |
| `estimated_shares` | number | 基于估算价计算的份额 |

---

## 修正逻辑

### 触发条件（逐条检查）

1. `today_date > trade_date`（今日严格晚于交易日）
2. `poolItems` 中能找到 `code_c` 且 `latest_close > 0`（今日有效价格已加载）

非交易日不会有新数据加载，自然不会触发修正。周五交易 → 周六/日不修正 → 下周一数据加载时修正。

### 买入修正

```
real_shares = amt / today_close
delta_shares = real_shares - estimated_shares

__shares__[code_c] += delta_shares
// __cost__ 不变（买入成本 = amt，是确定值）
```

journal 对应记录更新：`shares = real_shares`、`price = today_close`

### 卖出修正

```
real_sold_shares = amt / today_close
delta_shares = estimated_shares - real_sold_shares  // 正值=估算多扣，补回；负值=估算少扣，追扣

__shares__[code_c] += delta_shares  // 补回或追扣份额差额
```

成本和盈亏的修正：`ratio = amt / prevAmt`（金额比例）保持不变，与确认时一致，不重算。只需用 `real_sold_shares` 替换 journal 中的 `shares` 字段即可。`pnl` 不重算（因为 pnl = amt - cost_portion，amt 是确定值，cost_portion 基于 ratio 计算也不变）。

> 注意：卖出修正只修正份额（shares），不修正 pnl/cost。

journal 对应记录更新：`shares = real_sold_shares`

### 修正后

- 将该条从 `__pending_corrections__` 中移除
- 调用 `saveAmounts()` 持久化
- 刷新 UI（`refreshAllPosPct`、`refreshTotalDisplay`、`refreshPnlDisplay`）

---

## UI 展示

### 状态指示器

位置：MDTFR 操作建议卡片顶部的"分析时间"行右侧。

| 状态 | 显示 | 交互 |
|------|------|------|
| 有未修正交易 | `⏳ N 笔待结算` — 黄色徽章 | 点击打开详情弹窗 |
| 全部已修正（当天有过交易） | `✓ 交易已结算` — 绿色小字 | 无 |
| 无待修正且当天无交易 | 不显示 | — |

### 待修正详情弹窗

独立 overlay，复用 `journal-overlay` CSS 风格。展示字段：

- 交易日期、类型（买入/卖出徽章）、标的名称/代码、金额、估算净值、估算份额
- 底部提示文字："以下交易基于 T-1 估算净值，将在下一交易日数据加载后自动修正"
- 如有已修正记录（同一次进入页面的会话内），可展示修正前后对比（可选，V2 再做）

### journal 历史记录标注

- 未修正的 trade record 显示小徽章 `估算中`（黄色）
- 修正后变为 `已结算`（绿色）或无标注

---

## 改动文件清单

### 新增
- `js/mdtfr/corrections.js` — 核心模块：`addPendingCorrection`、`applyPendingCorrections`、状态指示器渲染、详情弹窗

### 修改

| 文件 | 改动 |
|------|------|
| `js/mdtfr/amounts.js` | 新增 `getPendingCorrections()` / `setPendingCorrections()` |
| `js/mdtfr/trade-confirm.js` | `confirmTradeRow` 成功后调用 `addPendingCorrection()` |
| `js/mdtfr/manual-sell.js` | `_manualSellConfirm` 成功后调用 `addPendingCorrection()` |
| `js/mdtfr/loader.js` | SSE `done` 和缓存命中路径末尾均调用 `applyPendingCorrections(poolItems)` |
| `js/mdtfr/journal.js` | 新增 `patchJournalTradeRecord(trade_date, code_c, fields)` |
| `strategy_page.html` | 新增待修正详情 overlay HTML 骨架 |

### 不变
- `routers/cache.py` — 无需新增 API
- `css/mdtfr.css` — 最多 2-3 条新规则，复用现有 overlay 样式

---

## 边界情况

| 场景 | 处理方式 |
|------|---------|
| 同一标的当日买入后又卖出 | 两条独立 pending correction，按 `trade_type` 分别修正 |
| 修正时标的数据加载失败（error） | 跳过该条，保留在 `__pending_corrections__` 等下次 |
| 修正时 `today_close` 与 `estimated_price` 完全相同 | 仍执行修正流程（delta = 0），标记为已修正 |
| 手动卖出（manual-sell） | 与建议卖出相同处理，同样写入 pending correction |
| 撤销交易（undoTradeRow） | 同步从 `__pending_corrections__` 中移除对应条目 |
