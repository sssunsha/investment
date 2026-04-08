import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// ─────────────────────────────────────────────
// 原有模型
// ─────────────────────────────────────────────
export interface EtfData {
  name: string;
  code: string;
  latest_close: number;
  ma20: number;
  ma60: number;
  ma60_is_rising: boolean;
  return_20d: number;
}

export interface StrategyResult {
  ranking: EtfData[];
  to_buy: EtfData[];
  last_updated: string;
  error?: string;
}

export interface IndexQuote {
  name: string;
  code: string;
  price: number;
  change: number;
  changePct: number;
}

export interface MarketIndicesResult {
  indices: IndexQuote[];
  last_updated: string;
  error?: string;
}

// ─────────────────────────────────────────────
// 历史行情
// ─────────────────────────────────────────────
export interface KDataRow {
  [field: string]: string;
}

export interface HistoryKDataResult {
  code: string;
  fields: string[];
  frequency: string;
  adjustflag: string;
  start_date: string;
  end_date: string;
  data: KDataRow[];
  total: number;
  error?: string;
}

// ─────────────────────────────────────────────
// 板块 / 指数成分股
// ─────────────────────────────────────────────
export interface StockIndustry {
  updateDate: string;
  code: string;
  code_name: string;
  industry: string;
  industryClassification: string;
}

export interface SectorStocksResult {
  data: { updateDate: string; code: string; code_name: string }[];
  total: number;
  error?: string;
}

export interface StockIndustryResult {
  data: StockIndustry[];
  total: number;
  error?: string;
}

// ─────────────────────────────────────────────
// 季频财务指标
// ─────────────────────────────────────────────
export interface FinancialRow {
  [field: string]: string;
}

export interface FinancialResult {
  code: string;
  year: number;
  quarter: number;
  data: FinancialRow[];
  error?: string;
}

export interface DividendResult {
  code: string;
  year: string;
  yearType: string;
  data: FinancialRow[];
  error?: string;
}

export interface AdjustFactorResult {
  code: string;
  start_date: string;
  end_date: string;
  data: FinancialRow[];
  error?: string;
}

// ─────────────────────────────────────────────
// 公司业绩报告
// ─────────────────────────────────────────────
export interface CorpReportResult {
  code: string;
  start_date: string;
  end_date: string;
  data: FinancialRow[];
  total: number;
  error?: string;
}

// ─────────────────────────────────────────────
// 证券基础数据
// ─────────────────────────────────────────────
export interface TradeDateRow {
  calendar_date: string;
  is_trading_day: string;
}

export interface TradeDatesResult {
  start_date: string;
  end_date: string;
  data: TradeDateRow[];
  total: number;
  trading_days_count: number;
  error?: string;
}

export interface StockBasicRow {
  code: string;
  code_name: string;
  ipoDate: string;
  outDate: string;
  type: string;
  status: string;
}

export interface StockBasicResult {
  data: StockBasicRow[];
  total: number;
  error?: string;
}

export interface AllStockRow {
  code: string;
  tradeStatus: string;
  code_name: string;
}

export interface AllStockResult {
  day: string;
  data: AllStockRow[];
  total: number;
  error?: string;
}

// ─────────────────────────────────────────────
// 宏观经济
// ─────────────────────────────────────────────
export interface MacroRow {
  [field: string]: string;
}

export interface MacroResult {
  start_date: string;
  end_date: string;
  data: MacroRow[];
  total: number;
  error?: string;
}

// ─────────────────────────────────────────────
// 会话管理
// ─────────────────────────────────────────────
export interface SessionStatus {
  logged_in: boolean;
  idle_seconds: number | null;
  idle_timeout: number;
  heartbeat_interval: number;
}

export interface SessionConfig {
  heartbeat_interval: number;
  idle_timeout: number;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly backendUrl = 'http://localhost:9001';

  constructor(private http: HttpClient) {}

  // ── 原有策略接口 ──────────────────────────
  getStrategyData(): Observable<StrategyResult> {
    return this.http.get<StrategyResult>(`${this.backendUrl}/api/strategy-data`);
  }

  getMarketIndices(): Observable<MarketIndicesResult> {
    return this.http.get<MarketIndicesResult>(`${this.backendUrl}/api/market-indices`);
  }

