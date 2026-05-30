// tests/js/mdtfr/manual-sell.test.js
import { describe, it, expect } from 'vitest';

// 纯逻辑提取：不依赖 DOM / 模块副作用
function calcSellResult({ prevAmt, prevShares, prevCost, sellAmt }) {
  const ratio = prevAmt > 0 ? Math.min(sellAmt / prevAmt, 1) : 0;
  return {
    newAmt:    Math.max(0, prevAmt    - sellAmt),
    newShares: Math.max(0, prevShares - prevShares * ratio),
    newCost:   Math.max(0, prevCost   * (1 - ratio)),
    ratio,
  };
}

describe('手动卖出金额/份额计算', () => {
  it('全仓卖出后持仓清零', () => {
    const r = calcSellResult({ prevAmt: 10000, prevShares: 5000, prevCost: 9000, sellAmt: 10000 });
    expect(r.newAmt).toBe(0);
    expect(r.newShares).toBe(0);
    expect(r.newCost).toBe(0);
  });

  it('50% 卖出后份额和成本各减半', () => {
    const r = calcSellResult({ prevAmt: 10000, prevShares: 5000, prevCost: 9000, sellAmt: 5000 });
    expect(r.newAmt).toBe(5000);
    expect(r.newShares).toBeCloseTo(2500);
    expect(r.newCost).toBeCloseTo(4500);
  });

  it('卖出金额超过持仓时 ratio 上限为 1', () => {
    const r = calcSellResult({ prevAmt: 1000, prevShares: 500, prevCost: 900, sellAmt: 9999 });
    expect(r.ratio).toBe(1);
    expect(r.newAmt).toBe(0);
    expect(r.newShares).toBe(0);
  });

  it('持仓为 0 时 ratio 为 0，不产生负值', () => {
    const r = calcSellResult({ prevAmt: 0, prevShares: 0, prevCost: 0, sellAmt: 100 });
    expect(r.ratio).toBe(0);
    expect(r.newAmt).toBe(0);
  });
});
