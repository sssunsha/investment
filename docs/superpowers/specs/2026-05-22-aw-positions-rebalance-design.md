# AW 全天候策略持仓追踪 & 再平衡增强设计

**日期：** 2026-05-22  
**范围：** `strategy_page.html` → `#aw` tab（全天候配置动态平衡）  
**参考页面：** `http://localhost:9001/strategy#mdtfr`（MDTFR 为对标实现）

---

## 一、需求概述

为全天候策略（AW）Tab 添加四项功能：

1. **顶部显示**：总金额、总收益、可用金额输入框
2. **全天候标的监控表格**：添加持仓金额输入、份额展示、仓位% 列
3. **再平衡计算器**：移除组合总市值输入框；计算时自动使用持仓 + 可用金额
4. **持久化**：所有数据保存到服务端本地文件（`~/.investment/`）

---

## 二、已确认设计决策

| 决策点 | 选择 | 说明 |
|--------|------|------|
| 计算器输入与持仓关联 | 方案 A：自动预填充，同一套数据 | 持仓金额 = 计算器输入，双向同步 |
| 可用金额加入总资产池 | 方案 A：total = Σpositions + available | 可用金额作为"未分配"资产参与比例计算 |
| 份额/收益追踪 | 方案 A：完整追踪（份额 + 成本） | 类似 MDTFR trade-confirm 机制 |
| 持仓存储粒度 | 方案 B：按实际基金代码 | 主力/替代各自独立，不共享 |
| 持久化文件 | 方案 A：独立 `aw_amounts.json` | 与 MDTFR `mdtfr_amounts.json` 完全隔离 |
| 整体实现方案 | 方案 A：最小镜像 MDTFR | 平行复制 amounts.js / available.js |

---

## 三、数据架构

### 3.1 持久化文件

**新增文件：** `~/.investment/aw_amounts.json`

```json
{
  "460300": 25000.00,
  "007028": 15000.00,
  "006961": 12000.00,
  "006848": 12000.00,
  "006493": 16000.00,
  "000216": 10000.00,
  "160216": 10000.00,
  "__available__": 10000.00,
  "__shares__": {
    "460300": 185.42,
    "007028": 120.10
  },
  "__cost__": {
    "460300": 24000.00,
    "007028": 14500.00
  }
}
```

键名规则：
- 普通键 = A 类基金代码（如 `460300`）→ 当前持仓市值（元）
- `__available__` → 可用金额（元）
- `__shares__[code]` → 份额（允许小数）
- `__cost__[code]` → 成本（元）

**新增文件：** `~/.investment/aw_rebalance_log.json`

```json
[
  {
    "date": "2026-05-22",
    "savedAt": "2026-05-22T14:30:00.000Z",
    "total": 100000,
    "available": 10000,
    "triggerTypes": ["常规阈值再平衡"],
    "ops": [
      { "op": "赎回", "name": "沪深300联接A", "code": "460300", "amount": 3000 },
      { "op": "申购", "name": "国开债7-10年A", "code": "006961", "amount": 3000 }
    ],
    "note": ""
  }
]
```

### 3.2 后端 API 新增（routers/cache.py）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/cache/aw-amounts` | GET | 读取 aw_amounts.json |
| `/api/cache/aw-amounts` | PUT | 写入 aw_amounts.json |
| `/api/cache/aw-rebalance-log` | GET | 读取 aw_rebalance_log.json |
| `/api/cache/aw-rebalance-log` | PUT | 写入 aw_rebalance_log.json |

文件路径：`CACHE_DIR / "aw_amounts.json"`、`CACHE_DIR / "aw_rebalance_log.json"`

### 3.3 新增 JS 模块

| 文件 | 职责 | 对标 |
|------|------|------|
| `js/aw/amounts.js` | 持仓金额/份额/成本管理 | `js/mdtfr/amounts.js` |
| `js/aw/aw-available.js` | 可用金额、总金额、P&L | `js/mdtfr/available.js` |

两模块直接调用（不用 EventBus），避免 AW/MDTFR 事件串扰。

---

## 四、功能设计

### 4.1 Feature 1 — AW Tab 顶部区域

在 `全天候标的监控` section-head 中，时间戳之后插入：

```
[📈 全天候标的监控] [缓存时间] [总金额：¥XX] [总收益：+¥XX (+X%)] [可用金额(元)：____] [按钮组]
```

**总金额** (`#aw-total-amt`)：
- = Σ 各 A 类持仓市值 + 可用金额
- 若有份额 + 最新净值则展示动态市值，否则展示录入市值
- 样式：黄色 `color:var(--yellow)`, `font-weight:700`

**总收益** (`#aw-total-pnl`)：
- = Σ (动态市值 − 成本) for 有成本记录且已加载动态市值的标的
- 可点击打开收益明细弹窗（AW 独立 `aw-pnl-overlay` DOM 元素，不复用 MDTFR 的 `pnl-overlay`，避免状态混淆）
- 无成本数据时不显示

