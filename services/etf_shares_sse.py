# -*- coding: utf-8 -*-
"""
上交所 ETF 每日份额数据抓取模块（按周聚合）

从上交所官网 query.sse.com.cn 获取 ETF 每日总份额（万份），
按周五采样聚合为周数据，本地缓存于 ~/.investment/etf_shares_weekly.json。

数据源：https://query.sse.com.cn/commonQuery.do
  - sqlId=COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L
  - 每日更新，覆盖所有上交所 ETF（约 895 只）
  - 返回字段：SEC_CODE, SEC_NAME, TOT_VOL（万份）, STAT_DATE

限制：仅覆盖上交所（5xxxxx / 58xxxx）ETF，深交所（159xxx）不可用。
"""
import json, logging, re, time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import requests

logger = logging.getLogger(__name__)
CACHE_FILE = Path.home() / ".investment" / "etf_shares_weekly.json"

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.sse.com.cn/market/funddata/volumn/etfvolumn/",
})
_SSE_URL = "https://query.sse.com.cn/commonQuery.do"



def _load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text("utf-8"))
        except Exception:
            pass
    return {"meta": {}, "weeks": {}}


def _save_cache(data: dict):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


def _fridays_in_range(start_date: str, end_date: str) -> list[str]:
    """生成日期范围内所有周五的列表。"""
    d = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    while d.weekday() != 4:
        d += timedelta(days=1)
    result = []
    while d <= end:
        result.append(d.strftime("%Y-%m-%d"))
        d += timedelta(days=7)
    return result


def _resolve_friday_to_workday(friday: str) -> str:
    """周五 → 工作日：如果周五本身即工作日直接返回，否则向后顺延跳过周末（最多 +4 天到下周二）。
    注意：不处理法定节假日，节假日靠 SSE API 返回空数据来兜底。"""
    d = datetime.strptime(friday, "%Y-%m-%d")
    for offset in range(0, 5):
        candidate = d + timedelta(days=offset)
        if candidate.weekday() < 5:  # 0-4 = Mon-Fri
            return candidate.strftime("%Y-%m-%d")
    return friday  # fallback


def _fetch_sse_all_etf_shares(stat_date: str) -> dict[str, float]:
    """从上交所 API 获取指定日期所有 ETF 份额，返回 {SEC_CODE: TOT_VOL(万份)}。"""
    params = {
        "jsonCallBack": "cb",
        "isPagination": "true",
        "pageHelp.pageSize": "1000",
        "pageHelp.pageNo": "1",
        "pageHelp.beginPage": "1",
        "pageHelp.cacheSize": "1",
        "pageHelp.endPage": "1",
        "sqlId": "COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L",
        "STAT_DATE": stat_date,
    }
    try:
        resp = _SESSION.get(_SSE_URL, params=params, timeout=15)
        resp.raise_for_status()
        text = resp.text
        m = re.match(r'^cb\((.+)\)$', text, re.DOTALL)
        if not m:
            return {}
        data = json.loads(m.group(1))
        items = data.get("pageHelp", {}).get("data") or []
        result = {}
        for item in items:
            code = item.get("SEC_CODE", "")
            vol = item.get("TOT_VOL")
            if code and vol:
                try:
                    result[code] = float(str(vol).replace(",", ""))
                except (ValueError, TypeError):
                    pass
        return result
    except Exception as e:
        logger.debug("SSE ETF 份额获取失败 %s: %s", stat_date, e)
        return {}



def fetch_weekly_shares(etf_codes: list[str], weeks: int = 52) -> dict:
    """
    获取指定沪市 ETF 的周份额数据（按周五采样）。

    参数:
        etf_codes: 6 位 ETF 代码列表，如 ['510300', '512480']
        weeks: 需要的周数，默认 52（约 1 年）

    返回:
        {
            "510300": [
                {"date": "2025-08-29", "shares": 910.35},  # 亿份
                ...
            ],
        }

    不依赖 BaoStock，完全自治（SSE API + 本地缓存）。
    """
    cache = _load_cache()
    weeks_data = cache.get("weeks", {})

    today = datetime.now()
    start = today - timedelta(weeks=weeks + 2)
    start_date = start.strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")

    fridays = _fridays_in_range(start_date, end_date)
    # 将每个周五映射为最近工作日（跳过周末），法定节假日由 SSE 空数据兜底
    sample_dates = [_resolve_friday_to_workday(f) for f in fridays]
    # 不取未来日期
    sample_dates = [d for d in sample_dates if d <= end_date]
    sample_dates = sample_dates[-weeks:]

    missing_dates = [d for d in sample_dates if d not in weeks_data]
    if missing_dates:
        logger.info("SSE 周份额：需拉取 %d 个日期（缓存 %d/%d）",
                     len(missing_dates),
                     len(sample_dates) - len(missing_dates),
                     len(sample_dates))
        for d in missing_dates:
            all_shares = _fetch_sse_all_etf_shares(d)
            if all_shares:
                weeks_data[d] = all_shares
            time.sleep(0.3)

        cache["weeks"] = weeks_data
        cache["meta"]["last_updated"] = datetime.now().isoformat()
        _save_cache(cache)

    result = {}
    for code in etf_codes:
        history = []
        for d in sample_dates:
            day_data = weeks_data.get(d, {})
            vol_wan = day_data.get(code)
            if vol_wan is not None:
                history.append({
                    "date": d,
                    "shares": round(vol_wan / 10000, 4),  # 万份 → 亿份
                })
        if history:
            result[code] = history
    return result
