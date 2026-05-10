// tests/js/mdtfr/advice-logic.test.js — mdtfrBuildAdvice 纯逻辑测试
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟依赖模块（DOM/HTTP 无关）
vi.mock('../../../js/mdtfr/amounts.js', () => ({
  getDynAmt: vi.fn().mockReturnValue(0),
  getPosVal:  vi.fn().mockReturnValue(0),
  setLastMdtfrItems: vi.fn(),
}));
vi.mock('../../../js/mdtfr/available.js', () => ({
  getTotalAmt: vi.fn().mockReturnValue(0),
}));
vi.mock('../../../js/mdtfr/watch.js', () => ({
  getWatchState: vi.fn().mockReturnValue([]),
}));

import { mdtfrBuildAdvice, DEFENSE_CODES, getLastAdviceData, setLastAdviceData } from '../../../js/mdtfr/advice-logic.js';
import { getDynAmt } from '../../../js/mdtfr/amounts.js';

// ── 工具函数 ──────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    code_c: 'TEST01',
    ret_20d: 0.05,
    latest_close: 1.5,
    ma60: 1.0,
    ma60_rising: true,
    above_ma20: true,
    error: null,
    ...overrides,
  };
}

// ── DEFENSE_CODES ─────────────────────────────────────────────

describe('DEFENSE_CODES', () => {
  it('包含沪深300（006131）', () => {
    expect(DEFENSE_CODES.has('006131')).toBe(true);
  });

  it('包含中证500（006382）', () => {
    expect(DEFENSE_CODES.has('006382')).toBe(true);
  });

  it('包含红利低波动（007467）', () => {
    expect(DEFENSE_CODES.has('007467')).toBe(true);
  });

  it('包含黄金（000217）', () => {
    expect(DEFENSE_CODES.has('000217')).toBe(true);
  });
});

// ── 空输入 ────────────────────────────────────────────────────

describe('mdtfrBuildAdvice — 空/无效输入', () => {
  it('空数组返回 null', () => {
    expect(mdtfrBuildAdvice([])).toBeNull();
  });

  it('全部有 error 的项返回 null', () => {
    const items = [makeItem({ error: 'fetch failed', ret_20d: null, latest_close: null })];
    expect(mdtfrBuildAdvice(items)).toBeNull();
  });

  it('ret_20d 为 null 的项被过滤掉', () => {
    const items = [makeItem({ ret_20d: null, latest_close: null })];
    expect(mdtfrBuildAdvice(items)).toBeNull();
  });
});

// ── 进攻/防守模式判断 ──────────────────────────────────────────

describe('mdtfrBuildAdvice — 市场模式判断', () => {
  it('沪深300收盘>MA60 → 进攻模式', () => {
    const hs300 = makeItem({ code_c: '006131', latest_close: 2.0, ma60: 1.0 });
    const result = mdtfrBuildAdvice([hs300]);
    expect(result.isAttack).toBe(true);
    expect(result.cond1).toBe(true);
  });

  it('沪深300收盘≤MA60 但 ≥80% 站上MA20 → 进攻模式（辅助条件）', () => {
    const hs300 = makeItem({ code_c: '006131', latest_close: 0.9, ma60: 1.0 });
    // 5 只全部 above_ma20 = true → 100% ≥ 80%
    const others = Array.from({ length: 4 }, (_, i) =>
      makeItem({ code_c: `00A0${i}`, above_ma20: true })
    );
    const result = mdtfrBuildAdvice([hs300, ...others]);
    expect(result.cond1).toBe(false);
    expect(result.cond2).toBe(true);
    expect(result.isAttack).toBe(true);
  });

  it('沪深300收盘≤MA60 且 <80% 站上MA20 → 防守模式', () => {
    const hs300 = makeItem({ code_c: '006131', latest_close: 0.9, ma60: 1.0, above_ma20: false });
    // 另外4只全部不在MA20上方
    const others = Array.from({ length: 4 }, (_, i) =>
      makeItem({ code_c: `00B0${i}`, above_ma20: false })
    );
    const result = mdtfrBuildAdvice([hs300, ...others]);
    expect(result.isAttack).toBe(false);
  });

  it('无沪深300数据时 cond1 = false', () => {
    const item = makeItem({ code_c: 'OTHER1', above_ma20: false });
    const result = mdtfrBuildAdvice([item]);
    expect(result.cond1).toBe(false);
    expect(result.hs300).toBeUndefined();
  });
});

// ── 候选池筛选 ────────────────────────────────────────────────

