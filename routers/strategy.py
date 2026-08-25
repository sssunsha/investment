# -*- coding: utf-8 -*-
"""
策略分析接口

1. GET /api/strategy/all-weather       全天候配置动态平衡
2. GET /api/strategy/sector-rotation   ETF行业动量CTA轮动
3. GET /api/strategy/valuation/batch   指数估值百分位（中证指数官网）
"""
import asyncio
import json
import time
import logging
import baostock as bs
import requests
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse, JSONResponse
from datetime import datetime, timedelta
from pathlib import Path
from session import run_bs
from services.fund_nav import fetch_fund_nav_series
from services.strategy_calc import _calc_ma60, _fetch_close_series

logger = logging.getLogger(__name__)

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
    # 行业（13 只）
    {"name": "半导体",    "code": "sh.512480", "code_c": "007301", "code_a": "007300", "group": "行业"},
    {"name": "医药卫生",  "code": "sz.159929", "code_c": "007077", "code_a": "007076", "group": "行业"},
    {"name": "证券公司",  "code": "sh.512880", "code_c": "012363", "code_a": "012362", "group": "行业"},
    {"name": "人工智能",  "code": "sh.515980", "code_c": "008021", "code_a": "008020", "group": "行业"},
    {"name": "主要消费",  "code": "sz.159928", "code_c": "012857", "code_a": "000248", "group": "行业"},
    {"name": "红利低波动","code": "sh.512890", "code_c": "007467", "code_a": "007466", "group": "行业"},
    {"name": "有色金属",  "code": "sh.512400", "code_c": "004433", "code_a": "004432", "group": "行业"},
    {"name": "畜牧养殖",  "code": "sz.159865", "code_c": "012725", "code_a": "012724", "group": "行业"},
    {"name": "军工",      "code": "sh.512680", "code_c": "005693", "code_a": "003017", "group": "行业"},
    {"name": "煤炭",      "code": "sh.515220", "code_c": "008280", "code_a": "008279", "group": "行业"},
    {"name": "中药",      "code": "sh.560080", "code_c": "501012", "code_a": "501011", "group": "行业"},
    {"name": "恒生科技",  "code": "sh.513260", "code_c": "013128", "code_a": "013127", "group": "行业"},
    {"name": "恒生生物",  "code": "sz.159892", "code_c": "016971", "code_a": "016970", "group": "行业"},
    # 防御（1 只）
    {"name": "黄金",      "code": "sh.518880", "code_c": "000217", "code_a": "000216", "group": "防御"},
    # 行业（原备选，现升为正式池，3 只）
    {"name": "光伏产业",  "code": "sz.159863", "code_c": "021085", "code_a": "021084", "group": "行业"},
    {"name": "机器人",    "code": "sz.159770", "code_c": "014881", "code_a": "014880", "group": "行业"},
    {"name": "新能源",    "code": "sh.516160", "code_c": "012832", "code_a": "012831", "group": "行业"},
]

