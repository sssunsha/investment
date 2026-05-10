// js/indicators/cards.js — 指标卡片元数据、渲染函数

export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(decimals);
}

// ── 阈值与含义配置 ─────────────────────────────────────────────────────────────

export const INDICATOR_METADATA = {
  stock_bond_ratio: {
    thresholds: [
      { condition: '>2.0', label: '极度低估', color: 'green' },
      { condition: '1.5-2.0', label: '合理偏低', color: 'blue' },
      { condition: '<1.0', label: '高估', color: 'red' },
    ],
    meaning: '最核心的配置指标。股债比>2时股票性价比远超债券，格雷厄姆建议股票盈利收益率达到债券收益率2倍时买入。',
  },
  a_share_pe: {
    thresholds: [
      { condition: '<15倍', label: '低估', color: 'green' },
      { condition: '15-25倍', label: '合理', color: 'blue' },
      { condition: '>30倍', label: '高估', color: 'red' },
    ],
    meaning: '判断整体市场估值水位，低于15倍为历史大底区域。A股市盈率是衡量市场整体估值的重要指标。',
  },
  csi300_pe_pb: {
    thresholds: [
      { condition: 'PE<12倍', label: '低估', color: 'green' },
      { condition: 'PB<1.5倍', label: '低估', color: 'green' },
    ],
    meaning: '大盘股估值锚点，PB<1.5倍时长期配置价值高。沪深300代表A股核心资产的估值水平。',
  },
  csi500_pe_pb: {
    thresholds: [
      { condition: 'PE<25倍', label: '低估', color: 'green' },
      { condition: 'PE>45倍', label: '高估', color: 'red' },
    ],
    meaning: '中小盘股估值指标，波动较大。中证500代表中小市值成长股的估值水平。',
  },
  buffett_index: {
    thresholds: [
      { condition: '<80%', label: '显著低估', color: 'green' },
      { condition: '80-100%', label: '合理', color: 'blue' },
      { condition: '>120%', label: '严重高估', color: 'red' },
    ],
    meaning: '股市总市值/GDP，巴菲特最看重的估值指标。>120%预示泡沫破裂风险，全球各市场均适用。',
  },
  hsi_pe: {
    thresholds: [
      { condition: '<10倍', label: '历史低位', color: 'green' },
      { condition: '>18倍', label: '高位', color: 'orange' },
    ],
    meaning: '港股估值指标，与A股形成互补。恒生指数代表香港市场核心资产估值。',
  },
  shibor: {
    thresholds: [
      { condition: '隔夜<1.5%', label: '流动性宽松', color: 'green' },
      { condition: '隔夜>2%', label: '流动性紧张', color: 'orange' },
      { condition: '隔夜>3%', label: '严重紧缩', color: 'red' },
      { condition: '1Y<1.8%', label: '宽松周期', color: 'green' },
    ],
    meaning: '银行间短期资金成本，直接影响股市资金面。隔夜利率反映短期流动性，1年期反映政策方向。',
  },
  cn_10y_bond: {
    thresholds: [
      { condition: '10Y<3%', label: '低利率环境', color: 'green' },
      { condition: '10Y 3-4%', label: '中性', color: 'blue' },
      { condition: '10Y>4.5%', label: '高利率压力', color: 'red' },
    ],
    meaning: '无风险利率基准，影响所有资产定价。对于10年期利率：<3%为低利率环境，3-4%为中性，>4.5%为高利率压力。是计算股债收益率比的重要参数。',
  },
  m1_m2: {
    thresholds: [
      { condition: 'M1>M2', label: '经济扩张', color: 'green' },
      { condition: 'M1<M2', label: '经济收缩', color: 'orange' },
      { condition: 'M1<3%', label: '流动性陷阱', color: 'red' },
    ],
    meaning: '货币活性指标，M1增速快于M2预示企业投资意愿强。M1-M2剪刀差扩大，预示投资消费意愿增强。',
  },
  m2_gdp: {
    thresholds: [
      { condition: '<200%', label: '正常', color: 'green' },
      { condition: '200-250%', label: '偏高', color: 'orange' },
      { condition: '>250%', label: '货币化过度', color: 'red' },
    ],
    meaning: '衡量货币超发程度，过高预示资产泡沫风险。反映经济中货币与实体经济的比例关系。',
  },
  financing_balance: {
    thresholds: [
      { condition: '月增>20%', label: '过热预警', color: 'orange' },
      { condition: '月增>30%', label: '严重过热', color: 'red' },
      { condition: '月增<-10%', label: '情绪冰点', color: 'blue' },
    ],
    meaning: '杠杆资金情绪指标，增速过快往往对应短期顶部。融资余额反映市场杠杆水平和投资者情绪。',
  },
  cpi: {
    thresholds: [
      { condition: '<2%', label: '低通胀/通缩风险', color: 'blue' },
      { condition: '2-3%', label: '温和通胀', color: 'green' },
      { condition: '>3%', label: '政策紧缩压力', color: 'orange' },
      { condition: '>5%', label: '严重通胀', color: 'red' },
    ],
    meaning: '影响货币政策走向，>3%时央行可能加息。CPI上升通常对股市形成压力。',
  },
  ppi: {
    thresholds: [
      { condition: 'PPI-CPI>3%', label: '企业利润受压', color: 'red' },
      { condition: 'PPI-CPI<-1%', label: '企业利润改善', color: 'green' },
    ],
    meaning: '上下游价格剪刀差，影响企业盈利。PPI与CPI的差值反映企业成本传导能力。',
  },
  bdi: {
    thresholds: [
      { condition: '>2000点', label: '航运景气', color: 'green' },
      { condition: '1000-2000点', label: '中性', color: 'blue' },
      { condition: '<1000点', label: '航运萧条', color: 'red' },
    ],
    meaning: '全球贸易领先指标，提前反映经济周期。BDI指数是全球经济活动的晴雨表。',
  },
  us_treasury: {
    thresholds: [
      { condition: '10Y<3%', label: '全球流动性宽松', color: 'green' },
      { condition: '10Y 3-4.5%', label: '中性', color: 'blue' },
      { condition: '10Y>4.5%', label: '紧缩压力', color: 'red' },
      { condition: '利差>0', label: '正常', color: 'green' },
      { condition: '利差0~-20bp', label: '预警', color: 'orange' },
      { condition: '利差<-20bp', label: '衰退信号', color: 'red' },
    ],
    meaning: '全球资产定价之锚，影响新兴市场资金流向。2Y-10Y利差倒挂是最可靠的经济衰退领先指标，倒挂后24个月内衰退概率>80%。',
  },
};

