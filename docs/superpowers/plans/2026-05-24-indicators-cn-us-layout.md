# Indicators CN/US 双栏重构 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 /indicators 页面重构为中美双栏并排布局，每栏内部按宏观→流动性→估值决策链排列，底部全宽全球指标区块，并新增约12个美国/全球指标。

**Architecture:** 在 `INDICATORS_CONFIG` 每个指标上加 `market` + `layer` 字段（方案A，最小侵入）；扩展 `scrape_indicator` 的数据源分发逻辑支持 FRED CSV API 和 Yahoo Finance；`GET /api/indicators` 新增 `by_market` 响应字段；前端读 `by_market` 渲染双栏布局。

**Tech Stack:** Python/FastAPI, requests + BeautifulSoup (existing), FRED public CSV API (no key needed), yfinance, Vanilla JS + CSS Grid

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `services/scraper.py` | Modify | market/layer 字段、by_market 分组、source 分发 |
| `services/fetchers/__init__.py` | Create | Package init |
| `services/fetchers/fred.py` | Create | FRED CSV API 取最新值 |
| `services/fetchers/yahoo_finance.py` | Create | Yahoo Finance 取最新价格 |
| `services/parsers/us_equity.py` | Create | multpl.com S&P 500 PE 爬虫 |
| `services/parsers/cn_pmi.py` | Create | value500.com PMI 爬虫 |
| `services/parsers/__init__.py` | Modify | 注册新 parsers |
| `requirements.txt` | Modify | 添加 yfinance |
| `tests/test_market_fields.py` | Create | 验证所有指标有 market/layer 字段 |
| `tests/test_by_market.py` | Create | 验证 build_by_market 分组逻辑 |
| `tests/test_fred_fetcher.py` | Create | FRED fetcher 单元测试 |
| `tests/test_yahoo_fetcher.py` | Create | Yahoo fetcher 单元测试 |
| `css/indicators.css` | Modify | market-columns grid + layer 分隔标题 |
| `js/indicators/cards.js` | Modify | renderMarketColumn, renderGlobalSection, 新 INDICATOR_METADATA |
| `js/indicators/main.js` | Modify | renderIndicatorsPage 改用 by_market |

---

## Task 1: 给所有现有指标加 `market` + `layer` 字段

**Files:**
- Modify: `services/scraper.py` (INDICATORS_CONFIG，lines 54–243)
- Create: `tests/test_market_fields.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_market_fields.py
from services.scraper import INDICATORS_CONFIG

VALID_MARKETS = {"cn", "us", "global"}
VALID_LAYERS  = {"macro", "liquidity", "valuation", "global_indicator"}

def test_all_indicators_have_market_field():
    for key, config in INDICATORS_CONFIG.items():
        assert "market" in config, f"{key} 缺少 market 字段"
        assert config["market"] in VALID_MARKETS, f"{key} market 值无效: {config['market']}"

def test_all_indicators_have_layer_field():
    for key, config in INDICATORS_CONFIG.items():
        assert "layer" in config, f"{key} 缺少 layer 字段"
        assert config["layer"] in VALID_LAYERS, f"{key} layer 值无效: {config['layer']}"
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
source venv/bin/activate
pytest tests/test_market_fields.py -v
```
预期：FAIL — `KeyError: 'market'`

- [ ] **Step 3: 在 INDICATORS_CONFIG 每个指标加 market + layer**

按下表修改 `services/scraper.py`：

| indicator_key | market | layer |
|---|---|---|
| `a_share_pe` | `"cn"` | `"valuation"` |
| `csi300_pe_pb` | `"cn"` | `"valuation"` |
| `csi500_pe_pb` | `"cn"` | `"valuation"` |
| `stock_bond_ratio` | `"cn"` | `"valuation"` |
| `buffett_index` | `"cn"` | `"valuation"` |
| `hsi_pe` | `"cn"` | `"valuation"` |
| `shibor` | `"cn"` | `"liquidity"` |
| `cn_10y_bond` | `"cn"` | `"liquidity"` |
| `m1_m2` | `"cn"` | `"liquidity"` |
| `m2_gdp` | `"cn"` | `"liquidity"` |
| `financing_balance` | `"cn"` | `"liquidity"` |
| `cpi` | `"cn"` | `"macro"` |
| `ppi` | `"cn"` | `"macro"` |
| `bdi` | `"global"` | `"global_indicator"` |
| `us_treasury` | `"us"` | `"liquidity"` |

示例（每个 config dict 加两行）：

```python
"a_share_pe": {
    "name": "A股平均市盈率",
    "name_en": "A-Share Average PE",
    "market": "cn",        # ← 新增
    "layer": "valuation",  # ← 新增
    "url": "http://value500.com/PE.asp",
    ...
},
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pytest tests/test_market_fields.py -v
```
预期：PASS — 2 passed

- [ ] **Step 5: Commit**

```bash
git add services/scraper.py tests/test_market_fields.py
git commit -m "feat(indicators): 为所有现有指标添加 market + layer 字段"
```

---

## Task 2: `scrape_indicator` 结果包含 market/layer，`build_by_market` 分组函数

**Files:**
- Modify: `services/scraper.py` (`scrape_indicator` 函数 + 新增 `build_by_market`)
- Create: `tests/test_by_market.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_by_market.py
from services.scraper import build_by_market

def _make_ind(key, market, layer):
    return {"key": key, "market": market, "layer": layer, "name": key}

def test_cn_indicator_grouped_by_layer():
    results = {"cpi": _make_ind("cpi", "cn", "macro")}
    out = build_by_market(results)
    assert any(i["key"] == "cpi" for i in out["cn"]["macro"])

def test_us_indicator_grouped_by_layer():
    results = {"us_cpi": _make_ind("us_cpi", "us", "macro")}
    out = build_by_market(results)
    assert any(i["key"] == "us_cpi" for i in out["us"]["macro"])

def test_global_indicator_in_global_list():
    results = {"bdi": _make_ind("bdi", "global", "global_indicator")}
    out = build_by_market(results)
    assert any(i["key"] == "bdi" for i in out["global"])

def test_error_indicator_excluded():
    results = {"bad": {"key": "bad", "error": "failed"}}
    out = build_by_market(results)
    assert out["cn"]["macro"] == []
    assert out["global"] == []

def test_by_market_structure_has_all_keys():
    out = build_by_market({})
    assert set(out.keys()) == {"cn", "us", "global"}
    for market in ("cn", "us"):
        assert set(out[market].keys()) == {"macro", "liquidity", "valuation"}
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pytest tests/test_by_market.py -v
```
预期：FAIL — `ImportError: cannot import name 'build_by_market'`

- [ ] **Step 3: 在 scraper.py 添加 `build_by_market` 函数（在 `scrape_all_indicators` 之后）**

