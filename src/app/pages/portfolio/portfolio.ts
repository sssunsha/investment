import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface Position {
  name: string;
  code: string;
  shares: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  type: 'stock' | 'fund';
}

@Component({
  selector: 'app-portfolio',
  imports: [MatIconModule, DecimalPipe, PercentPipe, FormsModule],
  templateUrl: './portfolio.html',
  styleUrl: './portfolio.scss',
})
export class PortfolioComponent {
  private readonly allPositions: Position[] = [
    { name: '贵州茅台', code: '600519', shares: 10, costPrice: 1680, currentPrice: 1752.3, marketValue: 17523, pnl: 723, pnlPct: 0.043, type: 'stock' },
    { name: '宁德时代', code: '300750', shares: 50, costPrice: 198, currentPrice: 189.5, marketValue: 9475, pnl: -425, pnlPct: -0.043, type: 'stock' },
    { name: '招商银行', code: '600036', shares: 200, costPrice: 38.5, currentPrice: 41.2, marketValue: 8240, pnl: 540, pnlPct: 0.070, type: 'stock' },
    { name: '中证500ETF', code: '510500', shares: 2000, costPrice: 5.8, currentPrice: 6.12, marketValue: 12240, pnl: 640, pnlPct: 0.055, type: 'fund' },
  ];

  get stockPositions(): Position[] {
    return this.allPositions.filter((p) => p.type === 'stock');
  }

  get fundPositions(): Position[] {
    return this.allPositions.filter((p) => p.type === 'fund');
  }

  get totalMarketValue(): number {
    return this.allPositions.reduce((sum, p) => sum + p.marketValue, 0);
  }

  get totalPnl(): number {
    return this.allPositions.reduce((sum, p) => sum + p.pnl, 0);
  }

  get totalPnlPct(): number {
    const totalCost = this.allPositions.reduce((sum, p) => sum + p.costPrice * p.shares, 0);
    return totalCost > 0 ? this.totalPnl / totalCost : 0;
  }
}
