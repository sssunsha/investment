// js/rebalance-day.js — 调仓日/休市日样式计算
function formatDate(d) {
  const days = ['日','一','二','三','四','五','六'];
  return `${d.getFullYear()} 年 ${d.getMonth()+1} 月 ${d.getDate()} 日  星期${days[d.getDay()]}`;
}

// 调仓日判断：每两周周四，锚点 2026-04-16
// 若该周四为节假日，顺延到下一个交易日
const _REBALANCE_ANCHOR = new Date('2026-04-16T00:00:00');

// 从锚点起，计算最近前后若干个"计划周四"日期字符串列表（YYYY-MM-DD）
function _scheduledThursdays(n = 10) {
  const result = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(_REBALANCE_ANCHOR.getTime() + i * 14 * 86400000);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

// tradingDaySet: Set<YYYY-MM-DD>，为空时退化为只判断周四
function _buildActualRebalanceDays(tradingDaySet) {
  const thursdays = _scheduledThursdays(20); // 约 40 周，够用
  const actual = new Set();
  for (const thu of thursdays) {
    if (!tradingDaySet.size || tradingDaySet.has(thu)) {
      actual.add(thu);
    } else {
      // 顺延：找 thu 之后最近的交易日（最多往后找 7 天）
      for (let offset = 1; offset <= 7; offset++) {
        const d = new Date(thu + 'T00:00:00');
        d.setDate(d.getDate() + offset);
        const ds = d.toISOString().slice(0, 10);
        if (tradingDaySet.has(ds)) { actual.add(ds); break; }
      }
    }
  }
  return actual;
}

// 全局实际调仓日集合（异步加载后填充）
let _actualRebalanceDays = new Set();

function applyRebalanceDayStyle(tradingDaySet = new Set()) {
  _actualRebalanceDays = _buildActualRebalanceDays(tradingDaySet);
  const today = new Date().toISOString().slice(0, 10);

  // 三种状态：休市日 > 调仓日 > 普通交易日
  const isHoliday  = tradingDaySet.size > 0 && !tradingDaySet.has(today);
  const isRD       = !isHoliday && _actualRebalanceDays.has(today);

  document.body.classList.toggle('holiday-day',   isHoliday);
  document.body.classList.toggle('rebalance-day',  isRD);

  let badgeClass, badgeText;
  if (isHoliday)  { badgeClass = 'holiday'; badgeText = '🏖 休市日'; }
  else if (isRD)  { badgeClass = 'on';      badgeText = '📅 调仓日'; }
  else            { badgeClass = 'off';     badgeText = '· 非调仓日'; }

  const dateEl = document.getElementById('header-date');
  dateEl.textContent = formatDate(new Date());
  const old = dateEl.querySelector('.rebalance-badge');
  if (old) old.remove();
  const badge = document.createElement('span');
  badge.className = 'rebalance-badge ' + badgeClass;
  badge.textContent = badgeText;
  dateEl.appendChild(badge);
}

async function initRebalanceDayStyle() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    // 从今天起，向后覆盖约 40 周（包含今天，确保能判断今日是否交易日）
    const end = new Date(_REBALANCE_ANCHOR.getTime() + 20 * 14 * 86400000);
    const e = end.toISOString().slice(0, 10);
    const res = await fetch(`/api/metadata/query_trade_dates?start_date=${todayStr}&end_date=${e}`);
    if (!res.ok) throw new Error('api error');
    const json = await res.json();
    const tradingSet = new Set(
      (json.data || []).filter(r => r.is_trading_day === '1').map(r => r.calendar_date)
    );
    applyRebalanceDayStyle(tradingSet);
  } catch (_) {
    // 接口失败：退化为纯周四规则，不判断休市日
    applyRebalanceDayStyle(new Set());
  }
}

export { formatDate, applyRebalanceDayStyle, initRebalanceDayStyle };
