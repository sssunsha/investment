# -*- coding: utf-8 -*-
"""
Investment Indicators Web Scraper

Scrapes financial indicators from value500.com for investment analysis.
Supports caching with configurable expiry based on data update frequency.

Data Sources:
- Market Valuation: PE, PB, Stock-Bond Ratio, Buffett Index
- Liquidity: Shibor, 10Y Bond Yield, M1/M2, Financing Balance
- Macroeconomic: CPI, PPI, BDI
- Global: US Treasury Yields
"""

import re
import json
import logging
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from concurrent.futures import ThreadPoolExecutor

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Cache directory
CACHE_DIR = Path.home() / ".investment" / "indicators"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# HTTP Session with retry
SESSION = requests.Session()
SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
})

# Thread pool for async HTTP requests
executor = ThreadPoolExecutor(max_workers=5)


# ══════════════════════════════════════════════════════════════════════════════
# Indicator Configuration
# ══════════════════════════════════════════════════════════════════════════════

INDICATORS_CONFIG = {
    # Market Valuation
    "a_share_pe": {
        "name": "A股平均市盈率",
        "name_en": "A-Share Average PE",
        "url": "http://value500.com/PE.asp",
        "category": "market_valuation",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "low": {"value": 15, "label": "低估", "color": "green"},
            "normal": {"value": 25, "label": "合理", "color": "yellow"},
            "high": {"value": 30, "label": "高估", "color": "red"},
        },
    },
    "csi300_pe_pb": {
        "name": "沪深300指数PE/PB",
        "name_en": "CSI 300 PE/PB",
        "url": "http://value500.com/000300SHPEPB.asp",
        "category": "market_valuation",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "pe_low": {"value": 12, "label": "PE低估", "color": "green"},
            "pb_low": {"value": 1.5, "label": "PB低估", "color": "green"},
        },
    },
    "csi500_pe_pb": {
        "name": "中证500指数PE/PB",
        "name_en": "CSI 500 PE/PB",
        "url": "http://value500.com/000905SHPEPB.asp",
        "category": "market_valuation",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "pe_low": {"value": 25, "label": "低估", "color": "green"},
            "pe_high": {"value": 45, "label": "高估", "color": "red"},
        },
    },
    "stock_bond_ratio": {
        "name": "股债收益率之比",
        "name_en": "Stock-Bond Yield Ratio",
        "url": "http://value500.com/ep.asp",
        "category": "market_valuation",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "very_low": {"value": 2.0, "op": ">=", "label": "极度低估", "color": "green"},
            "low": {"value": 1.5, "op": ">=", "label": "合理偏低", "color": "lightgreen"},
            "high": {"value": 1.0, "op": "<", "label": "高估", "color": "red"},
        },
    },
    "buffett_index": {
        "name": "巴菲特指标",
        "name_en": "Buffett Index",
        "url": "http://value500.com/BuffettIndex.asp",
        "category": "market_valuation",
        "update_frequency": "weekly",
        "cache_hours": 24,
        "thresholds": {
            "low": {"value": 80, "label": "显著低估", "color": "green"},
            "normal": {"value": 100, "label": "合理", "color": "yellow"},
            "high": {"value": 120, "label": "严重高估", "color": "red"},
        },
    },
    "hsi_pe": {
        "name": "恒生指数市盈率",
        "name_en": "HSI PE Ratio",
        "url": "http://value500.com/HSIPE.html",
        "category": "market_valuation",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "low": {"value": 10, "label": "历史低位", "color": "green"},
            "high": {"value": 18, "label": "高位", "color": "red"},
        },
    },
    # Liquidity
    "shibor": {
        "name": "Shibor利率",
        "name_en": "Shibor Interest Rate",
        "url": "http://value500.com/Shibor.asp",
        "category": "liquidity",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "overnight_loose": {"value": 1.5, "label": "流动性宽松", "color": "green"},
            "overnight_tight": {"value": 2.0, "label": "流动性紧张", "color": "orange"},
            "overnight_severe": {"value": 3.0, "label": "严重紧缩", "color": "red"},
            "1y_loose": {"value": 1.8, "label": "宽松周期", "color": "green"},
        },
    },
    "cn_10y_bond": {
        "name": "中国国债收益率",
        "name_en": "China Treasury Yields",
        "url": "http://value500.com/10Bond.html",
        "category": "liquidity",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "low": {"value": 3.0, "label": "低利率环境", "color": "green"},
            "high": {"value": 4.5, "label": "高利率压力", "color": "red"},
        },
    },
    "m1_m2": {
        "name": "M1/M2增速",
        "name_en": "M1/M2 Growth Rate",
        "url": "http://value500.com/M1.asp",
        "category": "liquidity",
        "update_frequency": "monthly",
        "cache_hours": 168,  # 7 days
        "thresholds": {
            "expansion": {"condition": "M1>M2", "label": "经济扩张", "color": "green"},
            "contraction": {"condition": "M1<M2", "label": "经济收缩", "color": "orange"},
            "trap": {"value": 3, "label": "流动性陷阱", "color": "red"},
        },
    },
    "m2_gdp": {
        "name": "M2与GDP比值",
        "name_en": "M2/GDP Ratio",
        "url": "http://value500.com/M2GDP.html",
        "category": "liquidity",
        "update_frequency": "monthly",
        "cache_hours": 168,
        "thresholds": {
            "normal": {"value": 200, "label": "正常", "color": "green"},
            "high": {"value": 250, "label": "偏高", "color": "orange"},
            "bubble": {"value": 250, "op": ">", "label": "货币化过度", "color": "red"},
        },
    },
    "financing_balance": {
        "name": "融资余额",
        "name_en": "Financing Balance",
        "url": "http://value500.com/rzrj.asp",
        "category": "liquidity",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "overheat": {"value": 20, "label": "过热预警", "color": "orange"},
            "severe_overheat": {"value": 30, "label": "严重过热", "color": "red"},
            "cold": {"value": -10, "label": "情绪冰点", "color": "blue"},
        },
    },
    # Macroeconomic
    "cpi": {
        "name": "CPI消费者物价指数",
        "name_en": "CPI",
        "url": "http://value500.com/CPI.asp",
        "category": "macroeconomic",
        "update_frequency": "monthly",
        "cache_hours": 168,
        "thresholds": {
            "deflation": {"value": 2, "op": "<", "label": "低通胀/通缩风险", "color": "blue"},
            "normal": {"value": 3, "label": "温和通胀", "color": "green"},
            "high": {"value": 5, "label": "严重通胀", "color": "red"},
        },
    },
    "ppi": {
        "name": "PPI生产者物价指数",
        "name_en": "PPI",
        "url": "http://value500.com/PPI.asp",
        "category": "macroeconomic",
        "update_frequency": "monthly",
        "cache_hours": 168,
        "thresholds": {
            "profit_pressure": {"value": 3, "condition": "PPI-CPI>3%", "label": "企业利润受压", "color": "red"},
            "profit_improve": {"value": -1, "condition": "PPI-CPI<-1%", "label": "企业利润改善", "color": "green"},
        },
    },
    "bdi": {
        "name": "BDI波罗的海指数",
        "name_en": "Baltic Dry Index",
        "url": "http://value500.com/BDI.asp",
        "category": "macroeconomic",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "boom": {"value": 2000, "label": "航运景气", "color": "green"},
            "depression": {"value": 1000, "label": "航运萧条", "color": "red"},
        },
    },
    # Global
    "us_treasury": {
        "name": "美债收益率",
        "name_en": "US Treasury Yield",
        "url": "http://value500.com/ust10yr.asp",
        "category": "global",
        "update_frequency": "daily",
        "cache_hours": 6,
        "thresholds": {
            "loose": {"value": 3.0, "label": "全球流动性宽松", "color": "green"},
            "tight": {"value": 4.5, "label": "紧缩压力", "color": "red"},
            "inversion_warning": {"value": 0, "label": "倒挂预警", "color": "orange"},
            "inversion_severe": {"value": -0.2, "label": "衰退信号", "color": "red"},
        },
    },
}

