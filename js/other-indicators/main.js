// js/other-indicators/main.js — 页面入口：数据加载、时间范围切换

import { renderSectorRatioChart } from './charts.js';

// ── 状态 ──────────────────────────────────────────────────────────────────────

let sectorData = null;
let timeRange = 3; // 默认3年

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchSectorRatioHistory(forceRefresh = false) {
  const url = `/api/indicators/sector-ratio-history${forceRefresh ? '?force_refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 工具 ──────────────────────────────────────────────────────────────────────

function getDateRange(years) {
  if (years === 'all') return { startDate: null, endDate: null };
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function showLoading(show) {
  document.getElementById('loading-indicator')?.classList.toggle('active', show);
}

// ── 渲染 ──────────────────────────────────────────────────────────────────────

function renderAll() {
  if (!sectorData) return;
  const { startDate, endDate } = getDateRange(timeRange);
  renderSectorRatioChart(sectorData, startDate, endDate);
}

// ── 数据加载 ──────────────────────────────────────────────────────────────────

async function loadData(forceRefresh = false) {
  showLoading(true);
  try {
    const result = await fetchSectorRatioHistory(forceRefresh);
    if (result.success && result.data) {
      sectorData = result.data;
      renderAll();
    } else {
      throw new Error(result.detail || '数据加载失败');
    }
  } catch (error) {
    console.error('Failed to load sector ratio data:', error);
    const container = document.getElementById('sector-ratio-chart')?.parentElement;
    if (container) {
      container.innerHTML = `
        <div class="chart-error">
          <span class="chart-error-icon">⚠️</span>
          <span class="chart-error-message">加载失败: ${error.message}</span>
        </div>
      `;
    }
  } finally {
    showLoading(false);
  }
}

// ── 状态检查 ──────────────────────────────────────────────────────────────────

async function checkStatus() {
  try {
    const r = await fetch('/api/session/status');
    const d = await r.json();
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if (d.logged_in) {
      dot.className = 'status-dot online';
      txt.textContent = 'BaoStock 已连接';
    } else {
      dot.className = 'status-dot offline';
      txt.textContent = d.connection_mode === 'per_call' ? '按需模式' : '未连接';
    }
  } catch {
    document.getElementById('status-dot').className = 'status-dot offline';
    document.getElementById('status-text').textContent = '服务不可达';
  }
}

// ── 事件 ──────────────────────────────────────────────────────────────────────

function handleTimeRangeChange(event) {
  const val = event.target.value;
  timeRange = val === 'all' ? 'all' : parseInt(val, 10);
  renderAll();
}

function handleRefresh() {
  loadData(true);
}

// ── 初始化 ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('time-range')?.addEventListener('change', handleTimeRangeChange);
  document.getElementById('refresh-btn')?.addEventListener('click', handleRefresh);
  checkStatus();
  setInterval(checkStatus, 30000);
  loadData(false);
});