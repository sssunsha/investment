# AW 全天候策略持仓追踪 & 再平衡增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AW（全天候）Tab 添加持仓金额/份额/成本追踪、顶部总金额/收益/可用金额显示，并将再平衡计算器与持仓数据打通、持久化到服务端文件。

**Architecture:** 平行镜像 MDTFR 的 amounts.js/available.js 模式，新建 `js/aw/amounts.js` + `js/aw/aw-available.js`；后端新增 4 个 API 端点（`/api/cache/aw-amounts` GET/PUT + `/api/cache/aw-rebalance-log` GET/PUT）；所有数据写入 `~/.investment/aw_amounts.json` 和 `~/.investment/aw_rebalance_log.json`。

**Tech Stack:** Python FastAPI (backend), ES Modules (frontend), 无 EventBus（直接函数调用避免 AW/MDTFR 事件串扰）

**Spec:** `docs/superpowers/specs/2026-05-22-aw-positions-rebalance-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `js/aw/amounts.js` | AW持仓金额/份额/成本；UI cell构建；_rawData管理 |
| Create | `js/aw/aw-available.js` | AW可用金额/总金额/P&L；收益弹窗 |
| Modify | `routers/cache.py` | 新增4个端点：aw-amounts GET/PUT + aw-rebalance-log GET/PUT |
| Modify | `strategy_page.html` | AW section-head加入总金额/收益/可用金额DOM；移除total-assets输入；新增aw-pnl-overlay |
| Modify | `js/aw/monitor.js` | awInitTable/awFillRow 新增持仓金额/份额/仓位%三列 |
| Modify | `js/aw/inputs.js` | toggleAwAlt后同步预填充；新增populateCalcInputsFromPositions |
| Modify | `js/aw/calc.js` | _runCalc读取存储持仓+可用金额；resetCalc去除total-assets |
| Modify | `js/aw/log.js` | saveToLog应用ops到持仓；迁移到服务端API；loadLog从服务端读 |
| Modify | `js/main.js` | import并init新模块；挂载全局函数 |

---

## Task 1: 后端 API — aw-amounts & aw-rebalance-log

**Files:**
- Modify: `routers/cache.py`
- Test: `tests/test_cache.py`

- [ ] **Step 1: 写失败测试**

在 `tests/test_cache.py` 文件末尾追加：

```python
class TestAwAmountsApi:
    """GET /api/cache/aw-amounts  &  PUT /api/cache/aw-amounts"""

    def test_get_returns_empty_dict_when_file_missing(self, tmp_path, monkeypatch):
        import routers.cache as cache_mod
        monkeypatch.setattr(cache_mod, 'AW_AMOUNTS_FILE', tmp_path / "aw_amounts.json")
        monkeypatch.setattr(cache_mod, 'CACHE_DIR', tmp_path)
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        resp = client.get("/api/cache/aw-amounts")
        assert resp.status_code == 200
        assert resp.json() == {}

    def test_put_and_get_roundtrip(self, tmp_path, monkeypatch):
        import routers.cache as cache_mod
        monkeypatch.setattr(cache_mod, 'AW_AMOUNTS_FILE', tmp_path / "aw_amounts.json")
        monkeypatch.setattr(cache_mod, 'CACHE_DIR', tmp_path)
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        payload = {"460300": 25000.0, "__available__": 10000.0, "__shares__": {"460300": 185.4}}
        client.put("/api/cache/aw-amounts", json=payload)
        resp = client.get("/api/cache/aw-amounts")
        assert resp.status_code == 200
        data = resp.json()
        assert data["460300"] == 25000.0
        assert data["__available__"] == 10000.0


class TestAwRebalanceLogApi:
    """GET /api/cache/aw-rebalance-log  &  PUT /api/cache/aw-rebalance-log"""

    def test_get_returns_empty_list_when_file_missing(self, tmp_path, monkeypatch):
        import routers.cache as cache_mod
        monkeypatch.setattr(cache_mod, 'AW_REBALANCE_LOG_FILE', tmp_path / "aw_rebalance_log.json")
        monkeypatch.setattr(cache_mod, 'CACHE_DIR', tmp_path)
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        resp = client.get("/api/cache/aw-rebalance-log")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_put_and_get_roundtrip(self, tmp_path, monkeypatch):
        import routers.cache as cache_mod
        monkeypatch.setattr(cache_mod, 'AW_REBALANCE_LOG_FILE', tmp_path / "aw_rebalance_log.json")
        monkeypatch.setattr(cache_mod, 'CACHE_DIR', tmp_path)
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        log = [{"date": "2026-05-22", "total": 100000, "ops": []}]
        client.put("/api/cache/aw-rebalance-log", json=log)
        resp = client.get("/api/cache/aw-rebalance-log")
        assert resp.status_code == 200
        assert resp.json()[0]["date"] == "2026-05-22"
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
python -m pytest tests/test_cache.py::TestAwAmountsApi tests/test_cache.py::TestAwRebalanceLogApi -v
```
预期：`ERROR` 或 `AttributeError: module 'routers.cache' has no attribute 'AW_AMOUNTS_FILE'`

- [ ] **Step 3: 实现后端端点**

在 `routers/cache.py` 中，找到 `WATCH_FILE = CACHE_DIR / "mdtfr_watch.json"` 这行（约第311行），在其上方追加：

```python
AW_AMOUNTS_FILE      = CACHE_DIR / "aw_amounts.json"
AW_REBALANCE_LOG_FILE = CACHE_DIR / "aw_rebalance_log.json"
```

然后在文件末尾追加：

```python
# ── AW 持仓金额 ─────────────────────────────────────────────────

@router.get("/aw-amounts", summary="读取AW持仓金额（code → 元）")
async def aw_amounts_get():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    data = _read_json(AW_AMOUNTS_FILE, {})
    return JSONResponse(content=data if isinstance(data, dict) else {})