```python
def build_by_market(results: Dict[str, Any]) -> Dict[str, Any]:
    """将 scrape_all_indicators 结果按 market × layer 分组，供前端双栏渲染使用。"""
    by_market: Dict[str, Any] = {
        "cn":     {"macro": [], "liquidity": [], "valuation": []},
        "us":     {"macro": [], "liquidity": [], "valuation": []},
        "global": [],
    }
    for key, data in results.items():
        if "error" in data:
            continue
        market = data.get("market") or INDICATORS_CONFIG.get(key, {}).get("market")
        layer  = data.get("layer")  or INDICATORS_CONFIG.get(key, {}).get("layer")
        if market == "global":
            by_market["global"].append(data)
        elif market in ("cn", "us") and layer in ("macro", "liquidity", "valuation"):
            by_market[market][layer].append(data)
    return by_market
```

- [ ] **Step 4: 在 `scrape_indicator` 的 result dict 里加 market + layer 字段**

在 `services/scraper.py` 的 `scrape_indicator` 函数中，找到 result dict 构建位置（约 line 413），在 `"category"` 字段后加两行：

```python
result = {
    "key": indicator_key,
    "name": config["name"],
    "name_en": config["name_en"],
    "category": config["category"],
    "market": config.get("market", "cn"),    # ← 新增
    "layer": config.get("layer", "valuation"),  # ← 新增
    "url": url,
    "data_date": parsed.get("date"),
    "values": parsed.get("values", {}),
    "thresholds": config.get("thresholds", {}),
    "update_frequency": config["update_frequency"],
    "updated_at": datetime.now().isoformat(),
    "from_cache": False,
}
```

- [ ] **Step 5: 在 `routers/indicators.py` 的 `get_all_indicators` 中追加 `by_market` 到响应**

在 return 语句前加：

```python
by_market = build_by_market(result)
```

修改 return：

```python
return JSONResponse(content={
    "success": True,
    "data": sorted_categories,
    "by_market": by_market,   # ← 新增
    "total": len(result),
})
```

并在 router 的 import 中加 `build_by_market`：

```python
from services.scraper import (
    async_scrape_indicator,
    async_scrape_all_indicators,
    async_calculate_signals,
    async_fetch_us_rates_history,
    get_config,
    clear_cache,
    build_by_market,        # ← 新增
    INDICATORS_CONFIG,
    CATEGORIES,
)
```

- [ ] **Step 6: 运行测试，确认通过**

```bash
pytest tests/test_by_market.py -v
```
预期：PASS — 5 passed

- [ ] **Step 7: Commit**

```bash
git add services/scraper.py routers/indicators.py tests/test_by_market.py
git commit -m "feat(indicators): scrape_indicator 加 market/layer，新增 build_by_market 分组函数"
```

---

## Task 3: FRED 数据 Fetcher

**Files:**
- Create: `services/fetchers/__init__.py`
- Create: `services/fetchers/fred.py`
- Create: `tests/test_fred_fetcher.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_fred_fetcher.py
from unittest.mock import patch, MagicMock
from services.fetchers.fred import fetch_fred_latest

MOCK_CSV = b"DATE,CPIAUCSL\n2024-01-01,310.00\n2024-02-01,311.50\n2024-03-01,.\n"

def _mock_get(url, **kwargs):
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.content = MOCK_CSV
    return resp

def test_returns_latest_non_null_value():
    with patch("services.fetchers.fred.SESSION.get", side_effect=_mock_get):
        result = fetch_fred_latest("CPIAUCSL")
    assert result["value"] == 311.50
    assert result["date"] == "2024-02-01"
    assert result["series_id"] == "CPIAUCSL"

def test_returns_none_on_http_error():
    with patch("services.fetchers.fred.SESSION.get", side_effect=Exception("timeout")):
        result = fetch_fred_latest("CPIAUCSL")
    assert result is None

def test_returns_none_on_all_null_values():
    null_csv = b"DATE,VALUE\n2024-01-01,.\n2024-02-01,.\n"
    mock = MagicMock()
    mock.raise_for_status = MagicMock()
    mock.content = null_csv
    with patch("services.fetchers.fred.SESSION.get", return_value=mock):
        result = fetch_fred_latest("FAKE")
    assert result is None
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pytest tests/test_fred_fetcher.py -v
```
预期：FAIL — `ModuleNotFoundError: No module named 'services.fetchers'`

- [ ] **Step 3: 创建 `services/fetchers/__init__.py`**

```python
# services/fetchers/__init__.py
```

（空文件）

- [ ] **Step 4: 创建 `services/fetchers/fred.py`**

```python
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
```

- [ ] **Step 5: 运行测试，确认通过**

```bash
pytest tests/test_fred_fetcher.py -v
```
预期：PASS — 3 passed

- [ ] **Step 6: Commit**

```bash
git add services/fetchers/ tests/test_fred_fetcher.py
git commit -m "feat(fetchers): 新增 FRED CSV API fetcher"
```

---

## Task 4: Yahoo Finance Fetcher

**Files:**
- Modify: `requirements.txt`
- Create: `services/fetchers/yahoo_finance.py`
- Create: `tests/test_yahoo_fetcher.py`

- [ ] **Step 1: 安装 yfinance**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
source venv/bin/activate
pip install yfinance==0.2.54
```

在 `requirements.txt` 末尾追加：

```
yfinance==0.2.54
```

- [ ] **Step 2: 写失败测试**

```python
# tests/test_yahoo_fetcher.py
from unittest.mock import patch, MagicMock
import pandas as pd
from services.fetchers.yahoo_finance import fetch_yahoo_latest

def _mock_history(period="5d"):
    dates = pd.to_datetime(["2024-05-20", "2024-05-21"])
    return pd.DataFrame({"Close": [2380.5, 2395.2]}, index=dates)

def test_returns_latest_close():
    mock_ticker = MagicMock()
    mock_ticker.history.side_effect = _mock_history
    with patch("services.fetchers.yahoo_finance.yf.Ticker", return_value=mock_ticker):
        result = fetch_yahoo_latest("GC=F")
    assert result["value"] == 2395.2
    assert result["date"] == "2024-05-21"
    assert result["ticker"] == "GC=F"

def test_returns_none_on_empty_history():
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = pd.DataFrame()
    with patch("services.fetchers.yahoo_finance.yf.Ticker", return_value=mock_ticker):
        result = fetch_yahoo_latest("BAD=F")
    assert result is None

