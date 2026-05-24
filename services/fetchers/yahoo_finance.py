# -*- coding: utf-8 -*-
"""Yahoo Finance fetcher — 通过 yfinance 获取最新价格"""

import logging
from typing import Optional, Dict, Any

import yfinance as yf

logger = logging.getLogger(__name__)


def fetch_yahoo_latest(ticker: str, period: str = "5d") -> Optional[Dict[str, Any]]:
    """
    从 Yahoo Finance 获取指定 ticker 的最新收盘价。

    Returns:
        {"ticker": str, "value": float, "date": str} or None
    """
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period=period)
        if hist.empty:
            return None
        latest_date  = hist.index[-1].strftime("%Y-%m-%d")
        latest_close = round(float(hist["Close"].iloc[-1]), 2)
        return {"ticker": ticker, "value": latest_close, "date": latest_date}
    except Exception as e:
        logger.warning("Yahoo fetch failed for %s: %s", ticker, e)
        return None