  // ── 历史行情 ──────────────────────────────
  queryHistoryKData(params: {
    code: string;
    fields?: string;
    start_date?: string;
    end_date?: string;
    frequency?: string;
    adjustflag?: string;
  }): Observable<HistoryKDataResult> {
    let p = new HttpParams().set('code', params.code);
    if (params.fields) p = p.set('fields', params.fields);
    if (params.start_date) p = p.set('start_date', params.start_date);
    if (params.end_date) p = p.set('end_date', params.end_date);
    if (params.frequency) p = p.set('frequency', params.frequency);
    if (params.adjustflag) p = p.set('adjustflag', params.adjustflag);
    return this.http.get<HistoryKDataResult>(
      `${this.backendUrl}/api/security/history/query_history_k_data_plus`,
      { params: p }
    );
  }

  // ── 板块 / 指数成分股 ─────────────────────
  queryStockIndustry(code?: string, date?: string): Observable<StockIndustryResult> {
    let p = new HttpParams();
    if (code) p = p.set('code', code);
    if (date) p = p.set('date', date);
    return this.http.get<StockIndustryResult>(
      `${this.backendUrl}/api/security/sector/query_stock_industry`, { params: p }
    );
  }

  queryHs300Stocks(date?: string): Observable<SectorStocksResult> {
    let p = new HttpParams();
    if (date) p = p.set('date', date);
    return this.http.get<SectorStocksResult>(
      `${this.backendUrl}/api/security/sector/query_hs300_stocks`, { params: p }
    );
  }

  querySz50Stocks(date?: string): Observable<SectorStocksResult> {
    let p = new HttpParams();
    if (date) p = p.set('date', date);
    return this.http.get<SectorStocksResult>(
      `${this.backendUrl}/api/security/sector/query_sz50_stocks`, { params: p }
    );
  }

  queryZz500Stocks(date?: string): Observable<SectorStocksResult> {
    let p = new HttpParams();
    if (date) p = p.set('date', date);
    return this.http.get<SectorStocksResult>(
      `${this.backendUrl}/api/security/sector/query_zz500_stocks`, { params: p }
    );
  }

  // ── 季频财务指标 ──────────────────────────
  queryProfitData(code: string, year: number, quarter: number): Observable<FinancialResult> {
    return this.http.get<FinancialResult>(
      `${this.backendUrl}/api/evaluation/query_profit_data`,
      { params: new HttpParams().set('code', code).set('year', year).set('quarter', quarter) }
    );
  }

  queryOperationData(code: string, year: number, quarter: number): Observable<FinancialResult> {
    return this.http.get<FinancialResult>(
      `${this.backendUrl}/api/evaluation/query_operation_data`,
      { params: new HttpParams().set('code', code).set('year', year).set('quarter', quarter) }
    );
  }

  queryGrowthData(code: string, year: number, quarter: number): Observable<FinancialResult> {
    return this.http.get<FinancialResult>(
      `${this.backendUrl}/api/evaluation/query_growth_data`,
      { params: new HttpParams().set('code', code).set('year', year).set('quarter', quarter) }
    );
  }

  queryBalanceData(code: string, year: number, quarter: number): Observable<FinancialResult> {
    return this.http.get<FinancialResult>(
      `${this.backendUrl}/api/evaluation/query_balance_data`,
      { params: new HttpParams().set('code', code).set('year', year).set('quarter', quarter) }
    );
  }

  queryCashFlowData(code: string, year: number, quarter: number): Observable<FinancialResult> {
    return this.http.get<FinancialResult>(
      `${this.backendUrl}/api/evaluation/query_cash_flow_data`,
      { params: new HttpParams().set('code', code).set('year', year).set('quarter', quarter) }
    );
  }

  queryDupontData(code: string, year: number, quarter: number): Observable<FinancialResult> {
    return this.http.get<FinancialResult>(
      `${this.backendUrl}/api/evaluation/query_dupont_data`,
      { params: new HttpParams().set('code', code).set('year', year).set('quarter', quarter) }
    );
  }

  queryDividendData(code: string, year: string, yearType: string = 'report'): Observable<DividendResult> {
    return this.http.get<DividendResult>(
      `${this.backendUrl}/api/evaluation/query_dividend_data`,
      { params: new HttpParams().set('code', code).set('year', year).set('yearType', yearType) }
    );
  }

  queryAdjustFactor(code: string, start_date?: string, end_date?: string): Observable<AdjustFactorResult> {
    let p = new HttpParams().set('code', code);
    if (start_date) p = p.set('start_date', start_date);
    if (end_date) p = p.set('end_date', end_date);
    return this.http.get<AdjustFactorResult>(
      `${this.backendUrl}/api/evaluation/query_adjust_factor`, { params: p }
    );
  }

