# -*- coding: utf-8 -*-
"""
Investment Indicators API Router

Provides RESTful endpoints for fetching and managing investment indicators
scraped from value500.com.

Endpoints:
    GET  /api/indicators              Get all indicators (from cache or fresh)
    GET  /api/indicators/config       Get indicator configuration
    GET  /api/indicators/signals      Get buy/sell signal analysis
    GET  /api/indicators/{key}        Get a specific indicator
    POST /api/indicators/refresh      Force refresh all indicators
    POST /api/indicators/{key}/refresh  Force refresh a specific indicator
    DELETE /api/indicators/cache      Clear all indicator caches
    DELETE /api/indicators/{key}/cache  Clear specific indicator cache
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from typing import Optional
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

import baostock as bs

from session import run_bs
from services.scraper import (
    async_scrape_indicator,
    async_scrape_all_indicators,
    async_calculate_signals,
    async_fetch_us_rates_history,
    get_config,
    clear_cache,
    INDICATORS_CONFIG,
    CATEGORIES,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/indicators", tags=["投资指标"])


@router.get("", summary="获取所有投资指标")
async def get_all_indicators(
    force_refresh: bool = Query(False, description="强制刷新（忽略缓存）")
):
    """
    获取所有投资指标的最新数据。
    
    默认优先使用缓存数据（根据指标更新频率自动过期），设置 force_refresh=true 可强制从源站刷新。
    
    返回数据包含：
    - 市场估值类：A股PE、沪深300 PE/PB、中证500 PE/PB、股债收益率比、巴菲特指标、恒生PE
    - 流动性类：Shibor利率、10年期国债收益率、M1/M2增速、M2/GDP、融资余额
    - 宏观经济类：CPI、PPI、BDI指数
    - 全球定价类：美债收益率（2Y/5Y/10Y/30Y）及利差
    """
    try:
        result = await async_scrape_all_indicators(force_refresh)
        
        # Group by category for structured response
        grouped = {}
        for cat_key, cat_info in CATEGORIES.items():
            grouped[cat_key] = {
                "name": cat_info["name"],
                "icon": cat_info["icon"],
                "order": cat_info["order"],
                "indicators": [],
            }
        
        for key, data in result.items():
            if "error" not in data:
                category = data.get("category")
                if category in grouped:
                    grouped[category]["indicators"].append(data)
            else:
                # Still include errors in the response
                category = INDICATORS_CONFIG.get(key, {}).get("category", "unknown")
                if category in grouped:
                    grouped[category]["indicators"].append({
                        "key": key,
                        "name": INDICATORS_CONFIG.get(key, {}).get("name", key),
                        "error": data.get("error"),
                    })
        
        # Sort categories by order
        sorted_categories = dict(sorted(grouped.items(), key=lambda x: x[1]["order"]))
        
        return JSONResponse(content={
            "success": True,
            "data": sorted_categories,
            "total": len(result),
        })
    except Exception as e:
        logger.exception("Failed to get all indicators")
        raise HTTPException(status_code=500, detail=f"获取指标数据失败: {str(e)}")


@router.get("/config", summary="获取指标配置")
async def get_indicators_config():
    """
    获取所有指标的配置信息，包括：
    - 指标名称（中英文）
    - 数据源URL
    - 更新频率
    - 阈值定义
    - 分类信息
    """
    config = get_config()
    return JSONResponse(content={
        "success": True,
        "data": config,
    })


@router.get("/signals", summary="获取买入/卖出信号分析")
async def get_signals():
    """
    根据所有指标计算综合买入/卖出信号。
    
    **买入信号（满足3项以上）：**
    - 股债比 > 2.0（股票性价比极高）
    - Shibor 1Y < 1.5%（流动性极度宽松）
    - 融资余额增速 < -10%（市场情绪冰点）
    - 美债利差正常（无衰退风险）
    
    **卖出信号（满足2项以上）：**
    - 股债比 < 1.0（股票性价比极低）
    - 巴菲特指标 > 120%（市场严重高估）
    - 融资余额月增速 > 30%（杠杆过热）
    - 美债利差倒挂 > 20bp（衰退预警）
    - CPI > 3%且上升（紧缩政策将至）
    
    返回综合建议：强烈买入 / 积极配置 / 观望 / 谨慎减仓 / 强制卖出
    """
    try:
        signals = await async_calculate_signals()
        return JSONResponse(content={
            "success": True,
            "data": signals,
        })
    except Exception as e:
        logger.exception("Failed to calculate signals")
        raise HTTPException(status_code=500, detail=f"计算信号失败: {str(e)}")


@router.get("/list", summary="获取指标列表（简要）")
async def list_indicators():
    """
    获取所有指标的简要列表，包括：
    - 指标key
    - 中文名称
    - 英文名称
    - 分类
    - 更新频率
    """
    indicators = []
    for key, config in INDICATORS_CONFIG.items():
        indicators.append({
            "key": key,
            "name": config["name"],
            "name_en": config["name_en"],
            "category": config["category"],
            "category_name": CATEGORIES.get(config["category"], {}).get("name", ""),
            "update_frequency": config["update_frequency"],
            "url": config["url"],
        })
    
    return JSONResponse(content={
        "success": True,
        "data": indicators,
        "total": len(indicators),
    })


@router.get("/fed-rate-history", summary="获取美国利率历史数据")
async def get_fed_rate_history(
    force_refresh: bool = Query(False, description="强制刷新（忽略缓存）")
):
    """
    获取美国利率历史数据：联邦基金利率（FEDFUNDS）、2年期（DGS2）、10年期（DGS10）美债收益率。

    数据来源：美联储圣路易斯分行（FRED）公开接口，无需API Key。
    更新频率：月度/日度；缓存有效期：24小时。
    """
    try:
        result = await async_fetch_us_rates_history(force_refresh)
        return JSONResponse(content={"success": True, "data": result})
    except Exception as e:
        logger.exception("Failed to fetch US rates history")
        raise HTTPException(status_code=500, detail=f"获取美国利率数据失败: {str(e)}")


# ── A股指数历史 ────────────────────────────────────────────────────────────────

_CN_INDICES_CACHE = Path.home() / ".investment" / "indicators" / "cn_indices_history.json"

_CN_INDICES = [
    {"code": "sh.000001", "key": "sh_000001", "name": "上证指数"},
    {"code": "sh.000300", "key": "sh_000300", "name": "沪深300"},
    {"code": "sz.399006", "key": "sz_399006", "name": "创业板指"},
    {"code": "sh.000905", "key": "sh_000905", "name": "中证500"},
]


def _read_cn_cache():
    if not _CN_INDICES_CACHE.exists():
        return None
    try:
        return json.loads(_CN_INDICES_CACHE.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_cn_cache(data):
    try:
        _CN_INDICES_CACHE.parent.mkdir(parents=True, exist_ok=True)
        _CN_INDICES_CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning("写入A股指数缓存失败: %s", e)


def _is_cn_cache_valid(data):
    try:
        cached_at = datetime.fromisoformat(data.get("cached_at", ""))
        return datetime.now() - cached_at < timedelta(hours=24)
    except (ValueError, TypeError):
        return False


@router.get("/cn-indices-history", summary="获取A股主要指数历史月度数据")
async def get_cn_indices_history(
    force_refresh: bool = Query(False, description="强制刷新（忽略缓存）")
):
    """
    获取A股主要指数月度收盘价历史（2000年至今）。

    包含：上证指数、沪深300、创业板指、中证500。
    数据来源：BaoStock；缓存有效期：24小时。
    """
    if not force_refresh:
        cached = _read_cn_cache()
        if cached and _is_cn_cache_valid(cached):
            cached["from_cache"] = True
            return JSONResponse(content={"success": True, "data": cached})

    start_date = "1990-01-01"
    end_date   = datetime.now().strftime("%Y-%m-%d")

    def _query():
        result = {}
        for idx in _CN_INDICES:
            rs = bs.query_history_k_data_plus(
                idx["code"], "date,close",
                start_date=start_date, end_date=end_date,
                frequency="m", adjustflag="3",
            )
            labels, values = [], []
            while rs.error_code == "0" and rs.next():
                row = rs.get_row_data()
                date_str, close_str = row[0], row[1]
                if date_str and close_str and close_str != "":
                    try:
                        labels.append(date_str)
                        values.append(round(float(close_str), 2))
                    except (ValueError, TypeError):
                        pass
            result[idx["key"]] = {"labels": labels, "values": values, "name": idx["name"]}
        return result

    try:
        indices = await run_bs(_query)
        if indices is None:
            raise HTTPException(status_code=503, detail="BaoStock 登录失败，请稍后重试")

        result = {**indices, "cached_at": datetime.now().isoformat(), "from_cache": False}
        _write_cn_cache(result)
        return JSONResponse(content={"success": True, "data": result})

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("获取A股指数历史失败")
        stale = _read_cn_cache()
        if stale:
            stale["from_cache"] = True
            stale["cache_expired"] = True
            return JSONResponse(content={"success": True, "data": stale})
        raise HTTPException(status_code=500, detail=f"获取A股指数历史数据失败: {str(e)}")


@router.get("/{indicator_key}", summary="获取单个指标")
async def get_indicator(
    indicator_key: str,
    force_refresh: bool = Query(False, description="强制刷新（忽略缓存）")
):
    """
    获取指定指标的详细数据。
    
    可用的指标key：
    - a_share_pe: A股平均市盈率
    - csi300_pe_pb: 沪深300指数PE/PB
    - csi500_pe_pb: 中证500指数PE/PB
    - stock_bond_ratio: 股债收益率之比
    - buffett_index: 巴菲特指标
    - hsi_pe: 恒生指数市盈率
    - shibor: Shibor利率
    - cn_10y_bond: 10年期国债收益率
    - m1_m2: M1/M2增速
    - m2_gdp: M2与GDP比值
    - financing_balance: 融资余额
    - cpi: CPI消费者物价指数
    - ppi: PPI生产者物价指数
    - bdi: BDI波罗的海指数
    - us_treasury: 美债收益率
    """
    if indicator_key not in INDICATORS_CONFIG:
        raise HTTPException(
            status_code=404,
            detail=f"未知的指标: {indicator_key}。可用指标: {list(INDICATORS_CONFIG.keys())}"
        )
    
    try:
        result = await async_scrape_indicator(indicator_key, force_refresh)
        
        if "error" in result:
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": result["error"]}
            )
        
        return JSONResponse(content={
            "success": True,
            "data": result,
        })
    except Exception as e:
        logger.exception(f"Failed to get indicator {indicator_key}")
        raise HTTPException(status_code=500, detail=f"获取指标数据失败: {str(e)}")


@router.post("/refresh", summary="强制刷新所有指标")
async def refresh_all_indicators():
    """
    强制刷新所有指标数据（忽略缓存）。
    
    注意：这会对数据源发起多个HTTP请求，请勿频繁调用。
    """
    try:
        result = await async_scrape_all_indicators(force_refresh=True)
        
        success_count = sum(1 for v in result.values() if "error" not in v)
        error_count = len(result) - success_count
        
        return JSONResponse(content={
            "success": True,
            "message": f"刷新完成: {success_count} 成功, {error_count} 失败",
            "success_count": success_count,
            "error_count": error_count,
            "errors": {k: v.get("error") for k, v in result.items() if "error" in v},
        })
    except Exception as e:
        logger.exception("Failed to refresh all indicators")
        raise HTTPException(status_code=500, detail=f"刷新失败: {str(e)}")


@router.post("/{indicator_key}/refresh", summary="强制刷新单个指标")
async def refresh_indicator(indicator_key: str):
    """
    强制刷新指定指标数据（忽略缓存）。
    """
    if indicator_key not in INDICATORS_CONFIG:
        raise HTTPException(
            status_code=404,
            detail=f"未知的指标: {indicator_key}"
        )
    
    try:
        result = await async_scrape_indicator(indicator_key, force_refresh=True)
        
        if "error" in result:
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": result["error"]}
            )
        
        return JSONResponse(content={
            "success": True,
            "message": f"指标 {indicator_key} 刷新成功",
            "data": result,
        })
    except Exception as e:
        logger.exception(f"Failed to refresh indicator {indicator_key}")
        raise HTTPException(status_code=500, detail=f"刷新失败: {str(e)}")


@router.delete("/cache", summary="清除所有指标缓存")
async def clear_all_cache():
    """
    清除所有指标的本地缓存。
    
    下次获取数据时将从源站重新爬取。
    """
    try:
        results = clear_cache()
        cleared_count = sum(1 for v in results.values() if v)
        
        return JSONResponse(content={
            "success": True,
            "message": f"已清除 {cleared_count} 个缓存文件",
            "details": results,
        })
    except Exception as e:
        logger.exception("Failed to clear cache")
        raise HTTPException(status_code=500, detail=f"清除缓存失败: {str(e)}")


@router.delete("/{indicator_key}/cache", summary="清除单个指标缓存")
async def clear_indicator_cache(indicator_key: str):
    """
    清除指定指标的本地缓存。
    """
    if indicator_key not in INDICATORS_CONFIG:
        raise HTTPException(
            status_code=404,
            detail=f"未知的指标: {indicator_key}"
        )
    
    try:
        results = clear_cache(indicator_key)
        
        return JSONResponse(content={
            "success": True,
            "message": f"指标 {indicator_key} 缓存已清除" if results.get(indicator_key) else f"指标 {indicator_key} 无缓存",
            "cleared": results.get(indicator_key, False),
        })
    except Exception as e:
        logger.exception(f"Failed to clear cache for {indicator_key}")
        raise HTTPException(status_code=500, detail=f"清除缓存失败: {str(e)}")