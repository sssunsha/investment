# -*- coding: utf-8 -*-
"""
ETF 份额周变化数据抓取模块

从东方财富 pingzhongdata 接口获取 ETF/基金总份额及申赎数据。
数据粒度为季度（公募基金报告期），缓存于 ~/.investment/etf_shares.json。

数据源：东方财富 pingzhongdata 接口
  - Data_buySedemption: 总份额、期间申购、期间赎回（季度级）
  - Data_fluctuationScale: 基金规模（亿元）及环比变化（季度级）
"""
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests

logger = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Referer": "https://fund.eastmoney.com/",
})

CACHE_FILE = Path.home() / ".investment" / "etf_shares.json"


def _load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text("utf-8"))
        except Exception:
            pass
    return {}


def _save_cache(data: dict):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


def _is_cache_fresh(cache: dict, etf_code: str, max_age_hours: int = 24) -> bool:
    entry = cache.get(etf_code)
    if not entry or "fetched_at" not in entry:
        return False
    try:
        fetched = datetime.fromisoformat(entry["fetched_at"])
        return (datetime.now() - fetched).total_seconds() < max_age_hours * 3600
    except Exception:
        return False


_RESULT_KEYS = (
    "share_total", "share_chg_1w", "share_chg_2w", "share_chg_3w",
    "share_streak", "share_signal", "share_date",
)


def fetch_etf_shares(etf_code: str, force: bool = False) -> Optional[dict]:
    """
    获取单只 ETF 的份额数据（含最近 3 期变化）。

    数据粒度为季度（公募基金季报公布总份额），字段名用 "1w/2w/3w"
    是为了与前端展示统一（实际为最近 1/2/3 个季度的环比变化）。

    返回:
        {
            "share_total": 189.15,       # 最新总份额（亿份）
            "share_chg_1w": -0.578,      # 最近一期份额变化率
            "share_chg_2w": -0.495,      # 上一期变化率
            "share_chg_3w": -0.009,      # 再上一期变化率
            "share_streak": -3,          # 连续增/减期数
            "share_signal": "大幅流出",   # 综合信号
            "share_date": "2026-06-30",  # 数据日期
        }
    """
    cache = _load_cache()
    if not force and _is_cache_fresh(cache, etf_code):
        entry = cache[etf_code]
        return {k: entry[k] for k in _RESULT_KEYS if k in entry}

    raw = _fetch_share_history(etf_code)
    if not raw or len(raw) < 2:
        logger.warning("ETF 份额数据不足: %s (获取 %d 条)", etf_code, len(raw) if raw else 0)
        return None

    result = _calc_share_changes(raw)
    if result:
        cache[etf_code] = {**result, "fetched_at": datetime.now().isoformat()}
        _save_cache(cache)
    return result


def _fetch_share_history(etf_code: str) -> list[dict]:
    """
    从东方财富 pingzhongdata 获取基金份额历史。

    优先使用 Data_buySedemption（含总份额），回退到 Data_fluctuationScale（基金规模）。
    返回: [{"date": "YYYY-MM-DD", "shares": float}, ...] 按日期升序
    """
    url = f"http://fund.eastmoney.com/pingzhongdata/{etf_code}.js"
    try:
        resp = _SESSION.get(url, timeout=15)
        resp.raise_for_status()
        content = resp.text
        if not content:
            return []

        # 优先: Data_buySedemption — 含「总份额」（亿份）
        result = _parse_buy_redemption(content)
        if result and len(result) >= 2:
            return result

        # 回退: Data_fluctuationScale — 含基金规模（亿元）
        result = _parse_fluctuation_scale(content)
        if result and len(result) >= 2:
            return result

        return []

    except Exception as e:
        logger.debug("pingzhongdata 获取失败 %s: %s", etf_code, e)
        return []


