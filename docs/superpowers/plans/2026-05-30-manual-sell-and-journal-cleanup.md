# 手动卖出 + 历史复盘精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MDTFR 策略页面持仓卡片上添加手动卖出弹窗，卖出后写入历史复盘，同时清理历史复盘只保留真实交易记录。

**Architecture:** 新增独立模块 `manual-sell.js` 负责弹窗渲染与执行，复用 `trade-confirm.js` 相同的金额/份额更新路径；`journal.js` 在 `saveJournalRecord` 入口加守卫，无 `trade_records` 时直接返回；`advice.js` 在每个持仓卡片标题行注入「手动卖出」按钮；`main.js` 挂载三个新全局函数；`strategy_page.html` 追加弹窗 DOM。

**Tech Stack:** 原生 JS (ES Modules)、Vitest (单元测试)、现有后端 `/api/cache/*` 接口

---

## 文件结构

| 文件 | 变更 | 职责 |
|------|------|------|
| `js/mdtfr/manual-sell.js` | **新增** | 弹窗状态、渲染、执行、关闭 |
| `js/mdtfr/journal.js` | **修改** | `saveJournalRecord` 加守卫 |
| `js/mdtfr/advice.js` | **修改** | 持仓卡片标题行注入按钮 |
| `js/main.js` | **修改** | 导入并挂载 3 个全局函数 |
| `strategy_page.html` | **修改** | 追加 `#manual-sell-overlay` DOM |
| `tests/js/mdtfr/manual-sell.test.js` | **新增** | 纯逻辑单元测试 |

---

## Task 1：新增 `manual-sell.js` — 核心逻辑与弹窗

**Files:**
- Create: `js/mdtfr/manual-sell.js`

- [ ] **Step 1：新建文件，写骨架与 import**

```js
// js/mdtfr/manual-sell.js
import { getDynAmt, setAmt, saveAmounts, getShares, getCost, setShares, setCost, getLastMdtfrItems } from './amounts.js';
import { getAvailableAmt, setAvailableAmt, saveAvailable, getTotalAmt, refreshTotalDisplay } from './available.js';
import { refreshAllPosPct } from './amounts.js';
import { setPendingConfirmAnnotation } from './journal.js';
import { getMdtfrPoolDef } from './config.js';
import { call, emit } from './bus.js';

// 当前打开弹窗的标的 code_c
let _activeCode = null;
```

- [ ] **Step 2：实现 `openManualSellDialog(code_c)`**

```js
export function openManualSellDialog(code_c) {
  _activeCode = code_c;
  const items = getLastMdtfrItems() || [];
  const item  = items.find(x => x.code_c === code_c);
  const name  = item?.name || getMdtfrPoolDef().find(d => d.code_c === code_c)?.name || code_c;
  const curAmt = getDynAmt(code_c);

  const overlay = document.getElementById('manual-sell-overlay');
  if (!overlay) return;

  document.getElementById('manual-sell-title').textContent = `手动卖出 · ${name}`;
  _renderBody(code_c, name, curAmt);
  overlay.classList.add('open');
}
```

- [ ] **Step 3：实现 `_renderBody` — 弹窗内容渲染**