# Category definitions
CATEGORIES = {
    "market_valuation": {"name": "市场估值", "icon": "📊", "order": 1},
    "liquidity": {"name": "利率流动性", "icon": "💧", "order": 2},
    "macroeconomic": {"name": "宏观经济", "icon": "🏭", "order": 3},
    "global": {"name": "全球定价", "icon": "🌍", "order": 4},
}


# ══════════════════════════════════════════════════════════════════════════════
# Cache Management
# ══════════════════════════════════════════════════════════════════════════════

def _cache_file_path(indicator_key: str) -> Path:
    """Get cache file path for an indicator"""
    return CACHE_DIR / f"{indicator_key}.json"


def _read_cache(indicator_key: str) -> Optional[Dict[str, Any]]:
    """Read cached data for an indicator"""
    path = _cache_file_path(indicator_key)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        logger.warning(f"Failed to read cache for {indicator_key}: {e}")
        return None


def _write_cache(indicator_key: str, data: Dict[str, Any]) -> None:
    """Write data to cache"""
    path = _cache_file_path(indicator_key)
    try:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.error(f"Failed to write cache for {indicator_key}: {e}")


def _is_cache_valid(indicator_key: str) -> bool:
    """Check if cache is still valid based on expiry time"""
    data = _read_cache(indicator_key)
    if not data or "updated_at" not in data:
        return False
    
    config = INDICATORS_CONFIG.get(indicator_key, {})
    cache_hours = config.get("cache_hours", 6)
    
    updated_at = datetime.fromisoformat(data["updated_at"])
    expiry_time = updated_at + timedelta(hours=cache_hours)
    
    return datetime.now() < expiry_time