# ── 全天候策略基金池（7 大类资产 × 主力 + 替代）────────────────
AW_POOL_FUNDS = [
    # 股票-大盘
    {"id": "hs300",  "label": "主力", "group": "stock",  "name": "华泰柏瑞沪深300ETF联接A",              "code_c": "460300", "baostock_code": "sh.510300"},
    {"id": "hs300",  "label": "替代", "group": "stock",  "name": "天弘沪深300ETF联接A",                  "code_c": "000961", "baostock_code": "sh.510300"},
    # 股票-中盘
    {"id": "zz500",  "label": "主力", "group": "stock",  "name": "易方达中证500ETF联接A",                "code_c": "007028", "baostock_code": "sh.512500"},
    {"id": "zz500",  "label": "替代", "group": "stock",  "name": "华夏中证500ETF联接A",                  "code_c": "001052", "baostock_code": "sh.512500"},
    # 长期债券-国开 (7-10年)
    {"id": "bond75", "label": "主力", "group": "bond_l", "name": "南方中债7-10年国开行债券指数A",        "code_c": "006961", "baostock_code": "sh.511260"},
    {"id": "bond75", "label": "替代", "group": "bond_l", "name": "汇添富中债7-10年国开行债券指数A",      "code_c": "008054", "baostock_code": "sh.511260"},
    # 长期债券-农发 (5-10年)：sh.511170 返回 0 行，使用 sh.511020（平安5-10年期国债活跃券ETF）
    {"id": "bond35", "label": "主力", "group": "bond_l", "name": "博时中债5-10年农发行债券指数A",        "code_c": "006848", "baostock_code": "sh.511020"},
    {"id": "bond35", "label": "替代", "group": "bond_l", "name": "上银中债5-10年国开行债券指数A",        "code_c": "013138", "baostock_code": "sh.511020"},
    # 中期债券 (3-5年)：sh.511130 为30年期国债ETF（错误），使用 sh.511010（国泰上证5年期国债ETF）
    {"id": "bond5",  "label": "主力", "group": "bond_m", "name": "南方中债3-5年农发行债券指数A",         "code_c": "006493", "baostock_code": "sh.511010"},
    {"id": "bond5",  "label": "替代", "group": "bond_m", "name": "长城中债3-5年期国债指数A",             "code_c": "009324", "baostock_code": "sh.511010"},
    # 黄金
    {"id": "gold",   "label": "主力", "group": "gold",   "name": "华安黄金易ETF联接A",                   "code_c": "000216", "baostock_code": "sh.518880"},
    {"id": "gold",   "label": "替代", "group": "gold",   "name": "博时黄金ETF联接A",                     "code_c": "002610", "baostock_code": "sh.518880"},
    # 大宗商品 QDII-LOF：sz.160216/sz.165513 BaoStock 无历史数据，设为 None
    {"id": "comm",   "label": "主力", "group": "comm",   "name": "国泰大宗商品(QDII-LOF)A",              "code_c": "160216", "baostock_code": None},
    {"id": "comm",   "label": "替代", "group": "comm",   "name": "中信保诚全球商品主题(QDII-FOF-LOF)A",  "code_c": "165513", "baostock_code": None},
]


