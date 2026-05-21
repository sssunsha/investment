#!/usr/bin/env python3
"""
Test script for enhanced fund NAV service
增强基金净值服务测试脚本
"""
import sys
import logging
from services.fund_nav_enhanced import FundNavEnhanced

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

def test_fund(fund_code: str):
    """Test a single fund"""
    print(f"\n{'='*60}")
    print(f"Testing fund: {fund_code}")
    print(f"{'='*60}")
    
    # Test NAV retrieval
    print("\n1. Testing NAV retrieval...")
    nav_data = FundNavEnhanced.get_fund_nav(fund_code)
    
    if nav_data:
        print("✓ SUCCESS - NAV data retrieved")
        print(f"  Fund Code: {nav_data['fund_code']}")
        print(f"  NAV: {nav_data['nav']}")
        print(f"  NAV Date: {nav_data['nav_date']}")
        print(f"  Accumulated NAV: {nav_data.get('accumulated_nav', 'N/A')}")
        print(f"  Data Source: {nav_data.get('source', 'unknown')}")
        if 'fund_name' in nav_data:
            print(f"  Fund Name: {nav_data['fund_name']}")
    else:
        print("✗ FAILED - No NAV data available")
    
    # Test fund status
    print("\n2. Testing fund status check...")
    fund_info = FundNavEnhanced.get_fund_info(fund_code)
    
    if fund_info:
        print("✓ SUCCESS - Fund info retrieved")
        print(f"  Status: {fund_info.get('status', 'unknown')}")
        print(f"  Message: {fund_info.get('message', 'N/A')}")
    else:
        print("✗ FAILED - Could not retrieve fund info")
    
    return nav_data, fund_info

def main():
    """Main test function"""
    print("Enhanced Fund NAV Service Test")
    print("增强基金净值服务测试")
    
    # Test the problematic funds
    problematic_funds = ['160216', '165513']
    
    # Test some working funds for comparison
    working_funds = ['510300', '518880', '511010']
    
    print("\n" + "="*60)
    print("Testing Problematic Funds (有问题的基金)")
    print("="*60)
    
    results = {}
    for fund_code in problematic_funds:
        nav_data, fund_info = test_fund(fund_code)
        results[fund_code] = {
            'nav_available': nav_data is not None,
            'status': fund_info.get('status') if fund_info else 'unknown'
        }
    
    print("\n" + "="*60)
    print("Testing Working Funds for Comparison (对比正常基金)")
    print("="*60)
    
    for fund_code in working_funds:
        nav_data, fund_info = test_fund(fund_code)
        results[fund_code] = {
            'nav_available': nav_data is not None,
            'status': fund_info.get('status') if fund_info else 'unknown'
        }
    
    # Summary
    print("\n" + "="*60)
    print("Test Summary (测试总结)")
    print("="*60)
    
    for fund_code, result in results.items():
        status_icon = "✓" if result['nav_available'] else "✗"
        print(f"{status_icon} {fund_code}: NAV {'Available' if result['nav_available'] else 'Unavailable'}, Status: {result['status']}")
    
    # Recommendations
    print("\n" + "="*60)
    print("Recommendations (建议)")
    print("="*60)
    
    if not results['160216']['nav_available']:
        print("\n160216 (国泰大宗商品QDII-LOF):")
        print("  - 建议替代基金: 159980 (有色金属ETF), 159985 (豆粕ETF)")
        print("  - Alternative funds: 159980 (Metal ETF), 159985 (Soybean ETF)")
    
    if not results['165513']['nav_available']:
        print("\n165513 (中信保诚主题QDII-FOF-LOF):")
        print("  - 建议替代基金: 270042 (广发纳斯达克100), 000369 (广发全球医疗)")
        print("  - Alternative funds: 270042 (GF NASDAQ100), 000369 (GF Global Healthcare)")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nTest failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)