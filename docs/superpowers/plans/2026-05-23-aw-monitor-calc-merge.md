# AW 监控表与再平衡计算器合并 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除再平衡计算器的输入区，将 ⚡ 计算按钮移入监控表 section-head，calc 直接读 `_awAmt`，计算后在监控行高亮，主力/替代切换移入类型列 badge。

**Architecture:** `monitor.js` 新增行高亮和类型切换函数并导出；`calc.js` 改从 `getAwDynAmt` 读持仓（主力+替代之和），更新高亮调用；`inputs.js` 精简至只剩 `toggleAwAlt`；`strategy_page.html` 删除旧计算器卡片，新增独立「再平衡结果」卡片。

**Tech Stack:** 原生 ES Modules，Vanilla JS，HTML5，无 JS 测试框架（浏览器手工验证），Python pytest（后端，不涉及本次改动）

---

## File Map

| 文件 | 变更 |
|------|------|
| `js/aw/monitor.js` | 新增 `data-asset-id`，`aw-type-{code}` cell，目标%列，可点击类型 badge，导出 3 个新函数 |
| `js/aw/calc.js` | 改读 `_awAmt`，更新 import，更新高亮调用，更新 `resetCalc` |
| `js/aw/inputs.js` | 删 3 个函数，精简 `toggleAwAlt`，更新 imports/exports |
| `strategy_page.html` | 监控 section-head 加 ⚡/↺ 按钮；删旧计算器卡片；新建「再平衡结果」卡片 |
| `js/main.js` | 移除 `buildInputs`、`populateCalcInputsFromPositions` 引用 |
| `css/aw.css` | 新增 `.row-sell` / `.row-buy` 行高亮样式 |

---

### Task 1: monitor.js — 新增行高亮、目标%列、可点击类型 badge

**Files:**
- Modify: `js/aw/monitor.js`

---

- [ ] **Step 1: 在 monitor.js 顶部更新 import，加入 `awAltSet`**

将：

```javascript
import { PORTFOLIO } from './config.js';
```

替换为：

```javascript
import { PORTFOLIO, awAltSet } from './config.js';
```

---

- [ ] **Step 2: 更新 `_getAwPoolDef()` — 加入 `altExists` 标志**

将整个 `_getAwPoolDef` 函数替换为：

```javascript
function _getAwPoolDef() {
  const defs = [];
  for (const asset of PORTFOLIO) {
    defs.push({ ...asset, label: '主力', altExists: !!asset.alt });
    if (asset.alt) {
      defs.push({ ...asset, ...asset.alt,
                  id: asset.id, group: asset.group, target: asset.target,
                  label: '替代', altExists: true });
    }
  }
  return defs;
}
```

---

- [ ] **Step 3: 将 `_labelBadge(label)` 改为接受完整 `def`，支持可点击切换**

将整个 `_labelBadge` 函数替换为：

```javascript
function _labelBadge(def) {
  const isPrimary = def.label === '主力';
  const bg    = isPrimary ? 'rgba(34,197,94,.12)'  : 'rgba(148,163,184,.12)';
  const color = isPrimary ? 'var(--green)'         : 'var(--text-dim)';
  const base  = `font-size:11px;padding:1px 6px;border-radius:3px;font-weight:600;background:${bg};color:${color}`;

  if (!def.altExists) {
    return `<span style="${base}">${def.label}</span>`;
  }

  const altActive  = awAltSet.has(def.id);
  const thisActive = isPrimary ? !altActive : altActive;
  const dimCss     = thisActive ? '' : 'opacity:.4;';
  const activeCss  = thisActive ? 'outline:1px solid currentColor;' : '';
  const title      = isPrimary ? '切换为替代基金' : '切换回主力基金';
  return `<span style="${base};${dimCss}${activeCss}cursor:pointer;user-select:none" onclick="toggleAwAlt('${def.id}')" title="${title}">${def.label} ⇄</span>`;
}
```

---

- [ ] **Step 4: 更新 `awInitTable` 的行模板 — 加 `data-asset-id`、`aw-type-{code}` ID、目标% 列**

在 `awInitTable` 函数内，将行模板替换为：

