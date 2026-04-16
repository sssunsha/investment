// js/rebalance-day.js — 调仓日/休市日样式计算
function formatDate(d) {
  const days = ['日','一','二','三','四','五','六'];
  return `${d.getFullYear()} 年 ${d.getMonth()+1} 月 ${d.getDate()} 日  星期${days[d.getDay()]}`;
}

// 调仓日锚点：2026-04-16（周四，已确认为调仓日）
const _REBALANCE_ANCHOR = '2026-04-16';

/** 日期字符串 + n 天，返回 YYYY-MM-DD */
function _addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 从锚点起，按"实际调仓日 + 14 天"规则，生成最多 n 个实际调仓日（YYYY-MM-DD）。
 * tradingDaySet 为空时退化为不判断节假日（直接用计划日）。
 *
 * 规则：
 *   1. 第一个调仓日 = 锚点本身（已是交易日）
 *   2. 下一个计划日 = 当前实际调仓日 + 14 天
 *   3. 若计划日是交易日 → 即为实际调仓日
 *      若不是 → 向后找最近交易日（最多 7 天）→ 实际调仓日
 *   4. 以实际调仓日为新基点，重复步骤 2
 */
function _buildActualRebalanceDays(tradingDaySet, n = 30) {
  const result = [];
  let base = _REBALANCE_ANCHOR;

  for (let i = 0; i < n; i++) {
    result.push(base);

    const planned = _addDays(base, 14);

    if (!tradingDaySet.size || tradingDaySet.has(planned)) {
      base = planned;
    } else {
      let found = null;
      for (let offset = 1; offset <= 7; offset++) {
        const ds = _addDays(planned, offset);
        if (tradingDaySet.has(ds)) { found = ds; break; }
      }
      // 7 天内找不到（数据不足）时退化为计划日本身
      base = found ?? planned;
    }
  }
  return new Set(result);
}

// 全局实际调仓日集合（异步加载后填充）
let _actualRebalanceDays = new Set();

/** 立即显示日期，badge 占位为"…"，避免白屏等待 */
function _showDateImmediate() {
  const dateEl = document.getElementById('header-date');
  if (!dateEl) return;
  dateEl.textContent = formatDate(new Date());
  const badge = document.createElement('span');
  badge.className = 'rebalance-badge off';
  badge.textContent = '…';
  dateEl.appendChild(badge);
}

function applyRebalanceDayStyle(tradingDaySet = new Set()) {
  _actualRebalanceDays = _buildActualRebalanceDays(tradingDaySet);
  const today = new Date().toISOString().slice(0, 10);

  // 三种状态：休市日 > 调仓日 > 普通交易日
  const isHoliday = tradingDaySet.size > 0 && !tradingDaySet.has(today);
  const isRD      = !isHoliday && _actualRebalanceDays.has(today);

  document.body.classList.toggle('holiday-day',  isHoliday);
  document.body.classList.toggle('rebalance-day', isRD);

  let badgeClass, badgeText;
  if (isHoliday) { badgeClass = 'holiday'; badgeText = '🏖 休市日'; }
  else if (isRD) { badgeClass = 'on';      badgeText = '📅 调仓日'; }
  else           { badgeClass = 'off';     badgeText = '· 非调仓日'; }

  const dateEl = document.getElementById('header-date');
  if (!dateEl) return;
  dateEl.textContent = formatDate(new Date());
  // 复用已有 badge（避免重建闪烁），或新建
  let badge = dateEl.querySelector('.rebalance-badge');
  if (!badge) {
    badge = document.createElement('span');
    dateEl.appendChild(badge);
  }
  badge.className = 'rebalance-badge ' + badgeClass;
  badge.textContent = badgeText;
}

async function initRebalanceDayStyle() {
  // 立即显示日期，不等 API
  _showDateImmediate();

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    // 向后覆盖约 30 个调仓周期（~420 天）
    const endStr = _addDays(todayStr, 420);
    const res = await fetch(`/api/metadata/query_trade_dates?start_date=${todayStr}&end_date=${endStr}`);
    if (!res.ok) throw new Error('api error');
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    const tradingSet = new Set(
      (json.data || []).filter(r => r.is_trading_day === '1').map(r => r.calendar_date)
    );
    applyRebalanceDayStyle(tradingSet);
  } catch (_) {
    // 接口失败：退化为纯计划日规则，不判断休市日
    applyRebalanceDayStyle(new Set());
  }
}

export { formatDate, applyRebalanceDayStyle, initRebalanceDayStyle };
