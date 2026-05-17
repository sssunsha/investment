// js/indicators/charts.js — 图表状态、crosshair插件、两张走势图渲染

// ── 区间状态 ──────────────────────────────────────────────────────────────────

let fedRateChart = null;
let cnStockChart = null;

let _chartRange = 'all';

const _RANGES = [
  { key: '3m',  label: '近3月',  months: 3 },
  { key: '6m',  label: '近半年', months: 6 },
  { key: '1y',  label: '近1年',  months: 12 },
  { key: '3y',  label: '近3年',  months: 36 },
  { key: 'all', label: '全景',   months: null },
];

function _rangeCutoff(months) {
  if (!months) return '2000-01-01';
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function setChartRange(key) {
  _chartRange = key;
  document.querySelectorAll('.chart-range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === key);
  });
  const cutoff = _rangeCutoff(_RANGES.find(r => r.key === key)?.months ?? null);
  [fedRateChart, cnStockChart].forEach(chart => {
    if (!chart) return;
    const labels = chart.data.labels;
    chart.options.scales.x.min = labels.find(l => l >= cutoff) ?? labels[0];
    chart.update('none');
  });
}

// ── 同步十字线插件 ─────────────────────────────────────────────────────────────

const syncedCrosshairPlugin = {
  id: 'syncedCrosshair',
  _activeDate: null,
  _lastDate: null,

  _getX(chart, date) {
    const idx = chart.data.labels.findIndex(l => l.slice(0, 7) === date);
    if (idx < 0) return null;
    for (let i = 0; i < chart.data.datasets.length; i++) {
      const x = chart.getDatasetMeta(i).data?.[idx]?.x;
      if (x != null) return x;
    }
    return null;
  },

  _sibling(chart) {
    return chart === fedRateChart ? cnStockChart : fedRateChart;
  },

  afterDraw(chart) {
    if (!this._activeDate) return;
    const x = this._getX(chart, this._activeDate);
    if (x == null) return;
    const { top, bottom } = chart.scales.y;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },

  afterEvent(chart, args) {
    const { type } = args.event;
    if (type === 'mouseout') {
      this._activeDate = null;
      this._lastIdx = null;
      const fedEl = document.getElementById('chart-hover-info');
      const cnEl = document.getElementById('cn-stock-hover-info');
      if (fedEl) fedEl.style.display = 'none';
      if (cnEl) cnEl.style.display = 'none';
      this._sibling(chart)?.update('none');
      return;
    }
    const active = chart.tooltip._active;
    if (!active?.length) return;
    const activeIdx = active[0].index;
    const fullDate = chart.data.labels[activeIdx];
    if (!fullDate) return;
    const monthDate = fullDate.slice(0, 7);
    this._activeDate = monthDate;
    if (activeIdx !== this._lastIdx) {
      this._lastIdx = activeIdx;
      this._updatePanels(fullDate, chart === fedRateChart ? activeIdx : null);
    }
    this._sibling(chart)?.update('none');
  },

  _updatePanels(fullDate, fedIdx) {
    const monthDate = fullDate.slice(0, 7);
    const fedEl = document.getElementById('chart-hover-info');
    if (fedEl && fedRateChart) {
      const idx = fedIdx ?? fedRateChart.data.labels.findIndex(l => l.slice(0, 7) === monthDate);
      if (idx >= 0) {
        const ds = fedRateChart.data.datasets;
        const fmt = v => v == null ? '—' : v.toFixed(2) + '%';
        fedEl.style.display = 'flex';
        fedEl.innerHTML = `
          <div class="hover-date">${fedIdx == null ? monthDate : fullDate}</div>
          <div class="hover-row"><span class="hover-dot" style="background:rgba(239,68,68,0.9)"></span><span>FFR</span><strong>${fmt(ds[0]?.data[idx])}</strong></div>
          <div class="hover-row"><span class="hover-dot" style="background:rgba(249,115,22,0.9)"></span><span>10Y</span><strong>${fmt(ds[1]?.data[idx])}</strong></div>
          <div class="hover-row"><span class="hover-dot" style="background:rgba(168,85,247,0.9)"></span><span>30Y</span><strong>${fmt(ds[2]?.data[idx])}</strong></div>
          <div class="hover-row"><span class="hover-dot" style="background:rgba(59,130,246,0.9)"></span><span>2Y</span><strong>${fmt(ds[3]?.data[idx])}</strong></div>
        `;
      } else {
        fedEl.style.display = 'none';
      }
    }

    const cnEl = document.getElementById('cn-stock-hover-info');
    if (cnEl && cnStockChart) {
      const idx = cnStockChart.data.labels.findIndex(l => l.slice(0, 7) === date);
      if (idx >= 0) {
        const ds = cnStockChart.data.datasets;
        const fmt = v => v == null ? '—' : Math.round(v).toLocaleString('zh-CN');
        cnEl.style.display = 'flex';
        cnEl.innerHTML = `
          <div class="hover-date">${date}</div>
          ${ds.map(d => `<div class="hover-row"><span class="hover-dot" style="background:${d.borderColor}"></span><span>${d.label}</span><strong>${fmt(d.data[idx])}</strong></div>`).join('')}
        `;
      } else {
        cnEl.style.display = 'none';
      }
    }
  },
};

