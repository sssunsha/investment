# -*- coding: utf-8 -*-
"""流动性类指标解析器：Shibor、国债收益率、M1/M2、M2/GDP、融资余额"""
import re
from typing import Any, Dict

from bs4 import BeautifulSoup
from ._utils import _parse_float, _parse_date


def _parse_shibor(html: str) -> Dict[str, Any]:
    """Parse Shibor interest rate page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        all_data = []
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 6:
                date_text = cells[0].get_text(strip=True)
                parsed_date = _parse_date(date_text)
                if parsed_date:
                    all_data.append({
                        "date": parsed_date,
                        "overnight": _parse_float(cells[1].get_text(strip=True)),
                        "1_week":    _parse_float(cells[2].get_text(strip=True)),
                        "1_month":   _parse_float(cells[3].get_text(strip=True)),
                        "6_month":   _parse_float(cells[4].get_text(strip=True)),
                        "1_year":    _parse_float(cells[5].get_text(strip=True)),
                    })
        if all_data:
            all_data.sort(key=lambda x: x["date"], reverse=True)
            latest = all_data[0]
            result["date"] = latest["date"]
            result["values"] = {k: v for k, v in latest.items() if k != "date"}
            break

    return result


def _parse_cn_10y_bond(html: str) -> Dict[str, Any]:
    """Parse China bond yields page (1Y, 5Y, 10Y)"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 4:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}年', date_text):
                    result["date"] = _parse_date(date_text)
                    result["values"]["1_year"]  = _parse_float(cells[1].get_text(strip=True))
                    result["values"]["5_year"]  = _parse_float(cells[2].get_text(strip=True))
                    result["values"]["10_year"] = _parse_float(cells[3].get_text(strip=True))
                    break

    return result


def _parse_m1_m2(html: str) -> Dict[str, Any]:
    """Parse M1/M2 growth rate page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 7:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}年', date_text):
                    m1_growth = _parse_float(cells[4].get_text(strip=True))
                    m2_growth = _parse_float(cells[6].get_text(strip=True))
                    result["date"] = _parse_date(date_text)
                    result["values"]["m1_growth"] = m1_growth
                    result["values"]["m2_growth"] = m2_growth
                    if m1_growth is not None and m2_growth is not None:
                        result["values"]["m1_m2_diff"] = round(m1_growth - m2_growth, 2)
                    break

    return result


def _parse_m2_gdp(html: str) -> Dict[str, Any]:
    """Parse M2/GDP ratio page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}

    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        for row in rows[1:]:
            cells = row.find_all('td')
            if len(cells) >= 4:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}', date_text):
                    result["date"] = _parse_date(date_text) or date_text.strip()
                    result["values"]["ratio"] = _parse_float(cells[3].get_text(strip=True))
                    break

    return result


def _parse_financing_balance(html: str) -> Dict[str, Any]:
    """Parse financing balance page"""
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
                    result["values"]["balance"] = _parse_float(cells[1].get_text(strip=True))
                    if len(cells) >= 3:
                        result["values"]["growth_rate"] = _parse_float(cells[2].get_text(strip=True))
                    break

    return result
