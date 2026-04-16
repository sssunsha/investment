// 观察状态管理模块
// 管理持仓标的 MA20 跌破观察状态，持久化到后端缓存

import { mdtfrLog } from './debug.js';

let _watchState = [];   // [{ code_c, name, first_break_date, last_check_date, days_below_ma20, status }]

async function loadWatchState() {
  try {
    const res = await fetch('/api/cache/watchstate');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) _watchState = data;
    }
  } catch {}
}

async function saveWatchState() {
  try {
    await fetch('/api/cache/watchstate', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_watchState),
    });
  } catch {}
}

/**
 * 根据最新数据更新 _watchState（仅在 fresh data 到达时调用）。
 * 只追踪当前持仓标的（有金额的）。
 * - 新首次跌破 MA20：向前查找历史快照（跨月/年），若历史也在MA20以下则直接 triggered
 * - 再次跌破（新日期）：days_below_ma20++，达到 2 时 → triggered
 * - 价格恢复到 MA20 上方：删除条目
 */
async function updateWatchState(items) {
  const dataDate = items.find(x => x.latest_date)?.latest_date;
  if (!dataDate) return;

  const holdingItems = items.filter(x => window.getAmt?.(x.code_c) > 0 && !x.error && x.above_ma20 != null);

  // 清理已不持仓的条目
  _watchState = _watchState.filter(w => holdingItems.some(x => x.code_c === w.code_c));

  // 找出需要新建 watch 条目的标的（当前跌破MA20 且 无现有记录）
  const newBelowItems = holdingItems.filter(x =>
    x.above_ma20 === false && _watchState.findIndex(w => w.code_c === x.code_c) < 0
  );

  // 如有新跌破标的，向前回溯最近一次历史快照（跨月/年）判断是否已连续跌破
  let prevSnapshotDate = null;
  const prevSnapshot = {};
  if (newBelowItems.length > 0) {
    try {
      const res = await fetch(`/api/cache/pool/latest-before/${dataDate}`);
      if (res.ok) {
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          prevSnapshotDate = data.date;
          data.items.forEach(item => { prevSnapshot[item.code_c] = item; });
          mdtfrLog('cache', `历史快照回溯：找到 ${prevSnapshotDate} 的记录，用于跨日MA20比对`);
        }
      }
    } catch {}
  }

  holdingItems.forEach(x => {
    const idx = _watchState.findIndex(w => w.code_c === x.code_c);
    if (x.above_ma20 === false) {
      if (idx < 0) {
        // 新跌破：检查历史快照是否也在 MA20 以下
        const prevItem = prevSnapshot[x.code_c];
        const wasAlreadyBelow = prevItem != null && prevItem.above_ma20 === false;
        if (wasAlreadyBelow) {
          mdtfrLog('cache', `[${x.name}] 历史(${prevSnapshotDate})也跌破MA20，直接设为「已触发」（连续2日）`);
          _watchState.push({
            code_c: x.code_c, name: x.name,
            first_break_date: prevSnapshotDate || dataDate,
            last_check_date: dataDate,
            days_below_ma20: 2, status: 'triggered',
          });
        } else {
          mdtfrLog('info', `[${x.name}] 首次跌破MA20，开始观察（第1日：${dataDate}）`);
          _watchState.push({
            code_c: x.code_c, name: x.name,
            first_break_date: dataDate, last_check_date: dataDate,
            days_below_ma20: 1, status: 'watching',
          });
        }
      } else {
        const entry = _watchState[idx];
        if (dataDate > entry.last_check_date) {
          // 新的交易日仍低于MA20 → 计为连续
          entry.days_below_ma20 += 1;
          entry.last_check_date = dataDate;
          if (entry.days_below_ma20 >= 2) {
            entry.status = 'triggered';
            mdtfrLog('cache', `[${x.name}] 连续${entry.days_below_ma20}日跌破MA20 → 状态升级为「已触发」`);
          }
        }
        // 同一天重新加载不重复计数
      }
    } else if (x.above_ma20 === true && idx >= 0) {
      mdtfrLog('info', `[${x.name}] 价格回到MA20上方，清除观察状态`);
      _watchState.splice(idx, 1);
    }
  });
}

export { loadWatchState, saveWatchState, updateWatchState };