@router.put("/aw-amounts", summary="写入AW持仓金额（code → 元）")
async def aw_amounts_put(request: Request):
    try:
        payload = await request.json()
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _write_json(AW_AMOUNTS_FILE, payload)
        return {"ok": True, "file": str(AW_AMOUNTS_FILE)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入AW持仓金额失败: {e}")


# ── AW 再平衡操作日志 ───────────────────────────────────────────

@router.get("/aw-rebalance-log", summary="读取AW再平衡操作日志")
async def aw_rebalance_log_get():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    data = _read_json(AW_REBALANCE_LOG_FILE, [])
    return JSONResponse(content=data if isinstance(data, list) else [])


@router.put("/aw-rebalance-log", summary="写入AW再平衡操作日志")
async def aw_rebalance_log_put(request: Request):
    try:
        payload = await request.json()
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _write_json(AW_REBALANCE_LOG_FILE, payload)
        return {"ok": True, "file": str(AW_REBALANCE_LOG_FILE)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入AW操作日志失败: {e}")
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
python -m pytest tests/test_cache.py::TestAwAmountsApi tests/test_cache.py::TestAwRebalanceLogApi -v
```
预期：4 个 `PASSED`

- [ ] **Step 5: Commit**

```bash
git add routers/cache.py tests/test_cache.py
git commit -m "feat(backend): add aw-amounts and aw-rebalance-log cache API endpoints"
```

---

## Task 2: 新建 js/aw/amounts.js

**Files:**
- Create: `js/aw/amounts.js`

- [ ] **Step 1: 创建文件**

新建 `/Users/I340818/workspace/personal/workspace/investment/js/aw/amounts.js`，完整内容如下：

```javascript
// js/aw/amounts.js — AW 全天候策略持仓金额/份额/成本管理
import { PORTFOLIO, getActiveAsset } from './config.js';

const AW_AMOUNTS_API = '/api/cache/aw-amounts';

const _rawData = {};   // 含 __available__, __shares__, __cost__ 等特殊键
const _amt     = {};   // code → 持仓金额（数值）
const _mktVal  = {};   // code → 动态市值（份额×最新净值），不持久化

// ── 内部：总金额（不依赖 aw-available.js，避免循环依赖）───────
function _getTotal() {
  const available = parseFloat(_rawData['__available__'] || 0) || 0;
  return available + getAwSumOfPositions();
}

// ── 份额/成本辅助 ──────────────────────────────────────────────
function _getSharesObj() {
  const s = _rawData['__shares__'];
  return (s && typeof s === 'object') ? s : {};
}
function _getCostObj() {
  const c = _rawData['__cost__'];
  return (c && typeof c === 'object') ? c : {};
}

export function getAwShares(code) { return parseFloat(_getSharesObj()[code] || 0) || 0; }
export function getAwCost(code)   { return parseFloat(_getCostObj()[code]   || 0) || 0; }

export function setAwShares(code, v) {
  if (!_rawData['__shares__']) _rawData['__shares__'] = {};
  _rawData['__shares__'][code] = parseFloat(v) || 0;
}
export function setAwCost(code, v) {
  if (!_rawData['__cost__']) _rawData['__cost__'] = {};
  _rawData['__cost__'][code] = parseFloat(v) || 0;
}

// ── 金额读写 ───────────────────────────────────────────────────
export function getAwAmt(code)    { return parseFloat(_amt[code] || 0) || 0; }
export function getAwDynAmt(code) { return code in _mktVal ? _mktVal[code] : getAwAmt(code); }
export function hasAwMktVal(code) { return code in _mktVal; }

export function setAwAmt(code, value) {
  const v = parseFloat(value) || 0;
  _amt[code] = v > 0 ? v : 0;
}

/** _rawData 访问器（供 aw-available.js 管理 __available__ 字段）*/
export function getAwRawKey(key)         { return _rawData[key]; }
export function setAwRawKey(key, value)  { _rawData[key] = value; }

export function getAwSumOfPositions() {
  return Object.values(_amt).reduce((s, v) => s + (parseFloat(v) || 0), 0);
}

// ── 持久化 ─────────────────────────────────────────────────────
export async function loadAwAmounts() {
  try {
    const res = await fetch(AW_AMOUNTS_API);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        Object.assign(_rawData, data);
        Object.entries(data).forEach(([k, v]) => {
          if (!k.startsWith('__')) _amt[k] = parseFloat(v) || 0;
        });
      }
    }
  } catch {}
}

