# 项目重构与优化报告

> 生成日期：2026-05-10  
> 分析范围：全项目（JS ~6,500 行 / Python ~4,900 行）

---

## 优先级汇总

| 状态 | 优先级 | # | 问题 | 预估工作量 | 主要收益 |
|------|--------|---|------|-----------|---------|
| ✅ 已完成 | 🔴 P1 | 1 | `indicators/main.js` 拆分（1440行） | 3-4h | 可维护性大幅提升 |
| ✅ 已完成 | 🔴 P1 | 2 | `basic-info/main.js` 拆分（1004行） | 2-3h | 同上 |
| ✅ 已完成 | 🔴 P1 | 3 | `amounts.js` `_mktVal` 与 DOM 解耦 | 1h | 消除隐性时序 bug |
| ⬜ 待处理 | 🟡 P2 | 4 | `main.js` 回调注入 → store/event 模式 | 4-6h | 架构安全，杜绝遗漏注入 |
| ⬜ 待处理 | 🟡 P2 | 5 | `scraper.py` 解析器拆分（1395行） | 3-4h | 可测试性，降低改动风险 |
| ⬜ 待处理 | 🟡 P2 | 6 | `strategy.py` 计算逻辑提取到 services | 2-3h | 可测试，可复用 |
| ⬜ 待处理 | 🟡 P2 | 7 | 补充 MA60 / rebalance / amounts 单元测试 | 4-5h | 防止回归 |
| ⬜ 待处理 | 🟡 P2 | 8 | `advice.js` 渲染与逻辑分离 | 2-3h | 逻辑可测试 |
| ⬜ 待处理 | 🟢 P3 | 9 | 总金额标签更新函数提取 | 30min | 去重 |
| ⬜ 待处理 | 🟢 P3 | 10 | journal 扫描逻辑提取为共享函数 | 30min | 去重 |
| ⬜ 待处理 | 🟢 P3 | 11 | SSE 重连机制 | 1h | 健壮性 |
| ⬜ 待处理 | 🟢 P3 | 12 | `_rowSnapshots` 清理 | 15min | 防内存泄漏 |
| ⬜ 待处理 | 🟢 P3 | 13 | BaoStock 重连加锁 | 1h | 并发安全 |
| ⬜ 待处理 | 🟢 P3 | 14 | 指标 TTL 配置化 | 1h | 可维护 |
| ⬜ 待处理 | 🟢 P3 | 15 | 添加 CSP 响应头 | 30min | 安全 |

---

## 项目概览

| 维度 | 数值 |
|------|------|
| JS 文件总量 | ~6,500 行，32 个文件 |
| Python 文件总量 | ~4,900 行，12 个文件 |
| 超 300 行大文件 | 5 个 |
| 自动化测试覆盖 | 仅 2 个 Python 解析器测试 |

### 关键目录结构

```
investment/
├── main.py                      # FastAPI 入口 (405行)
├── session.py                   # BaoStock 会话管理 (294行)
├── routers/                     # API 路由层
│   ├── strategy.py              # 策略计算 + 接口 (550行) ⚠️
│   ├── cache.py                 # 本地 JSON 缓存 (409行)
│   ├── indicators.py            # 指标接口 (440行)
│   └── ...（其余 7 个路由）
├── services/
│   ├── scraper.py               # 指标爬虫 (1395行) ⚠️
│   └── ...
└── js/
    ├── main.js                  # 全局初始化 + 依赖注入 (108行)
    ├── indicators/main.js       # 指标看板 (1440行) ⚠️
    ├── basic-info/main.js       # 宏观数据可视化 (1004行) ⚠️
    ├── mdtfr/                   # 动量趋势双滤网策略
    │   ├── advice.js            # 建议生成 + 渲染 (533行) ⚠️
    │   ├── amounts.js           # 持仓金额管理 (256行)
    │   ├── available.js         # 可用金额管理 (288行)
    │   └── ...（其余 10 个模块）
    └── aw/                      # 全天候策略
        └── ...（8 个模块）
```

---

## 问题清单与建议

---

### 🔴 P1 — 高优先级

---

#### 1. `js/indicators/main.js` 拆分（1440 行）

**问题：** 数据加载、图表渲染、卡片构建、crosshair 插件、区间切换全部集中在一个文件，职责混乱，难以维护和扩展。

**建议拆分结构：**
```
js/indicators/
├── main.js          # 入口，只做初始化 + 事件绑定 (~80行)
├── state.js         # _chartRange、fedRateData、cnStockData 等模块状态
├── charts.js        # Fed利率图 + 中国股市图 + syncedCrosshair插件
├── cards.js         # 各指标卡片 HTML 构建函数（renderIndicatorCard等）
└── signals.js       # 买卖信号计算与渲染
```

**收益：** 每个文件职责单一，新增指标卡片只需修改 `cards.js`，图表逻辑不受影响。

---

#### 2. `js/basic-info/main.js` 拆分（1004 行）

