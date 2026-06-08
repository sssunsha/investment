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

        price = lookup_real_price("007301", "2026-05-07", cache_dir=tmp_path, use_api=False)
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

        price = lookup_real_price("007301", "2026-05-07", cache_dir=tmp_path, use_api=False)
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
        assert len(result) == 2   # 1 trade + 1 _final_state sentinel
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