export async function saveAwAmounts() {
  try {
    const payload = { ..._amt };
    if ('__available__' in _rawData) payload['__available__'] = _rawData['__available__'];
    if ('__shares__'    in _rawData) payload['__shares__']    = _rawData['__shares__'];
    if ('__cost__'      in _rawData) payload['__cost__']      = _rawData['__cost__'];
    await fetch(AW_AMOUNTS_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {}
}

// ── UI 刷新 ────────────────────────────────────────────────────
export function refreshAwAllPosPct() {
  const total = _getTotal();
  const codes = new Set([...Object.keys(_amt), ...Object.keys(_mktVal)]);
  codes.forEach(code => {
    const pct = total > 0 ? Math.round(getAwDynAmt(code) / total * 1000) / 10 : 0;
    const span = document.querySelector(`#aw-pos-${code} .aw-pos-pct`);
    if (span) {
      span.textContent  = pct > 0 ? pct.toFixed(1) + '%' : '–';
      span.dataset.held = String(pct > 0);
    }
  });
  _updateAwTotalLabel(total);
}

function _updateAwTotalLabel(total) {
  const el = document.getElementById('aw-total-amt');
  if (!el) return;
  el.textContent = total > 0 ? `总金额：¥${Math.round(total).toLocaleString()}` : '总金额：¥0';
}

/** 加载行情后调用，用份额×净值计算动态市值并刷新颜色 */
export function refreshAwAmtPnl(items) {
  let anyUpdated = false;
  items.forEach(item => {
    if (!item || item.error || item.latest_close == null) return;
    const c      = item.code_c;   // AW池中 code_c 即 A类基金代码
    const shares = getAwShares(c);
    const cost   = getAwCost(c);
    if (shares > 0) {
      const curVal = Math.round(shares * item.latest_close);
      _mktVal[c] = curVal;
      anyUpdated = true;
      const inp = document.getElementById(`aw-amt-input-${c}`);
      if (inp && cost > 0) {
        inp.style.color = curVal > cost ? 'var(--red)' : curVal < cost ? 'var(--green)' : '';
      }
    } else {
      const inp = document.getElementById(`aw-amt-input-${c}`);
      if (inp) inp.style.color = '';
    }
  });
  if (anyUpdated) refreshAwAllPosPct();
}

// ── 输入框回调 ─────────────────────────────────────────────────
export function onAwAmtChange(code, val) {
  setAwAmt(code, val);
  saveAwAmounts();
  refreshAwAllPosPct();
  _syncCalcInput(code);
}

export function clearAwAmt(code) {
  setAwAmt(code, 0);
  delete _mktVal[code];
  setAwShares(code, 0);
  setAwCost(code, 0);
  saveAwAmounts();
  refreshAwAllPosPct();
  const inp = document.getElementById(`aw-amt-input-${code}`);
  if (inp) { inp.value = ''; inp.dataset.held = 'false'; inp.style.color = ''; }
  _syncCalcInput(code);
}

/** 监控表格金额变化 → 同步更新计算器 #inp-{id} */
function _syncCalcInput(code) {
  const asset = PORTFOLIO.find(a => getActiveAsset(a).code === code);
  if (!asset) return;
  const inp = document.getElementById('inp-' + asset.id);
  if (inp && document.activeElement !== inp) {
    const v = getAwDynAmt(code);
    inp.value = v > 0 ? v : '';
  }
}

// ── HTML 构建辅助 ──────────────────────────────────────────────
export function mkAwAmtCell(code) {
  const v    = getAwAmt(code);
  const held = v > 0;
  return `<div style="display:flex;gap:4px;align-items:center">
    <input class="amt-input" type="number" min="0" step="100"
      id="aw-amt-input-${code}"
      data-code="${code}" data-held="${held}"
      value="${v > 0 ? v : ''}" placeholder="0"
      oninput="onAwAmtChange('${code}',this.value)"
    />
    <button class="amt-clear-btn" onclick="clearAwAmt('${code}')" title="清零">×</button>
  </div>`;
}

export function mkAwSharesCell(code) {
  const shares = getAwShares(code);
  const cost   = getAwCost(code);
  const nav    = cost > 0 && shares > 0 ? (cost / shares).toFixed(4) : '–';
  const tip    = shares > 0
    ? `title="份额: ${shares.toFixed(2)} / 成本: ¥${Math.round(cost).toLocaleString()} / 均价: ${nav}"`
    : '';
  return `<span id="aw-shares-${code}" style="font-size:13px;color:var(--text-dim);cursor:${shares>0?'help':'default'}" ${tip}>${shares > 0 ? shares.toFixed(2) : '–'}</span>`;
}

export function mkAwPosPct(code) {
  const total = _getTotal();
  const pct   = total > 0 ? Math.round(getAwDynAmt(code) / total * 1000) / 10 : 0;
  return `<span id="aw-pos-${code}"><span class="aw-pos-pct" data-code="${code}" data-held="${pct > 0}">${pct > 0 ? pct.toFixed(1) + '%' : '–'}</span></span>`;
}
```

- [ ] **Step 2: 手动验证（浏览器控制台）**

启动服务器后在控制台执行：
```javascript
import('/js/aw/amounts.js').then(m => {
  m.setAwAmt('460300', 25000);
  console.assert(m.getAwAmt('460300') === 25000, 'getAwAmt failed');
  console.assert(m.getAwSumOfPositions() === 25000, 'getSumOfPositions failed');
  m.setAwShares('460300', 185.4);
  console.assert(m.getAwShares('460300') === 185.4, 'getShares failed');
  console.log('amounts.js OK');
});
```
预期：控制台输出 `amounts.js OK`，无 assertion 错误。

- [ ] **Step 3: Commit**

```bash
git add js/aw/amounts.js
git commit -m "feat(aw): add amounts.js — AW持仓金额/份额/成本管理模块"
```

---

## Task 3: 新建 js/aw/aw-available.js

**Files:**
- Create: `js/aw/aw-available.js`

- [ ] **Step 1: 创建文件**

新建 `/Users/I340818/workspace/personal/workspace/investment/js/aw/aw-available.js`，完整内容：

```javascript
// js/aw/aw-available.js — AW 可用金额、总金额、P&L 管理
import {
  getAwSumOfPositions, getAwRawKey, setAwRawKey, saveAwAmounts,
  getAwCost, getAwDynAmt, hasAwMktVal, refreshAwAllPosPct,
} from './amounts.js';
import { PORTFOLIO } from './config.js';
import { escHtml } from '../utils.js';

let _available = 0;

export function getAwAvailableAmt()  { return _available; }
export function setAwAvailableAmt(v) { _available = parseFloat(v) || 0; }

export function getAwTotalAmt() {
  return _available + getAwSumOfPositions();
}

export async function loadAwAvailable() {
  const v = getAwRawKey('__available__');
  _available = parseFloat(v || 0) || 0;
}

async function _saveAvailable() {
  setAwRawKey('__available__', _available);
  await saveAwAmounts();
}

export function refreshAwTotalDisplay() {
  const total = getAwTotalAmt();
  const totalEl = document.getElementById('aw-total-amt');
  if (totalEl) totalEl.textContent = total > 0 ? `总金额：¥${Math.round(total).toLocaleString()}` : '总金额：¥0';
  refreshAwPnlDisplay();
  const inp = document.getElementById('aw-available-input');
  if (inp && document.activeElement !== inp) {
    inp.value = _available > 0 ? _available : '';
  }
}

export function refreshAwPnlDisplay() {
  const pnlEl = document.getElementById('aw-total-pnl');
  if (!pnlEl) return;
  const { pnl, cost } = _computeAwTotalPnl();
  if (cost <= 0) { pnlEl.textContent = ''; return; }
  const sign = pnl >= 0 ? '+' : '';
  const pct  = (pnl / cost * 100).toFixed(2);
  pnlEl.textContent  = `总收益：${sign}¥${Math.round(pnl).toLocaleString()}（${sign}${pct}%）`;
  pnlEl.style.color  = pnl > 0 ? 'var(--red)' : pnl < 0 ? 'var(--green)' : 'var(--text-dim)';
}

function _computeAwTotalPnl() {
  let totalCost = 0, totalMktVal = 0;
  PORTFOLIO.forEach(a => {
    [a, a.alt].filter(Boolean).forEach(f => {
      const code = f.code;
      const cost = getAwCost(code);
      if (cost <= 0 || !hasAwMktVal(code)) return;
      totalCost   += cost;
      totalMktVal += getAwDynAmt(code);
    });
  });
  return { pnl: totalMktVal - totalCost, cost: totalCost };
}

export async function onAwAvailableChange(val) {
  _available = parseFloat(val) || 0;
  await _saveAvailable();
  refreshAwTotalDisplay();
  refreshAwAllPosPct();
}

// ── 收益明细弹窗 ───────────────────────────────────────────────
export function openAwPnlDialog() {
  document.getElementById('aw-pnl-overlay')?.classList.add('open');
  _loadAwPnlDialog();
}

export function closeAwPnlDialog() {
  document.getElementById('aw-pnl-overlay')?.classList.remove('open');
}

async function _loadAwPnlDialog() {
  const body = document.getElementById('aw-pnl-body');
  if (!body) return;
  body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">加载中...</div>';

  const th  = t => `<th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
  const td  = (t, extra='') => `<td style="padding:8px 10px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.04)${extra?';'+extra:''}">${t}</td>`;
  const clr = p => p > 0 ? 'var(--red)' : p < 0 ? 'var(--green)' : 'var(--text-dim)';
  const fmt = n => `¥${Math.round(n).toLocaleString()}`;
  const fmtPnl = (p, pct) => {
    if (p == null) return '–';
    const sign   = p >= 0 ? '+' : '';
    const pctStr = pct != null ? `<span style="font-size:11px;margin-left:4px">${sign}${pct.toFixed(2)}%</span>` : '';
    return `<span style="color:${clr(p)};font-weight:700">${sign}${fmt(p)}</span>${pctStr}`;
  };

  const holdings = [];
  PORTFOLIO.forEach(a => {
    [a, a.alt].filter(Boolean).forEach(f => {
      const code = f.code;
      const cost = getAwCost(code);
      if (cost <= 0) return;
      const mktVal = getAwDynAmt(code);
      const pnl    = mktVal - cost;
      holdings.push({
        name: f.fullName || f.name, code,
        cost, mktVal, pnl,
        pnlPct: cost > 0 ? pnl / cost * 100 : 0,
      });
    });
  });

  if (holdings.length === 0) {
    body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0">暂无持仓成本记录（保存操作记录时自动更新）</div>';
    return;
  }

  const rows = holdings.map(h => `<tr>
    ${td(`<span style="font-weight:600">${escHtml(h.name)}</span><br><span style="color:var(--text-dim);font-size:11px">${h.code}</span>`)}
    ${td(fmt(h.cost))}
    ${td(fmt(h.mktVal))}
    ${td(fmtPnl(h.pnl, h.pnlPct))}
    ${td('<span style="background:rgba(245,158,11,.15);color:var(--yellow);font-size:11px;padding:1px 6px;border-radius:3px">持仓中</span>')}
  </tr>`).join('');

  body.innerHTML = `<div>
    <div style="font-size:13px;font-weight:700;color:var(--cyan);margin-bottom:8px">📦 当前持仓（未实现收益）</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${th('标的')}${th('买入成本')}${th('当前市值')}${th('收益')}${th('状态')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
```

- [ ] **Step 2: 手动验证**

```javascript
import('/js/aw/aw-available.js').then(async m => {
  m.setAwAvailableAmt(10000);
  console.assert(m.getAwAvailableAmt() === 10000, 'getAvailableAmt failed');
  // getAwTotalAmt() = available + positions (0 at this point)
  console.assert(m.getAwTotalAmt() === 10000, 'getTotalAmt failed');
  console.log('aw-available.js OK');
});
```

- [ ] **Step 3: Commit**

```bash
git add js/aw/aw-available.js
git commit -m "feat(aw): add aw-available.js — AW可用金额/总金额/P&L管理模块"
```

---

## Task 4: strategy_page.html — AW Header DOM + 移除 total-assets + aw-pnl-overlay

**Files:**
- Modify: `strategy_page.html`

- [ ] **Step 1: 在 AW section-head 中添加总金额/收益/可用金额**

找到如下 HTML（约第47-57行）：
```html
      <div class="section-head">
        <span class="section-icon">📈</span>
        <span class="section-title">全天候标的监控</span>
        <span id="aw-monitor-time" style="font-size:13px;color:var(--text-dim);margin-left:8px;flex:1"></span>
        <div class="section-actions">
```

将 `<span id="aw-monitor-time"...` 那行及后续 `<div class="section-actions">` 替换为：

```html
        <span id="aw-monitor-time" style="font-size:13px;color:var(--text-dim);margin-left:8px"></span>
        <span id="aw-total-amt" style="font-size:13px;font-weight:700;color:var(--yellow);margin-left:12px">总金额：¥0</span>
        <span id="aw-total-pnl" style="font-size:13px;font-weight:700;margin-left:10px;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" onclick="openAwPnlDialog()" title="点击查看收益明细"></span>
        <span class="available-input-wrap" style="margin-left:auto">
          <label class="available-label">可用金额(元)：</label>
          <input id="aw-available-input" class="available-input" type="number" min="0" step="1000"
            placeholder="0" oninput="onAwAvailableChange(this.value)">
        </span>
        <div class="section-actions">
```

- [ ] **Step 2: 删除再平衡计算器中的 total-assets 输入框**

找到（约第76-82行）：
```html
        <!-- 总资产输入 -->
        <div style="margin-bottom:14px; display:flex; align-items:flex-end; gap:16px; flex-wrap:wrap">
          <div class="form-field" style="min-width:260px">
            <label class="form-label" style="color:var(--cyan)">组合总市值（元）</label>
            <input class="form-input" id="total-assets" type="number" placeholder="可不填，自动从各类别加总">
          </div>
          <div id="total-hint" style="font-size:13px; color:var(--text-dim); padding-bottom:6px; line-height:1.5"></div>
        </div>
```

替换为（只保留提示行）：

```html
        <!-- 总资产提示（自动计算） -->
        <div id="total-hint" style="font-size:13px; color:var(--text-dim); margin-bottom:14px; line-height:1.5"></div>
```

- [ ] **Step 3: 新增 aw-pnl-overlay 弹窗**

找到现有的 `<!-- P&L 收益明细弹窗 -->` 区块（约第287-297行），在其正下方追加：

```html
<!-- AW 收益明细弹窗 -->
<div class="journal-overlay" id="aw-pnl-overlay" onclick="if(event.target===this)closeAwPnlDialog()">
  <div class="journal-modal">
    <div class="journal-modal-head">
      <span style="font-size:18px;font-weight:700;flex:1">📊 全天候策略收益明细</span>
      <button onclick="closeAwPnlDialog()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:5px 12px;border-radius:6px;font-size:13px;cursor:pointer">✕ 关闭</button>
    </div>
    <div class="journal-table-wrap">
      <div id="aw-pnl-body" style="padding:8px 0">加载中...</div>
    </div>
  </div>
</div>
```

- [ ] **Step 4: 手动验证 HTML**

打开 `http://localhost:9001/strategy#aw`，检查：
- section-head 中出现「总金额：¥0」黄色文字
- 出现「可用金额(元)：」输入框
- 再平衡计算器中「组合总市值」输入框已消失
- 页面无布局破损

- [ ] **Step 5: Commit**

```bash
git add strategy_page.html
git commit -m "feat(aw): update HTML — add header displays, remove total-assets input, add aw-pnl-overlay"
```

---

## Task 5: js/aw/monitor.js — 新增持仓金额/份额/仓位%三列

**Files:**
- Modify: `js/aw/monitor.js`

- [ ] **Step 1: 在文件顶部添加 import**

找到文件第一行：
```javascript
// js/aw/monitor.js — 全天候标的监控：表格渲染 + SSE 加载 + 缓存逻辑
```

在 `import { awLog } from './debug.js';` 这行下方追加：
```javascript
import { mkAwAmtCell, mkAwSharesCell, mkAwPosPct, refreshAwAmtPnl, getAwShares } from './amounts.js';
```

- [ ] **Step 2: 更新 awInitTable 的表头**

找到 `awInitTable` 函数中表头部分：
```javascript
          <th class="sortable" data-sort="ma60_trend">MA60趋势 <span class="sort-icon">⇅</span></th>
        </tr></thead>
```

替换为：
```javascript
          <th class="sortable" data-sort="ma60_trend">MA60趋势 <span class="sort-icon">⇅</span></th>
          <th style="min-width:160px">持仓金额(元)</th>
          <th>份额</th>
          <th>仓位%</th>
        </tr></thead>
```

- [ ] **Step 3: 更新 awInitTable 的行模板**

找到 `awInitTable` 函数中行生成代码（skeleton rows）：
```javascript
  const rows = defs.map(def => `<tr id="aw-row-${def.code}">
    <td>${_groupBadge(def.group)}</td>
    <td>${_labelBadge(def.label)}</td>
    <td style="font-weight:600">${escHtml(def.fullName)}</td>
    <td style="color:var(--text-dim);font-size:13px">${def.code}</td>
    <td id="aw-ret-${def.code}">${sk('60%')}</td>
    <td id="aw-ret15-${def.code}">${sk('55%')}</td>
    <td id="aw-ret5-${def.code}">${sk('55%')}</td>
    <td id="aw-ret1-${def.code}">${sk('55%')}</td>
    <td id="aw-close-${def.code}">${sk('70%')}</td>
    <td id="aw-ma20-${def.code}">${sk('55%')}</td>
    <td id="aw-ma60-${def.code}">${sk('55%')}</td>
  </tr>`).join('');
```

替换为：
```javascript
  const rows = defs.map(def => `<tr id="aw-row-${def.code}">
    <td>${_groupBadge(def.group)}</td>
    <td>${_labelBadge(def.label)}</td>
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
  </tr>`).join('');
```

- [ ] **Step 4: 在 awFillRow 末尾追加份额更新 + 动态市值刷新**

找到 `awFillRow` 函数的末尾（约第174-176行）：
```javascript
  ma60El.style.cursor       = item.ma60_trend ? 'help' : '';
}
```

在 `}` 前追加（即在 `ma60El.style.cursor` 之后）：
```javascript

  // 更新份额展示
  const sharesEl = document.getElementById(`aw-shares-cell-${c}`);
  if (sharesEl) {
    const shares = getAwShares(c);
    const cost   = parseFloat(sharesEl.dataset.cost || 0);
    const nav    = cost > 0 && shares > 0 ? (cost / shares).toFixed(4) : '–';
    const tip    = shares > 0 ? `title="份额: ${shares.toFixed(2)} / 成本: ¥${Math.round(cost).toLocaleString()} / 均价: ${nav}"` : '';
    sharesEl.innerHTML = `<span style="font-size:13px;color:var(--text-dim);cursor:${shares>0?'help':'default'}" ${tip}>${shares > 0 ? shares.toFixed(2) : '–'}</span>`;
  }

  // 用最新净值刷新动态市值 + 盈亏颜色
  refreshAwAmtPnl([item]);
```

- [ ] **Step 5: 手动验证**

1. 打开 `http://localhost:9001/strategy#aw`
2. 点击「▶ 加载数据」
3. 等待数据加载完毕后，表格应显示 3 个新列（持仓金额输入框、份额、仓位%）
4. 在「华泰柏瑞沪深300ETF联接A」行的持仓金额输入框中输入 `25000`
5. 仓位% 列应更新，总金额显示应从「¥0」变为「¥25,000」

- [ ] **Step 6: Commit**

```bash
git add js/aw/monitor.js
git commit -m "feat(aw): monitor table — add 持仓金额/份额/仓位% columns"
```

---

## Task 6: js/aw/inputs.js + js/aw/calc.js — 计算器自动预填充

**Files:**
- Modify: `js/aw/inputs.js`
- Modify: `js/aw/calc.js`

- [ ] **Step 1: inputs.js — 添加 populateCalcInputsFromPositions + import**

在 `js/aw/inputs.js` 顶部（`import { PORTFOLIO, ... }` 行后）追加：
```javascript
import { getAwDynAmt } from './amounts.js';
```

然后在文件末尾 `export { buildInputs, toggleAwAlt, highlightInputs, clearHighlights };` 之前追加：

```javascript
/** 将存储的持仓金额写入计算器 #inp-{id} 输入框 */
export function populateCalcInputsFromPositions() {
  PORTFOLIO.forEach(a => {
    const active = getActiveAsset(a);
    const v      = getAwDynAmt(active.code);
    const inp    = document.getElementById('inp-' + a.id);
    if (inp && document.activeElement !== inp) {
      inp.value = v > 0 ? v : '';
    }
  });
}
```

在 `toggleAwAlt` 函数中，找到最后一行 `window.showAwToast?.(...)` 之前，追加：
```javascript
  populateCalcInputsFromPositions();
```

完整 `toggleAwAlt` 函数末尾应如下：
```javascript
  buildInputs();
  Object.entries(saved).forEach(([xid, val]) => {
    const inp = document.getElementById('inp-' + xid);
    if (inp) inp.value = val;
  });
  populateCalcInputsFromPositions();  // ← 新增
  const active = getActiveAsset(a);
  window.showAwToast?.(`已切换为：${active.name}（${active.code}）`);
```

- [ ] **Step 2: calc.js — 移除 total-assets；改用 getAwTotalAmt**

在 `js/aw/calc.js` 顶部，现有 imports 后追加：
```javascript
import { getAwAvailableAmt, getAwTotalAmt } from './aw-available.js';
import { getAwDynAmt } from './amounts.js';
```

找到 `_runCalc` 函数（约第32行），将开头的以下代码块：
```javascript
function _runCalc(checkType) {
  const inputTotal = parseFloat(document.getElementById('total-assets').value) || 0;

  const assets = {};
  for (const a of PORTFOLIO) {
    assets[a.id] = parseFloat(document.getElementById('inp-' + a.id).value) || 0;
  }

  // ── 确定有效总市值 ──
  const assetSum = Object.values(assets).reduce((s, v) => s + v, 0);

  let total, totalMode;
  if (assetSum > 0) {
    // 各类别市值之和优先（无论总市值框是否填写）
    total = assetSum;
    if (inputTotal > 0 && Math.abs(inputTotal - assetSum) > 1) {
      // 两者都填且不一致：提示已用各类别之和修正
      totalMode = `⚠ 已用各类别市值之和修正：${fmtMoney(total)}（原填 ${fmtMoney(inputTotal)}）`;
      document.getElementById('total-assets').value = total.toFixed(2);
    } else if (inputTotal <= 0) {
      totalMode = `✦ 总市值由各类别自动加总：${fmtMoney(total)}`;
      document.getElementById('total-assets').value = total.toFixed(2);
    } else {
      totalMode = `✓ 各类别加总与填写总市值一致：${fmtMoney(total)}`;
    }
  } else if (inputTotal > 0) {
    // 仅填了总市值，没有任何类别值
    total = inputTotal;
    totalMode = `各类别均未填写市值，按填写总额计算：${fmtMoney(total)}`;
  } else {
    document.getElementById('total-hint').innerHTML = '<span style="color:var(--red)">⚠ 请至少填写一项资产市值或组合总市值</span>';
    return;
  }

  // 显示总市值来源提示
  document.getElementById('total-hint').innerHTML =
    `<span style="color:var(--text-dim)">${totalMode}</span>`;
```

替换为：
```javascript
function _runCalc(checkType) {
  const assets = {};
  for (const a of PORTFOLIO) {
    assets[a.id] = parseFloat(document.getElementById('inp-' + a.id).value) || 0;
  }

  // ── 确定有效总金额（持仓 + 可用金额）──
  const assetSum = Object.values(assets).reduce((s, v) => s + v, 0);
  const available = getAwAvailableAmt();
  const total     = assetSum + available;

  if (total <= 0) {
    document.getElementById('total-hint').innerHTML =
      '<span style="color:var(--red)">⚠ 请先在标的监控中录入持仓金额，或直接填写各类别当前市值</span>';
    return;
  }

  const totalMode = `✦ 总金额 = 持仓 ${fmtMoney(assetSum)} + 可用 ${fmtMoney(available)} = ${fmtMoney(total)}`;
  document.getElementById('total-hint').innerHTML =
    `<span style="color:var(--text-dim)">${totalMode}</span>`;
```

在 `resetCalc` 函数中，找到：
```javascript
function resetCalc() {
  document.getElementById('total-assets').value = '';
  document.getElementById('total-hint').innerHTML = '';
```
替换为：
```javascript
function resetCalc() {
  document.getElementById('total-hint').innerHTML = '';
```

在汇总条渲染部分（`// ── Summary bar ──`），找到：
```javascript
  document.getElementById('calc-summary').innerHTML = anyTriggered
    ? `<span class="sum-chip sum-sell">↓ 赎回合计：${fmtMoney(totalSell)}</span>
       <span class="sum-chip sum-buy">↑ 申购合计：${fmtMoney(totalBuy)}</span>
       <span class="sum-chip sum-info" style="margin-left:auto">触发：${triggeredTypes.join(' / ')}</span>`
    : `<span class="sum-chip sum-ok">✓ 所有触发点均未触发，投资组合无需调整</span>`;
```

替换为：
```javascript
  const availableWarning = anyTriggered && totalBuy > available + totalSell
    ? `<span class="sum-chip" style="background:rgba(245,158,11,.15);color:var(--yellow)">⚠ 买入合计超出可用资金 ${fmtMoney(totalBuy - available - totalSell)}</span>`
    : '';
  document.getElementById('calc-summary').innerHTML = anyTriggered
    ? `<span class="sum-chip sum-sell">↓ 赎回合计：${fmtMoney(totalSell)}</span>
       <span class="sum-chip sum-buy">↑ 申购合计：${fmtMoney(totalBuy)}</span>
       <span class="sum-chip sum-info">可用：${fmtMoney(available)}</span>
       ${availableWarning}
       <span class="sum-chip sum-info" style="margin-left:auto">触发：${triggeredTypes.join(' / ')}</span>`
    : `<span class="sum-chip sum-ok">✓ 所有触发点均未触发，投资组合无需调整</span>`;
```

- [ ] **Step 3: 手动验证**

1. 在监控表格中输入一些持仓金额（如沪深300: 25000，中证500: 15000）
2. 点击「⚡ 计算」
3. 验证：`total-hint` 显示「持仓 ¥40,000 + 可用 ¥0 = ¥40,000」
4. 在可用金额框输入 10000
5. 再次点击计算，验证 total = 50000
6. 验证汇总条显示「可用：¥10,000」

- [ ] **Step 4: Commit**

```bash
git add js/aw/inputs.js js/aw/calc.js
git commit -m "feat(aw): calculator auto-fill from positions + incorporate available amount into total"
```

---

## Task 7: js/aw/log.js — 迁移到服务端 + 保存时应用 ops 到持仓

**Files:**
- Modify: `js/aw/log.js`

- [ ] **Step 1: 完整替换 log.js**

将 `js/aw/log.js` 整个内容替换为：

```javascript
// js/aw/log.js — 操作日志（服务端 API）
import { fmtMoney } from '../utils.js';
import { getLastCalcResult } from './calc.js';
import {
  getAwAmt, setAwAmt, getAwShares, setAwShares, getAwCost, setAwCost, saveAwAmounts,
} from './amounts.js';
import { getAwAvailableAmt, setAwAvailableAmt, refreshAwTotalDisplay } from './aw-available.js';
import { PORTFOLIO, getActiveAsset } from './config.js';
import { refreshAwAllPosPct } from './amounts.js';
import { populateCalcInputsFromPositions } from './inputs.js';

const AW_LOG_API = '/api/cache/aw-rebalance-log';

// ── 本地缓存（避免频繁请求）──────────────────────────────────
let _logCache = null;

async function _fetchLog() {
  try {
    const res = await fetch(AW_LOG_API);
    if (res.ok) _logCache = await res.json();
    else         _logCache = [];
  } catch { _logCache = []; }
  return _logCache;
}

async function _saveLog(logs) {
  _logCache = logs;
  try {
    await fetch(AW_LOG_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logs),
    });
  } catch {}
}

export async function renderLog() {
  const logs = await _fetchLog();
  const tbody = document.getElementById('log-tbody');
  if (!tbody) return;
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="log-empty">暂无操作记录 — 完成计算后点击"保存为操作记录"</td></tr>`;
    return;
  }
  tbody.innerHTML = logs.slice().reverse().map((entry, ri) => {
    const realIdx = logs.length - 1 - ri;
    const opsHtml = (entry.ops || []).map(o =>
      `<span class="op-chip ${o.op==='赎回'?'op-sell':'op-buy'}">${o.op} ${o.name} ${fmtMoney(o.amount)}</span>`
    ).join(' ');
    return `<tr>
      <td style="white-space:nowrap;font-weight:600">${entry.date}</td>
      <td style="font-size:13px;color:var(--text-dim)">${(entry.triggerTypes||[]).join('、') || '手动'}</td>
      <td style="white-space:nowrap">${fmtMoney(entry.total)}</td>
      <td><div class="log-ops-cell">${opsHtml}</div></td>
      <td style="font-size:13px;color:var(--text-dim)">${entry.note || '–'}</td>
      <td><button class="log-del-btn" onclick="deleteLog(${realIdx})">删除</button></td>
    </tr>`;
  }).join('');
}

export async function saveToLog() {
  const result = getLastCalcResult();
  if (!result) return;
  const note = prompt('备注（可选）：', '') ?? '';
  const entry = {
    date:         new Date().toISOString().slice(0, 10),
    savedAt:      new Date().toISOString(),
    total:        result.total,
    available:    getAwAvailableAmt(),
    triggerTypes: [...new Set(result.triggers)],
    ops:          result.ops,
    note,
  };

  // ── 将 ops 应用到持仓金额/份额/成本 ──────────────────────────
  _applyOpsToPositions(result.ops);

  const logs = await _fetchLog();
  logs.push(entry);
  await _saveLog(logs);
  await renderLog();
  alert('✓ 已保存操作记录，持仓已同步更新');
}

/** 根据再平衡 ops 更新持仓金额、可用金额、份额、成本 */
function _applyOpsToPositions(ops) {
  if (!ops || ops.length === 0) return;

  const buys  = ops.filter(o => o.op === '申购');
  const sells = ops.filter(o => o.op === '赎回');

  // 处理赎回：按比例缩减 amt/shares/cost
  sells.forEach(o => {
    const code    = o.code;
    const curAmt  = getAwAmt(code);
    if (curAmt <= 0) {
      // 持仓为 0 时清零防御
      setAwShares(code, 0);
      setAwCost(code, 0);
      return;
    }
    const redeemAmt  = Math.min(o.amount, curAmt);
    const ratio      = redeemAmt / curAmt;            // 赎回比例
    const newAmt     = curAmt - redeemAmt;
    const newShares  = getAwShares(code) * (1 - ratio);
    const newCost    = getAwCost(code)   * (1 - ratio);
    setAwAmt(code, newAmt);
    setAwShares(code, newShares);
    setAwCost(code, newCost);
  });

  // 处理申购：增加 amt/cost；share 计算依赖当前净值（若可用则计算）
  buys.forEach(o => {
    const code   = o.code;
    const newAmt  = getAwAmt(code) + o.amount;
    const newCost = getAwCost(code) + o.amount;
    setAwAmt(code, newAmt);
    setAwCost(code, newCost);
    // 份额：尝试从监控表格最新净值计算
    const closeEl = document.getElementById(`aw-close-${code}`);
    const nav     = closeEl ? parseFloat(closeEl.textContent) : 0;
    if (nav > 0) {
      setAwShares(code, getAwShares(code) + o.amount / nav);
    }
  });

  // 更新可用金额：available -= (totalBuy - totalSell)
  const totalBuy  = buys.reduce((s, o) => s + o.amount, 0);
  const totalSell = sells.reduce((s, o) => s + o.amount, 0);
  const newAvail  = Math.max(0, getAwAvailableAmt() - totalBuy + totalSell);
  setAwAvailableAmt(newAvail);

  // 持久化 + 刷新 UI
  saveAwAmounts();
  refreshAwAllPosPct();
  refreshAwTotalDisplay();
  populateCalcInputsFromPositions();
}

export async function deleteLog(idx) {
  if (!confirm('确认删除该条记录？')) return;
  const logs = await _fetchLog();
  logs.splice(idx, 1);
  await _saveLog(logs);
  renderLog();
}

export async function clearLog() {
  if (!confirm('确认清空所有操作记录？此操作不可撤销。')) return;
  await _saveLog([]);
  renderLog();
}
```

- [ ] **Step 2: 手动验证**

1. 在监控表格中输入持仓金额（如沪深300: 25000）
2. 点击计算 → 出现再平衡结果
3. 点击「💾 保存为操作记录」
4. 检查：
   - 操作记录表格底部出现新记录
   - 若有赎回/申购操作，监控表格的持仓金额已更新
   - `~/.investment/aw_rebalance_log.json` 文件中有新记录
   - `~/.investment/aw_amounts.json` 中金额已更新

- [ ] **Step 3: Commit**

```bash
git add js/aw/log.js
git commit -m "feat(aw): log.js — migrate to server API, apply ops to positions on save"
```

---

## Task 8: js/main.js — 集成所有新模块

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: 在 main.js 顶部 import 区添加新模块**

在现有 `import { loadAwPool, clearAndResetAw } from './aw/monitor.js';` 行后追加：

```javascript
import { loadAwAmounts, onAwAmtChange, clearAwAmt, refreshAwAllPosPct as refreshAwPosPct } from './aw/amounts.js';
import { loadAwAvailable, onAwAvailableChange, refreshAwTotalDisplay, openAwPnlDialog, closeAwPnlDialog } from './aw/aw-available.js';
import { populateCalcInputsFromPositions } from './aw/inputs.js';
```

同时将现有的 `import { renderLog, saveToLog, deleteLog, clearLog } from './aw/log.js';` 保持不变（log.js 函数签名未变）。

- [ ] **Step 2: 在 window 全局挂载中追加新函数**

找到 `Object.assign(window, {` 代码块，在「// AW 监控」区块后追加：

```javascript
  // AW 持仓金额
  onAwAmtChange, clearAwAmt,
  onAwAvailableChange,
  // AW 收益明细弹窗
  openAwPnlDialog, closeAwPnlDialog,
```

- [ ] **Step 3: 在异步初始化序列中加入 AW 持仓加载**

找到页面底部的 IIFE：
```javascript
(async () => {
  await loadAmounts();
  await loadAvailable();
  ...
  await awMaybeInitEmpty();
  initHashRouter();
})();
```

替换为：
```javascript
(async () => {
  // MDTFR 持仓初始化
  await loadAmounts();
  await loadAvailable();

  if (getSumOfPositions() === 0 && getAvailableAmt() === 0) {
    await recoverFromJournal();
  }

  refreshTotalDisplay();
  refreshAllPosPct();

  // AW 持仓初始化
  await loadAwAmounts();
  await loadAwAvailable();
  refreshAwTotalDisplay();
  refreshAwPosPct();
  populateCalcInputsFromPositions();

  await awMaybeInitEmpty();
  initHashRouter();
})();
```

- [ ] **Step 4: 手动验证完整流程**

1. 硬刷新 `http://localhost:9001/strategy#aw`
2. 验证：
   - 顶部显示「总金额：¥0」（或从 aw_amounts.json 恢复的金额）
   - 可用金额输入框为空（或恢复）
3. 点击「▶ 加载数据」
4. 数据加载后在一行输入持仓金额 → 仓位% 更新，总金额更新
5. 输入可用金额 → 总金额更新
6. 点击「⚡ 计算」→ 提示显示「总金额 = 持仓 + 可用」
7. 有再平衡触发时，点击「💾 保存操作记录」→ 持仓金额自动更新
8. 刷新页面 → 持仓金额从服务端恢复

- [ ] **Step 5: 运行现有测试，确认无回归**

```bash
python -m pytest tests/ -v
```
预期：所有测试 PASSED

- [ ] **Step 6: Commit**

```bash
git add js/main.js
git commit -m "feat(aw): main.js — wire up AW amounts/available modules in initialization"
```

---

## 验收清单

- [ ] `~/.investment/aw_amounts.json` 存储持仓金额/份额/成本/可用金额
- [ ] `~/.investment/aw_rebalance_log.json` 存储操作记录（替代 localStorage）
- [ ] AW tab 顶部显示总金额（黄色）、总收益（有成本时显示）、可用金额输入框
- [ ] 全天候监控表格有「持仓金额」可编辑列、「份额」展示列、「仓位%」展示列
- [ ] 再平衡计算器无「组合总市值」输入框；计算使用持仓 + 可用金额
- [ ] 保存操作记录时，持仓金额/可用金额/份额/成本自动更新
- [ ] 刷新页面后所有数据从服务端恢复（不依赖 localStorage）
- [ ] 收益明细弹窗（点击总收益）显示当前持仓盈亏
- [ ] 切换主力/替代标的后，计算器输入框同步更新
