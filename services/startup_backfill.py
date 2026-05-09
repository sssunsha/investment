# -*- coding: utf-8 -*-
"""
启动回填服务：应用启动时自动检查并补全缺失的 mdtfr 标的池缓存

检查逻辑：
  1. 通过 BaoStock query_trade_dates 获取最近 BACKFILL_DAYS 个交易日
  2. 检查哪些交易日在 ~/.investment/YYYY/MM/mdtfr_pool.json 中缺失
  3. 对缺失日期，从天天基金一次性拉取所有 C 类基金的历史净值，逐日计算并写入缓存

价格来源：天天基金公开接口（C 类基金单位净值），与用户实际买卖价格一致。
"""
import asyncio
import logging
import re
import time
from datetime import datetime, timedelta

import baostock as bs

from routers.cache import CACHE_DIR, _read_json, _write_json, _month_dir
from routers.strategy import MDTFR_ETFS, _calc_ma60
from services.fund_nav import fetch_fund_nav_series

logger = logging.getLogger(__name__)

# 回溯检查的最近交易日数
BACKFILL_DAYS = 30


def _get_trading_days(start_date: str, end_date: str) -> list[str]:
    """查询指定区间内的交易日列表（在已登录的 BaoStock 会话内调用）"""
    rs = bs.query_trade_dates(start_date=start_date, end_date=end_date)
    days = []
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        if row[1] == '1':
            days.append(row[0])
    return days


def _find_missing_days(trading_days: list[str]) -> list[str]:
    """从交易日列表中筛选出缓存中缺失的日期"""
    missing = []
    for d in trading_days:
        m = re.fullmatch(r'(\d{4})-(\d{2})-\d{2}', d)
        if not m:
            continue
        year, month = m.group(1), m.group(2)
        pool_path = CACHE_DIR / year / month / "mdtfr_pool.json"
        monthly = _read_json(pool_path, {})
        if d not in monthly:
            missing.append(d)
    return missing


def _compute_snapshot(target_date: str, all_fund_data: dict[str, list[dict]]) -> list[dict]:
    """用预取的基金净值数据计算指定日期的标的池快照"""
    results = []
    for etf in MDTFR_ETFS:
        rows = all_fund_data.get(etf["code_c"], [])
        rows_up_to = [r for r in rows if r["date"] <= target_date]
        n = len(rows_up_to)

        if n < 21:
            results.append({
                **etf,
                "error": f"数据不足（{n} 条，需至少 21 条）",
                "latest_close": None, "prev_close": None, "latest_date": None,
            })
            continue

        closes = [r["close"] for r in rows_up_to]
        latest_close = closes[-1]
        prev_close   = closes[-2]
        ma20 = round(sum(closes[-20:]) / 20, 3)
        ma60, ma60_rising, ma60_rate, ma60_trend, ma60_has_uptick, ma60_above_avg, ma60_avg5 = _calc_ma60(closes)
        ret_20d = round((closes[-1] - closes[-21]) / closes[-21], 6) if n >= 21 else None

        results.append({
            **etf,
            "latest_close":    round(latest_close, 3),
            "prev_close":      round(prev_close, 3),
            "latest_date":     rows_up_to[-1]["date"],
            "ret_20d":         ret_20d,
            "ma20":            ma20,
            "ma60":            ma60,
            "above_ma20":      latest_close > ma20,
            "ma60_rising":     ma60_rising,
            "ma60_rate":       ma60_rate,
            "ma60_trend":      ma60_trend,
            "ma60_has_uptick": ma60_has_uptick,
            "ma60_above_avg":  ma60_above_avg,
            "ma60_avg5":       ma60_avg5,
            "error":           None,
        })

    valid   = [x for x in results if not x.get("error") and x.get("ret_20d") is not None]
    invalid = [x for x in results if x.get("error") or x.get("ret_20d") is None]
    sorted_valid = sorted(valid, key=lambda x: x["ret_20d"], reverse=True)
    for i, x in enumerate(sorted_valid):
        x["rank"] = i + 1
    return sorted_valid + invalid


def _save_snapshot(date: str, items: list[dict]) -> None:
    """将标的池快照写入缓存文件"""
    m = re.fullmatch(r'(\d{4})-(\d{2})-\d{2}', date)
    if not m:
        return
    year, month = m.group(1), m.group(2)
    pool_path = _month_dir(year, month) / "mdtfr_pool.json"
    monthly = _read_json(pool_path, {})
    monthly[date] = items
    _write_json(pool_path, monthly)


def _fetch_and_fill(missing: list[str], data_end: str) -> dict:
    """从天天基金批量拉取净值并逐日写入缓存（纯 HTTP，无需 BaoStock）"""
    data_start = (datetime.strptime(missing[0], '%Y-%m-%d') - timedelta(days=200)).strftime('%Y-%m-%d')

    logger.info("启动回填：拉取基金净值区间 %s ~ %s（共 %d 只）", data_start, data_end, len(MDTFR_ETFS))
    all_fund_data: dict[str, list[dict]] = {}
    for etf in MDTFR_ETFS:
        try:
            rows = fetch_fund_nav_series(etf["code_c"], data_start, data_end)
            all_fund_data[etf["code_c"]] = rows
            time.sleep(0.15)
        except Exception as e:
            logger.warning("启动回填：获取 %s(%s) 净值失败: %s", etf["name"], etf["code_c"], e)
            all_fund_data[etf["code_c"]] = []

    filled, failed = [], []
    for date in missing:
        try:
            items = _compute_snapshot(date, all_fund_data)
            _save_snapshot(date, items)
            filled.append(date)
            logger.info("启动回填：已写入 %s（%d 只标的）", date, len(items))
        except Exception as e:
            logger.error("启动回填：处理 %s 失败: %s", date, e)
            failed.append(date)

    return {"filled": len(filled), "dates": filled, "failed": failed}


async def backfill_missing_pool_data() -> None:
    """启动回填任务入口，由 lifespan 中 asyncio.create_task 调用"""
    from session import run_bs

    logger.info("启动回填任务：检查 mdtfr 标的池缓存完整性...")

    today       = datetime.now()
    end_check   = today.strftime('%Y-%m-%d')
    start_check = (today - timedelta(days=60)).strftime('%Y-%m-%d')

    # Phase 1：通过 BaoStock 获取交易日历（快速，秒级完成）
    trading_days = await run_bs(lambda: _get_trading_days(start_check, end_check))
    if not trading_days:
        logger.warning("启动回填：获取交易日历为空，跳过")
        return

    # Phase 2：本地检查缺失日期
    missing = _find_missing_days(trading_days[-BACKFILL_DAYS:])
    if not missing:
        logger.info("启动回填：最近 %d 个交易日缓存完整，无需回填", BACKFILL_DAYS)
        return

    logger.info("启动回填：发现 %d 个缺失交易日：%s", len(missing), missing)

    # Phase 3：从天天基金拉取净值并写入缓存（HTTP，不占用 BaoStock 锁）
    try:
        loop   = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, lambda: _fetch_and_fill(missing, end_check))
        logger.info("启动回填完成：%s", result)
    except Exception as e:
        logger.error("启动回填异常: %s", e, exc_info=True)
