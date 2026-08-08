// js/other-indicators/charts.js — 图表渲染：板块比值 + 单指数

const COLORS = {
  // 暖色系 — 创业板/红利策略
  warm:          'rgba(239, 68, 68, 1)',        // 红色主线
  warmLight:     'rgba(239, 68, 68, 0.6)',      // 红色浅色阈值
  warmDash:      'rgba(249, 115, 22, 0.8)',     // 橙色阈值虚线

  // 冷色系 — 科创50/红利策略
  cool:          'rgba(59, 130, 246, 1)',        // 蓝色主线
  coolLight:     'rgba(59, 130, 246, 0.6)',      // 蓝色浅色阈值
  coolDash:      'rgba(6, 182, 212, 0.8)',       // 青色阈值虚线

  // 通用
  green:       'rgba(34, 197, 94, 1)',
  greenLight:  'rgba(34, 197, 94, 0.2)',
  orange:      'rgba(249, 115, 22, 1)',
  orangeLight: 'rgba(249, 115, 22, 0.2)',
  purple:      'rgba(168, 85, 247, 1)',
  purpleLight: 'rgba(168, 85, 247, 0.15)',
  cyan:        'rgba(6, 182, 212, 1)',
  cyanLight:   'rgba(6, 182, 212, 0.2)',
};

const CHART_DEFAULTS = {
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

// ── 内部状态 ──────────────────────────────────────────────────────────────────

const _charts = {};

function _destroy(id) {
  if (_charts[id]) { _charts[id].destroy(); _charts[id] = null; }
}

function _resetCanvas(id) {
  const container = document.getElementById(id)?.parentElement;
  if (container) container.innerHTML = `<canvas id="${id}"></canvas>`;
}

function _updateFooter(footerId, count, start, end) {
  const el = document.getElementById(footerId);
  if (el) {
    el.innerHTML = `
      <span class="data-count">数据点: ${count}</span>
      <span class="data-range">时间范围: ${start} ~ ${end}</span>
    `;
  }
}

// ── Chart.js 插件：绘制阈值区域背景 ──────────────────────────────────────────

const thresholdZonesPlugin = {
  id: 'thresholdZones',
  beforeDraw(chart) {
    const zones = chart.options.plugins?.thresholdZones;
    if (!zones || !zones.length) return;

    const { ctx, chartArea: { left, right, top, bottom }, scales } = chart;
    const yScale = scales['yRatio'] || scales['y'];
    if (!yScale) return;

    ctx.save();
    for (const zone of zones) {
      // Draw fill zone only if color is explicitly provided
      if (zone.color && (zone.min != null || zone.max != null)) {
        const pixelTop = zone.max != null ? yScale.getPixelForValue(zone.max) : top;
        const pixelBottom = zone.min != null ? yScale.getPixelForValue(zone.min) : bottom;
        const clampedTop = Math.max(Math.min(pixelTop, bottom), top);
        const clampedBottom = Math.max(Math.min(pixelBottom, bottom), top);

        if (clampedBottom > clampedTop) {
          ctx.fillStyle = zone.color;
          ctx.fillRect(left, clampedTop, right - left, clampedBottom - clampedTop);
        }
      }

      // Draw threshold line
      if (zone.lineValue != null) {
        const lineY = yScale.getPixelForValue(zone.lineValue);
        if (lineY >= top && lineY <= bottom) {
          ctx.strokeStyle = zone.lineColor || 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(left, lineY);
          ctx.lineTo(right, lineY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Label
          if (zone.label) {
            ctx.fillStyle = zone.lineColor || '#8892a4';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(zone.label, left + 6, lineY - 4);
          }
        }
      }
    }
    ctx.restore();
  },
};

// Register plugin globally
Chart.register(thresholdZonesPlugin);

// ── 主图：板块比值（双Y轴） ──────────────────────────────────────────────────

export function renderSectorRatioChart(data, startDate, endDate) {
  const canvasId = 'sector-ratio-chart';
  const footerId = 'sector-ratio-footer';

  _destroy(canvasId);
  _resetCanvas(canvasId);

  const gem = data.gem;
  const div = data.dividend;
  const ratio = data.ratio;

  if (!gem || !div || !ratio || !ratio.labels.length) {
    const el = document.getElementById(canvasId);
    if (el) el.parentElement.innerHTML = '<div class="chart-no-data">暂无数据</div>';
    _updateFooter(footerId, 0, startDate || '--', endDate || '--');
    return;
  }

  // Filter by date range
  const filterByRange = (labels, values) => {
    const result = { labels: [], values: [] };
    for (let i = 0; i < labels.length; i++) {
      if ((!startDate || labels[i] >= startDate) && (!endDate || labels[i] <= endDate)) {
        result.labels.push(labels[i]);
        result.values.push(values[i]);
      }
    }
    return result;
  };

  const gemFiltered = filterByRange(gem.labels, gem.values);
  const divFiltered = filterByRange(div.labels, div.values);
  const ratioFiltered = filterByRange(ratio.labels, ratio.values);

  // STAR / Dividend ratio
  const starRatio = data.star_ratio;
  const starFiltered = starRatio ? filterByRange(starRatio.labels, starRatio.values) : { labels: [], values: [] };
  const starIndex = data.star;
  const starIndexFiltered = starIndex ? filterByRange(starIndex.labels, starIndex.values) : { labels: [], values: [] };

  // Use the longest label set for the x-axis
  const allLabels = [...new Set([...ratioFiltered.labels, ...starFiltered.labels])].sort();

  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  // Build datasets
  const datasets = [
    {
      label: '创业板指/中证红利',
      data: ratioFiltered.labels.map((l, i) => ({ x: l, y: ratioFiltered.values[i] })),
      borderColor: COLORS.warm,
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 5,
      fill: false,
      yAxisID: 'yRatio',
    },
  ];

  // Add STAR/Dividend ratio only if data exists
  if (starFiltered.labels.length > 0) {
    datasets.push({
      label: '科创50/中证红利',
      data: starFiltered.labels.map((l, i) => ({ x: l, y: starFiltered.values[i] })),
      borderColor: COLORS.cool,
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 5,
      fill: false,
      yAxisID: 'yRatio',
    });
  }

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            afterBody(tooltipItems) {
              if (!tooltipItems.length) return '';
              // Use dataIndex from the first (ratio) dataset to look up values
              const dataIndex = tooltipItems[0].dataIndex;
              const lines = [];

              // Get the date from the ratio data point for cross-referencing
              const ratioDate = ratioFiltered.labels[dataIndex];

              // Look up GEM value at same index or by date
              if (dataIndex < gemFiltered.values.length && gemFiltered.values[dataIndex] != null) {
                lines.push(`  创业板指: ${gemFiltered.values[dataIndex].toFixed(2)}`);
              }

              // Look up STAR value by matching date (Yahoo dates may differ slightly)
              if (starIndexFiltered.labels.length > 0 && ratioDate) {
                // Find closest star date
                const starIdx = starIndexFiltered.labels.findIndex(l => l.slice(0, 7) === ratioDate.slice(0, 7));
                if (starIdx >= 0 && starIndexFiltered.values[starIdx] != null) {
                  lines.push(`  科创50: ${starIndexFiltered.values[starIdx].toFixed(2)}`);
                }
              }

              // Look up Dividend value at same index
              if (dataIndex < divFiltered.values.length && divFiltered.values[dataIndex] != null) {
                lines.push(`  中证红利: ${divFiltered.values[dataIndex].toFixed(2)}`);
              }

              return lines.length ? ['', '─ 指数点位 ─', ...lines] : '';
            },
            label(ctx) {
              const label = ctx.dataset.label;
              const val = ctx.parsed.y;
              if (label.includes('创业板')) {
                let suffix = '';
                if (val < 0.3) suffix = ' ⚡ 买入成长';
                else if (val > 0.7) suffix = ' ⚠️ 切换防守';
                return `${label}: ${val.toFixed(4)}${suffix}`;
              }
              if (label.includes('科创')) {
                let suffix = '';
                if (val < 0.38) suffix = ' ⚡ 买入成长';
                else if (val > 0.74) suffix = ' ⚠️ 切换防守';
                return `${label}: ${val.toFixed(4)}${suffix}`;
              }
              return `${label}: ${val.toFixed(4)}`;
            },
          },
        },
        thresholdZones: [
          {
            lineValue: 0.7,
            lineColor: COLORS.warmDash,
            label: '0.7 创业板/红利 切换防守',
          },
          {
            lineValue: 0.3,
            lineColor: COLORS.warmDash,
            label: '0.3 创业板/红利 买入成长',
          },
          {
            lineValue: 0.74,
            lineColor: COLORS.coolDash,
            label: '0.74 科创/红利 切换防守',
          },
          {
            lineValue: 0.38,
            lineColor: COLORS.coolDash,
            label: '0.38 科创/红利 买入成长',
          },
        ],
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          type: 'time',
          time: { unit: 'month', displayFormats: { month: 'yyyy-MM' } },
          min: startDate,
          max: endDate,
        },
        yRatio: {
          type: 'linear',
          position: 'left',
          grid: { color: 'rgba(45, 50, 80, 0.3)' },
          ticks: { color: '#8892a4', font: { size: 10 } },
          title: { display: true, text: '比值', color: '#8892a4' },
        },
      },
    },
  });

  _updateFooter(footerId, ratioFiltered.labels.length,
    ratioFiltered.labels[0] || '--',
    ratioFiltered.labels.at(-1) || '--');
}

