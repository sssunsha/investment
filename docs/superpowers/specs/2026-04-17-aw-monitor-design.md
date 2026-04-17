# 全天候标的监控功能设计文档

**日期：** 2026-04-17
**状态：** 待实现

---

## 一、背景与目标

在 `/strategy#aw` 页面（全天候配置）的计算器上方，新增一个"全天候标的监控"区块，显示全天候策略所有标的（主力 + 替代，共14行）的近期动量、均线状态，辅助用户在执行再平衡前判断各资产趋势。

对标 `/strategy#mdtfr` 中的"标的池动量监控"，采用完全平行的架构。

---

## 二、显示内容

### 标的列表（14行 = 7资产类别 × 主力/替代）

| 资产类别 | 主力基金 | 主力代码 | 替代基金 | 替代代码 |
|---------|---------|---------|---------|---------|
| 股票-大盘 | 华泰柏瑞沪深300ETF联接A | 460300 | 天弘沪深300ETF联接A | 000961 |
| 股票-中盘 | 易方达中证500ETF联接A | 007028 | 华夏中证500ETF联接A | 001052 |
| 长期债券-国开 | 南方中债7-10年国开行债券指数A | 006961 | 汇添富中债7-10年国开行债券指数A | 008054 |
| 长期债券-农发 | 博时中债5-10年农发行债券指数A | 006848 | 上银中债5-10年国开行债券指数A | 013138 |
| 中期债券 | 南方中债3-5年农发行债券指数A | 006493 | 长城中债3-5年期国债指数A | 009324 |
| 黄金 | 华安黄金易ETF联接A | 000216 | 博时黄金ETF联接A | 002610 |
| 大宗商品 | 国泰大宗商品(QDII-LOF)A | 160216 | 中信保诚全球商品主题(QDII-FOF-LOF)A | 165513 |

### 表格列（8列）

| 列名 | 说明 |
|-----|------|
| 类别 | 资产组别 badge（股票 / 债券 / 黄金 / 商品），使用 ASSET_COLORS |
| 类型 | 主力 / 替代 badge |
| 基金名称 | 联接基金全名 |
| 代码 | 场外联接基金代码（展示用） |
| 近30日 | 涨跌幅，红涨绿跌，格式 +3.12% |
| 收盘价 | 最新收盘（场内 ETF 价格） |
| vs MA20 | ✓绿（收盘 > MA20）/ ✗红（收盘 ≤ MA20），显示 MA20 值 |
| MA60趋势 | 趋势向好 / 持续下行 / 未达标 / N/A，带变化率 |

---

## 三、架构

### 新增/修改文件

```
新增：
  js/aw/monitor.js              — 表格渲染 + SSE 加载 + 缓存逻辑
  （css/mdtfr.css 中的 .data-table 等类名可直接复用，无需新增 CSS）

修改：
  js/aw/config.js               — 每只基金补充 baostock_code 字段
  routers/strategy.py           — 新增 /api/strategy/aw-pool/stream SSE 端点
  strategy_page.html            — panel-aw 内新增监控区块 HTML
```

### 数据流

```
页面加载（awMaybeInitEmpty）
  → awInitTable()：渲染14行骨架屏
  → 读 localStorage aw_pool_cache
      ├─ 缓存完整且为今日 → awFillRow() × 14 → 完成
      └─ 缓存不完整/过期 → loadAwPool()
           → SSE /api/strategy/aw-pool/stream
               → type=item → awFillRow() + 写缓存（逐行）
               → type=done → toggleAwSort() 触发排序
```

---

## 四、后端端点

### `GET /api/strategy/aw-pool/stream`

与 `/api/strategy/mdtfr-pool/stream` 完全平行的 SSE 端点。

**数据窗口：** `start_date = today - 180天`（确保 ≥66 交易日供 MA60 使用）

**每只基金计算：**
- `ret_30d = (closes[-1] / closes[-31] - 1)`（需 ≥31 条数据）
- `ma20 = mean(closes[-20:])`，`above_ma20 = closes[-1] > ma20`
- `ma60, ma60_rising, ma60_rate, ma60_trend = _calc_ma60(closes)`（复用现有函数）

**SSE item 字段：**

```python
{
  "type": "item",
  "id": "hs300",           # 来自 PORTFOLIO 的资产 id
  "label": "主力",          # "主力" or "替代"
  "group": "stock",         # group 值，供前端映射颜色
  "name": "华泰柏瑞沪深300ETF联接A",
  "code_c": "460300",       # 场外联接代码（展示）
  "baostock_code": "sh.510300",  # 查询用
  "latest_close": 4.723,
  "ret_30d": 0.0312,
  "ma20": 4.651,
  "above_ma20": True,
  "ma60": 4.589,
  "ma60_rising": True,
  "ma60_trend": "趋势向好",
  "ma60_rate": 0.42,
  "error": None
}
```

