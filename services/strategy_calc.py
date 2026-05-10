# -*- coding: utf-8 -*-
"""
策略计算纯函数层（无 HTTP 依赖，可直接单元测试）
"""
import baostock as bs


def _calc_ma60(closes: list) -> tuple:
    """计算 MA60 值及趋势向好判断。

    返回 (ma60, ma60_rising, ma60_rate, ma60_trend, has_uptick, above_avg, ma60_avg5)

    趋势向好（ma60_rising=True）须同时满足：
      1. 近5个交易日内至少1日的 MA60 > 前一日 MA60（出现拐头）
      2. 当前 MA60 ≥ 前5日 MA60 均值

    数据不足时：
      n >= 66 : 可计算近5日 MA60 序列（标准）
      n <  66 : ma60_rising/ma60_rate/ma60_trend/has_uptick/above_avg 置 None
      n <  60 : 全部置 None
    """
    n = len(closes)
    if n < 60:
        return None, None, None, None, None, None, None
    ma60 = round(sum(closes[-60:]) / 60, 4)
    if n < 66:
        return round(ma60, 3), None, None, None, None, None, None

    # 近5日每日的 MA60 值（含今日）
    ma60_series = [sum(closes[i - 60:i]) / 60 for i in range(n - 4, n + 1)]

    # 条件1：近5日内至少1日出现 MA60 > 前一日 MA60
    has_uptick = any(ma60_series[i] > ma60_series[i - 1] for i in range(1, 5))
    # 条件2：当前 MA60 >= 前5日 MA60 均值
    ma60_avg5 = sum(ma60_series[:5]) / 5
    above_avg = ma60_series[-1] >= ma60_avg5

    rising = has_uptick and above_avg

    if rising:
        trend = "趋势向好"
    else:
        if all(ma60_series[i] <= ma60_series[i - 1] for i in range(1, 5)):
            trend = "持续下行"
        else:
            trend = "未达标"

    # 保留变化率供展示（当前 MA60 vs 5日前 MA60）
    rate = round((ma60_series[-1] / ma60_series[0] - 1) * 100, 4)

    return round(ma60, 3), rising, rate, trend, has_uptick, above_avg, round(ma60_avg5, 3)


def _fetch_close_series(code: str, start_date: str, end_date: str) -> list[dict]:
    """获取前复权日收盘价序列（在线程池内调用）"""
    rs = bs.query_history_k_data_plus(
        code, "date,close",
        start_date=start_date, end_date=end_date,
        frequency="d", adjustflag="2"
    )
    rows = []
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        if row[1]:
            rows.append({"date": row[0], "close": float(row[1])})
    return rows
