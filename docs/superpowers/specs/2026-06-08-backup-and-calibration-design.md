# 数据备份恢复 & 历史数据 T+1 校准 设计文档

## 范围拆解

两个独立子项目，按顺序实施：

- **子项目 A**：写前自动备份 + UI/脚本恢复
- **子项目 B**：历史交易数据 T+1 净值级联校准（依赖 A 完成）

---

# 子项目 A：数据备份与恢复

## 背景

`~/.investment/` 下的 JSON 文件是系统唯一持久化存储。文件损坏或误操作会导致持仓、资金、操作历史数据丢失。需要在每次写操作前自动创建备份快照，并提供 UI 和脚本两种恢复途径。

## 数据结构

### 备份文件（NDJSON 格式）

```
~/.investment/
  mdtfr_amounts.bak.ndjson      ← amounts 写前快照，最多 1000 行
  mdtfr_journal.bak.ndjson      ← journal 写前快照，最多 1000 行
```

每行格式：

```jsonc
// mdtfr_amounts.bak.ndjson
{"ts": "2026-06-08T10:23:45.123456", "data": { /* amounts完整内容 */ }}

// mdtfr_journal.bak.ndjson
{"ts": "2026-06-08T10:23:45.123456", "month": "2026-06", "data": [ /* 该月journal记录 */ ]}
```

超过 1000 行时删除最旧行，保留最近 1000 条。

### 覆盖范围

- **amounts 备份**：`mdtfr_amounts.json` 全量内容，含 `__shares__`、`__cost__`、`__available__`、`__net_capital__`、`__realized_pnl__`、`__pending_corrections__`、`__capital_log__` 等所有键（即总金额、总投入、收益、可用金额全部覆盖）
- **journal 备份**：每次 POST journal 前，备份该月完整记录数组

## 后端实现（`routers/cache.py`）

### 工具函数

```python
AMOUNTS_BAK_FILE = CACHE_DIR / "mdtfr_amounts.bak.ndjson"
JOURNAL_BAK_FILE = CACHE_DIR / "mdtfr_journal.bak.ndjson"
BAK_MAX_LINES    = 1000

def _append_backup(bak_file: Path, entry: dict) -> None:
    """向 NDJSON 备份文件追加一行，超出 BAK_MAX_LINES 时删除最旧行"""
    line = json.dumps(entry, ensure_ascii=False)
    lines = bak_file.read_text(encoding='utf-8').splitlines() if bak_file.exists() else []
    lines.append(line)
    if len(lines) > BAK_MAX_LINES:
        lines = lines[-BAK_MAX_LINES:]
    bak_file.write_text('\n'.join(lines) + '\n', encoding='utf-8')
```

### 触发时机

- **`amounts_put`（PUT /api/cache/amounts）**：写入新数据前，先读取当前 `mdtfr_amounts.json` 内容追加到 `mdtfr_amounts.bak.ndjson`
- **`journal_post`（POST /api/cache/journal）**：upsert 前，先读取该月 journal 文件当前内容追加到 `mdtfr_journal.bak.ndjson`

### 新增 API 端点

```
GET  /api/cache/backup/list?type=amounts|journal&limit=20
     响应：[{"index": 0, "ts": "2026-06-08T10:23:45", "month": "2026-06"(journal only)}, ...]
     说明：返回最近 N 条备份元信息，index=0 为最新，不含完整 data 避免响应过大

GET  /api/cache/backup/entry?type=amounts|journal&index=0
     响应：单条完整备份记录 {"ts": "...", "data": {...}}

POST /api/cache/backup/restore
     请求体：{"type": "amounts"|"journal", "index": 0}
     行为：
       1. 将当前主文件内容再备份一次（防止误恢复丢失当前状态）
       2. 将指定备份的 data 写回主文件
     响应：{"ok": true, "restored_ts": "...", "backup_created": true}
```

## UI 恢复界面

### 入口

**策略页** `标的池动量监控` 的 `section-actions` 工具栏里新增 `💾 备份` 按钮，位于清空数据按钮左侧。

### 弹窗设计

复用 `journal-overlay` + `journal-modal` CSS 样式，新增 `backup-overlay` overlay。

两个 Tab 切换：
- **持仓 & 资金**（amounts）：列出最近 20 条 amounts 备份快照
- **操作历史**（journal）：列出最近 20 条 journal 备份快照

每行显示：时间戳 + 「恢复至此」按钮。

点击「恢复至此」→ 触发 `confirm-overlay` 二次确认：
> "确认恢复至 2026-06-08 10:23:45 的备份？当前状态将被自动备份后覆盖。"

确认后调用 `POST /api/cache/backup/restore`，成功后 toast 提示并刷新页面数据（重新 `loadAmounts()` + `renderCorrectionStatus()`）。

### 新增文件

- `js/mdtfr/backup.js` — backup 弹窗逻辑（openBackupDialog、closeBackupDialog、loadBackupList、restoreBackup）

### 修改文件

| 文件 | 改动 |
|------|------|
| `routers/cache.py` | 新增 `_append_backup`、修改 `amounts_put`/`journal_post`、新增 3 个备份 API |
| `strategy_page.html` | 新增 `backup-overlay` HTML 骨架、`💾 备份` 按钮、`window.openBackupDialog`/`window.closeBackupDialog` 绑定 |
| `js/main.js` | import 并绑定 backup 函数到 window |

## 脚本恢复（`scripts/restore_backup.py`）

不依赖服务器运行，直接读写 `~/.investment/` 文件。

```bash
# 列出所有 amounts 备份点（最新在前）
python scripts/restore_backup.py --type amounts --list

# 恢复到最新备份（index=0）
python scripts/restore_backup.py --type amounts --index 0

# 恢复到第 3 新的 journal 备份
python scripts/restore_backup.py --type journal --index 2

# dry-run：预览恢复内容但不写入
python scripts/restore_backup.py --type amounts --index 0 --dry-run
```