  // ── 公司业绩报告 ──────────────────────────
  queryPerformanceExpressReport(code: string, start_date?: string, end_date?: string): Observable<CorpReportResult> {
    let p = new HttpParams().set('code', code);
    if (start_date) p = p.set('start_date', start_date);
    if (end_date) p = p.set('end_date', end_date);
    return this.http.get<CorpReportResult>(
      `${this.backendUrl}/api/corpreport/query_performance_express_report`, { params: p }
    );
  }

  queryForecastReport(code: string, start_date?: string, end_date?: string): Observable<CorpReportResult> {
    let p = new HttpParams().set('code', code);
    if (start_date) p = p.set('start_date', start_date);
    if (end_date) p = p.set('end_date', end_date);
    return this.http.get<CorpReportResult>(
      `${this.backendUrl}/api/corpreport/query_forecast_report`, { params: p }
    );
  }

  // ── 证券基础数据 ──────────────────────────
  queryTradeDates(start_date?: string, end_date?: string): Observable<TradeDatesResult> {
    let p = new HttpParams();
    if (start_date) p = p.set('start_date', start_date);
    if (end_date) p = p.set('end_date', end_date);
    return this.http.get<TradeDatesResult>(
      `${this.backendUrl}/api/metadata/query_trade_dates`, { params: p }
    );
  }

  queryAllStock(day?: string): Observable<AllStockResult> {
    let p = new HttpParams();
    if (day) p = p.set('day', day);
    return this.http.get<AllStockResult>(
      `${this.backendUrl}/api/metadata/query_all_stock`, { params: p }
    );
  }

  queryStockBasic(code?: string, code_name?: string): Observable<StockBasicResult> {
    let p = new HttpParams();
    if (code) p = p.set('code', code);
    if (code_name) p = p.set('code_name', code_name);
    return this.http.get<StockBasicResult>(
      `${this.backendUrl}/api/metadata/query_stock_basic`, { params: p }
    );
  }

  // ── 宏观经济 ──────────────────────────────
  queryDepositRateData(start_date?: string, end_date?: string): Observable<MacroResult> {
    let p = new HttpParams();
    if (start_date) p = p.set('start_date', start_date);
    if (end_date) p = p.set('end_date', end_date);
    return this.http.get<MacroResult>(
      `${this.backendUrl}/api/macroscopic/query_deposit_rate_data`, { params: p }
    );
  }

  queryLoanRateData(start_date?: string, end_date?: string): Observable<MacroResult> {
    let p = new HttpParams();
    if (start_date) p = p.set('start_date', start_date);
    if (end_date) p = p.set('end_date', end_date);
    return this.http.get<MacroResult>(
      `${this.backendUrl}/api/macroscopic/query_loan_rate_data`, { params: p }
    );
  }

  queryRequiredReserveRatio(start_date?: string, end_date?: string): Observable<MacroResult> {
    let p = new HttpParams();
    if (start_date) p = p.set('start_date', start_date);
    if (end_date) p = p.set('end_date', end_date);
    return this.http.get<MacroResult>(
      `${this.backendUrl}/api/macroscopic/query_required_reserve_ratio_data`, { params: p }
    );
  }

  queryMoneySupplyMonth(start_date?: string, end_date?: string): Observable<MacroResult> {
    let p = new HttpParams();
    if (start_date) p = p.set('start_date', start_date);
    if (end_date) p = p.set('end_date', end_date);
    return this.http.get<MacroResult>(
      `${this.backendUrl}/api/macroscopic/query_money_supply_data_month`, { params: p }
    );
  }

  queryMoneySupplyYear(start_date?: string, end_date?: string): Observable<MacroResult> {
    let p = new HttpParams();
    if (start_date) p = p.set('start_date', start_date);
    if (end_date) p = p.set('end_date', end_date);
    return this.http.get<MacroResult>(
      `${this.backendUrl}/api/macroscopic/query_money_supply_data_year`, { params: p }
    );
  }

  // ── 会话管理 ──────────────────────────────────

  sessionLogin(): Observable<{ status: string; message?: string }> {
    return this.http.post<{ status: string; message?: string }>(`${this.backendUrl}/api/session/login`, {});
  }

  sessionLogout(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.backendUrl}/api/session/logout`, {});
  }

  sessionStatus(): Observable<SessionStatus> {
    return this.http.get<SessionStatus>(`${this.backendUrl}/api/session/status`);
  }

  updateSessionConfig(config: Partial<SessionConfig>): Observable<SessionConfig> {
    return this.http.patch<SessionConfig>(`${this.backendUrl}/api/session/config`, config);
  }
}
