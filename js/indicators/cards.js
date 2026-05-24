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

  // ── 新增：中国宏观 ─────────────────────────────────────────────────────────────
  cn_pmi: {
    thresholds: [
      { condition: '>50', label: '扩张', color: 'green' },
      { condition: '49-50', label: '荣枯线附近', color: 'orange' },
      { condition: '<49', label: '收缩', color: 'red' },
    ],
    meaning: '50 以上为扩张区间，以下为收缩。制造业 PMI 反映工业经济景气，非制造业 PMI 反映服务业景气，两者共同描绘宏观周期。',
  },

  // ── 新增：美国宏观 ─────────────────────────────────────────────────────────────
  us_cpi: {
    thresholds: [
      { condition: '同比<2%', label: '通胀温和', color: 'green' },
      { condition: '同比 2-4%', label: '偏高', color: 'orange' },
      { condition: '同比>4%', label: '高通胀', color: 'red' },
    ],
    meaning: '衡量美国通胀压力，直接影响美联储货币政策走向。CPI 持续高企将促使美联储加息，对股市形成压制。',
  },
  us_pce: {
    thresholds: [
      { condition: '<2%', label: '达成目标', color: 'green' },
      { condition: '2-3%', label: '偏高', color: 'orange' },
      { condition: '>3%', label: '显著超标', color: 'red' },
    ],
    meaning: '美联储首选通胀指标，目标值为 2%。核心 PCE 剔除食品与能源，更能反映基础通胀趋势。',
  },
  us_pmi: {
    thresholds: [
      { condition: '>50', label: '扩张', color: 'green' },
      { condition: '49-50', label: '荣枯线附近', color: 'orange' },
      { condition: '<49', label: '收缩', color: 'red' },
    ],
    meaning: 'ISM 制造业 PMI，50 以上为扩张，以下为收缩。是美国制造业景气的领先指标，对美联储政策决策有重要参考价值。',
  },
  us_payrolls: {
    thresholds: [
      { condition: '>200K', label: '强劲增长', color: 'green' },
      { condition: '100-200K', label: '温和增长', color: 'blue' },
      { condition: '<100K', label: '增长放缓', color: 'orange' },
      { condition: '<0', label: '就业萎缩', color: 'red' },
    ],
    meaning: '每月新增非农就业人数，反映劳动力市场强弱。强劲非农数据可能促使美联储维持高利率，对股市产生双刃剑效应。',
  },
  us_unrate: {
    thresholds: [
      { condition: '<4%', label: '充分就业', color: 'green' },
      { condition: '4-5%', label: '温和', color: 'blue' },
      { condition: '>5%', label: '劳动市场松弛', color: 'orange' },
      { condition: '>6%', label: '衰退风险', color: 'red' },
    ],
    meaning: '劳动力市场松紧程度，过低意味着工资通胀压力大，过高则意味着经济衰退风险。美联储双重使命之一。',
  },

  // ── 新增：美国利率/流动性 ──────────────────────────────────────────────────────
  us_fedfunds: {
    thresholds: [
      { condition: '<1%', label: '超宽松', color: 'green' },
      { condition: '1-3%', label: '中性', color: 'blue' },
      { condition: '3-5%', label: '限制性', color: 'orange' },
      { condition: '>5%', label: '高度限制性', color: 'red' },
    ],
    meaning: '美联储政策利率，是全球资产定价的基准。加息周期通常压制估值，降息周期利好风险资产。',
  },
  us_fed_balance: {
    thresholds: [
      { condition: '扩表（QE）', label: '宽松信号', color: 'green' },
      { condition: '缩表（QT）', label: '收紧信号', color: 'red' },
    ],
    meaning: '美联储资产负债表规模，用于判断 QE/QT 周期。扩表向市场注入流动性，缩表则抽离流动性，对风险资产影响深远。',
  },

  // ── 新增：美国市场估值 ─────────────────────────────────────────────────────────
  us_sp500_pe: {
    thresholds: [
      { condition: 'CAPE<20', label: '低估', color: 'green' },
      { condition: 'CAPE 20-30', label: '合理', color: 'blue' },
      { condition: 'CAPE>30', label: '显著高估', color: 'orange' },
      { condition: 'CAPE>35', label: '历史极端高位', color: 'red' },
    ],
    meaning: '席勒CAPE（周期调整PE）>30 为显著高估区间，历史均值约16。标普500 PE 反映当前盈利水平，CAPE 则平滑经济周期波动。',
  },
  vix: {
    thresholds: [
      { condition: '<15', label: '市场平静', color: 'green' },
      { condition: '15-25', label: '正常波动', color: 'blue' },
      { condition: '25-30', label: '市场紧张', color: 'orange' },
      { condition: '>30', label: '历史级恐慌', color: 'red' },
    ],
    meaning: 'VIX 恐慌指数，>30 为历史级恐慌区间，可作逆向参考。极端恐慌往往对应市场底部，是逆向投资者的重要信号。',
  },

  // ── 新增：全球指标 ─────────────────────────────────────────────────────────────
  gold: {
    thresholds: [
      { condition: '上涨趋势', label: '避险需求强', color: 'orange' },
      { condition: '下跌趋势', label: '风险偏好回升', color: 'green' },
    ],
    meaning: '避险资产，反映全球风险偏好。黄金上涨通常意味着避险需求强烈，与美元呈反向关系。可作为资产组合的对冲工具。',
  },
  crude_oil: {
    thresholds: [
      { condition: '<60 USD', label: '低油价', color: 'green' },
      { condition: '60-90 USD', label: '中性', color: 'blue' },
      { condition: '>90 USD', label: '通胀压力', color: 'orange' },
      { condition: '>100 USD', label: '高通胀风险', color: 'red' },
    ],
    meaning: '全球通胀与经济景气先行指标。油价上涨推高通胀预期，影响央行政策；油价暴跌可能预示全球需求萎缩。',
  },
  dxy: {
    thresholds: [
      { condition: '<95', label: '美元偏弱', color: 'green' },
      { condition: '95-105', label: '中性', color: 'blue' },
      { condition: '>105', label: '美元强势', color: 'orange' },
      { condition: '>110', label: '极端强势', color: 'red' },
    ],
    meaning: '美元指数 DXY，衡量美元相对一篮子货币的强弱。美元强势通常造成新兴市场资金外流压力，并压制大宗商品价格。',
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

    // ── 新增指标颜色逻辑 ───────────────────────────────────────────────────────────
    case 'cn_pmi':
    case 'us_pmi':
      if (value > 50) return 'green';
      if (value >= 49 && value <= 50) return 'orange';
      return 'red';

    case 'us_cpi':
      return 'blue';

    case 'us_pce':
      if (value < 2) return 'green';
      if (value >= 2 && value <= 3) return 'orange';
      return 'red';

    case 'us_payrolls':
      if (value > 200) return 'green';
      if (value >= 100 && value <= 200) return 'blue';
      if (value < 0) return 'red';
      return 'orange';

    case 'us_unrate':
      if (value < 4) return 'green';
      if (value >= 4 && value <= 5) return 'blue';
      if (value > 6) return 'red';
      return 'orange';

    case 'us_fedfunds':
      if (value < 1) return 'green';
      if (value >= 1 && value <= 3) return 'blue';
      if (value > 5) return 'red';
      return 'orange';

    case 'us_fed_balance':
      return 'blue';

    case 'us_sp500_pe':
      if (value < 20) return 'green';
      if (value >= 20 && value <= 30) return 'blue';
      if (value > 35) return 'red';
      return 'orange';

    case 'vix':
      if (value < 15) return 'green';
      if (value >= 15 && value <= 25) return 'blue';
      if (value > 30) return 'red';
      return 'orange';

    case 'gold':
    case 'crude_oil':
    case 'dxy':
      return 'blue';
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
          <div class="indicator-value-label">30年期</div>
          <div class="indicator-value-number small">${formatNumber(values['30_year'], 2)}<span class="indicator-value-unit">%</span></div>
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

    // ── 新增：中国宏观 ───────────────────────────────────────────────────────────
    case 'cn_pmi': {
      const mfgColor = getValueColor(key, values.manufacturing_pmi, 'manufacturing_pmi');
      const svcColor = getValueColor(key, values.services_pmi, 'services_pmi');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">制造业</div>
          <div class="indicator-value-number ${mfgColor}">${formatNumber(values.manufacturing_pmi, 1)}</div>
        </div>
        <div class="indicator-value">
          <div class="indicator-value-label">非制造业</div>
          <div class="indicator-value-number ${svcColor}">${formatNumber(values.services_pmi, 1)}</div>
        </div>
      `;
    }

    // ── 新增：美国宏观 ───────────────────────────────────────────────────────────
    case 'us_cpi':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">CPI指数</div>
          <div class="indicator-value-number">${formatNumber(values.cpi_index, 2)}</div>
        </div>
      `;

    case 'us_pce': {
      const pceColor = getValueColor(key, values.pce, 'pce');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">核心PCE</div>
          <div class="indicator-value-number ${pceColor}">${formatNumber(values.pce, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'us_pmi': {
      const usPmiColor = getValueColor(key, values.pmi, 'pmi');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">ISM PMI</div>
          <div class="indicator-value-number ${usPmiColor}">${formatNumber(values.pmi, 1)}</div>
        </div>
      `;
    }

    case 'us_payrolls':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">月增就业</div>
          <div class="indicator-value-number">${formatNumber(values.payrolls_k, 0)}<span class="indicator-value-unit">K</span></div>
        </div>
      `;

    case 'us_unrate': {
      const unrateColor = getValueColor(key, values.unrate, 'unrate');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">失业率</div>
          <div class="indicator-value-number ${unrateColor}">${formatNumber(values.unrate, 1)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    // ── 新增：美国利率/流动性 ────────────────────────────────────────────────────
    case 'us_fedfunds': {
      const fedColor = getValueColor(key, values.fedfunds, 'fedfunds');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">联邦基金利率</div>
          <div class="indicator-value-number ${fedColor}">${formatNumber(values.fedfunds, 2)}<span class="indicator-value-unit">%</span></div>
        </div>
      `;
    }

    case 'us_fed_balance':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">资产负债表</div>
          <div class="indicator-value-number">${formatNumber(values.balance_b, 0)}<span class="indicator-value-unit">亿美元</span></div>
        </div>
      `;

    // ── 新增：美国市场估值 ───────────────────────────────────────────────────────
    case 'us_sp500_pe': {
      const sp500PeColor = getValueColor(key, values.pe, 'pe');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">PE / CAPE</div>
          <div class="indicator-value-number ${sp500PeColor}">${formatNumber(values.pe, 2)}<span class="indicator-value-unit">倍</span></div>
        </div>
      `;
    }

    case 'vix': {
      const vixColor = getValueColor(key, values.vix, 'vix');
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">VIX</div>
          <div class="indicator-value-number ${vixColor}">${formatNumber(values.vix, 2)}</div>
        </div>
      `;
    }

    // ── 新增：全球指标 ───────────────────────────────────────────────────────────
    case 'gold':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">黄金</div>
          <div class="indicator-value-number">${formatNumber(values.gold, 2)}<span class="indicator-value-unit">USD/oz</span></div>
        </div>
      `;

    case 'crude_oil':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">WTI</div>
          <div class="indicator-value-number">${formatNumber(values.crude_oil, 2)}<span class="indicator-value-unit">USD/桶</span></div>
        </div>
      `;

    case 'dxy':
      return `
        <div class="indicator-value">
          <div class="indicator-value-label">DXY</div>
          <div class="indicator-value-number">${formatNumber(values.dxy, 2)}</div>
        </div>
      `;

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

// ── 双栏布局渲染 ──────────────────────────────────────────────────────────────

// 每个分层的显示配置
const LAYER_CONFIG = {
  macro:     { icon: '📊', title: '宏观环境' },
  liquidity: { icon: '💧', title: '利率 / 流动性' },
  valuation: { icon: '📈', title: '市场估值' },
};

// 每个市场的显示配置
const MARKET_CONFIG = {
  cn: { flag: '🇨🇳', title: '中国市场', subtitle: 'A股 · 港股' },
  us: { flag: '🇺🇸', title: '美国市场', subtitle: '美股 · 美债' },
};

/**
 * 渲染单个市场列（CN 或 US）
 * @param {'cn'|'us'} market 市场标识
 * @param {{ macro: object[], liquidity: object[], valuation: object[] }} layers 各分层指标数组
 * @returns {string} HTML 字符串
 */
export function renderMarketColumn(market, layers) {
  const { flag, title, subtitle } = MARKET_CONFIG[market] || {};

  // 渲染各分层，跳过空数组
  const layerSections = Object.entries(layers)
    .filter(([, indicators]) => indicators && indicators.length > 0)
    .map(([layerKey, indicators]) => {
      const { icon, title: layerTitle } = LAYER_CONFIG[layerKey] || { icon: '', title: layerKey };
      const cards = indicators.map(ind => renderIndicatorCard(ind)).join('');
      return `
        <div class="layer-section">
          <div class="layer-separator">
            <span class="layer-icon">${icon}</span>
            <span class="layer-title">${layerTitle}</span>
          </div>
          <div class="indicators-grid">
            ${cards}
          </div>
        </div>
      `;
    }).join('');

  return `
    <div class="market-column">
      <div class="market-column-header">
        <span class="market-flag">${flag}</span>
        <div class="market-column-title-group">
          <span class="market-title">${title}</span>
          <span class="market-subtitle">${subtitle}</span>
        </div>
      </div>
      ${layerSections}
    </div>
  `;
}

/**
 * 渲染全宽全球指标区块（BDI、黄金、原油、DXY）
 * @param {object[]} indicators 全球指标结果数组
 * @returns {string} HTML 字符串
 */
export function renderGlobalSection(indicators) {
  const cards = (indicators || []).map(ind => renderIndicatorCard(ind)).join('');
  return `
    <div class="global-section">
      <div class="global-section-header">
        <span class="global-title">全球指标</span>
        <span class="market-subtitle">大宗商品 · 航运 · 美元</span>
      </div>
      <div class="indicators-grid">
        ${cards}
      </div>
    </div>
  `;
}