def test_returns_none_on_exception():
    with patch("services.fetchers.yahoo_finance.yf.Ticker", side_effect=Exception("network")):
        result = fetch_yahoo_latest("GC=F")
    assert result is None
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
pytest tests/test_yahoo_fetcher.py -v
```
预期：FAIL — `ModuleNotFoundError: No module named 'services.fetchers.yahoo_finance'`

- [ ] **Step 4: 创建 `services/fetchers/yahoo_finance.py`**

```python
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
```

- [ ] **Step 5: 运行测试，确认通过**

```bash
pytest tests/test_yahoo_fetcher.py -v
```
预期：PASS — 3 passed

- [ ] **Step 6: Commit**

```bash
git add services/fetchers/yahoo_finance.py requirements.txt tests/test_yahoo_fetcher.py
git commit -m "feat(fetchers): 新增 Yahoo Finance fetcher，安装 yfinance"
```

---

## Task 5: `scrape_indicator` 按 source 分发 + 加 US 宏观指标配置

**Files:**
- Modify: `services/scraper.py` (dispatch logic + 新增 US 宏观指标到 INDICATORS_CONFIG)

- [ ] **Step 1: 在 `scraper.py` 顶部加 fetcher 导入**

在现有 import 块末尾（在 `from services.parsers import ...` 之前）加：

```python
from services.fetchers.fred import fetch_fred_latest
from services.fetchers.yahoo_finance import fetch_yahoo_latest
```

- [ ] **Step 2: 修改 `scrape_indicator` 函数，按 source 分发**

找到 `scrape_indicator` 中 "# Fetch and parse" 注释处（约 line 391），将：

```python
    # Fetch and parse
    url = config["url"]
    html = _fetch_html(url)
    if not html:
        ...
    parser = PARSERS.get(indicator_key)
    if not parser:
        return {"error": f"No parser available for {indicator_key}"}
    try:
        parsed = parser(html)
    except Exception as e:
        ...
```

替换为：

```python
    # Fetch and parse — dispatch by data source
    source = config.get("source", "scrape")
    parsed = None

    if source == "fred":
        raw = fetch_fred_latest(config["fred_series"])
        if raw is None:
            cached = _read_cache(indicator_key)
            if cached:
                cached["from_cache"] = True
                cached["cache_expired"] = True
                return cached
            return {"error": f"FRED fetch failed for {config['fred_series']}"}
        parsed = {"date": raw["date"], "values": {config.get("value_key", "value"): raw["value"]}}

    elif source == "yahoo":
        raw = fetch_yahoo_latest(config["yahoo_ticker"])
        if raw is None:
            cached = _read_cache(indicator_key)
            if cached:
                cached["from_cache"] = True
                cached["cache_expired"] = True
                return cached
            return {"error": f"Yahoo fetch failed for {config['yahoo_ticker']}"}
        parsed = {"date": raw["date"], "values": {config.get("value_key", "value"): raw["value"]}}

    else:  # source == "scrape" (default — existing HTML scraper path)
        url = config["url"]
        html = _fetch_html(url)
        if not html:
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
```

注意：result dict 中的 `"url"` 字段，对 FRED/Yahoo 指标改为 `config.get("url", "")` 以避免 KeyError（这些指标无 url 字段，需在 INDICATORS_CONFIG 里加一个 source_url 用于 UI 链接）。

- [ ] **Step 3: 在 INDICATORS_CONFIG 中加入 US 宏观指标**

在现有 `"us_treasury"` 条目之后，追加以下配置：

```python
    # ── US Macro ──────────────────────────────────────────────────────────────
    "us_cpi": {
        "name": "美国CPI", "name_en": "US CPI YoY",
        "market": "us", "layer": "macro",
        "category": "macroeconomic",
        "source": "fred", "fred_series": "CPIAUCSL",
        "value_key": "cpi_index",
        "url": "https://fred.stlouisfed.org/series/CPIAUCSL",
        "update_frequency": "monthly",
        "thresholds": {
            "low":    {"value": 2.0, "label": "通胀偏低", "color": "blue"},
            "normal": {"value": 3.0, "label": "温和通胀", "color": "green"},
            "high":   {"value": 4.0, "label": "高通胀压力", "color": "red"},
        },
    },
    "us_pce": {
        "name": "美国核心PCE", "name_en": "US Core PCE",
        "market": "us", "layer": "macro",
        "category": "macroeconomic",
        "source": "fred", "fred_series": "PCEPILFE",
        "value_key": "pce_index",
        "url": "https://fred.stlouisfed.org/series/PCEPILFE",
        "update_frequency": "monthly",
        "thresholds": {
            "target": {"value": 2.0, "label": "美联储目标", "color": "green"},
            "high":   {"value": 3.0, "label": "超目标", "color": "orange"},
        },
    },
    "us_pmi": {
        "name": "ISM制造业PMI", "name_en": "ISM Manufacturing PMI",
        "market": "us", "layer": "macro",
        "category": "macroeconomic",
        "source": "fred", "fred_series": "NAPM",
        "value_key": "pmi",
        "url": "https://fred.stlouisfed.org/series/NAPM",
        "update_frequency": "monthly",
        "thresholds": {
            "expansion": {"value": 50, "label": "扩张", "color": "green"},
            "contraction": {"value": 45, "label": "收缩", "color": "red"},
        },
    },
    "us_payrolls": {
        "name": "美国非农就业", "name_en": "US Non-Farm Payrolls",
        "market": "us", "layer": "macro",
        "category": "macroeconomic",
        "source": "fred", "fred_series": "PAYEMS",
        "value_key": "payrolls_k",
        "url": "https://fred.stlouisfed.org/series/PAYEMS",
        "update_frequency": "monthly",
        "thresholds": {},
    },
    "us_unrate": {
        "name": "美国失业率", "name_en": "US Unemployment Rate",
        "market": "us", "layer": "macro",
        "category": "macroeconomic",
        "source": "fred", "fred_series": "UNRATE",
        "value_key": "unrate",
        "url": "https://fred.stlouisfed.org/series/UNRATE",
        "update_frequency": "monthly",
        "thresholds": {
            "low":  {"value": 4.0, "label": "充分就业", "color": "green"},
            "high": {"value": 6.0, "label": "就业疲软", "color": "orange"},
        },
    },
    # ── US Liquidity ──────────────────────────────────────────────────────────
    "us_fedfunds": {
        "name": "联邦基金利率", "name_en": "Fed Funds Rate",
        "market": "us", "layer": "liquidity",
        "category": "liquidity",
        "source": "fred", "fred_series": "FEDFUNDS",
        "value_key": "rate",
        "url": "https://fred.stlouisfed.org/series/FEDFUNDS",
        "update_frequency": "monthly",
        "thresholds": {
            "low":    {"value": 2.0, "label": "宽松", "color": "green"},
            "high":   {"value": 5.0, "label": "限制性", "color": "red"},
        },
    },
    "us_fed_balance": {
        "name": "美联储资产负债表", "name_en": "Fed Balance Sheet",
        "market": "us", "layer": "liquidity",
        "category": "liquidity",
        "source": "fred", "fred_series": "WALCL",
        "value_key": "total_assets_m",
        "url": "https://fred.stlouisfed.org/series/WALCL",
        "update_frequency": "weekly",
        "thresholds": {},
    },