def _parse_buy_redemption(content: str) -> list[dict]:
    """
    解析 Data_buySedemption 变量。
    格式: {
      "series": [
        {"name":"期间申购","data":[...]},
        {"name":"期间赎回","data":[...]},
        {"name":"总份额","data":[897.16, 888.3, 448.29, 189.15]}
      ],
      "categories": ["2025-09-30","2025-12-31","2026-03-31","2026-06-30"]
    }
    """
    m = re.search(
        r'var\s+Data_buySedemption\s*=\s*(\{.*?\})\s*;',
        content, re.DOTALL
    )
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except (json.JSONDecodeError, ValueError):
        return []

    categories = data.get("categories", [])
    series_list = data.get("series", [])
    if not categories or not series_list:
        return []

    # 找到「总份额」系列
    share_series = None
    for s in series_list:
        if isinstance(s, dict) and s.get("name") == "总份额":
            share_series = s.get("data", [])
            break

    if not share_series:
        return []

    result = []
    for i, cat in enumerate(categories):
        if i < len(share_series) and share_series[i] is not None:
            try:
                result.append({"date": str(cat), "shares": float(share_series[i])})
            except (ValueError, TypeError):
                continue
    return result


def _parse_fluctuation_scale(content: str) -> list[dict]:
    """
    解析 Data_fluctuationScale 变量（回退方案，使用基金规模）。
    格式: {"categories":["2025-06-30",...], "series":[{"y":3747.04,"mom":"10.62%"},..]}
    """
    m = re.search(
        r'var\s+Data_fluctuationScale\s*=\s*(\{.*?\})\s*;',
        content, re.DOTALL
    )
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except (json.JSONDecodeError, ValueError):
        return []

    categories = data.get("categories", [])
    series = data.get("series", [])
    if not categories or not series:
        return []

    result = []
    for i, cat in enumerate(categories):
        if i < len(series):
            val = series[i]
            y = val.get("y") if isinstance(val, dict) else val
            if y is not None:
                try:
                    result.append({"date": str(cat), "shares": float(y)})
                except (ValueError, TypeError):
                    continue
    return result


def _calc_share_changes(records: list[dict]) -> Optional[dict]:
    """根据份额历史记录计算变化率和信号。"""
    if len(records) < 2:
        return None

    latest = records[-1]
    total = latest["shares"]
    date_str = latest["date"]

    def _chg(idx):
        """计算 records[-(idx+1)] 相对 records[-(idx+2)] 的变化率"""
        if idx + 2 > len(records):
            return None
        cur = records[-(idx + 1)]["shares"]
        prev = records[-(idx + 2)]["shares"]
        if prev <= 0:
            return None
        return round((cur - prev) / prev, 6)

    chg_1w = _chg(0)
    chg_2w = _chg(1)
    chg_3w = _chg(2)

    # 连续增/减期数
    streak = 0
    for i in range(len(records) - 1, 0, -1):
        cur = records[i]["shares"]
        prev = records[i - 1]["shares"]
        if prev <= 0:
            break
        delta = (cur - prev) / prev
        if delta > 0.001:
            if streak >= 0:
                streak += 1
            else:
                break
        elif delta < -0.001:
            if streak <= 0:
                streak -= 1
            else:
                break
        else:
            break

    signal = _classify_signal(chg_1w, streak)

    return {
        "share_total": round(total, 2),
        "share_chg_1w": chg_1w,
        "share_chg_2w": chg_2w,
        "share_chg_3w": chg_3w,
        "share_streak": streak,
        "share_signal": signal,
        "share_date": date_str,
    }


def _classify_signal(chg_1w: Optional[float], streak: int) -> Optional[str]:
    """根据最近一期变化率和连续趋势生成信号词。

    注意：数据粒度为季度，变化率通常比周频大很多。
    阈值按季度级别调整：±20% 为大幅，±5% 为中等，±2% 为温和。
    """
    if chg_1w is None:
        return None
    if chg_1w >= 0.20 or (chg_1w >= 0.05 and streak >= 3):
        return "大幅流入"
    if chg_1w >= 0.05 or streak >= 2:
        return "流入"
    if chg_1w >= 0.02:
        return "温和流入"
    if chg_1w >= -0.02:
        return "持平"
    if chg_1w <= -0.20 or (chg_1w <= -0.05 and streak <= -3):
        return "大幅流出"
    if chg_1w <= -0.05 or streak <= -2:
        return "流出"
    return "持平"
