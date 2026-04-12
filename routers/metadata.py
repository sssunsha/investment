# -*- coding: utf-8 -*-
"""
证券基础数据路由
对应 BaoStock API:
  - query_trade_dates   获取交易日信息
  - query_all_stock     获取全部证券信息
  - query_stock_basic   获取证券基本资料
分类：证券基础数据接口
"""
import baostock as bs
from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime, timedelta
from session import run_bs

router = APIRouter(prefix="/api/metadata", tags=["证券基础数据"])


def _collect(rs) -> tuple:
    if rs.error_code != '0':
        return None, rs.error_msg
    data = []
    while rs.error_code == '0' and rs.next():
        data.append(dict(zip(rs.fields, rs.get_row_data())))
    return data, None


@router.get(
    "/query_trade_dates",
    summary="获取交易日信息",
    description="""
获取指定日期范围内的交易日历，标识每天是否为交易日。

**返回字段：**
`calendar_date, is_trading_day`

**is_trading_day 说明：** 0=非交易日，1=交易日
    """
)
async def query_trade_dates(
    start_date: Optional[str] = Query(None, description="起始日期，格式：YYYY-MM-DD", example="2023-01-01"),
    end_date: Optional[str] = Query(None, description="终止日期，格式：YYYY-MM-DD", example="2023-12-31")
):
    if not start_date:
        start_date = datetime.now().strftime('%Y-01-01')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    def _query():
        return _collect(bs.query_trade_dates(start_date=start_date, end_date=end_date))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    trading_days = [d for d in data if d.get('is_trading_day') == '1']
    return {
        "start_date": start_date,
        "end_date": end_date,
        "data": data,
        "total": len(data),
        "trading_days_count": len(trading_days)
    }


@router.get(
    "/query_all_stock",
    summary="获取指定交易日全部证券信息",
    description="""
获取指定交易日在市（或退市）的所有证券代码及名称。

**返回字段：**
`code, tradeStatus, code_name`

**tradeStatus 说明：** 1=正常交易，0=停牌
    """
)
async def query_all_stock(
    day: Optional[str] = Query(None, description="查询日期，格式：YYYY-MM-DD，留空为最近交易日", example="2023-12-29")
):
    if not day:
        day = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

    def _query():
        return _collect(bs.query_all_stock(day=day))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"day": day, "data": data, "total": len(data)}


@router.get(
    "/query_stock_basic",
    summary="获取证券基本资料",
    description="""
按证券代码或证券名称查询基本资料。code 与 code_name 至少提供一个。

**返回字段：**
`code, code_name, ipoDate, outDate, type, status`

**type 说明：**
- `1`：股票
- `2`：指数
- `3`：其它
- `4`：可转债
- `5`：ETF

**status 说明：** 1=上市，0=退市
    """
)
async def query_stock_basic(
    code: Optional[str] = Query(None, description="证券代码，格式：sh.000001", example="sh.000001"),
    code_name: Optional[str] = Query(None, description="证券名称，如：浦发银行", example="浦发银行")
):
    if not code and not code_name:
        return {"error": "code 或 code_name 至少提供一个"}

    def _query():
        return _collect(bs.query_stock_basic(code=code or "", code_name=code_name or ""))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"data": data, "total": len(data)}
