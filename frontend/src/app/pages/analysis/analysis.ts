import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  ApiService,
  FinancialResult,
  FinancialRow,
  DividendResult,
  AdjustFactorResult,
  CorpReportResult,
  MacroResult,
} from '../../services/api.service';
import { RefreshService } from '../../services/refresh.service';

type AnalysisTab = 'financial' | 'corpreport' | 'macro';
type FinancialSubTab = 'profit' | 'operation' | 'growth' | 'balance' | 'cashflow' | 'dupont' | 'dividend' | 'adjust';
type MacroSubTab = 'deposit' | 'loan' | 'reserve' | 'money_month' | 'money_year';
type CorpSubTab = 'express' | 'forecast';

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [MatIconModule, FormsModule],
  templateUrl: './analysis.html',
  styleUrl: './analysis.scss',
})
export class AnalysisComponent implements OnInit, OnDestroy {
  activeTab: AnalysisTab = 'financial';
  activeFinancialSub: FinancialSubTab = 'profit';
  activeCorpSub: CorpSubTab = 'express';
  activeMacroSub: MacroSubTab = 'deposit';

  // 查询参数
  code = 'sh.600000';
  year = new Date().getFullYear();
  quarter = 4;
  dividendYear = String(new Date().getFullYear() - 1);
  yearType = 'report';
  startDate = '';
  endDate = '';

  // 数据
  financialData: FinancialRow[] = [];
  financialError = '';
  financialLoading = false;

  corpData: FinancialRow[] = [];
  corpError = '';
  corpLoading = false;

  macroData: { [key: string]: string }[] = [];
  macroError = '';
  macroLoading = false;

  // 展示用字段列表（动态提取）
  displayFields: string[] = [];

  private refreshSub!: Subscription;

  readonly mainTabs = [
    { key: 'financial' as AnalysisTab, label: '财务指标' },
    { key: 'corpreport' as AnalysisTab, label: '业绩报告' },
    { key: 'macro' as AnalysisTab, label: '宏观经济' },
  ];

  readonly financialSubTabs: { key: FinancialSubTab; label: string }[] = [
    { key: 'profit',    label: '盈利能力' },
    { key: 'operation', label: '营运能力' },
    { key: 'growth',    label: '成长能力' },
    { key: 'balance',   label: '偿债能力' },
    { key: 'cashflow',  label: '现金流量' },
    { key: 'dupont',    label: '杜邦指数' },
    { key: 'dividend',  label: '除权除息' },
    { key: 'adjust',    label: '复权因子' },
  ];

  readonly corpSubTabs: { key: CorpSubTab; label: string }[] = [
    { key: 'express',  label: '业绩快报' },
    { key: 'forecast', label: '业绩预告' },
  ];

  readonly macroSubTabs: { key: MacroSubTab; label: string }[] = [
    { key: 'deposit',     label: '存款利率' },
    { key: 'loan',        label: '贷款利率' },
    { key: 'reserve',     label: '存款准备金率' },
    { key: 'money_month', label: '货币供应量（月）' },
    { key: 'money_year',  label: '货币供应量（年）' },
  ];

  readonly quarterOptions = [1, 2, 3, 4];
  readonly yearTypeOptions = [
    { value: 'report', label: '报告期' },
    { value: 'operate', label: '除权实施日' },
  ];

  get needsCodeYear(): boolean {
    return this.activeTab === 'financial' &&
      !['dividend', 'adjust'].includes(this.activeFinancialSub);
  }

  get needsCodeDateRange(): boolean {
    return (this.activeTab === 'financial' && this.activeFinancialSub === 'adjust') ||
           this.activeTab === 'corpreport';
  }

  get needsDividend(): boolean {
    return this.activeTab === 'financial' && this.activeFinancialSub === 'dividend';
  }

  get needsMacroDates(): boolean {
    return this.activeTab === 'macro';
  }

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

  switchTab(tab: AnalysisTab): void {
    this.activeTab = tab;
    this.clearData();
    this.query();
  }

  switchFinancialSub(sub: FinancialSubTab): void {
    this.activeFinancialSub = sub;
    this.clearData();
    this.query();
  }

  switchCorpSub(sub: CorpSubTab): void {
    this.activeCorpSub = sub;
    this.clearData();
    this.query();
  }

  switchMacroSub(sub: MacroSubTab): void {
    this.activeMacroSub = sub;
    this.clearData();
    this.query();
  }

