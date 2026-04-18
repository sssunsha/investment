/**
 * Basic Info Page - Main JavaScript
 * Handles macroscopic economic data fetching and Chart.js visualization
 * Features: Debug logging, local caching, serial data fetching
 */

// ══════════════════════════════════════════════════════════════════════════════
// Configuration
// ══════════════════════════════════════════════════════════════════════════════

const API_BASE = '/api/macroscopic';
const CACHE_API = '/api/cache/macro';

const DATA_KEYS = {
  DEPOSIT_RATE: 'deposit_rate',
  LOAN_RATE: 'loan_rate',
  RESERVE_RATIO: 'reserve_ratio',
  MONEY_SUPPLY_MONTH: 'money_supply_month',
  MONEY_SUPPLY_YEAR: 'money_supply_year',
};

const CHART_COLORS = {
  cyan: 'rgba(6, 182, 212, 1)',
  cyanLight: 'rgba(6, 182, 212, 0.2)',
  green: 'rgba(34, 197, 94, 1)',
  greenLight: 'rgba(34, 197, 94, 0.2)',
  orange: 'rgba(249, 115, 22, 1)',
  orangeLight: 'rgba(249, 115, 22, 0.2)',
  purple: 'rgba(168, 85, 247, 1)',
  purpleLight: 'rgba(168, 85, 247, 0.2)',
  pink: 'rgba(236, 72, 153, 1)',
  pinkLight: 'rgba(236, 72, 153, 0.2)',
  yellow: 'rgba(245, 158, 11, 1)',
  yellowLight: 'rgba(245, 158, 11, 0.2)',
  blue: 'rgba(59, 130, 246, 1)',
  blueLight: 'rgba(59, 130, 246, 0.2)',
  red: 'rgba(239, 68, 68, 1)',
  redLight: 'rgba(239, 68, 68, 0.2)',
  lime: 'rgba(132, 204, 22, 1)',
  limeLight: 'rgba(132, 204, 22, 0.2)',
};

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    intersect: false,
    mode: 'index',
  },
  plugins: {
    legend: {
      position: 'top',
      labels: {
        color: '#8892a4',
        font: { size: 11 },
        boxWidth: 12,
        padding: 15,
      },
    },
    tooltip: {
      backgroundColor: '#1a1d27',
      borderColor: '#2d3250',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#8892a4',
      padding: 12,
      displayColors: true,
      callbacks: {},
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(45, 50, 80, 0.3)' },
      ticks: { color: '#8892a4', font: { size: 10 } },
    },
    y: {
      grid: { color: 'rgba(45, 50, 80, 0.3)' },
      ticks: { color: '#8892a4', font: { size: 10 } },
    },
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// State Management
// ══════════════════════════════════════════════════════════════════════════════

const state = {
  charts: {},
  timeRange: 1,
  cache: null,
  debugLogs: [],
};

// ══════════════════════════════════════════════════════════════════════════════
// Debug Logging
// ══════════════════════════════════════════════════════════════════════════════

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function debugLog(level, msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  state.debugLogs.push({ ts, level, msg });
  const el = document.getElementById('debug-log');
  if (!el) return;
  const color = level === 'error' ? 'var(--red)' 
    : level === 'ok' ? 'var(--green)' 
    : level === 'cache' ? 'var(--purple)' 
    : level === 'done' ? 'var(--cyan)' 
    : level === 'api' ? 'var(--orange)'
    : 'var(--text-dim)';
  el.innerHTML += `<div><span style="color:var(--border)">[${ts}]</span> <span style="color:${color}">[${level.toUpperCase()}]</span> ${escHtml(msg)}</div>`;
  el.scrollTop = el.scrollHeight;
}

function toggleDebug() {
  const drawer = document.getElementById('debug-drawer');
  if (drawer.classList.contains('open')) {
    closeDebugDrawer();
  } else {
    drawer.classList.add('open');
    document.getElementById('debug-drawer-overlay').classList.add('open');
    const log = document.getElementById('debug-log');
    if (log) log.scrollTop = log.scrollHeight;
  }
}

function closeDebugDrawer() {
  document.getElementById('debug-drawer').classList.remove('open');
  document.getElementById('debug-drawer-overlay').classList.remove('open');
}

function clearDebug() {
  state.debugLogs = [];
  const el = document.getElementById('debug-log');
  if (el) el.innerHTML = '';
}

// Expose to global scope for HTML onclick handlers
window.toggleDebug = toggleDebug;
window.closeDebugDrawer = closeDebugDrawer;
window.clearDebug = clearDebug;

// ══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ══════════════════════════════════════════════════════════════════════════════

function getDateRange(yearsBack) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - yearsBack);
  
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
    startMonth: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    endMonth: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`,
    startYear: String(start.getFullYear()),
    endYear: String(end.getFullYear()),
  };
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function showLoading(show) {
  const indicator = document.getElementById('loading-indicator');
  if (show) {
    indicator.classList.add('active');
  } else {
    indicator.classList.remove('active');
  }
}

function updateFooter(footerId, count, startDate, endDate) {
  const footer = document.getElementById(footerId);
  if (footer) {
    footer.innerHTML = `
      <span class="data-count">数据点: ${count}</span>
      <span class="data-range">时间范围: ${startDate} ~ ${endDate}</span>
    `;
  }
}

function showChartError(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const container = canvas.parentElement;
  container.innerHTML = `
    <div class="chart-error">
      <span class="chart-error-icon">⚠️</span>
      <span class="chart-error-message">${escHtml(message)}</span>
    </div>
  `;
}

function showNoData(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const container = canvas.parentElement;
  container.innerHTML = `<div class="chart-no-data">暂无数据</div>`;
}

function resetChartContainer(canvasId) {
  const container = document.querySelector(`#${canvasId}`)?.parentElement;
  if (container) {
    container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Cache Functions
// ══════════════════════════════════════════════════════════════════════════════

async function loadCache() {
  try {
    debugLog('cache', '正在读取本地缓存...');
    const response = await fetch(CACHE_API);
    if (response.ok) {
      const data = await response.json();
      if (data && Object.keys(data).length > 0) {
        state.cache = data;
        debugLog('ok', `本地缓存加载成功，包含 ${Object.keys(data).length} 个数据类型`);
        return data;
      }
    }
    debugLog('info', '本地缓存为空');
    return null;
  } catch (error) {
    debugLog('error', `读取缓存失败: ${error.message}`);
    return null;
  }
}

async function saveCache(key, data, latestDate) {
  try {
    const today = getTodayStr();
    const payload = {
      data,
      updated: today,
      latestDate: latestDate || today,
    };
    
    const response = await fetch(`${CACHE_API}/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      debugLog('cache', `${key} 数据已缓存到本地`);
      // Update local state
      if (!state.cache) state.cache = {};
      state.cache[key] = payload;
    }
  } catch (error) {
    debugLog('error', `保存缓存失败 [${key}]: ${error.message}`);
  }
}

function shouldRefreshCache(key) {
  if (!state.cache || !state.cache[key]) {
    debugLog('info', `${key}: 无缓存，需要刷新`);
    return true;
  }
  
  const cached = state.cache[key];
  
  // If cached data is empty array, force refresh
  if (!cached.data || (Array.isArray(cached.data) && cached.data.length === 0)) {
    debugLog('info', `${key}: 缓存数据为空，需要刷新`);
    return true;
  }
  
  const today = getTodayStr();
  const latestDate = cached.latestDate || cached.updated;
  
  if (latestDate < today) {
    debugLog('info', `${key}: 缓存数据最新日期 ${latestDate} 早于今天 ${today}，需要刷新`);
    return true;
  }
  
  debugLog('cache', `${key}: 使用缓存数据（最新日期: ${latestDate}，${cached.data.length} 条记录）`);
  return false;
}

function getLatestDateFromData(data, dateField = 'date') {
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  
  const dates = data.map(item => item[dateField]).filter(Boolean).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

// ══════════════════════════════════════════════════════════════════════════════
// API Functions (Serial)
// ══════════════════════════════════════════════════════════════════════════════

async function fetchWithRetry(url, retries = 2, delay = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      debugLog('api', `请求: ${url}${i > 0 ? ` (重试 ${i})` : ''}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        const errText = await response.text();
        debugLog('error', `HTTP 错误 ${response.status}: ${errText}`);
        if (i < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return { error: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      debugLog('info', `响应内容: ${JSON.stringify(data).substring(0, 200)}...`);
      
      if (data.error) {
        debugLog('error', `API 错误: ${data.error}`);
        if (i < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return { error: data.error };
      }
      
      const count = data.total !== undefined ? data.total : (Array.isArray(data.data) ? data.data.length : 0);
      debugLog('ok', `响应成功: ${count} 条数据`);
      return data;
    } catch (error) {
      debugLog('error', `请求失败: ${error.message}`);
      console.error('Fetch error:', error);
      if (i < retries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return { error: error.message };
    }
  }
  return { error: '请求失败' };
}

async function fetchDepositRate(startDate, endDate) {
  return fetchWithRetry(`${API_BASE}/query_deposit_rate_data?start_date=${startDate}&end_date=${endDate}`);
}

async function fetchLoanRate(startDate, endDate) {
  return fetchWithRetry(`${API_BASE}/query_loan_rate_data?start_date=${startDate}&end_date=${endDate}`);
}

async function fetchReserveRatio(startDate, endDate) {
  return fetchWithRetry(`${API_BASE}/query_required_reserve_ratio_data?start_date=${startDate}&end_date=${endDate}`);
}

async function fetchMoneySupplyMonth(startMonth, endMonth) {
  return fetchWithRetry(`${API_BASE}/query_money_supply_data_month?start_date=${startMonth}&end_date=${endMonth}`);
}

async function fetchMoneySupplyYear(startYear, endYear) {
  return fetchWithRetry(`${API_BASE}/query_money_supply_data_year?start_date=${startYear}&end_date=${endYear}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Chart Rendering Functions
// ══════════════════════════════════════════════════════════════════════════════

function renderDepositRateChart(data, startDate, endDate) {
  const canvasId = 'deposit-rate-chart';
  const footerId = 'deposit-rate-footer';
  
  resetChartContainer(canvasId);
  
  if (!data || data.length === 0) {
    showNoData(canvasId);
    updateFooter(footerId, 0, startDate, endDate);
    return;
  }

  // BaoStock deposit rate API returns: pubDate, demandDepositRate, fixedDepositRate3Month, etc.
  // Map to different rate types
  const rateTypeMapping = {
    'demandDepositRate': '活期存款',
    'fixedDepositRate3Month': '3个月定期',
    'fixedDepositRate6Month': '6个月定期',
    'fixedDepositRate1Year': '1年定期',
    'fixedDepositRate2Year': '2年定期',
    'fixedDepositRate3Year': '3年定期',
  };

  const colors = [CHART_COLORS.cyan, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.purple, CHART_COLORS.pink, CHART_COLORS.yellow];
  const colorsBg = [CHART_COLORS.cyanLight, CHART_COLORS.greenLight, CHART_COLORS.orangeLight, CHART_COLORS.purpleLight, CHART_COLORS.pinkLight, CHART_COLORS.yellowLight];
  
  const datasets = Object.entries(rateTypeMapping).map(([field, label], index) => ({
    label,
    data: data.map(item => ({
      x: item.pubDate || item.date,
      y: parseFloat(item[field]) || 0,
    })).filter(d => d.y > 0),
    borderColor: colors[index % colors.length],
    backgroundColor: colorsBg[index % colorsBg.length],
    borderWidth: 2,
    tension: 0.3,
    fill: false,
    pointRadius: 4,
    pointHoverRadius: 6,
    stepped: 'after', // Step chart for rate changes
  }));

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  
  state.charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`,
          },
        },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        x: {
          ...CHART_DEFAULTS.scales.x,
          type: 'time',
          time: {
            unit: 'month',
            displayFormats: { month: 'yyyy-MM' },
          },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: { display: true, text: '利率 (%)', color: '#8892a4' },
        },
      },
    },
  });

  updateFooter(footerId, data.length, startDate, endDate);
  debugLog('done', `存款利率图表渲染完成，${Object.keys(rateTypeMapping).length} 个类型，${data.length} 条数据`);
}

