# 全天候标的监控 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "全天候标的监控" table to the AW page showing 14 funds (7 asset classes × primary + alt) with 30-day return, close/MA20 status, and MA60 trend via SSE streaming with localStorage caching.

**Architecture:** New SSE endpoint `/api/strategy/aw-pool/stream` mirrors `mdtfr-pool/stream`. New `js/aw/monitor.js` handles table rendering + SSE loading + caching. New cache endpoints `/api/cache/aw-pool/{date}` store data in `aw_pool.json`. HTML + main.js + tab.js wired up last.

**Tech Stack:** Python/FastAPI (SSE), BaoStock, vanilla JS (ES modules), localStorage cache via REST API.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `js/aw/config.js` | Modify | Add `baostock_code` to each PORTFOLIO primary + alt entry |
| `routers/cache.py` | Modify | Add `/api/cache/aw-pool/{date}` GET/PUT/DELETE endpoints |
| `routers/strategy.py` | Modify | Add `AW_POOL_FUNDS` list + `/api/strategy/aw-pool/stream` SSE endpoint |
| `js/aw/monitor.js` | Create | Table rendering, SSE loader, cache helpers, sort toggle |
| `strategy_page.html` | Modify | Insert monitor section in `panel-aw` before the calculator card |
| `js/main.js` | Modify | Import monitor functions, expose globals, call `awMaybeInitEmpty()` in init |
| `js/tab.js` | Modify | Call `awMaybeInitEmpty()` when switching to `aw` tab |

---

## Task 1: Verify bond ETF BaoStock codes

Bond ETFs need manual verification before coding — BaoStock doesn't document all available codes.

**Files:**
- No code changes in this task

- [ ] **Step 1: Run a quick BaoStock probe**

Open a Python shell in the project virtualenv and run:

```python
import baostock as bs
bs.login()

# Test each candidate bond code
test_codes = ["sh.511260", "sh.511170", "sh.511130"]
from datetime import datetime, timedelta
end = datetime.now().strftime('%Y-%m-%d')
start = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')

for code in test_codes:
    rs = bs.query_history_k_data_plus(code, "date,close", start_date=start, end_date=end, frequency="d", adjustflag="2")
    rows = []
    while rs.error_code == '0' and rs.next():
        rows.append(rs.get_row_data())
    print(f"{code}: error={rs.error_code} rows={len(rows)} sample={rows[-1] if rows else 'NONE'}")

bs.logout()
```

- [ ] **Step 2: Record results**

Expected output (codes are valid if rows > 0):
```
sh.511260: error=0 rows=5 sample=['2026-04-17', '102.xxx']   ← 国开行债ETF 7-10年
sh.511170: error=0 rows=5 sample=['2026-04-17', '101.xxx']   ← 债券ETF 5-10年
sh.511130: error=0 rows=5 sample=['2026-04-17', '100.xxx']   ← 债券ETF 3-5年
```

If a code returns `rows=0` or `error≠0`, find an alternative:
- 7-10年国开: try `sh.511010`, `sh.511020`, `sh.511270`
- 5-10年: try `sh.511010`, `sh.511260` (fallback to same ETF)
- 3-5年: try `sh.511020`, `sh.511010`

If no working bond ETF code exists, set `"baostock_code": null` for that entry — the backend will emit `error: "暂无场内价格数据"`.

- [ ] **Step 3: Also verify LOF QDII codes**

```python
import baostock as bs
bs.login()
for code in ["sz.160216", "sz.165513"]:
    rs = bs.query_history_k_data_plus(code, "date,close", start_date=start, end_date=end, frequency="d", adjustflag="2")
    rows = []
    while rs.error_code == '0' and rs.next():
        rows.append(rs.get_row_data())
    print(f"{code}: error={rs.error_code} rows={len(rows)}")
bs.logout()
```

Note the confirmed codes for use in Task 2 and Task 3.

---

## Task 2: Add `baostock_code` to `js/aw/config.js`

**Files:**
- Modify: `js/aw/config.js`

- [ ] **Step 1: Add `baostock_code` field to each PORTFOLIO entry**

Replace the `PORTFOLIO` array in `js/aw/config.js` with this (substitute confirmed bond codes from Task 1):

