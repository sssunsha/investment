# AW Fund Selector Drawer & Stale Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline ⇄ type-badge switching with a "🔀 标的调整" right-side drawer; monitor table shows only the active fund per asset (7 rows instead of 14); stale inactive-fund balances shown as a red ⚠ chip in section-head with a per-item redemption dialog.

**Architecture:** New `stale-positions.js` module isolates stale detection, chip refresh, dialog open/close, and redeem logic. `monitor.js` rewritten to return 7 active-only defs from `_getAwPoolDef`, static-only `_labelBadge`, and new drawer build/open/close/refresh functions. `calc.js` reads `getActiveAsset(a).code` only (active fund amount, not primary+alt sum). `inputs.js` `toggleAwAlt` gains a pre-switch warning toast and calls `refreshFundDrawerRow` instead of `refreshAwTypeBadges`. HTML gets stale chip, 🔀 button, fund drawer overlay, and stale dialog overlay. CSS gets drawer slide-in panel styles.

**Tech Stack:** Vanilla ES Modules, no bundler, no JS test framework (browser verification via `http://localhost:9001/strategy#aw`), Python pytest (backend, unaffected).

---

## File Map

| File | Change |
|------|--------|
| `js/aw/stale-positions.js` | CREATE: `getStalePositions`, `refreshStaleChip`, `openStaleDialog`, `closeStaleDialog`, `redeemStalePosition` |
| `js/aw/monitor.js` | MODIFY: 7-row `_getAwPoolDef`, static `_labelBadge`, new `_buildDrawerRow` helper, `openFundDrawer`, `closeFundDrawer`, `refreshFundDrawerRow`; import `refreshStaleChip`; delete `refreshAwTypeBadges` |
| `js/aw/calc.js` | MODIFY: one line — `assets[a.id] = getAwDynAmt(getActiveAsset(a).code)` |
| `js/aw/inputs.js` | MODIFY: `toggleAwAlt` pre-switch check + warning toast; import `getAwAmt`; swap `refreshFundDrawerRow` for `refreshAwTypeBadges` |
| `strategy_page.html` | MODIFY: add stale chip and 🔀 button to section-actions; add `#aw-fund-drawer` HTML; add `#aw-stale-overlay` HTML |
| `js/main.js` | MODIFY: import `openFundDrawer`, `closeFundDrawer` from monitor; import `openStaleDialog`, `closeStaleDialog`, `redeemStalePosition`, `refreshStaleChip` from stale-positions; add to window; call `refreshStaleChip()` at init |
| `css/aw.css` | MODIFY: append `.aw-drawer-overlay` / `.aw-drawer` / `.aw-drawer-head` / `.aw-drawer-body` styles |

---

### Task 1: Create `js/aw/stale-positions.js`

**Files:**
- Create: `js/aw/stale-positions.js`

This module detects which non-active funds still carry a balance (stale positions), drives the section-head chip count, and manages the redemption dialog. It imports from `config.js`, `amounts.js`, and `aw-available.js` only — no circular deps.

- [ ] **Step 1: Create `js/aw/stale-positions.js` with full content**

