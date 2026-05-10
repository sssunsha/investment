// tests/js/rebalance-day.test.js — _addDays / _buildActualRebalanceDays 核心逻辑测试

import { describe, it, expect } from 'vitest';
import { _addDays, _buildActualRebalanceDays } from '../../js/rebalance-day.js';

describe('_addDays', () => {
  it('月内加天', () => {
    expect(_addDays('2026-04-23', 7)).toBe('2026-04-30');
  });

  it('跨月加天', () => {
    expect(_addDays('2026-04-23', 14)).toBe('2026-05-07');
  });

  it('跨年加天', () => {
    expect(_addDays('2025-12-25', 10)).toBe('2026-01-04');
  });

  it('闰年 2 月 28 日 +1 天 → 2 月 29 日', () => {
    expect(_addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('闰年 2 月 28 日 +2 天 → 3 月 1 日', () => {
    expect(_addDays('2024-02-28', 2)).toBe('2024-03-01');
  });

  it('非闰年 2 月 28 日 +1 天 → 3 月 1 日', () => {
    expect(_addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('加 0 天返回相同日期', () => {
    expect(_addDays('2026-04-23', 0)).toBe('2026-04-23');
  });

  it('月末 31 日加天正确跨月', () => {
    expect(_addDays('2026-01-31', 1)).toBe('2026-02-01');
  });
});

describe('_buildActualRebalanceDays', () => {
  // 锚点固定为 '2026-04-23'

  it('结果集包含锚点', () => {
    expect(_buildActualRebalanceDays(new Set(), 1).has('2026-04-23')).toBe(true);
  });

  it('空交易日集时按纯 14 天间隔排列', () => {
    const result = _buildActualRebalanceDays(new Set(), 3);
    expect(result.has('2026-04-23')).toBe(true); // 锚点
    expect(result.has('2026-05-07')).toBe(true); // 04-23 + 14
    expect(result.has('2026-05-21')).toBe(true); // 05-07 + 14
  });

  it('返回的 Set 大小等于 n', () => {
    expect(_buildActualRebalanceDays(new Set(), 5).size).toBe(5);
  });

  it('计划日是交易日时直接采用', () => {
    // 05-07 在交易日集合中 → 直接用
    const ts = new Set(['2026-04-23', '2026-05-07', '2026-05-21']);
    const result = _buildActualRebalanceDays(ts, 3);
    expect(result.has('2026-04-23')).toBe(true);
    expect(result.has('2026-05-07')).toBe(true);
    expect(result.has('2026-05-21')).toBe(true);
  });

  it('计划日非交易日时向后顺延到最近交易日', () => {
    // 05-07 不是交易日，05-08 是 → 顺延一天
    // 以 05-08 为基点再 +14 = 05-22 → 05-22 是交易日
    const ts = new Set(['2026-04-23', '2026-05-08', '2026-05-22']);
    const result = _buildActualRebalanceDays(ts, 3);
    expect(result.has('2026-04-23')).toBe(true);
    expect(result.has('2026-05-08')).toBe(true); // 05-07 顺延到 05-08
    expect(result.has('2026-05-22')).toBe(true); // 05-08 + 14 = 05-22 直接命中
  });

  it('7 天内找不到交易日时退化为计划日本身', () => {
    // tradingSet 仅有锚点，后续所有计划日及偏移日均不在集合中
    const ts = new Set(['2026-04-23']);
    const result = _buildActualRebalanceDays(ts, 2);
    expect(result.has('2026-04-23')).toBe(true);
    expect(result.has('2026-05-07')).toBe(true); // 退化到计划日 04-23+14
  });

  it('顺延不超过 7 天——第 8 天不会被采用', () => {
    // 05-07 非交易日；05-08 至 05-13（offset 1-6）非交易日；05-14 是（offset 7）
    // 注意：offset 最大为 7，05-14 = 05-07 + 7 → 应被找到
    const ts = new Set(['2026-04-23', '2026-05-14']);
    const result = _buildActualRebalanceDays(ts, 2);
    expect(result.has('2026-04-23')).toBe(true);
    expect(result.has('2026-05-14')).toBe(true); // offset=7 恰好找到
  });
});
