"""
Enhanced Fund NAV Service with Multiple Data Sources
增强的基金净值服务，支持多数据源
"""
import requests
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class FundNavEnhanced:
    """
    Enhanced fund NAV service with fallback mechanisms
    增强的基金净值服务，支持降级机制
    """
    
    # Primary data source: TianTian Fund
    TIANTIAN_API = "https://fundgz.1234567.com.cn/js/{fund_code}.js"
    
    # Fallback source: East Money
    EASTMONEY_API = "http://fund.eastmoney.com/pingzhongdata/{fund_code}.js"
    
    # Fallback source: Sina Finance (for LOF funds)
    SINA_LOF_API = "https://hq.sinajs.cn/list=f_{fund_code}"
    
    @classmethod
    def get_fund_nav(cls, fund_code: str) -> Optional[Dict[str, Any]]:
        """
        Get fund NAV with multiple fallback sources
        获取基金净值，支持多数据源降级
        
        Args:
            fund_code: Fund code (6-digit)
            
        Returns:
            Dict containing NAV data or None if all sources fail
        """
        # Try primary source first
        nav_data = cls._try_tiantian(fund_code)
        if nav_data:
            logger.info(f"Fund {fund_code} data retrieved from TianTian")
            return nav_data
        
        # Try East Money as fallback
        nav_data = cls._try_eastmoney(fund_code)
        if nav_data:
            logger.info(f"Fund {fund_code} data retrieved from EastMoney")
            return nav_data
        
        # Try Sina for LOF funds
        nav_data = cls._try_sina_lof(fund_code)
        if nav_data:
            logger.info(f"Fund {fund_code} data retrieved from Sina (LOF)")
            return nav_data
        
        logger.warning(f"Fund {fund_code} data unavailable from all sources")
        return None
    
    @classmethod
    def _try_tiantian(cls, fund_code: str) -> Optional[Dict[str, Any]]:
        """Try TianTian Fund API"""
        try:
            url = cls.TIANTIAN_API.format(fund_code=fund_code)
            response = requests.get(url, timeout=5)
            
            if response.status_code != 200:
                return None
            
            # Parse JSONP response
            content = response.text
            if not content or "jsonpgz" not in content:
                return None
            
            # Extract JSON data
            import json
            json_str = content[content.find('(') + 1:content.rfind(')')]
            data = json.loads(json_str)
            
            return {
                'fund_code': fund_code,
                'nav': float(data.get('gsz', 0)),  # Estimated NAV
                'nav_date': data.get('gztime', ''),
                'accumulated_nav': float(data.get('gsz', 0)),
                'source': 'tiantian'
            }
        except Exception as e:
            logger.debug(f"TianTian source failed for {fund_code}: {e}")
            return None
    
    @classmethod
    def _try_eastmoney(cls, fund_code: str) -> Optional[Dict[str, Any]]:
        """Try East Money API"""
        try:
            url = cls.EASTMONEY_API.format(fund_code=fund_code)
            response = requests.get(url, timeout=5)
            
            if response.status_code != 200:
                return None
            
            content = response.text
            if not content:
                return None
            
            # Extract NAV data from JavaScript
            import re
            
            # Find NAV value
            nav_match = re.search(r'Data_netWorthTrend\s*=\s*\[(.*?)\];', content, re.DOTALL)
            if not nav_match:
                return None
            
            nav_data_str = nav_match.group(1)
            # Parse last entry
            entries = eval(f'[{nav_data_str}]')
            if not entries:
                return None
            
            last_entry = entries[-1]
            nav_date = datetime.fromtimestamp(last_entry['x'] / 1000).strftime('%Y-%m-%d')
            
            return {
                'fund_code': fund_code,
                'nav': float(last_entry['y']),
                'nav_date': nav_date,
                'accumulated_nav': float(last_entry.get('equityReturn', last_entry['y'])),
                'source': 'eastmoney'
            }
        except Exception as e:
            logger.debug(f"EastMoney source failed for {fund_code}: {e}")
            return None
    
    @classmethod
    def _try_sina_lof(cls, fund_code: str) -> Optional[Dict[str, Any]]:
        """
        Try Sina Finance API for LOF funds
        尝试使用新浪财经API获取LOF基金数据
        """
        try:
            url = cls.SINA_LOF_API.format(fund_code=fund_code)
            response = requests.get(url, timeout=5)
            
            if response.status_code != 200:
                return None
            
            content = response.text
            if not content or '""' in content:
                return None
            
            # Parse Sina response format
            # Format: var hq_str_f_160216="name,price,change,change_pct,volume,amount,...";
            import re
            match = re.search(r'"([^"]+)"', content)
            if not match:
                return None
            
            data_str = match.group(1)
            parts = data_str.split(',')
            
            if len(parts) < 3:
                return None
            
            fund_name = parts[0]
            current_price = parts[1]
            
            if not current_price or float(current_price) == 0:
                return None
            
            return {
                'fund_code': fund_code,
                'nav': float(current_price),
                'nav_date': datetime.now().strftime('%Y-%m-%d'),
                'accumulated_nav': float(current_price),
                'source': 'sina_lof',
                'fund_name': fund_name
            }
        except Exception as e:
            logger.debug(f"Sina LOF source failed for {fund_code}: {e}")
            return None
    
    @classmethod
    def get_fund_info(cls, fund_code: str) -> Optional[Dict[str, Any]]:
        """
        Get comprehensive fund information
        获取基金详细信息
        """
        try:
            # Try to get basic info from East Money
            url = f"http://fund.eastmoney.com/{fund_code}.html"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 404:
                return {
                    'fund_code': fund_code,
                    'status': 'not_found',
                    'message': '基金不存在或已清盘'
                }
            
            # Check if fund is suspended
            content = response.text
            if '暂停交易' in content or '终止' in content or '清盘' in content:
                return {
                    'fund_code': fund_code,
                    'status': 'suspended',
                    'message': '基金已暂停交易或清盘'
                }
            
            return {
                'fund_code': fund_code,
                'status': 'active',
                'message': '基金正常'
            }
        except Exception as e:
            logger.error(f"Failed to get fund info for {fund_code}: {e}")
            return None


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Test the problematic funds
    for fund_code in ['160216', '165513']:
        print(f"\n=== Testing fund {fund_code} ===")
        nav_data = FundNavEnhanced.get_fund_nav(fund_code)
        if nav_data:
            print(f"Success: {nav_data}")
        else:
            print(f"Failed to retrieve data")
        
        fund_info = FundNavEnhanced.get_fund_info(fund_code)
        if fund_info:
            print(f"Fund info: {fund_info}")