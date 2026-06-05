# Capital Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ± button next to the available-amount input that opens a deposit/withdraw dialog, persists net capital and a capital log in amounts.json, and shows total investment + ROI in the section header.

**Architecture:** New `js/mdtfr/capital.js` owns all capital logic (read/write `__net_capital__` and `__capital_log__` via existing `_getRawKey`/`_setRawKey`/`saveAmounts`). Circular dependency between `available.js` and `capital.js` is broken via `bus.js` event `capital:refresh`. `available.js` emits the event; `capital.js` listens to it.

**Tech Stack:** Vanilla JS ES modules, existing bus.js event system, existing amounts.json persistence via `/api/cache/amounts` PUT.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `js/mdtfr/capital.js` | All capital logic: state, deposit/withdraw, dialog, display refresh |
| Modify | `js/mdtfr/amounts.js` | Persist `__net_capital__` and `__capital_log__` in `saveAmounts()` |
| Modify | `js/mdtfr/available.js` | Emit `capital:refresh` at end of `refreshTotalDisplay()` |
| Modify | `js/main.js` | Import and expose `openCapitalDialog`, `closeCapitalDialog` on `window` |
| Modify | `strategy_page.html` | Add `mdtfr-net-capital` span, `±` button, `capital-overlay` dialog HTML |

---

## Task 1: Persist `__net_capital__` and `__capital_log__` in saveAmounts

**Files:**
- Modify: `js/mdtfr/amounts.js`

- [ ] **Step 1: Add the two new keys to the saveAmounts payload block**

In `js/mdtfr/amounts.js`, find the `saveAmounts` function (lines ~49-62). The payload block currently ends with `__realized_pnl__`. Add two more lines in the same pattern:

```js
async function saveAmounts() {
  try {
    const payload = { ..._amt };
    if ('__available__'    in _rawData) payload['__available__']    = _rawData['__available__'];
    if ('__shares__'       in _rawData) payload['__shares__']       = _rawData['__shares__'];
    if ('__cost__'         in _rawData) payload['__cost__']         = _rawData['__cost__'];
    if ('__realized_pnl__' in _rawData) payload['__realized_pnl__'] = _rawData['__realized_pnl__'];
    if ('__net_capital__'  in _rawData) payload['__net_capital__']  = _rawData['__net_capital__'];
    if ('__capital_log__'  in _rawData) payload['__capital_log__']  = _rawData['__capital_log__'];
    await fetch('/api/cache/amounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {}
}
```

- [ ] **Step 2: Commit**

```bash
git add js/mdtfr/amounts.js
git commit -m "feat(capital): persist __net_capital__ and __capital_log__ in saveAmounts"
```

---

## Task 2: Create `js/mdtfr/capital.js`

**Files:**
- Create: `js/mdtfr/capital.js`

- [ ] **Step 1: Create the file with full implementation**

