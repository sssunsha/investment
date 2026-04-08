# -*- coding: utf-8 -*-
"""
投资分析系统 - 主入口
BaoStock RESTful API 封装，结构与 BaoStock Python API 文档目录一致。

API 分类：
  1. 历史行情数据   /api/security/history
  2. 板块/指数成分  /api/security/sector
  3. 季频财务指标   /api/evaluation
  4. 公司业绩报告   /api/corpreport
  5. 证券基础数据   /api/metadata
  6. 宏观经济数据   /api/macroscopic
  7. 自定义策略     /api/strategy  (原有业务接口，保留)
"""
import baostock as bs
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta

from routers import history, sector, evaluation, corpreport, metadata, macroscopic

# ──────────────────────────────────────────────
# Swagger / OpenAPI 配置
# ──────────────────────────────────────────────
app = FastAPI(
    title="BaoStock RESTful API",
    description="""
## 投资分析系统 BaoStock API 封装

本服务将 [BaoStock Python API](http://baostock.com) 封装为标准 RESTful 接口，
目录结构与官方文档保持一致。

---

### API 分类

| 分类 | 路径前缀 | 说明 |
|------|----------|------|
| 历史行情数据 | `/api/security/history` | A股/指数/ETF K线数据 |
| 板块与指数成分股 | `/api/security/sector` | 行业分类、沪深300/上证50/中证500成分股 |
| 季频财务指标 | `/api/evaluation` | 盈利/营运/成长/偿债/现金流/杜邦/复权因子/分红 |
| 公司业绩报告 | `/api/corpreport` | 业绩快报、业绩预告 |
| 证券基础数据 | `/api/metadata` | 交易日历、全量证券列表、证券基本资料 |
| 宏观经济数据 | `/api/macroscopic` | 存贷款利率、存款准备金率、货币供应量 |
| 自定义策略 | `/api` | 市场指数快照、ETF轮动策略（原有业务接口） |

---

### 数据来源
- 数据提供方：[BaoStock](http://baostock.com)
- 覆盖范围：沪深A股、指数、ETF，历史数据从2006年起
    """,
    version="2.0.0",
    contact={
        "name": "Investment System",
    },
    license_info={
        "name": "BaoStock 数据使用协议",
        "url": "http://baostock.com",
    },
    openapi_tags=[
        {"name": "历史行情数据", "description": "获取A股、指数、ETF的日/周/月/分钟K线数据（query_history_k_data_plus）"},
        {"name": "板块与指数成分股", "description": "行业分类及沪深300、上证50、中证500成分股查询"},
        {"name": "季频财务指标数据", "description": "盈利能力、营运能力、成长能力、偿债能力、现金流量、杜邦指数、除权除息、复权因子"},
        {"name": "公司业绩报告", "description": "公司业绩快报与业绩预告"},
        {"name": "证券基础数据", "description": "交易日历、全量证券列表、证券基本资料"},
        {"name": "宏观经济数据", "description": "存款利率、贷款利率、存款准备金率、货币供应量（月度/年度）"},
        {"name": "投资策略", "description": "市场指数快照、ETF轮动策略（原有业务接口）"},
    ]
)

# ──────────────────────────────────────────────
# CORS
# ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://localhost:9000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# 注册路由 - 与 BaoStock 文档目录结构对应
# ──────────────────────────────────────────────
app.include_router(history.router)      # 历史行情数据
app.include_router(sector.router)       # 板块与指数成分股
app.include_router(evaluation.router)   # 季频财务指标
app.include_router(corpreport.router)   # 公司业绩报告
app.include_router(metadata.router)     # 证券基础数据
app.include_router(macroscopic.router)  # 宏观经济数据


# ──────────────────────────────────────────────
# 原有业务逻辑（保留）
# ──────────────────────────────────────────────

def get_etf_data(etf_code, start_date, end_date):
    """获取单只ETF历史K线数据"""
    rs = bs.query_history_k_data_plus(
        etf_code,
        "date,close",
        start_date=start_date,
        end_date=end_date,
        frequency="d",
        adjustflag="2"
    )
    if rs.error_code != '0':
        return pd.DataFrame()

    data_list = []
    while (rs.error_code == '0') & rs.next():
        data_list.append(rs.get_row_data())

    df = pd.DataFrame(data_list, columns=rs.fields)
    if not df.empty:
        df['date'] = pd.to_datetime(df['date'])
        df['close'] = df['close'].astype(float)
    return df