```js
export const PORTFOLIO = [
  { id: 'hs300',  name: '沪深300联接A',  fullName: '华泰柏瑞沪深300ETF联接A',         code: '460300', group: 'stock',  target: 0.25, label: '股票类-大盘',    baostock_code: 'sh.510300',
    alt: { name: '天弘沪深300联接A',    fullName: '天弘沪深300ETF联接A',              code: '000961', baostock_code: 'sh.510300' } },
  { id: 'zz500',  name: '中证500联接A',  fullName: '易方达中证500ETF联接A',            code: '007028', group: 'stock',  target: 0.15, label: '股票类-中盘',    baostock_code: 'sh.512500',
    alt: { name: '华夏中证500联接A',    fullName: '华夏中证500ETF联接A',              code: '001052', baostock_code: 'sh.512500' } },
  { id: 'bond75', name: '国开债7-10年A', fullName: '南方中债7-10年国开行债券指数A',   code: '006961', group: 'bond_l', target: 0.12, label: '长期债券-国开债', baostock_code: 'sh.511260',
    alt: { name: '汇添富国开行债联接A', fullName: '汇添富中债7-10年国开行债券指数A',  code: '008054', baostock_code: 'sh.511260' } },
  { id: 'bond35', name: '农发债5-10年A', fullName: '博时中债5-10年农发行债券指数A',   code: '006848', group: 'bond_l', target: 0.12, label: '长期债券-国债',   baostock_code: 'sh.511170',
    alt: { name: '上银国开行债联接A',   fullName: '上银中债5-10年国开行债券指数A',    code: '013138', baostock_code: 'sh.511170' } },
  { id: 'bond5',  name: '农发债3-5年A',  fullName: '南方中债3-5年农发行债券指数A',    code: '006493', group: 'bond_m', target: 0.16, label: '中期债券',        baostock_code: 'sh.511130',
    alt: { name: '长城中债3-5年A',      fullName: '长城中债3-5年期国债指数A',         code: '009324', baostock_code: 'sh.511130' } },
  { id: 'gold',   name: '黄金易ETF联接A',fullName: '华安黄金易ETF联接A',              code: '000216', group: 'gold',   target: 0.10, label: '黄金',            baostock_code: 'sh.518880',
    alt: { name: '博时黄金联接A',       fullName: '博时黄金ETF联接A',                code: '002610', baostock_code: 'sh.518880' } },
  { id: 'comm',   name: '大宗商品QDII-A',fullName: '国泰大宗商品(QDII-LOF)A',        code: '160216', group: 'comm',   target: 0.10, label: '大宗商品',        baostock_code: 'sz.160216',
    alt: { name: '中信保诚全球商品A',   fullName: '中信保诚全球商品主题(QDII-FOF-LOF)A', code: '165513', baostock_code: 'sz.165513' } },
];
```

> If Task 1 found a bond code doesn't work, set `baostock_code: null` for that entry.

- [ ] **Step 2: Verify the rest of config.js is unchanged**

The `AW_ALT_KEY`, `awAltSet`, `getActiveAsset`, `ASSET_COLORS`, `CAT_GROUPS`, and guide markdown constants must be untouched. Only the `PORTFOLIO` array changed.

- [ ] **Step 3: Commit**

```bash
git add js/aw/config.js
git commit -m "feat(aw-monitor): add baostock_code to PORTFOLIO config"
```

---

## Task 3: Add AW pool cache endpoints to `routers/cache.py`

The existing pool cache uses `mdtfr_pool.json`. AW pool needs its own `aw_pool.json` to avoid data collision.

**Files:**
- Modify: `routers/cache.py`

- [ ] **Step 1: Add `_aw_pool_file` helper after line 54** (after `_pool_file` function)

```python
def _aw_pool_file(date: str) -> tuple[Path, str, str]:
    """返回 (aw_pool文件路径, year, month)"""
    year, month = _parse_date(date)
    return _month_dir(year, month) / "aw_pool.json", year, month
```

- [ ] **Step 2: Add three AW pool endpoints after the existing `pool_delete` endpoint (around line 123)**

```python
# ── AW 标的池快照 ──────────────────────────────────────────────

@router.get("/aw-pool/{date}", summary="读取指定日期AW标的池快照")
async def aw_pool_get(date: str):
    try:
        pool_path, _, _ = _aw_pool_file(date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    monthly: dict = _read_json(pool_path, {})
    if date not in monthly:
        return JSONResponse(status_code=404, content={"detail": "缓存不存在"})
    return JSONResponse(content=monthly[date])


@router.put("/aw-pool/{date}", summary="写入指定日期AW标的池快照")
async def aw_pool_put(date: str, request: Request):
    try:
        pool_path, _, _ = _aw_pool_file(date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        payload = await request.json()
        monthly: dict = _read_json(pool_path, {})
        monthly[date] = payload
        _write_json(pool_path, monthly)
        return {"ok": True, "file": str(pool_path), "date": date}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入AW缓存失败: {e}")


@router.delete("/aw-pool/{date}", summary="删除指定日期AW标的池快照")
async def aw_pool_delete(date: str):
    try:
        pool_path, _, _ = _aw_pool_file(date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    monthly: dict = _read_json(pool_path, {})
    if date not in monthly:
        return {"ok": True, "detail": "日期不存在，无需删除"}
    try:
        del monthly[date]
        _write_json(pool_path, monthly)
        return {"ok": True, "file": str(pool_path), "date": date}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除AW缓存失败: {e}")
```

- [ ] **Step 3: Verify the server restarts without errors**

```bash
# In project root, restart the server and check logs
uvicorn main:app --reload
```

Expected: no import errors, server starts on port 9001.

