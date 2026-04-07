import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

interface StockQuote {
  name: string;
  code: string;
  price: number;
  change: number;
  changePct: number;
}

@Component({
  selector: 'app-market',
  imports: [MatIconModule, FormsModule, DecimalPipe],
  templateUrl: './market.html',
  styleUrl: './market.scss',
})
export class MarketComponent {
  searchQuery = '';

  indices: StockQuote[] = [
    { name: '上证指数', code: '000001', price: 3215.68, change: 18.32, changePct: 0.0057 },
    { name: '深证成指', code: '399001', price: 10328.45, change: -42.1, changePct: -0.0041 },
    { name: '创业板指', code: '399006', price: 2018.33, change: 12.5, changePct: 0.0062 },
    { name: '沪深300', code: '000300', price: 3856.2, change: 22.8, changePct: 0.0059 },
  ];

  hotStocks: StockQuote[] = [
    { name: '贵州茅台', code: '600519', price: 1752.3, change: 12.5, changePct: 0.0072 },
    { name: '宁德时代', code: '300750', price: 189.5, change: -3.2, changePct: -0.0166 },
    { name: '比亚迪', code: '002594', price: 268.4, change: 5.6, changePct: 0.0213 },
    { name: '中国平安', code: '601318', price: 48.2, change: 0.8, changePct: 0.0169 },
    { name: '招商银行', code: '600036', price: 41.2, change: -0.3, changePct: -0.0072 },
  ];
}