// ── 图表 HTML 卡片 ────────────────────────────────────────────────────────────

export function renderFedRateChartCard() {
  return `
    <div class="fed-rate-chart-card" id="fed-rate-chart-card">
      <div class="chart-card-header">
        <div class="chart-title">
          <span class="chart-title-main">📈 美国利率走势</span>
          <span class="chart-title-sub">Federal Funds Rate · 2Y Treasury · 10Y Treasury · 30Y Treasury (FRED) · 2000至今</span>
        </div>
        <div class="chart-controls">
          <button class="chart-range-btn" data-range="3m" onclick="setChartRange('3m')">近3月</button>
          <button class="chart-range-btn" data-range="6m" onclick="setChartRange('6m')">近半年</button>
          <button class="chart-range-btn" data-range="1y" onclick="setChartRange('1y')">近1年</button>
          <button class="chart-range-btn" data-range="3y" onclick="setChartRange('3y')">近3年</button>
          <button class="chart-range-btn active" data-range="all" onclick="setChartRange('all')">全景</button>
        </div>
      </div>
      <div class="chart-wrapper">
        <canvas id="fed-rate-chart"></canvas>
        <div class="chart-hover-info" id="chart-hover-info" style="display:none"></div>
      </div>
      <div class="chart-footer">
        <span id="fed-rate-latest" class="chart-latest"></span>
        <a href="https://fred.stlouisfed.org/series/FEDFUNDS" target="_blank" class="indicator-link">
          <span>🔗 数据来源: FRED</span>
        </a>
      </div>
    </div>
  `;
}

export function renderCnStockChartCard() {
  return `
    <div class="fed-rate-chart-card" id="cn-stock-chart-card" style="margin-top:12px">
      <div class="chart-card-header">
        <div class="chart-title">
          <span class="chart-title-main">📊 中国股市走势</span>
          <span class="chart-title-sub">上证指数 · 沪深300 · 创业板指 · 中证500 · 2000至今</span>
        </div>
      </div>
      <div class="chart-wrapper">
        <canvas id="cn-stock-chart"></canvas>
        <div class="chart-hover-info" id="cn-stock-hover-info" style="display:none"></div>
      </div>
      <div class="chart-footer">
        <span id="cn-stock-latest" class="chart-latest"></span>
      </div>
    </div>
  `;
}

export function renderMacroTrendSection() {
  return `
    <div class="category-section">
      <div class="category-head">
        <span class="category-icon">📉</span>
        <span class="category-title">宏观走势图</span>
        <span class="category-count">2 项</span>
      </div>
      ${renderFedRateChartCard()}
      ${renderCnStockChartCard()}
    </div>
  `;
}

// ── 图表渲染 ──────────────────────────────────────────────────────────────────

