# tests/test_fred_fetcher.py
from unittest.mock import patch, MagicMock
from services.fetchers.fred import fetch_fred_latest

MOCK_CSV = b"DATE,CPIAUCSL\n2024-01-01,310.00\n2024-02-01,311.50\n2024-03-01,.\n"

def _mock_get(url, **kwargs):
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.content = MOCK_CSV
    return resp

def test_returns_latest_non_null_value():
    with patch("services.fetchers.fred.SESSION.get", side_effect=_mock_get):
        result = fetch_fred_latest("CPIAUCSL")
    assert result["value"] == 311.50
    assert result["date"] == "2024-02-01"
    assert result["series_id"] == "CPIAUCSL"

def test_returns_none_on_http_error():
    with patch("services.fetchers.fred.SESSION.get", side_effect=Exception("timeout")):
        result = fetch_fred_latest("CPIAUCSL")
    assert result is None

def test_returns_none_on_all_null_values():
    null_csv = b"DATE,VALUE\n2024-01-01,.\n2024-02-01,.\n"
    mock = MagicMock()
    mock.raise_for_status = MagicMock()
    mock.content = null_csv
    with patch("services.fetchers.fred.SESSION.get", return_value=mock):
        result = fetch_fred_latest("FAKE")
    assert result is None