// ── 颜色 ──────────────────────────────────────────────────────────────────────

export function getValueColor(key, value, fieldName = 'primary') {
  const meta = INDICATOR_METADATA[key];
  if (!meta || !meta.thresholds || value === null || value === undefined) return '';

  switch (key) {
    case 'a_share_pe':
      if (fieldName.includes('pe')) {
        if (value < 15) return 'green';
        if (value > 30) return 'red';
        if (value >= 15 && value <= 25) return 'blue';
        return 'orange';
      }
      break;

    case 'stock_bond_ratio':
      if (value > 2.0) return 'green';
      if (value >= 1.5 && value <= 2.0) return 'blue';
      if (value < 1.0) return 'red';
      return 'orange';

    case 'csi300_pe_pb':
    case 'csi500_pe_pb': {
      if (fieldName.includes('pe')) {
        const lowPE = key === 'csi300_pe_pb' ? 12 : 25;
        const highPE = key === 'csi300_pe_pb' ? 18 : 45;
        if (value < lowPE) return 'green';
        if (value > highPE) return 'red';
        return 'blue';
      } else if (fieldName.includes('pb')) {
        if (value < 1.5) return 'green';
        if (value > 2.5) return 'red';
        return 'blue';
      }
      break;
    }

    case 'buffett_index':
      if (value < 80) return 'green';
      if (value >= 80 && value <= 100) return 'blue';
      if (value > 120) return 'red';
      return 'orange';

    case 'hsi_pe':
      if (value < 10) return 'green';
      if (value > 18) return 'orange';
      return 'blue';

    case 'shibor':
      if (fieldName.includes('overnight')) {
        if (value < 1.5) return 'green';
        if (value > 3) return 'red';
        if (value > 2) return 'orange';
        return 'blue';
      } else if (fieldName.includes('1_year')) {
        if (value < 1.8) return 'green';
        if (value > 3) return 'red';
        return 'blue';
      }
      break;

    case 'cn_10y_bond':
      if (value < 3) return 'green';
      if (value >= 3 && value <= 4) return 'blue';
      if (value > 4.5) return 'red';
      return 'orange';

    case 'm1_m2':
      if (fieldName.includes('m1_m2_diff')) {
        if (value > 0) return 'green';
        if (value < -3) return 'red';
        return 'orange';
      } else if (fieldName.includes('m1_growth')) {
        if (value < 3) return 'red';
        if (value > 10) return 'green';
        return 'blue';
      }
      break;

    case 'm2_gdp':
      if (value < 2.0) return 'green';
      if (value >= 2.0 && value <= 2.5) return 'orange';
      if (value > 2.5) return 'red';
      return 'blue';

    case 'financing_balance':
      if (fieldName.includes('growth')) {
        if (value < -10) return 'blue';
        if (value > 30) return 'red';
        if (value > 20) return 'orange';
        return 'green';
      }
      break;

    case 'cpi':
      if (value < 2) return 'blue';
      if (value >= 2 && value <= 3) return 'green';
      if (value > 5) return 'red';
      return 'orange';

    case 'ppi':
      return 'blue';

    case 'bdi':
      if (value > 2000) return 'green';
      if (value >= 1000 && value <= 2000) return 'blue';
      if (value < 1000) return 'red';
      break;

    case 'us_treasury':
      if (fieldName.includes('10_year')) {
        if (value < 3) return 'green';
        if (value >= 3 && value <= 4.5) return 'blue';
        if (value > 4.5) return 'red';
      } else if (fieldName.includes('spread')) {
        if (value > 0) return 'green';
        if (value >= 0 && value > -20) return 'orange';
        if (value < -20) return 'red';
      }
      break;
  }

  return '';
}

