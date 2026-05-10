// tests/js/indicators/cards.test.js — formatNumber 纯函数测试

import { describe, it, expect } from 'vitest';
import { formatNumber } from '../../../js/indicators/cards.js';

describe('formatNumber', () => {
  it('null 返回破折号', () => {
    expect(formatNumber(null)).toBe('—');
  });

  it('undefined 返回破折号', () => {
    expect(formatNumber(undefined)).toBe('—');
  });

  it('默认保留 2 位小数', () => {
    expect(formatNumber(3.14159)).toBe('3.14');
  });

  it('指定小数位数', () => {
    expect(formatNumber(3.14159, 4)).toBe('3.1416');
  });

  it('整数补零到 2 位', () => {
    expect(formatNumber(42)).toBe('42.00');
  });

  it('0 返回 "0.00"', () => {
    expect(formatNumber(0)).toBe('0.00');
  });

  it('负数正确格式化', () => {
    expect(formatNumber(-1.5)).toBe('-1.50');
  });

  it('字符串数字照常格式化', () => {
    expect(formatNumber('3.1')).toBe('3.10');
  });

  it('0 位小数返回整数字符串', () => {
    expect(formatNumber(3.7, 0)).toBe('4');
  });
});
