import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// --- Data Models for Type Safety ---

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

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private backendUrl = 'http://localhost:9001';

  constructor(private http: HttpClient) { }

  getStrategyData(): Observable<StrategyResult> {
    return this.http.get<StrategyResult>(`${this.backendUrl}/api/strategy-data`);
  }

  getMarketIndices(): Observable<MarketIndicesResult> {
    return this.http.get<MarketIndicesResult>(`${this.backendUrl}/api/market-indices`);
  }
}