// ── 阈值展示 ──────────────────────────────────────────────────────────────────

export function renderThresholdDisplay(key) {
  const meta = INDICATOR_METADATA[key];
  if (!meta || !meta.thresholds || meta.thresholds.length === 0) return '';

  const items = meta.thresholds.slice(0, 3).map(t => `
    <span class="threshold-item">
      <span class="dot ${t.color}"></span>
      <span class="threshold-value">${t.condition}</span>
      <span class="threshold-label">${t.label}</span>
    </span>
  `).join('');

  return `
    <div class="threshold-display">
      <div class="threshold-title">📏 核心阈值</div>
      <div class="threshold-items">${items}</div>
    </div>
  `;
}

export function renderTooltip(key, name) {
  const meta = INDICATOR_METADATA[key];
  if (!meta) return '';

  const thresholdRows = (meta.thresholds || []).map(t => `
    <div class="tooltip-threshold-row">
      <span class="dot ${t.color}"></span>
      <span class="tooltip-threshold-condition">${t.condition}</span>
      <span class="tooltip-threshold-desc">${t.label}</span>
    </div>
  `).join('');

  return `
    <div class="indicator-tooltip">
      <div class="tooltip-title">💡 ${name} - 阈值意义说明</div>
      <div class="tooltip-meaning">${meta.meaning || ''}</div>
      ${thresholdRows ? `
        <div class="tooltip-thresholds">
          ${thresholdRows}
        </div>
      ` : ''}
    </div>
  `;
}

// ── 指标卡片 ──────────────────────────────────────────────────────────────────

export function getCardClass(status) {
  if (!status || !status.signals) return '';
  if (status.signals.includes('买入信号')) return 'has-signal';
  if (status.signals.includes('卖出信号')) return 'has-danger';
  if (status.level === 'warning' || status.color === 'orange') return 'has-warning';
  return '';
}

