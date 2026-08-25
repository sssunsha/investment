// js/mdtfr/valuation.js
// 指数估值百分位：获取数据、设置名称颜色、存储到 DOM data 属性

import { getMdtfrPoolDef } from './config.js';

// 估值区间 → 颜色映射
const ZONE_COLORS = {
  '低估': '#3b82f6',   // 蓝色
  '较低': '#22c55e',   // 绿色
  '正常': '#ffffff',   // 白色（默认）
  '较高': '#f97316',   // 橘色
  '高估': '#ef4444',   // 红色
};

// 模块内缓存（避免重复请求）
let _valuationData = null;
let _valuationDate = null;

/**
 * 从后端 API 获取估值百分位数据
 * @param {boolean} force 是否强制刷新
 * @returns {Promise<object|null>} { items: { code_c: { current_pe, percentile_10y, percentile_5y, zone, ... } } }
 */
async function fetchValuationData(force = false) {
  const today = new Date().toISOString().slice(0, 10);

  // 使用内存缓存
  if (!force && _valuationData && _valuationDate === today) {
    return _valuationData;
  }

  try {
    const url = `/api/strategy/valuation/batch?years=10${force ? '&force=true' : ''}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.items) {
      _valuationData = data;
      _valuationDate = today;
      return data;
    }
  } catch (e) {
    console.warn('[valuation] 获取估值数据失败:', e);
  }
  return null;
}

/**
 * 将估值数据应用到表格：设置名称颜色 + 存储 data 属性
 */
function applyValuationToTable(data) {
  if (!data || !data.items) return;

  const pool = getMdtfrPoolDef();
  for (const def of pool) {
    const info = data.items[def.code_c];
    const nameEl = document.getElementById(`mdtfr-name-${def.code_c}`);
    if (!nameEl) continue;

    if (!info || info.error || info.zone == null) {
      // 无数据或出错，保持默认
      nameEl.dataset.valZone = '';
      nameEl.dataset.valPe = '';
      nameEl.dataset.valPercentile10y = '';
      nameEl.dataset.valPercentile5y = '';
      continue;
    }

    // 存储 data 属性供 tooltip 使用
    nameEl.dataset.valZone = info.zone;
    nameEl.dataset.valPe = info.current_pe != null ? String(info.current_pe) : '';
    nameEl.dataset.valPercentile10y = info.percentile_10y != null ? String(info.percentile_10y) : '';
    nameEl.dataset.valPercentile5y = info.percentile_5y != null ? String(info.percentile_5y) : '';

    // 设置名称文字颜色
    const color = ZONE_COLORS[info.zone] || '#ffffff';
    const nameSpan = nameEl.querySelector('span:first-child');
    if (nameSpan) {
      nameSpan.style.color = color;
    }
  }
}

/**
 * 主入口：获取估值数据并应用到表格
 * @param {boolean} force 是否强制刷新
 */
async function loadAndApplyValuation(force = false) {
  const data = await fetchValuationData(force);
  if (data) {
    applyValuationToTable(data);
  }
}

export { loadAndApplyValuation, fetchValuationData, applyValuationToTable, ZONE_COLORS };