- [ ] **Step 4: Test the new endpoints**

```bash
TODAY=$(date +%Y-%m-%d)
# Write
curl -X PUT "http://localhost:9001/api/cache/aw-pool/$TODAY" \
  -H "Content-Type: application/json" \
  -d '[{"code_c":"460300","name":"test"}]'
# Expected: {"ok":true,...}

# Read
curl "http://localhost:9001/api/cache/aw-pool/$TODAY"
# Expected: [{"code_c":"460300","name":"test"}]

# Delete
curl -X DELETE "http://localhost:9001/api/cache/aw-pool/$TODAY"
# Expected: {"ok":true,...}
```

- [ ] **Step 5: Commit**

```bash
git add routers/cache.py
git commit -m "feat(aw-monitor): add /api/cache/aw-pool/{date} endpoints"
```

---

## Task 4: Add SSE endpoint to `routers/strategy.py`

**Files:**
- Modify: `routers/strategy.py`

- [ ] **Step 1: Add `AW_POOL_FUNDS` list after the `MDTFR_ETFS` list**

Find the end of `MDTFR_ETFS` (around line 200) and insert after it:

```python
AW_POOL_FUNDS = [
    # 股票-大盘
    {"id": "hs300",  "label": "主力", "group": "stock",  "name": "华泰柏瑞沪深300ETF联接A",              "code_c": "460300", "baostock_code": "sh.510300"},
    {"id": "hs300",  "label": "替代", "group": "stock",  "name": "天弘沪深300ETF联接A",                  "code_c": "000961", "baostock_code": "sh.510300"},
    # 股票-中盘
    {"id": "zz500",  "label": "主力", "group": "stock",  "name": "易方达中证500ETF联接A",                "code_c": "007028", "baostock_code": "sh.512500"},
    {"id": "zz500",  "label": "替代", "group": "stock",  "name": "华夏中证500ETF联接A",                  "code_c": "001052", "baostock_code": "sh.512500"},
    # 长期债券-国开
    {"id": "bond75", "label": "主力", "group": "bond_l", "name": "南方中债7-10年国开行债券指数A",        "code_c": "006961", "baostock_code": "sh.511260"},
    {"id": "bond75", "label": "替代", "group": "bond_l", "name": "汇添富中债7-10年国开行债券指数A",      "code_c": "008054", "baostock_code": "sh.511260"},
    # 长期债券-农发
    {"id": "bond35", "label": "主力", "group": "bond_l", "name": "博时中债5-10年农发行债券指数A",        "code_c": "006848", "baostock_code": "sh.511170"},
    {"id": "bond35", "label": "替代", "group": "bond_l", "name": "上银中债5-10年国开行债券指数A",        "code_c": "013138", "baostock_code": "sh.511170"},
    # 中期债券
    {"id": "bond5",  "label": "主力", "group": "bond_m", "name": "南方中债3-5年农发行债券指数A",         "code_c": "006493", "baostock_code": "sh.511130"},
    {"id": "bond5",  "label": "替代", "group": "bond_m", "name": "长城中债3-5年期国债指数A",             "code_c": "009324", "baostock_code": "sh.511130"},
    # 黄金
    {"id": "gold",   "label": "主力", "group": "gold",   "name": "华安黄金易ETF联接A",                   "code_c": "000216", "baostock_code": "sh.518880"},
    {"id": "gold",   "label": "替代", "group": "gold",   "name": "博时黄金ETF联接A",                     "code_c": "002610", "baostock_code": "sh.518880"},
    # 大宗商品 QDII-LOF
    {"id": "comm",   "label": "主力", "group": "comm",   "name": "国泰大宗商品(QDII-LOF)A",              "code_c": "160216", "baostock_code": "sz.160216"},
    {"id": "comm",   "label": "替代", "group": "comm",   "name": "中信保诚全球商品主题(QDII-FOF-LOF)A",  "code_c": "165513", "baostock_code": "sz.165513"},
]
```

> Replace bond codes with confirmed values from Task 1. Set `"baostock_code": None` for any unconfirmed codes.

- [ ] **Step 2: Add the SSE endpoint after the `/mdtfr-pool/stream` route (around line 354)**