@router.get("/mdtfr-pool", summary="动量趋势双重过滤轮动策略标的池（批量）")
async def mdtfr_pool():
    end_date   = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')
    loop       = asyncio.get_running_loop()

    def _compute():
        results = []
        for etf in MDTFR_ETFS:
            # 使用 C 类基金净值（天天基金）替代场内 ETF 收盘价
            rows = fetch_fund_nav_series(etf["code_c"], start_date, end_date)
            n = len(rows)
            if n < 21:
                results.append({**etf, "error": f"数据不足（{n} 条）",
                                 "latest_close": None, "latest_date": None})
                continue
            closes = [r["close"] for r in rows]
            ma20 = round(sum(closes[-20:]) / 20, 3)
            ma60, ma60_rising, ma60_rate, ma60_trend, ma60_has_uptick, ma60_above_avg, ma60_avg5 = _calc_ma60(closes)
            
            # 按交易日计算涨跌幅（使用数组索引）
            ret_20d = round((closes[-1] - closes[-21]) / closes[-21], 6) if n >= 21 else None
            ret_10d = round((closes[-1] - closes[-11]) / closes[-11], 6) if n >= 11 else None
            ret_5d = round((closes[-1] - closes[-6]) / closes[-6], 6) if n >= 6 else None
            ret_1d = round((closes[-1] - closes[-2]) / closes[-2], 6) if n >= 2 else None
            
            results.append({
                **etf,
                "latest_close":   round(closes[-1], 3),
                "latest_date":    rows[-1]["date"],
                "ret_20d":        ret_20d,
                "ret_10d":        ret_10d,
                "ret_5d":         ret_5d,
                "ret_1d":         ret_1d,
                "ma20": ma20, "ma60": ma60,
                "above_ma20":     closes[-1] > ma20,
                "ma60_rising":    ma60_rising,
                "ma60_rate":      ma60_rate,
                "ma60_trend":     ma60_trend,
                "ma60_has_uptick": ma60_has_uptick,
                "ma60_above_avg":  ma60_above_avg,
                "ma60_avg5":       ma60_avg5,
                "error":          None,
            })
            time.sleep(0.1)
        return results

    raw = await loop.run_in_executor(None, _compute)
    if raw is None:
        return {"error": "数据获取失败，请稍后重试"}

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
    """逐只基金处理，每完成一只即通过 SSE 推送结果，前端可实时逐行填充。
    codes 参数可指定只处理特定标的（用于补全缓存中不完整的行）。"""
    end_date   = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')

    target_codes = set(codes.split(',')) if codes else None
    etfs_to_process = [e for e in MDTFR_ETFS if target_codes is None or e['code_c'] in target_codes]

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def _run():
        ev = lambda d: loop.call_soon_threadsafe(queue.put_nowait, json.dumps(d, ensure_ascii=False))

        # BaoStock 仅用于获取 ETF 成交量，NAV 数据仍来自天天基金
        import baostock as _bs
        bs_ok = False
        try:
            lg = _bs.login()
            bs_ok = lg.error_code == '0'
            if not bs_ok:
                ev({"type": "progress", "name": "系统", "msg": f"BaoStock 登录失败，成交量不可用: {lg.error_msg}"})
        except Exception as _e:
            ev({"type": "progress", "name": "系统", "msg": f"BaoStock 初始化失败: {_e}"})

        def _fetch_etf_volumes(bs_code):
            """返回 {date: volume(手)} 字典，失败返回空字典。"""
            try:
                rs = _bs.query_history_k_data_plus(
                    bs_code, "date,volume",
                    start_date=start_date, end_date=end_date,
                    frequency="d", adjustflag="3"
                )
                vol_map = {}
                while rs.error_code == '0' and rs.next():
                    row = rs.get_row_data()
                    if row[0] and row[1]:
                        vol_map[row[0]] = int(float(row[1]))
                return vol_map
            except Exception:
                return {}

        def _calc_vol_stats(rows, vol_map):
            """对齐 NAV 日期与 ETF 成交量，返回量统计字典。"""
            vols = [vol_map.get(r["date"]) for r in rows]
            aligned = [v for v in vols if v is not None]
            nv = len(aligned)
            if nv < 2:
                return {"vol_1d": None, "vol_avg_5d": None, "vol_avg_10d": None, "vol_avg_20d": None,
                        "vol_signal": None, "vol_ratio": None}
            vol_1d      = aligned[-1]
            vol_avg_5d  = round(sum(aligned[-5:])  / min(5,  nv)) if nv >= 5  else None
            vol_avg_10d = round(sum(aligned[-10:]) / min(10, nv)) if nv >= 10 else None
            vol_avg_20d = round(sum(aligned[-20:]) / min(20, nv)) if nv >= 20 else None
            # 信号基准：今日与前 20 个交易日均量对比
            prev = aligned[:-1]
            prev_avg = sum(prev[-20:]) / min(20, len(prev)) if prev else 0
            vol_signal = vol_ratio = None
            if prev_avg > 0:
                vol_ratio = round(vol_1d / prev_avg, 3)
                if   vol_ratio >= 3.0: vol_signal = "巨额放量"
                elif vol_ratio >= 1.5: vol_signal = "放量"
                elif vol_ratio >= 1.2: vol_signal = "温和放量"
                elif vol_ratio >= 0.8: vol_signal = "正常"
                elif vol_ratio >= 0.5: vol_signal = "温和缩量"
                elif vol_ratio >= 0.3: vol_signal = "缩量"
                else:                  vol_signal = "巨额缩量"
            return {"vol_1d": vol_1d, "vol_avg_5d": vol_avg_5d, "vol_avg_10d": vol_avg_10d,
                    "vol_avg_20d": vol_avg_20d, "vol_signal": vol_signal, "vol_ratio": vol_ratio}

        _vol_null = {"vol_1d": None, "vol_avg_5d": None, "vol_avg_10d": None,
                     "vol_avg_20d": None, "vol_signal": None, "vol_ratio": None}

        try:
            for etf in etfs_to_process:
                ev({"type": "progress", "name": etf["name"], "msg": "获取净值数据..."})
                try:
                    # 使用 C 类基金净值（天天基金）替代场内 ETF 收盘价
                    rows = fetch_fund_nav_series(etf["code_c"], start_date, end_date)
                    n = len(rows)
                    if n < 21:
                        ev({"type": "item", **etf, **_vol_null,
                            "error": f"数据不足（{n} 条，需至少 21 条）",
                            "latest_close": None, "prev_close": None, "latest_date": None})
                        continue
                    closes = [r["close"] for r in rows]
                    ma20 = round(sum(closes[-20:]) / 20, 3)
                    ma60, ma60_rising, ma60_rate, ma60_trend, ma60_has_uptick, ma60_above_avg, ma60_avg5 = _calc_ma60(closes)

                    # 按交易日计算涨跌幅（使用数组索引）
                    ret_20d = round((closes[-1] - closes[-21]) / closes[-21], 6) if n >= 21 else None
                    ret_10d = round((closes[-1] - closes[-11]) / closes[-11], 6) if n >= 11 else None
                    ret_5d  = round((closes[-1] - closes[-6])  / closes[-6],  6) if n >= 6  else None
                    ret_1d  = round((closes[-1] - closes[-2])  / closes[-2],  6) if n >= 2  else None

                    # 成交量：通过 BaoStock 查场内 ETF 日线量
                    vol_stats = _vol_null
                    if bs_ok and etf.get("code"):
                        vol_map = _fetch_etf_volumes(etf["code"])
                        if vol_map:
                            vol_stats = _calc_vol_stats(rows, vol_map)

                    ev({"type": "item", **etf,
                        "latest_close": round(closes[-1], 3),
                        "prev_close":   round(closes[-2], 3),
                        "latest_date":  rows[-1]["date"],
                        "ret_20d":      ret_20d,
                        "ret_10d":      ret_10d,
                        "ret_5d":       ret_5d,
                        "ret_1d":       ret_1d,
                        "ma20": ma20, "ma60": ma60,
                        "above_ma20":   closes[-1] > ma20,
                        "ma60_rising":  ma60_rising,
                        "ma60_rate":    ma60_rate,
                        "ma60_trend":   ma60_trend,
                        "ma60_has_uptick": ma60_has_uptick,
                        "ma60_above_avg":  ma60_above_avg,
                        "ma60_avg5":       ma60_avg5,
                        **vol_stats,
                        "error": None})
                    time.sleep(0.2)
                except Exception as e:
                    ev({"type": "item", **etf, **_vol_null, "error": str(e),
                        "latest_close": None, "prev_close": None, "latest_date": None})
        finally:
            if bs_ok:
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