def clear_cache(indicator_key: Optional[str] = None) -> Dict[str, bool]:
    """Clear cache for specific indicator or all indicators"""
    results = {}
    if indicator_key:
        path = _cache_file_path(indicator_key)
        if path.exists():
            path.unlink()
            results[indicator_key] = True
        else:
            results[indicator_key] = False
    else:
        for key in INDICATORS_CONFIG.keys():
            path = _cache_file_path(key)
            if path.exists():
                path.unlink()
                results[key] = True
            else:
                results[key] = False
    return results


# ══════════════════════════════════════════════════════════════════════════════
# HTML Fetching
# ══════════════════════════════════════════════════════════════════════════════

def _fetch_html(url: str, timeout: int = 15) -> Optional[str]:
    """Fetch HTML content from URL"""
    try:
        response = SESSION.get(url, timeout=timeout)
        response.raise_for_status()
        # Handle encoding
        response.encoding = 'utf-8'
        return response.text
    except Exception as e:
        logger.error(f"Failed to fetch {url}: {e}")
        return None


def _parse_float(text: str) -> Optional[float]:
    """Parse float from text, handling various formats"""
    if not text:
        return None
    # Remove whitespace, %, commas
    cleaned = re.sub(r'[%,\s]', '', text.strip())
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_date(text: str) -> Optional[str]:
    """Parse date from Chinese format to YYYY-MM-DD"""
    if not text:
        return None
    # Try various patterns
    patterns = [
        (r'(\d{4})年(\d{1,2})月(\d{1,2})日', '{}-{:02d}-{:02d}'),
        (r'(\d{4})-(\d{1,2})-(\d{1,2})', '{}-{:02d}-{:02d}'),
        (r'(\d{4})年(\d{1,2})月', '{}-{:02d}'),
    ]
    for pattern, fmt in patterns:
        match = re.search(pattern, text)
        if match:
            groups = [int(g) for g in match.groups()]
            if len(groups) == 3:
                return fmt.format(groups[0], groups[1], groups[2])
            elif len(groups) == 2:
                return fmt.format(groups[0], groups[1])
    return None


# ══════════════════════════════════════════════════════════════════════════════
# Indicator Parsers
# ══════════════════════════════════════════════════════════════════════════════

def _parse_pe(html: str) -> Dict[str, Any]:
    """Parse A-Share PE ratio page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}
    
    # Find the main data table - there are two tables:
    # 1. First table has current data with full date (e.g., 2026年04月17日)
    # 2. Second table has historical monthly data (e.g., 2026年03月)
    # We want the FIRST table for the most recent data
    tables = soup.find_all('table', border="1")
    
    if len(tables) >= 1:
        first_table = tables[0]
        rows = first_table.find_all('tr')
        
        # Extract PE values and date from the first table
        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 3:
                first_cell = cells[0].get_text(strip=True)
                
                # Look for the PE values row (contains "市盈率")
                if '市盈率' in first_cell and '平均' not in first_cell:
                    sh_pe = _parse_float(cells[1].get_text(strip=True))
                    sz_pe = _parse_float(cells[2].get_text(strip=True))
                    result["values"]["shanghai_pe"] = sh_pe
                    result["values"]["shenzhen_pe"] = sz_pe
                
                # Look for the date row (contains "更新时间")
                elif '更新时间' in first_cell or '日期' in first_cell:
                    date_text = cells[1].get_text(strip=True)
                    result["date"] = _parse_date(date_text)
    
    return result


def _parse_index_pe_pb(html: str) -> Dict[str, Any]:
    """Parse index PE/PB page (CSI300, CSI500, etc.)"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}
    
    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        # Collect all valid data rows to find the latest date
        all_data = []
        for row in rows[1:]:  # Skip header
            cells = row.find_all('td')
            if len(cells) >= 3:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}年', date_text):
                    parsed_date = _parse_date(date_text)
                    if parsed_date:
                        pe = _parse_float(cells[1].get_text(strip=True))
                        pb = _parse_float(cells[2].get_text(strip=True)) if len(cells) > 2 else None
                        all_data.append({
                            "date": parsed_date,
                            "pe": pe,
                            "pb": pb,
                        })
        
        # Sort by date descending to get the latest
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
        # Collect all valid data rows to find the latest date
        all_data = []
        for row in rows[1:]:  # Skip header
            cells = row.find_all('td')
            if len(cells) >= 3:
                date_text = cells[0].get_text(strip=True)
                parsed_date = _parse_date(date_text)
                if parsed_date:
                    sh_ratio = _parse_float(cells[1].get_text(strip=True))
                    sz_ratio = _parse_float(cells[2].get_text(strip=True))
                    all_data.append({
                        "date": parsed_date,
                        "shanghai_ratio": sh_ratio,
                        "shenzhen_ratio": sz_ratio,
                    })
        
        # Sort by date descending to get the latest
        if all_data:
            all_data.sort(key=lambda x: x["date"], reverse=True)
            latest = all_data[0]
            result["date"] = latest["date"]
            result["values"]["shanghai_ratio"] = latest["shanghai_ratio"]
            result["values"]["shenzhen_ratio"] = latest["shenzhen_ratio"]
            # Use Shanghai as primary value
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
                    value = _parse_float(cells[1].get_text(strip=True))
                    result["date"] = _parse_date(date_text)
                    result["values"]["buffett_index"] = value
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
                    pe = _parse_float(cells[1].get_text(strip=True))
                    result["date"] = _parse_date(date_text)
                    result["values"]["pe"] = pe
                    break
    
    return result