```

同时，给 `us_treasury` 加 `market`/`layer` 修正（在 Task 1 已完成，此处确认）：

```python
"us_treasury": {
    ...
    "market": "us",
    "layer": "liquidity",
    ...
}
```

- [ ] **Step 4: 在 `_evaluate_status` 中为新 US 宏观指标加 status 逻辑**

在 `_evaluate_status` 函数末尾（`return status` 之前）追加：

```python
    elif key == "us_cpi":
        val = values.get("cpi_index")
        if val is not None:
            if val > 4.0:
                status = {"level": "high", "label": "高通胀压力", "color": "red", "signals": ["美联储紧缩预期"]}
            elif val > 3.0:
                status = {"level": "warning", "label": "超目标", "color": "orange", "signals": []}
            elif val < 2.0:
                status = {"level": "low", "label": "通胀偏低", "color": "blue", "signals": []}
            else:
                status = {"level": "normal", "label": "温和通胀", "color": "green", "signals": []}

    elif key == "us_pmi":
        val = values.get("pmi")
        if val is not None:
            if val >= 50:
                status = {"level": "expansion", "label": "制造业扩张", "color": "green", "signals": []}
            elif val < 45:
                status = {"level": "contraction", "label": "制造业收缩", "color": "red", "signals": ["衰退风险"]}
            else:
                status = {"level": "slowdown", "label": "放缓", "color": "orange", "signals": []}

    elif key == "us_unrate":
        val = values.get("unrate")
        if val is not None:
            if val < 4.0:
                status = {"level": "full_employment", "label": "充分就业", "color": "green", "signals": []}
            elif val > 6.0:
                status = {"level": "weak", "label": "就业疲软", "color": "orange", "signals": []}
            else:
                status = {"level": "normal", "label": "正常", "color": "blue", "signals": []}

    elif key == "us_fedfunds":
        val = values.get("rate")
        if val is not None:
            if val < 2.0:
                status = {"level": "loose", "label": "宽松", "color": "green", "signals": []}
            elif val >= 5.0:
                status = {"level": "restrictive", "label": "限制性利率", "color": "red", "signals": ["紧缩压力"]}
            else:
                status = {"level": "neutral", "label": "中性", "color": "blue", "signals": []}
```

- [ ] **Step 5: 运行现有测试套件，确认无回归**

```bash
pytest tests/ -v --ignore=tests/js -x
```
预期：所有已有测试 PASS，新指标配置不破坏现有逻辑

- [ ] **Step 6: Commit**

```bash
git add services/scraper.py
git commit -m "feat(indicators): source 分发逻辑 + 新增 US 宏观/流动性指标配置"
```

---

## Task 6: CN PMI 指标（value500.com 爬虫）

**Files:**
- Create: `services/parsers/cn_pmi.py`
- Modify: `services/parsers/__init__.py`
- Modify: `services/scraper.py` (INDICATORS_CONFIG)

- [ ] **Step 1: 在 INDICATORS_CONFIG 加 `cn_pmi`**

在 `"cpi"` 条目之前追加：

```python
    "cn_pmi": {
        "name": "中国PMI（制造业/非制造业）", "name_en": "China PMI",
        "market": "cn", "layer": "macro",
        "category": "macroeconomic",
        "source": "scrape",
        "url": "http://value500.com/PMI.asp",
        "update_frequency": "monthly",
        "thresholds": {
            "expansion":   {"value": 50, "label": "经济扩张", "color": "green"},
            "contraction": {"value": 50, "op": "<", "label": "经济收缩", "color": "orange"},
        },
    },
```

- [ ] **Step 2: 创建 `services/parsers/cn_pmi.py`**

```python
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
```

- [ ] **Step 3: 注册到 `services/parsers/__init__.py`**

```python
from .cn_pmi import _parse_cn_pmi

PARSER_MAP = {
    ...（现有条目）...
    "cn_pmi": _parse_cn_pmi,
}
```

- [ ] **Step 4: 在 `_evaluate_status` 加 cn_pmi 逻辑**

```python
    elif key == "cn_pmi":
        val = values.get("manufacturing")
        if val is not None:
            if val >= 50:
                status = {"level": "expansion", "label": "制造业扩张", "color": "green", "signals": []}
            elif val < 48:
                status = {"level": "contraction", "label": "制造业收缩", "color": "red", "signals": []}
            else:
                status = {"level": "slowdown", "label": "放缓", "color": "orange", "signals": []}
```

- [ ] **Step 5: 手动验证（运行服务并测试 API）**

```bash
# 启动服务
uvicorn main:app --port 9001 --reload &
# 测试新指标
curl -s "http://localhost:9001/api/indicators/cn_pmi" | python3 -m json.tool
```
预期：返回 `values.manufacturing` 数字 或 error（取决于 value500.com 页面结构，需按实际调整 `_parse_cn_pmi`）

- [ ] **Step 6: Commit**

```bash
git add services/parsers/cn_pmi.py services/parsers/__init__.py services/scraper.py
git commit -m "feat(indicators): 新增中国PMI指标（value500.com爬虫）"
```

---

## Task 7: 美股估值 + VIX 指标

**Files:**
- Create: `services/parsers/us_equity.py`
- Modify: `services/parsers/__init__.py`
- Modify: `services/scraper.py` (INDICATORS_CONFIG)

- [ ] **Step 1: 创建 `services/parsers/us_equity.py`（S&P 500 PE 爬虫）**

```python
# -*- coding: utf-8 -*-
"""美股估值解析器 — multpl.com"""
import re
from typing import Any, Dict
from bs4 import BeautifulSoup
from ._utils import _parse_float, _parse_date


def _parse_sp500_pe(html: str) -> Dict[str, Any]:
    """
    解析 multpl.com/table（S&P 500 PE Ratio）。
    表格结构：<table id="datatable"> 首行为最新日期和PE值。
    """
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
                # multpl 日期格式: "May 1, 2024"
                try:
                    from datetime import datetime
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


def _parse_shiller_cape(html: str) -> Dict[str, Any]:
    """解析 multpl.com/shiller-pe/table/by-month（席勒CAPE）。结构同 _parse_sp500_pe。"""
    return _parse_sp500_pe(html)
