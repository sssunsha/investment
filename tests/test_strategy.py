# tests/test_strategy.py — _calc_ma60 核心逻辑测试

from routers.strategy import _calc_ma60


# ── 数据不足 ──────────────────────────────────────────────────────────────────

def test_empty_input():
    assert _calc_ma60([]) == (None, None, None, None, None, None, None)

def test_59_items_insufficient():
    assert _calc_ma60([1.0] * 59) == (None, None, None, None, None, None, None)

def test_exactly_60_items_trend_info_none():
    """60条数据可算 MA60 值，但无法判断趋势（需66条）"""
    result = _calc_ma60([10.0] * 60)
    ma60, rising, rate, trend, has_uptick, above_avg, ma60_avg5 = result
    assert ma60 == 10.0
    assert rising is None
    assert rate is None
    assert trend is None

def test_65_items_trend_still_none():
    """65条数据仍不足以计算近5日 MA60 序列（需66条）"""
    result = _calc_ma60([10.0] * 65)
    ma60, rising, *rest = result
    assert ma60 == 10.0
    assert rising is None

# ── MA60 计算精度 ──────────────────────────────────────────────────────────────

def test_ma60_value_accuracy():
    """用已知等差数列验证 MA60 数值准确性"""
    closes = [float(i) for i in range(1, 67)]          # 1, 2, …, 66
    result = _calc_ma60(closes)
    # closes[-60:] = 7, 8, …, 66  →  sum = (7+66)*60/2 = 2190  →  MA60 = 36.5
    assert result[0] == 36.5

# ── 趋势判断 ──────────────────────────────────────────────────────────────────

def test_rising_trend():
    """单调递增价格 → MA60 逐日上升 → 趋势向好"""
    closes = [1.0 + i * 0.01 for i in range(70)]
    ma60, rising, rate, trend, has_uptick, above_avg, _ = _calc_ma60(closes)
    assert rising is True
    assert has_uptick is True
    assert above_avg is True
    assert trend == '趋势向好'
    assert rate > 0                     # 近5日 MA60 有正增速

def test_declining_trend():
    """单调递减价格 → MA60 连续下行 → 持续下行"""
    closes = [10.0 - i * 0.01 for i in range(70)]
    ma60, rising, rate, trend, has_uptick, above_avg, _ = _calc_ma60(closes)
    assert rising is False
    assert has_uptick is False
    assert trend == '持续下行'
    assert rate < 0

def test_unqualified_trend():
    """出现局部上翘但当前 MA60 低于近5日均值 → 未达标"""
    # 前65天 10.0，66=10.0，67/68=10.5（推高 MA60），69=10.0，70=9.0（拉低 MA60）
    # 结果：has_uptick=True，above_avg=False → rising=False → 未达标
    closes = [10.0] * 65 + [10.0, 10.5, 10.5, 10.0, 9.0]
    ma60, rising, rate, trend, has_uptick, above_avg, _ = _calc_ma60(closes)
    assert rising is False
    assert has_uptick is True
    assert above_avg is False
    assert trend == '未达标'

def test_rising_returns_positive_rate():
    """趋势向好时变化率应为正"""
    closes = [float(i) for i in range(1, 71)]
    _, _, rate, _, _, _, _ = _calc_ma60(closes)
    assert rate > 0

def test_flat_returns_zero_rate():
    """完全平坦时变化率应为 0"""
    closes = [5.0] * 70
    _, _, rate, _, _, _, _ = _calc_ma60(closes)
    assert rate == 0.0
