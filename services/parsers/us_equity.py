# -*- coding: utf-8 -*-
"""美股估值解析器 — multpl.com"""
import re
from typing import Any, Dict
from bs4 import BeautifulSoup
from ._utils import _parse_float


def _parse_sp500_pe(html: str) -> Dict[str, Any]:
    """
    解析 multpl.com/shiller-pe/table/by-month（席勒CAPE）。
    表格结构：<table id="datatable"> 首行为最新日期和PE值。
    """
    from datetime import datetime
    soup = BeautifulSoup(html, "html.parser")
    result: Dict[str, Any] = {"values": {}, "date": None}

    table = soup.find("table", {"id": "datatable"})
    if not table:
        return result

    rows = table.find_all("tr")
    for row in rows[1:]:
        cells = row.find_all("td")
        if len(cells) >= 2:
            date_str = cells[0].get_text(strip=True)
            val_str  = cells[1].get_text(strip=True)
            val = _parse_float(val_str)
            if val:
                try:
                    parsed_date = datetime.strptime(date_str, "%b %d, %Y").strftime("%Y-%m-%d")
                except ValueError:
                    try:
                        parsed_date = datetime.strptime(date_str, "%b %Y").strftime("%Y-%m")
                    except ValueError:
                        parsed_date = date_str
                result["date"] = parsed_date
                result["values"]["pe"] = val
                break
    return result