```

- [ ] **Step 2: 在 INDICATORS_CONFIG 加 us_sp500_pe、us_buffett、vix**

```python
    # ── US Valuation ──────────────────────────────────────────────────────────
    "us_sp500_pe": {
        "name": "标普500 PE（席勒CAPE）", "name_en": "S&P 500 Shiller CAPE",
        "market": "us", "layer": "valuation",
        "category": "market_valuation",
        "source": "scrape",
        "url": "https://www.multpl.com/shiller-pe/table/by-month",
        "update_frequency": "monthly",
        "thresholds": {
            "low":    {"value": 15, "label": "历史低估", "color": "green"},
            "normal": {"value": 25, "label": "历史均值附近", "color": "blue"},
            "high":   {"value": 30, "label": "显著高估", "color": "orange"},
            "bubble": {"value": 40, "label": "泡沫区间", "color": "red"},
        },
    },
    "us_buffett": {
        "name": "美股巴菲特指标", "name_en": "US Buffett Indicator",
        "market": "us", "layer": "valuation",
        "category": "market_valuation",
        "source": "fred",
        "fred_series": "WILL5000PR",   # Wilshire 5000 Price Index（相对值，与GDP比较趋势）
        "value_key": "will5000",
        "url": "https://fred.stlouisfed.org/series/WILL5000PR",
        "update_frequency": "monthly",
        "thresholds": {},
    },
    "vix": {
        "name": "VIX 恐慌指数", "name_en": "CBOE Volatility Index",
        "market": "us", "layer": "valuation",
        "category": "market_valuation",
        "source": "yahoo", "yahoo_ticker": "^VIX",
        "value_key": "vix",
        "url": "https://finance.yahoo.com/quote/%5EVIX",
        "update_frequency": "daily",
        "thresholds": {
            "calm":   {"value": 15, "label": "市场平静", "color": "green"},
            "normal": {"value": 25, "label": "中性", "color": "blue"},
            "fear":   {"value": 30, "label": "恐慌区间", "color": "orange"},
            "panic":  {"value": 40, "label": "极度恐慌", "color": "red"},
        },
    },
```

- [ ] **Step 3: 注册新 parsers 到 `services/parsers/__init__.py`**

```python
from .us_equity import _parse_sp500_pe, _parse_shiller_cape

PARSER_MAP = {
    ...
    "us_sp500_pe": _parse_shiller_cape,
}
```

- [ ] **Step 4: 在 `_evaluate_status` 加 vix + us_sp500_pe 逻辑**

```python
    elif key == "vix":
        val = values.get("vix")
        if val is not None:
            if val < 15:
                status = {"level": "calm", "label": "市场平静", "color": "green", "signals": []}
            elif val < 25:
                status = {"level": "normal", "label": "中性", "color": "blue", "signals": []}
            elif val < 40:
                status = {"level": "fear", "label": "恐慌区间", "color": "orange", "signals": ["市场恐慌，逆向关注"]}
            else:
                status = {"level": "panic", "label": "极度恐慌", "color": "red", "signals": ["买入信号"]}

    elif key == "us_sp500_pe":
        val = values.get("pe")
        if val is not None:
            if val < 15:
                status = {"level": "low", "label": "历史低估", "color": "green", "signals": ["买入信号"]}
            elif val > 40:
                status = {"level": "bubble", "label": "泡沫区间", "color": "red", "signals": ["高估警告"]}
            elif val > 30:
                status = {"level": "high", "label": "显著高估", "color": "orange", "signals": []}
            else:
                status = {"level": "normal", "label": "历史均值附近", "color": "blue", "signals": []}
```

- [ ] **Step 5: Commit**

```bash
git add services/parsers/us_equity.py services/parsers/__init__.py services/scraper.py
git commit -m "feat(indicators): 新增美股估值指标（CAPE、VIX）"
```

---

## Task 8: 全球指标（黄金/原油/DXY）

**Files:**
- Modify: `services/scraper.py` (INDICATORS_CONFIG + _evaluate_status)

- [ ] **Step 1: 在 INDICATORS_CONFIG 加 gold、crude_oil、dxy**

在 `bdi` 之后追加：

```python
    "gold": {
        "name": "黄金（美元/盎司）", "name_en": "Gold USD/oz",
        "market": "global", "layer": "global_indicator",
        "category": "global",
        "source": "yahoo", "yahoo_ticker": "GC=F",
        "value_key": "price",
        "url": "https://finance.yahoo.com/quote/GC=F",
        "update_frequency": "daily",
        "thresholds": {
            "low":  {"value": 1800, "label": "低位", "color": "blue"},
            "high": {"value": 2500, "label": "高位", "color": "orange"},
        },
    },
    "crude_oil": {
        "name": "原油 WTI（美元/桶）", "name_en": "WTI Crude Oil",
        "market": "global", "layer": "global_indicator",
        "category": "global",
        "source": "yahoo", "yahoo_ticker": "CL=F",
        "value_key": "price",
        "url": "https://finance.yahoo.com/quote/CL=F",
        "update_frequency": "daily",
        "thresholds": {
            "low":  {"value": 60,  "label": "低油价", "color": "blue"},
            "high": {"value": 90,  "label": "高油价", "color": "orange"},
            "very_high": {"value": 120, "label": "油价冲击", "color": "red"},
        },
    },
    "dxy": {
        "name": "美元指数 DXY", "name_en": "US Dollar Index",
        "market": "global", "layer": "global_indicator",
        "category": "global",
        "source": "yahoo", "yahoo_ticker": "DX-Y.NYB",
        "value_key": "dxy",
        "url": "https://finance.yahoo.com/quote/DX-Y.NYB",
        "update_frequency": "daily",
        "thresholds": {
            "weak":   {"value": 95,  "label": "美元偏弱（利好新兴市场）", "color": "green"},
            "strong": {"value": 105, "label": "美元强势（新兴市场承压）", "color": "red"},
        },
    },
```

- [ ] **Step 2: 在 `_evaluate_status` 加 global 指标逻辑**

```python
    elif key == "dxy":
        val = values.get("dxy")
        if val is not None:
            if val < 95:
                status = {"level": "weak", "label": "美元偏弱", "color": "green", "signals": ["利好新兴市场"]}
            elif val > 105:
                status = {"level": "strong", "label": "美元强势", "color": "red", "signals": ["新兴市场承压"]}
            else:
                status = {"level": "neutral", "label": "中性", "color": "blue", "signals": []}

    elif key in ("gold", "crude_oil"):
        val = values.get("price")
        status = {"level": "normal", "label": "正常", "color": "blue", "signals": []}
        if key == "crude_oil" and val and val > 120:
            status = {"level": "shock", "label": "油价冲击", "color": "red", "signals": ["通胀压力"]}
```

- [ ] **Step 3: 运行测试并验证全量 API**

```bash
pytest tests/ -v --ignore=tests/js -x
curl -s "http://localhost:9001/api/indicators" | python3 -c "
import json, sys
d = json.load(sys.stdin)
bm = d.get('by_market', {})
print('CN macro:', len(bm.get('cn', {}).get('macro', [])))
print('US macro:', len(bm.get('us', {}).get('macro', [])))
print('Global:', len(bm.get('global', [])))
"
```
预期：CN macro ≥3，US macro ≥5，Global ≥4

- [ ] **Step 4: Commit**

```bash
git add services/scraper.py
git commit -m "feat(indicators): 新增全球指标（黄金、原油WTI、美元指数DXY）"
```

---

## Task 9: 信号逻辑扩展（美国维度）

**Files:**
- Modify: `services/scraper.py` (`calculate_signals` + `_evaluate_decision_matrix`)

- [ ] **Step 1: 在 `calculate_signals` 中追加 US 信号检测**

在 `sell_signals` dict 中加两个键：

```python
sell_signals = {
    ...（现有条目）...
    "us_cpi_high": False,    # ← 新增
    "vix_panic": False,      # ← 新增（VIX高反而是逆向买入，但作为市场紧张信号）
}
```

在 evaluate sell signals 段末尾追加：

```python
us_cpi_data = all_indicators.get("us_cpi", {}).get("values", {})
if us_cpi_data.get("cpi_index", 0) > 4.0:
    sell_signals["us_cpi_high"] = True

