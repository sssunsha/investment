// js/basic-info/main.js — 状态、Debug、缓存、API、数据加载

import {
  renderDepositRateChart,
  renderLoanRateChart,
  renderReserveRatioChart,
  renderMoneySupplyMonthChart,
  renderMoneySupplyYearChart,
  showChartError,
} from './charts.js';

// ── 常量 ──────────────────────────────────────────────────────────────────────

const API_BASE  = '/api/macroscopic';
const CACHE_API = '/api/cache/macro';

const DATA_KEYS = {
  DEPOSIT_RATE:        'deposit_rate',
  LOAN_RATE:           'loan_rate',
  RESERVE_RATIO:       'reserve_ratio',
  MONEY_SUPPLY_MONTH:  'money_supply_month',
  MONEY_SUPPLY_YEAR:   'money_supply_year',
};

// ── 状态 ──────────────────────────────────────────────────────────────────────

const state = {
  timeRange: 1,
  cache:     null,
  debugLogs: [],
};

// ── Debug ─────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function debugLog(level, msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  state.debugLogs.push({ ts, level, msg });
  const el = document.getElementById('debug-log');
  if (!el) return;
  const color = level === 'error' ? 'var(--red)'
    : level === 'ok'    ? 'var(--green)'
    : level === 'cache' ? 'var(--purple)'
    : level === 'done'  ? 'var(--cyan)'
    : level === 'api'   ? 'var(--orange)'
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

window.toggleDebug      = toggleDebug;
window.closeDebugDrawer = closeDebugDrawer;
window.clearDebug       = clearDebug;

// ── 工具 ──────────────────────────────────────────────────────────────────────

function getDateRange(yearsBack) {
  const end   = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - yearsBack);
  return {
    startDate:  start.toISOString().split('T')[0],
    endDate:    end.toISOString().split('T')[0],
    startMonth: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    endMonth:   `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`,
    startYear:  String(start.getFullYear()),
    endYear:    String(end.getFullYear()),
  };
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function showLoading(show) {
  document.getElementById('loading-indicator')?.classList.toggle('active', show);
}