```js
function _renderBody(code_c, name, curAmt) {
  const body = document.getElementById('manual-sell-body');
  if (!body) return;

  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const presets = [
    { label: '25%', ratio: 0.25 },
    { label: '50%', ratio: 0.50 },
    { label: '75%', ratio: 0.75 },
    { label: '全仓', ratio: 1.00 },
  ];

  body.innerHTML = `
    <div style="padding:20px 24px 24px">
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">
        当前持仓：<span style="color:var(--yellow);font-weight:700">${fmtY(curAmt)}</span>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">卖出比例</div>
        <div style="display:flex;gap:8px">
          ${presets.map(p => `
            <button id="manual-preset-${p.label}"
              onclick="window._manualSellSelectPreset(${p.ratio}, ${curAmt})"
              style="flex:1;padding:8px 4px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:var(--text);transition:all .15s">
              ${p.label}<br>
              <span style="font-size:11px;font-weight:400;color:var(--text-dim)">${fmtY(Math.round(curAmt * p.ratio))}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">自定义金额（元）</div>
        <input id="manual-sell-amt-input" type="number" min="1" step="100"
          placeholder="输入卖出金额"
          oninput="window._manualSellOnInput(${curAmt})"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:14px" />
        <div id="manual-sell-preview" style="font-size:12px;color:var(--text-dim);margin-top:6px;min-height:18px"></div>
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">备注（选填）</div>
        <input id="manual-sell-note" type="text" maxlength="100"
          placeholder="如：止盈 / 调仓 / 资金需求"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:13px" />
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="closeManualSellDialog()"
          style="padding:8px 18px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;color:var(--text-dim);font-size:13px;cursor:pointer">
          取消
        </button>
        <button id="manual-sell-confirm-btn"
          onclick="window._manualSellConfirm('${code_c}', '${name}', ${curAmt})"
          disabled
          style="padding:8px 20px;border-radius:6px;border:none;background:rgba(239,68,68,.7);color:#fff;font-size:13px;font-weight:700;cursor:not-allowed;opacity:0.5">
          确认卖出
        </button>
      </div>
    </div>`;

  // 默认选中全仓
  window._manualSellSelectPreset(1.0, curAmt);
}
```

- [ ] **Step 4：实现比例按钮交互与金额输入联动**

```js
window._manualSellSelectPreset = function(ratio, curAmt) {
  const amt = Math.round(curAmt * ratio);
  const input = document.getElementById('manual-sell-amt-input');
  if (input) { input.value = amt; }
  _updatePresetHighlight(ratio);
  _updatePreview(amt, curAmt);
  _updateConfirmBtn(amt, curAmt);
};

window._manualSellOnInput = function(curAmt) {
  const input = document.getElementById('manual-sell-amt-input');
  const amt = parseInt(input?.value || '0', 10) || 0;
  // 匹配预设比例（误差 ±1 元）
  const presets = [0.25, 0.50, 0.75, 1.00];
  const matchedRatio = presets.find(r => Math.abs(Math.round(curAmt * r) - amt) <= 1) ?? null;
  _updatePresetHighlight(matchedRatio);
  _updatePreview(amt, curAmt);
  _updateConfirmBtn(amt, curAmt);
};

function _updatePresetHighlight(ratio) {
  const labels = ['25%', '50%', '75%', '全仓'];
  const ratios = [0.25, 0.50, 0.75, 1.00];
  labels.forEach((label, i) => {
    const btn = document.getElementById(`manual-preset-${label}`);
    if (!btn) return;
    const active = ratios[i] === ratio;
    btn.style.background    = active ? 'rgba(239,68,68,.25)' : 'rgba(255,255,255,.05)';
    btn.style.border        = active ? '1px solid rgba(239,68,68,.6)' : '1px solid rgba(255,255,255,.15)';
    btn.style.color         = active ? 'var(--red)' : 'var(--text)';
  });
}

function _updatePreview(amt, curAmt) {
  const el = document.getElementById('manual-sell-preview');
  if (!el) return;
  if (amt <= 0) { el.textContent = ''; return; }
  const remain = Math.max(0, curAmt - amt);
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  el.innerHTML = `卖出 <span style="color:var(--red);font-weight:600">${fmtY(amt)}</span> → 货币基金　剩余持仓 <span style="color:var(--yellow);font-weight:600">${fmtY(remain)}</span>`;
}

function _updateConfirmBtn(amt, curAmt) {
  const btn = document.getElementById('manual-sell-confirm-btn');
  if (!btn) return;
  const valid = amt > 0 && amt <= curAmt;
  btn.disabled = !valid;
  btn.style.opacity = valid ? '1' : '0.5';
  btn.style.cursor  = valid ? 'pointer' : 'not-allowed';
  btn.style.background = valid ? 'rgba(239,68,68,.9)' : 'rgba(239,68,68,.7)';
}
```

- [ ] **Step 5：实现 `_manualSellConfirm` 执行函数**

```js
window._manualSellConfirm = async function(code_c, name, curAmt) {
  const input = document.getElementById('manual-sell-amt-input');
  const noteInput = document.getElementById('manual-sell-note');
  const amt  = parseInt(input?.value || '0', 10) || 0;
  const note = noteInput?.value?.trim() || '';

  if (amt <= 0 || amt > curAmt) return;

  // 金额 / 份额 / 成本更新（与 trade-confirm.js sell 分支一致）
  const prevAmt    = getDynAmt(code_c);
  const prevShares = getShares(code_c);
  const ratio      = prevAmt > 0 ? Math.min(amt / prevAmt, 1) : 0;

  setAmt(code_c, Math.max(0, prevAmt - amt));
  setAvailableAmt(getAvailableAmt() + amt);
  setShares(code_c, Math.max(0, prevShares - prevShares * ratio));
  setCost(code_c,   Math.max(0, getCost(code_c) * (1 - ratio)));

  await saveAmounts();
  await saveAvailable();
  refreshAllPosPct();
  refreshTotalDisplay();

  // 写入 journal
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  setPendingConfirmAnnotation({
    confirmed_at: new Date().toISOString(),
    trade_records: [{
      type: 'sell', name, code_c, amt,
      note: note || `手动卖出 ${fmtY(amt)}`,
      manual: true,
    }],
  });
  call('journalSaver', false);

  // 刷新建议面板
  const lastItems = call('getLastItems');
  if (lastItems) emit('advice:render', lastItems);

  closeManualSellDialog();

  // Toast
  const { showToast } = await import('./journal.js');
  showToast(`✅ 已手动卖出 ${name} ${fmtY(amt)}`, 'var(--red)');
};
```

- [ ] **Step 6：实现 `closeManualSellDialog`**

```js
export function closeManualSellDialog() {
  document.getElementById('manual-sell-overlay')?.classList.remove('open');
  _activeCode = null;
}
```

- [ ] **Step 7：手动验证模块可导入（暂无自动测试，先确认无语法错误）**

在浏览器 Console 中执行：
```js
import('/js/mdtfr/manual-sell.js').then(m => console.log('ok', Object.keys(m)))
```
预期输出：`ok ['openManualSellDialog', 'closeManualSellDialog']`

---

## Task 2：写单元测试 `manual-sell.test.js`（纯逻辑部分）

**Files:**
- Create: `tests/js/mdtfr/manual-sell.test.js`

测试目标：`_manualSellConfirm` 内部的金额/份额计算逻辑（提取为纯函数测试）。

- [ ] **Step 1：新建测试文件**

```js
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
```

- [ ] **Step 2：运行测试，确认通过**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
npx vitest run tests/js/mdtfr/manual-sell.test.js
```

预期输出：
```
 PASS  tests/js/mdtfr/manual-sell.test.js
  手动卖出金额/份额计算
    ✓ 全仓卖出后持仓清零
    ✓ 50% 卖出后份额和成本各减半
    ✓ 卖出金额超过持仓时 ratio 上限为 1
    ✓ 持仓为 0 时 ratio 为 0，不产生负值
```

- [ ] **Step 3：提交**

```bash
git add js/mdtfr/manual-sell.js tests/js/mdtfr/manual-sell.test.js
git commit -m "feat(mdtfr): add manual-sell module with unit tests"
```

---

## Task 3：`journal.js` — 历史复盘只保留真实操作记录

**Files:**
- Modify: `js/mdtfr/journal.js:14-52`

- [ ] **Step 1：在 `saveJournalRecord` 入口加守卫**

找到 `journal.js` 第 14 行的 `saveJournalRecord` 函数，在 `if (!_lastMdtfrItems || !_lastAdviceData) return;` 之后插入守卫：

```js
async function saveJournalRecord(silent = false) {
  const _lastMdtfrItems = getLastMdtfrItems();
  const _lastAdviceData = getLastAdviceData();
  if (!_lastMdtfrItems || !_lastAdviceData) return;

  // 只在有真实交易记录时写入
  const annotation = _pendingAnnotation;
  if (!annotation || !Array.isArray(annotation.trade_records) || annotation.trade_records.length === 0) return;

  // ... 以下原有逻辑不变
```

- [ ] **Step 2：验证修改后现有测试仍通过**

```bash
npx vitest run tests/js/mdtfr/
```

预期输出：所有测试 PASS，无 FAIL。

- [ ] **Step 3：提交**

```bash
git add js/mdtfr/journal.js
git commit -m "fix(mdtfr): journal only saves records with real trade operations"
```

---

## Task 4：`advice.js` — 持仓卡片注入「手动卖出」按钮

**Files:**
- Modify: `js/mdtfr/advice.js`

在 `advice.js` 的持仓卡片标题行部分（约 456–462 行）`<div style="font-size:14px;font-weight:700;...">` 内，在右侧金额 span 之后，追加「手动卖出」按钮。

- [ ] **Step 1：定位标题行 HTML 并注入按钮**

找到 advice.js 中持仓卡片标题行渲染代码（包含 `¥${x._amt.toLocaleString()} · ${x._posVal.toFixed(1)}%` 的那行），将标题行 div 改为：

```js
      return `<div style="margin:8px 0;padding:10px 14px;border-radius:8px;background:${bg};border:1px solid ${border}">
        <div style="font-size:14px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px">
          <span style="color:${nameClr}">${nameIcon}</span>
          <span style="color:var(--text)">${escHtml(x.name)}</span>
          <span style="color:var(--text-dim);font-size:12px;font-weight:400">${x.code_c}</span>
          ${ma60Below ? `<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,.2);color:var(--red);font-weight:700">🚨 跌破MA60</span>` : ma20IsTriggered ? `<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,.15);color:var(--red);font-weight:700">🔔 连续${watchDays}日跌破MA20</span>` : ma20Watching ? `<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(245,158,11,.15);color:var(--yellow);font-weight:700">⏱ 观察第${watchDays}日</span>` : ''}
          <span style="font-size:12px;color:var(--yellow);font-weight:600;margin-left:auto">¥${x._amt.toLocaleString()} · ${x._posVal.toFixed(1)}%</span>
          <button onclick="openManualSellDialog('${x.code_c}')"
            style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:var(--text-dim);cursor:pointer;white-space:nowrap;flex-shrink:0"
            title="不依赖卖出信号，手动主动卖出">
            手动卖出
          </button>
        </div>
```

- [ ] **Step 2：提交**

```bash
git add js/mdtfr/advice.js
git commit -m "feat(mdtfr): add manual sell button to holding cards in sell analysis"
```

---

## Task 5：`main.js` — 挂载全局函数

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1：添加 import**

在 `main.js` 现有 import 区域（约第 39 行 `confirmTradeRow` 之后）新增：

```js
import { openManualSellDialog, closeManualSellDialog } from './mdtfr/manual-sell.js';
```

- [ ] **Step 2：挂载到 window**

在 `Object.assign(window, {...})` 的「交易确认/撤销」区域之后追加：

```js
  // 手动卖出弹窗
  openManualSellDialog, closeManualSellDialog,
```

- [ ] **Step 3：提交**

```bash
git add js/main.js
git commit -m "feat(mdtfr): wire openManualSellDialog and closeManualSellDialog to window"
```

---

## Task 6：`strategy_page.html` — 追加弹窗 DOM

**Files:**
- Modify: `strategy_page.html`

- [ ] **Step 1：在 `#aw-pnl-overlay` 结束标签后、Guide Drawer 之前插入新弹窗 DOM**

找到 `strategy_page.html` 第 289 行（`</div>` 关闭 `#aw-pnl-overlay` 的行），在其后插入：

```html

<!-- 手动卖出弹窗 -->
<div class="journal-overlay" id="manual-sell-overlay" onclick="if(event.target===this)closeManualSellDialog()">
  <div class="journal-modal" style="max-width:480px">
    <div class="journal-modal-head">
      <span id="manual-sell-title" style="font-size:18px;font-weight:700;flex:1">手动卖出</span>
      <button onclick="closeManualSellDialog()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:5px 12px;border-radius:6px;font-size:13px;cursor:pointer">✕ 关闭</button>
    </div>
    <div id="manual-sell-body"></div>
  </div>
</div>
```

- [ ] **Step 2：更新 `main.js` 的版本号 query string（避免浏览器缓存）**

找到最后一行：
```html
<script type="module" src="js/main.js?v=e4013a9"></script>
```
改为（取当前 git short hash）：
```bash
git rev-parse --short HEAD
```
将输出的 hash 替换 `v=` 后的值。

- [ ] **Step 3：提交**

```bash
git add strategy_page.html
git commit -m "feat(mdtfr): add manual-sell-overlay DOM to strategy page"
```

---

## Task 7：端到端验证

- [ ] **Step 1：启动开发服务器**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
# 查看启动命令
cat package.json | grep -A5 '"scripts"'
```

按项目实际启动命令启动（通常为 `npm run dev` 或 `python server.py`）。

- [ ] **Step 2：在浏览器打开 `http://localhost:9001/strategy#mdtfr`，加载数据后检查以下项目**

| 检查项 | 预期 |
|--------|------|
| 卖出条件分析中，每个持仓卡片标题行右侧出现「手动卖出」按钮 | ✓ |
| 点击「手动卖出」，弹窗打开，显示标的名称和当前持仓金额 | ✓ |
| 默认选中「全仓」，金额输入框显示全部持仓金额 | ✓ |
| 点击「25%」「50%」「75%」，输入框金额和预览动态更新 | ✓ |
| 手动输入金额，匹配预设时对应按钮高亮，不匹配时全部取消高亮 | ✓ |
| 预览行显示「卖出 ¥X → 货币基金　剩余持仓 ¥Y」 | ✓ |
| 输入超过持仓金额时，「确认卖出」按钮禁用 | ✓ |
| 点击「确认卖出」：弹窗关闭、Toast 提示、持仓金额归零/减少、可用金额增加、仓位百分比更新 | ✓ |
| 打开「历史复盘」，只看到有交易记录的条目（无建议刷新噪声记录） | ✓ |
| 手动卖出的记录在历史复盘中显示，`note` 含「手动卖出」字样 | ✓ |

- [ ] **Step 3：运行全部单元测试确认无回归**

```bash
npx vitest run tests/js/mdtfr/
```

预期：所有测试 PASS。

- [ ] **Step 4：最终提交（如有遗漏文件）**

```bash
git status
# 确认无未追踪文件后
git log --oneline -6
```

---

## 注意事项

- `_manualSellConfirm` 挂载在 `window` 上（通过 `window._manualSellConfirm = ...`），因为它在 innerHTML 中被 onclick 调用，不走 `main.js` 的 `Object.assign(window,...)` 路径。
- `call('journalSaver', false)` 传 `false` 表示非静默——手动卖出时应显示保存成功的 toast（与自动刷新时的 `true` 区分）。但由于 `journal.js` 内部 toast 会显示复盘相关文案，可能与手动卖出的 toast 重叠；若觉得重复，可改回 `true`（静默），手动卖出 toast 已足够。
- 历史复盘守卫只影响"写入"行为，`recoverFromJournal`（持仓恢复）读取 journal 记录不受影响。
