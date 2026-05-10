// tests/js/mdtfr/amounts.test.js — 持仓金额状态核心逻辑测试

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getShares, setShares,
  getCost, setCost,
  getDynAmt, hasMktVal,
  refreshAmtPnl,
  getAmt, setAmt,
} from '../../../js/mdtfr/amounts.js';

// 各测试组使用独立 code_c，避免模块状态污染

describe('getShares / setShares', () => {
  const CODE = 'UT_SHARES_01';

  it('未设置时 getShares 返回 0', () => {
    expect(getShares(CODE)).toBe(0);
  });

  it('setShares 后 getShares 读回相同值', () => {
    setShares(CODE, 500);
    expect(getShares(CODE)).toBe(500);
  });

  it('setShares 0 清零', () => {
    setShares(CODE, 100);
    setShares(CODE, 0);
    expect(getShares(CODE)).toBe(0);
  });

  it('setShares 非数字字符串视为 0', () => {
    setShares(CODE, 'abc');
    expect(getShares(CODE)).toBe(0);
  });
});

describe('getCost / setCost', () => {
  const CODE = 'UT_COST_01';

  it('未设置时 getCost 返回 0', () => {
    expect(getCost(CODE)).toBe(0);
  });

  it('setCost 后 getCost 读回相同值', () => {
    setCost(CODE, 12000);
    expect(getCost(CODE)).toBe(12000);
  });

  it('setCost 支持小数', () => {
    setCost(CODE, 1234.56);
    expect(getCost(CODE)).toBeCloseTo(1234.56);
  });
});

describe('getDynAmt', () => {
  const CODE_NO_MKT  = 'UT_DYN_NO_MKT';
  const CODE_HAS_MKT = 'UT_DYN_HAS_MKT';

  beforeEach(() => {
    // 为有市值的 code 设置 shares，让 refreshAmtPnl 能填入 _mktVal
    setShares(CODE_HAS_MKT, 200);
  });

  it('没有动态市值时 getDynAmt 返回录入金额', () => {
    setAmt(CODE_NO_MKT, 8000);
    expect(getDynAmt(CODE_NO_MKT)).toBe(8000);
  });

  it('refreshAmtPnl 填入 _mktVal 后 getDynAmt 返回动态市值', () => {
    refreshAmtPnl([{ code_c: CODE_HAS_MKT, latest_close: 5.5 }]);
    // 200 shares × 5.5 = 1100，Math.round(1100) = 1100
    expect(getDynAmt(CODE_HAS_MKT)).toBe(1100);
  });

  it('动态市值优先于手动录入金额', () => {
    setAmt(CODE_HAS_MKT, 9999);
    refreshAmtPnl([{ code_c: CODE_HAS_MKT, latest_close: 5.5 }]);
    expect(getDynAmt(CODE_HAS_MKT)).toBe(1100); // 动态市值覆盖 9999
  });
});

describe('hasMktVal', () => {
  const CODE_BEFORE = 'UT_MKT_BEFORE';
  const CODE_AFTER  = 'UT_MKT_AFTER';

  it('refreshAmtPnl 调用前 hasMktVal 为 false', () => {
    expect(hasMktVal(CODE_BEFORE)).toBe(false);
  });

  it('refreshAmtPnl 成功后 hasMktVal 为 true', () => {
    setShares(CODE_AFTER, 100);
    refreshAmtPnl([{ code_c: CODE_AFTER, latest_close: 10.0 }]);
    expect(hasMktVal(CODE_AFTER)).toBe(true);
  });
});

describe('refreshAmtPnl — 边界条件', () => {
  const CODE = 'UT_PNL_EDGE';

  it('item.error 为 true 时跳过，不填入 _mktVal', () => {
    setShares(CODE + '_ERR', 100);
    refreshAmtPnl([{ code_c: CODE + '_ERR', latest_close: 10.0, error: true }]);
    expect(hasMktVal(CODE + '_ERR')).toBe(false);
  });

  it('latest_close 为 null 时跳过', () => {
    setShares(CODE + '_NULL', 100);
    refreshAmtPnl([{ code_c: CODE + '_NULL', latest_close: null }]);
    expect(hasMktVal(CODE + '_NULL')).toBe(false);
  });

  it('shares 为 0 时不填入 _mktVal（无持仓）', () => {
    setShares(CODE + '_ZERO', 0);
    refreshAmtPnl([{ code_c: CODE + '_ZERO', latest_close: 10.0 }]);
    expect(hasMktVal(CODE + '_ZERO')).toBe(false);
  });

  it('市值按 shares × latest_close 四舍五入计算', () => {
    const c = CODE + '_ROUND';
    setShares(c, 3);
    refreshAmtPnl([{ code_c: c, latest_close: 1.005 }]);
    expect(getDynAmt(c)).toBe(Math.round(3 * 1.005));
  });
});
