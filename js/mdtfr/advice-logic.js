// js/mdtfr/advice-logic.js — 操作建议纯逻辑（无 DOM 依赖）
import { getDynAmt, getPosVal } from './amounts.js';
import { getWatchState } from './watch.js';

// 防守模式可选标的（C类代码）：沪深300、中证500、红利低波动、黄金
export const DEFENSE_CODES = new Set(['006131', '006382', '007467', '000217']);

// 当前建议数据（供 journal.js 读取后保存）
let _lastAdviceData = null;

export function getLastAdviceData() { return _lastAdviceData; }
export function setLastAdviceData(d) { _lastAdviceData = d; }

export function mdtfrBuildAdvice(items) {
  const valid = items.filter(x => !x.error && x.ret_20d != null && x.latest_close != null);
  if (valid.length === 0) return null;

  // ── 市场模式判断（两个独立 OR 条件）────────────────────
  const hs300 = valid.find(x => x.code_c === '006131');
  const cond1 = !!(hs300 && hs300.ma60 != null && hs300.latest_close > hs300.ma60);
  const aboveMa20Count = valid.filter(x => x.above_ma20).length;
  const aboveMa20Pct   = valid.length > 0 ? aboveMa20Count / valid.length : 0;
  const cond2 = aboveMa20Pct >= 0.8;
  const isAttack = cond1 || cond2;

  // 两个条件的文字说明（供 condRow 使用）
  const modeCond1Text = `沪深300 收盘价 > 60日均线（主条件）`;
  const modeCond1Note = hs300 && hs300.ma60 != null
    ? `收盘 ${hs300.latest_close?.toFixed(3)} ${cond1?'>':'≤'} MA60 ${hs300.ma60?.toFixed(3)}`
    : '数据不足';
  const modeCond2Text = `≥ 80% 标的收盘价站在20日均线上方（辅助条件）`;
  const modeCond2Note = `${aboveMa20Count}/${valid.length} 只站上MA20（${(aboveMa20Pct*100).toFixed(0)}%，阈值80%）`;

  // ── 候选池（基于模式筛选）────────────────────────────
  const pool = isAttack ? valid : valid.filter(x => DEFENSE_CODES.has(x.code_c));
  const ranked = [...pool].sort((a, b) => b.ret_20d - a.ret_20d);
  ranked.forEach((x, i) => { x._poolRank = i + 1; });

  // ── 买入筛选（只取前2，四条须同时满足）────────────────
  const top2 = ranked.slice(0, 2);
  top2.forEach(x => {
    x._c1 = x._poolRank <= 2;
    x._c2 = x.ret_20d != null && x.ret_20d >= 0.03;
    x._c3 = x.above_ma20 === true;
    x._c4 = x.latest_close != null && x.ma60 != null && x.latest_close > x.ma60 && x.ma60_rising === true;
    x._allPass = x._c1 && x._c2 && x._c3 && x._c4;
  });
  const buyCandidates = top2.filter(x => x._allPass);

  // ── 全局排名（先于持仓计算，确保 _globalRank 写入原对象）──
  const allRanked = [...valid].sort((a,b) => b.ret_20d - a.ret_20d);
  allRanked.forEach((x, i) => { x._globalRank = i + 1; });

  // ── 持仓（从全局 _amt/_mktVal 读取；此时 valid 对象已含 _globalRank）──
  const holdings = valid.filter(x => getDynAmt(x.code_c) > 0)
    .map(x => ({ ...x, _posVal: getPosVal(x.code_c), _amt: getDynAmt(x.code_c) }));

  // 条件1：趋势破位（跌破MA20）
  const sellBelowMa20 = holdings.filter(x => x.above_ma20 === false);
  // 条件1b：价格跌破MA60 → 清仓
  const sellBelowMa60 = holdings.filter(x => x.ma60 != null && x.latest_close != null && x.latest_close < x.ma60);
  // 条件2：排名跌出前6
  const sellOutTop6   = holdings.filter(x => x._globalRank > 6);

  const _watchState = getWatchState();

  return {
    isAttack, cond1, cond2,
    modeCond1Text, modeCond1Note, modeCond2Text, modeCond2Note,
    pool, ranked, top2, buyCandidates,
    holdings, sellBelowMa20, sellBelowMa60, sellOutTop6,
    valid, aboveMa20Count, aboveMa20Pct, hs300,
    _watchState,
  };
}
