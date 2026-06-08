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
