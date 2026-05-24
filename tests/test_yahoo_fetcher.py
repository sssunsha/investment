# tests/test_yahoo_fetcher.py
from unittest.mock import patch, MagicMock
import pandas as pd
from services.fetchers.yahoo_finance import fetch_yahoo_latest

def _mock_history(period="5d"):
    dates = pd.to_datetime(["2024-05-20", "2024-05-21"])
    return pd.DataFrame({"Close": [2380.5, 2395.2]}, index=dates)

def test_returns_latest_close():
    mock_ticker = MagicMock()
    mock_ticker.history.side_effect = _mock_history
    with patch("services.fetchers.yahoo_finance.yf.Ticker", return_value=mock_ticker):
        result = fetch_yahoo_latest("GC=F")
    assert result["value"] == 2395.2
    assert result["date"] == "2024-05-21"
    assert result["ticker"] == "GC=F"

def test_returns_none_on_empty_history():
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = pd.DataFrame()
    with patch("services.fetchers.yahoo_finance.yf.Ticker", return_value=mock_ticker):
        result = fetch_yahoo_latest("BAD=F")
    assert result is None

def test_returns_none_on_exception():
    with patch("services.fetchers.yahoo_finance.yf.Ticker", side_effect=Exception("network")):
        result = fetch_yahoo_latest("GC=F")
    assert result is None