export function renderIndicatorValues(key, values) {
  switch (key) {
    case 'stock_bond_ratio': {
      const shanghaiColor = getValueColor(key, values.shanghai_ratio, 'shanghai_ratio');
      const shenzhenColor = getValueColor(key, values.shenzhen_ratio, 'shenzhen_ratio');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">上交所</div>
          <div class="indicator-value-number ${shanghaiColor}">${formatNumber(values.shanghai_ratio, 2)}</div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">深交所</div>
          <div class="indicator-value-number ${shenzhenColor}">${formatNumber(values.shenzhen_ratio, 2)}</div>
        </div>
      `;
    }

    case 'shibor':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">隔夜 O/N</div>
          <div class="indicator-value-number">${formatNumber(values.overnight, 3)}<span class="indicator-value-unit">%</span></div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">1年期</div>
          <div class="indicator-value-number">${formatNumber(values['1_year'], 4)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;

    case 'us_treasury':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">2年期</div>
          <div class="indicator-value-number small">${formatNumber(values['2_year'], 2)}<span class="indicator-value-unit">%</span></div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">10年期</div>
          <div class="indicator-value-number small">${formatNumber(values['10_year'], 2)}<span class="indicator-value-unit">%</span></div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">利差</div>
          <div class="indicator-value-number small">${values.spread_bp > 0 ? '+' : ''}${values.spread_bp || '—'}<span class="indicator-value-unit">bp</span></div>
        </div>
      `;

    case 'a_share_pe': {
      const shanghaiPEColor = getValueColor(key, values.shanghai_pe, 'shanghai_pe');
      const shenzhenPEColor = getValueColor(key, values.shenzhen_pe, 'shenzhen_pe');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">上海PE</div>
          <div class="indicator-value-number ${shanghaiPEColor}">${formatNumber(values.shanghai_pe, 2)}<span class="indicator-value-unit">倍</span></div>
        </div>
        ${values.shenzhen_pe ? `
        <div class="indicator-value">
          <div class="indicator-value-label">深圳PE</div>
          <div class="indicator-value-number ${shenzhenPEColor}">${formatNumber(values.shenzhen_pe, 2)}<span class="indicator-value-unit">倍</span></div>
        </div>
        ` : ''}
      `;
    }

    case 'csi300_pe_pb':
    case 'csi500_pe_pb': {
      const peColor = getValueColor(key, values.pe, 'pe');
      const pbColor = getValueColor(key, values.pb, 'pb');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">PE</div>
          <div class="indicator-value-number ${peColor}">${formatNumber(values.pe, 2)}<span class="indicator-value-unit">倍</span></div>
        </div>
        ${values.pb ? `
        <div class="indicator-value">
          <div class="indicator-value-label">PB</div>
          <div class="indicator-value-number ${pbColor}">${formatNumber(values.pb, 2)}<span class="indicator-value-unit">倍</span></div>
        </div>
        ` : ''}
      `;
    }

    case 'buffett_index': {
      const buffettColor = getValueColor(key, values.buffett_index, 'buffett_index');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">巴菲特指标</div>
          <div class="indicator-value-number ${buffettColor}">${formatNumber(values.buffett_index, 1)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'hsi_pe': {
      const hsiColor = getValueColor(key, values.pe, 'pe');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">恒生PE</div>
          <div class="indicator-value-number ${hsiColor}">${formatNumber(values.pe, 2)}<span class="indicator-value-unit">倍</span></div>
        </div>
      `;
    }

    case 'cn_10y_bond': {
      const bond10yColor = getValueColor(key, values['10_year'], '10_year');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">1年期</div>
          <div class="indicator-value-number small">${formatNumber(values['1_year'], 4)}<span class="indicator-value-unit">%</span></div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">5年期</div>
          <div class="indicator-value-number small">${formatNumber(values['5_year'], 4)}<span class="indicator-value-unit">%</span></div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">10年期</div>
          <div class="indicator-value-number small ${bond10yColor}">${formatNumber(values['10_year'], 4)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'm1_m2': {
      const m1Color = getValueColor(key, values.m1_growth, 'm1_growth');
      const m1m2DiffColor = getValueColor(key, values.m1_m2_diff, 'm1_m2_diff');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">M1增速</div>
          <div class="indicator-value-number small ${m1Color}">${formatNumber(values.m1_growth, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">M2增速</div>
          <div class="indicator-value-number small">${formatNumber(values.m2_growth, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">M1-M2</div>
          <div class="indicator-value-number small ${m1m2DiffColor}">${formatNumber(values.m1_m2_diff, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'm2_gdp': {
      const m2gdpColor = getValueColor(key, values.ratio, 'ratio');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">M2/GDP</div>
          <div class="indicator-value-number ${m2gdpColor}">${formatNumber(values.ratio, 2)}<span class="indicator-value-unit">倍</span></div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">百分比</div>
          <div class="indicator-value-number small ${m2gdpColor}">${formatNumber(values.ratio * 100, 0)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'financing_balance': {
      const growthColor = values.growth_rate !== undefined ? getValueColor(key, values.growth_rate, 'growth_rate') : '';
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">融资余额</div>
          <div class="indicator-value-number">${formatNumber(values.balance, 0)}<span class="indicator-value-unit">亿</span></div>
        </div>
        ${values.growth_rate !== undefined ? `
        <div class="indicator-value">
          <div class="indicator-value-label">增速</div>
          <div class="indicator-value-number ${growthColor}">${formatNumber(values.growth_rate, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
        ` : ''}
      `;
    }

    case 'cpi': {
      const cpiColor = getValueColor(key, values.cpi, 'cpi');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">CPI</div>
          <div class="indicator-value-number ${cpiColor}">${formatNumber(values.cpi, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'ppi': {
      const ppiColor = getValueColor(key, values.ppi, 'ppi');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">PPI</div>
          <div class="indicator-value-number ${ppiColor}">${formatNumber(values.ppi, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'bdi': {
      const bdiColor = getValueColor(key, values.bdi, 'bdi');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">BDI指数</div>
          <div class="indicator-value-number ${bdiColor}">${formatNumber(values.bdi, 0)}</div>
        </div>
      `;
    }

    default: {
      const entries = Object.entries(values).slice(0, 3);
      return entries.map(([k, v]) => `
        <div class="indicator-value">
          <div class="indicator-value-label">${k}</div>
          <div class="indicator-value-number">${formatNumber(v, 2)}</div>
        </div>
      `).join('');
    }
  }
}

export function renderIndicatorCard(indicator) {
  if (indicator.error) {
    return `
      <div class="indicator-card error-card">
        <div class="indicator-card-head">
          <div>
            <div class="indicator-name">${indicator.name || indicator.key}</div>
          </div>
        </div>
        <div class="error-message">❌ ${indicator.error}</div>
      </div>
    `;
  }

  const status = indicator.status || {};
  const values = indicator.values || {};
  const cardClass = getCardClass(status);

  return `
    <div class="indicator-card ${cardClass}">
      <div class="indicator-card-head">
        <div>
          <div class="indicator-name">${indicator.name}</div>
          <div class="indicator-name-en">${indicator.name_en}</div>
        </div>
        <div class="indicator-status ${status.color || 'gray'}">
          ${status.label || '正常'}
        </div>
      </div>
      <div class="indicator-values">
        ${renderIndicatorValues(indicator.key, values)}
      </div>
      ${renderThresholdDisplay(indicator.key)}
      <div class="indicator-footer">
        <div class="indicator-date">
          <span class="date-icon">📅</span>
          <span class="date-label">数据日期:</span>
          <span class="date-value">${indicator.data_date || '—'}</span>
          ${indicator.from_cache ? '<span class="indicator-cache-badge">📦 缓存</span>' : '<span class="indicator-fresh-badge">🔄 最新</span>'}
          ${indicator.cache_expired ? '<span class="indicator-expired-badge">⚠️ 已过期</span>' : ''}
        </div>
        <a href="${indicator.url}" target="_blank" class="indicator-link">
          <span>🔗 数据源</span>
        </a>
      </div>
      ${renderTooltip(indicator.key, indicator.name)}
    </div>
  `;
}

export function renderCategorySection(categoryKey, categoryData) {
  const indicators = categoryData.indicators || [];
  return `
    <div class="category-section">
      <div class="category-head">
        <span class="category-icon">${categoryData.icon}</span>
        <span class="category-title">${categoryData.name}</span>
        <span class="category-count">${indicators.length} 项</span>
      </div>
      <div class="indicators-grid">
        ${indicators.map(ind => renderIndicatorCard(ind)).join('')}
      </div>
    </div>
  `;
}