```js
// js/mdtfr/capital.js
// 资金存取管理：总投入追踪、存入/抽出、历史流水、UI 刷新
import { _getRawKey, _setRawKey, saveAmounts } from './amounts.js';
import {
  getAvailableAmt, setAvailableAmt, saveAvailable,
  getTotalAmt, refreshTotalDisplay,
} from './available.js';
import { on } from './bus.js';

// ── 数据读写 ───────────────────────────────────────────────────

export function getNetCapital() {
  return parseFloat(_getRawKey('__net_capital__') || 0) || 0;
}

function _setNetCapital(v) {
  _setRawKey('__net_capital__', parseFloat(v) || 0);
}

function _getCapitalLog() {
  const v = _getRawKey('__capital_log__');
  return Array.isArray(v) ? v : [];
}

function _appendLog(type, amt, note) {
  const log = _getCapitalLog();
  log.push({ ts: new Date().toISOString(), type, amt, note: note || '' });
  _setRawKey('__capital_log__', log);
}

// ── 存入 / 抽出 ────────────────────────────────────────────────

export async function deposit(amt, note) {
  if (!(amt > 0)) return;
  setAvailableAmt(getAvailableAmt() + amt);
  _setNetCapital(getNetCapital() + amt);
  _appendLog('deposit', amt, note);
  await saveAvailable();
  refreshTotalDisplay();
}

export async function withdraw(amt, note) {
  if (!(amt > 0)) return;
  if (amt > getAvailableAmt()) return;
  setAvailableAmt(getAvailableAmt() - amt);
  _setNetCapital(getNetCapital() - amt);
  _appendLog('withdraw', amt, note);
  await saveAvailable();
  refreshTotalDisplay();
}

// ── 总投入 + 收益率标签刷新 ────────────────────────────────────

export function refreshNetCapitalDisplay() {
  const el = document.getElementById('mdtfr-net-capital');
  if (!el) return;
  const netCapital = getNetCapital();
  if (netCapital <= 0) { el.textContent = ''; return; }

  const total = getTotalAmt();
  const roi   = (total - netCapital) / netCapital;
  const roiPct = (roi * 100).toFixed(2);
  const sign  = roi >= 0 ? '+' : '';
  const clr   = roi > 0 ? 'var(--red)' : roi < 0 ? 'var(--green)' : 'var(--text-dim)';

  el.innerHTML =
    `总投入：<span style="color:var(--text-dim);font-weight:700">¥${Math.round(netCapital).toLocaleString()}</span>` +
    ` <span style="color:${clr};font-weight:700">${sign}${roiPct}%</span>`;
}

// 监听 available.js 发出的刷新事件（避免循环 import）
on('capital:refresh', refreshNetCapitalDisplay);

// ── 弹窗 ──────────────────────────────────────────────────────

let _activeTab = 'deposit';

export function openCapitalDialog() {
  const overlay = document.getElementById('capital-overlay');
  if (!overlay) return;
  _activeTab = 'deposit';
  _renderDialog();
  overlay.classList.add('open');
}

export function closeCapitalDialog() {
  document.getElementById('capital-overlay')?.classList.remove('open');
}

function _renderDialog() {
  const body = document.getElementById('capital-body');
  if (!body) return;

  const available = getAvailableAmt();
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const log = _getCapitalLog().slice().reverse().slice(0, 20);

  const tabStyle = (tab) =>
    `padding:6px 20px;border-radius:6px;border:none;font-size:13px;font-weight:600;cursor:pointer;` +
    (_activeTab === tab
      ? `background:rgba(99,102,241,.25);color:var(--purple);`
      : `background:transparent;color:var(--text-dim);`);

  const logRows = log.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:16px 0">暂无记录</td></tr>`
    : log.map(r => {
        const isDeposit = r.type === 'deposit';
        const dateStr = r.ts ? new Date(r.ts).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
        return `<tr>
          <td style="padding:6px 8px;font-size:12px;color:var(--text-dim)">${dateStr}</td>
          <td style="padding:6px 8px;font-size:12px">${isDeposit
            ? '<span style="color:var(--green)">🟢 存入</span>'
            : '<span style="color:var(--red)">🔴 抽出</span>'}</td>
          <td style="padding:6px 8px;font-size:12px;font-weight:700;color:${isDeposit ? 'var(--green)' : 'var(--red)'}">
            ${isDeposit ? '+' : '-'}${fmtY(r.amt)}</td>
          <td style="padding:6px 8px;font-size:12px;color:var(--text-dim)">${r.note || '–'}</td>
        </tr>`;
      }).join('');

  body.innerHTML = `
    <div style="padding:20px 24px 24px">
      <!-- Tabs -->
      <div style="display:flex;gap:4px;margin-bottom:20px;background:rgba(255,255,255,.04);border-radius:8px;padding:4px">
        <button style="${tabStyle('deposit')}"
          onclick="window._capitalSwitchTab('deposit')">存入</button>
        <button style="${tabStyle('withdraw')}"
          onclick="window._capitalSwitchTab('withdraw')">抽出</button>
      </div>

      <!-- 可用金额提示 -->
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">
        当前可用金额：<span style="color:var(--yellow);font-weight:700">${fmtY(available)}</span>
      </div>

      <!-- 金额输入 -->
      <div style="margin-bottom:12px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">金额（元）</div>
        <input id="capital-amt-input" type="number" min="1" step="100"
          placeholder="输入金额"
          oninput="window._capitalOnInput()"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:14px" />
        <div id="capital-amt-error" style="font-size:12px;color:var(--red);margin-top:4px;min-height:16px"></div>
      </div>

      <!-- 备注 -->
      <div style="margin-bottom:20px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">备注（选填）</div>
        <input id="capital-note-input" type="text" maxlength="100"
          placeholder="如：月定投 / 临时调用"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:13px" />
      </div>

      <!-- 按钮 -->
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-bottom:24px">
        <button onclick="closeCapitalDialog()"
          style="padding:8px 18px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;color:var(--text-dim);font-size:13px;cursor:pointer">
          取消
        </button>
        <button id="capital-confirm-btn" disabled
          onclick="window._capitalConfirm()"
          style="padding:8px 20px;border-radius:6px;border:none;background:rgba(99,102,241,.5);color:#fff;font-size:13px;font-weight:700;cursor:not-allowed;opacity:0.5">
          ${_activeTab === 'deposit' ? '✅ 确认存入' : '✅ 确认抽出'}
        </button>
      </div>

      <!-- 历史流水 -->
      <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:16px">
        <div style="font-size:12px;font-weight:700;color:var(--text-dim);margin-bottom:8px">历史记录（最近 20 条）</div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="font-size:11px;color:var(--text-dim)">
              <th style="text-align:left;padding:4px 8px;font-weight:400">时间</th>
              <th style="text-align:left;padding:4px 8px;font-weight:400">类型</th>
              <th style="text-align:left;padding:4px 8px;font-weight:400">金额</th>
              <th style="text-align:left;padding:4px 8px;font-weight:400">备注</th>
            </tr>
          </thead>
          <tbody>${logRows}</tbody>
        </table>
      </div>
    </div>`;
}

