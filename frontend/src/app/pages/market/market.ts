import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { ApiService, IndexQuote } from '../../services/api.service';
import { RefreshService } from '../../services/refresh.service';

@Component({
  selector: 'app-market',
  standalone: true,
  imports: [MatIconModule, DecimalPipe, DatePipe],
  templateUrl: './market.html',
  styleUrl: './market.scss',
})
export class MarketComponent implements OnInit, OnDestroy {
  indices: IndexQuote[] = [];
  loading = false;
  error = '';
  lastUpdated = '';

  private refreshSub!: Subscription;

  constructor(
    private apiService: ApiService,
    private refreshService: RefreshService,
  ) {}

  ngOnInit(): void {
    this.loadData();
    this.refreshSub = this.refreshService.refresh$.subscribe(() => this.loadData());
  }

  ngOnDestroy(): void {
    this.refreshSub.unsubscribe();
  }

  private loadData(): void {
    this.loading = true;
    this.error = '';
    this.apiService.getMarketIndices().subscribe({
      next: (res) => {
        if (res.error) {
          this.error = res.error;
        } else {
          this.indices = res.indices;
          this.lastUpdated = res.last_updated;
        }
        this.loading = false;
      },
      error: () => {
        this.error = '获取行情数据失败，请检查后端服务是否启动';
        this.loading = false;
      },
    });
  }
}

