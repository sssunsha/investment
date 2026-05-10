# tests/test_scraper.py — _parse_float / _parse_date / _evaluate_status 测试

from services.scraper import _parse_float, _parse_date, _evaluate_status


# ── _parse_float ──────────────────────────────────────────────────────────────

def test_parse_float_normal():
    assert _parse_float('3.14') == 3.14

def test_parse_float_with_percent():
    assert _parse_float('15.6%') == 15.6

def test_parse_float_with_comma():
    assert _parse_float('1,234.56') == 1234.56

def test_parse_float_with_leading_trailing_spaces():
    assert _parse_float('  2.5  ') == 2.5

def test_parse_float_empty_string():
    assert _parse_float('') is None

def test_parse_float_none_input():
    assert _parse_float(None) is None

def test_parse_float_non_numeric():
    assert _parse_float('abc') is None

def test_parse_float_integer_string():
    assert _parse_float('42') == 42.0

def test_parse_float_negative():
    assert _parse_float('-1.5%') == -1.5


# ── _parse_date ───────────────────────────────────────────────────────────────

def test_parse_date_chinese_full():
    assert _parse_date('2026年04月17日') == '2026-04-17'

def test_parse_date_chinese_single_digit():
    assert _parse_date('2026年4月7日') == '2026-04-07'

def test_parse_date_iso_format():
    assert _parse_date('2026-4-7') == '2026-04-07'

def test_parse_date_year_month_only():
    assert _parse_date('2026年03月') == '2026-03'

def test_parse_date_with_surrounding_text():
    assert _parse_date('更新日期：2025年12月31日') == '2025-12-31'

def test_parse_date_empty_string():
    assert _parse_date('') is None

def test_parse_date_none_input():
    assert _parse_date(None) is None

def test_parse_date_no_match():
    assert _parse_date('no date here') is None


# ── _evaluate_status ──────────────────────────────────────────────────────────

def _ind(key, values):
    """构造最小 indicator dict 供测试"""
    return {'key': key, 'values': values, 'thresholds': {}}


# stock_bond_ratio
def test_stock_bond_ratio_very_bullish():
    s = _evaluate_status(_ind('stock_bond_ratio', {'primary': 2.5}))
    assert s['level'] == 'very_bullish'
    assert '买入信号' in s['signals']

def test_stock_bond_ratio_bullish():
    s = _evaluate_status(_ind('stock_bond_ratio', {'primary': 1.7}))
    assert s['level'] == 'bullish'

def test_stock_bond_ratio_normal():
    s = _evaluate_status(_ind('stock_bond_ratio', {'primary': 1.2}))
    assert s['level'] == 'normal'

def test_stock_bond_ratio_bearish():
    s = _evaluate_status(_ind('stock_bond_ratio', {'primary': 0.8}))
    assert s['level'] == 'bearish'
    assert '卖出信号' in s['signals']

def test_stock_bond_ratio_uses_shanghai_as_fallback():
    """primary 不存在时回退到 shanghai_ratio"""
    s = _evaluate_status(_ind('stock_bond_ratio', {'shanghai_ratio': 2.1}))
    assert s['level'] == 'very_bullish'

# buffett_index
def test_buffett_index_very_bullish():
    s = _evaluate_status(_ind('buffett_index', {'buffett_index': 70}))
    assert s['level'] == 'very_bullish'
    assert '买入信号' in s['signals']

def test_buffett_index_very_bearish():
    s = _evaluate_status(_ind('buffett_index', {'buffett_index': 130}))
    assert s['level'] == 'very_bearish'
    assert '卖出信号' in s['signals']

def test_buffett_index_warning():
    s = _evaluate_status(_ind('buffett_index', {'buffett_index': 110}))
    assert s['level'] == 'warning'

def test_buffett_index_normal():
    s = _evaluate_status(_ind('buffett_index', {'buffett_index': 90}))
    assert s['level'] == 'normal'

# shibor
def test_shibor_loose():
    s = _evaluate_status(_ind('shibor', {'overnight': 1.2}))
    assert s['level'] == 'loose'
    assert '利好' in s['signals']

def test_shibor_warning():
    s = _evaluate_status(_ind('shibor', {'overnight': 2.5}))
    assert s['level'] == 'warning'

def test_shibor_tight():
    s = _evaluate_status(_ind('shibor', {'overnight': 3.5}))
    assert s['level'] == 'tight'
    assert '利空' in s['signals']

# us_treasury
def test_us_treasury_recession():
    s = _evaluate_status(_ind('us_treasury', {'spread_bp': -30}))
    assert s['level'] == 'recession'
    assert '卖出信号' in s['signals']

def test_us_treasury_inversion_warning():
    s = _evaluate_status(_ind('us_treasury', {'spread_bp': -10}))
    assert s['level'] == 'warning'

def test_us_treasury_normal():
    s = _evaluate_status(_ind('us_treasury', {'spread_bp': 50}))
    assert s['level'] == 'normal'

# financing_balance
def test_financing_balance_overheat():
    s = _evaluate_status(_ind('financing_balance', {'growth_rate': 35}))
    assert s['level'] == 'overheat'
    assert '卖出信号' in s['signals']

def test_financing_balance_warning():
    s = _evaluate_status(_ind('financing_balance', {'growth_rate': 25}))
    assert s['level'] == 'warning'

def test_financing_balance_cold():
    s = _evaluate_status(_ind('financing_balance', {'growth_rate': -15}))
    assert s['level'] == 'cold'
    assert '买入信号' in s['signals']

# cpi
def test_cpi_severe_inflation():
    s = _evaluate_status(_ind('cpi', {'cpi': 6.0}))
    assert s['level'] == 'high'

def test_cpi_policy_pressure():
    s = _evaluate_status(_ind('cpi', {'cpi': 3.5}))
    assert s['level'] == 'warning'

def test_cpi_low_inflation():
    s = _evaluate_status(_ind('cpi', {'cpi': 1.5}))
    assert s['level'] == 'low'

# bdi
def test_bdi_boom():
    s = _evaluate_status(_ind('bdi', {'bdi': 2500}))
    assert s['level'] == 'boom'

def test_bdi_depression():
    s = _evaluate_status(_ind('bdi', {'bdi': 800}))
    assert s['level'] == 'depression'

def test_bdi_neutral():
    s = _evaluate_status(_ind('bdi', {'bdi': 1500}))
    assert s['level'] == 'normal'     # 1000-2000 区间：未命中任何分支，保持默认 normal

# 未知 key 返回默认 normal
def test_unknown_indicator_defaults_to_normal():
    s = _evaluate_status({'key': 'unknown', 'values': {}, 'thresholds': {}})
    assert s['level'] == 'normal'

# values 为空时不崩溃
def test_stock_bond_ratio_missing_value_stays_normal():
    s = _evaluate_status(_ind('stock_bond_ratio', {}))
    assert s['level'] == 'normal'
