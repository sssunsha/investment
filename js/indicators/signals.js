// js/indicators/signals.js — 买卖信号面板、决策矩阵渲染

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

export function getRecommendationIcon(rec) {
  const icons = {
    strong_buy: '🚀',
    buy: '📈',
    neutral: '➖',
    sell: '📉',
    strong_sell: '🔻',
  };
  return icons[rec] || '➖';
}

export function renderDecisionMatrix(matrix) {
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

export function renderSignalPanel(signals) {
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