**问题：** 宏观数据多个 section（货币供应、利率、贸易差额等）的渲染逻辑全部内联，结构与 indicators/main.js 同一问题。

**建议拆分结构：**
```
js/basic-info/
├── main.js
└── charts/
    ├── money-supply.js    # M1/M2/M0 图表
    ├── rates.js           # 存贷款利率图表
    └── trade-balance.js   # 贸易数据图表
```

---

#### 3. `js/mdtfr/amounts.js` — `_mktVal` 填充与 DOM 更新解耦

**问题：** `refreshAmtPnl`（第 214 行）在 DOM 元素不存在时提前 return，导致 `_mktVal` 不被填充，P&L 计算链断链。这是 `总收益` 显示 +¥0 bug 的根本原因（已用 `hasMktVal` guard 解决了症状，但根源未修复）。

```javascript
// 当前代码（问题所在）
const inp = document.getElementById(`mdtfr-amt-input-${c}`);
if (!inp) return;           // ← DOM 不存在时，_mktVal 永远不被填充
if (shares > 0) {
  _mktVal[c] = ...;
}
```

**建议：** 将数据填充与 DOM 更新分离，数据填充不依赖 DOM 存在：
```javascript
// 修复后
if (shares > 0) {
  _mktVal[c] = Math.round(shares * item.latest_close);  // 先填数据
  anyUpdated = true;
}
const inp = document.getElementById(`mdtfr-amt-input-${c}`);
if (inp) {
  // 再更新 DOM（可以失败，不影响数据）
  if (cost > 0) { ... inp.style.color = clr; }
}
```

**收益：** 即使表格尚未渲染完，市值数据也能正确填充，消除一类隐性时序 bug。

---

### 🟡 P2 — 中优先级

---

#### 4. `js/main.js` — 回调注入反模式（脆弱的依赖注入）

**问题：** `main.js` 手动注入 9 个回调来打破循环依赖，漏掉任何一个都会产生无声的 bug，且随功能增加难以维护：

```javascript
setJournalSaver(saveJournalRecord);
setAdviceRenderer(mdtfrRenderAdvice);
setAdviceRerenderer((items) => { ... });
setRowConfirmJournalSaver(saveJournalRecord);
setAvailableToastFn(showToast);
setAvailableRefreshFn(refreshAllPosPct);
setAvailableAdviceRenderer(mdtfrRenderAdvice);
setAvailableItemsGetter(getLastMdtfrItems);
setRefreshPnlDisplayFn(refreshPnlDisplay);
```

**建议方案（选一）：**

- **方案 A（推荐）：** 提取 `js/mdtfr/store.js` 单向状态中心，所有模块从 store 读写状态，从根源消除循环依赖。
- **方案 B（轻量）：** 使用 `EventTarget` / `CustomEvent` 做松耦合通知，各模块监听事件而非持有回调引用。

---

#### 5. `services/scraper.py` 拆分（1395 行）

**问题：** 30+ 个指标的解析逻辑全部堆在一个文件中，新增指标、修改解析逻辑时改动范围大，且无法对单个解析器写单元测试。

**建议重构为解析器注册表模式：**
```
services/
├── scraper.py              # 通用抓取引擎（不含解析逻辑）
└── parsers/
    ├── __init__.py         # 注册表：PARSER_REGISTRY = { 'a_share_pe': ..., }
    ├── valuation.py        # A股PE、沪深300、中证500 PE/PB
    ├── liquidity.py        # Shibor、国债收益率、M1/M2
    ├── macro.py            # CPI、PPI、BDI
    └── global_rates.py    # 美债收益率、利差
```

每个解析函数签名统一为 `parse(html: str) -> dict`，便于独立单元测试。

---

#### 6. `routers/strategy.py` — 计算逻辑与 API 层分离（550 行）

**问题：** MA60 趋势计算、All-Weather 资产漂移计算、MDTFR 排名算法等纯业务逻辑直接写在 FastAPI handler 函数中，无法单测，也难以复用。

**建议：** 提取 `services/strategy_calc.py`：
```python
# services/strategy_calc.py
def calc_aw_drift(holdings, targets, current_prices): ...
def calc_mdtfr_rank(pool, closes, ma60): ...
def detect_market_mode(indices): ...

# routers/strategy.py 只保留 HTTP 层
@router.get("/api/strategy/all-weather")
async def get_aw_strategy(...):
    data = await run_bs(lambda: calc_aw_drift(...))
    return JSONResponse(data)
```

---

#### 7. 补充关键业务逻辑的单元测试

**问题：** 目前只有 2 个解析器测试文件，核心业务逻辑（MA60、再平衡日期、持仓计算）无任何自动化测试保障。

**建议补充测试（按优先级）：**

