// js/basic-info/charts.js — 图表常量、状态、4个渲染函数

// ── 常量 ──────────────────────────────────────────────────────────────────────

export const CHART_COLORS = {
  cyan:        'rgba(6, 182, 212, 1)',
  cyanLight:   'rgba(6, 182, 212, 0.2)',
  green:       'rgba(34, 197, 94, 1)',
  greenLight:  'rgba(34, 197, 94, 0.2)',
  orange:      'rgba(249, 115, 22, 1)',
  orangeLight: 'rgba(249, 115, 22, 0.2)',
  purple:      'rgba(168, 85, 247, 1)',
  purpleLight: 'rgba(168, 85, 247, 0.2)',
  pink:        'rgba(236, 72, 153, 1)',
  pinkLight:   'rgba(236, 72, 153, 0.2)',
  yellow:      'rgba(245, 158, 11, 1)',
  yellowLight: 'rgba(245, 158, 11, 0.2)',
  blue:        'rgba(59, 130, 246, 1)',
  blueLight:   'rgba(59, 130, 246, 0.2)',
  red:         'rgba(239, 68, 68, 1)',
  redLight:    'rgba(239, 68, 68, 0.2)',
  lime:        'rgba(132, 204, 22, 1)',
  limeLight:   'rgba(132, 204, 22, 0.2)',
};