@router.get("/aw-pool/stream", summary="全天候标的池动量监控（SSE逐条流式）")
async def aw_pool_stream():
    """逐只基金处理，每完成一只即通过 SSE 推送结果。"""
    end_date   = datetime.now().strftime('%Y-%m-%d')
    # 扩展到 400 天以支持近一年涨跌计算（需要约 252 个交易日 + 缓冲）
    start_date = (datetime.now() - timedelta(days=400)).strftime('%Y-%m-%d')

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

        if not _login():
            loop.call_soon_threadsafe(queue.put_nowait, None)
            return

        try:
            for fund in AW_POOL_FUNDS:
                try:
                    code_c = fund.get("code_c")
                    
                    ev({"type": "progress", "name": fund["name"], "msg": "获取数据中..."})
                    
                    # 统一使用天天基金 NAV 数据（场外基金代码），数据更完整
                    nav_series = fetch_fund_nav_series(code_c, start_date, end_date)
                    if not nav_series:
                        ev({"type": "item", **fund,
                            "latest_close": None, "ret_1y": None,
                            "ret_6m": None, "ret_3m": None, "ret_1m": None,
                            "ma20": None, "above_ma20": None,
                            "ma60": None, "ma60_rising": None,
                            "ma60_rate": None, "ma60_trend": None,
                            "error": "无法获取净值数据"})
                        continue
                    rows = [item["close"] for item in nav_series]

                    n = len(rows)
                    if n < 21:
                        ev({"type": "item", **fund,
                            "latest_close": None, "ret_1y": None,
                            "ret_6m": None, "ret_3m": None, "ret_1m": None,
                            "ma20": None, "above_ma20": None,
                            "ma60": None, "ma60_rising": None,
                            "ma60_rate": None, "ma60_trend": None,
                            "error": f"数据不足（{n} 条）"})
                        continue

                    # nav_series 包含 date 和 close，用于按自然日查找
                    closes = rows
                    ma20 = round(sum(closes[-20:]) / 20, 3)
                    
                    # 按自然日计算涨跌幅：往前推指定自然日，找到最近的交易日
                    def find_close_by_date(target_date_str):
                        """查找目标日期或之前最近交易日的收盘价"""
                        for item in reversed(nav_series):
                            if item["date"] <= target_date_str:
                                return item["close"]
                        return None
                    
                    from datetime import datetime as dt
                    today = dt.strptime(nav_series[-1]["date"], "%Y-%m-%d")
                    
                    # 近一年：往前推 365 天
                    date_1y = (today - timedelta(days=365)).strftime("%Y-%m-%d")
                    close_1y = find_close_by_date(date_1y)
                    ret_1y = round((closes[-1] / close_1y - 1), 6) if close_1y else None
                    
                    # 近6个月：往前推 180 天
                    date_6m = (today - timedelta(days=180)).strftime("%Y-%m-%d")
                    close_6m = find_close_by_date(date_6m)
                    ret_6m = round((closes[-1] / close_6m - 1), 6) if close_6m else None
                    
                    # 近3个月：往前推 90 天
                    date_3m = (today - timedelta(days=90)).strftime("%Y-%m-%d")
                    close_3m = find_close_by_date(date_3m)
                    ret_3m = round((closes[-1] / close_3m - 1), 6) if close_3m else None
                    
                    # 近1个月：往前推 30 天
                    date_1m = (today - timedelta(days=30)).strftime("%Y-%m-%d")
                    close_1m = find_close_by_date(date_1m)
                    ret_1m = round((closes[-1] / close_1m - 1), 6) if close_1m else None
                    
                    ma60, ma60_rising, ma60_rate, ma60_trend, ma60_has_uptick, ma60_above_avg, ma60_avg5 = _calc_ma60(closes)

                    ev({"type": "item", **fund,
                        "latest_close": round(closes[-1], 3),
                        "ret_1y":       ret_1y,
                        "ret_6m":       ret_6m,
                        "ret_3m":       ret_3m,
                        "ret_1m":       ret_1m,
                        "ma20":         ma20,
                        "above_ma20":   closes[-1] > ma20,
                        "ma60":         ma60,
                        "ma60_rising":  ma60_rising,
                        "ma60_rate":    ma60_rate,
                        "ma60_trend":   ma60_trend,
                        "ma60_has_uptick": ma60_has_uptick,
                        "ma60_above_avg":  ma60_above_avg,
                        "ma60_avg5":       ma60_avg5,
                        "error":        None})
                    time.sleep(0.3)
                except Exception as e:
                    ev({"type": "item", **fund,
                        "latest_close": None, "ret_1y": None,
                        "ret_6m": None, "ret_3m": None, "ret_1m": None,
                        "ma20": None, "above_ma20": None,
                        "ma60": None, "ma60_rising": None,
                        "ma60_rate": None, "ma60_trend": None,
                        "error": str(e)})
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