```javascript
// js/aw/stale-positions.js — 未赎回持仓检测与管理
import { PORTFOLIO, awAltSet } from './config.js';
import { getAwAmt, getAwShares, setAwAmt, setAwShares, setAwCost, saveAwAmounts } from './amounts.js';
import { getAwAvailableAmt, setAwAvailableAmt, refreshAwTotalDisplay } from './aw-available.js';

export function getStalePositions() {
  return PORTFOLIO.flatMap(a => {
    if (!a.alt) return [];
    const inactiveCode = awAltSet.has(a.id) ? a.code : a.alt.code;
    const inactiveName = awAltSet.has(a.id) ? a.fullName : a.alt.fullName;
    const amt = getAwAmt(inactiveCode);
    if (amt <= 0) return [];
    return [{ id: a.id, code: inactiveCode, name: inactiveName, amt }];
  });
}

export function refreshStaleChip() {
  const n = getStalePositions().length;
  const el = document.getElementById('aw-stale-chip');
  if (!el) return;
  el.textContent = `⚠ ${n} 笔待赎回`;
  el.style.display = n > 0 ? '' : 'none';
}

export function redeemStalePosition(code) {
  const shares = getAwShares(code);
  const closeEl = document.getElementById(`aw-close-${code}`);
  const closePrice = closeEl ? parseFloat(closeEl.textContent) : 0;
  const redeemAmt = (shares > 0 && closePrice > 0)
    ? shares * closePrice
    : getAwAmt(code);

  setAwAmt(code, 0);
  setAwShares(code, 0);
  setAwCost(code, 0);
  setAwAvailableAmt(getAwAvailableAmt() + redeemAmt);
  saveAwAmounts();
  refreshAwTotalDisplay();
  refreshStaleChip();

  const row = document.getElementById(`aw-stale-row-${code}`);
  if (row) row.remove();
  const body = document.getElementById('aw-stale-body');
  if (body && body.children.length === 0) closeStaleDialog();
}

export function openStaleDialog() {
  const positions = getStalePositions();
  if (positions.length === 0) return;
  const body = document.getElementById('aw-stale-body');
  if (!body) return;

  const fmtAmt = v => `¥${Math.round(v).toLocaleString()}`;
  body.innerHTML = positions.map(p => {
    const shares = getAwShares(p.code);
    const closeEl = document.getElementById(`aw-close-${p.code}`);
    const closePrice = closeEl ? parseFloat(closeEl.textContent) : 0;
    const usedEstimate = shares > 0 && closePrice > 0;
    const estimatedAmt = usedEstimate ? shares * closePrice : p.amt;
    return `<div id="aw-stale-row-${p.code}" style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)">
      <div>
        <div style="font-weight:600;font-size:14px">${p.name}</div>
        <div style="color:var(--text-dim);font-size:12px;margin-top:2px">${p.code} · 录入金额 ${fmtAmt(p.amt)}</div>
        <div style="color:var(--text-dim);font-size:12px;margin-top:1px">
          估算赎回金额：${fmtAmt(estimatedAmt)}
          <span style="opacity:.6">${usedEstimate
            ? `（${shares.toFixed(2)} 份 × ${closePrice.toFixed(3)}）`
            : '（无行情，以录入金额估算）'}</span>
        </div>
      </div>
      <button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:var(--red);border-color:rgba(239,68,68,.3);white-space:nowrap;flex-shrink:0"
        onclick="redeemStalePosition('${p.code}')">确认赎回</button>
    </div>`;
  }).join('');

  document.getElementById('aw-stale-overlay')?.classList.add('open');
}

export function closeStaleDialog() {
  document.getElementById('aw-stale-overlay')?.classList.remove('open');
}
```

- [ ] **Step 2: Commit**

```bash
git add js/aw/stale-positions.js
git commit -m "feat(aw): 新建 stale-positions.js — 未赎回检测、chip 刷新、赎回弹窗"
```

---

### Task 2: Refactor `js/aw/monitor.js`

**Files:**
- Modify: `js/aw/monitor.js`

Five focused changes: (1) new import, (2) 7-row `_getAwPoolDef`, (3) static `_labelBadge`, (4) add `_buildDrawerRow` helper + drawer functions, (5) delete `refreshAwTypeBadges`.

- [ ] **Step 1: Add `refreshStaleChip` import**

Find:
```javascript
import { mkAwAmtCell, mkAwSharesCell, mkAwPosPct, refreshAwAmtPnl, getAwShares } from './amounts.js';
```

Replace with:
```javascript
import { mkAwAmtCell, mkAwSharesCell, mkAwPosPct, refreshAwAmtPnl, getAwShares } from './amounts.js';
import { refreshStaleChip } from './stale-positions.js';
```