window._capitalSwitchTab = function(tab) {
  _activeTab = tab;
  _renderDialog();
};

window._capitalOnInput = function() {
  const input = document.getElementById('capital-amt-input');
  const errEl = document.getElementById('capital-amt-error');
  const btn   = document.getElementById('capital-confirm-btn');
  const amt   = parseFloat(input?.value || '0') || 0;
  const available = getAvailableAmt();

  let error = '';
  if (amt <= 0) {
    error = '';
  } else if (_activeTab === 'withdraw' && amt > available) {
    error = `超过可用金额 ¥${Math.round(available).toLocaleString()}`;
  }

  if (errEl) errEl.textContent = error;
  const valid = amt > 0 && !error;
  if (btn) {
    btn.disabled      = !valid;
    btn.style.opacity = valid ? '1' : '0.5';
    btn.style.cursor  = valid ? 'pointer' : 'not-allowed';
    btn.style.background = valid ? 'rgba(99,102,241,.9)' : 'rgba(99,102,241,.5)';
  }
};

window._capitalConfirm = async function() {
  const input = document.getElementById('capital-amt-input');
  const note  = document.getElementById('capital-note-input')?.value?.trim() || '';
  const amt   = parseFloat(input?.value || '0') || 0;
  if (!(amt > 0)) return;

  if (_activeTab === 'deposit') {
    await deposit(amt, note);
  } else {
    if (amt > getAvailableAmt()) return;
    await withdraw(amt, note);
  }

  closeCapitalDialog();

  const { showToast } = await import('./journal.js');
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const msg = _activeTab === 'deposit'
    ? `✅ 已存入 ${fmtY(amt)}`
    : `✅ 已抽出 ${fmtY(amt)}`;
  showToast(msg, 'var(--purple)');
};
```

- [ ] **Step 2: Commit**

```bash
git add js/mdtfr/capital.js
git commit -m "feat(capital): add capital.js module with deposit/withdraw/dialog/display"
```

---

## Task 3: Wire `capital:refresh` event in `available.js`

**Files:**
- Modify: `js/mdtfr/available.js`

- [ ] **Step 1: Add `emit('capital:refresh')` at end of `refreshTotalDisplay`**

Find `refreshTotalDisplay` (~line 86). It currently ends after updating the input value. Add one line at the very end:

```js
function refreshTotalDisplay() {
  const total = getTotalAmt();
  const totalEl = document.getElementById('mdtfr-total-amt');
  if (totalEl) totalEl.textContent = total > 0 ? `总金额：¥${total.toLocaleString()}` : '总金额：¥0';
  refreshPnlDisplay();
  const inp = document.getElementById('mdtfr-available-input');
  if (inp && document.activeElement !== inp) {
    inp.value = _available > 0 ? _available : '';
  }
  emit('capital:refresh');
}
```

- [ ] **Step 2: Commit**

```bash
git add js/mdtfr/available.js
git commit -m "feat(capital): emit capital:refresh from refreshTotalDisplay"
```

---

## Task 4: Update `main.js` — import and expose capital functions

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Add import near the other mdtfr imports (after the `openManualSellDialog` import line)**

```js
import { openCapitalDialog, closeCapitalDialog } from './mdtfr/capital.js';
```

- [ ] **Step 2: Add to the `Object.assign(window, {...})` block (after `openManualSellDialog, closeManualSellDialog`)**

```js
  openCapitalDialog, closeCapitalDialog,
```

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat(capital): expose openCapitalDialog/closeCapitalDialog on window"
```

---

## Task 5: Update `strategy_page.html` — span, button, overlay

**Files:**
- Modify: `strategy_page.html`

- [ ] **Step 1: Add `mdtfr-net-capital` span after `mdtfr-total-amt`**

Find this line (~163):
```html
<span id="mdtfr-total-amt" style="font-size:13px;font-weight:700;color:var(--yellow);margin-left:12px">总金额：¥0</span>
```

Insert immediately after it (before `mdtfr-total-pnl`):
```html
<span id="mdtfr-net-capital" style="font-size:13px;margin-left:10px"></span>
```

- [ ] **Step 2: Add `±` button inside `available-input-wrap`**

