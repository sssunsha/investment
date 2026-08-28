# -*- coding: utf-8 -*-
"""
ETF 份额数据抓取模块

从东方财富 FundArchivesDatas (gmbd) 接口获取 ETF/基金历史份额及申赎数据。
数据粒度为季度（公募基金报告期），缓存于 ~/.investment/etf_shares.json。

数据源：https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=gmbd&code=XXXXXX
  - 季度级，可追溯 30+ 期（场外基金）或 70+ 期（场内 ETF）
  - 含 总份额（亿份）、期间申购（亿份）、期间赎回（亿份）
"""
import json
import logging
import re
import time
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
    "share_streak", "share_signal", "share_date", "share_history",
)


def fetch_etf_shares(etf_code: str, force: bool = False) -> Optional[dict]:
    """
    获取单只 ETF 的份额数据（含近 8 季度历史 + 申购赎回）。

    返回:
        {
            "share_total": 189.15,
            "share_chg_1w": -0.578,
            "share_chg_2w": -0.495,
            "share_chg_3w": -0.009,
            "share_streak": -3,
            "share_signal": "大幅流出",
            "share_date": "2026-06-30",
            "share_history": [
                {"date":"2024-09-30","shares":850.6,"subscribe":69.0,"redeem":112.3},
                ...  # 最近 8 期
            ]
        }
    """
    cache = _load_cache()
    if not force and _is_cache_fresh(cache, etf_code):
        entry = cache[etf_code]
        return {k: entry[k] for k in _RESULT_KEYS if k in entry}

    raw = _fetch_gmbd(etf_code)
    if not raw or len(raw) < 2:
        logger.warning("ETF 份额数据不足: %s (获取 %d 条)", etf_code, len(raw) if raw else 0)
        return None

    result = _calc_share_changes(raw)
    if result:
        cache[etf_code] = {**result, "fetched_at": datetime.now().isoformat()}
        _save_cache(cache)
    return result


def _fetch_gmbd(etf_code: str) -> list[dict]:
    """
    从东方财富 FundArchivesDatas gmbd 接口获取份额历史。

    返回 HTML 表格解析后的列表，按日期升序：
    [{"date":"2024-09-30","shares":850.6,"subscribe":69.0,"redeem":112.3}, ...]
    """
    url = (
        f"https://fundf10.eastmoney.com/FundArchivesDatas.aspx"
        f"?type=gmbd&code={etf_code}&rt={int(time.time() * 1000)}"
    )
    try:
        resp = _SESSION.get(url, timeout=15)
        resp.raise_for_status()
        text = resp.text
        if not text:
            return []

        rows = re.findall(
            r"<tr><td>([\d-]+)</td>"
            r"<td[^>]*>([\d.,\-]+)</td>"
            r"<td[^>]*>([\d.,\-]+)</td>"
            r"<td[^>]*>([\d.,\-]+)</td>",
            text
        )
        if not rows:
            return []

        result = []
        for date_str, subscribe_s, redeem_s, total_s in rows:
            total = _parse_num(total_s)
            if total is None or total <= 0:
                continue
            result.append({
                "date": date_str,
                "shares": total,
                "subscribe": _parse_num(subscribe_s),
                "redeem": _parse_num(redeem_s),
            })

        result.sort(key=lambda x: x["date"])
        return result

    except Exception as e:
        logger.debug("gmbd 份额获取失败 %s: %s", etf_code, e)
        return []


def _parse_num(s: str) -> Optional[float]:
    s = s.replace(",", "").strip()
    if not s or s == "---":
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _calc_share_changes(records: list[dict]) -> Optional[dict]:
    """根据份额历史记录计算变化率、信号，返回最近 8 期历史。"""
    if len(records) < 2:
        return None

    latest = records[-1]
    total = latest["shares"]
    date_str = latest["date"]

    def _chg(idx):
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

    # 取最近 8 期作为迷你图数据
    history = records[-8:]

    return {
        "share_total": round(total, 2),
        "share_chg_1w": chg_1w,
        "share_chg_2w": chg_2w,
        "share_chg_3w": chg_3w,
        "share_streak": streak,
        "share_signal": signal,
        "share_date": date_str,
        "share_history": history,
    }


def _classify_signal(chg_1w: Optional[float], streak: int) -> Optional[str]:
    """根据最近一期变化率和连续趋势生成信号词。

    数据粒度为季度，阈值按季度级别调整。
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
