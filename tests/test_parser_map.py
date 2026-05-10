# -*- coding: utf-8 -*-
"""services/parsers/__init__.py 的结构测试 — 确保 PARSER_MAP 完整且每个值可调用"""
import pytest
from services.parsers import PARSER_MAP

EXPECTED_KEYS = [
    "a_share_pe",
    "csi300_pe_pb",
    "csi500_pe_pb",
    "stock_bond_ratio",
    "buffett_index",
    "hsi_pe",
    "shibor",
    "cn_10y_bond",
    "m1_m2",
    "m2_gdp",
    "financing_balance",
    "cpi",
    "ppi",
    "bdi",
    "us_treasury",
]


class TestParserMap:
    def test_all_expected_keys_present(self):
        for key in EXPECTED_KEYS:
            assert key in PARSER_MAP, f"PARSER_MAP 缺少 key: {key}"

    def test_no_unexpected_keys(self):
        extra = set(PARSER_MAP) - set(EXPECTED_KEYS)
        assert not extra, f"PARSER_MAP 多出未预期的 key: {extra}"

    def test_all_values_are_callable(self):
        for key, fn in PARSER_MAP.items():
            assert callable(fn), f"PARSER_MAP['{key}'] 不是可调用对象"

    @pytest.mark.parametrize("key", EXPECTED_KEYS)
    def test_each_parser_accepts_empty_html(self, key):
        """每个 parser 对空 HTML 不应抛出异常，且返回 dict"""
        fn = PARSER_MAP[key]
        result = fn("")
        assert isinstance(result, dict), f"{key} 返回值不是 dict"
        assert "values" in result, f"{key} 返回值缺少 'values' 键"
        assert "date" in result, f"{key} 返回值缺少 'date' 键"
