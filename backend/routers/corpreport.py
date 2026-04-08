# -*- coding: utf-8 -*-
"""
公司业绩报告路由
对应 BaoStock API:
  - query_performance_express_report  公司业绩快报
  - query_forecast_report             公司业绩预告
分类：公司财报数据接口
"""
import baostock as bs
from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime, timedelta
from session import run_bs

router = APIRouter(prefix="/api/corpreport", tags=["公司业绩报告"])


def _collect(rs) -> tuple:
    if rs.error_code != '0':
        return None, rs.error_msg
    data = []
    while rs.error_code == '0' and rs.next():
        data.append(dict(zip(rs.fields, rs.get_row_data())))
    return data, None


@router.get(
    "/query_performance_express_report",
    summary="获取公司业绩快报",
    description="""
获取上市公司业绩快报数据（上市公司发布的正式年报/中报前的业绩快速预告）。

**返回字段：**
`code, performanceExpPubDate, performanceExpStatDate, performanceExpUpdateDate,
performanceExpressTotalAsset, performanceExpressNetAsset, performanceExpressEPSChgPct,
performanceExpressROEWa, performanceExpressEPSDiluted, performanceExpressGRYOY,
performanceExpressOPYOY`
    """
)
async def query_performance_express_report(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    start_date: Optional[str] = Query(None, description="起始日期，格式：YYYY-MM-DD", example="2020-01-01"),
    end_date: Optional[str] = Query(None, description="终止日期，格式：YYYY-MM-DD", example="2023-12-31")
):
    if not start_date:
        start_date = (datetime.now() - timedelta(days=365 * 3)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    def _query():
        return _collect(bs.query_performance_express_report(code, start_date=start_date, end_date=end_date))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "start_date": start_date, "end_date": end_date, "data": data, "total": len(data)}


@router.get(
    "/query_forecast_report",
    summary="获取公司业绩预告",
    description="""
获取上市公司业绩预告数据（业绩正式公告前的预估信息）。

**返回字段：**
`code, profitForcastExpPubDate, profitForcastExpStatDate, profitForcastType,
profitForcastAbstract, profitForcastChgPctUp, profitForcastChgPctDwn`
    """
)
async def query_forecast_report(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    start_date: Optional[str] = Query(None, description="起始日期，格式：YYYY-MM-DD", example="2020-01-01"),
    end_date: Optional[str] = Query(None, description="终止日期，格式：YYYY-MM-DD", example="2023-12-31")
):
    if not start_date:
        start_date = (datetime.now() - timedelta(days=365 * 3)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    def _query():
        return _collect(bs.query_forecast_report(code, start_date=start_date, end_date=end_date))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "start_date": start_date, "end_date": end_date, "data": data, "total": len(data)}
