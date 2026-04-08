# -*- coding: utf-8 -*-
"""
板块/指数成分股路由
对应 BaoStock API:
  - query_stock_industry    行业分类
  - query_hs300_stocks      沪深300成分股
  - query_sz50_stocks       上证50成分股
  - query_zz500_stocks      中证500成分股
分类：证券基本信息接口（板块/指数成分）
"""
import baostock as bs
from fastapi import APIRouter, Query
from typing import Optional
from session import run_bs

router = APIRouter(prefix="/api/security/sector", tags=["板块与指数成分股"])


def _collect(rs) -> tuple:
    if rs.error_code != '0':
        return None, rs.error_msg
    data = []
    while rs.error_code == '0' and rs.next():
        data.append(dict(zip(rs.fields, rs.get_row_data())))
    return data, None


@router.get(
    "/query_stock_industry",
    summary="获取行业分类数据",
    description="""
获取行业分类信息，支持按证券代码或日期查询。

**返回字段：**
`updateDate, code, code_name, industry, industryClassification`

**industry 行业编码说明：**
采用申万一级行业分类。
    """
)
async def query_stock_industry(
    code: Optional[str] = Query(None, description="证券代码，格式：sh.600000，留空返回所有", example="sh.600000"),
    date: Optional[str] = Query(None, description="查询日期，格式：YYYY-MM-DD，留空为最新", example="2023-12-31")
):
    def _query():
        return _collect(bs.query_stock_industry(code=code or "", date=date or ""))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"data": data, "total": len(data)}


@router.get(
    "/query_hs300_stocks",
    summary="获取沪深300成分股",
    description="""
获取沪深300指数当前或指定日期的成分股列表。

**返回字段：**
`updateDate, code, code_name`
    """
)
async def query_hs300_stocks(
    date: Optional[str] = Query(None, description="查询日期，格式：YYYY-MM-DD，留空为最新", example="2023-12-31")
):
    def _query():
        return _collect(bs.query_hs300_stocks(date=date or ""))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"data": data, "total": len(data)}


@router.get(
    "/query_sz50_stocks",
    summary="获取上证50成分股",
    description="""
获取上证50指数当前或指定日期的成分股列表。

**返回字段：**
`updateDate, code, code_name`
    """
)
async def query_sz50_stocks(
    date: Optional[str] = Query(None, description="查询日期，格式：YYYY-MM-DD，留空为最新", example="2023-12-31")
):
    def _query():
        return _collect(bs.query_sz50_stocks(date=date or ""))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"data": data, "total": len(data)}


@router.get(
    "/query_zz500_stocks",
    summary="获取中证500成分股",
    description="""
获取中证500指数当前或指定日期的成分股列表。

**返回字段：**
`updateDate, code, code_name`
    """
)
async def query_zz500_stocks(
    date: Optional[str] = Query(None, description="查询日期，格式：YYYY-MM-DD，留空为最新", example="2023-12-31")
):
    def _query():
        return _collect(bs.query_zz500_stocks(date=date or ""))

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {"data": data, "total": len(data)}