# ══════════════════════════════════════════════════════════════════════════════
# 指数估值百分位 API（数据来源：中证指数官网）
# ══════════════════════════════════════════════════════════════════════════════

# 估值缓存目录
_VALUATION_CACHE_DIR = Path.home() / ".investment" / "valuation"
_VALUATION_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# CSI 指数代码映射（code_c → CSI index code）
_CSI_INDEX_MAP = {
    "006131": "000300",   # 沪深300
    "006382": "000905",   # 中证500
    "004744": "000958",   # 创业板 → 中证创业成长
    "011861": "000852",   # 中证1000
    "011609": "000688",   # 科创50
    "007301": "H30184",   # 半导体
    "007077": "000933",   # 医药卫生
    "012363": "399975",   # 证券公司
    "008021": "931071",   # 人工智能
    "012857": "000932",   # 主要消费
    "007467": "930955",   # 红利低波动
    "004433": "930708",   # 有色金属
    "012725": "930707",   # 畜牧养殖
    "005693": "399967",   # 军工
    "008280": "399998",   # 煤炭
    "501012": "930641",   # 中药
    "013128": "931573",   # 恒生科技
    "016971": "930726",   # 恒生生物
    "021085": "931151",   # 光伏产业
    "014881": "H30590",   # 机器人
    "012832": "930997",   # 新能源
    # 黄金无PE概念，不参与估值
}


def _fetch_csi_pe_history(index_code: str, years: int = 5) -> list:
    """从中证指数官网获取指数历史PE数据（peg字段）"""
    end_date = datetime.now().strftime('%Y%m%d')
    start_date = (datetime.now() - timedelta(days=years * 365)).strftime('%Y%m%d')
    url = (
        f"https://www.csindex.com.cn/csindex-home/perf/index-perf"
        f"?indexCode={index_code}&startDate={start_date}&endDate={end_date}"
    )
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.csindex.com.cn/',
    }
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") == "200" and data.get("data"):
            return [
                {"date": item["tradeDate"], "pe": item["peg"]}
                for item in data["data"]
                if item.get("peg") is not None
            ]
    except Exception as e:
        logger.warning(f"获取 CSI PE 数据失败 [{index_code}]: {e}")
    return []


