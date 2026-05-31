# -*- coding: utf-8 -*-
"""
天天基金历史净值抓取模块（增强版）

C类基金（场外基金）为 OTC 产品，BaoStock 无法覆盖，改用天天基金公开接口获取历史净值。
接口返回 JSONP：jQuery({...})，每页最多 20 条，需分页获取完整历史。
字段：FSRQ（日期）、DWJZ（单位净值）。

增强版：当天天基金API失败时，自动尝试从EastMoney获取数据。
"""
import json
import logging
import re
import time
from datetime import datetime

import requests

from services.fund_nav_enhanced import FundNavEnhanced

logger = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://fund.eastmoney.com/",
})

_PAGE_SIZE = 20   # 天天基金接口每页上限


def _fetch_from_eastmoney_history(code_c: str, start_date: str, end_date: str) -> list[dict]:
    """
    备用数据源：从东方财富 pingzhongdata 接口获取历史净值数据。
    
    该接口返回基金成立以来的完整净值曲线（Data_netWorthTrend），
    数据格式为 JavaScript 数组，包含时间戳和净值。
    
    返回按日期升序排列的列表：[{"date": "YYYY-MM-DD", "close": float}, ...]
    """
    url = f"http://fund.eastmoney.com/pingzhongdata/{code_c}.js"
    
    try:
        resp = _SESSION.get(url, timeout=15)
        resp.raise_for_status()
        content = resp.text
        
        if not content:
            logger.warning("东方财富备用数据源返回空内容: %s", code_c)
            return []
        
        # 提取 Data_netWorthTrend 数组
        # 格式: var Data_netWorthTrend = [{x:timestamp,y:nav,equityReturn:return},...];
        match = re.search(r'var\s+Data_netWorthTrend\s*=\s*(\[.*?\]);', content, re.DOTALL)
        if not match:
            logger.warning("东方财富备用数据源未找到净值数据: %s", code_c)
            return []
        
        # 解析 JavaScript 数组（使用 eval 或 json）
        # 由于数据格式是 {x:..., y:...} 而不是 {"x":..., "y":...}，需要特殊处理
        nav_data_str = match.group(1)
        
        # 将 JavaScript 对象转换为 JSON 格式
        # {x:123,y:1.5,equityReturn:0.05} -> {"x":123,"y":1.5,"equityReturn":0.05}
        json_str = re.sub(r'(\w+):', r'"\1":', nav_data_str)
        
        try:
            nav_list = json.loads(json_str)
        except json.JSONDecodeError:
            # 如果 JSON 解析失败，尝试使用 eval（不推荐，但作为备用）
            logger.warning("东方财富备用数据源 JSON 解析失败，尝试 eval: %s", code_c)
            try:
                nav_list = eval(nav_data_str)
            except Exception as e:
                logger.warning("东方财富备用数据源 eval 也失败: %s, %s", code_c, e)
                return []
        
        if not nav_list:
            logger.warning("东方财富备用数据源净值列表为空: %s", code_c)
            return []
        
        # 转换为标准格式，并过滤日期范围
        all_rows = []
        for item in nav_list:
            try:
                # x 是毫秒时间戳，y 是净值
                timestamp_ms = item.get('x')
                nav_value = item.get('y')
                
                if timestamp_ms is None or nav_value is None:
                    continue
                
                # 转换时间戳为日期字符串
                date_str = datetime.fromtimestamp(timestamp_ms / 1000).strftime('%Y-%m-%d')
                
                # 过滤日期范围
                if start_date <= date_str <= end_date:
                    all_rows.append({"date": date_str, "close": float(nav_value)})
            except (ValueError, TypeError, KeyError):
                continue
        
        if all_rows:
            logger.info("东方财富备用数据源成功获取基金 %s 数据: %d 条", code_c, len(all_rows))
        else:
            logger.warning("东方财富备用数据源过滤后无数据: %s (范围: %s ~ %s)", 
                          code_c, start_date, end_date)
        
        return all_rows
        
    except Exception as e:
        logger.warning("东方财富备用数据源获取失败: %s, %s", code_c, e)
        return []


