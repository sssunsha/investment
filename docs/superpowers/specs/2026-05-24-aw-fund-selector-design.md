# AW 标的调整抽屉与未赎回管理设计

**日期：** 2026-05-24  
**范围：** `strategy_page.html`、`js/aw/monitor.js`、`js/aw/inputs.js`、`js/aw/calc.js`、`js/aw/stale-positions.js`（新建）、`js/main.js`

---

## 一、需求概述

当前监控表为每个资产展示主力和替代两行，类型列有内联 ⇄ 切换 badge，用户反馈操作混乱。改为：

1. 监控表只显示每个资产当前活跃的标的（7 行）
2. Section-head 新增「🔀 标的调整」按钮，点击后打开右侧抽屉，集中管理各资产的主力/替代选择
3. 切换时若原活跃标的有持仓则 toast 提醒尽快赎回，切换不阻断
4. 全部计算（总资产、仓位%、再平衡）只使用活跃标的的金额，替代标的余额不参与
5. 非活跃标的若有余额（未赎回），在 section-head 显示醒目指示 chip，点击打开未赎回管理弹窗
6. 用户在弹窗中确认赎回后，清除该标的持仓数据，按份额 × 上一日收盘价估算赎回金额并计入可用资金

---

## 二、页面布局

### 2.1 监控表 Section-head 按钮区（从左到右）

```
[总金额] [总收益] [可用金额] ...
[⚠ N 笔待赎回]  [🐛 调试]  [🗑 清空数据]  [↺ 重置]  [⚡ 计算]  [🔀 标的调整]  [▶ 加载数据]
```

- `⚠ N 笔待赎回` — 红色 chip（`id="aw-stale-chip"`），N > 0 时显示，N = 0 时 `display:none`；点击打开未赎回弹窗
- `🔀 标的调整` — ghost 按钮，点击打开右侧抽屉

### 2.2 监控表

只渲染 7 行（每个资产的活跃标的）。类型列显示静态 badge（「主力」或「替代」），不再有 ⇄ 可点击。

### 2.3 新增：标的调整抽屉（`id="aw-fund-drawer"`）

右侧滑入，宽约 480px。关闭后监控表重建。

### 2.4 新增：未赎回管理弹窗（`id="aw-stale-overlay"`）

居中 overlay，列出所有非活跃标的中有余额的记录，逐条确认赎回。

---

## 三、监控表变化

### 3.1 `_getAwPoolDef()` — 只返回活跃标的

```javascript
function _getAwPoolDef() {
  return PORTFOLIO.map(asset => {
    const active = getActiveAsset(asset);
    const label = awAltSet.has(asset.id) ? '替代' : '主力';
    return { ...asset, ...active, id: asset.id, group: asset.group,
             target: asset.target, label, altExists: !!asset.alt };
  });
}
```

每次调用返回 7 条 def（当前活跃标的），表格只渲染 7 行。

### 3.2 `_labelBadge(def)` — 改回静态 badge

不再有 `onclick`，不再有 ⇄，仅根据 `def.label` 渲染颜色：

```javascript
function _labelBadge(def) {
  const isPrimary = def.label === '主力';
  const bg    = isPrimary ? 'rgba(34,197,94,.12)'  : 'rgba(148,163,184,.12)';
  const color = isPrimary ? 'var(--green)'         : 'var(--text-dim)';
  return `<span style="font-size:11px;padding:1px 6px;border-radius:3px;font-weight:600;background:${bg};color:${color}">${def.label}</span>`;
}
```

### 3.3 新增导出函数

```javascript
export function refreshStaleChip()      // 更新 aw-stale-chip 显示数量
export function openFundDrawer()        // 打开标的调整抽屉
export function closeFundDrawer()       // 关闭抽屉并重建表格
export function refreshFundDrawerRow(id) // 刷新抽屉中单行的选中状态（供 toggleAwAlt 调用）
```

`refreshAwTypeBadges()` 不再需要（类型 badge 不可点击），可移除导出。

---

## 四、标的调整抽屉

### 4.1 HTML 结构（注入 strategy_page.html）

```html
<div class="aw-drawer-overlay" id="aw-fund-drawer">
  <div class="aw-drawer">
    <div class="aw-drawer-head">
      <span>🔀 标的调整</span>
      <button onclick="closeFundDrawer()">✕</button>
    </div>
    <div class="aw-drawer-body" id="aw-fund-drawer-body">
      <!-- 动态生成 7 行 -->
    </div>
  </div>
</div>
```

### 4.2 每行结构

```
[股票]  沪深300  华泰柏瑞 460300  ● 主力  ○ 替代  天弘 000961  (25%)
```

- 类别 badge（group）
- 资产简称（`asset.label`）
- 主力基金简称 + 代码
- 单选切换按钮（`●主力 / ○替代`，当前活跃侧高亮）
- 替代基金简称 + 代码
- 目标%

### 4.3 切换逻辑（`toggleAwAlt` 更新）

