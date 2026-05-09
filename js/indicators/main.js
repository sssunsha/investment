/**
 * Investment Indicators Dashboard - Main Entry Point
 * 
 * Fetches and displays investment indicators from value500.com
 * with automatic buy/sell signal analysis.
 */

// ══════════════════════════════════════════════════════════════════════════════
// State
// ══════════════════════════════════════════════════════════════════════════════

let indicatorsData = null;
let signalsData = null;
let isLoading = false;

let fedRateChart = null;
let fedRateData = null;

let cnStockChart = null;
let cnStockData = null;

// ══════════════════════════════════════════════════════════════════════════════
// API Functions
// ══════════════════════════════════════════════════════════════════════════════

async function fetchIndicators(forceRefresh = false) {
  const url = `/api/indicators${forceRefresh ? '?force_refresh=true' : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchSignals() {
  const response = await fetch('/api/indicators/signals');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchFedRateHistory(forceRefresh = false) {
  const url = `/api/indicators/fed-rate-history${forceRefresh ? '?force_refresh=true' : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchCnIndicesHistory(forceRefresh = false) {
  const url = `/api/indicators/cn-indices-history${forceRefresh ? '?force_refresh=true' : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function refreshAllIndicators() {
  const response = await fetch('/api/indicators/refresh', { method: 'POST' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// Rendering Functions
// ══════════════════════════════════════════════════════════════════════════════

function renderSignalPanel(signals) {
  if (!signals || !signals.data) return '';
  
  const data = signals.data;
  const buySignals = data.buy_signals || {};
  const sellSignals = data.sell_signals || {};
  
  const buySignalLabels = {
    stock_bond_ratio_high: '股债比>2.0',
    shibor_1y_low: 'Shibor 1Y<1.5%',
    financing_cold: '融资余额<-10%',
    no_inversion: '美债利差正常',
  };
  
  const buySignalExplanations = {
    stock_bond_ratio_high: {
      principle: '格雷厄姆投资原理',
      detail: '当股票盈利收益率(E/P)达到10年期国债收益率的2倍以上时，说明股票相对债券具有极高的性价比。这是价值投资之父本杰明·格雷厄姆提出的核心配置指标。',
      action: '历史上股债比>2.0的时期（如2005年、2008年、2012年、2018年）均为长期大底，是满仓配置的最佳时机。'
    },
    shibor_1y_low: {
      principle: '流动性宽松周期',
      detail: 'Shibor 1年期利率反映货币政策中期取向。当1年期利率<1.5%时，表明央行处于宽松周期，市场流动性充裕，资金成本低廉。',
      action: '流动性宽松直接支撑股市上涨，降低企业融资成本，提升盈利预期。是股市上涨的重要推动力。'
    },
    financing_cold: {
      principle: '市场情绪冰点',
      detail: '融资余额月增速<-10%说明杠杆资金大幅撤离，市场情绪极度悲观。通常对应恐慌性抛售和超跌反弹机会。',
      action: '历史上融资余额增速跌至-10%以下的时期，往往是短期底部，适合逆向布局。别人恐惧时我贪婪。'
    },
    no_inversion: {
      principle: '无衰退风险',
      detail: '美债2Y-10Y利差>0说明收益率曲线正常，长期利率高于短期利率。这表明市场预期经济将持续增长，无衰退风险。',
      action: '正常的收益率曲线支持风险资产定价，为股市提供良好的宏观环境。'
    },
  };
  
  const sellSignalLabels = {
    stock_bond_ratio_low: '股债比<1.0',
    buffett_high: '巴菲特>120%',
    financing_hot: '融资余额>30%',
    inversion: '美债倒挂>20bp',
    cpi_high: 'CPI>3%',
  };
  
  const sellSignalExplanations = {
    stock_bond_ratio_low: {
      principle: '股票性价比极低',
      detail: '当股债比<1.0时，意味着股票盈利收益率低于债券收益率，投资股票的回报不如买债券。这说明股市严重高估。',
      action: '此时应减仓至30%以下，将资金转向债券等固定收益产品。'
    },
    buffett_high: {
      principle: '市场严重高估',
      detail: '巴菲特指标（股市总市值/GDP）>120%说明股市泡沫严重。历史上每次突破120%都伴随着随后的暴跌。',
      action: '立即减仓，保持现金，等待下一次危机带来的机会。'
    },
    financing_hot: {
      principle: '杠杆过热',
      detail: '融资余额月增速>30%表明杠杆资金疯狂涌入，市场情绪极度亢奋。通常预示短期顶部即将到来。',
      action: '杠杆资金是市场波动的放大器。增速过快往往对应短期顶部，应及时获利了结。'
    },
    inversion: {
      principle: '衰退信号',
      detail: '美债2Y-10Y利差<-20bp（倒挂超过20个基点）是最可靠的经济衰退领先指标。倒挂后24个月内衰退概率>80%。',
      action: '立即降低风险资产配置，转向防御性资产。历史上每次严重倒挂后均发生经济衰退。'
    },
    cpi_high: {
      principle: '紧缩政策将至',
      detail: 'CPI>3%且持续上升时，央行通常会采取加息等紧缩政策来抑制通胀。这将提高资金成本，压制股市估值。',
      action: '高通胀环境下，实际利率上升，股市面临估值压力，应减少权益资产配置。'
    },
  };
  
  const decisionMatrix = data.decision_matrix || {};
  
  return `
    <div class="signal-panel">
      <div class="signal-panel-head">
        <span class="signal-panel-title">📈 投资决策信号分析</span>
        <span class="refresh-time">更新时间: ${formatDateTime(data.updated_at)}</span>
      </div>
      <div class="signal-panel-body">
        <div class="recommendation-badge ${data.recommendation}">
          <span>${getRecommendationIcon(data.recommendation)}</span>
          <span>${data.recommendation_text}</span>
        </div>
        
        <div class="signal-grid">
          <div class="signal-section buy">
            <div class="signal-section-title">📈 买入信号 (${data.buy_count}/4)</div>
            <div class="signal-items">
              ${Object.entries(buySignalLabels).map(([key, label]) => {
                const explanation = buySignalExplanations[key] || {};
                return `
                  <div class="signal-item ${buySignals[key] ? 'active' : 'inactive'}">
                    <span class="signal-icon">${buySignals[key] ? '✅' : '⬜'}</span>
                    <span>${label}</span>
                    <div class="signal-tooltip">
                      <div class="signal-tooltip-principle">📚 ${explanation.principle || ''}</div>
                      <div class="signal-tooltip-detail">${explanation.detail || ''}</div>
                      <div class="signal-tooltip-action">💡 ${explanation.action || ''}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          
          <div class="signal-section sell">
            <div class="signal-section-title">📉 卖出信号 (${data.sell_count}/5)</div>
            <div class="signal-items">
              ${Object.entries(sellSignalLabels).map(([key, label]) => {
                const explanation = sellSignalExplanations[key] || {};
                return `
                  <div class="signal-item ${sellSignals[key] ? 'sell-active' : 'inactive'}">
                    <span class="signal-icon">${sellSignals[key] ? '🔴' : '⬜'}</span>
                    <span>${label}</span>
                    <div class="signal-tooltip">
                      <div class="signal-tooltip-principle">📚 ${explanation.principle || ''}</div>
                      <div class="signal-tooltip-detail">${explanation.detail || ''}</div>
                      <div class="signal-tooltip-action">💡 ${explanation.action || ''}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        
        ${decisionMatrix.conditions ? renderDecisionMatrix(decisionMatrix) : ''}
      </div>
    </div>
  `;
}

function renderDecisionMatrix(matrix) {
  const { primary_text, primary_color, primary_icon, conditions } = matrix;
  
  const matrixLabels = {
    strong_buy: '强烈买入',
    active_allocation: '积极配置',
    cautious: '谨慎观望',
    forced_sell: '强制卖出',
  };
  
  return `
    <div class="decision-matrix">
      <div class="decision-matrix-header">
        <span class="decision-matrix-title">📋 决策矩阵分析</span>
        <span class="decision-matrix-badge ${primary_color}">
          <span>${primary_icon}</span>
          <span>${primary_text}</span>
        </span>
      </div>
      
      <div class="decision-matrix-grid">
        ${Object.entries(conditions).map(([key, rule]) => `
          <div class="matrix-rule ${rule.matched ? 'matched' : ''}">
            <div class="matrix-rule-header">
              <span class="matrix-rule-title">${matrixLabels[key] || key}</span>
              <span class="matrix-rule-score">${rule.met_count}/${rule.total_count}</span>
            </div>
            <div class="matrix-rule-conditions">
              ${rule.conditions.map(cond => `
                <div class="matrix-condition ${cond.met ? 'met' : 'unmet'}">
                  <span class="matrix-condition-icon">${cond.met ? '✅' : '❌'}</span>
                  <span class="matrix-condition-name">${cond.name}</span>
                  <span class="matrix-condition-value">${cond.value}</span>
                </div>
              `).join('')}
            </div>
            <div class="matrix-rule-action">
              <span class="matrix-action-icon">💼</span>
              <span>${rule.action}</span>
            </div>
            <div class="matrix-rule-position">
              <span class="matrix-position-icon">📊</span>
              <span>${rule.position}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function getRecommendationIcon(rec) {
  const icons = {
    strong_buy: '🚀',
    buy: '📈',
    neutral: '➖',
    sell: '📉',
    strong_sell: '🔻',
  };
  return icons[rec] || '➖';
}

// ══════════════════════════════════════════════════════════════════════════════
// Indicator Metadata - Thresholds & Meaning
// ══════════════════════════════════════════════════════════════════════════════

const INDICATOR_METADATA = {
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

function getValueColor(key, value, fieldName = 'primary') {
  const meta = INDICATOR_METADATA[key];
  if (!meta || !meta.thresholds || value === null || value === undefined) return '';
  
  // Special handling for different indicators
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
    case 'csi500_pe_pb':
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
      // PPI-CPI spread would need to be calculated, just show neutral for now
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

function renderThresholdDisplay(key) {
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

function renderTooltip(key, name) {
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

function renderIndicatorCard(indicator) {
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

function getCardClass(status) {
  if (!status || !status.signals) return '';
  if (status.signals.includes('买入信号')) return 'has-signal';
  if (status.signals.includes('卖出信号')) return 'has-danger';
  if (status.level === 'warning' || status.color === 'orange') return 'has-warning';
  return '';
}

function renderIndicatorValues(key, values) {
  switch (key) {
    case 'stock_bond_ratio':
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
    
    case 'a_share_pe':
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
    
    case 'csi300_pe_pb':
    case 'csi500_pe_pb':
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
    
    case 'buffett_index':
      const buffettColor = getValueColor(key, values.buffett_index, 'buffett_index');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">巴菲特指标</div>
          <div class="indicator-value-number ${buffettColor}">${formatNumber(values.buffett_index, 1)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    
    case 'hsi_pe':
      const hsiColor = getValueColor(key, values.pe, 'pe');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">恒生PE</div>
          <div class="indicator-value-number ${hsiColor}">${formatNumber(values.pe, 2)}<span class="indicator-value-unit">倍</span></div>
        </div>
      `;
    
    case 'cn_10y_bond':
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
    
    case 'm1_m2':
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
    
    case 'm2_gdp':
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
    
    case 'financing_balance':
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
    
    case 'cpi':
      const cpiColor = getValueColor(key, values.cpi, 'cpi');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">CPI</div>
          <div class="indicator-value-number ${cpiColor}">${formatNumber(values.cpi, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    
    case 'ppi':
      const ppiColor = getValueColor(key, values.ppi, 'ppi');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">PPI</div>
          <div class="indicator-value-number ${ppiColor}">${formatNumber(values.ppi, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    
    case 'bdi':
      const bdiColor = getValueColor(key, values.bdi, 'bdi');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">BDI指数</div>
          <div class="indicator-value-number ${bdiColor}">${formatNumber(values.bdi, 0)}</div>
        </div>
      `;
    
    default:
      // Generic rendering for unknown indicators
      const entries = Object.entries(values).slice(0, 3);
      return entries.map(([k, v]) => `
        <div class="indicator-value">
          <div class="indicator-value-label">${k}</div>
          <div class="indicator-value-number">${formatNumber(v, 2)}</div>
        </div>
      `).join('');
  }
}

function renderCategorySection(categoryKey, categoryData) {
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

function renderFedRateChartCard() {
  return `
    <div class="fed-rate-chart-card" id="fed-rate-chart-card">
      <div class="chart-card-header">
        <div class="chart-title">
          <span class="chart-title-main">📈 美国利率走势</span>
          <span class="chart-title-sub">Federal Funds Rate · 2Y Treasury · 10Y Treasury (FRED) · 2000至今</span>
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

function renderCnStockChartCard() {
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

function renderMacroTrendSection() {
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
  
  const categories = data.data;
  
  // Sort categories by order
  const sortedCategories = Object.entries(categories)
    .sort((a, b) => (a[1].order || 99) - (b[1].order || 99));
  
  container.innerHTML = `
    ${renderSignalPanel(signals)}
    ${renderMacroTrendSection()}
    ${sortedCategories.map(([key, cat]) => renderCategorySection(key, cat)).join('')}
  `;
}

async function loadFedRateChart(forceRefresh = false) {
  const card = document.getElementById('fed-rate-chart-card');
  if (!card) return;

  card.classList.add('chart-loading');
  try {
    const result = await fetchFedRateHistory(forceRefresh);
    fedRateData = result.data;
    renderFedRateChart(fedRateData);

    const latestEl = document.getElementById('fed-rate-latest');
    if (latestEl && fedRateData.fedfunds) {
      const badge = fedRateData.from_cache ? '📦 缓存' : '🔄 最新';
      const ffr = fedRateData.fedfunds;
      const dgs10 = fedRateData.dgs10;
      const dgs2 = fedRateData.dgs2;
      const ffrLatest = ffr.values[ffr.values.length - 1]?.toFixed(2);
      const dgs10Latest = dgs10.values[dgs10.values.length - 1]?.toFixed(2);
      const dgs2Latest = dgs2.values[dgs2.values.length - 1]?.toFixed(2);
      latestEl.innerHTML = `FFR <strong>${ffrLatest}%</strong> · 10Y <strong>${dgs10Latest}%</strong> · 2Y <strong>${dgs2Latest}%</strong> <span class="indicator-cache-badge">${badge}</span>`;
    }
  } catch (error) {
    const wrapper = card.querySelector('.chart-wrapper');
    if (wrapper) {
      wrapper.innerHTML = `<div class="chart-error">❌ 加载失败: ${error.message}</div>`;
    }
  } finally {
    card.classList.remove('chart-loading');
  }
}

function resampleToMonthly(labels, values) {
  const map = new Map();
  labels.forEach((date, i) => map.set(date.slice(0, 7), values[i]));
  return map;
}

// 两图共用的同步十字线插件
const syncedCrosshairPlugin = {
  id: 'syncedCrosshair',
  _activeDate: null,
  _lastDate: null,

  // 在指定图表中查找日期对应的 x 像素
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
      this._lastDate = null;
      const fedEl = document.getElementById('chart-hover-info');
      const cnEl = document.getElementById('cn-stock-hover-info');
      if (fedEl) fedEl.style.display = 'none';
      if (cnEl) cnEl.style.display = 'none';
      this._sibling(chart)?.update('none');
      return;
    }
    const active = chart.tooltip._active;
    if (!active?.length) return;
    const date = chart.data.labels[active[0].index]?.slice(0, 7);
    if (!date) return;
    this._activeDate = date;
    if (date !== this._lastDate) {
      this._lastDate = date;
      this._updatePanels(date);
    }
    this._sibling(chart)?.update('none');
  },

  _updatePanels(date) {
    // 美国利率面板
    const fedEl = document.getElementById('chart-hover-info');
    if (fedEl && fedRateChart) {
      const idx = fedRateChart.data.labels.findIndex(l => l.slice(0, 7) === date);
      if (idx >= 0) {
        const ds = fedRateChart.data.datasets;
        const fmt = v => v == null ? '—' : v.toFixed(2) + '%';
        fedEl.style.display = 'flex';
        fedEl.innerHTML = `
          <div class="hover-date">${date}</div>
          <div class="hover-row"><span class="hover-dot" style="background:rgba(239,68,68,0.9)"></span><span>FFR</span><strong>${fmt(ds[0]?.data[idx])}</strong></div>
          <div class="hover-row"><span class="hover-dot" style="background:rgba(249,115,22,0.9)"></span><span>10Y</span><strong>${fmt(ds[1]?.data[idx])}</strong></div>
          <div class="hover-row"><span class="hover-dot" style="background:rgba(59,130,246,0.9)"></span><span>2Y</span><strong>${fmt(ds[2]?.data[idx])}</strong></div>
        `;
      } else {
        fedEl.style.display = 'none';
      }
    }

    // A股面板
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

function renderFedRateChart(data) {
  const canvas = document.getElementById('fed-rate-chart');
  if (!canvas || !data) return;

  const cutoffStr = '2000-01-01';
  const startIdx = data.fedfunds.labels.findIndex(l => l >= cutoffStr);
  const ffrLabels = startIdx > 0 ? data.fedfunds.labels.slice(startIdx) : data.fedfunds.labels;
  const ffrValues = startIdx > 0 ? data.fedfunds.values.slice(startIdx) : data.fedfunds.values;

  const dgs10Map = resampleToMonthly(data.dgs10.labels, data.dgs10.values);
  const dgs2Map = resampleToMonthly(data.dgs2.labels, data.dgs2.values);
  const dgs10Values = ffrLabels.map(d => dgs10Map.get(d.slice(0, 7)) ?? null);
  const dgs2Values = ffrLabels.map(d => dgs2Map.get(d.slice(0, 7)) ?? null);

  if (fedRateChart) {
    fedRateChart.destroy();
    fedRateChart = null;
  }

  fedRateChart = new Chart(canvas, {
    type: 'line',
    plugins: [syncedCrosshairPlugin],
    data: {
      labels: ffrLabels,
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
          grid: { color: 'rgba(45, 50, 80, 0.3)' },
          ticks: {
            color: '#8892a4',
            font: { size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
        },
        y: {
          min: 0,
          grid: { color: 'rgba(45, 50, 80, 0.3)' },
          ticks: {
            color: '#8892a4',
            font: { size: 10 },
            callback: val => `${val}%`,
          },
        },
      },
    },
  });
}

// ── 中国股市走势图 ─────────────────────────────────────────────────────────────

async function loadCnStockChart(forceRefresh = false) {
  const card = document.getElementById('cn-stock-chart-card');
  if (!card) return;

  card.classList.add('chart-loading');
  try {
    const result = await fetchCnIndicesHistory(forceRefresh);
    cnStockData = result.data;
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

function renderCnStockChart(data) {
  const canvas = document.getElementById('cn-stock-chart');
  if (!canvas || !data) return;

  const indices = [
    { key: 'sh_000001', color: 'rgba(239, 68, 68, 0.9)' },
    { key: 'sh_000300', color: 'rgba(249, 115, 22, 0.9)' },
    { key: 'sz_399006', color: 'rgba(34, 197, 94, 0.9)' },
    { key: 'sh_000905', color: 'rgba(59, 130, 246, 0.9)' },
  ];

  // 用数据最长的指数标签作为公共月度 x 轴
  const base = ['sh_000001', 'sh_000300', 'sz_399006', 'sh_000905']
    .map(k => data[k])
    .find(s => s?.labels?.length);
  if (!base) return;
  const labels = base.labels.filter(d => d >= '2000-01-01');

  // 将各指数数据对齐到公共标签轴
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
          grid: { color: 'rgba(45, 50, 80, 0.3)' },
          ticks: {
            color: '#8892a4',
            font: { size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
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

// ══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ══════════════════════════════════════════════════════════════════════════════

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(decimals);
}

function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Functions
// ══════════════════════════════════════════════════════════════════════════════

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
    signalsData = signals;
    
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
          <button class="btn btn-primary" onclick="loadIndicators()" style="margin-top: 20px">重试</button>
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

// ══════════════════════════════════════════════════════════════════════════════
// Initialization
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Set current date
  const dateEl = document.getElementById('header-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  }
  
  // Auto-load indicators
  loadIndicators();
});

// Export functions for HTML onclick handlers
window.loadIndicators = loadIndicators;
window.handleRefresh = handleRefresh;