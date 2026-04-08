# -*- coding: utf-8 -*-
"""
宏观经济数据路由
对应 BaoStock API:
  - query_deposit_rate_data             存款利率
  - query_loan_rate_data                贷款利率
  - query_required_reserve_ratio_data   存款准备金率
  - query_money_supply_data_month       货币供应量（月度）
  - query_money_supply_data_year        货币供应量（年度）
分类：宏观经济数据接口
"""
import baostock as bs
from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/api/macroscopic", tags=["宏观经济数据"])


def _collect_rs(rs) -> list:
    data_list = []
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        data_list.append(dict(zip(rs.fields, row)))
    return data_list


@router.get(
    "/query_deposit_rate_data",
    summary="获取存款利率数据",
    description="""
获取中国人民银行公布的存款基准利率变动历史。

**返回字段：**
`date, depositRateType, rate`

**depositRateType 说明：**
- 活期存款利率
- 定期存款利率（3个月/6个月/1年/2年/3年/5年）
    """
)
def query_deposit_rate_data(
    start_date: Optional[str] = Query(None, description="起始日期，格式：YYYY-MM-DD", example="2015-01-01"),
    end_date: Optional[str] = Query(None, description="终止日期，格式：YYYY-MM-DD", example="2023-12-31")
):
    if not start_date:
        start_date = "2015-01-01"
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    lg = bs.login()
    if lg.error_code != '0':
        return {"error": f"登录失败: {lg.error_msg}"}
    try:
        rs = bs.query_deposit_rate_data(start_date=start_date, end_date=end_date)
        if rs.error_code != '0':
            return {"error": rs.error_msg}
        data = _collect_rs(rs)
        return {"start_date": start_date, "end_date": end_date, "data": data, "total": len(data)}
    finally:
        bs.logout()


@router.get(
    "/query_loan_rate_data",
    summary="获取贷款利率数据",
    description="""
获取中国人民银行公布的贷款基准利率变动历史。

**返回字段：**
`date, loanRateType, rate`

**loanRateType 说明：**
- 短期贷款利率（6个月/1年）
- 中长期贷款利率（1-3年/3-5年/5年以上）
- 个人住房公积金贷款利率
    """
)
def query_loan_rate_data(
    start_date: Optional[str] = Query(None, description="起始日期，格式：YYYY-MM-DD", example="2010-01-01"),
    end_date: Optional[str] = Query(None, description="终止日期，格式：YYYY-MM-DD", example="2023-12-31")
):
    if not start_date:
        start_date = "2010-01-01"
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    lg = bs.login()
    if lg.error_code != '0':
        return {"error": f"登录失败: {lg.error_msg}"}
    try:
        rs = bs.query_loan_rate_data(start_date=start_date, end_date=end_date)
        if rs.error_code != '0':
            return {"error": rs.error_msg}
        data = _collect_rs(rs)
        return {"start_date": start_date, "end_date": end_date, "data": data, "total": len(data)}
    finally:
        bs.logout()


@router.get(
    "/query_required_reserve_ratio_data",
    summary="获取存款准备金率数据",
    description="""
获取中国人民银行公布的存款准备金率变动历史。

**返回字段：**
`date, ratioInLargeBank, ratioInSmallBank`
    """
)
def query_required_reserve_ratio_data(
    start_date: Optional[str] = Query(None, description="起始日期，格式：YYYY-MM-DD", example="2010-01-01"),
    end_date: Optional[str] = Query(None, description="终止日期，格式：YYYY-MM-DD", example="2023-12-31")
):
    if not start_date:
        start_date = "2010-01-01"
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    lg = bs.login()
    if lg.error_code != '0':
        return {"error": f"登录失败: {lg.error_msg}"}
    try:
        rs = bs.query_required_reserve_ratio_data(start_date=start_date, end_date=end_date)
        if rs.error_code != '0':
            return {"error": rs.error_msg}
        data = _collect_rs(rs)
        return {"start_date": start_date, "end_date": end_date, "data": data, "total": len(data)}
    finally:
        bs.logout()


@router.get(
    "/query_money_supply_data_month",
    summary="获取货币供应量（月度）",
    description="""
获取中国人民银行公布的月度货币供应量（M0/M1/M2）数据。

**start_date/end_date 格式：YYYY-MM**

**返回字段：**
`statYear, statMonth, m0MonthAdd, m0YoY, m1MonthAdd, m1YoY, m2MonthAdd, m2YoY`
    """
)
def query_money_supply_data_month(
    start_date: Optional[str] = Query(None, description="起始月份，格式：YYYY-MM", example="2020-01"),
    end_date: Optional[str] = Query(None, description="终止月份，格式：YYYY-MM", example="2023-12")
):
    if not start_date:
        start_date = "2020-01"
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m')

    lg = bs.login()
    if lg.error_code != '0':
        return {"error": f"登录失败: {lg.error_msg}"}
    try:
        rs = bs.query_money_supply_data_month(start_date=start_date, end_date=end_date)
        if rs.error_code != '0':
            return {"error": rs.error_msg}
        data = _collect_rs(rs)
        return {"start_date": start_date, "end_date": end_date, "data": data, "total": len(data)}
    finally:
        bs.logout()


@router.get(
    "/query_money_supply_data_year",
    summary="获取货币供应量（年度）",
    description="""
获取中国人民银行公布的年度货币供应量（M0/M1/M2）余额数据。

**start_date/end_date 格式：YYYY**

**返回字段：**
`statYear, m0, m0YoY, m1, m1YoY, m2, m2YoY`
    """
)
def query_money_supply_data_year(
    start_date: Optional[str] = Query(None, description="起始年份，格式：YYYY", example="2010"),
    end_date: Optional[str] = Query(None, description="终止年份，格式：YYYY", example="2023")
):
    if not start_date:
        start_date = "2010"
    if not end_date:
        end_date = datetime.now().strftime('%Y')

    lg = bs.login()
    if lg.error_code != '0':
        return {"error": f"登录失败: {lg.error_msg}"}
    try:
        rs = bs.query_money_supply_data_year(start_date=start_date, end_date=end_date)
        if rs.error_code != '0':
            return {"error": rs.error_msg}
        data = _collect_rs(rs)
        return {"start_date": start_date, "end_date": end_date, "data": data, "total": len(data)}
    finally:
        bs.logout()
