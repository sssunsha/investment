# tests/test_market_fields.py
from services.scraper import INDICATORS_CONFIG

VALID_MARKETS = {"cn", "us", "global"}
VALID_LAYERS  = {"macro", "liquidity", "valuation", "global_indicator"}

def test_all_indicators_have_market_field():
    for key, config in INDICATORS_CONFIG.items():
        assert "market" in config, f"{key} 缺少 market 字段"
        assert config["market"] in VALID_MARKETS, f"{key} market 值无效: {config['market']}"

def test_all_indicators_have_layer_field():
    for key, config in INDICATORS_CONFIG.items():
        assert "layer" in config, f"{key} 缺少 layer 字段"
        assert config["layer"] in VALID_LAYERS, f"{key} layer 值无效: {config['layer']}"
