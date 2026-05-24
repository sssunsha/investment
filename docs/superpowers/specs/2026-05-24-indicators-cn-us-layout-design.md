# 宏观指标页面重构设计 — 中美双市场双栏布局

**日期**: 2026-05-24  
**项目**: investment / indicators page  
**方案**: 方案 A — `market` 字段标注 + 前端双栏重组 + 新增美国/全球指标

---

## 1. 背景与目标

### 问题
当前 `/indicators` 页面按功能分为四个扁平大类（市场估值、利率流动性、宏观经济、全球定价），中美指标混排，没有市场归属感，分析逻辑不清晰。

### 目标
1. 将页面重组为**中美双栏并排**布局，每栏内部按**决策链**（宏观环境 → 流动性 → 市场估值）排列
2. 底部设**全宽全球指标**区块（BDI、黄金、原油、美元指数）
3. 补充约 12 个缺失的美国宏观/估值指标和全球商品指标

---

## 2. 页面布局

```
┌─────────────────────────────────────────────────────────────┐
│  综合信号面板 Signal Panel（全宽，保留现有）                    │
├──────────────────────────┬──────────────────────────────────┤
│  🇨🇳 中国市场              │  🇺🇸 美国市场                     │
│  ── 宏观环境 ──            │  ── 宏观环境 ──                    │
│  CPI / PPI / PMI          │  CPI / PCE / ISM PMI             │
│                           │  非农就业 / 失业率                  │
│  ── 利率流动性 ──           │  ── 利率流动性 ──                  │
│  Shibor / 国债(1/5/10Y)   │  联邦基金利率 / 美债(2/5/10/30Y)   │
│  M1/M2 / M2GDP / 融资余额  │  2Y-10Y利差 / 美联储资产负债表      │
│                           │                                  │
│  ── 市场估值 ──             │  ── 市场估值 ──                    │
│  A股PE / 沪深300 PE/PB    │  标普500 PE / 席勒CAPE            │
│  中证500 PE/PB / 股债比    │  美股巴菲特指标 / VIX              │
│  巴菲特指标(A股) / 恒生PE   │                                  │
├──────────────────────────┴──────────────────────────────────┤
│  🌍 全球指标（全宽）                                           │
│  BDI / 黄金 / 原油WTI / 美元指数DXY                           │
└─────────────────────────────────────────────────────────────┘
```

**响应式**：屏幕宽度 ≤ 900px 时双栏降级为单列垂直堆叠，中国在上美国在下。

---

## 3. 指标清单

### 3.1 中国市场（market: "cn"）

| 决策链层级 | 指标 key | 指标名称 | 状态 | 数据源 |
|-----------|----------|----------|------|--------|
| 宏观环境 | `cpi` | CPI 消费者物价指数 | ✅ 已有 | value500.com |
| 宏观环境 | `ppi` | PPI 生产者物价指数 | ✅ 已有 | value500.com |
| 宏观环境 | `cn_pmi` | PMI 制造业/非制造业 | 🆕 新增 | value500.com |
| 流动性 | `shibor` | Shibor 利率 | ✅ 已有 | value500.com |
| 流动性 | `cn_10y_bond` | 中国国债收益率（1/5/10Y）| ✅ 已有 | value500.com |
| 流动性 | `m1_m2` | M1/M2 增速 | ✅ 已有 | value500.com |
| 流动性 | `m2_gdp` | M2/GDP 比值 | ✅ 已有 | value500.com |
| 流动性 | `financing_balance` | 融资余额 | ✅ 已有 | value500.com |
| 估值 | `a_share_pe` | A股平均市盈率 | ✅ 已有 | value500.com |
| 估值 | `csi300_pe_pb` | 沪深300 PE/PB | ✅ 已有 | value500.com |
| 估值 | `csi500_pe_pb` | 中证500 PE/PB | ✅ 已有 | value500.com |
| 估值 | `stock_bond_ratio` | 股债收益率比 | ✅ 已有 | value500.com |
| 估值 | `buffett_index` | 巴菲特指标（A股）| ✅ 已有 | value500.com |
| 估值 | `hsi_pe` | 恒生指数PE | ✅ 已有 | value500.com |

### 3.2 美国市场（market: "us"）

| 决策链层级 | 指标 key | 指标名称 | 状态 | 数据源 |
|-----------|----------|----------|------|--------|
| 宏观环境 | `us_cpi` | 美国CPI（同比）| 🆕 新增 | FRED: `CPIAUCSL` |
| 宏观环境 | `us_pce` | 美国核心PCE | 🆕 新增 | FRED: `PCEPILFE` |
| 宏观环境 | `us_pmi` | ISM 制造业PMI | 🆕 新增 | FRED: `NAPM` |
| 宏观环境 | `us_payrolls` | 非农就业（月增）| 🆕 新增 | FRED: `PAYEMS` |
| 宏观环境 | `us_unrate` | 美国失业率 | 🆕 新增 | FRED: `UNRATE` |
| 流动性 | `us_fedfunds` | 联邦基金利率 | 🆕 新增为独立指标卡片（现在仅存在于图表中，需加入 INDICATORS_CONFIG）| FRED: `FEDFUNDS` |
| 流动性 | `us_treasury` | 美债收益率（2/5/10/30Y）| ⚠️ 重分类：`category: "global"` → `market: "us"`, `layer: "liquidity"` | value500.com / FRED |
| 流动性 | `us_fed_balance` | 美联储资产负债表 | 🆕 新增 | FRED: `WALCL` |
| 估值 | `us_sp500_pe` | 标普500 PE / 席勒CAPE | 🆕 新增 | multpl.com |
| 估值 | `us_buffett` | 美股巴菲特指标 | 🆕 新增 | FRED: `WILL5000IND` + GDP |
| 估值 | `vix` | VIX 恐慌指数 | 🆕 新增 | Yahoo Finance: `^VIX` |