```javascript
function toggleAwAlt(id) {
  const a = PORTFOLIO.find(x => x.id === id);
  if (!a?.alt) return;

  // 检查当前活跃标的是否有持仓
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

  // 刷新抽屉内该行的选中状态（monitor.js 导出）
  refreshFundDrawerRow(id);
}
```

切换不阻断，toast 仅提示。

### 4.4 关闭抽屉

```javascript
function closeFundDrawer() {
  document.getElementById('aw-fund-drawer').classList.remove('open');
  awInitTable();           // 重建监控表（7 行）
  refreshStaleChip();      // 刷新待赎回指示器
}
```

---

## 五、数据流变化

### 5.1 `calc.js` 持仓读取

```javascript
// 改前（主力 + 替代之和）
assets[a.id] = getAwDynAmt(a.code) + (a.alt ? getAwDynAmt(a.alt.code) : 0);

// 改后（仅活跃标的）
assets[a.id] = getAwDynAmt(getActiveAsset(a).code);
```

### 5.2 总资产 / 仓位% 计算

`refreshAwAllPosPct()` 和 `refreshAwTotalDisplay()` 均通过 `getActiveAsset(a).code` 求和，已使用正确逻辑，无需改动。

### 5.3 `monitor.js` 行渲染

`_getAwPoolDef()` 只返回 7 条活跃 def，持仓金额列 `mkAwAmtCell(def.code)` 和仓位% 列自然只显示活跃标的数据。

---

## 六、未赎回管理（`js/aw/stale-positions.js`，新建）

### 6.1 检测函数

```javascript
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
```

### 6.2 指示器刷新

```javascript
export function refreshStaleChip() {
  const n = getStalePositions().length;
  const el = document.getElementById('aw-stale-chip');
  if (!el) return;
  el.textContent = `⚠ ${n} 笔待赎回`;
  el.style.display = n > 0 ? '' : 'none';
}
```

### 6.3 弹窗渲染

每条记录显示：

| 字段 | 来源 |
|------|------|
| 基金名 | `inactiveName` |
| 代码 | `inactiveCode` |
| 已录入金额 | `getAwAmt(code)` |
| 估算赎回金额 | `getAwShares(code) × parseFloat(#aw-close-{code}.textContent)` |
| fallback | 若无行情数据（shares = 0 或 close = 0），直接使用录入金额 |

### 6.4 赎回操作

```javascript
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
  // 从弹窗列表中移除该行；若列表为空则关闭弹窗
}
```

---

## 七、`inputs.js` 变化

`toggleAwAlt` 更新（见第四节 4.3）：不再调用 `refreshAwTypeBadges()`，改为从 `monitor.js` import 并调用 `refreshFundDrawerRow(id)`（刷新抽屉内该行的单选状态）。

---

## 八、`main.js` 变化

新增 import 和 window 挂载：

```javascript
import { openFundDrawer, closeFundDrawer } from './aw/monitor.js';
import { openStaleDialog, closeStaleDialog, redeemStalePosition } from './aw/stale-positions.js';

Object.assign(window, {
  openFundDrawer, closeFundDrawer,
  openStaleDialog, closeStaleDialog, redeemStalePosition,
  toggleAwAlt,  // 仍保留（抽屉行的单选按钮调用）
  ...
});
```

`refreshAwTypeBadges` 从 window 挂载和 monitor.js 导出中移除。

---

## 九、文件变更清单

| 文件 | 变更说明 |
|------|---------|
| `js/aw/monitor.js` | `_getAwPoolDef()` 改为 7 行；`_labelBadge` 改回静态；新增抽屉构建/开关函数；`refreshAwTypeBadges` 移除；新增 `refreshStaleChip` 调用 |
| `js/aw/calc.js` | 持仓读取改为 `getAwDynAmt(getActiveAsset(a).code)` |
| `js/aw/inputs.js` | `toggleAwAlt` 更新：toast 警告 + 刷新抽屉行，不再调用 `refreshAwTypeBadges` |
| `js/aw/stale-positions.js` | 新建：`getStalePositions`、`refreshStaleChip`、`openStaleDialog`、`closeStaleDialog`、`redeemStalePosition` |
| `strategy_page.html` | 添加抽屉 HTML、未赎回弹窗 HTML；section-head 加「🔀 标的调整」和「⚠ 待赎回」chip |
| `js/main.js` | 新增 import 和 window 挂载 |
| `css/aw.css` | 新增抽屉样式 `.aw-drawer-overlay`、`.aw-drawer` |

---

## 十、边界情况

| 场景 | 处理 |
|------|------|
| 无替代标的的资产 | 抽屉中该行不显示切换按钮，类型固定「主力」 |
| 监控数据未加载（无行情） | 赎回估算 fallback 为录入金额 |
| 赎回后可用金额变化 | `refreshAwTotalDisplay()` 刷新 header 总金额/可用金额显示 |
| 关闭抽屉未做任何切换 | `awInitTable()` 重建表格无害（重绘 7 行） |
| 替代标的从未录入金额 | `getAwAmt(inactiveCode) = 0`，不出现在未赎回列表 |
| 同时有多条待赎回 | 弹窗列出全部，逐条赎回，每赎回一条刷新列表；全部赎回后弹窗自动关闭 |