vix_data = all_indicators.get("vix", {}).get("values", {})
vix_val = vix_data.get("vix", 0)
# VIX>30 是逆向买入信号（市场恐慌时往往是底部）
buy_signals["vix_fear"] = vix_val > 30
```

同时在 `buy_signals` dict 加 `"vix_fear": False`。

- [ ] **Step 2: 在 `_evaluate_decision_matrix` 中加 US CPI 条件（到 forced_sell 条件里）**

找到 `"forced_sell"` 的 conditions 列表，加一项：

```python
{"name": "美国CPI>4%（全球紧缩压力）", "met": us_cpi_data.get("cpi_index", 0) > 4.0, "value": f"{us_cpi_data.get('cpi_index', 0):.2f}"},
```

需要在函数顶部也获取该值：

```python
us_cpi_data = indicators.get("us_cpi", {}).get("values", {})
```

- [ ] **Step 3: 运行测试**

```bash
pytest tests/ -v --ignore=tests/js -x
```
预期：all pass

- [ ] **Step 4: Commit**

```bash
git add services/scraper.py
git commit -m "feat(signals): 加入美国CPI高通胀和VIX恐慌信号维度"
```

---

## Task 10: CSS — 双栏市场布局

**Files:**
- Modify: `css/indicators.css`

- [ ] **Step 1: 在 `css/indicators.css` 末尾追加双栏布局样式**

```css
/* ── 市场双栏布局 ────────────────────────────────────────────────────────────── */

.market-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 32px;
  align-items: start;
}

.market-column {
  min-width: 0; /* 防止内容撑破 grid */
}

.market-column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 700;
}