def get_index_quote(index_code: str, name: str) -> dict:
    """获取指数最新行情"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=10)
    rs = bs.query_history_k_data_plus(
        index_code,
        "date,close,preclose",
        start_date=start_date.strftime('%Y-%m-%d'),
        end_date=end_date.strftime('%Y-%m-%d'),
        frequency="d",
    )
    rows = []
    while rs.error_code == '0' and rs.next():
        rows.append(rs.get_row_data())

    if len(rows) < 2:
        return {"name": name, "code": index_code, "price": 0, "change": 0, "changePct": 0}

    latest = rows[-1]
    price = float(latest[1])
    preclose = float(latest[2])
    change = round(price - preclose, 2)
    change_pct = round((price - preclose) / preclose, 6) if preclose else 0

    return {
        "name": name,
        "code": index_code,
        "price": round(price, 2),
        "change": change,
        "changePct": change_pct,
    }


@app.get(
    "/api/market-indices",
    tags=["投资策略"],
    summary="主要市场指数快照",
    description="返回上证指数、深证成指、沪深300、创业板指、科创50的最新行情。"
)
def get_market_indices():
    lg = bs.login()
    if lg.error_code != '0':
        return {"error": f"Baostock login failed: {lg.error_msg}"}

    try:
        indices = [
            ("sh.000001", "上证指数"),
            ("sz.399001", "深证成指"),
            ("sh.000300", "沪深300"),
            ("sz.399006", "创业板指"),
            ("sh.000688", "科创50"),
        ]
        result = [get_index_quote(code, name) for code, name in indices]
        return {"indices": result, "last_updated": datetime.now().isoformat()}
    finally:
        bs.logout()


@app.get(
    "/api/strategy-data",
    tags=["投资策略"],
    summary="ETF轮动策略",
    description="""
基于20日收益率对ETF池排序，结合MA20/MA60趋势过滤，输出买入信号。

**ETF池：** 沪深300、中证500、创业板、中证A50、半导体、医药、银行、黄金

**买入条件：** 排名前2且收盘价>MA20且MA60上行
    """
)
def get_strategy_data():
    lg = bs.login()
    if lg.error_code != '0':
        return {"error": f"Baostock login failed: {lg.error_msg}"}

    try:
        etf_pool = {
            "510300": "sh.510300",
            "510500": "sh.510500",
            "159915": "sz.159915",
            "159352": "sz.159352",
            "512480": "sh.512480",
            "159929": "sz.159929",
            "512800": "sh.512800",
            "518880": "sh.518880",
        }

        end_date = datetime.now()
        start_date = end_date - timedelta(days=100)
        end_date_str = end_date.strftime('%Y-%m-%d')
        start_date_str = start_date.strftime('%Y-%m-%d')

        strategy_results = []

        for name, code in etf_pool.items():
            df = get_etf_data(code, start_date_str, end_date_str)
            if df.empty or len(df) < 60:
                continue

            df['ma20'] = df['close'].rolling(window=20).mean()
            df['ma60'] = df['close'].rolling(window=60).mean()
            df['return_20d'] = (df['close'] / df['close'].shift(20)) - 1

            latest = df.iloc[-1]
            previous = df.iloc[-2]

            strategy_results.append({
                "name": name,
                "code": code,
                "latest_close": latest['close'],
                "ma20": latest['ma20'],
                "ma60": latest['ma60'],
                "ma60_is_rising": latest['ma60'] > previous['ma60'],
                "return_20d": latest['return_20d'],
            })

        ranked_results = sorted(
            [r for r in strategy_results if r['return_20d'] is not None],
            key=lambda x: x['return_20d'],
            reverse=True
        )

        top_2 = ranked_results[:2]
        to_buy = [
            etf for etf in top_2
            if etf['latest_close'] > etf['ma20'] and etf['ma60_is_rising']
        ]

        return {
            "ranking": ranked_results,
            "to_buy": to_buy,
            "last_updated": end_date.isoformat()
        }

    finally:
        bs.logout()