describe('mdtfrBuildAdvice — 候选池筛选', () => {
  it('进攻模式 pool = 全部有效标的', () => {
    const hs300 = makeItem({ code_c: '006131', latest_close: 2.0, ma60: 1.0 });
    const other = makeItem({ code_c: 'OTHER2' });
    const result = mdtfrBuildAdvice([hs300, other]);
    expect(result.pool.length).toBe(2);
  });

  it('防守模式 pool 只含 DEFENSE_CODES 标的', () => {
    // 强制防守：沪深300跌破MA60，不足80%站上MA20
    const hs300 = makeItem({ code_c: '006131', latest_close: 0.5, ma60: 1.0, above_ma20: false });
    const nonDefense = makeItem({ code_c: 'OTHER3', above_ma20: false });
    const defense = makeItem({ code_c: '006382', above_ma20: false });
    const result = mdtfrBuildAdvice([hs300, nonDefense, defense]);
    expect(result.isAttack).toBe(false);
    const poolCodes = result.pool.map(x => x.code_c);
    expect(poolCodes).toContain('006382');
    expect(poolCodes).not.toContain('OTHER3');
  });
});

// ── 买入候选条件 ──────────────────────────────────────────────

describe('mdtfrBuildAdvice — 买入候选', () => {
  it('满足全部4条件的标的进入 buyCandidates', () => {
    const hs300 = makeItem({ code_c: '006131', latest_close: 2.0, ma60: 1.0, ret_20d: 0.08, above_ma20: true, ma60_rising: true });
    const result = mdtfrBuildAdvice([hs300]);
    expect(result.buyCandidates.length).toBeGreaterThan(0);
    expect(result.buyCandidates[0]._allPass).toBe(true);
  });

  it('ret_20d < 0.03 时 _c2 = false，不进入 buyCandidates', () => {
    const hs300 = makeItem({ code_c: '006131', latest_close: 2.0, ma60: 1.0, ret_20d: 0.01, above_ma20: true, ma60_rising: true });
    const result = mdtfrBuildAdvice([hs300]);
    expect(result.top2[0]._c2).toBe(false);
    expect(result.top2[0]._allPass).toBe(false);
    expect(result.buyCandidates.length).toBe(0);
  });

  it('above_ma20 = false 时 _c3 = false', () => {
    const hs300 = makeItem({ code_c: '006131', latest_close: 2.0, ma60: 1.0, ret_20d: 0.10, above_ma20: false, ma60_rising: true });
    const result = mdtfrBuildAdvice([hs300]);
    expect(result.top2[0]._c3).toBe(false);
    expect(result.buyCandidates.length).toBe(0);
  });

  it('最多返回 2 个买入候选', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem({ code_c: `00C0${i}`, ret_20d: (5 - i) * 0.02, latest_close: 2.0, ma60: 1.0, ma60_rising: true, above_ma20: true })
    );
    // 前两名 ret_20d = 0.10 和 0.08，都满足 ≥ 0.03
    // 进攻：需要沪深300>MA60；这里没有006131所以 cond1=false
    // cond2：5只全部above_ma20 → 100% ≥ 80% → 进攻
    const result = mdtfrBuildAdvice(items);
    expect(result.top2.length).toBe(2);
  });
});

// ── 卖出信号 ──────────────────────────────────────────────────

describe('mdtfrBuildAdvice — 卖出信号', () => {
  beforeEach(() => {
    // 模拟某标的有持仓
    getDynAmt.mockImplementation(code => (code === '006131' ? 10000 : 0));
  });

  it('持仓标的跌破MA20 → 出现在 sellBelowMa20', () => {
    const hs300 = makeItem({ code_c: '006131', latest_close: 2.0, ma60: 1.0, above_ma20: false });
    const result = mdtfrBuildAdvice([hs300]);
    const codes = result.sellBelowMa20.map(x => x.code_c);
    expect(codes).toContain('006131');
  });

  it('持仓标的站上MA20 → 不在 sellBelowMa20', () => {
    const hs300 = makeItem({ code_c: '006131', latest_close: 2.0, ma60: 1.0, above_ma20: true });
    const result = mdtfrBuildAdvice([hs300]);
    expect(result.sellBelowMa20.length).toBe(0);
  });
});

// ── getLastAdviceData / setLastAdviceData ─────────────────────

describe('getLastAdviceData / setLastAdviceData', () => {
  it('初始值为 null', () => {
    setLastAdviceData(null);
    expect(getLastAdviceData()).toBeNull();
  });

  it('setLastAdviceData 后 getLastAdviceData 读回相同对象', () => {
    const data = { finalType: 'attack', finalTitle: '进攻' };
    setLastAdviceData(data);
    expect(getLastAdviceData()).toBe(data);
  });

  it('覆盖写入后读取最新值', () => {
    setLastAdviceData({ finalType: 'defense' });
    setLastAdviceData({ finalType: 'attack' });
    expect(getLastAdviceData()?.finalType).toBe('attack');
  });
});