Find this block (~165-169):
```html
<span class="available-input-wrap">
  <label class="available-label">可用金额(元)：</label>
  <input id="mdtfr-available-input" class="available-input" type="number" min="0" step="1000"
    placeholder="0" oninput="onAvailableChange(this.value)">
</span>
```

Replace with:
```html
<span class="available-input-wrap">
  <label class="available-label">可用金额(元)：</label>
  <input id="mdtfr-available-input" class="available-input" type="number" min="0" step="1000"
    placeholder="0" oninput="onAvailableChange(this.value)">
  <button class="btn btn-ghost btn-sm" onclick="openCapitalDialog()"
    title="资金存取" style="margin-left:4px;font-size:14px;font-weight:700;padding:4px 8px">±</button>
</span>
```

- [ ] **Step 3: Add `capital-overlay` dialog HTML before the closing `</main>` or before the `manual-sell-overlay` block**

Find the `manual-sell-overlay` div and add the following block right before it:

```html
<!-- 资金存取弹窗 -->
<div id="capital-overlay" class="overlay">
  <div class="overlay-panel" style="max-width:480px;width:90%">
    <div class="overlay-header">
      <span class="overlay-title">💰 资金存取</span>
      <button class="overlay-close" onclick="closeCapitalDialog()">✕</button>
    </div>
    <div id="capital-body"></div>
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add strategy_page.html
git commit -m "feat(capital): add net-capital span, ± button, and capital dialog overlay to HTML"
```

---

## Task 6: Initialize net capital display on page load

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Add import of `refreshNetCapitalDisplay`**

Update the capital import line added in Task 4 to include `refreshNetCapitalDisplay`:

```js
import { openCapitalDialog, closeCapitalDialog, refreshNetCapitalDisplay } from './mdtfr/capital.js';
```

- [ ] **Step 2: Call `refreshNetCapitalDisplay()` in the init IIFE after `refreshTotalDisplay()`**

Find the init block in `main.js` (~line 96):
```js
  refreshTotalDisplay();
  refreshAllPosPct();
```

Add `refreshNetCapitalDisplay()` right after `refreshTotalDisplay()`:
```js
  refreshTotalDisplay();
  refreshNetCapitalDisplay();
  refreshAllPosPct();
```

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat(capital): initialize net-capital display on page load"
```

---

## Task 7: Seed initial `__net_capital__` for existing users

**Files:**
- No code change — one-time API call to seed the value

- [ ] **Step 1: Set net capital to match current total amount via browser console or curl**

If the user already has funds (e.g. ¥10,000 initial investment), run this once in the browser console to seed the value, replacing `10000` with the actual original investment:

```js
// Run once in browser console on http://localhost:9001/strategy#mdtfr
// Replace 10000 with the actual initial capital
const current = await fetch('/api/cache/amounts').then(r => r.json());
await fetch('/api/cache/amounts', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...current, __net_capital__: 10000, __capital_log__: [
    { ts: new Date().toISOString(), type: 'deposit', amt: 10000, note: '初始投入' }
  ]})
});
```

Or via curl:
```bash
curl -X PUT http://localhost:9001/api/cache/amounts \
  -H "Content-Type: application/json" \
  -d "$(cat ~/.investment/mdtfr_amounts.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
d['__net_capital__']=10000
d['__capital_log__']=[{'ts':'2026-05-07T00:00:00.000Z','type':'deposit','amt':10000,'note':'初始投入'}]
print(json.dumps(d))
")"
```

- [ ] **Step 2: Reload the page and verify `总投入：¥10,000 · +7.63%` appears next to 总金额**

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|------------|
| `__net_capital__` field persisted in amounts.json | Task 1 |
| `__capital_log__` field persisted in amounts.json | Task 1 |
| deposit() updates available + net_capital + log | Task 2 |
| withdraw() validates against available, updates same | Task 2 |
| ± button next to available input | Task 5 |
| Deposit/withdraw dialog with two tabs | Task 2 |
| Real-time validation for withdraw > available | Task 2 (`_capitalOnInput`) |
| History log table, max 20 rows, newest first | Task 2 |
| `mdtfr-net-capital` span showing total investment + ROI % | Task 2 + Task 5 |
| ROI = (total − net_capital) / net_capital | Task 2 (`refreshNetCapitalDisplay`) |
| No backend changes | ✓ all uses existing `/api/cache/amounts` PUT |
| Circular dep avoided via bus event | Task 2 (listens `capital:refresh`) + Task 3 (emits it) |
| Initialized on page load | Task 6 |

**Placeholder scan:** None found.

**Type consistency:** `deposit(amt, note)` and `withdraw(amt, note)` used consistently in Task 2. `refreshNetCapitalDisplay` imported and called consistently in Tasks 2, 5, 6. `openCapitalDialog`/`closeCapitalDialog` consistent across Tasks 2, 4, 5.
