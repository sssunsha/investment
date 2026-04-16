# -*- coding: utf-8 -*-
"""
策略分析接口

1. GET /api/strategy/all-weather       全天候配置动态平衡
2. GET /api/strategy/sector-rotation   ETF行业动量CTA轮动
"""
import asyncio
import json
import time
import baostock as bs
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
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


def _calc_ma60(closes: list) -> tuple:
    """计算 MA60 值、5日变化率及趋势分级。

    返回 (ma60, ma60_rising, ma60_change_rate, ma60_trend)

    变化率 = (今日MA60 / N日前MA60 − 1) × 100%
    趋势分级：
      > +1%         → 明确上行  rising=True
      +0.3% ~ +1%   → 温和上行  rising=True
      −0.3% ~ +0.3% → 走平      rising=None
      −1% ~ −0.3%   → 温和下行  rising=False
      < −1%         → 明确下行  rising=False

    数据适配（n = len(closes)）：
      n >= 65 : 5日前MA60（标准）
      n >= 63 : 3日前MA60（降级，BaoStock 仅返回约63个交易日）
      n >= 60 : 只返回MA60值，其余置 None
      n <  60 : 全部置 None
    """
    n = len(closes)
    if n < 60:
        return None, None, None, None
    ma60 = round(sum(closes[-60:]) / 60, 4)
    if n >= 65:
        ma60_prev = sum(closes[-65:-5]) / 60   # 5日前 MA60
    elif n >= 63:
        ma60_prev = sum(closes[-63:-3]) / 60   # 3日前 MA60（降级）
    else:
        return round(ma60, 3), None, None, None

    rate = (ma60 / ma60_prev - 1)
    if rate > 0.01:
        trend, rising = "明确上行", True
    elif rate > 0.003:
        trend, rising = "温和上行", True
    elif rate >= -0.003:
        trend, rising = "走平", None
    elif rate >= -0.01:
        trend, rising = "温和下行", False
    else:
        trend, rising = "明确下行", False

    return round(ma60, 3), rising, round(rate * 100, 4), trend


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


# ── 动量趋势双重过滤轮动策略 ETF 池 ──────────────────────────
MDTFR_ETFS = [
    # 宽基（5 只）
    {"name": "沪深300",   "code": "sh.510300", "code_c": "006131", "code_a": "460300", "group": "宽基"},
    {"name": "中证500",   "code": "sh.512500", "code_c": "006382", "code_a": "001052", "group": "宽基"},
    {"name": "创业板",    "code": "sz.159915", "code_c": "004744", "code_a": "110026", "group": "宽基"},
    {"name": "中证1000",  "code": "sh.512100", "code_c": "011861", "code_a": "011860", "group": "宽基"},
    {"name": "科创50",    "code": "sh.588080", "code_c": "011609", "code_a": "011608", "group": "宽基"},
    # 行业（6 只）
    {"name": "半导体",    "code": "sh.512480", "code_c": "007301", "code_a": "007300", "group": "行业"},
    {"name": "医药卫生",  "code": "sz.159929", "code_c": "007077", "code_a": "007076", "group": "行业"},
    {"name": "证券公司",  "code": "sh.512880", "code_c": "012363", "code_a": "012362", "group": "行业"},
    {"name": "人工智能",  "code": "sh.515980", "code_c": "008021", "code_a": "008020", "group": "行业"},
    {"name": "主要消费",  "code": "sz.159928", "code_c": "012857", "code_a": "000248", "group": "行业"},
    {"name": "红利低波动","code": "sh.512890", "code_c": "007467", "code_a": "007466", "group": "行业"},
    # 防御（1 只）
    {"name": "黄金",      "code": "sh.518880", "code_c": "000217", "code_a": "000216", "group": "防御"},
    # 进攻行业备选（3 只，标的池调整时可替换进攻行业）
    {"name": "光伏产业",  "code": "sz.159863", "code_c": "021085", "code_a": "021084", "group": "行业"},
    {"name": "机器人",    "code": "sz.159770", "code_c": "014881", "code_a": "014880", "group": "行业"},
    {"name": "新能源",    "code": "sh.516160", "code_c": "012832", "code_a": "012831", "group": "行业"},
]


