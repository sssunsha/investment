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

    results.append({"_final_state": state})
    return results