恢复前自动把当前主文件再备份一次。

---

# 子项目 B：历史数据 T+1 校准

## 背景

2026-05 ~ 2026-06 的历史 journal 记录中，shares/price/pnl 是基于 T-1 收盘价估算的。场外 ETF T+1 结算机制下，实际成交净值以 T 日收盘价为准，导致历史数据不准确。需要从最早交易开始级联重算，修正所有历史 shares、price、pnl 及当前持仓状态。

## 待校准数据（当前所有历史记录）

| data_date | 操作 | 标的 | code_c | 记录净值 | 数据来源 |
|-----------|------|------|--------|---------|---------|
| 2026-05-07 | 买入 ¥5,000 | 半导体 | 007301 | 3.705（当日） | pool 缓存有 |
| 2026-05-07 | 买入 ¥5,000 | 科创50 | 011609 | 1.283（当日） | pool 缓存有 |
| 2026-06-03 | 卖出 ¥167.5 | 半导体 | 007301 | 3.938（T-1） | pool 缓存有 |
| 2026-06-03 | 卖出 ¥3,545.65 | 科创50 | 011609 | 1.292（T-1） | pool 缓存有 |
| 2026-06-04 | 卖出 ¥5,403 | 半导体 | 007301 | 4.055（T-1） | pool 缓存有 |

注：煤炭（008280）2026-06-05 买入已由 T+1 修正机制处理，不需要校准。

## 真实 T 日净值查询

优先级：
1. **pool 缓存**：遍历 `~/.investment/YYYY/MM/mdtfr_pool.json`，找到任意一天的 pool 数据中 `item.latest_date == trade_date` 的条目，取其 `latest_close`。（pool 数据中 `latest_date` 是行情数据日期，不一定等于 pool 文件的 key 日期，例如 2026-06-04 的 pool key 包含 `latest_date=2026-06-03` 的数据）
2. **天天基金 API**：调用 `services/fund_nav.py` 的 `fetch_fund_nav_series(code_c, trade_date, trade_date+2天)`，取 `date == trade_date` 的 `close` 值

## 校准脚本：`scripts/calibrate_history.py`

### 前置检查

运行前检查 `mdtfr_amounts.bak.ndjson` 和 `mdtfr_journal.bak.ndjson` 中有有效备份条目。若无备份，自动创建后继续。

### 级联重算逻辑

```python
# 按时间顺序对每个标的维护 running state
state = {}  # code_c -> {shares, cost}

for trade in sorted(all_trades, key=lambda t: t['data_date']):
    code_c     = trade['code_c']
    amt        = trade['amt']
    real_price = lookup_real_price(code_c, trade['data_date'])  # pool 缓存或 API

    if trade['type'] == 'buy':
        real_shares              = amt / real_price
        state[code_c]['shares'] += real_shares
        state[code_c]['cost']   += amt
        # 更新 journal: shares=real_shares, price=real_price, settled=True

    elif trade['type'] == 'sell':
        prev_shares = state[code_c]['shares']
        prev_cost   = state[code_c]['cost']
        # 按卖出金额占当前市值比例计算卖出份额
        current_mkt_val          = prev_shares * real_price
        ratio                    = amt / current_mkt_val if current_mkt_val > 0 else 0
        sold_shares              = prev_shares * ratio
        cost_basis               = prev_cost * ratio
        real_pnl                 = amt - cost_basis
        state[code_c]['shares'] -= sold_shares
        state[code_c]['cost']   -= cost_basis
        # 更新 journal: shares=sold_shares, price=real_price, pnl=real_pnl, settled=True
```

### Dry-run 预览输出

```
=== 校准预览（dry-run，未写入）===

[2026-05-07] 买入 半导体 (007301)  amt=¥5,000
  净值:  3.705 → 3.617   份额: 1,349.53 → 1,382.33  (+32.80)

[2026-05-07] 买入 科创50 (011609)  amt=¥5,000
  净值:  1.283 → 1.254   份额: 3,897.12 → 3,987.24  (+90.12)

[2026-06-03] 卖出 半导体 (007301)  amt=¥167.5
  净值:  3.938 → [查询中]  份额: 45.20 → [重算]  pnl: 0 → [重算]

...

最终持仓:
  半导体 (007301): 0 份（已清仓）
  科创50 (011609): XXX 份  成本: ¥XXX

确认写入以上校准结果? [y/N]:
```

### 写入步骤

用户输入 `y` 后：
1. 更新 `~/.investment/YYYY/MM/mdtfr_journal.json` 中对应记录的 `shares`/`price`/`pnl`，添加 `settled: true` 标记
2. 更新 `mdtfr_amounts.json` 中 `__shares__`/`__cost__`/`__realized_pnl__` 为校准后最终值
3. 打印完整校准报告（含修改前后对比）

### 脚本使用方式

```bash
# 预览校准结果（不写入）
python scripts/calibrate_history.py --dry-run

# 执行校准
python scripts/calibrate_history.py

# 仅校准指定标的
python scripts/calibrate_history.py --code 007301
```

## 边界情况

| 场景 | 处理 |
|------|------|
| pool 缓存和 API 都找不到某日净值 | 打印警告，跳过该笔，继续后续（state 不更新） |
| 卖出时 state 中该标的 shares=0 | 打印警告，跳过该笔 |
| 已有 `settled: true` 的记录 | 默认跳过（不重复校准），加 `--force` 参数可强制重算 |
| 现有 `__pending_corrections__` 非空 | 校准前警告："存在待结算记录，建议等修正完成后再校准" |