**可用金额输入框** (`#aw-available-input`)：
- `oninput` 时实时保存到 `aw_amounts.json` 中的 `__available__` 字段
- 同步刷新总金额显示
- 与再平衡计算器共享同一 `_available` 变量

### 4.2 Feature 2 — 全天候标的监控表格新增列

在表格现有 11 列之后新增 3 列：

| 新列 | 内容 | 可编辑 |
|------|------|--------|
| **持仓金额(元)** | `<input class="amt-input">` | ✅ |
| **份额** | 只读文字，悬停显示 tooltip（成本/均价） | ❌ |
| **仓位%** | `持仓市值 / 总金额 × 100%` | ❌ |

**交互细节：**
- 持仓金额 `oninput` → 写入 `_awAmt[code]` → 持久化 → 刷新仓位%/总金额/P&L
- 每行持仓金额旁有 `×` 清零按钮（清零金额 + 份额 + 成本）
- 份额格子悬停 tooltip：`份额: X.XX / 成本: ¥X / 均价: ¥X.XXXX`
- 有动态市值时 input 颜色随盈亏变化（涨红跌绿）
- 键名 = 该行的 A 类基金代码（主力为 `asset.code`，替代为 `asset.alt.code`）
- 主力/替代两行各自独立存储，均可持仓

### 4.3 Feature 3 — 再平衡计算器改造

**删除：** 整个 `组合总市值（元）` 输入框 + `total-hint` div

**自动预填充：**
- 页面加载完成后，将存储的持仓金额写入 `#inp-{id}` 输入框
- 各 asset 取当前激活（主力/替代）的基金市值
- 无持仓则输入框为空（用户仍可手动输入临时值）
- 每次 `onAwAmtChange(code, val)` 触发时，通过 `PORTFOLIO.find(a => getActiveAsset(a).code === code)?.id` 映射回 asset id，同步更新 `#inp-{id}` 输入框

**`_runCalc` 逻辑变化：**
```
assetSum = Σ #inp-{id} values（手动或自动预填）
available = getAwAvailableAmt()
total = assetSum + available       ← 核心变化

提示文字 = "✦ 总金额 = 持仓 ¥XX + 可用 ¥XX = ¥XX"
```

**汇总条新增：** `可用金额：¥XX`；若买入合计 > 可用金额，黄色警告提示。

### 4.4 保存操作记录时更新持仓

`saveToLog()` 触发时（新增步骤）：

1. **应用 ops 到持仓金额：**
   - 申购：`amt[code] += op.amount`；`cost[code] += op.amount`；若有最新净值则 `shares[code] += op.amount / nav`
   - 赎回：`ratio = op.amount / amt[code]`；`shares[code] *= (1 - ratio)`；`cost[code] *= (1 - ratio)`；`amt[code] -= op.amount`

2. **更新可用金额：**
   `available -= (totalBuy - totalSell)`（总量不变，只是资金流向变化）

3. **持久化：** 写入 `aw_amounts.json`

4. **操作记录持久化：** 写入 `aw_rebalance_log.json`（替代 localStorage），同时刷新页面下方的操作记录表格

5. **自动同步：** 刷新计算器各 asset 输入框、总金额/收益显示、监控表格仓位%

---

## 五、文件变更清单

### 新增文件（4）
| 文件 | 说明 |
|------|------|
| `js/aw/amounts.js` | AW 持仓金额/份额/成本管理 |
| `js/aw/aw-available.js` | AW 可用金额、总金额、P&L |
| `~/.investment/aw_amounts.json` | 运行时自动创建 |
| `~/.investment/aw_rebalance_log.json` | 运行时自动创建 |

### 修改文件（6）
| 文件 | 变更说明 |
|------|---------|
| `routers/cache.py` | 新增 4 个端点：aw-amounts GET/PUT + aw-rebalance-log GET/PUT |
| `strategy_page.html` | AW section-head 加入总金额/收益/可用金额 DOM |
| `js/aw/monitor.js` | 表格新增 3 列；新增 `mkAwAmtCell`/`mkAwPosPct` 函数 |
| `js/aw/calc.js` | 删除 total-assets 输入；读取 `getAwTotalAmt()`；自动预填充 |
| `js/aw/log.js` | 保存时应用 ops 到持仓；迁移到服务端 API |
| `js/main.js` | import 并 init `loadAwAmounts`/`loadAwAvailable` |

---

## 六、边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 持仓为 0 且可用为 0 时点击计算 | 保持原有逻辑，允许手动输入 |
| 赎回金额 > 持仓市值 | 警告提示，不阻止保存；`amt[code]` 最小设为 0，不出现负数 |
| 持仓为 0 时触发赎回（除零）| `amt[code] === 0` 时跳过 ratio 计算，份额/成本均清零 |
| 净值不可用（未加载监控数据）| 份额不更新，仅更新金额和成本 |
| 主力/替代都有持仓 | 两者均计入总金额，各自独立显示 |
| 首次使用（aw_amounts.json 不存在）| 后端返回空 `{}`，前端正常初始化为 0 |