  query(): void {
    if (this.activeTab === 'financial') this.queryFinancial();
    else if (this.activeTab === 'corpreport') this.queryCorp();
    else this.queryMacro();
  }

  private clearData(): void {
    this.financialData = [];
    this.corpData = [];
    this.macroData = [];
    this.displayFields = [];
    this.financialError = '';
    this.corpError = '';
    this.macroError = '';
  }

  private applyFinancial(res: FinancialResult | DividendResult | AdjustFactorResult): void {
    if (res.error) { this.financialError = res.error; return; }
    this.financialData = res.data;
    this.displayFields = res.data.length > 0 ? Object.keys(res.data[0]) : [];
  }

  private queryFinancial(): void {
    this.financialLoading = true;
    const sub = this.activeFinancialSub;

    if (sub === 'dividend') {
      this.apiService.queryDividendData(this.code, this.dividendYear, this.yearType)
        .subscribe({ next: r => { this.financialLoading = false; this.applyFinancial(r); },
                     error: () => { this.financialLoading = false; this.financialError = '查询失败'; } });
      return;
    }
    if (sub === 'adjust') {
      this.apiService.queryAdjustFactor(this.code, this.startDate || undefined, this.endDate || undefined)
        .subscribe({ next: r => { this.financialLoading = false; this.applyFinancial(r); },
                     error: () => { this.financialLoading = false; this.financialError = '查询失败'; } });
      return;
    }

    const calls: Record<FinancialSubTab, () => any> = {
      profit:    () => this.apiService.queryProfitData(this.code, this.year, this.quarter),
      operation: () => this.apiService.queryOperationData(this.code, this.year, this.quarter),
      growth:    () => this.apiService.queryGrowthData(this.code, this.year, this.quarter),
      balance:   () => this.apiService.queryBalanceData(this.code, this.year, this.quarter),
      cashflow:  () => this.apiService.queryCashFlowData(this.code, this.year, this.quarter),
      dupont:    () => this.apiService.queryDupontData(this.code, this.year, this.quarter),
      dividend:  () => null,
      adjust:    () => null,
    };

    calls[sub]().subscribe({
      next: (r: FinancialResult) => { this.financialLoading = false; this.applyFinancial(r); },
      error: () => { this.financialLoading = false; this.financialError = '查询失败'; },
    });
  }

  private queryCorp(): void {
    this.corpLoading = true;
    const call = this.activeCorpSub === 'express'
      ? this.apiService.queryPerformanceExpressReport(this.code, this.startDate || undefined, this.endDate || undefined)
      : this.apiService.queryForecastReport(this.code, this.startDate || undefined, this.endDate || undefined);

    call.subscribe({
      next: (r: CorpReportResult) => {
        this.corpLoading = false;
        if (r.error) { this.corpError = r.error; return; }
        this.corpData = r.data;
        this.displayFields = r.data.length > 0 ? Object.keys(r.data[0]) : [];
      },
      error: () => { this.corpLoading = false; this.corpError = '查询失败'; },
    });
  }

  private queryMacro(): void {
    this.macroLoading = true;
    const sd = this.startDate || undefined;
    const ed = this.endDate || undefined;

    const calls: Record<MacroSubTab, () => any> = {
      deposit:     () => this.apiService.queryDepositRateData(sd, ed),
      loan:        () => this.apiService.queryLoanRateData(sd, ed),
      reserve:     () => this.apiService.queryRequiredReserveRatio(sd, ed),
      money_month: () => this.apiService.queryMoneySupplyMonth(sd, ed),
      money_year:  () => this.apiService.queryMoneySupplyYear(sd, ed),
    };

    calls[this.activeMacroSub]().subscribe({
      next: (r: MacroResult) => {
        this.macroLoading = false;
        if (r.error) { this.macroError = r.error; return; }
        this.macroData = r.data;
        this.displayFields = r.data.length > 0 ? Object.keys(r.data[0]) : [];
      },
      error: () => { this.macroLoading = false; this.macroError = '查询失败'; },
    });
  }

  get currentData(): FinancialRow[] {
    if (this.activeTab === 'financial') return this.financialData;
    if (this.activeTab === 'corpreport') return this.corpData;
    return this.macroData;
  }

  get currentLoading(): boolean {
    if (this.activeTab === 'financial') return this.financialLoading;
    if (this.activeTab === 'corpreport') return this.corpLoading;
    return this.macroLoading;
  }

  get currentError(): string {
    if (this.activeTab === 'financial') return this.financialError;
    if (this.activeTab === 'corpreport') return this.corpError;
    return this.macroError;
  }
}
