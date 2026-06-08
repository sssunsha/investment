# 历史数据 T+1 校准 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 2026-05 ~ 2026-06 历史 journal 记录按真实 T 日净值级联重算 shares/price/pnl，并更新 amounts.json 中的 __shares__/__cost__/__realized_pnl__。

**Architecture:** 独立 Python 脚本 `scripts/calibrate_history.py`，不依赖 FastAPI 服务器运行。核心逻辑拆分为三个纯函数（可独立测试）：`lookup_real_price` 查询真实净值、`run_cascade` 级联重算、`apply_calibration` 写入文件。默认 dry-run 模式，用户确认后写入。

**Tech Stack:** Python 3.12, pathlib, json, argparse; 调用 `services/fund_nav.py` 的 `fetch_fund_nav_series` 作为价格回退来源

---

## 背景知识

场外 ETF T+1 结算：用户在 T 日申购/赎回，实际 NAV 按 T 日收盘价计算。当前 journal 里有些记录用了 T-1 价格（系统加载时获取的是前一交易日数据），导致份额/收益不准确。

**已确认的历史记录与真实价格差异：**

| data_date | type | 标的 | amt | 记录净值 | 真实T日净值 | 来源 |
|-----------|------|------|-----|---------|-----------|------|
| 2026-05-07 | buy | 半导体 007301 | 5000 | 3.705 | 3.705 | pool key=2026-05-07 |
| 2026-05-07 | buy | 科创50 011609 | 5000 | 1.283 | 1.283 | pool key=2026-05-07 |
| 2026-06-03 | sell | 半导体 007301 | 167.5 | 3.938 | **4.055** | pool key=2026-06-04 |
| 2026-06-03 | sell | 科创50 011609 | 3545.65 | 1.292 | **1.318** | pool key=2026-06-04 |
| 2026-06-04 | sell | 半导体 007301 | 5403 | 4.055 | **4.143** | pool key=2026-06-05 |

注：煤炭（008280）2026-06-05 buy 已有 `__pending_corrections__`，脚本跳过它。

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `scripts/calibrate_history.py` | **新增** | 完整校准脚本：价格查询、级联重算、dry-run 预览、写入 |
| `tests/test_calibrate.py` | **新增** | 纯逻辑单元测试：lookup_real_price（mock 数据）、run_cascade 级联逻辑 |

---

## Task 1: 价格查询逻辑 lookup_real_price（TDD）

**Files:**
- Create: `scripts/calibrate_history.py` (仅 lookup_real_price 部分)
- Test: `tests/test_calibrate.py`

- [ ] **Step 1: 新建 tests/test_calibrate.py，写失败测试**

