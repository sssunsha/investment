// js/mdtfr/kline-overlay.js
// K线图浮层：负责浮层 DOM 的创建、定位、图片 URL 生成、周期切换、开/关。

let _overlay = null;       // 当前浮层 DOM 元素
let _activePeriod = 'daily'; // 当前周期
let _activeCodeC = null;   // 当前选中的 code_c
let _activeEtf = null;     // 当前 ETF 代码
let _activeName = null;    // 当前基金名称

/** ETF 代码 → 新浪交易所前缀 */
function _exchange(etf) {
  return (etf.startsWith('1') || etf.startsWith('56')) ? 'sz' : 'sh';
}

/** 生成新浪静态图片 URL */
function _imgUrl(etf, period) {
  return `https://image.sinajs.cn/newchart/${period}/n/${_exchange(etf)}${etf}.gif`;
}

/** 计算浮层的 left/width：对齐「20日均量」列左边缘到「份额」列右边缘 */
function _calcPosition(wrap) {
  // ths[4] = 20日均量（左边界）；ths[14] = 份额（右边界）
  // index 0 = radio（Task 3 新增），之后所有列各 +1
  const ths = wrap.querySelectorAll('thead th');
  if (ths.length < 15) return null;
  const table     = wrap.querySelector('table');
  const tableRect = table.getBoundingClientRect();
  const leftRect  = ths[4].getBoundingClientRect();
  const rightRect = ths[14].getBoundingClientRect();
  // thead 高度，浮层从 thead 底部开始，不遮挡表头
  const thead     = wrap.querySelector('thead');
  const theadH    = thead ? thead.getBoundingClientRect().height : 40;
  return {
    left:  leftRect.left  - tableRect.left,
    width: rightRect.right - leftRect.left,
    top:   theadH,
  };
}

/** 更新浮层图片（切换周期或切换标的） */
function _updateImg(etf, period) {
  if (!_overlay) return;
  const wrap = _overlay.querySelector('.kline-img-wrap');
  const img  = wrap?.querySelector('img');
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

/** 创建浮层 DOM 并挂载到 .mdtfr-table-wrap */
function _createOverlay(wrap, name, etf, codeC) {
  const el = document.createElement('div');
  el.className = 'kline-overlay';
  el.id = 'mdtfr-kline-overlay';

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

  // 窗口 resize 时重新计算位置和裁剪
  const _resizeHandler = () => {
    _positionOverlay(wrap);
    _applyImgCrop(img);
  };
  window.addEventListener('resize', _resizeHandler);
  el._resizeHandler = _resizeHandler;

  wrap.appendChild(el);
  // 把浮层挂到 table 元素上（table 设 position:relative），避免被 overflow-x:auto 裁剪
  const table = wrap.querySelector('table');
  if (table) {
    table.style.position = 'relative';
    table.appendChild(el);
  } else {
    wrap.appendChild(el);
  }
  return el;
}

/** 设置浮层位置 */
function _positionOverlay(wrap) {
  if (!_overlay) return;
  const pos = _calcPosition(wrap);
  if (!pos) return;
  _overlay.style.left  = pos.left + 'px';
  _overlay.style.width = pos.width + 'px';
  _overlay.style.top   = pos.top + 'px';
}
}

/**
 * 打开或切换浮层
 * @param {HTMLElement} wrap   - .mdtfr-table-wrap 元素
 * @param {string} codeC       - 标的 code_c
 * @param {string} etf         - 场内ETF代码（6位）
 * @param {string} name        - 基金名称
 */
export function openOverlay(wrap, codeC, etf, name) {
  if (_activeCodeC === codeC && _overlay) {
    // 同一标的再次点击 → 关闭
    closeOverlay();
    return;
  }

  // 关闭旧浮层（不同标的）
  if (_overlay) {
    _overlay.remove();
    if (_overlay._resizeHandler) window.removeEventListener('resize', _overlay._resizeHandler);
    _overlay = null;
  }

  _activeCodeC  = codeC;
  _activeEtf    = etf;
  _activeName   = name;
  _activePeriod = 'daily';

  _overlay = _createOverlay(wrap, name, etf, codeC);
  _positionOverlay(wrap);

  // 加载图片（加时间戳防缓存）
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
  // 取消所有 radio 选中
  document.querySelectorAll('input.kline-radio').forEach(r => { r.checked = false; });
}

/** 当前选中的 code_c（供 table.js toggle 判断） */
export function getActiveCodeC() { return _activeCodeC; }