def _parse_shibor(html: str) -> Dict[str, Any]:
    """Parse Shibor interest rate page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}
    
    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        # Collect all valid data rows to find the latest date
        all_data = []
        for row in rows[1:]:  # Skip header
            cells = row.find_all('td')
            if len(cells) >= 6:
                date_text = cells[0].get_text(strip=True)
                parsed_date = _parse_date(date_text)
                if parsed_date:
                    overnight = _parse_float(cells[1].get_text(strip=True))
                    one_week = _parse_float(cells[2].get_text(strip=True))
                    one_month = _parse_float(cells[3].get_text(strip=True))
                    six_month = _parse_float(cells[4].get_text(strip=True))
                    one_year = _parse_float(cells[5].get_text(strip=True))
                    all_data.append({
                        "date": parsed_date,
                        "overnight": overnight,
                        "1_week": one_week,
                        "1_month": one_month,
                        "6_month": six_month,
                        "1_year": one_year,
                    })
        
        # Sort by date descending to get the latest
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
        for row in rows[1:]:  # Skip header
            cells = row.find_all('td')
            # Table structure: 日期 | 1年期收益率 | 5年期收益率 | 10年期收益率
            if len(cells) >= 4:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}年', date_text):
                    y1 = _parse_float(cells[1].get_text(strip=True))
                    y5 = _parse_float(cells[2].get_text(strip=True))
                    y10 = _parse_float(cells[3].get_text(strip=True))
                    
                    result["date"] = _parse_date(date_text)
                    result["values"]["1_year"] = y1
                    result["values"]["5_year"] = y5
                    result["values"]["10_year"] = y10
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
            # Table structure: 月份 | M0数量 | M0增速 | M1数量 | M1增速 | M2数量 | M2增速
            # We need columns 4 (M1增速) and 6 (M2增速)
            if len(cells) >= 7:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}年', date_text):
                    m1_growth = _parse_float(cells[4].get_text(strip=True))  # M1同比增速
                    m2_growth = _parse_float(cells[6].get_text(strip=True))  # M2同比增速
                    
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
            # Table structure: 年份 | M2指标值(亿元) | GDP绝对额(亿元) | M2/GDP
            # We need column 3 (M2/GDP ratio)
            if len(cells) >= 4:
                date_text = cells[0].get_text(strip=True)
                if re.search(r'\d{4}', date_text):
                    ratio = _parse_float(cells[3].get_text(strip=True))
                    result["date"] = _parse_date(date_text) or date_text.strip()
                    result["values"]["ratio"] = ratio
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
                    balance = _parse_float(cells[1].get_text(strip=True))
                    result["date"] = _parse_date(date_text)
                    result["values"]["balance"] = balance
                    # Try to get growth rate if available
                    if len(cells) >= 3:
                        growth = _parse_float(cells[2].get_text(strip=True))
                        result["values"]["growth_rate"] = growth
                    break
    
    return result


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
                    cpi = _parse_float(cells[1].get_text(strip=True))
                    result["date"] = _parse_date(date_text)
                    result["values"]["cpi"] = cpi
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
                    ppi = _parse_float(cells[1].get_text(strip=True))
                    result["date"] = _parse_date(date_text)
                    result["values"]["ppi"] = ppi
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
                    bdi = _parse_float(cells[1].get_text(strip=True))
                    result["date"] = _parse_date(date_text)
                    result["values"]["bdi"] = bdi
                    break
    
    return result


def _parse_us_treasury(html: str) -> Dict[str, Any]:
    """Parse US Treasury yield page"""
    soup = BeautifulSoup(html, 'html.parser')
    result = {"values": {}, "date": None}
    
    tables = soup.find_all('table', border="1")
    for table in tables:
        rows = table.find_all('tr')
        # Collect all valid data rows to find the latest date
        all_data = []
        for row in rows[1:]:  # Skip header
            cells = row.find_all('td')
            if len(cells) >= 4:
                date_text = cells[0].get_text(strip=True)
                parsed_date = _parse_date(date_text)
                if parsed_date:
                    y2 = _parse_float(cells[1].get_text(strip=True))
                    y5 = _parse_float(cells[2].get_text(strip=True)) if len(cells) > 2 else None
                    y10 = _parse_float(cells[3].get_text(strip=True)) if len(cells) > 3 else None
                    y30 = _parse_float(cells[4].get_text(strip=True)) if len(cells) > 4 else None
                    all_data.append({
                        "date": parsed_date,
                        "2_year": y2,
                        "5_year": y5,
                        "10_year": y10,
                        "30_year": y30,
                    })
        
        # Sort by date descending to get the latest
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
            
            # Calculate 2Y-10Y spread
            if latest["2_year"] is not None and latest["10_year"] is not None:
                spread = round(latest["2_year"] - latest["10_year"], 2)
                result["values"]["2y_10y_spread"] = spread
                result["values"]["spread_bp"] = int(spread * 100)
            break
    
    return result


# Parser mapping
PARSERS = {
    "a_share_pe": _parse_pe,
    "csi300_pe_pb": _parse_index_pe_pb,
    "csi500_pe_pb": _parse_index_pe_pb,
    "stock_bond_ratio": _parse_stock_bond_ratio,
    "buffett_index": _parse_buffett_index,
    "hsi_pe": _parse_hsi_pe,
    "shibor": _parse_shibor,
    "cn_10y_bond": _parse_cn_10y_bond,
    "m1_m2": _parse_m1_m2,
    "m2_gdp": _parse_m2_gdp,
    "financing_balance": _parse_financing_balance,
    "cpi": _parse_cpi,
    "ppi": _parse_ppi,
    "bdi": _parse_bdi,
    "us_treasury": _parse_us_treasury,
}


# ══════════════════════════════════════════════════════════════════════════════
# Main API Functions
# ══════════════════════════════════════════════════════════════════════════════

def scrape_indicator(indicator_key: str, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Scrape a single indicator.
    
    Args:
        indicator_key: The indicator key from INDICATORS_CONFIG
        force_refresh: If True, ignore cache and fetch fresh data
    
    Returns:
        Dict containing indicator data with metadata
    """
    if indicator_key not in INDICATORS_CONFIG:
        return {"error": f"Unknown indicator: {indicator_key}"}
    
    config = INDICATORS_CONFIG[indicator_key]
    
    # Check cache first
    if not force_refresh and _is_cache_valid(indicator_key):
        cached = _read_cache(indicator_key)
        if cached:
            cached["from_cache"] = True
            return cached
    
    # Fetch and parse
    url = config["url"]
    html = _fetch_html(url)
    if not html:
        # Return cached data if available, even if expired
        cached = _read_cache(indicator_key)
        if cached:
            cached["from_cache"] = True
            cached["cache_expired"] = True
            return cached
        return {"error": f"Failed to fetch data for {indicator_key}"}
    
    parser = PARSERS.get(indicator_key)
    if not parser:
        return {"error": f"No parser available for {indicator_key}"}
    
    try:
        parsed = parser(html)
    except Exception as e:
        logger.exception(f"Failed to parse {indicator_key}")
        return {"error": f"Parse error: {str(e)}"}
    
    # Build result
    result = {
        "key": indicator_key,
        "name": config["name"],
        "name_en": config["name_en"],
        "category": config["category"],
        "url": url,
        "data_date": parsed.get("date"),
        "values": parsed.get("values", {}),
        "thresholds": config.get("thresholds", {}),
        "update_frequency": config["update_frequency"],
        "updated_at": datetime.now().isoformat(),
        "from_cache": False,
    }
    
    # Evaluate status based on thresholds
    result["status"] = _evaluate_status(result)
    
    # Save to cache
    _write_cache(indicator_key, result)
    
    return result


