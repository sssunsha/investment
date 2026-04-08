import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  ApiService,
  HistoryKDataResult,
  TradeDatesResult,
  StockBasicResult,
  AllStockResult,
} from '../../services/api.service';
import { RefreshService } from '../../services/refresh.service';

type BsTab = 'kdata' | 'stock_basic' | 'all_stock' | 'trade_dates';

@Component({
  selector: 'app-baostock',
  standalone: true,
  imports: [MatIconModule, FormsModule],
  templateUrl: './baostock.html',
  styleUrl: './baostock.scss',
})
export class BaostockComponent implements OnInit, OnDestroy {
  activeTab: BsTab = 'kdata';

  // K线参数
  kdCode = 'sh.600000';
  kdFields = 'date,code,open,high,low,close,preclose,volume,amount,pctChg';
  kdStartDate = '';
  kdEndDate = '';
  kdFrequency = 'd';
  kdAdjustflag = '3';

  // 证券基本资料
  sbCode = '';
  sbCodeName = '';

  // 全部证券
  asDay = '';
  asSearch = '';

  // 交易日历
  tdStartDate = '';
  tdEndDate = '';

  // 结果
  kdResult: HistoryKDataResult | null = null;
  sbResult: StockBasicResult | null = null;
  asResult: AllStockResult | null = null;
  tdResult: TradeDatesResult | null = null;

  loading = false;
  error = '';

  private refreshSub!: Subscription;

  readonly tabs: { key: BsTab; label: string; icon: string }[] = [
    { key: 'kdata',       label: 'K线数据',   icon: 'candlestick_chart' },
    { key: 'stock_basic', label: '证券资料',   icon: 'info' },
    { key: 'all_stock',   label: '全量证券',   icon: 'list' },
    { key: 'trade_dates', label: '交易日历',   icon: 'calendar_today' },
  ];

  readonly frequencyOptions = [
    { value: 'd',  label: '日K' },
    { value: 'w',  label: '周K' },
    { value: 'm',  label: '月K' },
    { value: '60', label: '60分' },
    { value: '30', label: '30分' },
    { value: '15', label: '15分' },
    { value: '5',  label: '5分' },
  ];

  readonly adjustOptions = [
    { value: '3', label: '不复权' },
    { value: '1', label: '后复权' },
    { value: '2', label: '前复权' },
  ];

  constructor(
    private apiService: ApiService,
    private refreshService: RefreshService,
  ) {}

  ngOnInit(): void {
    this.query();
    this.refreshSub = this.refreshService.refresh$.subscribe(() => this.query());
  }

  ngOnDestroy(): void {
    this.refreshSub.unsubscribe();
  }

  switchTab(tab: BsTab): void {
    this.activeTab = tab;
    this.clearResult();
    this.query();
  }

  query(): void {
    this.clearResult();
    this.loading = true;
    this.error = '';

    if (this.activeTab === 'kdata') {
      this.apiService.queryHistoryKData({
        code: this.kdCode,
        fields: this.kdFields,
        start_date: this.kdStartDate || undefined,
        end_date: this.kdEndDate || undefined,
        frequency: this.kdFrequency,
        adjustflag: this.kdAdjustflag,
      }).subscribe({
        next: r => { this.loading = false; if (r.error) { this.error = r.error; } else { this.kdResult = r; } },
        error: () => { this.loading = false; this.error = '查询K线数据失败'; },
      });

    } else if (this.activeTab === 'stock_basic') {
      if (!this.sbCode && !this.sbCodeName) {
        this.loading = false; this.error = '请输入证券代码或证券名称'; return;
      }
      this.apiService.queryStockBasic(this.sbCode || undefined, this.sbCodeName || undefined).subscribe({
        next: r => { this.loading = false; if (r.error) { this.error = r.error; } else { this.sbResult = r; } },
        error: () => { this.loading = false; this.error = '查询证券资料失败'; },
      });

    } else if (this.activeTab === 'all_stock') {
      this.apiService.queryAllStock(this.asDay || undefined).subscribe({
        next: r => { this.loading = false; if (r.error) { this.error = r.error; } else { this.asResult = r; } },
        error: () => { this.loading = false; this.error = '查询全量证券失败'; },
      });

    } else {
      this.apiService.queryTradeDates(this.tdStartDate || undefined, this.tdEndDate || undefined).subscribe({
        next: r => { this.loading = false; if (r.error) { this.error = r.error; } else { this.tdResult = r; } },
        error: () => { this.loading = false; this.error = '查询交易日历失败'; },
      });
    }
  }

  get filteredAllStocks() {
    if (!this.asResult) return [];
    const q = this.asSearch.trim().toLowerCase();
    if (!q) return this.asResult.data;
    return this.asResult.data.filter(
      s => s.code.toLowerCase().includes(q) || s.code_name.toLowerCase().includes(q)
    );
  }

  get kdFields_list(): string[] {
    return this.kdResult?.fields ?? [];
  }

  get tradingDaysOnly() {
    return this.tdResult?.data.filter(d => d.is_trading_day === '1') ?? [];
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = { '1': '股票', '2': '指数', '3': '其它', '4': '可转债', '5': 'ETF' };
    return map[type] ?? type;
  }

  private clearResult(): void {
    this.kdResult = null;
    this.sbResult = null;
    this.asResult = null;
    this.tdResult = null;
    this.error = '';
  }
}