```python
# -*- coding: utf-8 -*-
"""scripts/calibrate_history.py 纯逻辑单元测试"""
import json
import sys
from pathlib import Path
import pytest

# 让 scripts/ 可被 import
sys.path.insert(0, str(Path(__file__).parent.parent / 'scripts'))


# ── lookup_real_price ─────────────────────────────────────────

class TestLookupRealPrice:
    def test_finds_price_in_pool_cache(self, tmp_path):
        """pool 缓存中有 latest_date == trade_date 的条目"""
        from calibrate_history import lookup_real_price

        # 构造 pool 文件：key=2026-05-08, items 含 latest_date=2026-05-07
        pool_dir = tmp_path / "2026" / "05"
        pool_dir.mkdir(parents=True)
        pool_data = {
            "2026-05-08": [
                {"code_c": "007301", "name": "半导体", "latest_date": "2026-05-07", "latest_close": 3.705},
                {"code_c": "011609", "name": "科创50", "latest_date": "2026-05-07", "latest_close": 1.283},
            ]
        }
        (pool_dir / "mdtfr_pool.json").write_text(json.dumps(pool_data))

        price = lookup_real_price("007301", "2026-05-07", cache_dir=tmp_path)
        assert price == 3.705

    def test_finds_price_same_key_as_trade_date(self, tmp_path):
        """pool key == trade_date，latest_date 也 == trade_date"""
        from calibrate_history import lookup_real_price

        pool_dir = tmp_path / "2026" / "05"
        pool_dir.mkdir(parents=True)
        pool_data = {
            "2026-05-07": [
                {"code_c": "007301", "latest_date": "2026-05-07", "latest_close": 3.705},
            ]
        }
        (pool_dir / "mdtfr_pool.json").write_text(json.dumps(pool_data))

        price = lookup_real_price("007301", "2026-05-07", cache_dir=tmp_path)
        assert price == 3.705

    def test_returns_none_when_not_in_pool(self, tmp_path):
        """pool 里没有 — 应返回 None（API fallback 由调用方处理）"""
        from calibrate_history import lookup_real_price

        price = lookup_real_price("007301", "2026-05-07", cache_dir=tmp_path)
        assert price is None

    def test_ignores_wrong_code(self, tmp_path):
        """pool 里有条目但 code_c 不匹配"""
        from calibrate_history import lookup_real_price

        pool_dir = tmp_path / "2026" / "05"
        pool_dir.mkdir(parents=True)
        pool_data = {
            "2026-05-08": [
                {"code_c": "999999", "latest_date": "2026-05-07", "latest_close": 9.999},
            ]
        }
        (pool_dir / "mdtfr_pool.json").write_text(json.dumps(pool_data))

        price = lookup_real_price("007301", "2026-05-07", cache_dir=tmp_path)
        assert price is None

    def test_searches_across_multiple_months(self, tmp_path):
        """trade_date=2026-04-30，pool 文件在 2026/05"""
        from calibrate_history import lookup_real_price

        pool_dir = tmp_path / "2026" / "05"
        pool_dir.mkdir(parents=True)
        pool_data = {
            "2026-05-01": [
                {"code_c": "007301", "latest_date": "2026-04-30", "latest_close": 3.50},
            ]
        }
        (pool_dir / "mdtfr_pool.json").write_text(json.dumps(pool_data))

        price = lookup_real_price("007301", "2026-04-30", cache_dir=tmp_path)
        assert price == 3.50
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
python -m pytest tests/test_calibrate.py::TestLookupRealPrice -v
```

期望：FAIL（`calibrate_history` 模块不存在）

- [ ] **Step 3: 创建 scripts/calibrate_history.py，实现 lookup_real_price**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MDTFR 历史交易数据 T+1 净值校准脚本

用法：
  python scripts/calibrate_history.py --dry-run
  python scripts/calibrate_history.py
  python scripts/calibrate_history.py --code 007301
  python scripts/calibrate_history.py --force