- [ ] **Step 2: Replace `_getAwPoolDef()` to return 7 active-only rows**

Find and replace the entire `_getAwPoolDef` function:
```javascript
function _getAwPoolDef() {
  return PORTFOLIO.map(asset => {
    const active = getActiveAsset(asset);
    const label = awAltSet.has(asset.id) ? '替代' : '主力';
    return { ...asset, ...active, id: asset.id, group: asset.group, target: asset.target, label, altExists: !!asset.alt };
  });
}
```

- [ ] **Step 3: Replace `_labelBadge(def)` with static version (no onclick)**

Find and replace the entire `_labelBadge` function:
```javascript
function _labelBadge(def) {
  const isPrimary = def.label === '主力';
  const bg    = isPrimary ? 'rgba(34,197,94,.12)'  : 'rgba(148,163,184,.12)';
  const color = isPrimary ? 'var(--green)'         : 'var(--text-dim)';
  return `<span style="font-size:11px;padding:1px 6px;border-radius:3px;font-weight:600;background:${bg};color:${color}">${def.label}</span>`;
}
```

- [ ] **Step 4: Add `_buildDrawerRow` helper after `_labelBadge`**

Insert immediately after the closing brace of `_labelBadge` and before `// ── 表格初始化`:
```javascript
// ── 抽屉单行构建 ──────────────────────────────────────────────
function _buildDrawerRow(asset) {
  const altActive = awAltSet.has(asset.id);
  const hasAlt    = !!asset.alt;
  const activeStyle = 'background:rgba(34,197,94,.18);color:var(--green);border-color:rgba(34,197,94,.5);font-weight:700';
  const dimStyle    = 'background:transparent;color:var(--text-dim);border-color:var(--border)';

  const toggleHtml = hasAlt ? `
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
      <button class="btn btn-sm" style="${!altActive ? activeStyle : dimStyle};font-size:12px;padding:2px 10px"
        ${altActive ? `onclick="toggleAwAlt('${asset.id}')"` : ''}>● 主力</button>
      <button class="btn btn-sm" style="${altActive ? activeStyle : dimStyle};font-size:12px;padding:2px 10px"
        ${!altActive ? `onclick="toggleAwAlt('${asset.id}')"` : ''}>○ 替代</button>
    </div>
    <div style="flex:1;min-width:150px;font-size:13px;color:var(--text-dim)">
      ${asset.alt.fullName} <span style="opacity:.6">${asset.alt.code}</span>
    </div>` : `<span style="font-size:12px;color:var(--text-dim);opacity:.5">无替代标的</span>`;

  return `<div id="aw-drawer-row-${asset.id}" style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap">
    ${_groupBadge(asset.group)}
    <div style="flex:1;min-width:160px;font-size:13px;color:var(--text-dim)">
      ${asset.fullName} <span style="opacity:.6">${asset.code}</span>
    </div>
    ${toggleHtml}
    <span style="font-size:12px;color:var(--text-dim);flex-shrink:0;margin-left:auto">${(asset.target * 100).toFixed(0)}%</span>
  </div>`;
}
```

- [ ] **Step 5: Add `openFundDrawer`, `closeFundDrawer`, `refreshFundDrawerRow` before the final export line**

Find:
```javascript
export { awMaybeInitEmpty, awInitTable, loadAwPool, awFillRow, clearAndResetAw };
```

Insert immediately before that line:
```javascript
// ── 标的调整抽屉 ───────────────────────────────────────────────
export function openFundDrawer() {
  const body = document.getElementById('aw-fund-drawer-body');
  if (!body) return;
  body.innerHTML = PORTFOLIO.map(_buildDrawerRow).join('');
  document.getElementById('aw-fund-drawer')?.classList.add('open');
}

export function closeFundDrawer() {
  document.getElementById('aw-fund-drawer')?.classList.remove('open');
  awInitTable();
  if (_awItems.length > 0) _awItems.forEach(awFillRow);
  refreshStaleChip();
}

export function refreshFundDrawerRow(id) {
  const rowEl = document.getElementById(`aw-drawer-row-${id}`);
  if (!rowEl) return;
  const asset = PORTFOLIO.find(a => a.id === id);
  if (!asset) return;
  rowEl.outerHTML = _buildDrawerRow(asset);
}

```