```python
@router.get("/aw-pool/stream", summary="全天候标的池动量监控（SSE逐条流式）")
async def aw_pool_stream():
    """逐只基金处理，每完成一只即通过 SSE 推送结果。"""
    end_date   = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def _run():
        import baostock as _bs
        ev = lambda d: loop.call_soon_threadsafe(queue.put_nowait, json.dumps(d, ensure_ascii=False))

        def _login() -> bool:
            lg = _bs.login()
            if lg.error_code != '0':
                ev({"type": "error", "msg": f"BaoStock 登录失败: {lg.error_msg}"})
                return False
            return True

        if not _login():
            loop.call_soon_threadsafe(queue.put_nowait, None)
            return

        try:
            for fund in AW_POOL_FUNDS:
                try:
                    bscode = fund.get("baostock_code")
                    if not bscode:
                        ev({"type": "item", **fund,
                            "latest_close": None, "ret_30d": None,
                            "ma20": None, "above_ma20": None,
                            "ma60": None, "ma60_rising": None,
                            "ma60_rate": None, "ma60_trend": None,
                            "error": "暂无场内价格数据"})
                        continue

                    rs = _bs.query_history_k_data_plus(
                        bscode, "date,close",
                        start_date=start_date, end_date=end_date,
                        frequency="d", adjustflag="2"
                    )
                    if rs.error_code != '0':
                        ev({"type": "item", **fund,
                            "latest_close": None, "ret_30d": None,
                            "ma20": None, "above_ma20": None,
                            "ma60": None, "ma60_rising": None,
                            "ma60_rate": None, "ma60_trend": None,
                            "error": f"查询失败: {rs.error_msg}"})
                        continue

                    rows = []
                    while rs.error_code == '0' and rs.next():
                        row = rs.get_row_data()
                        if row[1]:
                            rows.append(float(row[1]))

                    n = len(rows)
                    if n < 21:
                        ev({"type": "item", **fund,
                            "latest_close": None, "ret_30d": None,
                            "ma20": None, "above_ma20": None,
                            "ma60": None, "ma60_rising": None,
                            "ma60_rate": None, "ma60_trend": None,
                            "error": f"数据不足（{n} 条）"})
                        continue

                    closes = rows
                    ma20 = round(sum(closes[-20:]) / 20, 3)
                    ret_30d = round((closes[-1] / closes[-31] - 1), 6) if n >= 31 else None
                    ma60, ma60_rising, ma60_rate, ma60_trend = _calc_ma60(closes)

                    ev({"type": "item", **fund,
                        "latest_close": round(closes[-1], 3),
                        "ret_30d":      ret_30d,
                        "ma20":         ma20,
                        "above_ma20":   closes[-1] > ma20,
                        "ma60":         ma60,
                        "ma60_rising":  ma60_rising,
                        "ma60_rate":    ma60_rate,
                        "ma60_trend":   ma60_trend,
                        "error":        None})
                    time.sleep(0.3)
                except Exception as e:
                    ev({"type": "item", **fund,
                        "latest_close": None, "ret_30d": None,
                        "ma20": None, "above_ma20": None,
                        "ma60": None, "ma60_rising": None,
                        "ma60_rate": None, "ma60_trend": None,
                        "error": str(e)})
        finally:
            _bs.logout()
            ev({"type": "done", "last_updated": datetime.now().isoformat()})
            loop.call_soon_threadsafe(queue.put_nowait, None)

    loop.run_in_executor(None, _run)

    async def _gen():
        while True:
            msg = await queue.get()
            if msg is None:
                break
            yield f"data: {msg}\n\n"

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
```

- [ ] **Step 3: Verify the server starts and the endpoint is listed**

```bash
curl http://localhost:9001/docs | grep aw-pool
# Expected: mentions /api/strategy/aw-pool/stream
```

- [ ] **Step 4: Smoke-test the SSE stream**

```bash
curl -N http://localhost:9001/api/strategy/aw-pool/stream
```

Expected: 14 `data: {...}` lines then a `data: {"type":"done",...}` line. Each item should have `"type":"item"`, `"code_c"`, and either data or `"error"`.

- [ ] **Step 5: Commit**

```bash
git add routers/strategy.py
git commit -m "feat(aw-monitor): add /api/strategy/aw-pool/stream SSE endpoint"
```

---

## Task 5: Create `js/aw/monitor.js`

**Files:**
- Create: `js/aw/monitor.js`

- [ ] **Step 1: Create the file with the full implementation**

```js
// js/aw/monitor.js — 全天候标的监控：表格渲染 + SSE 加载 + 缓存逻辑

import { PORTFOLIO, ASSET_COLORS } from './config.js';
import { escHtml } from '../utils.js';

// ── 14行标的定义（主力在前，替代在后，按 PORTFOLIO 顺序）────────
function _getAwPoolDef() {
  const defs = [];
  for (const asset of PORTFOLIO) {
    defs.push({ ...asset, label: '主力', baostock_code: asset.baostock_code });
    defs.push({ ...asset, ...asset.alt, id: asset.id, group: asset.group,
                label: '替代', baostock_code: asset.alt.baostock_code });
  }
  return defs;
}

// ── 缓存 helpers（REST API → ~/.investment/YYYY/MM/aw_pool.json）──
async function _cacheGet(date) {
  const res = await fetch(`/api/cache/aw-pool/${date}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取AW缓存失败: ${res.status}`);
  return res.json();
}

async function _cachePut(date, value) {
  const res = await fetch(`/api/cache/aw-pool/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`写入AW缓存失败: ${res.status}`);
}

async function _cacheDelete(date) {
  const res = await fetch(`/api/cache/aw-pool/${date}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除AW缓存失败: ${res.status}`);
}

