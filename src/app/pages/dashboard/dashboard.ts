import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe, PercentPipe } from '@angular/common';

interface AssetSummary {
  label: string;
  value: number;
  change: number;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [MatIconModule, DecimalPipe, PercentPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  totalAssets = 532680.5;
  todayPnl = 3420.8;
  todayPnlPct = 0.0065;

  summaryCards: AssetSummary[] = [
    { label: '股票', value: 320000, change: 0.012, icon: 'bar_chart', color: '#f5222d' },
    { label: '基金', value: 150000, change: -0.003, icon: 'pie_chart', color: '#1890ff' },
    { label: '债券', value: 50000, change: 0.001, icon: 'account_balance', color: '#fa8c16' },
    { label: '现金', value: 12680.5, change: 0, icon: 'savings', color: '#07c160' },
  ];
}
