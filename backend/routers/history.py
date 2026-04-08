# -*- coding: utf-8 -*-
"""
历史行情数据路由
对应 BaoStock API: query_history_k_data_plus
分类：历史行情数据接口
"""
import baostock as bs
from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime, timedelta
from session import run_bs

router = APIRouter(prefix="/api/security/history", tags=["历史行情数据"])


def _collect(rs) -> tuple:
    """在线程池内收集 ResultSet，返回 (data, error_msg)"""
    if rs.error_code != '0':
        return None, rs.error_msg
    data = []
    while rs.error_code == '0' and rs.next():
        data.append(dict(zip(rs.fields, rs.get_row_data())))
    return data, None


@router.get(
    "/query_history_k_data_plus",
    summary="获取历史A股K线数据",
    description="""
获取个股历史K线数据（A股）。

**frequency 参数说明：**
- `d`：日K线
- `w`：周K线
- `m`：月K线
- `5`：5分钟
- `15`：15分钟
- `30`：30分钟
- `60`：60分钟

**adjustflag 参数说明：**
- `1`：后复权
- `2`：前复权
- `3`：不复权（默认）

**fields 可选字段（日K线）：**
`date, code, open, high, low, close, preclose, volume, amount, adjustflag, turn, tradestatus, pctChg, peTTM, pbMRQ, psTTM, pcfNcfTTM, isST`

**fields 可选字段（分钟K线）：**
`date, time, code, open, high, low, close, volume, amount, adjustflag`
    """
)
async def query_history_k_data_plus(
    code: str = Query(..., description="证券代码，格式：sh.000001", example="sh.000001"),
    fields: str = Query(
        "date,code,open,high,low,close,preclose,volume,amount,adjustflag,turn,tradestatus,pctChg,isST",
        description="返回字段，逗号分隔"
    ),
    start_date: Optional[str] = Query(None, description="起始日期，格式：YYYY-MM-DD", example="2023-01-01"),
    end_date: Optional[str] = Query(None, description="终止日期，格式：YYYY-MM-DD", example="2023-12-31"),
    frequency: str = Query("d", description="数据频率：d/w/m/5/15/30/60"),
    adjustflag: str = Query("3", description="复权类型：1后复权/2前复权/3不复权")
):
    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    def _query():
        rs = bs.query_history_k_data_plus(
            code, fields,
            start_date=start_date, end_date=end_date,
            frequency=frequency, adjustflag=adjustflag
        )
        return _collect(rs)

    result = await run_bs(_query)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    data, err = result
    if err:
        return {"error": err}
    return {
        "code": code,
        "fields": fields.split(","),
        "frequency": frequency,
        "adjustflag": adjustflag,
        "start_date": start_date,
        "end_date": end_date,
        "data": data,
        "total": len(data)
    }