.market-column-header.cn {
  background: linear-gradient(135deg, #fff1f0 0%, #ffe0db 100%);
  color: #c0392b;
  border-left: 4px solid #e74c3c;
}

.market-column-header.us {
  background: linear-gradient(135deg, #f0f4ff 0%, #dbe6ff 100%);
  color: #1a56db;
  border-left: 4px solid #3b82f6;
}

.market-column-header .market-flag {
  font-size: 22px;
}

.layer-separator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0 12px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.layer-separator.macro {
  background: #fef3c7;
  color: #92400e;
  border-left: 3px solid #f59e0b;
}

.layer-separator.liquidity {
  background: #dbeafe;
  color: #1e40af;
  border-left: 3px solid #3b82f6;
}

.layer-separator.valuation {
  background: #d1fae5;
  color: #065f46;
  border-left: 3px solid #10b981;
}

/* ── 全球指标区块 ───────────────────────────────────────────────────────────── */

.global-section {
  margin-top: 8px;
}

.global-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 8px;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  color: #166534;
  border-left: 4px solid #22c55e;
  font-size: 18px;
  font-weight: 700;
}

/* ── 响应式降级 ─────────────────────────────────────────────────────────────── */

@media (max-width: 900px) {
  .market-columns {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/indicators.css
git commit -m "style(indicators): 新增双栏市场布局与决策链分层 CSS"
```

---

## Task 11: cards.js — 新渲染函数 + 新 INDICATOR_METADATA

**Files:**
- Modify: `js/indicators/cards.js`

- [ ] **Step 1: 在 `INDICATOR_METADATA` 末尾追加新指标的阈值含义**

在 `us_treasury` 条目之后追加：

```javascript
  us_cpi: {
    thresholds: [
      { condition: '<2%', label: '通胀偏低/通缩风险', color: 'blue' },
      { condition: '2-3%', label: '温和通胀（目标区间）', color: 'green' },
      { condition: '>4%', label: '高通胀压力', color: 'red' },
    ],
    meaning: '美联储通胀目标为2%。CPI持续超过4%时，市场定价更多加息预期，对全球风险资产尤其新兴市场形成压制。',
  },
  us_pce: {
    thresholds: [
      { condition: '<2%', label: '低于目标', color: 'blue' },
      { condition: '2-3%', label: '接近目标', color: 'green' },
      { condition: '>3%', label: '超目标', color: 'orange' },
    ],
    meaning: '美联储最看重的通胀指标（PCE优先于CPI）。核心PCE剔除食品和能源，反映深层通胀趋势。',
  },
  us_pmi: {
    thresholds: [
      { condition: '>50', label: '制造业扩张', color: 'green' },
      { condition: '45-50', label: '放缓/临界', color: 'orange' },
      { condition: '<45', label: '制造业收缩', color: 'red' },
    ],
    meaning: 'ISM制造业PMI是美国经济活动的核心领先指标。连续两月低于50预示经济动能减弱，<45为明显收缩。',
  },
  us_unrate: {
    thresholds: [
      { condition: '<4%', label: '充分就业', color: 'green' },
      { condition: '4-6%', label: '正常', color: 'blue' },
      { condition: '>6%', label: '就业疲软', color: 'orange' },
    ],
    meaning: '失业率是货币政策的双重目标之一。低失业率给美联储加息创造空间；失业率快速上升往往伴随经济衰退。',
  },
  us_payrolls: {
    thresholds: [
      { condition: '>200k/月', label: '强劲增长', color: 'green' },
      { condition: '100-200k', label: '稳健增长', color: 'blue' },
      { condition: '<50k', label: '就业疲软', color: 'orange' },
    ],
    meaning: '非农就业是美联储政策最重要的实时参考。强劲非农 → 维持紧缩；非农走弱 → 降息预期升温。',
  },
  us_fedfunds: {
    thresholds: [
      { condition: '<2%', label: '宽松货币环境', color: 'green' },
      { condition: '2-4%', label: '中性利率区间', color: 'blue' },
      { condition: '>5%', label: '限制性利率', color: 'red' },
    ],
    meaning: '联邦基金利率是全球资产定价的基准。高利率提高无风险收益率基准，压制所有风险资产估值。',
  },
  us_fed_balance: {
    thresholds: [
      { condition: '扩张（QE）', label: '货币宽松', color: 'green' },
      { condition: '收缩（QT）', label: '货币紧缩', color: 'red' },
    ],
    meaning: '美联储资产负债表规模（万亿美元）。QE扩张注入流动性，是2009/2020年牛市推动力；QT收缩抽走流动性，压制风险资产。',
  },
  us_sp500_pe: {
    thresholds: [
      { condition: '<15', label: '历史低估', color: 'green' },
      { condition: '15-25', label: '历史均值区间', color: 'blue' },
      { condition: '>30', label: '显著高估', color: 'orange' },
      { condition: '>40', label: '泡沫区间', color: 'red' },
    ],
    meaning: '席勒CAPE用过去10年平均盈利平滑周期，历史均值约17。>30时美股长期预期回报率显著降低；>40为历史泡沫区间（1929/2000前后）。',
  },
  us_buffett: {
    thresholds: [
      { condition: '<100%', label: '合理偏低', color: 'green' },
      { condition: '100-130%', label: '偏高', color: 'orange' },
      { condition: '>140%', label: '严重高估', color: 'red' },
    ],
    meaning: 'Wilshire 5000总市值/美国GDP。巴菲特称之为"最能衡量市场当前估值的单一指标"。>140%为历史极值区域。',
  },
  vix: {
    thresholds: [
      { condition: '<15', label: '市场平静', color: 'green' },
      { condition: '15-25', label: '中性', color: 'blue' },
      { condition: '25-40', label: '恐慌区间', color: 'orange' },
      { condition: '>40', label: '极度恐慌（逆向买入）', color: 'red' },
    ],
    meaning: 'VIX>30 历史上往往是市场底部附近，是重要的逆向指标。VIX快速飙升 + 极度悲观情绪 = 历史绝佳买入窗口。',
  },
  cn_pmi: {
    thresholds: [
      { condition: '>50', label: '制造业扩张', color: 'green' },
      { condition: '48-50', label: '临界放缓', color: 'orange' },
      { condition: '<48', label: '明显收缩', color: 'red' },
    ],
    meaning: '中国制造业PMI是中国经济景气度的核心领先指标，月度发布。连续高于50预示工业产出扩张，利好周期股。',
  },
  gold: {
    thresholds: [
      { condition: '上涨', label: '避险需求', color: 'orange' },
      { condition: '下跌', label: '风险偏好回升', color: 'blue' },
    ],
    meaning: '黄金是终极避险资产，与美元负相关。美元弱/地缘风险高/通胀预期高时，黄金上涨；实际利率上升压制金价。',
  },
  crude_oil: {
    thresholds: [
      { condition: '<60美元', label: '低油价', color: 'blue' },
      { condition: '60-90美元', label: '正常区间', color: 'green' },
      { condition: '>120美元', label: '油价冲击', color: 'red' },
    ],
    meaning: '油价是全球通胀和经济活动的核心变量。油价>100$/桶对全球经济造成冲击，历史上往往引发衰退或加息。',
  },
  dxy: {
    thresholds: [
      { condition: '<95', label: '美元偏弱（利好新兴市场）', color: 'green' },
      { condition: '95-105', label: '中性区间', color: 'blue' },
      { condition: '>105', label: '美元强势（新兴市场承压）', color: 'red' },
    ],
    meaning: '美元指数衡量美元对一篮子货币的强弱。强美元 → 美元计价大宗商品价格承压，新兴市场资本外流，A股外资压力增加。',
  },
```

- [ ] **Step 2: 在 `getValueColor` 中加新指标的颜色逻辑（switch 语句末尾追加）**

```javascript
    case 'vix':
      if (value < 15) return 'green';
      if (value >= 15 && value < 25) return 'blue';
      if (value < 40) return 'orange';
      return 'red';

    case 'us_sp500_pe':
      if (fieldName.includes('pe')) {
        if (value < 15) return 'green';
        if (value > 40) return 'red';
        if (value > 30) return 'orange';
        return 'blue';
      }
      break;

    case 'us_cpi':
      if (value < 2) return 'blue';
      if (value <= 3) return 'green';
      if (value > 4) return 'red';
      return 'orange';

    case 'us_pmi':
    case 'cn_pmi':
      if (value >= 50) return 'green';
      if (value < 45) return 'red';
      return 'orange';

    case 'us_fedfunds':
      if (value < 2) return 'green';
      if (value >= 5) return 'red';
      return 'blue';

    case 'dxy':
      if (value < 95) return 'green';
      if (value > 105) return 'red';
      return 'blue';
```

- [ ] **Step 3: 在 `renderIndicatorValues` 的 switch 中加新指标渲染（default 之前追加）**

```javascript
    case 'us_cpi':
    case 'us_pce': {
      const k = key === 'us_cpi' ? 'cpi_index' : 'pce_index';
      const color = getValueColor(key, values[k], k);
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">${key === 'us_cpi' ? 'CPI 指数' : '核心PCE 指数'}</div>
          <div class="indicator-value-number ${color}">${formatNumber(values[k], 2)}</div>
        </div>
      `;
    }

    case 'us_pmi':
    case 'cn_pmi': {
      const mfg = key === 'us_pmi' ? values.pmi : values.manufacturing;
      const svc = values.services;
      const mfgColor = getValueColor(key, mfg, 'pmi');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">制造业PMI</div>
          <div class="indicator-value-number ${mfgColor}">${formatNumber(mfg, 1)}</div>
        </div>
        ${svc ? `
        <div class="indicator-value">
          <div class="indicator-value-label">非制造业PMI</div>
          <div class="indicator-value-number">${formatNumber(svc, 1)}</div>
        </div>
        ` : ''}
      `;
    }

    case 'vix': {
      const vixColor = getValueColor('vix', values.vix, 'vix');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">VIX</div>
          <div class="indicator-value-number big ${vixColor}">${formatNumber(values.vix, 2)}</div>
        </div>
      `;
    }

    case 'us_fedfunds': {
      const rateColor = getValueColor('us_fedfunds', values.rate, 'rate');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">FFR</div>
          <div class="indicator-value-number ${rateColor}">${formatNumber(values.rate, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'us_unrate': {
      const unColor = getValueColor('us_unrate', values.unrate, 'unrate');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">失业率</div>
          <div class="indicator-value-number ${unColor}">${formatNumber(values.unrate, 1)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'us_payrolls':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">总就业人数</div>
          <div class="indicator-value-number">${formatNumber(values.payrolls_k, 0)}<span class="indicator-value-unit">k</span></div>
        </div>
      `;

    case 'us_fed_balance':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">总资产</div>
          <div class="indicator-value-number">${formatNumber((values.total_assets_m || 0) / 1e6, 2)}<span class="indicator-value-unit">T$</span></div>
        </div>
      `;

    case 'us_sp500_pe': {
      const capeColor = getValueColor('us_sp500_pe', values.pe, 'pe');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">席勒CAPE</div>
          <div class="indicator-value-number ${capeColor}">${formatNumber(values.pe, 2)}<span class="indicator-value-unit">倍</span></div>
        </div>
      `;
    }

    case 'us_buffett':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">Wilshire 5000</div>
          <div class="indicator-value-number">${formatNumber(values.will5000, 0)}</div>
        </div>
      `;

    case 'gold':
    case 'crude_oil': {
      const priceColor = key === 'crude_oil' && values.price > 120 ? 'red' : 'blue';
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">${key === 'gold' ? '金价' : 'WTI'}</div>
          <div class="indicator-value-number ${priceColor}">${formatNumber(values.price, 2)}<span class="indicator-value-unit">$</span></div>
        </div>
      `;
    }

    case 'dxy': {
      const dxyColor = getValueColor('dxy', values.dxy, 'dxy');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">DXY</div>
          <div class="indicator-value-number ${dxyColor}">${formatNumber(values.dxy, 2)}</div>
        </div>
      `;
    }
```

- [ ] **Step 4: 新增 `renderMarketColumn` 和 `renderGlobalSection` 函数（文件末尾追加）**

```javascript
// ── 双栏布局渲染 ──────────────────────────────────────────────────────────────

const LAYER_META = {
  macro:     { label: '宏观环境', icon: '🏛️' },
  liquidity: { label: '利率流动性', icon: '💧' },
  valuation: { label: '市场估值', icon: '📊' },
};

const MARKET_META = {
  cn: { flag: '🇨🇳', label: '中国市场', cls: 'cn' },
  us: { flag: '🇺🇸', label: '美国市场', cls: 'us' },
};

export function renderMarketColumn(market, layers) {
  const meta = MARKET_META[market] || { flag: '', label: market, cls: market };
  const layerOrder = ['macro', 'liquidity', 'valuation'];

  const sectionsHtml = layerOrder.map(layerKey => {
    const indicators = layers[layerKey] || [];
    if (indicators.length === 0) return '';
    const lm = LAYER_META[layerKey];
    return `
      <div class="layer-separator ${layerKey}">${lm.icon} ${lm.label}</div>
      <div class="indicators-grid">
        ${indicators.map(ind => renderIndicatorCard(ind)).join('')}
      </div>
    `;
  }).join('');

  return `
    <div class="market-column ${meta.cls}">
      <div class="market-column-header ${meta.cls}">
        <span class="market-flag">${meta.flag}</span>
        <span>${meta.label}</span>
      </div>
      ${sectionsHtml}
    </div>
  `;
}

export function renderGlobalSection(indicators) {
  if (!indicators || indicators.length === 0) return '';
  return `
    <div class="global-section">
      <div class="global-section-header">
        <span>🌍</span>
        <span>全球指标</span>
        <span class="category-count">${indicators.length} 项</span>
      </div>
      <div class="indicators-grid">
        ${indicators.map(ind => renderIndicatorCard(ind)).join('')}
      </div>
    </div>
  `;
}
```

- [ ] **Step 5: Commit**

```bash
git add js/indicators/cards.js
git commit -m "feat(frontend): 新增双栏渲染函数 + 所有新指标的 INDICATOR_METADATA"
```

---

## Task 12: main.js — 更新 renderIndicatorsPage 使用 by_market

**Files:**
- Modify: `js/indicators/main.js`

- [ ] **Step 1: 在 import 块中加入新渲染函数**

找到文件顶部 import 行：

```javascript
import { renderCategorySection } from './cards.js';
```

改为：

```javascript
import { renderCategorySection, renderMarketColumn, renderGlobalSection } from './cards.js';
```

- [ ] **Step 2: 替换 `renderIndicatorsPage` 函数体**

将现有函数：

```javascript
function renderIndicatorsPage(data, signals) {
  ...
  const sortedCategories = Object.entries(data.data)
    .sort((a, b) => (a[1].order || 99) - (b[1].order || 99));

  container.innerHTML = `
    ${renderSignalPanel(signals)}
    ${renderMacroTrendSection()}
    ${sortedCategories.map(([key, cat]) => renderCategorySection(key, cat)).join('')}
  `;
}
```

替换为：

```javascript
function renderIndicatorsPage(data, signals) {
  const container = document.getElementById('indicators-container');
  if (!container) return;

  if (!data || !data.data) {
    container.innerHTML = `
      <div class="loading-overlay">
        <div class="error-message">❌ 加载失败，请刷新重试</div>
      </div>
    `;
    return;
  }

  const byMarket = data.by_market;

  if (byMarket && (byMarket.cn || byMarket.us)) {
    // 新双栏布局
    container.innerHTML = `
      ${renderSignalPanel(signals)}
      ${renderMacroTrendSection()}
      <div class="market-columns">
        ${renderMarketColumn('cn', byMarket.cn || {})}
        ${renderMarketColumn('us', byMarket.us || {})}
      </div>
      ${renderGlobalSection(byMarket.global || [])}
    `;
  } else {
    // 降级：旧的按 category 布局
    const sortedCategories = Object.entries(data.data)
      .sort((a, b) => (a[1].order || 99) - (b[1].order || 99));
    container.innerHTML = `
      ${renderSignalPanel(signals)}
      ${renderMacroTrendSection()}
      ${sortedCategories.map(([key, cat]) => renderCategorySection(key, cat)).join('')}
    `;
  }
}
```

- [ ] **Step 3: 在浏览器中验证页面渲染**

```bash
# 服务应在 9001 端口运行
open http://localhost:9001/indicators
```

检查项目：
1. 页面顶部显示信号面板
2. 中美两栏并排，各有「宏观环境 / 利率流动性 / 市场估值」分层标题
3. 底部有「全球指标」全宽区块
4. 小屏幕（浏览器窗口缩小到 900px 以下）两栏正确降级为单列

- [ ] **Step 4: Commit**

```bash
git add js/indicators/main.js
git commit -m "feat(frontend): renderIndicatorsPage 改用 by_market 双栏布局"
```

---

## Self-Review 检查结果

**Spec 覆盖对照：**
- ✅ market + layer 字段（Task 1）
- ✅ by_market API 字段（Task 2）
- ✅ FRED fetcher（Task 3）
- ✅ Yahoo Finance fetcher（Task 4）
- ✅ source 分发（Task 5）
- ✅ US 宏观：CPI/PCE/PMI/非农/失业率/FFR/资产负债表（Tasks 5-6）
- ✅ US 估值：CAPE/VIX（Task 7）
- ✅ CN PMI（Task 6）
- ✅ 全球：黄金/原油/DXY（Task 8）
- ✅ 信号逻辑扩展（Task 9）
- ✅ CSS 双栏布局（Task 10）
- ✅ JS 渲染函数（Tasks 11-12）
- ⚠️ `us_buffett` 仅存储 Wilshire 5000 Index 值，非真实 Buffett % —— 实现时若需要真实比率，需额外拉取 FRED `GDP` 系列并计算 WILL5000PR/GDP×100，可作后续 Task 扩展。

**类型一致性检查：**
- `build_by_market` 在 Task 2 定义，在 Task 2 router 中引用 → ✅ 一致
- `renderMarketColumn` 在 Task 11 定义，在 Task 12 中引用 → ✅ 一致
- `value_key` 字段在 Task 5 dispatch 逻辑中用于 `parsed["values"][config["value_key"]]`，所有 FRED/Yahoo 指标均已设置 → ✅

**Scope：** 单一功能，适合单个实现计划。
