# -*- coding: utf-8 -*-
"""FRED 公开 CSV API 取最新指标值（无需 API Key）"""

import csv
import io
import logging
from typing import Optional, Dict, Any

import requests

logger = logging.getLogger(__name__)

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0"})

_BASE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"


def fetch_fred_latest(series_id: str, timeout: int = 10) -> Optional[Dict[str, Any]]:
    """
    从 FRED 公开 CSV 接口获取指定系列的最新非空值。

    Returns:
        {"series_id": str, "value": float, "date": str} or None
    """
    url = f"{_BASE_URL}?id={series_id}"
    try:
        resp = SESSION.get(url, timeout=timeout)
        resp.raise_for_status()
        reader = csv.reader(io.StringIO(resp.content.decode("utf-8")))
        next(reader, None)  # 跳过 header
        latest_date, latest_value = None, None
        for row in reader:
            if len(row) < 2:
                continue
            date_str, val_str = row[0].strip(), row[1].strip()
            if val_str and val_str != ".":
                try:
                    latest_date = date_str
                    latest_value = float(val_str)
                except ValueError:
                    continue
        if latest_value is None:
            return None
        return {"series_id": series_id, "value": latest_value, "date": latest_date}
    except Exception as e:
        logger.warning("FRED fetch failed for %s: %s", series_id, e)
        return None
