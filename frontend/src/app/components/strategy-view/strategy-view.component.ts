import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, AsyncPipe, JsonPipe, DecimalPipe } from '@angular/common';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ApiService, StrategyResult } from '../../services/api.service';

@Component({
  selector: 'app-strategy-view',
  standalone: true,
  imports: [CommonModule, AsyncPipe, JsonPipe, DecimalPipe],
  templateUrl: './strategy-view.component.html',
  styleUrls: ['./strategy-view.component.scss']
})
export class StrategyViewComponent implements OnInit {
  private apiService = inject(ApiService);

  strategyResult$!: Observable<StrategyResult | null>;

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.strategyResult$ = this.apiService.getStrategyData().pipe(
      catchError(error => {
        console.error('Error fetching strategy data:', error);
        // Return a new observable with an error object to be displayed in the template
        return of({
          ranking: [],
          to_buy: [],
          last_updated: new Date().toISOString(),
          error: 'Failed to load data from backend. Is the server running?'
        });
      })
    );
  }
}