def fetch_fund_nav_series(code_c: str, start_date: str, end_date: str, max_retries: int = 3) -> list[dict]:
    """
    从天天基金获取指定 C 类基金的历史净值序列（自动分页）。
    
    增强版：失败时尝试使用FundNavEnhanced从多个数据源获取

    返回按日期升序排列的列表：[{"date": "YYYY-MM-DD", "close": float}, ...]
    失败时返回空列表，不抛出异常。
    """
    url      = "https://api.fund.eastmoney.com/f10/lsjz"
    all_rows: list[dict] = []
    page     = 1
    retry_count = 0

    while True:
        params = {
            "callback":  "jQuery",
            "fundCode":  code_c,
            "pageIndex": str(page),
            "pageSize":  str(_PAGE_SIZE),
            "startDate": start_date,
            "endDate":   end_date,
            "_":         str(int(time.time() * 1000)),
        }
        try:
            resp = _SESSION.get(url, params=params, timeout=15)
            resp.raise_for_status()
        except Exception as e:
            logger.warning("获取基金 %s 净值失败(page=%d): %s", code_c, page, e)
            # 重试机制
            retry_count += 1
            if retry_count < max_retries:
                logger.info("基金 %s 第 %d 次重试...", code_c, retry_count)
                time.sleep(1)  # 等待 1 秒后重试
                continue
            break

        # 解析 JSONP：提取括号内的 JSON 对象
        m = re.search(r'\((\{.*\})\)', resp.text, re.DOTALL)
        if not m:
            logger.warning("基金 %s 第 %d 页响应格式异常", code_c, page)
            break

        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError as e:
            logger.warning("基金 %s 第 %d 页 JSON 解析失败: %s", code_c, page, e)
            break

        nav_data    = data.get("Data") or {}
        nav_list    = nav_data.get("LSJZList") or []
        total_count = data.get("TotalCount") or 0
        
        # 调试日志：记录 API 返回的数据量
        if page == 1:
            logger.debug("基金 %s API 返回: TotalCount=%s, 本页数据=%d条", 
                        code_c, total_count, len(nav_list))
            if total_count == 0 or not nav_list:
                logger.warning("基金 %s API 返回空数据，可能是周末或 API 限流", code_c)

        for item in nav_list:
            date    = item.get("FSRQ")
            nav_str = item.get("DWJZ")
            if date and nav_str:
                try:
                    all_rows.append({"date": date, "close": float(nav_str)})
                except (ValueError, TypeError):
                    pass

        if not nav_list or len(all_rows) >= total_count:
            break

        page += 1
        time.sleep(0.05)   # 分页间隔，避免触发速率限制

    # 如果原始方法失败（返回空数据），尝试使用备用数据源
    if not all_rows:
        logger.info("天天基金API失败，尝试使用备用数据源获取基金 %s 历史数据", code_c)
        all_rows = _fetch_from_eastmoney_history(code_c, start_date, end_date)
        
    # 如果备用数据源也失败，尝试使用增强版服务（只能获取最新数据）
    if not all_rows:
        logger.info("备用数据源也失败，尝试使用增强版服务获取基金 %s 最新数据", code_c)
        try:
            nav_data = FundNavEnhanced.get_fund_nav(code_c)
            if nav_data and 'nav' in nav_data and 'nav_date' in nav_data:
                # 只返回最新的一条数据，格式匹配原函数返回值
                nav_date_str = nav_data['nav_date']
                # 如果nav_date包含时间部分，只取日期
                if ' ' in nav_date_str:
                    nav_date_str = nav_date_str.split(' ')[0]
                all_rows = [{"date": nav_date_str, "close": float(nav_data['nav'])}]
                logger.info("增强版服务成功获取基金 %s 数据: NAV=%s, Date=%s", 
                           code_c, nav_data['nav'], nav_date_str)
        except Exception as e:
            logger.warning("增强版服务也无法获取基金 %s 数据: %s", code_c, e)

    # 天天基金返回的数据是倒序（最新在前），排序为升序（最早在前）
    all_rows.sort(key=lambda x: x["date"])
    return all_rows
