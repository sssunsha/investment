import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { AsyncPipe } from '@angular/common';
import { map, shareReplay, filter } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { RefreshService } from './services/refresh.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    AsyncPipe,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
// 支持刷新按钮的路由
const REFRESHABLE_ROUTES = ['/market'];

export class App {
  readonly navItems: NavItem[] = [
    { label: '总览', icon: 'dashboard', route: '/dashboard' },
    { label: '持仓', icon: 'account_balance_wallet', route: '/portfolio' },
    { label: '行情', icon: 'show_chart', route: '/market' },
    { label: '分析', icon: 'analytics', route: '/analysis' },
    { label: '我的', icon: 'person', route: '/settings' },
  ];

  currentTitle = '总览';
  showRefresh = false;
  isHandset$: Observable<boolean>;

  constructor(
    private breakpointObserver: BreakpointObserver,
    private router: Router,
    private refreshService: RefreshService,
  ) {
    this.isHandset$ = this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(
        map((result) => result.matches),
        shareReplay(),
      );

    // 路由变化时自动同步标题和刷新按钮可见性
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => {
        const url = (e as NavigationEnd).urlAfterRedirects;
        const matched = this.navItems.find((n) => url.startsWith(n.route));
        if (matched) this.currentTitle = matched.label;
        this.showRefresh = REFRESHABLE_ROUTES.some((r) => url.startsWith(r));
      });
  }

  onRefresh(): void {
    this.refreshService.trigger();
  }
}
