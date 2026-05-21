"""
Enhanced Strategy Router with Better Error Handling
增强的策略路由器，支持更好的错误处理
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime

from services.fund_nav_enhanced import FundNavEnhanced

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/strategy/aw/funds/enhanced")
async def get_aw_funds_enhanced() -> Dict[str, Any]:
    """
    Get All Weather strategy fund data with enhanced error handling
    获取全天候策略基金数据（增强版）
    
    Returns:
        Dictionary containing fund data with detailed status information
    """
    
    # All Weather strategy fund codes
    fund_codes = {
        'stock': ['510300', '518880'],  # 沪深300ETF, 黄金ETF
        'bond': ['511010'],              # 国债ETF
        'commodity': ['160216'],         # 国泰大宗商品
        'gold': ['518880'],              # 黄金ETF
        'reits': ['508000'],             # 180REIT
        'overseas': ['165513']           # 中信保诚主题
    }
    
    result = {
        'success': True,
        'data': {},
        'errors': [],
        'warnings': [],
        'timestamp': datetime.now().isoformat()
    }
    
    for category, codes in fund_codes.items():
        result['data'][category] = []
        
        for fund_code in codes:
            try:
                # Try enhanced service first
                nav_data = FundNavEnhanced.get_fund_nav(fund_code)
                
                if nav_data:
                    result['data'][category].append({
                        'fund_code': fund_code,
                        'nav': nav_data['nav'],
                        'nav_date': nav_data['nav_date'],
                        'accumulated_nav': nav_data.get('accumulated_nav', nav_data['nav']),
                        'source': nav_data.get('source', 'unknown'),
                        'status': 'success'
                    })
                else:
                    # Check fund status
                    fund_info = FundNavEnhanced.get_fund_info(fund_code)
                    
                    error_info = {
                        'fund_code': fund_code,
                        'status': 'failed',
                        'error': '数据不可用',
                        'fund_status': fund_info.get('status') if fund_info else 'unknown',
                        'message': fund_info.get('message') if fund_info else '无法获取基金信息'
                    }
                    
                    result['data'][category].append(error_info)
                    result['errors'].append(error_info)
                    
                    if fund_info and fund_info.get('status') == 'suspended':
                        result['warnings'].append(f"基金 {fund_code} 已暂停交易或清盘")
                    
            except Exception as e:
                logger.error(f"Error getting data for fund {fund_code}: {e}")
                error_info = {
                    'fund_code': fund_code,
                    'status': 'error',
                    'error': str(e)
                }
                result['data'][category].append(error_info)
                result['errors'].append(error_info)
    
    # Set success flag based on errors
    result['success'] = len(result['errors']) == 0
    
    return result


@router.get("/api/fund/{fund_code}/nav/enhanced")
async def get_fund_nav_enhanced(fund_code: str) -> Dict[str, Any]:
    """
    Get fund NAV with enhanced error handling
    获取基金净值（增强版）
    
    Args:
        fund_code: Fund code (6-digit)
        
    Returns:
        Dictionary containing NAV data or error information
    """
    try:
        # Try enhanced service
        nav_data = FundNavEnhanced.get_fund_nav(fund_code)
        
        if nav_data:
            return {
                'success': True,
                'data': nav_data,
                'timestamp': datetime.now().isoformat()
            }
        
        # Check fund status if data not available
        fund_info = FundNavEnhanced.get_fund_info(fund_code)
        
        return {
            'success': False,
            'error': '数据不可用',
            'fund_code': fund_code,
            'fund_status': fund_info.get('status') if fund_info else 'unknown',
            'message': fund_info.get('message') if fund_info else '无法获取基金信息',
            'timestamp': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting NAV for fund {fund_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/fund/{fund_code}/status")
async def get_fund_status(fund_code: str) -> Dict[str, Any]:
    """
    Check fund status (active, suspended, liquidated, etc.)
    检查基金状态（正常、暂停、清盘等）
    
    Args:
        fund_code: Fund code (6-digit)
        
    Returns:
        Dictionary containing fund status information
    """
    try:
        fund_info = FundNavEnhanced.get_fund_info(fund_code)
        
        if fund_info:
            return {
                'success': True,
                'data': fund_info,
                'timestamp': datetime.now().isoformat()
            }
        
        return {
            'success': False,
            'error': '无法获取基金状态',
            'fund_code': fund_code,
            'timestamp': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error checking status for fund {fund_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))