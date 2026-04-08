import { Component, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { RefreshService } from '../../services/refresh.service';
import { ApiService, SessionStatus } from '../../services/api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [MatIconModule, MatSlideToggleModule, MatButtonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsComponent implements OnInit {
  darkMode = false;
  notifications = true;

  // 会话状态
  sessionStatus: SessionStatus | null = null;
  sessionLoading = false;
  sessionSaving = false;
  sessionMsg = '';

  // 可选心跳间隔（秒）
  readonly heartbeatPresets = [30, 60, 120, 300];
  // 可选空闲超时（秒）
  readonly idlePresets = [60, 300, 600, 1800, 3600];

  constructor(
    readonly refreshService: RefreshService,
    private api: ApiService,
  ) {}

  ngOnInit(): void {
    this.loadSessionStatus();
  }

  // ── 数据刷新设置 ─────────────────────────────

  get isAutoMode(): boolean {
    return this.refreshService.mode === 'auto';
  }

  set isAutoMode(val: boolean) {
    this.refreshService.setMode(val ? 'auto' : 'manual');
  }

  get intervalSeconds(): number {
    return this.refreshService.intervalSeconds;
  }

  setInterval(seconds: number): void {
    this.refreshService.setInterval(seconds);
  }

  intervalLabel(s: number): string {
    if (s < 60) return `${s}秒`;
    return `${s / 60}分钟`;
  }

  manualRefreshNow(): void {
    this.refreshService.trigger();
  }

  // ── 会话管理 ─────────────────────────────────

  loadSessionStatus(): void {
    this.sessionLoading = true;
    this.api.sessionStatus().subscribe({
      next: s => { this.sessionStatus = s; this.sessionLoading = false; },
      error: () => { this.sessionLoading = false; },
    });
  }

  doLogin(): void {
    this.sessionMsg = '';
    this.api.sessionLogin().subscribe({
      next: r => {
        this.sessionMsg = r.status === 'logged_in' ? '登录成功' : '已处于登录状态';
        this.loadSessionStatus();
      },
      error: () => { this.sessionMsg = '登录失败，请检查后端服务'; },
    });
  }

  doLogout(): void {
    this.sessionMsg = '';
    this.api.sessionLogout().subscribe({
      next: r => {
        this.sessionMsg = r.status === 'logged_out' ? '已登出' : '当前未登录';
        this.loadSessionStatus();
      },
      error: () => { this.sessionMsg = '操作失败'; },
    });
  }

  setHeartbeat(seconds: number): void {
    if (!this.sessionStatus) return;
    this.sessionSaving = true;
    this.sessionMsg = '';
    this.api.updateSessionConfig({ heartbeat_interval: seconds }).subscribe({
      next: cfg => {
        this.sessionStatus = { ...this.sessionStatus!, heartbeat_interval: cfg.heartbeat_interval };
        this.sessionSaving = false;
        this.sessionMsg = '心跳间隔已更新';
      },
      error: () => { this.sessionSaving = false; this.sessionMsg = '保存失败'; },
    });
  }

  setIdleTimeout(seconds: number): void {
    if (!this.sessionStatus) return;
    this.sessionSaving = true;
    this.sessionMsg = '';
    this.api.updateSessionConfig({ idle_timeout: seconds }).subscribe({
      next: cfg => {
        this.sessionStatus = { ...this.sessionStatus!, idle_timeout: cfg.idle_timeout };
        this.sessionSaving = false;
        this.sessionMsg = '自动登出时间已更新';
      },
      error: () => { this.sessionSaving = false; this.sessionMsg = '保存失败'; },
    });
  }

  idleLabel(s: number): string {
    if (s < 60) return `${s}秒`;
    if (s < 3600) return `${s / 60}分钟`;
    return `${s / 3600}小时`;
  }
}