// ── 单行完整性检查（有数据且无error才算完整）─────────────────────
function _rowComplete(item) {
  if (!item || item.error) return false;
  if (item.ret_30d == null || item.latest_close == null) return false;
  if (item.ma60_trend == null) return false;
  return true;
}

// ── 类别 badge ─────────────────────────────────────────────────
function _groupBadge(group) {
  const map = {
    stock:  { bg: 'rgba(59,130,246,.15)',  color: 'var(--blue)',   label: '股票' },
    bond_l: { bg: 'rgba(6,182,212,.15)',   color: 'var(--cyan)',   label: '长期债' },
    bond_m: { bg: 'rgba(168,85,247,.15)',  color: 'var(--purple)', label: '中期债' },
    gold:   { bg: 'rgba(234,179,8,.15)',   color: 'var(--yellow)', label: '黄金' },
    comm:   { bg: 'rgba(249,115,22,.15)',  color: 'var(--orange)', label: '商品' },
  };
  const { bg, color, label } = map[group] || map.stock;
  return `<span style="font-size:12px;padding:2px 7px;border-radius:4px;font-weight:700;background:${bg};color:${color}">${label}</span>`;
}

// ── 类型 badge (主力/替代) ──────────────────────────────────────
function _labelBadge(label) {
  const isPrimary = label === '主力';
  const bg    = isPrimary ? 'rgba(34,197,94,.12)'  : 'rgba(148,163,184,.12)';
  const color = isPrimary ? 'var(--green)'         : 'var(--text-dim)';
  return `<span style="font-size:11px;padding:1px 6px;border-radius:3px;font-weight:600;background:${bg};color:${color}">${label}</span>`;
}