function renderLoanRateChart(data, startDate, endDate) {
  const canvasId = 'loan-rate-chart';
  const footerId = 'loan-rate-footer';
  
  resetChartContainer(canvasId);
  
  if (!data || data.length === 0) {
    showNoData(canvasId);
    updateFooter(footerId, 0, startDate, endDate);
    return;
  }

  // BaoStock loan rate API returns: pubDate, loanRate6Month, loanRate6MonthTo1Year, etc.
  const rateTypeMapping = {
    'loanRate6Month': '6个月内',
    'loanRate6MonthTo1Year': '6个月-1年',
    'loanRate1YearTo3Year': '1-3年',
    'loanRate3YearTo5Year': '3-5年',
    'loanRateAbove5Year': '5年以上',
    'mortgateRateBelow5Year': '公积金5年内',
    'mortgateRateAbove5Year': '公积金5年以上',
  };

  const colors = [CHART_COLORS.orange, CHART_COLORS.cyan, CHART_COLORS.purple, CHART_COLORS.green, CHART_COLORS.pink, CHART_COLORS.yellow, CHART_COLORS.blue];
  const colorsBg = [CHART_COLORS.orangeLight, CHART_COLORS.cyanLight, CHART_COLORS.purpleLight, CHART_COLORS.greenLight, CHART_COLORS.pinkLight, CHART_COLORS.yellowLight, CHART_COLORS.blueLight];
  
  const datasets = Object.entries(rateTypeMapping).map(([field, label], index) => ({
    label,
    data: data.map(item => ({
      x: item.pubDate || item.date,
      y: parseFloat(item[field]) || 0,
    })).filter(d => d.y > 0),
    borderColor: colors[index % colors.length],
    backgroundColor: colorsBg[index % colorsBg.length],
    borderWidth: 2,
    tension: 0.3,
    fill: false,
    pointRadius: 4,
    pointHoverRadius: 6,
    stepped: 'after',
  }));

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  
  state.charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`,
          },
        },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        x: {
          ...CHART_DEFAULTS.scales.x,
          type: 'time',
          time: {
            unit: 'month',
            displayFormats: { month: 'yyyy-MM' },
          },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: { display: true, text: '利率 (%)', color: '#8892a4' },
        },
      },
    },
  });

  updateFooter(footerId, data.length, startDate, endDate);
  debugLog('done', `贷款利率图表渲染完成，${Object.keys(rateTypeMapping).length} 个类型，${data.length} 条数据`);
}

function renderReserveRatioChart(data, startDate, endDate) {
  const canvasId = 'reserve-ratio-chart';
  const footerId = 'reserve-ratio-footer';
  
  resetChartContainer(canvasId);
  
  if (!data || data.length === 0) {
    showNoData(canvasId);
    updateFooter(footerId, 0, startDate, endDate);
    return;
  }

  // BaoStock reserve ratio API returns: pubDate, effectiveDate, 
  // bigInstitutionsRatioAfter, mediumInstitutionsRatioAfter
  const datasets = [
    {
      label: '大型金融机构',
      data: data.map(item => ({
        x: item.effectiveDate || item.pubDate || item.date,
        y: parseFloat(item.bigInstitutionsRatioAfter || item.ratioInLargeBank) || 0,
      })).filter(d => d.y > 0),
      borderColor: CHART_COLORS.purple,
      backgroundColor: CHART_COLORS.purpleLight,
      borderWidth: 2,
      tension: 0.3,
      fill: true,
      pointRadius: 4,
      pointHoverRadius: 6,
      stepped: 'after',
    },
    {
      label: '中小型金融机构',
      data: data.map(item => ({
        x: item.effectiveDate || item.pubDate || item.date,
        y: parseFloat(item.mediumInstitutionsRatioAfter || item.ratioInSmallBank) || 0,
      })).filter(d => d.y > 0),
      borderColor: CHART_COLORS.green,
      backgroundColor: CHART_COLORS.greenLight,
      borderWidth: 2,
      tension: 0.3,
      fill: true,
      pointRadius: 4,
      pointHoverRadius: 6,
      stepped: 'after',
    },
  ];

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  
  state.charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`,
          },
        },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        x: {
          ...CHART_DEFAULTS.scales.x,
          type: 'time',
          time: {
            unit: 'month',
            displayFormats: { month: 'yyyy-MM' },
          },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: { display: true, text: '准备金率 (%)', color: '#8892a4' },
        },
      },
    },
  });

  updateFooter(footerId, data.length, startDate, endDate);
  debugLog('done', `存款准备金率图表渲染完成，${data.length} 条数据`);
}

