// tests/js/mdtfr/bus.test.js — EventBus (emit/on/register/call) 单元测试
import { describe, it, expect, vi } from 'vitest';
import { emit, on, register, call } from '../../../js/mdtfr/bus.js';

// ── on / emit ────────────────────────────────────────────────

describe('on / emit', () => {
  it('emit 触发对应事件，on 收到 detail', () => {
    const handler = vi.fn();
    on('test:basic', handler);
    emit('test:basic', { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('同一事件可注册多个监听器，全部触发', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    on('test:multi', h1);
    on('test:multi', h2);
    emit('test:multi', 'hello');
    expect(h1).toHaveBeenCalledWith('hello');
    expect(h2).toHaveBeenCalledWith('hello');
  });

  it('emit 未监听的事件不报错', () => {
    expect(() => emit('test:no-listener', {})).not.toThrow();
  });

  it('emit detail 省略时 on 收到 null（CustomEvent 规范行为）', () => {
    const handler = vi.fn();
    on('test:no-detail', handler);
    emit('test:no-detail');
    expect(handler).toHaveBeenCalledWith(null);
  });

  it('不同事件名互不干扰', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    on('test:ev-a', h1);
    on('test:ev-b', h2);
    emit('test:ev-a', 1);
    expect(h1).toHaveBeenCalledWith(1);
    expect(h2).not.toHaveBeenCalled();
  });
});

// ── register / call ──────────────────────────────────────────

describe('register / call', () => {
  it('register 后 call 执行函数并返回结果', () => {
    register('test:add', (a, b) => a + b);
    expect(call('test:add', 3, 4)).toBe(7);
  });

  it('call 未注册的 key 返回 undefined（不报错）', () => {
    expect(call('test:nonexistent')).toBeUndefined();
  });

  it('register 覆盖旧函数', () => {
    register('test:greet', () => 'old');
    register('test:greet', () => 'new');
    expect(call('test:greet')).toBe('new');
  });

  it('call 透传多个参数', () => {
    const fn = vi.fn().mockReturnValue('ok');
    register('test:multi-args', fn);
    call('test:multi-args', 'a', 'b', 'c');
    expect(fn).toHaveBeenCalledWith('a', 'b', 'c');
  });

  it('call 无参数时仍可调用', () => {
    register('test:no-args', () => 99);
    expect(call('test:no-args')).toBe(99);
  });
});
