# -*- coding: utf-8 -*-
"""
解析器注册表 — 将各 parse 函数与 indicator key 关联

PARSER_MAP 供 scraper.py 的 scrape_indicator 查找对应解析函数
"""
from .valuation import (
    _parse_pe, _parse_index_pe_pb, _parse_stock_bond_ratio,
    _parse_buffett_index, _parse_hsi_pe,
)
from .liquidity import (
    _parse_shibor, _parse_cn_10y_bond, _parse_m1_m2,
    _parse_m2_gdp, _parse_financing_balance,
)
from .macro import _parse_cpi, _parse_ppi, _parse_bdi, _parse_us_treasury
from .cn_pmi import _parse_cn_pmi
from .us_equity import _parse_sp500_pe

PARSER_MAP = {
    "a_share_pe":        _parse_pe,
    "csi300_pe_pb":      _parse_index_pe_pb,
    "csi500_pe_pb":      _parse_index_pe_pb,
    "stock_bond_ratio":  _parse_stock_bond_ratio,
    "buffett_index":     _parse_buffett_index,
    "hsi_pe":            _parse_hsi_pe,
    "shibor":            _parse_shibor,
    "cn_10y_bond":       _parse_cn_10y_bond,
    "m1_m2":             _parse_m1_m2,
    "m2_gdp":            _parse_m2_gdp,
    "financing_balance": _parse_financing_balance,
    "cpi":               _parse_cpi,
    "ppi":               _parse_ppi,
    "bdi":               _parse_bdi,
    "us_treasury":       _parse_us_treasury,
    "cn_pmi":            _parse_cn_pmi,
    "us_sp500_pe":       _parse_sp500_pe,
}

__all__ = ["PARSER_MAP"]
