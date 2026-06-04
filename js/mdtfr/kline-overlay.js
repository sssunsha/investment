// js/mdtfr/kline-overlay.js
// K线图浮层：负责浮层 DOM 的创建、定位、图片 URL 生成、周期切换、开/关。
// 使用 position:fixed 挂到 body，完全避开 overflow-x:auto 裁剪问题。

let _overlay = null;
let _activePeriod = 'daily';
let _activeCodeC = null;
let _activeEtf = null;
let _activeName = null;
let _wrap = null;  // 保存 wrap 引用供 resize 使用

/** ETF 代码 → 新浪交易所前缀 */
function _exchange(etf) {
  return (etf.startsWith('1') || etf.startsWith('56')) ? 'sz' : 'sh';
}

/** 生成新浪静态图片 URL */
function _imgUrl(etf, period) {
  return `https://image.sinajs.cn/newchart/${period}/n/${_exchange(etf)}${etf}.gif`;
}

/**
 * 计算浮层的视口坐标（fixed 定位用）。
 * 左边界对齐「20日均量」列（ths[4]），右边界对齐「份额」列（ths[14]）。
 * 顶部对齐 thead 底部（不遮挡表头）。
 */
function _calcPosition(wrap) {
  const ths = wrap.querySelectorAll('thead th');
  if (ths.length < 15) return null;
  const leftRect  = ths[4].getBoundingClientRect();
  const rightRect = ths[14].getBoundingClientRect();
  const thead     = wrap.querySelector('thead');
  const theadBottom = thead ? thead.getBoundingClientRect().bottom : leftRect.bottom;
  return { left: leftRect.left, width: rightRect.right - leftRect.left, top: theadBottom };
}

/** 设置浮层位置（fixed 坐标） */
function _positionOverlay(wrap) {
  if (!_overlay) return;
  const pos = _calcPosition(wrap);
  if (!pos) return;
  _overlay.style.left  = pos.left  + 'px';
  _overlay.style.width = pos.width + 'px';
  _overlay.style.top   = pos.top   + 'px';
}

/** 更新浮层图片（切换周期或切换标的） */
function _updateImg(etf, period) {
  if (!_overlay) return;
  const imgWrap = _overlay.querySelector('.kline-img-wrap');
  const img     = imgWrap?.querySelector('img');
  if (!img) return;
  img.src = _imgUrl(etf, period) + '?t=' + Date.now();
}

/** 设置图片 CSS 裁剪（onload 后调用，用实际容器宽度计算 px 值） */
function _applyImgCrop(img) {
  if (!img?.parentElement) return;
  const containerW = img.parentElement.offsetWidth;
  if (containerW <= 0) return;
  // 原图 545px 宽，内容 511px，scale = containerW / 511
  const scale = containerW / 511;
  img.style.width = (545 * scale) + 'px';
  img.style.top   = (-4  * scale) + 'px';
  img.style.left  = (-19 * scale) + 'px';
}

/** 创建浮层 DOM 并挂载到 document.body */
function _createOverlay(wrap, name, etf) {
  const el = document.createElement('div');
  el.className = 'kline-overlay';
  el.id = 'mdtfr-kline-overlay';
  // fixed 定位，挂到 body 完全不受任何祖先 overflow 影响
  el.style.position = 'fixed';
  el.style.zIndex   = '9999';

  el.innerHTML = `
    <div class="kline-overlay-header">
      <span class="kline-overlay-name">${name}</span>
      <span class="kline-overlay-code">${_exchange(etf).toUpperCase()}:${etf}</span>
      <button class="kline-period-btn active" data-period="daily">日K</button>
      <button class="kline-period-btn" data-period="weekly">周K</button>
      <button class="kline-period-btn" data-period="monthly">月K</button>
      <button class="kline-close-btn" title="关闭">×</button>
    </div>
    <div class="kline-img-wrap">
      <img src="" alt="${name} K线图" crossorigin="anonymous">
    </div>`;

  // 周期切换
  el.querySelectorAll('.kline-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activePeriod = btn.dataset.period;
      el.querySelectorAll('.kline-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _updateImg(_activeEtf, _activePeriod);
    });
  });

  // 关闭按钮
  el.querySelector('.kline-close-btn').addEventListener('click', () => closeOverlay());

  // 图片加载后应用裁剪
  const img = el.querySelector('img');
  img.addEventListener('load', () => _applyImgCrop(img));

  // resize 时重新定位和裁剪
  const _resizeHandler = () => {
    if (_wrap) _positionOverlay(_wrap);
    _applyImgCrop(img);
  };
  window.addEventListener('resize', _resizeHandler);
  el._resizeHandler = _resizeHandler;

  document.body.appendChild(el);
  return el;
}

/**
 * 打开或切换浮层
 * @param {HTMLElement} wrap - .mdtfr-table-wrap 元素
 * @param {string} codeC     - 标的 code_c
 * @param {string} etf       - 场内ETF代码（6位）
 * @param {string} name      - 基金名称
 */
export function openOverlay(wrap, codeC, etf, name) {
  if (_activeCodeC === codeC && _overlay) {
    closeOverlay();
    return;
  }

  // 关闭旧浮层
  if (_overlay) {
    if (_overlay._resizeHandler) window.removeEventListener('resize', _overlay._resizeHandler);
    _overlay.remove();
    _overlay = null;
  }

  _activeCodeC  = codeC;
  _activeEtf    = etf;
  _activeName   = name;
  _activePeriod = 'daily';
  _wrap         = wrap;

  _overlay = _createOverlay(wrap, name, etf);
  _positionOverlay(wrap);

  // 加载图片
  const img = _overlay.querySelector('img');
  img.src = _imgUrl(etf, _activePeriod) + '?t=' + Date.now();
}

/** 关闭浮层，同时取消 radio 选中 */
export function closeOverlay() {
  if (_overlay) {
    if (_overlay._resizeHandler) window.removeEventListener('resize', _overlay._resizeHandler);
    _overlay.remove();
    _overlay = null;
  }
  _activeCodeC = null;
  _activeEtf   = null;
  _activeName  = null;
  _wrap        = null;
  document.querySelectorAll('input.kline-radio').forEach(r => { r.checked = false; });
}

/** 当前选中的 code_c（供 table.js toggle 判断） */
export function getActiveCodeC() { return _activeCodeC; }
