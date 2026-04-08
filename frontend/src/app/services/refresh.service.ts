import { Injectable, OnDestroy } from '@angular/core';
import { Subject, interval, Subscription } from 'rxjs';

export type RefreshMode = 'manual' | 'auto';

export interface RefreshSettings {
  mode: RefreshMode;
  intervalSeconds: number;
}

const STORAGE_KEY = 'invest_refresh_settings';
const DEFAULT_SETTINGS: RefreshSettings = { mode: 'manual', intervalSeconds: 30 };
const PRESET_INTERVALS = [10, 30, 60, 120, 300];

@Injectable({ providedIn: 'root' })
export class RefreshService implements OnDestroy {
  private refreshSource = new Subject<void>();
  readonly refresh$ = this.refreshSource.asObservable();

  private _settings: RefreshSettings = DEFAULT_SETTINGS;
  private timerSub: Subscription | null = null;

  readonly presetIntervals = PRESET_INTERVALS;

  constructor() {
    this._settings = this.loadSettings();
    if (this._settings.mode === 'auto') {
      this.startTimer();
    }
  }

  get settings(): RefreshSettings {
    return { ...this._settings };
  }

  get mode(): RefreshMode {
    return this._settings.mode;
  }

  get intervalSeconds(): number {
    return this._settings.intervalSeconds;
  }

  /** 切换刷新模式，保存到 localStorage */
  setMode(mode: RefreshMode): void {
    this._settings = { ...this._settings, mode };
    this.saveSettings();
    this.stopTimer();
    if (mode === 'auto') {
      this.startTimer();
    }
  }

  /** 设置自动刷新间隔（秒），保存到 localStorage */
  setInterval(seconds: number): void {
    this._settings = { ...this._settings, intervalSeconds: seconds };
    this.saveSettings();
    if (this._settings.mode === 'auto') {
      this.stopTimer();
      this.startTimer();
    }
  }

  /** 手动触发一次刷新 */
  trigger(): void {
    this.refreshSource.next();
  }

  private startTimer(): void {
    this.timerSub = interval(this._settings.intervalSeconds * 1000).subscribe(() => {
      this.refreshSource.next();
    });
  }

  private stopTimer(): void {
    this.timerSub?.unsubscribe();
    this.timerSub = null;
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
    } catch {
      // localStorage 不可用时静默失败
    }
  }

  private loadSettings(): RefreshSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<RefreshSettings>;
        return {
          mode: parsed.mode ?? DEFAULT_SETTINGS.mode,
          intervalSeconds: parsed.intervalSeconds ?? DEFAULT_SETTINGS.intervalSeconds,
        };
      }
    } catch {
      // 解析失败时使用默认值
    }
    return { ...DEFAULT_SETTINGS };
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }
}
