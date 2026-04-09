# -*- coding: utf-8 -*-
"""
策略分析接口

1. GET /api/strategy/all-weather       全天候配置动态平衡
2. GET /api/strategy/sector-rotation   ETF行业动量CTA轮动
"""
import baostock as bs
from fastapi import APIRouter, Query
from datetime import datetime, timedelta
from session import run_bs

router = APIRouter(prefix="/api/strategy", tags=["策略分析"])

# ── 全天候配置组合（中国市场适配版）────────────────────────
# 参考 Ray Dalio All Weather：股票30% / 长债40% / 中债15% / 黄金7.5% / 商品7.5%
ALL_WEATHER = [
    {"name": "沪深300ETF",  "code": "sh.510300", "target": 0.30,  "asset_class": "股票"},
    {"name": "国债ETF(长)", "code": "sh.511010", "target": 0.40,  "asset_class": "长债"},
    {"name": "国债ETF(中)", "code": "sh.511020", "target": 0.15,  "asset_class": "中债"},
    {"name": "黄金ETF",     "code": "sh.518880", "target": 0.075, "asset_class": "黄金"},
    {"name": "有色金属ETF", "code": "sh.512400", "target": 0.075, "asset_class": "商品"},
]

# ── 行业轮动 ETF 池 ────────────────────────────────────────
SECTOR_ETFS = [
    {"name": "沪深300",  "code": "sh.510300"},
    {"name": "中证500",  "code": "sh.510500"},
    {"name": "创业板",   "code": "sz.159915"},
    {"name": "中证A50",  "code": "sz.159352"},
    {"name": "半导体",   "code": "sh.512480"},
    {"name": "医药生物", "code": "sz.159929"},
    {"name": "银行",     "code": "sh.512800"},
    {"name": "新能源车", "code": "sh.515030"},
    {"name": "光伏",     "code": "sh.516160"},
    {"name": "军工",     "code": "sh.512660"},
    {"name": "券商",     "code": "sh.512880"},
    {"name": "消费",     "code": "sh.510150"},
    {"name": "地产",     "code": "sh.512200"},
    {"name": "黄金",     "code": "sh.518880"},
]


def _fetch_close_series(code: str, start_date: str, end_date: str) -> list[dict]:
    """获取前复权日收盘价序列（在线程池内调用）"""
    rs = bs.query_history_k_data_plus(
        code, "date,close",
        start_date=start_date, end_date=end_date,
        frequency="d", adjustflag="2"
    )
    rows = []
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        if row[1]:
            rows.append({"date": row[0], "close": float(row[1])})
    return rows


@router.get(
    "/all-weather",
    summary="全天候配置动态平衡",
    description="""
基于 Ray Dalio 全天候策略的中国市场适配版。

**配置权重：** 股票 30% · 长债 40% · 中债 15% · 黄金 7.5% · 商品 7.5%

**漂移计算：** 以 `lookback_days` 前的价格为基准，计算各资产当前权重与目标权重的偏差。
偏差超过 `rebalance_threshold` 时给出操作建议（买入/卖出）。
    """
)
async def all_weather(
    lookback_days: int = Query(30, description="漂移回溯天数（以此为基准日）", ge=5, le=365),
    rebalance_threshold: float = Query(0.05, description="再平衡触发阈值（权重偏差超过此值时提示操作）", ge=0.01, le=0.30),
):
    end_date   = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=lookback_days + 15)).strftime('%Y-%m-%d')

    def _compute():
        items = []
        for etf in ALL_WEATHER:
            rows = _fetch_close_series(etf["code"], start_date, end_date)
            if len(rows) < 2:
                items.append({**etf, "error": f"数据不足（{len(rows)} 条）",
                               "base_close": None, "latest_close": None,
                               "period_return": None, "current_weight": None,
                               "drift": None, "action": "–"})
                continue
            base_close   = rows[0]["close"]
            latest_close = rows[-1]["close"]
            ret = (latest_close - base_close) / base_close
            items.append({
                **etf,
                "base_close":    round(base_close, 4),
                "base_date":     rows[0]["date"],
                "latest_close":  round(latest_close, 4),
                "latest_date":   rows[-1]["date"],
                "period_return": round(ret, 6),
                "current_weight": None,
                "drift":         None,
                "action":        "–",
                "error":         None,
            })
        return items

    items = await run_bs(_compute)
    if items is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}

    # 基于价格漂移重新估算当前权重
    valid = [x for x in items if x["error"] is None]
    if valid:
        total = sum(x["target"] * (1 + x["period_return"]) for x in valid)
        for x in valid:
            cw = x["target"] * (1 + x["period_return"]) / total
            x["current_weight"] = round(cw, 4)
            x["drift"]          = round(cw - x["target"], 4)
            if abs(x["drift"]) > rebalance_threshold:
                x["action"] = "卖出" if x["drift"] > 0 else "买入"
            else:
                x["action"] = "持有"

    return {
        "portfolio": items,
        "lookback_days": lookback_days,
        "rebalance_threshold": rebalance_threshold,
        "needs_rebalance": any(x["action"] in ("买入", "卖出") for x in items),
        "last_updated": datetime.now().isoformat(),
    }


