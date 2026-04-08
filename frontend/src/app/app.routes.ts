import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard').then((m) => m.DashboardComponent),
  },
  {
    path: 'market',
    loadComponent: () => import('./pages/market/market').then((m) => m.MarketComponent),
  },
  {
    path: 'analysis',
    loadComponent: () =>
      import('./pages/analysis/analysis').then((m) => m.AnalysisComponent),
  },
  {
    path: 'baostock',
    loadComponent: () =>
      import('./pages/baostock/baostock').then((m) => m.BaostockComponent),
  },
  {
    path: 'portfolio',
    loadComponent: () =>
      import('./pages/portfolio/portfolio').then((m) => m.PortfolioComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings').then((m) => m.SettingsComponent),
  },
  {
    path: 'strategy',
    loadComponent: () =>
      import('./components/strategy-view/strategy-view.component').then((m) => m.StrategyViewComponent),
  },
];