function renderMoneySupplyMonthChart(data, startMonth, endMonth) {
  const canvasId = 'money-supply-month-chart';
  const footerId = 'money-supply-month-footer';
  
  resetChartContainer(canvasId);
  
  if (!data || data.length === 0) {
    showNoData(canvasId);
    updateFooter(footerId, 0, startMonth, endMonth);
    return;
  }

  const labels = data.map(item => `${item.statYear}-${String(item.statMonth).padStart(2, '0')}`);
  // Handle both m0YOY (uppercase from API) and m0YoY (camelCase)
  const m0YoY = data.map(item => parseFloat(item.m0YoY || item.m0YOY) || 0);
  const m1YoY = data.map(item => parseFloat(item.m1YoY || item.m1YOY) || 0);
  const m2YoY = data.map(item => parseFloat(item.m2YoY || item.m2YOY) || 0);

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  
  state.charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'M0 同比增长',
          data: m0YoY,
          borderColor: CHART_COLORS.cyan,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 1,
          pointHoverRadius: 4,
        },
        {
          label: 'M1 同比增长',
          data: m1YoY,
          borderColor: CHART_COLORS.orange,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 1,
          pointHoverRadius: 4,
        },
        {
          label: 'M2 同比增长',
          data: m2YoY,
          borderColor: CHART_COLORS.purple,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 1,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`,
          },
        },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: { display: true, text: '同比增长率 (%)', color: '#8892a4' },
        },
      },
    },
  });

  updateFooter(footerId, data.length, startMonth, endMonth);
  debugLog('done', `货币供应量（月度）图表渲染完成，${data.length} 条数据`);
}

function renderMoneySupplyYearChart(data, startYear, endYear) {
  const canvasId = 'money-supply-year-chart';
  const footerId = 'money-supply-year-footer';
  
  resetChartContainer(canvasId);
  
  if (!data || data.length === 0) {
    showNoData(canvasId);
    updateFooter(footerId, 0, startYear, endYear);
    return;
  }

  const labels = data.map(item => item.statYear);
  const m0 = data.map(item => (parseFloat(item.m0) || 0) / 10000);
  const m1 = data.map(item => (parseFloat(item.m1) || 0) / 10000);
  const m2 = data.map(item => (parseFloat(item.m2) || 0) / 10000);

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  
  state.charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'M0 (流通中货币)',
          data: m0,
          backgroundColor: CHART_COLORS.cyan,
          borderColor: CHART_COLORS.cyan,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'M1 (狭义货币)',
          data: m1,
          backgroundColor: CHART_COLORS.orange,
          borderColor: CHART_COLORS.orange,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'M2 (广义货币)',
          data: m2,
          backgroundColor: CHART_COLORS.purple,
          borderColor: CHART_COLORS.purple,
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} 万亿元`,
          },
        },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: { display: true, text: '余额 (万亿元)', color: '#8892a4' },
          beginAtZero: true,
        },
      },
    },
  });

  updateFooter(footerId, data.length, startYear, endYear);
  debugLog('done', `货币供应量（年度）图表渲染完成，${data.length} 条数据`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Data Loading (Serial)
// ══════════════════════════════════════════════════════════════════════════════

async function loadAllData(forceRefresh = false) {
  const range = getDateRange(state.timeRange);
  showLoading(true);
  
  debugLog('info', `开始加载数据，时间跨度: ${state.timeRange} 年`);
  debugLog('info', `日期范围: ${range.startDate} ~ ${range.endDate}`);

  try {
    // Load cache first
    if (!state.cache) {
      await loadCache();
    }

    // 1. Deposit Rate
    debugLog('info', '── 存款利率 ──');
    let depositData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.DEPOSIT_RATE]?.data) {
      if (!shouldRefreshCache(DATA_KEYS.DEPOSIT_RATE)) {
        depositData = state.cache[DATA_KEYS.DEPOSIT_RATE].data;
      }
    }
    if (!depositData) {
      const res = await fetchDepositRate(range.startDate, range.endDate);
      if (res.error) {
        showChartError('deposit-rate-chart', res.error);
      } else {
        depositData = res.data;
        const latestDate = getLatestDateFromData(depositData, 'date');
        await saveCache(DATA_KEYS.DEPOSIT_RATE, depositData, latestDate);
      }
    }
    if (depositData) {
      renderDepositRateChart(depositData, range.startDate, range.endDate);
    }

    // Small delay between requests to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 200));

    // 2. Loan Rate
    debugLog('info', '── 贷款利率 ──');
    let loanData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.LOAN_RATE]?.data) {
      if (!shouldRefreshCache(DATA_KEYS.LOAN_RATE)) {
        loanData = state.cache[DATA_KEYS.LOAN_RATE].data;
      }
    }
    if (!loanData) {
      const res = await fetchLoanRate(range.startDate, range.endDate);
      if (res.error) {
        showChartError('loan-rate-chart', res.error);
      } else {
        loanData = res.data;
        const latestDate = getLatestDateFromData(loanData, 'date');
        await saveCache(DATA_KEYS.LOAN_RATE, loanData, latestDate);
      }
    }
    if (loanData) {
      renderLoanRateChart(loanData, range.startDate, range.endDate);
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    // 3. Reserve Ratio
    debugLog('info', '── 存款准备金率 ──');
    let reserveData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.RESERVE_RATIO]?.data) {
      if (!shouldRefreshCache(DATA_KEYS.RESERVE_RATIO)) {
        reserveData = state.cache[DATA_KEYS.RESERVE_RATIO].data;
      }
    }
    if (!reserveData) {
      const res = await fetchReserveRatio(range.startDate, range.endDate);
      if (res.error) {
        showChartError('reserve-ratio-chart', res.error);
      } else {
        reserveData = res.data;
        const latestDate = getLatestDateFromData(reserveData, 'date');
        await saveCache(DATA_KEYS.RESERVE_RATIO, reserveData, latestDate);
      }
    }
    if (reserveData) {
      renderReserveRatioChart(reserveData, range.startDate, range.endDate);
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    // 4. Money Supply Month
    debugLog('info', '── 货币供应量（月度） ──');
    let moneyMonthData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.MONEY_SUPPLY_MONTH]?.data) {
      if (!shouldRefreshCache(DATA_KEYS.MONEY_SUPPLY_MONTH)) {
        moneyMonthData = state.cache[DATA_KEYS.MONEY_SUPPLY_MONTH].data;
      }
    }
    if (!moneyMonthData) {
      const res = await fetchMoneySupplyMonth(range.startMonth, range.endMonth);
      if (res.error) {
        showChartError('money-supply-month-chart', res.error);
      } else {
        moneyMonthData = res.data;
        // For month data, construct date from statYear and statMonth
        const latestDate = moneyMonthData?.length > 0 
          ? `${moneyMonthData[moneyMonthData.length - 1].statYear}-${String(moneyMonthData[moneyMonthData.length - 1].statMonth).padStart(2, '0')}-01`
          : null;
        await saveCache(DATA_KEYS.MONEY_SUPPLY_MONTH, moneyMonthData, latestDate);
      }
    }
    if (moneyMonthData) {
      renderMoneySupplyMonthChart(moneyMonthData, range.startMonth, range.endMonth);
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    // 5. Money Supply Year
    debugLog('info', '── 货币供应量（年度） ──');
    let moneyYearData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.MONEY_SUPPLY_YEAR]?.data) {
      if (!shouldRefreshCache(DATA_KEYS.MONEY_SUPPLY_YEAR)) {
        moneyYearData = state.cache[DATA_KEYS.MONEY_SUPPLY_YEAR].data;
      }
    }
    if (!moneyYearData) {
      const res = await fetchMoneySupplyYear(range.startYear, range.endYear);
      if (res.error) {
        showChartError('money-supply-year-chart', res.error);
      } else {
        moneyYearData = res.data;
        const latestDate = moneyYearData?.length > 0 
          ? `${moneyYearData[moneyYearData.length - 1].statYear}-12-31`
          : null;
        await saveCache(DATA_KEYS.MONEY_SUPPLY_YEAR, moneyYearData, latestDate);
      }
    }
    if (moneyYearData) {
      renderMoneySupplyYearChart(moneyYearData, range.startYear, range.endYear);
    }

    debugLog('done', '所有数据加载完成！');

  } catch (error) {
    debugLog('error', `数据加载异常: ${error.message}`);
    console.error('Error loading data:', error);
  } finally {
    showLoading(false);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Status Check
// ══════════════════════════════════════════════════════════════════════════════

async function checkStatus() {
  try {
    const r = await fetch('/api/session/status');
    const d = await r.json();
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if (d.logged_in) {
      dot.className = 'status-dot online';
      txt.textContent = `BaoStock 已连接`;
    } else {
      dot.className = 'status-dot offline';
      txt.textContent = d.connection_mode === 'per_call' ? '按需模式' : '未连接';
    }
  } catch {
    document.getElementById('status-dot').className = 'status-dot offline';
    document.getElementById('status-text').textContent = '服务不可达';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Event Handlers
// ══════════════════════════════════════════════════════════════════════════════

function handleTimeRangeChange(event) {
  state.timeRange = parseInt(event.target.value, 10);
  debugLog('info', `时间跨度已更改为 ${state.timeRange} 年`);
  loadAllData(false);
}

function handleRefresh() {
  debugLog('info', '用户点击刷新数据，强制从 API 获取最新数据');
  loadAllData(true);
}

// Expose to global scope
window.handleRefresh = handleRefresh;

// ══════════════════════════════════════════════════════════════════════════════
// Initialization
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  debugLog('info', '页面初始化');
  
  // Set up event listeners
  document.getElementById('time-range')?.addEventListener('change', handleTimeRangeChange);
  document.getElementById('refresh-btn')?.addEventListener('click', handleRefresh);

  // Check status
  checkStatus();
  setInterval(checkStatus, 30000);

  // Load initial data
  loadAllData(false);
});