export const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: {
      position: 'top',
      labels: { color: '#8892a4', font: { size: 11 }, boxWidth: 12, padding: 15 },
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

// ── 图表状态（模块内部） ───────────────────────────────────────────────────────

const _charts = {};

// ── DOM 辅助 ──────────────────────────────────────────────────────────────────

function _escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function resetChartContainer(canvasId) {
  const container = document.querySelector(`#${canvasId}`)?.parentElement;
  if (container) container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
}

export function showChartError(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.parentElement.innerHTML = `
    <div class="chart-error">
      <span class="chart-error-icon">⚠️</span>
      <span class="chart-error-message">${_escHtml(message)}</span>
    </div>
  `;
}

export function showNoData(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.parentElement.innerHTML = `<div class="chart-no-data">暂无数据</div>`;
}

export function updateFooter(footerId, count, startDate, endDate) {
  const footer = document.getElementById(footerId);
  if (footer) {
    footer.innerHTML = `
      <span class="data-count">数据点: ${count}</span>
      <span class="data-range">时间范围: ${startDate} ~ ${endDate}</span>
    `;
  }
}

// ── 私有辅助函数 ──────────────────────────────────────────────────────────────

/**
 * 销毁旧图表实例并用新配置创建新实例。
 */
function _createChart(canvasId, config) {
  if (_charts[canvasId]) _charts[canvasId].destroy();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  _charts[canvasId] = new Chart(ctx, config);
}

/**
 * 无数据时执行重置+提示+更新页脚，返回 true 表示调用方应提前退出。
 */
function _guardChart(canvasId, footerId, data, start, end) {
  resetChartContainer(canvasId);
  if (!data || data.length === 0) {
    showNoData(canvasId);
    updateFooter(footerId, 0, start, end);
    return true;
  }
  return false;
}

/**
 * 构建时间轴图表的通用 options 对象（存贷款利率、存款准备金率均使用）。
 */
function _timeScaleOptions(startDate, endDate, yTitle, tooltipSuffix = '%') {
  return {
    ...CHART_DEFAULTS,
    plugins: {
      ...CHART_DEFAULTS.plugins,
      tooltip: {
        ...CHART_DEFAULTS.plugins.tooltip,
        callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}${tooltipSuffix}` },
      },
    },
    scales: {
      ...CHART_DEFAULTS.scales,
      x: { ...CHART_DEFAULTS.scales.x, type: 'time', min: startDate, max: endDate, time: { unit: 'month', displayFormats: { month: 'yyyy-MM' } } },
      y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: yTitle, color: '#8892a4' } },
    },
  };
}

/**
 * 在时间范围起点和终点各注入锚点，使阶梯线在选中窗口内完整延伸。
 * allData 须为全史数据；返回数组含起始锚点 + 范围内数据点 + 终止锚点。
 */
function _extendRateData(allData, startDate, endDate, dateField = 'pubDate') {
  if (!allData || allData.length === 0) return [];
  const sorted = [...allData].sort((a, b) => (a[dateField] || '').localeCompare(b[dateField] || ''));
  const beforeOrAt = sorted.filter(d => (d[dateField] || '') <= startDate);
  const after = sorted.filter(d => (d[dateField] || '') > startDate && (d[dateField] || '') <= endDate);
  const anchor = beforeOrAt.length > 0 ? { ...beforeOrAt.at(-1), [dateField]: startDate } : null;
  const result = anchor ? [anchor, ...after] : after;
  if (result.length > 0 && result.at(-1)[dateField] < endDate) {
    result.push({ ...result.at(-1), [dateField]: endDate });
  }
  return result;
}

/**
 * 渲染阶梯式利率折线图（存款利率与贷款利率共用）。
 * @param {string} canvasId
 * @param {string} footerId
 * @param {Array}  data
 * @param {string} startDate
 * @param {string} endDate
 * @param {{ dateField: string, rateFields: Object, colors: string[], colorsBg: string[], yTitle: string }} opts
 */
function _renderSteppedRateChart(canvasId, footerId, data, startDate, endDate, opts) {
  if (_guardChart(canvasId, footerId, data, startDate, endDate)) return;
  const { dateField, rateFields, colors, colorsBg, yTitle } = opts;
  const displayData = _extendRateData(data, startDate, endDate, dateField);
  const datasets = Object.entries(rateFields).map(([field, label], i) => ({
    label,
    data: displayData.map(item => ({ x: item[dateField] || item.pubDate || item.date, y: Number.parseFloat(item[field]) || 0 })).filter(d => d.y > 0),
    borderColor: colors[i % colors.length],
    backgroundColor: colorsBg[i % colorsBg.length],
    borderWidth: 2, tension: 0.3, fill: false,
    pointRadius: 4, pointHoverRadius: 6, stepped: 'after',
  }));
  _createChart(canvasId, { type: 'line', data: { datasets }, options: _timeScaleOptions(startDate, endDate, yTitle) });
  updateFooter(footerId, data.length, startDate, endDate);
}

// ── 导出渲染函数 ──────────────────────────────────────────────────────────────

export function renderDepositRateChart(data, startDate, endDate) {
  const rateFields = {
    demandDepositRate:      '活期存款',
    fixedDepositRate3Month: '3个月定期',
    fixedDepositRate6Month: '6个月定期',
    fixedDepositRate1Year:  '1年定期',
    fixedDepositRate2Year:  '2年定期',
    fixedDepositRate3Year:  '3年定期',
  };
  const colors   = [CHART_COLORS.cyan, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.purple, CHART_COLORS.pink, CHART_COLORS.yellow];
  const colorsBg = [CHART_COLORS.cyanLight, CHART_COLORS.greenLight, CHART_COLORS.orangeLight, CHART_COLORS.purpleLight, CHART_COLORS.pinkLight, CHART_COLORS.yellowLight];
  _renderSteppedRateChart('deposit-rate-chart', 'deposit-rate-footer', data, startDate, endDate, { dateField: 'pubDate', rateFields, colors, colorsBg, yTitle: '利率 (%)' });
}

export function renderLoanRateChart(data, startDate, endDate) {
  const rateFields = {
    loanRate6Month:          '6个月内',
    loanRate6MonthTo1Year:   '6个月-1年',
    loanRate1YearTo3Year:    '1-3年',
    loanRate3YearTo5Year:    '3-5年',
    loanRateAbove5Year:      '5年以上',
    mortgateRateBelow5Year:  '公积金5年内',
    mortgateRateAbove5Year:  '公积金5年以上',
  };
  const colors   = [CHART_COLORS.orange, CHART_COLORS.cyan, CHART_COLORS.purple, CHART_COLORS.green, CHART_COLORS.pink, CHART_COLORS.yellow, CHART_COLORS.blue];
  const colorsBg = [CHART_COLORS.orangeLight, CHART_COLORS.cyanLight, CHART_COLORS.purpleLight, CHART_COLORS.greenLight, CHART_COLORS.pinkLight, CHART_COLORS.yellowLight, CHART_COLORS.blueLight];
  _renderSteppedRateChart('loan-rate-chart', 'loan-rate-footer', data, startDate, endDate, { dateField: 'pubDate', rateFields, colors, colorsBg, yTitle: '利率 (%)' });
}

export function renderReserveRatioChart(data, startDate, endDate) {
  const canvasId = 'reserve-ratio-chart';
  const footerId = 'reserve-ratio-footer';
  if (_guardChart(canvasId, footerId, data, startDate, endDate)) return;
  const displayData = _extendRateData(data, startDate, endDate, 'effectiveDate');
  const datasets = [
    {
      label: '大型金融机构',
      data: displayData.map(item => ({ x: item.effectiveDate || item.pubDate || item.date, y: Number.parseFloat(item.bigInstitutionsRatioAfter || item.ratioInLargeBank) || 0 })).filter(d => d.y > 0),
      borderColor: CHART_COLORS.purple, backgroundColor: CHART_COLORS.purpleLight,
      borderWidth: 2, tension: 0.3, fill: true,
      pointRadius: 4, pointHoverRadius: 6, stepped: 'after',
    },
    {
      label: '中小型金融机构',
      data: displayData.map(item => ({ x: item.effectiveDate || item.pubDate || item.date, y: Number.parseFloat(item.mediumInstitutionsRatioAfter || item.ratioInSmallBank) || 0 })).filter(d => d.y > 0),
      borderColor: CHART_COLORS.green, backgroundColor: CHART_COLORS.greenLight,
      borderWidth: 2, tension: 0.3, fill: true,
      pointRadius: 4, pointHoverRadius: 6, stepped: 'after',
    },
  ];
  _createChart(canvasId, { type: 'line', data: { datasets }, options: _timeScaleOptions(startDate, endDate, '准备金率 (%)') });
  updateFooter(footerId, data.length, startDate, endDate);
}

export function renderMoneySupplyMonthChart(data, startMonth, endMonth) {
  const canvasId = 'money-supply-month-chart';
  const footerId = 'money-supply-month-footer';
  if (_guardChart(canvasId, footerId, data, startMonth, endMonth)) return;
  const labels = data.map(item => `${item.statYear}-${String(item.statMonth).padStart(2, '0')}`);
  const m0YoY  = data.map(item => Number.parseFloat(item.m0YoY  || item.m0YOY)  || 0);
  const m1YoY  = data.map(item => Number.parseFloat(item.m1YoY  || item.m1YOY)  || 0);
  const m2YoY  = data.map(item => Number.parseFloat(item.m2YoY  || item.m2YOY)  || 0);
  _createChart(canvasId, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'M0 同比增长', data: m0YoY, borderColor: CHART_COLORS.cyan,   backgroundColor: 'transparent', borderWidth: 2, tension: 0.3, pointRadius: 1, pointHoverRadius: 4 },
        { label: 'M1 同比增长', data: m1YoY, borderColor: CHART_COLORS.orange, backgroundColor: 'transparent', borderWidth: 2, tension: 0.3, pointRadius: 1, pointHoverRadius: 4 },
        { label: 'M2 同比增长', data: m2YoY, borderColor: CHART_COLORS.purple, backgroundColor: 'transparent', borderWidth: 2, tension: 0.3, pointRadius: 1, pointHoverRadius: 4 },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}%` } } },
      scales: { ...CHART_DEFAULTS.scales, y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: '同比增长率 (%)', color: '#8892a4' } } },
    },
  });
  updateFooter(footerId, data.length, startMonth, endMonth);
}