def _calc_percentile(pe_list: list, current_pe: float) -> float:
    """计算当前PE在历史数据中的百分位（0~100）"""
    if not pe_list or current_pe is None:
        return None
    count_below = sum(1 for pe in pe_list if pe < current_pe)
    return round(count_below / len(pe_list) * 100, 1)


def _pe_zone(percentile: float) -> str:
    """根据百分位判断估值区间"""
    if percentile is None:
        return None
    if percentile < 20:
        return "低估"
    elif percentile < 40:
        return "较低"
    elif percentile < 60:
        return "正常"
    elif percentile < 80:
        return "较高"
    else:
        return "高估"


def _get_valuation_cache(today: str) -> dict | None:
    """读取今日估值缓存"""
    cache_file = _VALUATION_CACHE_DIR / f"valuation_{today}.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None


def _save_valuation_cache(today: str, data: dict):
    """保存今日估值缓存"""
    cache_file = _VALUATION_CACHE_DIR / f"valuation_{today}.json"
    try:
        cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        logger.warning(f"保存估值缓存失败: {e}")


@router.get(
    "/valuation/batch",
    summary="批量获取指数估值百分位",
    description="""
从中证指数官网获取各标的对应指数的PE历史数据，计算当前PE所在的历史百分位。

**估值区间划分：**
- 0%-20%: 低估（蓝色）
- 20%-40%: 较低（绿色）
- 40%-60%: 正常（白色）
- 60%-80%: 较高（橘色）
- 80%-100%: 高估（红色）

**数据来源：** 中证指数官网 csindex.com.cn
**缓存策略：** 当日数据缓存，避免重复请求
    """,
)
async def valuation_batch(
    years: int = Query(10, description="历史回溯年数，用于计算百分位", ge=1, le=10),
    force: bool = Query(False, description="强制刷新缓存"),
):
    today = datetime.now().strftime('%Y-%m-%d')

    # 检查缓存
    if not force:
        cached = _get_valuation_cache(today)
        if cached and cached.get("years") == years:
            return cached

    loop = asyncio.get_running_loop()

    def _compute():
        results = {}
        # 近5年的交易日数约为 5*250=1250 条
        five_year_days = 5 * 250
        for code_c, index_code in _CSI_INDEX_MAP.items():
            try:
                pe_history = _fetch_csi_pe_history(index_code, years)
                if not pe_history:
                    results[code_c] = {
                        "index_code": index_code,
                        "current_pe": None,
                        "percentile_10y": None,
                        "percentile_5y": None,
                        "zone": None,
                        "error": "数据不可用",
                    }
                    continue
                pe_values = [item["pe"] for item in pe_history]
                current_pe = pe_values[-1]
                # 10年百分位（用全部数据）
                percentile_10y = _calc_percentile(pe_values, current_pe)
                # 5年百分位（只用后5年数据）
                pe_values_5y = pe_values[-five_year_days:] if len(pe_values) > five_year_days else pe_values
                percentile_5y = _calc_percentile(pe_values_5y, current_pe)
                # 估值区间基于10年百分位
                zone = _pe_zone(percentile_10y)
                results[code_c] = {
                    "index_code": index_code,
                    "current_pe": current_pe,
                    "percentile_10y": percentile_10y,
                    "percentile_5y": percentile_5y,
                    "zone": zone,
                    "data_points": len(pe_values),
                    "error": None,
                }
                time.sleep(0.3)  # 请求间隔，避免频率限制
            except Exception as e:
                results[code_c] = {
                    "index_code": index_code,
                    "current_pe": None,
                    "percentile_10y": None,
                    "percentile_5y": None,
                    "zone": None,
                    "error": str(e),
                }
        return results

    results = await loop.run_in_executor(None, _compute)

    response = {
        "items": results,
        "years": years,
        "date": today,
        "last_updated": datetime.now().isoformat(),
    }

    # 只有至少有一个成功结果时才保存缓存，避免全部失败时写入无效缓存
    has_valid = any(v.get("error") is None for v in results.values())
    if has_valid:
        _save_valuation_cache(today, response)

    return response

