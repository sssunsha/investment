# tests/test_signals_us.py
import pytest
from unittest.mock import patch
from services.scraper import calculate_signals

def test_vix_fear_signal_triggers_above_30():
    mock_indicators = {
        "vix": {"values": {"vix": 35.0}, "status": "high"},
    }
    with patch("services.scraper.scrape_all_indicators", return_value=mock_indicators):
        result = calculate_signals()
    assert result["buy_signals"].get("vix_fear") is True

def test_vix_fear_signal_off_below_30():
    mock_indicators = {
        "vix": {"values": {"vix": 18.0}, "status": "normal"},
    }
    with patch("services.scraper.scrape_all_indicators", return_value=mock_indicators):
        result = calculate_signals()
    assert result["buy_signals"].get("vix_fear") is False

def test_us_cpi_high_signal_triggers_on_high_status():
    mock_indicators = {
        "us_cpi": {"values": {"cpi_index": 315.0}, "status": "high"},
    }
    with patch("services.scraper.scrape_all_indicators", return_value=mock_indicators):
        result = calculate_signals()
    assert result["sell_signals"].get("us_cpi_high") is True

def test_us_cpi_high_signal_off_on_normal_status():
    mock_indicators = {
        "us_cpi": {"values": {"cpi_index": 310.0}, "status": "normal"},
    }
    with patch("services.scraper.scrape_all_indicators", return_value=mock_indicators):
        result = calculate_signals()
    assert result["sell_signals"].get("us_cpi_high") is False