// ── 缓存 ──────────────────────────────────────────────────────────────────────

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
    const today   = getTodayStr();
    const payload = { data, updated: today, latestDate: latestDate || today };
    const response = await fetch(`${CACHE_API}/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      debugLog('cache', `${key} 数据已缓存到本地`);
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
  if (!cached.data || (Array.isArray(cached.data) && cached.data.length === 0)) {
    debugLog('info', `${key}: 缓存数据为空，需要刷新`);
    return true;
  }
  const today      = getTodayStr();
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

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchWithRetry(url, retries = 2, delay = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      debugLog('api', `请求: ${url}${i > 0 ? ` (重试 ${i})` : ''}`);
      const response = await fetch(url);
      if (!response.ok) {
        const errText = await response.text();
        debugLog('error', `HTTP 错误 ${response.status}: ${errText}`);
        if (i < retries) { await new Promise(r => setTimeout(r, delay)); continue; }
        return { error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      debugLog('info', `响应内容: ${JSON.stringify(data).substring(0, 200)}...`);
      if (data.error) {
        debugLog('error', `API 错误: ${data.error}`);
        if (i < retries) { await new Promise(r => setTimeout(r, delay)); continue; }
        return { error: data.error };
      }
      const count = data.total !== undefined ? data.total : (Array.isArray(data.data) ? data.data.length : 0);
      debugLog('ok', `响应成功: ${count} 条数据`);
      return data;
    } catch (error) {
      debugLog('error', `请求失败: ${error.message}`);
      console.error('Fetch error:', error);
      if (i < retries) { await new Promise(r => setTimeout(r, delay)); continue; }
      return { error: error.message };
    }
  }
  return { error: '请求失败' };
}

function fetchDepositRate(startDate, endDate) {
  return fetchWithRetry(`${API_BASE}/query_deposit_rate_data?start_date=${startDate}&end_date=${endDate}`);
}
function fetchLoanRate(startDate, endDate) {
  return fetchWithRetry(`${API_BASE}/query_loan_rate_data?start_date=${startDate}&end_date=${endDate}`);
}
function fetchReserveRatio(startDate, endDate) {
  return fetchWithRetry(`${API_BASE}/query_required_reserve_ratio_data?start_date=${startDate}&end_date=${endDate}`);
}
function fetchMoneySupplyMonth(startMonth, endMonth) {
  return fetchWithRetry(`${API_BASE}/query_money_supply_data_month?start_date=${startMonth}&end_date=${endMonth}`);
}
function fetchMoneySupplyYear(startYear, endYear) {
  return fetchWithRetry(`${API_BASE}/query_money_supply_data_year?start_date=${startYear}&end_date=${endYear}`);
}

// ── 数据加载 ──────────────────────────────────────────────────────────────────

async function loadAllData(forceRefresh = false) {
  const range = getDateRange(state.timeRange);
  showLoading(true);
  debugLog('info', `开始加载数据，时间跨度: ${state.timeRange} 年`);
  debugLog('info', `日期范围: ${range.startDate} ~ ${range.endDate}`);

  try {
    if (!state.cache) await loadCache();

    // 1. 存款利率
    debugLog('info', '── 存款利率 ──');
    let depositData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.DEPOSIT_RATE]?.data && !shouldRefreshCache(DATA_KEYS.DEPOSIT_RATE)) {
      depositData = state.cache[DATA_KEYS.DEPOSIT_RATE].data;
    }
    if (!depositData) {
      const res = await fetchDepositRate(range.startDate, range.endDate);
      if (res.error) { showChartError('deposit-rate-chart', res.error); }
      else {
        depositData = res.data;
        await saveCache(DATA_KEYS.DEPOSIT_RATE, depositData, getLatestDateFromData(depositData, 'date'));
      }
    }
    if (depositData) {
      renderDepositRateChart(depositData, range.startDate, range.endDate);
      debugLog('done', `存款利率图表渲染完成，${depositData.length} 条数据`);
    }
    await new Promise(r => setTimeout(r, 200));

    // 2. 贷款利率
    debugLog('info', '── 贷款利率 ──');
    let loanData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.LOAN_RATE]?.data && !shouldRefreshCache(DATA_KEYS.LOAN_RATE)) {
      loanData = state.cache[DATA_KEYS.LOAN_RATE].data;
    }
    if (!loanData) {
      const res = await fetchLoanRate(range.startDate, range.endDate);
      if (res.error) { showChartError('loan-rate-chart', res.error); }
      else {
        loanData = res.data;
        await saveCache(DATA_KEYS.LOAN_RATE, loanData, getLatestDateFromData(loanData, 'date'));
      }
    }
    if (loanData) {
      renderLoanRateChart(loanData, range.startDate, range.endDate);
      debugLog('done', `贷款利率图表渲染完成，${loanData.length} 条数据`);
    }
    await new Promise(r => setTimeout(r, 200));

    // 3. 存款准备金率
    debugLog('info', '── 存款准备金率 ──');
    let reserveData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.RESERVE_RATIO]?.data && !shouldRefreshCache(DATA_KEYS.RESERVE_RATIO)) {
      reserveData = state.cache[DATA_KEYS.RESERVE_RATIO].data;
    }
    if (!reserveData) {
      const res = await fetchReserveRatio(range.startDate, range.endDate);
      if (res.error) { showChartError('reserve-ratio-chart', res.error); }
      else {
        reserveData = res.data;
        await saveCache(DATA_KEYS.RESERVE_RATIO, reserveData, getLatestDateFromData(reserveData, 'date'));
      }
    }
    if (reserveData) {
      renderReserveRatioChart(reserveData, range.startDate, range.endDate);
      debugLog('done', `存款准备金率图表渲染完成，${reserveData.length} 条数据`);
    }
    await new Promise(r => setTimeout(r, 200));

    // 4. 货币供应量（月度）
    debugLog('info', '── 货币供应量（月度） ──');
    let moneyMonthData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.MONEY_SUPPLY_MONTH]?.data && !shouldRefreshCache(DATA_KEYS.MONEY_SUPPLY_MONTH)) {
      moneyMonthData = state.cache[DATA_KEYS.MONEY_SUPPLY_MONTH].data;
    }
    if (!moneyMonthData) {
      const res = await fetchMoneySupplyMonth(range.startMonth, range.endMonth);
      if (res.error) { showChartError('money-supply-month-chart', res.error); }
      else {
        moneyMonthData = res.data;
        const latestDate = moneyMonthData?.length > 0
          ? `${moneyMonthData[moneyMonthData.length - 1].statYear}-${String(moneyMonthData[moneyMonthData.length - 1].statMonth).padStart(2, '0')}-01`
          : null;
        await saveCache(DATA_KEYS.MONEY_SUPPLY_MONTH, moneyMonthData, latestDate);
      }
    }
    if (moneyMonthData) {
      renderMoneySupplyMonthChart(moneyMonthData, range.startMonth, range.endMonth);
      debugLog('done', `货币供应量（月度）图表渲染完成，${moneyMonthData.length} 条数据`);
    }
    await new Promise(r => setTimeout(r, 200));

    // 5. 货币供应量（年度）
    debugLog('info', '── 货币供应量（年度） ──');
    let moneyYearData;
    if (!forceRefresh && state.cache?.[DATA_KEYS.MONEY_SUPPLY_YEAR]?.data && !shouldRefreshCache(DATA_KEYS.MONEY_SUPPLY_YEAR)) {
      moneyYearData = state.cache[DATA_KEYS.MONEY_SUPPLY_YEAR].data;
    }
    if (!moneyYearData) {
      const res = await fetchMoneySupplyYear(range.startYear, range.endYear);
      if (res.error) { showChartError('money-supply-year-chart', res.error); }
      else {
        moneyYearData = res.data;
        const latestDate = moneyYearData?.length > 0
          ? `${moneyYearData[moneyYearData.length - 1].statYear}-12-31`
          : null;
        await saveCache(DATA_KEYS.MONEY_SUPPLY_YEAR, moneyYearData, latestDate);
      }
    }
    if (moneyYearData) {
      renderMoneySupplyYearChart(moneyYearData, range.startYear, range.endYear);
      debugLog('done', `货币供应量（年度）图表渲染完成，${moneyYearData.length} 条数据`);
    }

    debugLog('done', '所有数据加载完成！');
  } catch (error) {
    debugLog('error', `数据加载异常: ${error.message}`);
    console.error('Error loading data:', error);
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
      dot.className  = 'status-dot online';
      txt.textContent = 'BaoStock 已连接';
    } else {
      dot.className  = 'status-dot offline';
      txt.textContent = d.connection_mode === 'per_call' ? '按需模式' : '未连接';
    }
  } catch {
    document.getElementById('status-dot').className = 'status-dot offline';
    document.getElementById('status-text').textContent = '服务不可达';
  }
}

// ── 事件处理 ──────────────────────────────────────────────────────────────────

function handleTimeRangeChange(event) {
  state.timeRange = parseInt(event.target.value, 10);
  debugLog('info', `时间跨度已更改为 ${state.timeRange} 年`);
  loadAllData(false);
}

function handleRefresh() {
  debugLog('info', '用户点击刷新数据，强制从 API 获取最新数据');
  loadAllData(true);
}

window.handleRefresh = handleRefresh;

// ── 初始化 ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  debugLog('info', '页面初始化');
  document.getElementById('time-range')?.addEventListener('change', handleTimeRangeChange);
  document.getElementById('refresh-btn')?.addEventListener('click', handleRefresh);
  checkStatus();
  setInterval(checkStatus, 30000);
  loadAllData(false);
});