// ── 表格初始化（skeleton=true 显示加载动画，false 显示空占位）──
function awInitTable(skeleton = false) {
  const wrap = document.getElementById('aw-monitor-table-wrap');
  if (!wrap) return;
  const sortBtn = document.getElementById('aw-sort-btn');
  if (sortBtn) { sortBtn.style.display = 'none'; sortBtn.innerHTML = '↕ 排序'; sortBtn.style.color = ''; sortBtn.style.borderColor = ''; }
  const dash = '<span style="color:var(--border)">–</span>';
  const sk   = (w) => skeleton ? `<div class="skeleton" style="width:${w}"></div>` : dash;

  const defs = _getAwPoolDef();
  const rows = defs.map(def => `<tr id="aw-row-${def.code}">
    <td>${_groupBadge(def.group)}</td>
    <td>${_labelBadge(def.label)}</td>
    <td style="font-weight:600">${escHtml(def.fullName)}</td>
    <td style="color:var(--text-dim);font-size:13px">${def.code}</td>
    <td id="aw-ret-${def.code}">${sk('60%')}</td>
    <td id="aw-close-${def.code}">${sk('70%')}</td>
    <td id="aw-ma20-${def.code}">${sk('55%')}</td>
    <td id="aw-ma60-${def.code}">${sk('55%')}</td>
  </tr>`).join('');

  wrap.innerHTML = `
    <div class="mdtfr-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>类别</th><th>类型</th><th>基金名称</th><th>代码</th>
          <th>近30日涨跌</th><th>收盘价</th><th>vs MA20</th><th>MA60趋势</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── 填充单行数据 ───────────────────────────────────────────────
function awFillRow(item) {
  const c = item.code_c;
  if (!document.getElementById(`aw-row-${c}`)) return;

  if (item.error) {
    document.getElementById(`aw-close-${c}`).innerHTML =
      `<span style="color:var(--text-dim);font-size:12px">${escHtml(item.error)}</span>`;
    ['ret','ma20','ma60'].forEach(k => {
      const el = document.getElementById(`aw-${k}-${c}`);
      if (el) el.innerHTML = '<span style="color:var(--border)">–</span>';
    });
    return;
  }

  // 近30日涨跌
  const ret = item.ret_30d;
  const retColor = ret > 0 ? 'var(--red)' : ret < 0 ? 'var(--green)' : 'var(--text-dim)';
  const retStr   = ret != null ? (ret > 0 ? '+' : '') + (ret * 100).toFixed(2) + '%' : '–';
  document.getElementById(`aw-ret-${c}`).innerHTML =
    `<span style="font-weight:700;color:${retColor}">${retStr}</span>`;

  // 收盘价
  document.getElementById(`aw-close-${c}`).textContent =
    item.latest_close != null ? item.latest_close.toFixed(3) : '–';

  // vs MA20
  document.getElementById(`aw-ma20-${c}`).innerHTML = (() => {
    if (item.above_ma20 == null) return '<span style="color:var(--border)">–</span>';
    const icon  = item.above_ma20 ? '✓' : '✗';
    const color = item.above_ma20 ? 'var(--green)' : 'var(--red)';
    const ma20s = item.ma20 != null ? item.ma20.toFixed(3) : '';
    return `<span style="color:${color}">${icon}</span><span style="color:var(--text-dim);font-size:12px;margin-left:4px">${ma20s}</span>`;
  })();

  // MA60趋势
  document.getElementById(`aw-ma60-${c}`).innerHTML = (() => {
    const trend = item.ma60_trend;
    if (!trend) return '<span style="color:var(--border)">–</span>';
    const rate = item.ma60_rate != null
      ? `<span style="font-size:11px;opacity:.7;margin-left:3px">${item.ma60_rate > 0 ? '+' : ''}${item.ma60_rate.toFixed(2)}%</span>`
      : '';
    const cfg = {
      '趋势向好': ['var(--green)', '↑'],
      '持续下行': ['var(--red)',   '↓'],
      '未达标':   ['var(--yellow)','→'],
    };
    const [color, arrow] = cfg[trend] || ['var(--border)', '–'];
    return `<span style="color:${color}">${arrow} ${trend}</span>${rate}`;
  })();
}

// ── 排序 ───────────────────────────────────────────────────────
let _awSorted = false;

function toggleAwSort() {
  const tbody = document.querySelector('#aw-monitor-table-wrap tbody');
  if (!tbody) return;
  const btn = document.getElementById('aw-sort-btn');

  if (!_awSorted) {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const getRet = (row) => {
        const el = row.querySelector('[id^="aw-ret-"] span');
        if (!el) return -Infinity;
        const t = el.textContent.replace('%','').replace('+','');
        return parseFloat(t) || -Infinity;
      };
      return getRet(b) - getRet(a);
    });
    rows.forEach(r => tbody.appendChild(r));
    btn.innerHTML = '↩ 恢复';
    btn.style.color = 'var(--cyan)';
    btn.style.borderColor = 'var(--cyan)';
    _awSorted = true;
  } else {
    _getAwPoolDef().forEach(def => {
      const row = document.getElementById(`aw-row-${def.code}`);
      if (row) tbody.appendChild(row);
    });
    btn.innerHTML = '↕ 排序';
    btn.style.color = '';
    btn.style.borderColor = '';
    _awSorted = false;
  }
}

// ── SSE EventSource 句柄（避免重复打开）─────────────────────────
let _awEventSource = null;

// ── 主加载入口 ─────────────────────────────────────────────────
async function loadAwPool() {
  const btn = document.getElementById('aw-load-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 加载中'; }

  const today = new Date().toISOString().slice(0, 10);
  const wrap  = document.getElementById('aw-monitor-table-wrap');
  if (wrap && !wrap.querySelector('table')) awInitTable(false);

  // 读缓存
  let cached = null;
  try { cached = await _cacheGet(today); } catch (e) { console.warn('AW缓存读取失败', e); }

  const cachedMap = {};
  if (cached && Array.isArray(cached)) cached.forEach(x => { cachedMap[x.code_c] = x; });

  const defs = _getAwPoolDef();
  const incomplete = defs.filter(def => !_rowComplete(cachedMap[def.code]));

  if (incomplete.length === 0) {
    cached.forEach(awFillRow);
    document.getElementById('aw-monitor-time').textContent = `缓存数据 · ${today}`;
    if (btn) { btn.disabled = false; btn.innerHTML = '↺ 刷新'; }
    return;
  }

  // 有完整缓存行先填
  Object.values(cachedMap).filter(_rowComplete).forEach(awFillRow);
  // 不完整行设骨架屏
  const sk = (w) => `<div class="skeleton" style="width:${w}"></div>`;
  incomplete.forEach(def => {
    ['ret','close','ma20','ma60'].forEach((k, i) => {
      const el = document.getElementById(`aw-${k}-${def.code}`);
      if (el) el.innerHTML = sk(['60%','70%','55%','55%'][i]);
    });
  });

  if (_awEventSource) { _awEventSource.close(); }

  const collected = Object.values(cachedMap).filter(_rowComplete);
  const saveSnapshot = async () => {
    const snapshot = defs.map(def => collected.find(x => x.code_c === def.code)).filter(Boolean);
    try { await _cachePut(today, snapshot); } catch (e) { console.warn('AW缓存写入失败', e); }
    return snapshot;
  };

  const es = new EventSource('/api/strategy/aw-pool/stream');
  _awEventSource = es;

  es.onmessage = async (e) => {
    let d;
    try { d = JSON.parse(e.data); } catch { return; }

    if (d.type === 'item') {
      const idx = collected.findIndex(x => x.code_c === d.code_c);
      if (idx >= 0) collected.splice(idx, 1, d); else collected.push(d);
      awFillRow(d);
      await saveSnapshot();
    } else if (d.type === 'error') {
      console.error('AW SSE error:', d.msg);
      es.close();
      if (btn) { btn.disabled = false; btn.innerHTML = '↺ 重试'; }
    } else if (d.type === 'done') {
      es.close();
      await saveSnapshot();
      document.getElementById('aw-monitor-time').textContent =
        `已更新 · ${d.last_updated ? d.last_updated.slice(0, 19) : today}`;
      if (btn) { btn.disabled = false; btn.innerHTML = '↺ 刷新'; }
    }
  };

  es.onerror = () => {
    console.error('AW SSE 连接中断');
    es.close();
    if (btn) { btn.disabled = false; btn.innerHTML = '↺ 重试'; }
  };
}

// ── 清空缓存并重置 UI ──────────────────────────────────────────
async function clearAndResetAw() {
  _awSorted = false;
  const today = new Date().toISOString().slice(0, 10);
  try {
    await _cacheDelete(today);
    document.getElementById('aw-monitor-time').textContent = '缓存已清空';
    awInitTable(false);  // awInitTable already hides sort button
  } catch (e) {
    console.error('清空AW缓存失败', e);
  }
}

// ── 页面初始化入口（仅首次，避免重复渲染）─────────────────────
async function awMaybeInitEmpty() {
  const wrap = document.getElementById('aw-monitor-table-wrap');
  if (!wrap || wrap.querySelector('table')) return; // 已初始化
  awInitTable(false);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = await _cacheGet(today);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      cached.forEach(awFillRow);
      document.getElementById('aw-monitor-time').textContent = `缓存数据 · ${today}`;
    }
  } catch (e) {
    console.warn('AW初始化缓存读取失败', e);
  }
}

export { awMaybeInitEmpty, awInitTable, loadAwPool, awFillRow, clearAndResetAw, toggleAwSort };
```

- [ ] **Step 2: Verify the file has no syntax errors**

```bash
node --input-type=module < js/aw/monitor.js 2>&1 | head -5
```

Expected: no output (no errors). If errors appear, fix them before continuing.

- [ ] **Step 3: Commit**

```bash
git add js/aw/monitor.js
git commit -m "feat(aw-monitor): create js/aw/monitor.js with table/loader/cache logic"
```

---

## Task 6: Update `strategy_page.html` — add monitor section

**Files:**
- Modify: `strategy_page.html`

- [ ] **Step 1: Insert the monitor section in `panel-aw`**

Find this line in `strategy_page.html` (around line 47):
```html
    <!-- ── 再平衡计算器 ── -->
    <div class="section-card">
```

Insert the following block **before** that line (inside `<div class="aw-layout">`):

```html
    <!-- ── 全天候标的监控 ── -->
    <div class="section-card">
      <div class="section-head">
        <span class="section-icon">📈</span>
        <span class="section-title">全天候标的监控</span>
        <span id="aw-monitor-time" style="font-size:13px;color:var(--text-dim);margin-left:8px;flex:1"></span>
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" id="aw-sort-btn" onclick="toggleAwSort()" style="display:none">↕ 排序</button>
          <button class="btn btn-ghost btn-sm" onclick="clearAndResetAw()" style="border-color:var(--red);color:var(--red)">🗑 清空数据</button>
          <button class="btn btn-primary" id="aw-load-btn" onclick="loadAwPool()">▶ 加载数据</button>
        </div>
      </div>
      <div id="aw-monitor-table-wrap">
        <div class="empty-state">点击 ▶ 加载数据 获取最新行情</div>
      </div>
    </div>

```

- [ ] **Step 2: Verify HTML structure**

Open `strategy_page.html` and confirm:
- The new section is inside `<div class="aw-layout">`, before the calculator card
- The IDs `aw-monitor-time`, `aw-sort-btn`, `aw-load-btn`, `aw-monitor-table-wrap` are present
- No duplicate IDs in the file: `grep -n "aw-monitor\|aw-sort\|aw-load" strategy_page.html`

- [ ] **Step 3: Commit**

```bash
git add strategy_page.html
git commit -m "feat(aw-monitor): add monitor section HTML to panel-aw"
```

---

## Task 7: Wire up `js/main.js` and `js/tab.js`

**Files:**
- Modify: `js/main.js`
- Modify: `js/tab.js`

- [ ] **Step 1: Add import to `js/main.js`**

Find this existing import block in `main.js`:
```js
import { openDrawer, closeDrawer }                from './aw/drawer.js';
```

Add the new import on the next line:
```js
import { awMaybeInitEmpty, loadAwPool, clearAndResetAw, toggleAwSort } from './aw/monitor.js';
```

- [ ] **Step 2: Expose new globals in `js/main.js`**

Find the `Object.assign(window, {` block and add the AW monitor functions to it. Find the `// AW 再平衡` comment block and add after the existing AW entries:

```js
  // AW 标的监控
  loadAwPool, clearAndResetAw, toggleAwSort,
```

- [ ] **Step 3: Call `awMaybeInitEmpty()` in main.js init**

Find the async init block:
```js
(async () => {
  await loadAmounts();
  await loadAvailable();
  ...
  initHashRouter();
})();
```

Add `awMaybeInitEmpty()` call before `initHashRouter()`:
```js
(async () => {
  await loadAmounts();
  await loadAvailable();

  if (getSumOfPositions() === 0 && getAvailableAmt() === 0) {
    await recoverFromJournal();
  }

  refreshTotalDisplay();
  refreshAllPosPct();
  await awMaybeInitEmpty();   // ← add this line

  initHashRouter();
})();
```

- [ ] **Step 4: Update `js/tab.js` to call `awMaybeInitEmpty()` on tab switch**

Find the `switchTab` function:
```js
export function switchTab(id) {
  ...
  if (id === 'mdtfr') {
    import('./mdtfr/loader.js').then(m => m.mdtfrMaybeInitEmpty());
  }
}
```

Add an `else if` for the `aw` tab:
```js
export function switchTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.getElementById('panel-' + id).classList.add('active');
  history.replaceState(null, '', '#' + id);
  if (id === 'mdtfr') {
    import('./mdtfr/loader.js').then(m => m.mdtfrMaybeInitEmpty());
  } else if (id === 'aw') {
    import('./aw/monitor.js').then(m => m.awMaybeInitEmpty());
  }
}
```

- [ ] **Step 5: Show sort button only after data loads**

In `js/aw/monitor.js`, find the `done` handler inside `loadAwPool`:

```js
    } else if (d.type === 'done') {
      es.close();
      await saveSnapshot();
      document.getElementById('aw-monitor-time').textContent = ...
      if (btn) { btn.disabled = false; btn.innerHTML = '↺ 刷新'; }
    }
```

Add a line to show the sort button:
```js
    } else if (d.type === 'done') {
      es.close();
      await saveSnapshot();
      document.getElementById('aw-monitor-time').textContent =
        `已更新 · ${d.last_updated ? d.last_updated.slice(0, 19) : today}`;
      const sortBtn = document.getElementById('aw-sort-btn');
      if (sortBtn) sortBtn.style.display = '';
      if (btn) { btn.disabled = false; btn.innerHTML = '↺ 刷新'; }
    }
```

Also show sort button when rendering from cache. In `awMaybeInitEmpty()`, after `cached.forEach(awFillRow)`:
```js
      cached.forEach(awFillRow);
      document.getElementById('aw-monitor-time').textContent = `缓存数据 · ${today}`;
      const sortBtn = document.getElementById('aw-sort-btn');
      if (sortBtn) sortBtn.style.display = '';
```

And in `loadAwPool()` when cache is complete, after `cached.forEach(awFillRow)`:
```js
    cached.forEach(awFillRow);
    document.getElementById('aw-monitor-time').textContent = `缓存数据 · ${today}`;
    const sortBtn = document.getElementById('aw-sort-btn');
    if (sortBtn) sortBtn.style.display = '';
```

- [ ] **Step 6: Commit**

```bash
git add js/main.js js/tab.js js/aw/monitor.js
git commit -m "feat(aw-monitor): wire up main.js and tab.js"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Open `http://localhost:9001/strategy#aw` in a browser**

Expected initial state:
- "全天候标的监控" section appears above the rebalance calculator
- Table shows "点击 ▶ 加载数据 获取最新行情" placeholder
- Sort and Clear buttons are visible, Load button is primary

- [ ] **Step 2: Click ▶ 加载数据**

Expected:
- 14 rows render as skeleton screens immediately
- Rows fill in one by one as SSE events arrive (stock rows first, then bonds, gold, commodities)
- Each row shows: category badge (股票/长期债/etc.), 主力/替代 badge, fund name, code
- "近30日涨跌" shows colored % values (red=positive, green=negative)
- "vs MA20" shows ✓/✗ with MA20 value
- "MA60趋势" shows 趋势向好/持续下行/未达标 with rate%
- Time label updates to "已更新 · YYYY-MM-DD HH:MM:SS"
- Sort button appears after all data loads

- [ ] **Step 3: Reload the page**

Expected:
- Table populates immediately from cache (no SSE call)
- Time label shows "缓存数据 · YYYY-MM-DD"
- Sort button is visible

- [ ] **Step 4: Test sort toggle**

Click "↕ 排序":
- Rows reorder by 近30日涨跌 descending (highest return on top)
- Button changes to "↩ 恢复" in cyan

Click "↩ 恢复":
- Rows return to original order (hs300主力, hs300替代, zz500主力, ...)
- Button returns to "↕ 排序"

- [ ] **Step 5: Test clear and switch tab**

Click "🗑 清空数据":
- Table resets to placeholder
- Time label shows "缓存已清空"
- Sort button hidden

Switch to MDTFR tab and back to AW tab:
- Monitor section is present but shows placeholder (cache was cleared)

- [ ] **Step 6: Check bond/commodity rows**

If bond ETF codes (sh.511260, etc.) were confirmed in Task 1:
- Bond rows should show data

If bond ETF codes are unconfirmed / invalid:
- Bond rows show "查询失败: ..." in the close price column
- All other columns show "–"
- Other rows (stock, gold) are unaffected

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(aw-monitor): complete end-to-end verification"
```