```javascript
  const rows = defs.map(def => `<tr id="aw-row-${def.code}" data-asset-id="${def.id}">
    <td>${_groupBadge(def.group)}</td>
    <td id="aw-type-${def.code}">${_labelBadge(def)}</td>
    <td style="font-weight:600">${escHtml(def.fullName)}</td>
    <td style="color:var(--text-dim);font-size:13px">${def.code}</td>
    <td id="aw-ret-${def.code}">${sk('60%')}</td>
    <td id="aw-ret15-${def.code}">${sk('55%')}</td>
    <td id="aw-ret5-${def.code}">${sk('55%')}</td>
    <td id="aw-ret1-${def.code}">${sk('55%')}</td>
    <td id="aw-close-${def.code}">${sk('70%')}</td>
    <td id="aw-ma20-${def.code}">${sk('55%')}</td>
    <td id="aw-ma60-${def.code}">${sk('55%')}</td>
    <td id="aw-amt-cell-${def.code}">${mkAwAmtCell(def.code)}</td>
    <td id="aw-shares-cell-${def.code}">${mkAwSharesCell(def.code)}</td>
    <td>${mkAwPosPct(def.code)}</td>
    <td style="text-align:right;color:var(--text-dim);font-size:13px">${(def.target * 100).toFixed(0)}%</td>
  </tr>`).join('');
```

---

- [ ] **Step 5: 更新 `awInitTable` 的 thead — 加 `目标%` 表头**

将：

```html
          <th>仓位%</th>
        </tr></thead>
```

替换为：

```html
          <th>仓位%</th>
          <th>目标%</th>
        </tr></thead>
```

---

- [ ] **Step 6: 在文件末尾，export 前，新增三个函数**

在 `export { awMaybeInitEmpty, awInitTable, loadAwPool, awFillRow, clearAndResetAw };` 这一行**之前**插入：

```javascript
// ── 刷新类型列 badge（alt 切换后调用）─────────────────────────
export function refreshAwTypeBadges() {
  _getAwPoolDef().forEach(def => {
    const el = document.getElementById(`aw-type-${def.code}`);
    if (el) el.innerHTML = _labelBadge(def);
  });
}

// ── 监控行高亮（计算后调用）──────────────────────────────────
export function highlightMonitorRows(ops) {
  document.querySelectorAll('[data-asset-id]').forEach(row => {
    row.classList.remove('row-sell', 'row-buy');
  });
  ops.forEach(({ id, diff }) => {
    document.querySelectorAll(`[data-asset-id="${id}"]`).forEach(row => {
      if (diff < -1)     row.classList.add('row-sell');
      else if (diff > 1) row.classList.add('row-buy');
    });
  });
}

// ── 清除监控行高亮（重置时调用）──────────────────────────────
export function clearMonitorHighlights() {
  document.querySelectorAll('[data-asset-id]').forEach(row => {
    row.classList.remove('row-sell', 'row-buy');
  });
}

```

---

- [ ] **Step 7: 验证 monitor.js 逻辑完整**

检查：
- `_getAwPoolDef` 返回的每个 def 有 `label`、`altExists`、`id`、`code`、`target`
- `_labelBadge(def)` 中 `def.id` 和 `def.altExists` 存在
- 三个新导出函数语法正确

---

- [ ] **Step 8: 提交**

```bash
git add js/aw/monitor.js
git commit -m "feat(aw): 监控表新增目标%列、可点击类型badge、行高亮函数"
```

---

### Task 2: calc.js — 改读 `_awAmt`，更新高亮调用

**Files:**
- Modify: `js/aw/calc.js`

---

- [ ] **Step 1: 更新 calc.js 的 import — 将高亮函数从 inputs.js 改为 monitor.js**

将：

```javascript
import { highlightInputs, clearHighlights } from './inputs.js';
```

替换为：

```javascript
import { highlightMonitorRows, clearMonitorHighlights } from './monitor.js';
```

---

- [ ] **Step 2: 在 `_runCalc` 中将 `#inp-{id}` 读取替换为直接读 `_awAmt`**

将：

```javascript
  const assets = {};
  for (const a of PORTFOLIO) {
    assets[a.id] = parseFloat(document.getElementById('inp-' + a.id).value) || 0;
  }
```

替换为：

```javascript
  const assets = {};
  for (const a of PORTFOLIO) {
    assets[a.id] = getAwDynAmt(a.code) + (a.alt ? getAwDynAmt(a.alt.code) : 0);
  }
```

---

- [ ] **Step 3: 更新 `total <= 0` 时的错误处理 — 显示结果卡片**

