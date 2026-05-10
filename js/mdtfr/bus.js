// js/mdtfr/bus.js — 模块间事件总线 + 同步函数注册表
const _bus = new EventTarget();
const _reg = {};

export const emit     = (e, d)    => _bus.dispatchEvent(new CustomEvent(e, { detail: d }));
export const on       = (e, cb)   => _bus.addEventListener(e, ev => cb(ev.detail));
export const register = (k, fn)   => { _reg[k] = fn; };
export const call     = (k, ...a) => _reg[k]?.(...a);