- [ ] **Step 6: Delete `refreshAwTypeBadges` export**

Find and delete the entire function (including comment):
```javascript
// ── 刷新类型列 badge（alt 切换后调用）─────────────────────────
export function refreshAwTypeBadges() {
  _getAwPoolDef().forEach(def => {
    const el = document.getElementById(`aw-type-${def.code}`);
    if (el) el.innerHTML = _labelBadge(def);
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add js/aw/monitor.js
git commit -m "feat(aw): monitor 改为7行活跃标的，静态 badge，新增抽屉函数，移除 refreshAwTypeBadges"
```

---

### Task 3: Update `js/aw/calc.js` — active-only fund amounts

**Files:**
- Modify: `js/aw/calc.js`

`calc.js` already imports `getActiveAsset` from `./config.js` (line 2). The only change is the assets-reading loop inside `_runCalc`.

- [ ] **Step 1: Replace dual-fund amount read with active-only**

Find:
```javascript
  const assets = {};
  for (const a of PORTFOLIO) {
    assets[a.id] = getAwDynAmt(a.code) + (a.alt ? getAwDynAmt(a.alt.code) : 0);
  }
```

Replace with:
```javascript
  const assets = {};
  for (const a of PORTFOLIO) {
    assets[a.id] = getAwDynAmt(getActiveAsset(a).code);
  }
```

- [ ] **Step 2: Commit**

```bash
git add js/aw/calc.js
git commit -m "fix(aw): calc 只使用活跃标的金额计算再平衡"
```

---

### Task 4: Update `js/aw/inputs.js` — warning toast + refreshFundDrawerRow

**Files:**
- Modify: `js/aw/inputs.js`

Replace the entire file. Key changes: add `getAwAmt` import; pre-switch check for active fund balance with warning toast; call `refreshFundDrawerRow` instead of `refreshAwTypeBadges`.

- [ ] **Step 1: Replace full file content**

Write the following as the complete content of `js/aw/inputs.js`:
```javascript
// js/aw/inputs.js
import { PORTFOLIO, awAltSet, getActiveAsset, AW_ALT_KEY } from './config.js';
import { getAwAmt } from './amounts.js';
import { refreshFundDrawerRow } from './monitor.js';

function toggleAwAlt(id) {
  const a = PORTFOLIO.find(x => x.id === id);
  if (!a?.alt) return;

  const currentActiveCode = awAltSet.has(id) ? a.alt.code : a.code;
  const currentAmt = getAwAmt(currentActiveCode);
  if (currentAmt > 0) {
    const currentName = awAltSet.has(id) ? a.alt.name : a.name;
    window.showAwToast?.(
      `⚠ ${currentName} 中尚有持仓 ¥${currentAmt.toLocaleString('zh-CN')}，切换后请尽快赎回`,
      'var(--yellow)'
    );
  }

  if (awAltSet.has(id)) {
    awAltSet.delete(id);
  } else {
    awAltSet.add(id);
  }
  localStorage.setItem(AW_ALT_KEY, JSON.stringify([...awAltSet]));
  refreshFundDrawerRow(id);
}

export { toggleAwAlt };
```

- [ ] **Step 2: Commit**

```bash
git add js/aw/inputs.js
git commit -m "feat(aw): toggleAwAlt 新增持仓警告 toast，改调 refreshFundDrawerRow"
```

---

### Task 5: Update `strategy_page.html`

**Files:**
- Modify: `strategy_page.html`

Three surgical changes: (a) section-actions gets stale chip and 🔀 button, (b) fund drawer HTML inserted before the AW PnL overlay, (c) stale overlay HTML inserted alongside it.

