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