@router.get("/mdtfr-pool", summary="动量趋势双重过滤轮动策略标的池（批量）")
async def mdtfr_pool():
    end_date   = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')

    def _compute():
        results = []
        for etf in MDTFR_ETFS:
            rows = _fetch_close_series(etf["code"], start_date, end_date)
            n = len(rows)
            if n < 21:
                results.append({**etf, "error": f"数据不足（{n} 条）",
                                 "latest_close": None, "latest_date": None})
                continue
            closes = [r["close"] for r in rows]
            ma20 = round(sum(closes[-20:]) / 20, 3)
            ma60, ma60_rising, ma60_rate, ma60_trend = _calc_ma60(closes)
            results.append({
                **etf,
                "latest_close":   round(closes[-1], 3),
                "latest_date":    rows[-1]["date"],
                "ret_20d":        round((closes[-1] - closes[-21]) / closes[-21], 6),
                "ma20": ma20, "ma60": ma60,
                "above_ma20":     closes[-1] > ma20,
                "ma60_rising":    ma60_rising,
                "ma60_rate":      ma60_rate,
                "ma60_trend":     ma60_trend,
                "error":          None,
            })
        return results

    raw = await run_bs(_compute)
    if raw is None:
        return {"error": "BaoStock 登录失败，请稍后重试"}

    valid   = [x for x in raw if not x.get("error") and x.get("ret_20d") is not None]
    invalid = [x for x in raw if x.get("error")]
    sorted_valid = sorted(valid, key=lambda x: x["ret_20d"], reverse=True)
    for i, x in enumerate(sorted_valid):
        x["rank"] = i + 1

    return {"items": sorted_valid + invalid, "last_updated": datetime.now().isoformat()}


@router.get("/mdtfr-pool/stream", summary="动量趋势双重过滤轮动策略标的池（SSE逐条流式）")
async def mdtfr_pool_stream(
    codes: str = Query(None, description="逗号分隔的 code_c 列表，为空则处理全部")
):
    """逐只 ETF 处理，每完成一只即通过 SSE 推送结果，前端可实时逐行填充。
    codes 参数可指定只处理特定标的（用于补全缓存中不完整的行）。"""
    end_date   = datetime.now().strftime('%Y-%m-%d')
    # 180 天确保有足够交易日（≥68）用于 MA60 趋势判断
    start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')

    # 过滤需要处理的 ETF
    target_codes = set(codes.split(',')) if codes else None
    etfs_to_process = [e for e in MDTFR_ETFS if target_codes is None or e['code_c'] in target_codes]

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def _run():
        import baostock as _bs
        ev = lambda d: loop.call_soon_threadsafe(queue.put_nowait, json.dumps(d, ensure_ascii=False))

        def _login() -> bool:
            lg = _bs.login()
            if lg.error_code != '0':
                ev({"type": "error", "msg": f"BaoStock 登录失败: {lg.error_msg}"})
                return False
            return True

        def _query_with_retry(code: str, max_retries: int = 2):
            """查询单只 ETF，网络错误时重新登录并重试"""
            for attempt in range(max_retries + 1):
                rs = _bs.query_history_k_data_plus(
                    code, "date,close",
                    start_date=start_date, end_date=end_date,
                    frequency="d", adjustflag="2"
                )
                # 10002007 = 网络接收错误，重新登录后重试
                if rs.error_code == '10002007' and attempt < max_retries:
                    _bs.logout()
                    time.sleep(1.0)
                    if not _login():
                        return rs  # 重连失败，返回错误 rs
                    continue
                return rs

        if not _login():
            loop.call_soon_threadsafe(queue.put_nowait, None)
            return
        try:
            for etf in etfs_to_process:
                ev({"type": "progress", "name": etf["name"], "msg": "获取数据中..."})
                try:
                    rs = _query_with_retry(etf["code"])
                    if rs.error_code != '0':
                        ev({"type": "item", **etf,
                            "error": f"查询失败(code={rs.error_code}): {rs.error_msg}",
                            "latest_close": None, "prev_close": None, "latest_date": None})
                        continue
                    rows = []
                    while rs.error_code == '0' and rs.next():
                        row = rs.get_row_data()
                        if row[1]:
                            rows.append({"date": row[0], "close": float(row[1])})
                    n = len(rows)
                    if n < 21:
                        ev({"type": "item", **etf,
                            "error": f"数据不足（{n} 条，需至少 21 条）",
                            "latest_close": None, "prev_close": None, "latest_date": None})
                        continue
                    closes = [r["close"] for r in rows]
                    ma20 = round(sum(closes[-20:]) / 20, 3)
                    ma60, ma60_rising, ma60_rate, ma60_trend = _calc_ma60(closes)
                    ev({"type": "item", **etf,
                        "latest_close": round(closes[-1], 3),
                        "prev_close":   round(closes[-2], 3),
                        "latest_date":  rows[-1]["date"],
                        "ret_20d":      round((closes[-1] - closes[-21]) / closes[-21], 6),
                        "ma20": ma20, "ma60": ma60,
                        "above_ma20":   closes[-1] > ma20,
                        "ma60_rising":  ma60_rising,
                        "ma60_rate":    ma60_rate,
                        "ma60_trend":   ma60_trend,
                        "error": None})
                    time.sleep(0.3)  # 避免连续请求触发 socket 错误
                except Exception as e:
                    ev({"type": "item", **etf, "error": str(e),
                        "latest_close": None, "latest_date": None})
        finally:
            _bs.logout()
            ev({"type": "done", "last_updated": datetime.now().isoformat()})
            loop.call_soon_threadsafe(queue.put_nowait, None)

    loop.run_in_executor(None, _run)

    async def _gen():
        while True:
            msg = await queue.get()
            if msg is None:
                break
            yield f"data: {msg}\n\n"

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


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