将：

```javascript
  if (total <= 0) {
    document.getElementById('total-hint').innerHTML =
      '<span style="color:var(--red)">⚠ 请先在标的监控中录入持仓金额，或直接填写各类别当前市值</span>';
    return;
  }
```

替换为：

```javascript
  if (total <= 0) {
    document.getElementById('total-hint').innerHTML =
      '<span style="color:var(--red)">⚠ 请先在标的监控中录入持仓金额</span>';
    document.getElementById('calc-result-card').style.display = 'block';
    return;
  }
```

---

- [ ] **Step 4: 将 `_runCalc` 中 `highlightInputs(ops)` 替换为 `highlightMonitorRows(ops)`**

将：

```javascript
  // Highlight input fields: red = sell, green = buy, default = hold
  highlightInputs(ops);
```

替换为：

```javascript
  // Highlight monitor rows: red = sell, green = buy
  highlightMonitorRows(ops);
```

---

- [ ] **Step 5: 将 `_runCalc` 末尾的 `calc-result` 显示改为 `calc-result-card`**

将：

```javascript
  document.getElementById('calc-result').style.display = 'block';
```

替换为：

```javascript
  document.getElementById('calc-result-card').style.display = 'block';
```

---

- [ ] **Step 6: 更新 `resetCalc()` — 移除 input 清空，更新高亮调用**

将整个 `resetCalc` 函数替换为：

```javascript
function resetCalc() {
  document.getElementById('total-hint').innerHTML = '';
  document.getElementById('check-type-banner').innerHTML = '';
  document.getElementById('calc-result-card').style.display = 'none';
  clearMonitorHighlights();
  lastCalcResult = null;
}
```

---

- [ ] **Step 7: 提交**

```bash
git add js/aw/calc.js
git commit -m "feat(aw): calc 直接读 awAmt，更新高亮调用，显示/隐藏结果卡片"
```

---

### Task 3: inputs.js — 精简为只剩 `toggleAwAlt`

**Files:**
- Modify: `js/aw/inputs.js`

---

- [ ] **Step 1: 将 inputs.js 全部内容替换为以下精简版本**

将 `js/aw/inputs.js` 的全部内容替换为：

```javascript
// js/aw/inputs.js
import { PORTFOLIO, awAltSet, getActiveAsset, AW_ALT_KEY } from './config.js';
import { refreshAwTypeBadges } from './monitor.js';

function toggleAwAlt(id) {
  const a = PORTFOLIO.find(x => x.id === id);
  if (!a?.alt) return;
  if (awAltSet.has(id)) {
    awAltSet.delete(id);
  } else {
    awAltSet.add(id);
  }
  localStorage.setItem(AW_ALT_KEY, JSON.stringify([...awAltSet]));
  refreshAwTypeBadges();
  const active = getActiveAsset(a);
  window.showAwToast?.(`已切换为：${active.name}（${active.code}）`);
}

export { toggleAwAlt };
```

---

- [ ] **Step 2: 提交**

```bash
git add js/aw/inputs.js
git commit -m "refactor(aw): inputs.js 精简为只剩 toggleAwAlt，移除 buildInputs 等"
```

---

### Task 4: strategy_page.html — 重构卡片结构

**Files:**
- Modify: `strategy_page.html`

---

- [ ] **Step 1: 在监控 section-head 的 `section-actions` 中，加入 ⚡ 计算 和 ↺ 重置 按钮**

定位：

```html
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" id="aw-debug-btn" onclick="toggleAwDebug()">🐛 调试</button>
          <button class="btn btn-ghost btn-sm" onclick="clearAndResetAw()" style="border-color:var(--red);color:var(--red)">🗑 清空数据</button>
          <button class="btn btn-primary" id="aw-load-btn" onclick="loadAwPool()">▶ 加载数据</button>
        </div>
```

替换为：

```html
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" id="aw-debug-btn" onclick="toggleAwDebug()">🐛 调试</button>
          <button class="btn btn-ghost btn-sm" onclick="clearAndResetAw()" style="border-color:var(--red);color:var(--red)">🗑 清空数据</button>
          <button class="btn btn-ghost btn-sm" onclick="resetCalc()">↺ 重置</button>
          <button class="btn btn-primary btn-sm" onclick="calcRebalance()">⚡ 计算</button>
          <button class="btn btn-primary" id="aw-load-btn" onclick="loadAwPool()">▶ 加载数据</button>
        </div>
```

