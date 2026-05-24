# -*- coding: utf-8 -*-
"""中国PMI解析器 — value500.com/PMI.asp"""
from typing import Any, Dict
from bs4 import BeautifulSoup
from ._utils import _parse_float, _parse_date


def _parse_cn_pmi(html: str) -> Dict[str, Any]:
    """
    解析 value500.com PMI 页面。
    页面结构：表格第一行为最新数据，列依次为：日期、制造业PMI、非制造业PMI
    """
    soup = BeautifulSoup(html, "html.parser")
    result: Dict[str, Any] = {"values": {}, "date": None}

    tables = soup.find_all("table", border="1")
    for table in tables:
        rows = table.find_all("tr")
        for row in rows[1:]:  # 跳过表头
            cells = row.find_all("td")
            if len(cells) >= 2:
                date_text = cells[0].get_text(strip=True)
                parsed_date = _parse_date(date_text)
                if parsed_date:
                    result["date"] = parsed_date
                    result["values"]["manufacturing"] = _parse_float(cells[1].get_text(strip=True))
                    if len(cells) >= 3:
                        result["values"]["services"] = _parse_float(cells[2].get_text(strip=True))
                    break  # 取最新一行即止
    return result