export function renderFedRateChart(data) {
  const canvas = document.getElementById('fed-rate-chart');
  if (!canvas || !data) return;

  // 以 DGS10 日度日期为主轴，覆盖最新数据（DGS2/10/30 每日更新）
  const cutoffStr = '2000-01-01';
  const dailyLabels = data.dgs10.labels.filter(d => d >= cutoffStr);

  // 联邦基金利率为月度序列，前向填充至日度时间轴（当月尚未发布时沿用上月值）
  const ffrMonthMap = new Map(data.fedfunds.labels.map((d, i) => [d.slice(0, 7), data.fedfunds.values[i]]));
  let ffrLast = null;
  const ffrValues = dailyLabels.map(d => {
    const m = d.slice(0, 7);
    if (ffrMonthMap.has(m)) ffrLast = ffrMonthMap.get(m);
    return ffrLast;
  });

  // 美债收益率日度数据直接按日期映射
  const dgs10Map = new Map(data.dgs10.labels.map((d, i) => [d, data.dgs10.values[i]]));
  const dgs2Map  = new Map(data.dgs2.labels.map((d, i)  => [d, data.dgs2.values[i]]));
  const dgs30Map = data.dgs30 ? new Map(data.dgs30.labels.map((d, i) => [d, data.dgs30.values[i]])) : new Map();
  const dgs10Values = dailyLabels.map(d => dgs10Map.get(d) ?? null);
  const dgs2Values  = dailyLabels.map(d => dgs2Map.get(d) ?? null);
  const dgs30Values = dailyLabels.map(d => dgs30Map.get(d) ?? null);

  const fedRangeCutoff = _rangeCutoff(_RANGES.find(r => r.key === _chartRange)?.months ?? null);
  const fedXMin = dailyLabels.find(l => l >= fedRangeCutoff) ?? dailyLabels[0];

  if (fedRateChart) { fedRateChart.destroy(); fedRateChart = null; }

  fedRateChart = new Chart(canvas, {
    type: 'line',
    plugins: [syncedCrosshairPlugin],
    data: {
      labels: dailyLabels,
      datasets: [
        {
          label: '联邦基金利率',
          data: ffrValues,
          borderColor: 'rgba(239, 68, 68, 0.9)',
          backgroundColor: 'transparent',
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.8,
        },
        {
          label: '10年期美债收益率',
          data: dgs10Values,
          borderColor: 'rgba(249, 115, 22, 0.9)',
          backgroundColor: 'transparent',
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.8,
          spanGaps: true,
        },
        {
          label: '30年期美债收益率',
          data: dgs30Values,
          borderColor: 'rgba(168, 85, 247, 0.9)',
          backgroundColor: 'transparent',
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.8,
          spanGaps: true,
        },
        {
          label: '2年期美债收益率',
          data: dgs2Values,
          borderColor: 'rgba(59, 130, 246, 0.9)',
          backgroundColor: 'transparent',
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.8,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#8892a4', font: { size: 11 }, boxWidth: 12, padding: 15 },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          min: fedXMin,
          grid: { color: 'rgba(45, 50, 80, 0.3)' },
          ticks: { color: '#8892a4', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        },
        y: {
          min: 0,
          grid: { color: 'rgba(45, 50, 80, 0.3)' },
          ticks: { color: '#8892a4', font: { size: 10 }, callback: val => `${val}%` },
        },
      },
    },
  });
}

export function renderCnStockChart(data) {
  const canvas = document.getElementById('cn-stock-chart');
  if (!canvas || !data) return;

  const indices = [
    { key: 'sh_000001', color: 'rgba(239, 68, 68, 0.9)' },
    { key: 'sh_000300', color: 'rgba(249, 115, 22, 0.9)' },
    { key: 'sz_399006', color: 'rgba(34, 197, 94, 0.9)' },
    { key: 'sh_000905', color: 'rgba(59, 130, 246, 0.9)' },
  ];

  const base = ['sh_000001', 'sh_000300', 'sz_399006', 'sh_000905']
    .map(k => data[k])
    .find(s => s?.labels?.length);
  if (!base) return;
  const labels = base.labels.filter(d => d >= '2000-01-01');

  const cnRangeCutoff = _rangeCutoff(_RANGES.find(r => r.key === _chartRange)?.months ?? null);
  const cnXMin = labels.find(l => l >= cnRangeCutoff) ?? labels[0];

  const buildMap = key => {
    const s = data[key];
    if (!s) return new Map();
    const m = new Map();
    s.labels.forEach((d, i) => m.set(d.slice(0, 7), s.values[i]));
    return m;
  };

  const datasets = indices
    .filter(({ key }) => data[key]?.values?.length)
    .map(({ key, color }) => ({
      label: data[key].name,
      data: labels.map(d => buildMap(key).get(d.slice(0, 7)) ?? null),
      borderColor: color,
      backgroundColor: 'transparent',
      tension: 0.2,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 1.8,
      spanGaps: true,
    }));

  if (cnStockChart) { cnStockChart.destroy(); cnStockChart = null; }

  cnStockChart = new Chart(canvas, {
    type: 'line',
    plugins: [syncedCrosshairPlugin],
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#8892a4', font: { size: 11 }, boxWidth: 12, padding: 15 },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          min: cnXMin,
          grid: { color: 'rgba(45, 50, 80, 0.3)' },
          ticks: { color: '#8892a4', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        },
        y: {
          grid: { color: 'rgba(45, 50, 80, 0.3)' },
          ticks: {
            color: '#8892a4',
            font: { size: 10 },
            callback: val => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val,
          },
        },
      },
    },
  });
}
