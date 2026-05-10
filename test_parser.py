#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test the PE parser logic"""

import sys
import re
from bs4 import BeautifulSoup

# Add services to path
sys.path.insert(0, '/Users/I340818/workspace/personal/workspace/investment')

import pytest
from services.parsers.valuation import _parse_pe
from services.scraper import _fetch_html, _parse_date, _parse_float

@pytest.mark.skip(reason="integration test, makes real HTTP requests")
def test_pe_parser():
    print("Fetching HTML from value500.com...")
    html = _fetch_html("http://value500.com/PE.asp")
    
    if not html:
        print("❌ Failed to fetch HTML")
        return
    
    print("✅ HTML fetched successfully")
    print(f"HTML length: {len(html)}")
    
    # Test the parser
    print("\n Parsing with _parse_pe()...")
    result = _parse_pe(html)
    
    print(f"\nResult:")
    print(f"  Date: {result.get('date')}")
    print(f"  Values: {result.get('values')}")
    
    # Also check what tables we find
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table', border="1")
    print(f"\nFound {len(tables)} tables with border='1'")
    
    if len(tables) >= 1:
        first_table = tables[0]
        rows = first_table.find_all('tr')
        print(f"First table has {len(rows)} rows:")
        for i, row in enumerate(rows):
            cells = row.find_all('td')
            print(f"  Row {i}: {[c.get_text(strip=True) for c in cells]}")

if __name__ == "__main__":
    test_pe_parser()