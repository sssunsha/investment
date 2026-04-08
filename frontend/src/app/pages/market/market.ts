import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  ApiService,
  IndexQuote,
  SectorStocksResult,
  StockIndustry,
} from '../../services/api.service';
import { RefreshService } from '../../services/refresh.service';

type SectorTab = 'hs300' | 'sz50' | 'zz500' | 'industry';

@Component({
  selector: 'app-market',
  standalone: true,
  imports: [MatIconModule, DecimalPipe, DatePipe, FormsModule],
  templateUrl: './market.html',
  styleUrl: './market.scss',
})
export class MarketComponent implements OnInit, OnDestroy {
  // 指数行情
  indices: IndexQuote[] = [];
  indicesLoading = false;
  indicesError = '';
  lastUpdated = '';

  // 板块成分股
  activeSectorTab: SectorTab = 'hs300';
  sectorLoading = false;
  sectorError = '';
  sectorStocks: { updateDate: string; code: string; code_name: string }[] = [];
  industryStocks: StockIndustry[] = [];
  sectorTotal = 0;

  // 行业查询
  industryCode = '';
  industryDate = '';

  // 搜索过滤
  sectorSearch = '';

  private refreshSub!: Subscription;

  readonly sectorTabs: { key: SectorTab; label: string }[] = [
    { key: 'hs300', label: '沪深300' },
    { key: 'sz50',  label: '上证50' },
    { key: 'zz500', label: '中证500' },
    { key: 'industry', label: '行业分类' },
  ];

  constructor(
    private apiService: ApiService,
    private refreshService: RefreshService,
  ) {}

  ngOnInit(): void {
    this.loadIndices();
    this.loadSector();
    this.refreshSub = this.refreshService.refresh$.subscribe(() => {
      this.loadIndices();
      this.loadSector();
    });
  }

  ngOnDestroy(): void {
    this.refreshSub.unsubscribe();
  }

  switchSectorTab(tab: SectorTab): void {
    this.activeSectorTab = tab;
    this.sectorSearch = '';
    this.loadSector();
  }

  queryIndustry(): void {
    this.loadSector();
  }

  get filteredSectorStocks() {
    const q = this.sectorSearch.trim().toLowerCase();
    if (!q) return this.sectorStocks;
    return this.sectorStocks.filter(
      s => s.code.toLowerCase().includes(q) || s.code_name.toLowerCase().includes(q)
    );
  }

  get filteredIndustryStocks() {
    const q = this.sectorSearch.trim().toLowerCase();
    if (!q) return this.industryStocks;
    return this.industryStocks.filter(
      s => s.code.toLowerCase().includes(q) ||
           s.code_name.toLowerCase().includes(q) ||
           s.industry.toLowerCase().includes(q)
    );
  }

  private loadIndices(): void {
    this.indicesLoading = true;
    this.indicesError = '';
    this.apiService.getMarketIndices().subscribe({
      next: (res) => {
        this.indicesLoading = false;
        if (res.error) { this.indicesError = res.error; return; }
        this.indices = res.indices;
        this.lastUpdated = res.last_updated;
      },
      error: () => {
        this.indicesLoading = false;
        this.indicesError = '获取行情数据失败，请检查后端服务';
      },
    });
  }

  private loadSector(): void {
    this.sectorLoading = true;
    this.sectorError = '';
    this.sectorStocks = [];
    this.industryStocks = [];

    if (this.activeSectorTab === 'hs300') {
      this.apiService.queryHs300Stocks().subscribe({
        next: (res) => { this.sectorLoading = false; this.applySectorResult(res); },
        error: () => { this.sectorLoading = false; this.sectorError = '获取沪深300成分股失败'; },
      });
    } else if (this.activeSectorTab === 'sz50') {
      this.apiService.querySz50Stocks().subscribe({
        next: (res) => { this.sectorLoading = false; this.applySectorResult(res); },
        error: () => { this.sectorLoading = false; this.sectorError = '获取上证50成分股失败'; },
      });
    } else if (this.activeSectorTab === 'zz500') {
      this.apiService.queryZz500Stocks().subscribe({
        next: (res) => { this.sectorLoading = false; this.applySectorResult(res); },
        error: () => { this.sectorLoading = false; this.sectorError = '获取中证500成分股失败'; },
      });
    } else {
      this.apiService.queryStockIndustry(
        this.industryCode || undefined,
        this.industryDate || undefined
      ).subscribe({
        next: (res) => {
          this.sectorLoading = false;
          if (res.error) { this.sectorError = res.error; return; }
          this.industryStocks = res.data;
          this.sectorTotal = res.total;
        },
        error: () => { this.sectorLoading = false; this.sectorError = '获取行业分类数据失败'; },
      });
    }
  }

  private applySectorResult(res: SectorStocksResult): void {
    if (res.error) { this.sectorError = res.error; return; }
    this.sectorStocks = res.data;
    this.sectorTotal = res.total;
  }
}
