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
  7. 会话管理       /api/session
  8. 自定义策略     /api  (原有业务接口，保留)
"""
import asyncio
import baostock as bs
import pandas as pd
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from datetime import datetime, timedelta
import swagger_ui_bundle

from session import ensure_login, heartbeat_task, manual_logout, run_bs, mark_disconnected
from routers import history, sector, evaluation, corpreport, metadata, macroscopic, strategy as strategy_router
from routers import session as session_router
from routers import cache as cache_router


# ──────────────────────────────────────────────
# Lifespan：后台发起登录 + 启动心跳，不阻塞服务器接受请求
# ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 后台登录，不阻塞 uvicorn 启动（登录完成前的请求由 run_bs 内部自动重试）
    asyncio.create_task(ensure_login())
    task = asyncio.create_task(heartbeat_task())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await manual_logout()


# ──────────────────────────────────────────────
# Swagger / OpenAPI 配置
# docs_url=None / redoc_url=None 禁用默认 CDN 版本，改用本地静态文件
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
| 会话管理 | `/api/session` | 登录/登出/心跳状态查询 |
| 自定义策略 | `/api` | 市场指数快照、ETF轮动策略（原有业务接口） |

---

### 数据来源
- 数据提供方：[BaoStock](http://baostock.com)
- 覆盖范围：沪深A股、指数、ETF，历史数据从2006年起
    """,
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
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
        {"name": "会话管理", "description": "BaoStock 登录/登出，以及心跳保活状态查询"},
        {"name": "投资策略", "description": "市场指数快照、ETF轮动策略（原有业务接口）"},
        {"name": "策略分析", "description": "全天候配置动态平衡、ETF行业动量CTA轮动策略"},
    ]
)

# ──────────────────────────────────────────────
# 本地静态文件：swagger-ui-bundle（pip 安装，无需联网）
# ──────────────────────────────────────────────
app.mount(
    "/static/swagger-ui",
    StaticFiles(directory=swagger_ui_bundle.swagger_ui_path),
    name="swagger_ui_static",
)


def custom_openapi():
    """强制将 OpenAPI 版本降至 3.0.3，兼容 Swagger UI 4.x"""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=app.openapi_tags,
    )
    schema["openapi"] = "3.0.3"
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=app.title + " - Swagger UI",
        swagger_js_url="/static/swagger-ui/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui/swagger-ui.css",
        swagger_favicon_url="/static/swagger-ui/favicon-32x32.png",
    )


@app.get("/redoc", include_in_schema=False)
async def custom_redoc():
    return get_redoc_html(
        openapi_url="/openapi.json",
        title=app.title + " - ReDoc",
        # 本地 swagger-ui-bundle 不含 redoc，改用国内可访问的 unpkg CDN
        # 若仍无法访问，请使用 /docs 替代
        redoc_js_url="https://unpkg.com/redoc@2.1.3/bundles/redoc.standalone.js",
    )


@app.get("/", include_in_schema=False)
async def home_page():
    """统一主页：所有页面入口 + API 接口目录"""
    html = (Path(__file__).parent / "home_page.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/settings", include_in_schema=False)
async def settings_page():
    """系统设置页：会话状态、心跳配置、手动登录/登出"""
    html = (Path(__file__).parent / "settings_page.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/strategy", include_in_schema=False)
async def strategy_page():
    """策略分析页：全天候配置动态平衡 + ETF行业动量CTA轮动"""
    html = (Path(__file__).parent / "strategy_page.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/test", include_in_schema=False)
async def api_test_page():
    """API 回归测试页面：访问时自动调用全部接口并展示真实数据"""
    html = (Path(__file__).parent / "test_page.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


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
app.include_router(history.router)               # 历史行情数据
app.include_router(sector.router)                # 板块与指数成分股
app.include_router(evaluation.router)            # 季频财务指标
app.include_router(corpreport.router)            # 公司业绩报告
app.include_router(metadata.router)              # 证券基础数据
app.include_router(macroscopic.router)           # 宏观经济数据
app.include_router(session_router.router)        # 会话管理
app.include_router(strategy_router.router)       # 策略分析
app.include_router(cache_router.router)          # 本地 JSON 缓存


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
        if "RECVSOCK" in (rs.error_msg or "") or "socket" in (rs.error_msg or "").lower():
            mark_disconnected()
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
    """获取指数最新行情，SDK 报错时抛出异常"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=10)
    rs = bs.query_history_k_data_plus(
        index_code,
        "date,close,preclose",
        start_date=start_date.strftime('%Y-%m-%d'),
        end_date=end_date.strftime('%Y-%m-%d'),
        frequency="d",
    )
    if rs.error_code != '0':
        # socket 断开类错误：重置登录态，下次调用自动重连
        if "RECVSOCK" in (rs.error_msg or "") or "socket" in (rs.error_msg or "").lower():
            mark_disconnected()
        raise RuntimeError(f"{index_code} 查询失败: {rs.error_msg}")

    rows = []
    while rs.error_code == '0' and rs.next():
        rows.append(rs.get_row_data())

    if not rows:
        raise RuntimeError(f"{index_code} 返回空数据")

    latest = rows[-1]
    price = float(latest[1])
    preclose = float(latest[2]) if latest[2] else price
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
async def get_market_indices():
    indices = [
        ("sh.000001", "上证指数"),
        ("sz.399001", "深证成指"),
        ("sh.000300", "沪深300"),
        ("sz.399006", "创业板指"),
        ("sh.000688", "科创50"),
    ]

    def _compute():
        results = []
        for code, name in indices:
            try:
                results.append(get_index_quote(code, name))
            except Exception as e:
                results.append({"name": name, "code": code, "error": str(e)})
        return results

    result = await run_bs(_compute)
    if result is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}
    return {"indices": result, "last_updated": datetime.now().isoformat()}


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
async def get_strategy_data():
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

    def _compute():
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
                "ma60_is_rising": bool(latest['ma60'] > previous['ma60']),
                "return_20d": latest['return_20d'],
            })
        return strategy_results

    strategy_results = await run_bs(_compute)
    if strategy_results is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}

    ranked = sorted(
        [r for r in strategy_results if r['return_20d'] is not None],
        key=lambda x: x['return_20d'],
        reverse=True
    )
    to_buy = [
        etf for etf in ranked[:2]
        if etf['latest_close'] > etf['ma20'] and etf['ma60_is_rising']
    ]
    return {"ranking": ranked, "to_buy": to_buy, "last_updated": end_date.isoformat()}