// ── 单指数图表 ────────────────────────────────────────────────────────────────

export function renderSingleIndexChart(canvasId, footerId, indexData, startDate, endDate, color, colorLight, label) {
  _destroy(canvasId);
  _resetCanvas(canvasId);

  if (!indexData || !indexData.labels || indexData.labels.length === 0) {
    const el = document.getElementById(canvasId);
    if (el) el.parentElement.innerHTML = '<div class="chart-no-data">暂无数据</div>';
    _updateFooter(footerId, 0, '--', '--');
    return;
  }

  // Filter by date range
  const labels = [];
  const values = [];
  for (let i = 0; i < indexData.labels.length; i++) {
    const d = indexData.labels[i];
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      labels.push(d);
      values.push(indexData.values[i]);
    }
  }

  if (labels.length === 0) {
    const el = document.getElementById(canvasId);
    if (el) el.parentElement.innerHTML = '<div class="chart-no-data">所选范围无数据</div>';
    _updateFooter(footerId, 0, startDate || '--', endDate || '--');
    return;
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        borderColor: color,
        backgroundColor: colorLight,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          type: 'time',
          time: { unit: 'month', displayFormats: { month: 'yyyy-MM' } },
          min: startDate,
          max: endDate,
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: { display: true, text: '点位', color: '#8892a4' },
        },
      },
    },
  });

  _updateFooter(footerId, labels.length, labels[0], labels.at(-1));
}

// ── 便捷导出 ──────────────────────────────────────────────────────────────────

export function renderGemChart(data, startDate, endDate) {
  renderSingleIndexChart('gem-chart', 'gem-footer', data.gem, startDate, endDate, COLORS.green, COLORS.greenLight, '创业板指');
}

export function renderDividendChart(data, startDate, endDate) {
  renderSingleIndexChart('dividend-chart', 'dividend-footer', data.dividend, startDate, endDate, COLORS.orange, COLORS.orangeLight, '中证红利');
}