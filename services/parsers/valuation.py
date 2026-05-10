# -*- coding: utf-8 -*-
"""估值类指标解析器：A股PE、沪深300/500 PE/PB、股债比、巴菲特指数、恒生PE"""
import re
from typing import Any, Dict

from bs4 import BeautifulSoup
from ._utils import _parse_float, _parse_date


def _parse_pe(html: str) -> Dict[str, Any]:
    """Parse A-Share PE ratio page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    if len(tables) >= 1:
        first_table = tables[0]
        rows = first_table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 3:
                first_cell = cells[0].get_text(strip=True)
                if '市盈率' in first_cell and '平均' not in first_cell:
                    result["values"]["shanghai_pe"] = _parse_float(cells[1].get_text(strip=True))
                    result["values"]["shenzhen_pe"] = _parse_float(cells[2].get_text(strip=True))
                elif '更新时间' in first_cell or '日期' in first_cell:
                    result["date"] = _parse_date(cells[1].get_text(strip=True))

    return result


def _parse_index_pe_pb(html: str) -> Dict[str, Any]:
    """Parse index PE/PB page (CSI300, CSI500, etc.)"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        all_data = []
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 3:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}年', date_text):
                    parsed_date = _parse_date(date_text)
                    if parsed_date:
                        pe = _parse_float(cells[1].get_text(strip=True))
                        pb = _parse_float(cells[2].get_text(strip=True)) if len(cells) > 2 else None
                        all_data.append({"date": parsed_date, "pe": pe, "pb": pb})
        if all_data:
            all_data.sort(key=lambda x: x["date"], reverse=True)
            latest = all_data[0]
            result["date"] = latest["date"]
            result["values"]["pe"] = latest["pe"]
            if latest["pb"]:
                result["values"]["pb"] = latest["pb"]
            break

    return result


def _parse_stock_bond_ratio(html: str) -> Dict[str, Any]:
    """Parse Stock-Bond Yield Ratio page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        all_data = []
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 3:
                date_text = cells[0].get_text(strip=True)
                parsed_date = _parse_date(date_text)
                if parsed_date:
                    all_data.append({
                        "date": parsed_date,
                        "shanghai_ratio": _parse_float(cells[1].get_text(strip=True)),
                        "shenzhen_ratio": _parse_float(cells[2].get_text(strip=True)),
                    })
        if all_data:
            all_data.sort(key=lambda x: x["date"], reverse=True)
            latest = all_data[0]
            result["date"] = latest["date"]
            result["values"]["shanghai_ratio"] = latest["shanghai_ratio"]
            result["values"]["shenzhen_ratio"] = latest["shenzhen_ratio"]
            result["values"]["primary"] = latest["shanghai_ratio"]
            break

    return result


def _parse_buffett_index(html: str) -> Dict[str, Any]:
    """Parse Buffett Index page"""
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
                    result["values"]["buffett_index"] = _parse_float(cells[1].get_text(strip=True))
                    break

    return result


def _parse_hsi_pe(html: str) -> Dict[str, Any]:
    """Parse HSI PE ratio page"""
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
                    result["values"]["pe"] = _parse_float(cells[1].get_text(strip=True))
                    break

    return result
