import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'strategy', // Let's make the new component the default page
    pathMatch: 'full',
  },
  {
    path: 'strategy',
    loadComponent: () =>
      import('./components/strategy-view/strategy-view.component').then((m) => m.StrategyViewComponent),
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
    path: 'portfolio',
    loadComponent: () =>
      import('./pages/portfolio/portfolio').then((m) => m.PortfolioComponent),
  },
  {
    path: 'analysis',
    loadComponent: () =>
      import('./pages/analysis/analysis').then((m) => m.AnalysisComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings').then((m) => m.SettingsComponent),
  },
];
