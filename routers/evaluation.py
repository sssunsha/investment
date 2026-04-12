# -*- coding: utf-8 -*-
"""
季频财务指标路由
对应 BaoStock API:
  - query_profit_data       季频盈利能力
  - query_operation_data    季频营运能力
  - query_growth_data       季频成长能力
  - query_balance_data      季频偿债能力
  - query_cash_flow_data    季频现金流量
  - query_dupont_data       季频杜邦指数
  - query_dividend_data     除权除息信息
  - query_adjust_factor     复权因子
分类：季频财务数据接口
"""
import baostock as bs
from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime, timedelta
from session import run_bs

router = APIRouter(prefix="/api/evaluation", tags=["季频财务指标数据"])


def _collect(rs) -> tuple:
    if rs.error_code != '0':
        return None, rs.error_msg
    data = []
    while rs.error_code == '0' and rs.next():
        data.append(dict(zip(rs.fields, rs.get_row_data())))
    return data, None


@router.get(
    "/query_profit_data",
    summary="季频盈利能力",
    description="""
获取季频盈利能力数据。

**返回字段：**
`code, pubDate, statDate, roeAvg, npMargin, gpMargin, netProfit, epsTTM, MBRevenue, totalShare, liqaShare`

**quarter 说明：** 1=Q1(1-3月), 2=Q2(1-6月), 3=Q3(1-9月), 4=Q4(1-12月)
    """
)
async def query_profit_data(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    year: int = Query(..., description="统计年份", example=2023),
    quarter: int = Query(..., description="统计季度：1/2/3/4", example=4)
):
    def _query():
        return _collect(bs.query_profit_data(code=code, year=year, quarter=quarter))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "year": year, "quarter": quarter, "data": data}


@router.get(
    "/query_operation_data",
    summary="季频营运能力",
    description="""
获取季频营运能力数据。

**返回字段：**
`code, pubDate, statDate, NRTurnRatio, NRTurnDays, INVTurnRatio, INVTurnDays, CATurnRatio, AssetTurnRatio`
    """
)
async def query_operation_data(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    year: int = Query(..., description="统计年份", example=2023),
    quarter: int = Query(..., description="统计季度：1/2/3/4", example=4)
):
    def _query():
        return _collect(bs.query_operation_data(code=code, year=year, quarter=quarter))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "year": year, "quarter": quarter, "data": data}


@router.get(
    "/query_growth_data",
    summary="季频成长能力",
    description="""
获取季频成长能力数据。

**返回字段：**
`code, pubDate, statDate, YOYEps, YOYAsset, YOYROE, YOYEquity, YOYBizIncome, YOYProfit`
    """
)
async def query_growth_data(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    year: int = Query(..., description="统计年份", example=2023),
    quarter: int = Query(..., description="统计季度：1/2/3/4", example=4)
):
    def _query():
        return _collect(bs.query_growth_data(code=code, year=year, quarter=quarter))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "year": year, "quarter": quarter, "data": data}


@router.get(
    "/query_balance_data",
    summary="季频偿债能力",
    description="""
获取季频偿债能力数据。

**返回字段：**
`code, pubDate, statDate, currentRatio, quickRatio, cashRatio, YOYLiability, liabilityToAsset, assetToEquity`
    """
)
async def query_balance_data(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    year: int = Query(..., description="统计年份", example=2023),
    quarter: int = Query(..., description="统计季度：1/2/3/4", example=4)
):
    def _query():
        return _collect(bs.query_balance_data(code=code, year=year, quarter=quarter))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "year": year, "quarter": quarter, "data": data}


@router.get(
    "/query_cash_flow_data",
    summary="季频现金流量",
    description="""
获取季频现金流量数据。

**返回字段：**
`code, pubDate, statDate, CAToAsset, NCAToAsset, tangibleAssetToAsset, ebitToInterest, CFOToOR, CFOToNP, CFOToGr`
    """
)
async def query_cash_flow_data(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    year: int = Query(..., description="统计年份", example=2023),
    quarter: int = Query(..., description="统计季度：1/2/3/4", example=4)
):
    def _query():
        return _collect(bs.query_cash_flow_data(code=code, year=year, quarter=quarter))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "year": year, "quarter": quarter, "data": data}


@router.get(
    "/query_dupont_data",
    summary="季频杜邦指数",
    description="""
获取季频杜邦指数数据。

**返回字段：**
`code, pubDate, statDate, dupontROE, dupontAssetStoEquity, dupontAssetTurn, dupontPnitoni, dupontNitoni, dupontTaxBurden, dupontInterestBurden, dupontEbitmrg`
    """
)
async def query_dupont_data(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    year: int = Query(..., description="统计年份", example=2023),
    quarter: int = Query(..., description="统计季度：1/2/3/4", example=4)
):
    def _query():
        return _collect(bs.query_dupont_data(code=code, year=year, quarter=quarter))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "year": year, "quarter": quarter, "data": data}


@router.get(
    "/query_dividend_data",
    summary="获取除权除息信息",
    description="""
获取指定证券的除权除息（分红送转）数据。

**yearType 说明：**
- `report`：报告期
- `operate`：除权除息实施日期

**返回字段：**
`code, dividPreNoticeDate, dividAgmPumDate, dividPlanAnnounceDate, dividPlanDate, dividRegistDate, dividExDate, dividPayDate, dividStockMarketDate, dividCashPsBeforeTax, dividCashPsAfterTax, dividStocksPs, dividCashStockPs, dividCancelStockPs, dividCashPs, dividShareEventId, dividPlanProgress`
    """
)
async def query_dividend_data(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    year: str = Query(..., description="查询年份", example="2023"),
    year_type: str = Query("report", alias="yearType", description="年份类型：report/operate")
):
    def _query():
        return _collect(bs.query_dividend_data(code=code, year=year, yearType=year_type))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "year": year, "yearType": year_type, "data": data}


@router.get(
    "/query_adjust_factor",
    summary="获取复权因子数据",
    description="""
获取指定证券的历史复权因子，用于手动计算复权价格。

**返回字段：**
`divdendRatio, foreAdjustFactor, backAdjustFactor, code, dividOperateDate`
    """
)
async def query_adjust_factor(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    start_date: Optional[str] = Query(None, description="起始日期，格式：YYYY-MM-DD", example="2020-01-01"),
    end_date: Optional[str] = Query(None, description="终止日期，格式：YYYY-MM-DD", example="2023-12-31")
):
    if not start_date:
        start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    def _query():
        return _collect(bs.query_adjust_factor(code=code, start_date=start_date, end_date=end_date))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"code": code, "start_date": start_date, "end_date": end_date, "data": data}