### 3.3 全球指标（market: "global"）

| 指标 key | 指标名称 | 状态 | 数据源 |
|----------|----------|------|--------|
| `bdi` | BDI 波罗的海指数 | ⚠️ 重分类：`category: "macroeconomic"` → `market: "global"`（同时加 `market` 字段）| value500.com |
| `gold` | 黄金价格（USD/oz）| 🆕 新增 | Yahoo Finance: `GC=F` |
| `crude_oil` | 原油价格 WTI（USD/桶）| 🆕 新增 | Yahoo Finance: `CL=F` |
| `dxy` | 美元指数 DXY | 🆕 新增 | Yahoo Finance: `DX-Y.NYB` |

---

## 4. 后端变更

### 4.1 INDICATORS_CONFIG 加 market 字段

所有现有 15 个指标加 `market: 'cn' | 'us' | 'global'` 字段，`category` 字段保留不动（向后兼容）。

### 4.2 新增指标配置结构

```python
"us_cpi": {
    "name": "美国CPI",
    "name_en": "US CPI YoY",
    "market": "us",
    "category": "macroeconomic",
    "update_frequency": "monthly",
    "source": "fred",
    "fred_series": "CPIAUCSL",
    "thresholds": {
        "low":    {"value": 2.0, "label": "通胀偏低", "color": "blue"},
        "normal": {"value": 3.0, "label": "温和通胀", "color": "green"},
        "high":   {"value": 4.0, "label": "高通胀压力", "color": "red"},
    },
}
```

### 4.3 新增抓取函数

| 函数 | 用途 |
|------|------|
| `async_fetch_fred_series(series_id, freq)` | 通用 FRED API 抓取，复用现有 `async_fetch_us_rates_history` 模式 |
| `async_fetch_yahoo(ticker)` | Yahoo Finance 抓取最新价 + 近期历史（黄金/原油/DXY/VIX）|
| `async_scrape_multpl(url)` | 爬取 multpl.com 标普500 PE / 席勒CAPE |

### 4.4 API 响应扩展

`GET /api/indicators` 在现有 `data`（按 category 分组）之外，**新增 `by_market` 字段**：

```json
{
  "data": { ...现有结构，不变... },
  "by_market": {
    "cn":  { "macro": [...], "liquidity": [...], "valuation": [...] },
    "us":  { "macro": [...], "liquidity": [...], "valuation": [...] },
    "global": [...]
  }
}
```

`data` 字段完全保留，不破坏任何现有逻辑。

### 4.5 决策链层级映射

在 `scraper.py` 中维护一个映射表，将现有 `category` 映射到决策链层级：

```python
LAYER_MAP = {
    "macroeconomic": "macro",
    "liquidity":     "liquidity",
    "market_valuation": "valuation",
    "global":        None,  # global 指标不分层
}
```

新增指标直接在 config 中标注 `layer: "macro" | "liquidity" | "valuation"`。

---

## 5. 前端变更

### 5.1 新增 CSS（indicators.css）

```css
.market-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 32px;
}
.market-column-header { /* 🇨🇳/🇺🇸 标题 + 国旗 */ }
.layer-separator { /* 宏观/流动性/估值 分层标题 */ }

@media (max-width: 900px) {
  .market-columns { grid-template-columns: 1fr; }
}
```

### 5.2 cards.js 新增函数

- `renderMarketColumn(market, layers)` — 渲染单个市场列，内部按决策链分层
- `renderGlobalSection(indicators)` — 渲染全宽全球指标区块
- 现有 `renderCategorySection` / `renderIndicatorCard` 保留，被新函数复用

### 5.3 main.js 渲染入口更新

`renderIndicatorsPage` 改为读取 `by_market` 渲染双栏；保留 `data` 字段的读取逻辑作为降级备用。

### 5.4 INDICATOR_METADATA 补充（cards.js）

为 12 个新增指标补充阈值含义配置，格式与现有一致。关键指标含义说明：

- **VIX > 30**：历史级别恐慌，逆向买入参考
- **美股CAPE > 30**：历史均值 ~17，高于 30 为显著高估
- **美联储资产负债表**：QE/QT 周期判断，影响全球流动性
- **DXY 强弱**：美元强势 → 新兴市场资金外流压力

### 5.5 信号逻辑扩展（signals.js + scraper.py）

新增美国维度信号：
- VIX > 30 → 恐慌信号（逆向参考）
- 美债 2Y-10Y 利差 < -20bp → 衰退预警（已有，继续保留）
- 美国CPI > 4% 且趋势上行 → 美联储紧缩 → 新兴市场资金外流风险
- 美联储资产负债表快速收缩（QT）→ 全球流动性收紧

---

## 6. 新增依赖

| 依赖 | 用途 | 安装 |
|------|------|------|
| `yfinance` | Yahoo Finance 数据（黄金/原油/DXY/VIX）| `pip install yfinance` |

FRED API 无需 API Key（使用公开 JSON 接口），multpl.com 使用现有 BeautifulSoup 爬虫。

---

## 7. 不在本次范围内

- 欧洲市场指标（欧央行利率、欧洲PMI 等）
- 日本市场指标
- 中美利差联动分析面板（可作下一期方案 C）
- 人民币汇率指标
- 各指标历史趋势迷你图（sparkline）
