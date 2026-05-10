#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test the M1/M2 parser logic"""

import sys
sys.path.insert(0, '/Users/I340818/workspace/personal/workspace/investment')

import pytest
from services.parsers.liquidity import _parse_m1_m2
from services.scraper import _fetch_html

@pytest.mark.skip(reason="integration test, makes real HTTP requests")
def test_m1m2_parser():
    print("Fetching HTML from value500.com...")
    html = _fetch_html("http://value500.com/M1.asp")
    
    if not html:
        print("❌ Failed to fetch HTML")
        return
    
    print("✅ HTML fetched successfully")
    print(f"HTML length: {len(html)}")
    
    # Test the parser
    print("\n📊 Parsing with _parse_m1_m2()...")
    result = _parse_m1_m2(html)
    
    print(f"\n✅ Result:")
    print(f"  Date: {result.get('date')}")
    print(f"  M1增速: {result.get('values', {}).get('m1_growth')}%")
    print(f"  M2增速: {result.get('values', {}).get('m2_growth')}%")
    print(f"  M1-M2: {result.get('values', {}).get('m1_m2_diff')}%")
    
    # Expected values from screenshot
    print(f"\n📋 Expected (from screenshot):")
    print(f"  Date: 2026-02")
    print(f"  M1增速: 5.9%")
    print(f"  M2增速: 9%")
    print(f"  M1-M2: -3.1%")

if __name__ == "__main__":
    test_m1m2_parser()