# tests/test_by_market.py
from services.scraper import build_by_market

def _make_ind(key, market, layer):
    return {"key": key, "market": market, "layer": layer, "name": key}

def test_cn_indicator_grouped_by_layer():
    results = {"cpi": _make_ind("cpi", "cn", "macro")}
    out = build_by_market(results)
    assert any(i["key"] == "cpi" for i in out["cn"]["macro"])

def test_us_indicator_grouped_by_layer():
    results = {"us_cpi": _make_ind("us_cpi", "us", "macro")}
    out = build_by_market(results)
    assert any(i["key"] == "us_cpi" for i in out["us"]["macro"])

def test_global_indicator_in_global_list():
    results = {"bdi": _make_ind("bdi", "global", "global_indicator")}
    out = build_by_market(results)
    assert any(i["key"] == "bdi" for i in out["global"])

def test_error_indicator_excluded():
    results = {"bad": {"key": "bad", "error": "failed"}}
    out = build_by_market(results)
    assert out["cn"]["macro"] == []
    assert out["global"] == []

def test_by_market_structure_has_all_keys():
    out = build_by_market({})
    assert set(out.keys()) == {"cn", "us", "global"}
    for market in ("cn", "us"):
        assert set(out[market].keys()) == {"macro", "liquidity", "valuation"}