- [ ] **Step 1: Update section-actions — add stale chip and 🔀 button**

Find (lines 59–65):
```html
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" id="aw-debug-btn" onclick="toggleAwDebug()">🐛 调试</button>
          <button class="btn btn-ghost btn-sm" onclick="clearAndResetAw()" style="border-color:var(--red);color:var(--red)">🗑 清空数据</button>
          <button class="btn btn-ghost btn-sm" onclick="resetCalc()">↺ 重置</button>
          <button class="btn btn-primary btn-sm" onclick="calcRebalance()">⚡ 计算</button>
          <button class="btn btn-primary" id="aw-load-btn" onclick="loadAwPool()">▶ 加载数据</button>
        </div>
```

Replace with:
```html
        <div class="section-actions">
          <button class="btn btn-sm" id="aw-stale-chip" onclick="openStaleDialog()" style="display:none;background:rgba(239,68,68,.15);color:var(--red);border-color:rgba(239,68,68,.3)">⚠ 0 笔待赎回</button>
          <button class="btn btn-ghost btn-sm" id="aw-debug-btn" onclick="toggleAwDebug()">🐛 调试</button>
          <button class="btn btn-ghost btn-sm" onclick="clearAndResetAw()" style="border-color:var(--red);color:var(--red)">🗑 清空数据</button>
          <button class="btn btn-ghost btn-sm" onclick="resetCalc()">↺ 重置</button>
          <button class="btn btn-primary btn-sm" onclick="calcRebalance()">⚡ 计算</button>
          <button class="btn btn-ghost btn-sm" onclick="openFundDrawer()">🔀 标的调整</button>
          <button class="btn btn-primary" id="aw-load-btn" onclick="loadAwPool()">▶ 加载数据</button>
        </div>
```

- [ ] **Step 2: Insert fund drawer and stale overlay HTML before the AW PnL overlay**

Find:
```html
<!-- AW 收益明细弹窗 -->
```

Insert immediately before that line:
```html
<!-- AW 标的调整抽屉 -->
<div class="aw-drawer-overlay" id="aw-fund-drawer" onclick="if(event.target===this)closeFundDrawer()">
  <div class="aw-drawer">
    <div class="aw-drawer-head">
      <span>🔀 标的调整</span>
      <button onclick="closeFundDrawer()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 12px;border-radius:6px;font-size:13px;cursor:pointer">✕</button>
    </div>
    <div class="aw-drawer-body" id="aw-fund-drawer-body"></div>
  </div>
</div>

<!-- AW 未赎回管理弹窗 -->
<div class="journal-overlay" id="aw-stale-overlay" onclick="if(event.target===this)closeStaleDialog()">
  <div class="journal-modal" style="max-width:560px">
    <div class="journal-modal-head">
      <span style="font-size:18px;font-weight:700;flex:1">⚠ 未赎回持仓</span>
      <button onclick="closeStaleDialog()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:5px 12px;border-radius:6px;font-size:13px;cursor:pointer">✕ 关闭</button>
    </div>
    <div class="journal-table-wrap">
      <p style="font-size:13px;color:var(--text-dim);margin:0 0 14px">以下非活跃标的中有余额，请确认赎回后将金额计入可用资金。</p>
      <div id="aw-stale-body"></div>
    </div>
  </div>
</div>

```

- [ ] **Step 3: Commit**

```bash
git add strategy_page.html
git commit -m "feat(aw): 页面添加标的调整抽屉和未赎回弹窗、stale chip、🔀 按钮"
```

---

### Task 6: Update `js/main.js`

**Files:**
- Modify: `js/main.js`

Four changes: add `openFundDrawer`/`closeFundDrawer` to monitor import; add stale-positions import; add all new functions to window; call `refreshStaleChip()` at init.

- [ ] **Step 1: Extend monitor.js import to include drawer functions**

Find:
```javascript
import { awMaybeInitEmpty, loadAwPool, clearAndResetAw } from './aw/monitor.js';
```