| 优先级 | 测试目标 | 文件 |
|--------|---------|------|
| 高 | MA60 趋势判断边界条件（恰好等于 MA60、连续 N 日突破）| `test_strategy_calc.py` |
| 高 | `rebalance-day.js` 双周再平衡日期计算（DST、跨月） | `test_rebalance_day.js` |
| 中 | `amounts.js` `getDynAmt` / `getPosVal` 计算 | `test_amounts.js` |
| 中 | `cache.py` upsert-by-date 逻辑（重复日期覆盖、月份边界） | `test_cache.py` |
| 低 | `scraper.py` 各指标解析器（拆分后每个单独测） | `tests/parsers/` |

---

#### 8. `js/mdtfr/advice.js` — 渲染与逻辑分离（533 行）

**问题：** 市场模式检测、标的排名算法、HTML 渲染三件事混在同一文件，400+ 行为字符串拼接渲染逻辑。

**建议拆分：**
```
js/mdtfr/
├── advice-logic.js    # 市场模式判断、排名算法、买卖信号生成（纯函数）
└── advice-render.js   # 接收逻辑结果，输出 HTML 字符串
```

纯函数化的 `advice-logic.js` 可以直接单元测试，不依赖 DOM。

---

### 🟢 P3 — 低优先级

---

#### 9. 重复代码：总金额标签更新逻辑

**问题：** `onAmtChange`、`clearAmt`、`refreshAmtPnl` 中各有一份相同的代码：
```javascript
const totalEl = document.getElementById('mdtfr-total-amt');
if (totalEl) {
  const t = _getTotalAmtFn();
  totalEl.textContent = t > 0 ? `总金额：¥${t.toLocaleString()}` : '';
}
```

**建议：** 在 `amounts.js` 中提取为私有函数 `_updateTotalLabel()`。

---

#### 10. 重复代码：6 个月 journal 扫描逻辑

**问题：** `available.js` 的 `_loadPnlDialog`（第 155 行）和 `recoverFromJournal`（第 104 行）都包含相同的月度循环 + fetch + concat 逻辑。

**建议：** 提取共享函数：
```javascript
// js/mdtfr/journal.js 或 utils.js
async function loadRecentJournalRecords(months = 6) {
  let allRecs = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    // ... 统一的 fetch 逻辑
  }
  return allRecs;
}
```

---

#### 11. SSE 连接无重连机制

**问题：** `js/mdtfr/loader.js` 中 `EventSource` 的错误处理只是关闭连接：
```javascript
source.onerror = () => source.close();  // 网络抖动时用户看到空表
```

**建议：** 加 1-2 次指数退避重连（断线 1s 后重试，再断再等 2s）。

---

#### 12. `trade-confirm.js` — `_rowSnapshots` Map 无清理

**问题：** `_rowSnapshots` 在用户确认或撤销交易后没有删除对应条目，长期使用会积累过期快照。

**建议：** 在 `confirmTradeRow` / `undoTradeRow` 的末尾加 `_rowSnapshots.delete(rowKey)`。

---

#### 13. BaoStock 并发重连竞争

**问题：** `session.py` 在 socket 错误时标记 `_logged_in = False`，但多个并发请求同时失败时会触发多次重连，存在竞争条件。

**建议：** 在 `run_bs()` 的重连路径上加 `asyncio.Lock()`：
```python
_reconnect_lock = asyncio.Lock()

async def run_bs(fn):
    if not _logged_in:
        async with _reconnect_lock:
            if not _logged_in:  # double-check
                await _login()
    ...
```

---

#### 14. 指标 TTL 配置化

**问题：** `services/scraper.py` 中缓存过期时间硬编码在各处，而 `INDICATORS_CONFIG` 已有 `update_frequency` 字段，但未统一驱动 TTL。

**建议：** 将 TTL 映射表集中定义，`update_frequency` 直接驱动缓存过期：
```python
_TTL_MAP = { 'daily': 86400, 'weekly': 604800, 'monthly': 2592000 }
ttl = _TTL_MAP.get(config['update_frequency'], 86400)
```

---

#### 15. 安全：缺少 CSP 响应头

**问题：** `main.py` 未设置 `Content-Security-Policy` 响应头，存在 XSS 攻击面（虽然是本地工具，但习惯良好）。

**建议：** 在 FastAPI middleware 中添加：
```python
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'"
    return response
```

---

## 建议执行路径

```
阶段一（降低维护负担）
  ├── #3  amounts.js _mktVal 解耦      ← 小改动，消除一类 bug
  ├── #9  总金额标签函数提取            ← 顺手做
  └── #10 journal 扫描函数提取          ← 顺手做

阶段二（拆分大文件）
  ├── #1  indicators/main.js 拆分
  └── #2  basic-info/main.js 拆分

阶段三（架构优化）
  ├── #5  scraper.py 解析器拆分
  ├── #6  strategy.py 计算逻辑提取
  ├── #7  补充单元测试
  └── #8  advice.js 渲染与逻辑分离

阶段四（架构重构）
  └── #4  main.js 回调注入 → store 模式  ← 改动最大，放最后

零散（随时可做）
  ├── #11 SSE 重连
  ├── #12 _rowSnapshots 清理
  ├── #13 BaoStock 重连加锁
  ├── #14 TTL 配置化
  └── #15 CSP 响应头
```
