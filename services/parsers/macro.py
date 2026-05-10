# -*- coding: utf-8 -*-
"""宏观/全球类指标解析器：CPI、PPI、BDI、美国国债收益率"""
import re
from typing import Any, Dict

from bs4 import BeautifulSoup
from ._utils import _parse_float, _parse_date


def _parse_cpi(html: str) -> Dict[str, Any]:
    """Parse CPI page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 2:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}年', date_text):
                    result["date"] = _parse_date(date_text)
                    result["values"]["cpi"] = _parse_float(cells[1].get_text(strip=True))
                    break

    return result


def _parse_ppi(html: str) -> Dict[str, Any]:
    """Parse PPI page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 2:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}年', date_text):
                    result["date"] = _parse_date(date_text)
                    result["values"]["ppi"] = _parse_float(cells[1].get_text(strip=True))
                    break

    return result


def _parse_bdi(html: str) -> Dict[str, Any]:
    """Parse BDI (Baltic Dry Index) page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 2:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}年', date_text):
                    result["date"] = _parse_date(date_text)
                    result["values"]["bdi"] = _parse_float(cells[1].get_text(strip=True))
                    break

    return result


def _parse_us_treasury(html: str) -> Dict[str, Any]:
    """Parse US Treasury yield page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        all_data = []
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 4:
                date_text = cells[0].get_text(strip=True)
                parsed_date = _parse_date(date_text)
                if parsed_date:
                    all_data.append({
                        "date":    parsed_date,
                        "2_year":  _parse_float(cells[1].get_text(strip=True)),
                        "5_year":  _parse_float(cells[2].get_text(strip=True)) if len(cells) > 2 else None,
                        "10_year": _parse_float(cells[3].get_text(strip=True)) if len(cells) > 3 else None,
                        "30_year": _parse_float(cells[4].get_text(strip=True)) if len(cells) > 4 else None,
                    })
        if all_data:
            all_data.sort(key=lambda x: x["date"], reverse=True)
            latest = all_data[0]
            result["date"] = latest["date"]
            result["values"]["2_year"] = latest["2_year"]
            if latest["5_year"]:
                result["values"]["5_year"] = latest["5_year"]
            if latest["10_year"]:
                result["values"]["10_year"] = latest["10_year"]
            if latest["30_year"]:
                result["values"]["30_year"] = latest["30_year"]
            if latest["2_year"] is not None and latest["10_year"] is not None:
                spread = round(latest["10_year"] - latest["2_year"], 2)
                result["values"]["2y_10y_spread"] = spread
                result["values"]["spread_bp"] = int(spread * 100)
            break

    return result