Replace with:
```javascript
import { awMaybeInitEmpty, loadAwPool, clearAndResetAw, openFundDrawer, closeFundDrawer } from './aw/monitor.js';
```

- [ ] **Step 2: Add stale-positions.js import after the monitor import**

Find:
```javascript
import { awMaybeInitEmpty, loadAwPool, clearAndResetAw, openFundDrawer, closeFundDrawer } from './aw/monitor.js';
```

Insert immediately after that line:
```javascript
import { openStaleDialog, closeStaleDialog, redeemStalePosition, refreshStaleChip } from './aw/stale-positions.js';
```

- [ ] **Step 3: Add new functions to window assignment**

Find:
```javascript
  // AW 监控
  loadAwPool, clearAndResetAw,
```

Replace with:
```javascript
  // AW 监控
  loadAwPool, clearAndResetAw,
  openFundDrawer, closeFundDrawer,
  // AW 未赎回管理
  openStaleDialog, closeStaleDialog, redeemStalePosition,
```

- [ ] **Step 4: Call `refreshStaleChip()` after AW amounts init**

Find:
```javascript
  await loadAwAmounts();
  await loadAwAvailable();
  refreshAwTotalDisplay();
  refreshAwPosPct();
```

Replace with:
```javascript
  await loadAwAmounts();
  await loadAwAvailable();
  refreshAwTotalDisplay();
  refreshAwPosPct();
  refreshStaleChip();
```

- [ ] **Step 5: Commit**

```bash
git add js/main.js
git commit -m "feat(aw): main.js 新增抽屉和未赎回弹窗函数挂载及初始化 chip"
```

---

### Task 7: Update `css/aw.css` — drawer styles

**Files:**
- Modify: `css/aw.css`

- [ ] **Step 1: Append drawer styles at end of file**

Append to the very end of `css/aw.css`:
```css

  /* ── 标的调整抽屉 ── */
  .aw-drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .5);
    z-index: 400;
    display: none;
  }
  .aw-drawer-overlay.open {
    display: block;
  }
  .aw-drawer {
    position: absolute;
    top: 0; right: 0; bottom: 0;
    width: 480px;
    max-width: 95vw;
    background: var(--surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform .25s ease;
    overflow: hidden;
  }
  .aw-drawer-overlay.open .aw-drawer {
    transform: translateX(0);
  }
  .aw-drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    font-size: 15px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .aw-drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px;
  }
```

- [ ] **Step 2: Browser verification**

Open `http://localhost:9001/strategy#aw`, then verify all paths:

1. **Monitor table**: after loading data, only 7 rows visible (one active fund per asset); type badge is static (no ⇄, not clickable)
2. **🔀 button**: clicking opens a right-side drawer; 7 rows show primary/alt toggle buttons; the active fund's button is green-highlighted
3. **Toggle (no balance)**: clicking the inactive button in the drawer → button highlight swaps immediately; no toast
4. **Toggle (with balance)**: if active fund has a balance → yellow toast "尚有持仓...请尽快赎回"; toggle still happens; button updates
5. **Close drawer**: clicking ✕ or backdrop → drawer closes; monitor table re-renders with new active funds; any active funds changed are reflected
6. **⚡ 计算**: uses only the active fund's amount per asset (not primary+alt sum)
7. **Stale chip**: if any inactive fund has amount > 0 → red "⚠ N 笔待赎回" chip visible in section-head; hidden otherwise
8. **Stale dialog**: clicking chip → dialog opens with each stale fund; shows fund name, code, stored amount, estimated redemption amount
9. **Redeem**: clicking "确认赎回" on a row → that row disappears; available cash increases by estimated amount; chip count decrements; when last row redeemed, dialog auto-closes

- [ ] **Step 3: Commit**

```bash
git add css/aw.css
git commit -m "feat(aw): 新增标的调整抽屉 CSS 样式"
```
