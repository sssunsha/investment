import baostock as bs
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta

app = FastAPI()

# Allow CORS for your Angular app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://localhost:9000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_etf_data(etf_code, start_date, end_date):
    """
    Fetches historical K-line data for a single ETF.
    """
    rs = bs.query_history_k_data_plus(
        etf_code,
        "date,close",
        start_date=start_date,
        end_date=end_date,
        frequency="d",
        adjustflag="2"  # Use backward adjusted prices
    )
    if rs.error_code != '0':
        print(f"Error fetching data for {etf_code}: {rs.error_msg}")
        return pd.DataFrame()

    data_list = []
    while (rs.error_code == '0') & rs.next():
        data_list.append(rs.get_row_data())

    df = pd.DataFrame(data_list, columns=rs.fields)
    if not df.empty:
        df['date'] = pd.to_datetime(df['date'])
        df['close'] = df['close'].astype(float)
    return df

def get_index_quote(index_code: str, name: str) -> dict:
    """
    Fetches the latest quote (price, change, changePct) for a market index.
    Requires baostock to be logged in before calling.
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=10)
    rs = bs.query_history_k_data_plus(
        index_code,
        "date,close,preclose",
        start_date=start_date.strftime('%Y-%m-%d'),
        end_date=end_date.strftime('%Y-%m-%d'),
        frequency="d",
    )
    rows = []
    while rs.error_code == '0' and rs.next():
        rows.append(rs.get_row_data())

    if len(rows) < 2:
        return {"name": name, "code": index_code, "price": 0, "change": 0, "changePct": 0}

    latest = rows[-1]
    price = float(latest[1])
    preclose = float(latest[2])
    change = round(price - preclose, 2)
    change_pct = round((price - preclose) / preclose, 6) if preclose else 0

    return {
        "name": name,
        "code": index_code,
        "price": round(price, 2),
        "change": change,
        "changePct": change_pct,
    }

@app.get("/api/market-indices")
def get_market_indices():
    """
    Returns the latest quotes for the major A-share market indices.
    """
    lg = bs.login()
    if lg.error_code != '0':
        return {"error": f"Baostock login failed: {lg.error_msg}"}

    try:
        indices = [
            ("sh.000001", "上证指数"),
            ("sz.399001", "深证成指"),
            ("sh.000300", "沪深300"),
            ("sz.399006", "创业板指"),
            ("sh.000688", "科创50"),
        ]
        result = [get_index_quote(code, name) for code, name in indices]
        return {"indices": result, "last_updated": datetime.now().isoformat()}
    finally:
        bs.logout()

@app.get("/api/strategy-data")
def get_strategy_data():
    """
    Executes the ETF rotation strategy and returns the results.
    """
    lg = bs.login()
    if lg.error_code != '0':
        return {"error": f"Baostock login failed: {lg.error_msg}"}

    try:
        etf_pool = {
            "510300": "sh.510300",  # 沪深300
            "510500": "sh.510500",  # 中证500
            "159915": "sz.159915",  # 创业板
            "159352": "sz.159352",  # 中证A50
            "512480": "sh.512480",  # 半导体
            "159929": "sz.159929",  # 医药
            "512800": "sh.512800",  # 银行
            "518880": "sh.518880",  # 黄金
        }

        end_date = datetime.now()
        start_date = end_date - timedelta(days=100) # Fetch enough data for MA60

        end_date_str = end_date.strftime('%Y-%m-%d')
        start_date_str = start_date.strftime('%Y-%m-%d')

        strategy_results = []

        for name, code in etf_pool.items():
            df = get_etf_data(code, start_date_str, end_date_str)
            if df.empty or len(df) < 60:
                continue

            # Calculate indicators
            df['ma20'] = df['close'].rolling(window=20).mean()
            df['ma60'] = df['close'].rolling(window=60).mean()
            df['return_20d'] = (df['close'] / df['close'].shift(20)) - 1

            latest = df.iloc[-1]
            previous = df.iloc[-2]

            strategy_results.append({
                "name": name,
                "code": code,
                "latest_close": latest['close'],
                "ma20": latest['ma20'],
                "ma60": latest['ma60'],
                "ma60_is_rising": latest['ma60'] > previous['ma60'],
                "return_20d": latest['return_20d'],
            })

        # Sort by 20-day return
        ranked_results = sorted(
            [r for r in strategy_results if r['return_20d'] is not None],
            key=lambda x: x['return_20d'],
            reverse=True
        )

        # Apply buy/sell logic
        top_2 = ranked_results[:2]
        to_buy = []
        for etf in top_2:
            # Buy condition: price > MA20 and MA60 is rising
            if etf['latest_close'] > etf['ma20'] and etf['ma60_is_rising']:
                to_buy.append(etf)

        return {
            "ranking": ranked_results,
            "to_buy": to_buy,
            "last_updated": end_date.isoformat()
        }

    finally:
        bs.logout()
