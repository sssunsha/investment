# 设计文档：MDTFR 表格内联 K 线图浮层

## 背景

在 `/strategy#mdtfr` 的标的池动量监控表格中，为每行新增 radio button，选中后在表格中间列区域（「20日均量」→「份额」）上方显示该标的对应场内 ETF 的 K 线图浮层，方便在看动量数据的同时直接查看走势图。

---

## 数据来源

新浪静态 K 线图片，URL 格式：

```
https://image.sinajs.cn/newchart/{period}/n/{exchange}{etf_code}.gif
```

- `period`：`daily`（日K）/ `weekly`（周K）/ `monthly`（月K）
- `exchange`：ETF 代码以 `1` 开头 → `sz`；以 `5` 开头 → `sh`
- `etf_code`：来自 `getMdtfrPoolDef()` 的 `etf` 字段（6位数字）

**所有 22 只 ETF 的正确前缀：**

| 代码前缀 | 交易所 | 示例 |
|---------|--------|------|
| 15xxxx / 56xxxx | sz（深交所） | 159915, 560080 |
| 51xxxx / 58xxxx / 518xxx | sh（上交所） | 512480, 588080, 518880 |

规则：`etf.startsWith('1') || etf.startsWith('56') ? 'sz' : 'sh'`

---

## UI 设计

### 1. Radio Button 列

- 在表格 `<thead>` 最前面新增一列空白表头（无文字，宽 32px）
- 每行 `<tr>` 最前面新增 `<td>` 内含 radio input，`name="kline-select"`，`value={code_c}`
- 样式：小圆形，选中时变绿色高亮
- 再次点击已选中的 radio → 取消选中，浮层消失（通过 `click` 事件判断 `checked` 实现 toggle）

### 2. K 线图浮层

**定位：**
- 浮层容器 `position: absolute`，挂载在 `.mdtfr-table-wrap`（已有，设为 `position: relative`）
- 左边界：对齐「20日均量」列（第 4 列，列序 index 3）的左边缘
- 右边界：对齐「份额」列（第 13 列）的右边缘
- 通过 JS 在首次显示时用 `getBoundingClientRect()` 计算并设置 `left` / `width`
- 垂直方向：`top: 0`，向下覆盖表格内容区，高度固定 `320px`
- `z-index: 10`，`overflow: hidden`

**浮层内容（从上到下）：**

```
┌──────────────────────────────────────────────────┐
│ [标的名称] [ETF代码]      [日K][周K][月K]  [×]  │
│                                                  │
│  新浪 K 线图片（CSS裁白边 + 等比放大）           │
│                                                  │
└──────────────────────────────────────────────────┘
```

- 标题行：左侧显示基金名 + ETF 代码（灰色小字）；右侧周期切换按钮组 + 关闭按钮
- 图片区：CSS 裁去白边（`object-position: -19px -4px`，`object-fit: none`，父容器 `overflow: hidden`），撑满浮层宽度
- 背景：`rgba(15,17,23,0.96)` + `backdrop-filter: blur(4px)`，与现有暗色主题一致
- 边框：`1px solid var(--border)`，`border-radius: 8px`

**图片 CSS 裁剪方案（方案2效果）：**

原始图片尺寸 545×300，白边：top=4px, bottom=2px, left=19px, right=15px。
内容区 511×294。

```css
.kline-img-wrap {
  overflow: hidden;
  position: relative;
  /* 宽度由父容器决定，高度按比例 294/511 */
  padding-bottom: calc(294 / 511 * 100%);
  height: 0;
}
.kline-img-wrap img {
  position: absolute;
  /* 偏移白边，等比放大至父容器宽度 */
  top: calc(-4px * (100vw / 511));   /* 运行时用 JS 计算实际px */
  left: calc(-19px * (100vw / 511));
  width: calc(545 / 511 * 100%);
  height: auto;
}
```

实际实现：JS 在图片 `onload` 后用容器宽度计算 scale，再设置 `top`/`left`/`width` 的实际像素值。

### 3. 关闭方式

- 点击浮层右上角「×」按钮
- 点击同一 radio（toggle 逻辑）
- 点击另一行 radio（切换到新标的）

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `js/mdtfr/table.js` | thead 新增空白列；每行新增 radio td；`.mdtfr-table-wrap` 加 `position:relative` |
| `js/mdtfr/kline-overlay.js` | 新文件：浮层 DOM 创建、定位计算、图片 URL 生成、周期切换、开/关逻辑 |
| `css/mdtfr.css` | 浮层及 radio 样式 |

---

## 不改动范围

- `config.js`、`amounts.js`、`advice.js`、`trade-confirm.js` 不涉及
- 现有 tooltip（`mdtfr-code-tooltip`）逻辑不变
- 现有排序、行高亮逻辑不变

---

## 验证标准

1. 表格每行最前面有 radio button
2. 点击 radio → 浮层出现在「20日均量」至「份额」列上方，显示对应 ETF 日K图
3. 日K / 周K / 月K 切换按钮正常工作
4. 点击「×」或同一 radio → 浮层消失
5. 切换到另一标的 → 浮层更新内容
6. 所有 22 只 ETF 图片均可正确加载（sh/sz 前缀无误）
7. 浮层不遮挡表格左侧的排名/名称/涨跌列
