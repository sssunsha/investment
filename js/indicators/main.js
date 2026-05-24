// js/indicators/main.js — 入口：状态、API、加载流程、window挂载

import { renderSignalPanel } from './signals.js';
import {
  setChartRange,
  renderFedRateChart, renderCnStockChart,
  renderMacroTrendSection,
} from './charts.js';
import { renderCategorySection, renderMarketColumn, renderGlobalSection } from './cards.js';

// ── 状态 ──────────────────────────────────────────────────────────────────────

let indicatorsData = null;
let signalsData    = null;
let isLoading      = false;

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchIndicators(forceRefresh = false) {
  const url = `/api/indicators${forceRefresh ? '?force_refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchSignals() {
  const res = await fetch('/api/indicators/signals');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchFedRateHistory(forceRefresh = false) {
  const url = `/api/indicators/fed-rate-history${forceRefresh ? '?force_refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchCnIndicesHistory(forceRefresh = false) {
  const url = `/api/indicators/cn-indices-history${forceRefresh ? '?force_refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function refreshAllIndicators() {
  const res = await fetch('/api/indicators/refresh', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 工具 ──────────────────────────────────────────────────────────────────────

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(decimals);
}

function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// ── 页面渲染 ──────────────────────────────────────────────────────────────────

function renderLoading() {
  const container = document.getElementById('indicators-container');
  if (!container) return;
  container.innerHTML = `
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">正在加载投资指标数据...</div>
    </div>
  `;
}

function renderIndicatorsPage(data, signals) {
  const container = document.getElementById('indicators-container');
  if (!container) return;

  if (!data || !data.data) {
    container.innerHTML = `
      <div class="loading-overlay">
        <div class="error-message">❌ 加载失败，请刷新重试</div>
      </div>
    `;
    return;
  }

  // 优先使用 by_market 双栏布局
  if (data.by_market) {
    const { cn, us, global: globalIndicators } = data.by_market;
    container.innerHTML = `
      ${renderSignalPanel(signals)}
      ${renderMacroTrendSection()}
      <div class="market-columns">
        <div class="market-column">${renderMarketColumn('cn', cn)}</div>
        <div class="market-column">${renderMarketColumn('us', us)}</div>
      </div>
      ${renderGlobalSection(globalIndicators || [])}
    `;
    return;
  }

  // 降级：使用旧的按 category 分组渲染
  const sortedCategories = Object.entries(data.data)
    .sort((a, b) => (a[1].order || 99) - (b[1].order || 99));

  container.innerHTML = `
    ${renderSignalPanel(signals)}
    ${renderMacroTrendSection()}
    ${sortedCategories.map(([key, cat]) => renderCategorySection(key, cat)).join('')}
  `;
}

// ── 图表加载 ──────────────────────────────────────────────────────────────────

async function loadFedRateChart(forceRefresh = false) {
  const card = document.getElementById('fed-rate-chart-card');
  if (!card) return;

  card.classList.add('chart-loading');
  try {
    const result = await fetchFedRateHistory(forceRefresh);
    const fedRateData = result.data;
    renderFedRateChart(fedRateData);

    const latestEl = document.getElementById('fed-rate-latest');
    if (latestEl && fedRateData.fedfunds) {
      const badge = fedRateData.from_cache ? '📦 缓存' : '🔄 最新';
      const ffr   = fedRateData.fedfunds;
      const dgs10 = fedRateData.dgs10;
      const dgs2  = fedRateData.dgs2;
      const dgs30 = fedRateData.dgs30;
      const ffrLatest   = ffr.values[ffr.values.length - 1]?.toFixed(2);
      const dgs10Latest = dgs10.values[dgs10.values.length - 1]?.toFixed(2);
      const dgs2Latest  = dgs2.values[dgs2.values.length - 1]?.toFixed(2);
      const dgs30Latest = dgs30?.values[dgs30.values.length - 1]?.toFixed(2);
      latestEl.innerHTML = `FFR <strong>${ffrLatest}%</strong> · 10Y <strong>${dgs10Latest}%</strong> · 30Y <strong>${dgs30Latest ?? '–'}%</strong> · 2Y <strong>${dgs2Latest}%</strong> <span class="indicator-cache-badge">${badge}</span>`;
    }
  } catch (error) {
    const wrapper = card.querySelector('.chart-wrapper');
    if (wrapper) wrapper.innerHTML = `<div class="chart-error">❌ 加载失败: ${error.message}</div>`;
  } finally {
    card.classList.remove('chart-loading');
  }
}

async function loadCnStockChart(forceRefresh = false) {
  const card = document.getElementById('cn-stock-chart-card');
  if (!card) return;

  card.classList.add('chart-loading');
  try {
    const result = await fetchCnIndicesHistory(forceRefresh);
    const cnStockData = result.data;
    renderCnStockChart(cnStockData);

    const latestEl = document.getElementById('cn-stock-latest');
    if (latestEl) {
      const badge = cnStockData.from_cache ? '📦 缓存' : '🔄 最新';
      const parts = ['sh_000001', 'sh_000300', 'sz_399006', 'sh_000905']
        .filter(k => cnStockData[k]?.values?.length)
        .map(k => {
          const s = cnStockData[k];
          const v = s.values[s.values.length - 1];
          return `${s.name} <strong>${Math.round(v).toLocaleString()}</strong>`;
        });
      latestEl.innerHTML = parts.join(' · ') + ` <span class="indicator-cache-badge">${badge}</span>`;
    }
  } catch (error) {
    const wrapper = card.querySelector('.chart-wrapper');
    if (wrapper) wrapper.innerHTML = `<div class="chart-error">❌ 加载失败: ${error.message}</div>`;
  } finally {
    card.classList.remove('chart-loading');
  }
}

// ── 主加载流程 ────────────────────────────────────────────────────────────────

async function loadIndicators(forceRefresh = false) {
  if (isLoading) return;

  isLoading = true;
  renderLoading();
  updateLoadButton(true);

  try {
    const [indicators, signals] = await Promise.all([
      fetchIndicators(forceRefresh),
      fetchSignals(),
    ]);
    indicatorsData = indicators;
    signalsData    = signals;

    renderIndicatorsPage(indicatorsData, signalsData);
    loadFedRateChart(forceRefresh);
    loadCnStockChart(forceRefresh);
  } catch (error) {
    console.error('Failed to load indicators:', error);
    const container = document.getElementById('indicators-container');
    if (container) {
      container.innerHTML = `
        <div class="loading-overlay">
          <div class="error-message">❌ 加载失败: ${error.message}</div>
          <button class="btn btn-primary" onclick="loadIndicators()" style="margin-top:20px">重试</button>
        </div>
      `;
    }
  } finally {
    isLoading = false;
    updateLoadButton(false);
  }
}

async function handleRefresh() {
  if (isLoading) return;

  isLoading = true;
  updateLoadButton(true);

  try {
    await refreshAllIndicators();
    await loadIndicators(true);
  } catch (error) {
    console.error('Failed to refresh:', error);
    alert('刷新失败: ' + error.message);
  } finally {
    isLoading = false;
    updateLoadButton(false);
  }
}

function updateLoadButton(loading) {
  const btn = document.getElementById('load-btn');
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? '⏳ 加载中...' : '▶ 加载数据';
  }
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.disabled = loading;
    refreshBtn.textContent = loading ? '⏳ 刷新中...' : '🔄 强制刷新';
  }
}

// ── 初始化 ────────────────────────────────────────────────────────────────────

// 挂载 HTML onclick 需要的全局函数
window.loadIndicators = loadIndicators;
window.handleRefresh  = handleRefresh;
window.setChartRange  = setChartRange;

document.addEventListener('DOMContentLoaded', () => {
  const dateEl = document.getElementById('header-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });
  }
  loadIndicators();
});