**无场内对应时：** 直接推送 `error: "暂无场内价格数据"`，跳过 BaoStock 查询。

### BaoStock 代码映射

需在 `js/aw/config.js` 的每条 PORTFOLIO 记录（主力 + 替代）中补充 `baostock_code` 字段，后端从该字段读取。同一指数的主力和替代共用同一 BaoStock 代码。

| 资产 | 主力代码 | 替代代码 | BaoStock 代码 | 备注 |
|-----|---------|---------|--------------|------|
| 沪深300 | 460300 | 000961 | sh.510300 | 场内 ETF |
| 中证500 | 007028 | 001052 | sh.512500 | 场内 ETF |
| 国开债7-10年 | 006961 | 008054 | sh.511260 | 国开 ETF，实现时确认 |
| 农发/国开债5-10年 | 006848 | 013138 | sh.511170 | 债券 ETF，实现时确认 |
| 农发/国债3-5年 | 006493 | 009324 | sh.511130 | 债券 ETF，实现时确认 |
| 黄金 | 000216 | 002610 | sh.518880 | 黄金 ETF |
| 大宗商品 QDII | 160216 | 165513 | sz.160216 / sz.165513 | LOF 场内代码，实现时验证 |

> **注：** 债券 ETF 的 BaoStock 代码需在实现阶段通过 BaoStock 查询接口验证。若某代码查询失败，回退到 `error: "数据暂不支持"`。

---

## 五、前端组件（js/aw/monitor.js）

### 导出函数

| 函数 | 说明 |
|-----|------|
| `awMaybeInitEmpty()` | 页面初始化入口：渲染骨架屏 + 尝试加载缓存 |
| `awInitTable()` | 渲染14行骨架屏占位 |
| `loadAwPool()` | 主加载入口：读缓存 → SSE 流式加载 |
| `awFillRow(item)` | 填充单行数据 |
| `clearAndResetAw()` | 清除 localStorage 缓存 + 重置 UI 为骨架屏 |
| `toggleAwSort()` | 切换排序：近30日涨跌幅降序 ↔ 资产类别原始顺序 |

### 缓存策略

- **Key：** `aw_pool_cache`（localStorage）
- **格式：** `{ date: "YYYY-MM-DD", items: [...] }`
- **有效期：** 当日有效，次日视为过期（与 mdtfr 一致）
- **写入时机：** 每收到一条 SSE item 立即写入（逐行写入缓存）

---

## 六、HTML 结构（strategy_page.html）

在 `panel-aw` 内，计算器区块（`#aw-calc-section`）之前插入监控区块：

```html
<!-- 全天候标的监控 -->
<div class="section-card" id="aw-monitor-section">
  <div class="section-header">
    <span class="section-title">全天候标的监控</span>
    <span id="aw-monitor-time" style="color:var(--text-dim);font-size:12px"></span>
  </div>
  <div class="btn-row">
    <button onclick="loadAwPool()" class="btn-secondary">加载数据</button>
    <button onclick="clearAndResetAw()" class="btn-secondary">清除缓存</button>
    <button onclick="toggleAwSort()" class="btn-secondary" id="aw-sort-btn">按涨跌排序</button>
  </div>
  <div class="mdtfr-table-wrap" id="aw-monitor-table-wrap">
    <!-- 由 awInitTable() 渲染 -->
  </div>
</div>
```

---

## 七、样式

复用 `css/mdtfr.css` 中的 `.data-table`、`.rank-badge`、`.mdtfr-table-wrap` 等类名，无需新增 CSS。`js/aw/config.js` 中现有的 `ASSET_COLORS` 用于类别 badge 着色。

---

## 八、排序逻辑

- **默认排序：** 按资产类别原始顺序（PORTFOLIO 定义顺序），每个类别内主力在前、替代在后
- **切换后：** 按近30日涨跌幅降序，无数据行排最后
- 按钮文字随状态切换："按涨跌排序" / "按原始顺序"

---

## 九、边界情况

| 情况 | 处理 |
|-----|------|
| BaoStock 查询失败 | 该行显示错误信息，不影响其他行 |
| 数据不足31条（ret_30d） | `ret_30d = null`，显示 "–" |
| 数据不足60条（MA60） | `ma60_rising = null`，趋势列显示 "N/A" |
| 大宗商品 LOF 无法查询 | `error: "暂无场内价格数据"`，整行灰显 |
| 加载中断 | 已填充行保留，未填充行保持骨架屏 |