@router.get(
    "/sector-rotation",
    summary="ETF行业动量CTA轮动",
    description="""
基于动量 + 均线趋势过滤的行业 ETF 轮动策略（CTA 风格）。

**动量评分：** 以 `momentum_days` 日涨跌幅排名，同时计算 5 日、60 日辅助动量。

**买入条件（同时满足）：**
1. 动量排名前 `top_n`
2. 收盘价 > MA{ma_short}（短期趋势向上）
3. MA{ma_long} 斜率向上（长期趋势确认）
    """
)
async def sector_rotation(
    momentum_days: int = Query(20, description="主动量计算周期（天）", ge=5, le=120),
    top_n:         int = Query(3,  description="目标持仓数量（动量前 N）", ge=1, le=10),
    ma_short:      int = Query(20, description="短期均线周期", ge=5, le=60),
    ma_long:       int = Query(60, description="长期均线周期", ge=20, le=250),
):
    end_date   = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=ma_long + momentum_days + 30)).strftime('%Y-%m-%d')

    def _compute():
        results = []
        for etf in SECTOR_ETFS:
            rows = _fetch_close_series(etf["code"], start_date, end_date)
            n = len(rows)
            if n < ma_long:
                results.append({**etf, "error": f"数据不足（{n} 条，需 {ma_long} 条）",
                                 "latest_close": None, "latest_date": None})
                continue

            closes = [r["close"] for r in rows]

            ret_n  = round((closes[-1] - closes[-momentum_days - 1]) / closes[-momentum_days - 1], 6) \
                     if n > momentum_days else None
            ret_5  = round((closes[-1] - closes[-6]) / closes[-6], 6) if n > 5 else None
            ret_60 = round((closes[-1] - closes[-61]) / closes[-61], 6) if n > 60 else None

            ma_s      = sum(closes[-ma_short:]) / ma_short
            ma_l      = sum(closes[-ma_long:]) / ma_long
            ma_s_prev = sum(closes[-ma_short - 1:-1]) / ma_short
            ma_l_prev = sum(closes[-ma_long - 1:-1]) / ma_long

            results.append({
                **etf,
                "latest_close":    round(closes[-1], 3),
                "latest_date":     rows[-1]["date"],
                "momentum":        ret_n,
                "ret_5d":          ret_5,
                "ret_60d":         ret_60,
                f"ma{ma_short}":   round(ma_s, 3),
                f"ma{ma_long}":    round(ma_l, 3),
                "above_ma_short":  closes[-1] > ma_s,
                "above_ma_long":   closes[-1] > ma_l,
                "ma_short_rising": ma_s > ma_s_prev,
                "ma_long_rising":  ma_l > ma_l_prev,
                "error":           None,
            })
        return results

    raw = await run_bs(_compute)
    if raw is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}

    valid = [x for x in raw if not x.get("error") and x.get("momentum") is not None]
    ranked = sorted(valid, key=lambda x: x["momentum"], reverse=True)
    for i, x in enumerate(ranked):
        x["rank"] = i + 1

    to_buy = [
        x["name"] for x in ranked[:top_n]
        if x["above_ma_short"] and x["ma_long_rising"]
    ]

    return {
        "ranking": ranked,
        "errors":  [x for x in raw if x.get("error")],
        "to_buy":  to_buy,
        "params":  {"momentum_days": momentum_days, "top_n": top_n,
                    "ma_short": ma_short, "ma_long": ma_long},
        "last_updated": datetime.now().isoformat(),
    }