def _evaluate_status(indicator: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate indicator status based on thresholds"""
    key = indicator.get("key")
    values = indicator.get("values", {})
    thresholds = indicator.get("thresholds", {})
    
    status = {"level": "normal", "label": "正常", "color": "gray", "signals": []}
    
    if key == "stock_bond_ratio":
        ratio = values.get("primary") or values.get("shanghai_ratio")
        if ratio is not None:
            if ratio >= 2.0:
                status = {"level": "very_bullish", "label": "极度低估", "color": "green", "signals": ["买入信号"]}
            elif ratio >= 1.5:
                status = {"level": "bullish", "label": "合理偏低", "color": "lightgreen", "signals": []}
            elif ratio < 1.0:
                status = {"level": "bearish", "label": "高估", "color": "red", "signals": ["卖出信号"]}
            else:
                status = {"level": "normal", "label": "合理", "color": "yellow", "signals": []}
    
    elif key == "shibor":
        overnight = values.get("overnight")
        one_year = values.get("1_year")
        if overnight is not None:
            if overnight < 1.5:
                status = {"level": "loose", "label": "流动性宽松", "color": "green", "signals": ["利好"]}
            elif overnight > 3.0:
                status = {"level": "tight", "label": "严重紧缩", "color": "red", "signals": ["利空"]}
            elif overnight > 2.0:
                status = {"level": "warning", "label": "流动性紧张", "color": "orange", "signals": []}
    
    elif key == "us_treasury":
        spread_bp = values.get("spread_bp")
        y10 = values.get("10_year")
        if spread_bp is not None:
            if spread_bp < -20:
                status = {"level": "recession", "label": "衰退信号", "color": "red", "signals": ["卖出信号"]}
            elif spread_bp < 0:
                status = {"level": "warning", "label": "倒挂预警", "color": "orange", "signals": []}
            else:
                status = {"level": "normal", "label": "正常", "color": "green", "signals": []}
        if y10 is not None and y10 > 4.5:
            status["signals"].append("紧缩压力")
    
    elif key == "buffett_index":
        index_val = values.get("buffett_index")
        if index_val is not None:
            if index_val < 80:
                status = {"level": "very_bullish", "label": "显著低估", "color": "green", "signals": ["买入信号"]}
            elif index_val > 120:
                status = {"level": "very_bearish", "label": "严重高估", "color": "red", "signals": ["卖出信号"]}
            elif index_val > 100:
                status = {"level": "warning", "label": "偏高", "color": "orange", "signals": []}
    
    elif key == "financing_balance":
        growth = values.get("growth_rate")
        if growth is not None:
            if growth > 30:
                status = {"level": "overheat", "label": "严重过热", "color": "red", "signals": ["卖出信号"]}
            elif growth > 20:
                status = {"level": "warning", "label": "过热预警", "color": "orange", "signals": []}
            elif growth < -10:
                status = {"level": "cold", "label": "情绪冰点", "color": "blue", "signals": ["买入信号"]}
    
    elif key == "cpi":
        cpi = values.get("cpi")
        if cpi is not None:
            if cpi > 5:
                status = {"level": "high", "label": "严重通胀", "color": "red", "signals": ["紧缩政策将至"]}
            elif cpi > 3:
                status = {"level": "warning", "label": "政策紧缩压力", "color": "orange", "signals": []}
            elif cpi < 2:
                status = {"level": "low", "label": "低通胀/通缩风险", "color": "blue", "signals": []}
    
    elif key == "bdi":
        bdi = values.get("bdi")
        if bdi is not None:
            if bdi > 2000:
                status = {"level": "boom", "label": "航运景气", "color": "green", "signals": []}
            elif bdi < 1000:
                status = {"level": "depression", "label": "航运萧条", "color": "red", "signals": []}
    
    return status


def scrape_all_indicators(force_refresh: bool = False) -> Dict[str, Dict[str, Any]]:
    """
    Scrape all configured indicators.
    
    Returns:
        Dict mapping indicator keys to their data
    """
    results = {}
    for key in INDICATORS_CONFIG.keys():
        results[key] = scrape_indicator(key, force_refresh)
    return results


def get_indicator_by_category() -> Dict[str, List[Dict[str, Any]]]:
    """
    Get all indicators grouped by category.
    
    Returns:
        Dict mapping category names to lists of indicator data
    """
    all_indicators = scrape_all_indicators()
    
    grouped = {}
    for cat_key, cat_info in CATEGORIES.items():
        grouped[cat_key] = {
            "name": cat_info["name"],
            "icon": cat_info["icon"],
            "order": cat_info["order"],
            "indicators": [],
        }
    
    for key, data in all_indicators.items():
        category = data.get("category")
        if category in grouped:
            grouped[category]["indicators"].append(data)
    
    return grouped


def calculate_signals() -> Dict[str, Any]:
    """
    Calculate buy/sell signals based on all indicators.
    
    Returns:
        Dict containing signal analysis
    """
    all_indicators = scrape_all_indicators()
    
    # Buy signals (need 3+ to trigger)
    buy_signals = {
        "stock_bond_ratio_high": False,
        "shibor_1y_low": False,
        "financing_cold": False,
        "no_inversion": False,
    }
    
    # Sell signals (need 2+ to trigger)
    sell_signals = {
        "stock_bond_ratio_low": False,
        "buffett_high": False,
        "financing_hot": False,
        "inversion": False,
        "cpi_high": False,
    }
    
    # Evaluate buy signals
    sbr = all_indicators.get("stock_bond_ratio", {}).get("values", {})
    if sbr.get("primary", 0) >= 2.0 or sbr.get("shanghai_ratio", 0) >= 2.0:
        buy_signals["stock_bond_ratio_high"] = True
    
    shibor = all_indicators.get("shibor", {}).get("values", {})
    if shibor.get("1_year", 99) < 1.5:
        buy_signals["shibor_1y_low"] = True
    
    financing = all_indicators.get("financing_balance", {}).get("values", {})
    if financing.get("growth_rate", 0) < -10:
        buy_signals["financing_cold"] = True
    
    us_treasury = all_indicators.get("us_treasury", {}).get("values", {})
    if us_treasury.get("spread_bp", 0) >= 0:
        buy_signals["no_inversion"] = True
    
    # Evaluate sell signals
    if sbr.get("primary", 99) < 1.0 or sbr.get("shanghai_ratio", 99) < 1.0:
        sell_signals["stock_bond_ratio_low"] = True
    
    buffett = all_indicators.get("buffett_index", {}).get("values", {})
    if buffett.get("buffett_index", 0) > 120:
        sell_signals["buffett_high"] = True
    
    if financing.get("growth_rate", 0) > 30:
        sell_signals["financing_hot"] = True
    
    if us_treasury.get("spread_bp", 0) < -20:
        sell_signals["inversion"] = True
    
    cpi_data = all_indicators.get("cpi", {}).get("values", {})
    if cpi_data.get("cpi", 0) > 3:
        sell_signals["cpi_high"] = True
    
    # Count signals
    buy_count = sum(1 for v in buy_signals.values() if v)
    sell_count = sum(1 for v in sell_signals.values() if v)
    
    # Determine overall recommendation
    recommendation = "neutral"
    recommendation_text = "观望"
    recommendation_color = "gray"
    
    if buy_count >= 3:
        recommendation = "strong_buy"
        recommendation_text = "强烈买入"
        recommendation_color = "green"
    elif buy_count >= 2 and sell_count == 0:
        recommendation = "buy"
        recommendation_text = "积极配置"
        recommendation_color = "lightgreen"
    elif sell_count >= 2:
        recommendation = "sell"
        recommendation_text = "谨慎减仓"
        recommendation_color = "orange"
    elif sell_count >= 3:
        recommendation = "strong_sell"
        recommendation_text = "强制卖出"
        recommendation_color = "red"
    
    # Decision Matrix Analysis (based on investment_base.md)
    decision_matrix = _evaluate_decision_matrix(all_indicators)
    
    return {
        "buy_signals": buy_signals,
        "buy_count": buy_count,
        "sell_signals": sell_signals,
        "sell_count": sell_count,
        "recommendation": recommendation,
        "recommendation_text": recommendation_text,
        "recommendation_color": recommendation_color,
        "decision_matrix": decision_matrix,
        "updated_at": datetime.now().isoformat(),
    }


def _evaluate_decision_matrix(indicators: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluate decision matrix based on key indicators.
    
    Decision Matrix Rules (from investment_base.md):
    1. 强烈买入: 股债比>2.0 + Shibor 1Y<1.5% + 融资余额增速<-10%
    2. 积极配置: 股债比1.5-2.0 + 流动性宽松 + 无衰退信号
    3. 谨慎观望: 股债比<1.2 + 融资余额增速>30% + 美债倒挂
    4. 强制卖出: 巴菲特指标>120% + CPI>3%且上升 + 利差倒挂
    """
    # Extract indicator values
    sbr = indicators.get("stock_bond_ratio", {}).get("values", {})
    stock_bond_ratio = sbr.get("primary") or sbr.get("shanghai_ratio", 0)
    
    shibor = indicators.get("shibor", {}).get("values", {})
    shibor_1y = shibor.get("1_year", 99)
    shibor_overnight = shibor.get("overnight", 99)
    
    financing = indicators.get("financing_balance", {}).get("values", {})
    financing_growth = financing.get("growth_rate", 0)
    
    us_treasury = indicators.get("us_treasury", {}).get("values", {})
    spread_bp = us_treasury.get("spread_bp", 0)
    
    buffett = indicators.get("buffett_index", {}).get("values", {})
    buffett_index = buffett.get("buffett_index", 0)
    
    cpi_data = indicators.get("cpi", {}).get("values", {})
    cpi = cpi_data.get("cpi", 0)
    
    # Evaluate each decision matrix condition
    conditions = {
        "strong_buy": {
            "matched": False,
            "conditions": [
                {"name": "股债比>2.0", "met": stock_bond_ratio > 2.0, "value": f"{stock_bond_ratio:.2f}"},
                {"name": "Shibor 1Y<1.5%", "met": shibor_1y < 1.5, "value": f"{shibor_1y:.2f}%"},
                {"name": "融资余额增速<-10%", "met": financing_growth < -10, "value": f"{financing_growth:.2f}%"},
            ],
            "action": "满仓配置，重点加仓成长股",
            "position": "100%权益仓位",
        },
        "active_allocation": {
            "matched": False,
            "conditions": [
                {"name": "股债比1.5-2.0", "met": 1.5 <= stock_bond_ratio <= 2.0, "value": f"{stock_bond_ratio:.2f}"},
                {"name": "流动性宽松", "met": shibor_overnight < 1.5 or shibor_1y < 1.8, "value": f"隔夜{shibor_overnight:.2f}% / 1Y{shibor_1y:.2f}%"},
                {"name": "无衰退信号", "met": spread_bp >= 0, "value": f"{spread_bp}bp"},
            ],
            "action": "维持70-80%权益仓位",
            "position": "70-80%权益仓位",
        },
        "cautious": {
            "matched": False,
            "conditions": [
                {"name": "股债比<1.2", "met": stock_bond_ratio < 1.2, "value": f"{stock_bond_ratio:.2f}"},
                {"name": "融资余额增速>30%", "met": financing_growth > 30, "value": f"{financing_growth:.2f}%"},
                {"name": "美债倒挂", "met": spread_bp < 0, "value": f"{spread_bp}bp"},
            ],
            "action": "减仓至50%以下，增配债券",
            "position": "<50%权益仓位",
        },
        "forced_sell": {
            "matched": False,
            "conditions": [
                {"name": "巴菲特指标>120%", "met": buffett_index > 120, "value": f"{buffett_index:.1f}%"},
                {"name": "CPI>3%", "met": cpi > 3, "value": f"{cpi:.2f}%"},
                {"name": "利差倒挂", "met": spread_bp < 0, "value": f"{spread_bp}bp"},
            ],
            "action": "减仓至30%以下，持有现金",
            "position": "<30%权益仓位",
        },
    }
    
    # Check which conditions are met (need all conditions to be true)
    for key, rule in conditions.items():
        met_count = sum(1 for c in rule["conditions"] if c["met"])
        total_count = len(rule["conditions"])
        rule["met_count"] = met_count
        rule["total_count"] = total_count
        rule["matched"] = met_count == total_count
    
    # Determine primary recommendation
    if conditions["strong_buy"]["matched"]:
        primary = "strong_buy"
        primary_text = "强烈买入"
        primary_color = "green"
        primary_icon = "🚀"
    elif conditions["active_allocation"]["matched"]:
        primary = "active_allocation"
        primary_text = "积极配置"
        primary_color = "lightgreen"
        primary_icon = "📈"
    elif conditions["cautious"]["matched"]:
        primary = "cautious"
        primary_text = "谨慎观望"
        primary_color = "orange"
        primary_icon = "⚠️"
    elif conditions["forced_sell"]["matched"]:
        primary = "forced_sell"
        primary_text = "强制卖出"
        primary_color = "red"
        primary_icon = "🔻"
    else:
        # Find the closest match
        max_score = 0
        primary = "neutral"
        for key, rule in conditions.items():
            score = rule["met_count"] / rule["total_count"]
            if score > max_score:
                max_score = score
                if key == "strong_buy" and score >= 0.66:
                    primary = "partial_buy"
                    primary_text = "部分买入信号"
                    primary_color = "blue"
                    primary_icon = "📊"
                elif key == "active_allocation" and score >= 0.66:
                    primary = "partial_allocation"
                    primary_text = "可考虑配置"
                    primary_color = "blue"
                    primary_icon = "📊"
                else:
                    primary = "neutral"
                    primary_text = "中性观望"
                    primary_color = "gray"
                    primary_icon = "➖"
    
    return {
        "primary_recommendation": primary,
        "primary_text": primary_text,
        "primary_color": primary_color,
        "primary_icon": primary_icon,
        "conditions": conditions,
    }


def get_config() -> Dict[str, Any]:
    """Get indicator configuration"""
    return {
        "indicators": INDICATORS_CONFIG,
        "categories": CATEGORIES,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Async Wrappers
# ══════════════════════════════════════════════════════════════════════════════

async def async_scrape_indicator(indicator_key: str, force_refresh: bool = False) -> Dict[str, Any]:
    """Async wrapper for scrape_indicator"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, scrape_indicator, indicator_key, force_refresh)


async def async_scrape_all_indicators(force_refresh: bool = False) -> Dict[str, Dict[str, Any]]:
    """Async wrapper for scrape_all_indicators"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, scrape_all_indicators, force_refresh)


async def async_calculate_signals() -> Dict[str, Any]:
    """Async wrapper for calculate_signals"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, calculate_signals)