"""
import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

CACHE_DIR        = Path.home() / ".investment"
AMOUNTS_FILE     = CACHE_DIR / "mdtfr_amounts.json"
AMOUNTS_BAK_FILE = CACHE_DIR / "mdtfr_amounts.bak.ndjson"
JOURNAL_BAK_FILE = CACHE_DIR / "mdtfr_journal.bak.ndjson"


def lookup_real_price(
    code_c: str,
    trade_date: str,
    cache_dir: Path = CACHE_DIR,
    use_api: bool = True,
) -> float | None:
    """
    查询 trade_date 当天的真实收盘价。

    优先级：
    1. pool 缓存：遍历所有月份 pool 文件，找 item.latest_date == trade_date 的条目
    2. 天天基金 API（use_api=True 时）
    返回 None 表示找不到。
    """
    year = trade_date[:4]
    # 搜索范围：trade_date 所在年的所有月份，以及前一年最后几个月
    candidates = []
    for y in [year, str(int(year) - 1)]:
        base = cache_dir / y
        if not base.exists():
            continue
        for month_dir in sorted(base.iterdir()):
            pool_file = month_dir / "mdtfr_pool.json"
            if not pool_file.exists():
                continue
            try:
                monthly: dict = json.loads(pool_file.read_text(encoding='utf-8'))
            except Exception:
                continue
            for _key, items in monthly.items():
                if not isinstance(items, list):
                    continue
                for item in items:
                    if (item.get('code_c') == code_c
                            and item.get('latest_date') == trade_date
                            and item.get('latest_close') is not None):
                        return float(item['latest_close'])

    if not use_api:
        return None

    # 回退：天天基金 API
    try:
        project_root = Path(__file__).parent.parent
        if str(project_root) not in sys.path:
            sys.path.insert(0, str(project_root))
        from services.fund_nav import fetch_fund_nav_series
        end_date = (datetime.strptime(trade_date, '%Y-%m-%d') + timedelta(days=3)).strftime('%Y-%m-%d')
        rows = fetch_fund_nav_series(code_c, trade_date, end_date)
        for row in rows:
            if row.get('date') == trade_date:
                return float(row['close'])
    except Exception as e:
        print(f"  ⚠ API 查询失败 ({code_c} {trade_date}): {e}", file=sys.stderr)

    return None
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
python -m pytest tests/test_calibrate.py::TestLookupRealPrice -v
```

期望：5 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/calibrate_history.py tests/test_calibrate.py
git commit -m "feat(calibrate): add lookup_real_price with pool cache + API fallback"
```

---

## Task 2: 级联重算逻辑 run_cascade（TDD）

**Files:**
- Modify: `scripts/calibrate_history.py`
- Modify: `tests/test_calibrate.py`

- [ ] **Step 1: 在 tests/test_calibrate.py 末尾追加 run_cascade 测试**

```python
# ── run_cascade ───────────────────────────────────────────────

class TestRunCascade:
    """
    run_cascade(trades, price_map) -> list[dict]

    trades: 按 data_date 排序的 trade 列表，每条含:
        {type, code_c, name, amt, data_date, shares (旧值), price (旧值), pnl (旧值)}
    price_map: {(code_c, data_date): real_price}
    返回: 每条 trade 附加 {real_price, real_shares, real_pnl, _state_before}
    """
    def test_buy_recalculates_shares(self):
        from calibrate_history import run_cascade
        trades = [
            {"type": "buy", "code_c": "A", "name": "A基金", "amt": 5000,
             "data_date": "2026-05-07", "shares": 1000.0, "price": 5.0, "pnl": None},
        ]
        price_map = {("A", "2026-05-07"): 4.0}  # real price differs
        result = run_cascade(trades, price_map)
        assert len(result) == 1
        assert result[0]["real_price"] == 4.0
        assert abs(result[0]["real_shares"] - 1250.0) < 0.001   # 5000/4.0
        assert result[0]["real_pnl"] is None  # buy has no pnl

    def test_buy_same_price_no_delta(self):
        from calibrate_history import run_cascade
        trades = [
            {"type": "buy", "code_c": "A", "name": "A", "amt": 5000,
             "data_date": "2026-05-07", "shares": 1000.0, "price": 5.0, "pnl": None},
        ]
        price_map = {("A", "2026-05-07"): 5.0}  # same price
        result = run_cascade(trades, price_map)
        assert abs(result[0]["real_shares"] - 1000.0) < 0.001   # 5000/5.0

    def test_sell_recalculates_shares_and_pnl(self):
        from calibrate_history import run_cascade
        # 先买入，再卖出
        trades = [
            {"type": "buy",  "code_c": "A", "name": "A", "amt": 5000,
             "data_date": "2026-05-07", "shares": 1000.0, "price": 5.0, "pnl": None},
            {"type": "sell", "code_c": "A", "name": "A", "amt": 200,
             "data_date": "2026-06-03", "shares": 40.0, "price": 5.0, "pnl": 0.0},
        ]
        price_map = {
            ("A", "2026-05-07"): 5.0,
            ("A", "2026-06-03"): 6.0,   # real price for sell
        }
        result = run_cascade(trades, price_map)
        sell = result[1]
        # mkt_val = 1000 shares * 6.0 = 6000, ratio = 200/6000 = 1/30
        # sold_shares = 1000 * (1/30) ≈ 33.333
        assert abs(sell["real_shares"] - 1000 / 30) < 0.01
        # cost_basis = 5000 * (1/30) ≈ 166.667
        # pnl = 200 - 166.667 = 33.333
        assert abs(sell["real_pnl"] - (200 - 5000 / 30)) < 0.01

    def test_cascade_sell_uses_corrected_buy_shares(self):
        """卖出的基准份额必须基于修正后的买入份额"""
        from calibrate_history import run_cascade
        trades = [
            # buy: old price=5.0, real price=4.0 → real_shares=1250 (not 1000)
            {"type": "buy",  "code_c": "A", "name": "A", "amt": 5000,
             "data_date": "2026-05-07", "shares": 1000.0, "price": 5.0, "pnl": None},
            # sell: should use 1250 as base
            {"type": "sell", "code_c": "A", "name": "A", "amt": 500,
             "data_date": "2026-06-03", "shares": 100.0, "price": 5.0, "pnl": 0.0},
        ]
        price_map = {
            ("A", "2026-05-07"): 4.0,
            ("A", "2026-06-03"): 5.0,
        }
        result = run_cascade(trades, price_map)
        sell = result[1]
        # mkt_val = 1250 * 5.0 = 6250, ratio = 500/6250 = 0.08
        # sold_shares = 1250 * 0.08 = 100
        assert abs(sell["real_shares"] - 100.0) < 0.01

    def test_skips_trade_when_price_not_found(self):
        from calibrate_history import run_cascade
        trades = [
            {"type": "buy", "code_c": "A", "name": "A", "amt": 5000,
             "data_date": "2026-05-07", "shares": 1000.0, "price": 5.0, "pnl": None},
        ]
        price_map = {}   # price not found
        result = run_cascade(trades, price_map)
        assert result[0].get("skipped") is True

    def test_skips_sell_when_state_zero(self):
        from calibrate_history import run_cascade
        # 没有买入就卖出
        trades = [
            {"type": "sell", "code_c": "A", "name": "A", "amt": 100,
             "data_date": "2026-06-03", "shares": 20.0, "price": 5.0, "pnl": 0.0},
        ]
        price_map = {("A", "2026-06-03"): 6.0}
        result = run_cascade(trades, price_map)
        assert result[0].get("skipped") is True
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
python -m pytest tests/test_calibrate.py::TestRunCascade -v
```

期望：FAIL（`run_cascade` 未定义）

- [ ] **Step 3: 在 calibrate_history.py 中实现 run_cascade**

在 `lookup_real_price` 函数之后添加：

```python
def run_cascade(
    trades: list[dict],
    price_map: dict,
) -> list[dict]:
    """
    按时间顺序级联重算所有 trade 的真实 shares/pnl。

    price_map: {(code_c, data_date): real_price}
    返回每条 trade 的副本，新增字段：
      real_price  — 真实净值（float）
      real_shares — 真实份额（float）
      real_pnl    — 真实盈亏（float | None，buy 为 None）
      _state_before — 该笔前的持仓快照 {shares, cost}
      skipped     — True 表示跳过（无价格 or 卖出时无持仓）
    """
    state: dict[str, dict] = {}   # code_c -> {shares, cost}
    results = []

    for trade in sorted(trades, key=lambda t: t['data_date']):
        code_c     = trade['code_c']
        trade_type = trade['type']
        amt        = float(trade['amt'])
        data_date  = trade['data_date']

        if code_c not in state:
            state[code_c] = {"shares": 0.0, "cost": 0.0}

        real_price = price_map.get((code_c, data_date))
        out = {**trade, "_state_before": dict(state[code_c])}

        if real_price is None:
            out["skipped"] = True
            out["skip_reason"] = "价格未找到"
            results.append(out)
            continue

        out["real_price"] = real_price

        if trade_type == "buy":
            real_shares = amt / real_price
            state[code_c]["shares"] += real_shares
            state[code_c]["cost"]   += amt
            out["real_shares"] = real_shares
            out["real_pnl"]    = None
            out["skipped"]     = False

        elif trade_type == "sell":
            prev_shares = state[code_c]["shares"]
            prev_cost   = state[code_c]["cost"]

            if prev_shares <= 0:
                out["skipped"]     = True
                out["skip_reason"] = "卖出时持仓为零"
                results.append(out)
                continue

            mkt_val     = prev_shares * real_price
            ratio       = min(amt / mkt_val, 1.0) if mkt_val > 0 else 0.0
            sold_shares = prev_shares * ratio
            cost_basis  = prev_cost   * ratio
            real_pnl    = amt - cost_basis

            state[code_c]["shares"] = max(0.0, prev_shares - sold_shares)
            state[code_c]["cost"]   = max(0.0, prev_cost   - cost_basis)

            out["real_shares"]  = sold_shares
            out["real_pnl"]     = real_pnl
            out["_cost_basis"]  = cost_basis
            out["skipped"]      = False
        else:
            out["skipped"]     = True
            out["skip_reason"] = f"未知交易类型: {trade_type}"

        results.append(out)

    # 最终持仓附在 results 上，供调用方展示
    results.append({"_final_state": state})
    return results
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
python -m pytest tests/test_calibrate.py -v
```

期望：全部 passed（含 Task 1 的 5 个测试）

- [ ] **Step 5: Commit**

```bash
git add scripts/calibrate_history.py tests/test_calibrate.py
git commit -m "feat(calibrate): add run_cascade with cascading share/pnl recalculation"
```

---

## Task 3: 完整脚本——数据收集、预览、写入

**Files:**
- Modify: `scripts/calibrate_history.py`

此任务完成脚本的剩余部分：读取 journal、查询所有价格、调用 run_cascade、dry-run 预览、确认写入。

- [ ] **Step 1: 在 calibrate_history.py 末尾追加以下函数和 main**

```python
# ── 备份工具（独立，不依赖 routers/cache.py）──────────────────

def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return default


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def _append_bak(bak_file: Path, entry: dict, max_lines: int = 1000) -> None:
    line = json.dumps(entry, ensure_ascii=False)
    lines = bak_file.read_text(encoding='utf-8').splitlines() if bak_file.exists() else []
    lines.append(line)
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    bak_file.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def _ensure_backups() -> bool:
    """确保备份文件存在，若无则自动创建当前快照。返回 True 表示备份已就绪。"""
    ok = True
    for bak_file, main_file, bak_type in [
        (AMOUNTS_BAK_FILE, AMOUNTS_FILE, "amounts"),
        (JOURNAL_BAK_FILE, None, "journal"),
    ]:
        if bak_file.exists():
            lines = [l for l in bak_file.read_text().splitlines() if l.strip()]
            if lines:
                continue  # 已有备份
        # 自动创建备份
        if bak_type == "amounts" and main_file and main_file.exists():
            data = _read_json(main_file, {})
            if data:
                _append_bak(bak_file, {"ts": datetime.now().isoformat(), "data": data})
                print(f"✓ 已自动备份 {bak_type}")
                continue
        # journal 备份：遍历所有月份
        if bak_type == "journal":
            for year_dir in sorted(CACHE_DIR.iterdir()):
                if not year_dir.is_dir() or not year_dir.name.isdigit():
                    continue
                for month_dir in sorted(year_dir.iterdir()):
                    jf = month_dir / "mdtfr_journal.json"
                    if not jf.exists():
                        continue
                    records = _read_json(jf, [])
                    if records:
                        month_str = f"{year_dir.name}-{month_dir.name}"
                        _append_bak(JOURNAL_BAK_FILE, {
                            "ts": datetime.now().isoformat(),
                            "month": month_str,
                            "data": records,
                        })
            print("✓ 已自动备份 journal")
    return ok


# ── Journal 读取 ───────────────────────────────────────────────

def collect_journal_trades(
    filter_code: str | None = None,
    force: bool = False,
    cache_dir: Path = CACHE_DIR,
) -> list[dict]:
    """
    从所有月份 journal 文件中收集 trade_records，返回按 data_date 排序的列表。
    force=False 时跳过 settled=True 的记录。
    """
    trades = []
    for year_dir in sorted(cache_dir.iterdir()):
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue
        for month_dir in sorted(year_dir.iterdir()):
            jf = month_dir / "mdtfr_journal.json"
            if not jf.exists():
                continue
            records = _read_json(jf, [])
            if not isinstance(records, list):
                continue
            for rec in records:
                data_date = rec.get("data_date", "")
                for tr in rec.get("trade_records", []):
                    code_c = tr.get("code_c", "")
                    if filter_code and code_c != filter_code:
                        continue
                    if not force and tr.get("settled"):
                        continue
                    trades.append({
                        "data_date": data_date,
                        "type":      tr.get("type", ""),
                        "code_c":    code_c,
                        "name":      tr.get("name", ""),
                        "amt":       float(tr.get("amt") or 0),
                        "shares":    float(tr.get("shares") or 0),
                        "price":     tr.get("price"),
                        "pnl":       tr.get("pnl"),
                        "_rec_data_date": data_date,
                    })
    return sorted(trades, key=lambda t: t["data_date"])


# ── 价格查询（批量）──────────────────────────────────────────────

def build_price_map(
    trades: list[dict],
    cache_dir: Path = CACHE_DIR,
) -> dict:
    """
    为每笔 trade 查询真实 T 日净值，返回 {(code_c, data_date): price}。
    找不到时不包含该键。
    """
    needed = {(t["code_c"], t["data_date"]) for t in trades}
    price_map = {}
    for code_c, data_date in sorted(needed):
        price = lookup_real_price(code_c, data_date, cache_dir=cache_dir)
        if price is not None:
            price_map[(code_c, data_date)] = price
        else:
            print(f"  ⚠ 未找到 {code_c} 在 {data_date} 的净值，将跳过该笔", file=sys.stderr)
    return price_map


# ── 预览输出 ───────────────────────────────────────────────────

def print_preview(results: list[dict]) -> None:
    print("\n=== 校准预览（dry-run，未写入）===\n")
    fmt_y = lambda n: f"¥{n:,.2f}" if n is not None else "–"
    fmt_n = lambda n: f"{n:,.4f}" if n is not None else "–"

    for r in results:
        if "_final_state" in r:
            state = r["_final_state"]
            print("\n最终持仓（校准后）:")
            for code_c, s in state.items():
                shares = s["shares"]
                cost   = s["cost"]
                if shares > 0.001:
                    print(f"  {code_c}: {fmt_n(shares)} 份  成本: {fmt_y(cost)}")
                else:
                    print(f"  {code_c}: 0 份（已清仓）")
            continue

        if r.get("skipped"):
            reason = r.get("skip_reason", "")
            print(f"[{r['data_date']}] ⚠ 跳过 {r['name']} ({r['code_c']})  原因: {reason}")
            continue

        trade_type = r["type"]
        label      = "买入" if trade_type == "buy" else "卖出"
        old_price  = r.get("price")
        new_price  = r.get("real_price")
        old_shares = r.get("shares")
        new_shares = r.get("real_shares")
        delta      = (new_shares - old_shares) if (new_shares is not None and old_shares is not None) else None

        print(f"[{r['data_date']}] {label} {r['name']} ({r['code_c']})  amt={fmt_y(r['amt'])}")
        print(f"  净值:  {old_price} → {new_price}")
        delta_str = f"  ({'+' if (delta or 0) >= 0 else ''}{fmt_n(delta)})" if delta is not None else ""
        print(f"  份额:  {fmt_n(old_shares)} → {fmt_n(new_shares)}{delta_str}")
        if trade_type == "sell":
            old_pnl = r.get("pnl")
            new_pnl = r.get("real_pnl")
            print(f"  收益:  {fmt_y(old_pnl)} → {fmt_y(new_pnl)}")
        print()


# ── 写入 ──────────────────────────────────────────────────────

def apply_calibration(results: list[dict], cache_dir: Path = CACHE_DIR) -> None:
    """将校准结果写入 journal 和 amounts.json"""
    # 提取最终 state
    final_state_entry = next((r for r in results if "_final_state" in r), None)
    final_state = final_state_entry["_final_state"] if final_state_entry else {}

    # ── 更新 journal ────────────────────────────────────────────
    # 按 (year, month, data_date) 分组
    journal_updates: dict[str, dict[str, dict]] = {}  # month_str -> {data_date -> {code_c -> fields}}
    for r in results:
        if "_final_state" in r or r.get("skipped"):
            continue
        data_date = r["_rec_data_date"]
        year, month = data_date[:4], data_date[5:7]
        month_str = f"{year}-{month}"
        journal_updates.setdefault(month_str, {}).setdefault(data_date, {})[r["code_c"]] = {
            "shares":  round(r["real_shares"], 4),
            "price":   r["real_price"],
            "settled": True,
            **({"pnl": round(r["real_pnl"], 2)} if r.get("real_pnl") is not None else {}),
        }

    for month_str, date_map in journal_updates.items():
        year, month = month_str[:4], month_str[5:7]
        jf = cache_dir / year / month / "mdtfr_journal.json"
        records = _read_json(jf, [])
        if not isinstance(records, list):
            continue
        for rec in records:
            dd = rec.get("data_date", "")
            if dd not in date_map:
                continue
            code_updates = date_map[dd]
            for tr in rec.get("trade_records", []):
                if tr.get("code_c") in code_updates:
                    tr.update(code_updates[tr["code_c"]])
        _write_json(jf, records)
        print(f"✓ 已更新 journal {month_str}")

    # ── 更新 amounts.json ───────────────────────────────────────
    amounts = _read_json(AMOUNTS_FILE, {})
    if not isinstance(amounts, dict):
        amounts = {}

    # __shares__
    shares_map = amounts.get("__shares__", {})
    for code_c, s in final_state.items():
        shares_map[code_c] = round(s["shares"], 6)
    amounts["__shares__"] = shares_map

    # __cost__
    cost_map = amounts.get("__cost__", {})
    for code_c, s in final_state.items():
        cost_map[code_c] = round(s["cost"], 2)
    amounts["__cost__"] = cost_map

    # __realized_pnl__：重算所有 sell 的 real_pnl 之和
    total_realized = sum(
        r["real_pnl"]
        for r in results
        if not r.get("skipped") and r.get("type") == "sell" and r.get("real_pnl") is not None
        and "_final_state" not in r
    )
    amounts["__realized_pnl__"] = round(total_realized, 2)

    _write_json(AMOUNTS_FILE, amounts)
    print(f"✓ 已更新 amounts.json (__shares__, __cost__, __realized_pnl__={total_realized:.2f})")


# ── Main ──────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="MDTFR 历史数据 T+1 净值校准工具")
    parser.add_argument("--dry-run", action="store_true", help="预览校准结果，不写入文件")
    parser.add_argument("--code",    default=None,        help="仅校准指定 code_c")
    parser.add_argument("--force",   action="store_true", help="强制重算已 settled 的记录")
    args = parser.parse_args()

    print("=== MDTFR 历史数据 T+1 净值校准 ===\n")

    # 前置检查：pending_corrections
    amounts_data = _read_json(AMOUNTS_FILE, {})
    pending = amounts_data.get("__pending_corrections__", [])
    if pending:
        print(f"⚠ 存在 {len(pending)} 条待结算记录（__pending_corrections__），"
              f"建议等 T+1 修正完成后再校准。\n", file=sys.stderr)

    # 确保备份存在
    if not args.dry_run:
        _ensure_backups()

    # 收集 trades
    trades = collect_journal_trades(filter_code=args.code, force=args.force)
    if not trades:
        print("✓ 无需校准的历史记录（所有记录已 settled 或无记录）。")
        return

    print(f"找到 {len(trades)} 条待校准记录：")
    for t in trades:
        label = "买入" if t["type"] == "buy" else "卖出"
        print(f"  [{t['data_date']}] {label} {t['name']} ({t['code_c']}) ¥{t['amt']:,.2f}")

    # 查询真实价格
    print("\n查询真实 T 日净值...")
    price_map = build_price_map(trades)

    # 级联重算
    results = run_cascade(trades, price_map)

    # 预览
    print_preview(results)

    if args.dry_run:
        print("[dry-run] 未写入任何文件。")
        return

    confirm = input("确认写入以上校准结果? [y/N]: ").strip().lower()
    if confirm != "y":
        print("已取消。")
        return

    apply_calibration(results)
    print("\n✅ 校准完成。")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行所有 calibrate 测试（应全部通过）**

```bash
python -m pytest tests/test_calibrate.py -v
```

期望：全部 passed（10 个测试）

- [ ] **Step 3: Dry-run 冒烟测试（不写入，验证脚本可运行）**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
python scripts/calibrate_history.py --dry-run
```

期望：
- 打印找到 5 条记录
- 查询真实净值（从 pool 缓存获取）
- 打印预览，显示 2026-06-03/06-04 的净值变化
- 打印 `[dry-run] 未写入任何文件。`

验证预览输出应包含：
```
[2026-06-03] 卖出 半导体 (007301)
  净值:  3.938 → 4.055
[2026-06-03] 卖出 科创50 (011609)
  净值:  1.292 → 1.318
[2026-06-04] 卖出 半导体 (007301)
  净值:  4.055 → 4.143
```

- [ ] **Step 4: Commit**

```bash
git add scripts/calibrate_history.py
git commit -m "feat(calibrate): complete calibrate_history.py with data collection, preview, and write"
```

---

## Task 4: 执行实际校准并验证

这是对真实数据的一次性修正操作。备份系统（子项目 A）已就绪，可安全执行。

- [ ] **Step 1: 确认当前备份存在**

```bash
python scripts/restore_backup.py --type amounts --list
python scripts/restore_backup.py --type journal --list
```

期望：至少各有 1 条备份（如果没有，运行 `python scripts/calibrate_history.py --dry-run` 会自动创建）

- [ ] **Step 2: 再次 dry-run，确认预览数据正确**

```bash
python scripts/calibrate_history.py --dry-run
```

仔细检查预览输出：
- 2026-05-07 买入：净值不变（均为正确的 T 日价），份额基本无变化
- 2026-06-03 半导体卖出：净值 3.938 → 4.055
- 2026-06-03 科创50卖出：净值 1.292 → 1.318
- 2026-06-04 半导体卖出：净值 4.055 → 4.143
- 最终持仓：半导体 ≈ 0份（已清仓），科创50 有少量剩余（原记录有部分未卖），煤炭 19882 份不变

- [ ] **Step 3: 执行校准**

```bash
python scripts/calibrate_history.py
```

在提示 `确认写入以上校准结果? [y/N]:` 时输入 `y`

期望输出：
```
✓ 已更新 journal 2026-05
✓ 已更新 journal 2026-06
✓ 已更新 amounts.json (__shares__, __cost__, __realized_pnl__=...)
✅ 校准完成。
```

- [ ] **Step 4: 验证 journal 已更新**

```bash
python3 -c "
import json; from pathlib import Path
base = Path.home() / '.investment'
for y in ['2026']:
    for m in ['05', '06']:
        jf = base / y / m / 'mdtfr_journal.json'
        if not jf.exists(): continue
        recs = json.loads(jf.read_text())
        for r in recs:
            for tr in r.get('trade_records', []):
                print(f\"{r['data_date']} {tr['type']} {tr['name']} shares={tr.get('shares')} price={tr.get('price')} pnl={tr.get('pnl')} settled={tr.get('settled')}\")
"
```

期望：所有记录 `settled=true`，2026-06-03/06-04 的 price/shares 已更新

- [ ] **Step 5: 验证 amounts.json 已更新**

```bash
python3 -c "
import json; from pathlib import Path
d = json.loads((Path.home()/'.investment/mdtfr_amounts.json').read_text())
for k in ['__shares__', '__cost__', '__realized_pnl__']:
    print(f'{k}: {json.dumps(d.get(k), ensure_ascii=False)}')
"
```

期望：
- `__shares__`: 007301 ≈ 0, 011609 有小量剩余, 008280=19882.23...（煤炭未动）
- `__realized_pnl__`: 正数（所有卖出操作的实际盈亏之和）

- [ ] **Step 6: 运行完整回归测试，确认无破坏**

```bash
python -m pytest --ignore=test_fund_enhanced.py -q
```

期望：160+ passed，0 failed

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(calibrate): execute T+1 historical calibration — verified"
```