---

- [ ] **Step 2: 删除整个「再平衡计算器」section-card**

删除以下完整区块（从注释行到最后一个 `</div>`）：

```html
    <!-- ── 再平衡计算器 ── -->
    <div class="section-card">
      <div class="section-head">
        <span class="section-icon">🧮</span>
        <span class="section-title">再平衡计算器</span>
        <div class="section-actions">
          <button class="btn btn-primary" onclick="calcRebalance()">⚡ 计算</button>
          <button class="btn btn-ghost btn-sm" onclick="resetCalc()">↺ 重置</button>
        </div>
      </div>

      <div class="section-body">
        <!-- 总资产提示（自动计算） -->
        <div id="total-hint" style="font-size:13px; color:var(--text-dim); margin-bottom:14px; line-height:1.5"></div>

        <!-- 各资产类别（按类别分行，动态生成） -->
        <div id="asset-inputs"></div>

        <!-- 计算结果 -->
        <div id="calc-result" style="display:none; margin-top:20px">

          <!-- 检查类型横幅（自动判断，始终显示） -->
          <div id="check-type-banner" style="margin-bottom:4px"></div>

          <!-- 触发点状态 -->
          <div id="trigger-status" style="margin-bottom:14px; display:flex; flex-wrap:wrap; gap:8px; align-items:center">
            <span style="font-size:13px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px">触发点：</span>
          </div>

          <!-- 调仓前 / 操作 / 调仓后 三列对比 -->
          <div class="compare-wrap">
            <div class="compare-head">
              <div class="compare-head-cell">调仓前（当前配置）</div>
              <div class="compare-head-cell mid">调整操作</div>
              <div class="compare-head-cell" style="text-align:right">调仓后（目标配置）</div>
            </div>
            <div id="compare-rows"></div>
          </div>

          <!-- 汇总条 -->
          <div class="summary-bar" id="calc-summary"></div>

          <!-- 具体操作方案（有触发才显示） -->
          <div id="op-plans" style="display:none; padding:20px; border-top:1px solid var(--border)">
            <div style="font-size:13px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">具体操作方案</div>
            <div class="op-plans-grid">
              <div class="op-plan-card" id="plan-convert"></div>
              <div class="op-plan-card" id="plan-stepwise"></div>
            </div>
            <div class="op-footnote" style="margin-top:12px">
              * 场外基金赎回通常需 T+1～T+3 工作日到账（具体以基金合同为准）。直接转换需平台支持（天天基金、蚂蚁财富等平台支持跨公司基金转换），可省去等待资金到账时间，但实际操作以平台规则为准。
            </div>
          </div>

          <!-- 保存按钮 -->
          <div style="padding:14px 20px;border-top:1px solid var(--border)">
            <button class="btn btn-success" onclick="saveToLog()" id="save-log-btn" style="display:none">💾 保存为操作记录</button>
          </div>
        </div>
      </div>
    </div>
```

---

- [ ] **Step 3: 在「操作记录」section-card 之前插入新的「再平衡结果」section-card**

在 `<!-- ── 操作记录 ── -->` 注释行之前插入：

```html
    <!-- ── 再平衡结果 ── -->
    <div class="section-card" id="calc-result-card" style="display:none">
      <div class="section-head">
        <span class="section-icon">🧮</span>
        <span class="section-title">再平衡结果</span>
      </div>
      <div class="section-body" style="padding:0">
        <div id="calc-result">

          <!-- 总金额提示 -->
          <div id="total-hint" style="padding:14px 20px;font-size:13px;color:var(--text-dim);line-height:1.5;border-bottom:1px solid var(--border)"></div>

          <!-- 检查类型横幅（自动判断，始终显示） -->
          <div id="check-type-banner" style="margin:10px 20px 0"></div>

          <!-- 触发点状态 -->
          <div id="trigger-status" style="margin:0 20px 14px; display:flex; flex-wrap:wrap; gap:8px; align-items:center">
            <span style="font-size:13px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px">触发点：</span>
          </div>

          <!-- 调仓前 / 操作 / 调仓后 三列对比 -->
          <div class="compare-wrap">
            <div class="compare-head">
              <div class="compare-head-cell">调仓前（当前配置）</div>
              <div class="compare-head-cell mid">调整操作</div>
              <div class="compare-head-cell" style="text-align:right">调仓后（目标配置）</div>
            </div>
            <div id="compare-rows"></div>
          </div>

          <!-- 汇总条 -->
          <div class="summary-bar" id="calc-summary"></div>

          <!-- 具体操作方案（有触发才显示） -->
          <div id="op-plans" style="display:none; padding:20px; border-top:1px solid var(--border)">
            <div style="font-size:13px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">具体操作方案</div>
            <div class="op-plans-grid">
              <div class="op-plan-card" id="plan-convert"></div>
              <div class="op-plan-card" id="plan-stepwise"></div>
            </div>
            <div class="op-footnote" style="margin-top:12px">
              * 场外基金赎回通常需 T+1～T+3 工作日到账（具体以基金合同为准）。直接转换需平台支持（天天基金、蚂蚁财富等平台支持跨公司基金转换），可省去等待资金到账时间，但实际操作以平台规则为准。
            </div>
          </div>

          <!-- 保存按钮 -->
          <div style="padding:14px 20px;border-top:1px solid var(--border)">
            <button class="btn btn-success" onclick="saveToLog()" id="save-log-btn" style="display:none">💾 保存为操作记录</button>
          </div>
        </div>
      </div>
    </div>

```

---

- [ ] **Step 4: 提交**

```bash
git add strategy_page.html
git commit -m "feat(aw): 重构页面卡片：监控加⚡按钮，新建再平衡结果卡片"
```

---

### Task 5: main.js — 移除 buildInputs、populateCalcInputsFromPositions

**Files:**
- Modify: `js/main.js`

---

- [ ] **Step 1: 更新 inputs.js 的 import — 只保留 `toggleAwAlt`**

将：

```javascript
import { buildInputs, toggleAwAlt, populateCalcInputsFromPositions } from './aw/inputs.js';
```

替换为：

```javascript
import { toggleAwAlt } from './aw/inputs.js';
```

---

- [ ] **Step 2: 删除顶层 `buildInputs()` 调用**

找到（在 `// ── 页面初始化 ──` 注释块下方）：

```javascript
// ── 页面初始化 ──────────────────────────────────────────────
buildInputs();
renderLog();
initRebalanceDayStyle();
```

替换为：

```javascript
// ── 页面初始化 ──────────────────────────────────────────────
renderLog();
initRebalanceDayStyle();
```

---

- [ ] **Step 3: 删除 IIFE 中的 `populateCalcInputsFromPositions()` 调用**

找到：

```javascript
  populateCalcInputsFromPositions();
```

（在 `refreshAwPosPct();` 之后）直接删除这一行。

---

- [ ] **Step 4: 提交**

```bash
git add js/main.js
git commit -m "chore(aw): main.js 移除 buildInputs 和 populateCalcInputsFromPositions"
```

---

### Task 6: css/aw.css — 新增行高亮样式

**Files:**
- Modify: `css/aw.css`

---

- [ ] **Step 1: 在 css/aw.css 末尾追加行高亮样式**

在文件末尾追加：

```css

  /* ── 监控表行高亮（再平衡计算结果） ── */
  #aw-monitor-table-wrap tbody tr.row-sell td {
    background: rgba(239, 68, 68, .07);
  }
  #aw-monitor-table-wrap tbody tr.row-buy td {
    background: rgba(34, 197, 94, .07);
  }
  #aw-monitor-table-wrap tbody tr.row-sell:hover td {
    background: rgba(239, 68, 68, .13);
  }
  #aw-monitor-table-wrap tbody tr.row-buy:hover td {
    background: rgba(34, 197, 94, .13);
  }
```

---

- [ ] **Step 2: 在浏览器中验证**

打开 `http://localhost:9001/strategy#aw`，加载监控数据后点击 ⚡ 计算：

期望：
- 无弹窗，直接出现「再平衡结果」卡片
- 需要买入的资产对应监控行浅绿色底，需要卖出的行浅红色底
- 类型列显示「主力 ⇄」/ 「替代 ⇄」，点击后 toast 提示并刷新 badge 激活态
- 目标%列正确显示各资产目标权重
- ↺ 重置 后行颜色清除，结果卡片隐藏

---

- [ ] **Step 3: 提交**

```bash
git add css/aw.css
git commit -m "feat(aw): 监控表行高亮样式 row-sell / row-buy"
```
