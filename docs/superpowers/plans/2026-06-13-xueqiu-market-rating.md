# 雪球螺丝钉市场星级展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 home_page.html header 右上角展示"银行螺丝钉"最新市场星级数据，含博文链接，后端以日期为 key 缓存。

**Architecture:** 新增 `routers/xueqiu.py` 处理抓取与缓存逻辑，注册到 `main.py`，`home_page.html` 在 DOMContentLoaded 时 fetch 并渲染。抓取流程：先初始化雪球 session cookie，再请求用户动态 JSON API，正则提取星级。

**Tech Stack:** Python `requests`, `re`, `json`, `pathlib`; FastAPI `APIRouter`; 原生 JS `fetch`

---

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `routers/xueqiu.py` | 新增：抓取逻辑 + 缓存 + APIRouter |
| `main.py` | 修改：import xueqiu router 并注册 |
| `home_page.html` | 修改：header CSS + 星级组件 HTML + fetch JS |
| `tests/test_xueqiu.py` | 新增：单元测试 |

---

## Task 1: 编写 `routers/xueqiu.py` 的单元测试（失败态）

**Files:**
- Create: `tests/test_xueqiu.py`

- [ ] **Step 1: 新建测试文件**

```python
# tests/test_xueqiu.py
import json
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path


# ── 辅助：构造雪球 API 返回的动态列表 ────────────────────────────────────────

def _make_timeline(statuses: list) -> dict:
    return {"statuses": statuses}


def _make_status(sid: int, description: str, title: str = "", created_at: int = 1749686400000):
    """created_at 单位为毫秒时间戳，默认 2026-06-12"""
    return {
        "id": sid,
        "title": title,
        "description": description,
        "created_at": created_at,
    }


# ── 导入被测模块（此时还不存在，测试应失败）──────────────────────────────────

from routers.xueqiu import (
    _fetch_market_rating,
    _today_cache_path,
    _read_today_cache,
    _write_cache,
    _purge_old_caches,
    XUEQIU_CACHE_DIR,
)


# ── _fetch_market_rating ─────────────────────────────────────────────────────

def test_fetch_parses_rating_from_description():
    """description 含 '3.9星' 时正确解析"""
    timeline = _make_timeline([
        _make_status(123456, "今天大盘上涨，回到3.9星。大中小盘都上涨。", "[6月12日]第2909期指数估值"),
    ])
    mock_resp = MagicMock()
    mock_resp.json.return_value = timeline
    mock_resp.raise_for_status = MagicMock()

    mock_session = MagicMock()
    mock_session.get.return_value = mock_resp

    with patch("routers.xueqiu.requests.Session", return_value=mock_session):
        result = _fetch_market_rating()

    assert result["rating"] == 3.9
    assert result["rating_text"] == "3.9星"
    assert result["post_url"] == "https://xueqiu.com/3079173340/123456"
    assert result["post_title"] == "[6月12日]第2909期指数估值"


def test_fetch_parses_integer_rating():
    """description 含 '4星' 时解析为 4.0"""
    timeline = _make_timeline([
        _make_status(99, "市场回到4星。", ""),
    ])
    mock_resp = MagicMock()
    mock_resp.json.return_value = timeline
    mock_resp.raise_for_status = MagicMock()
    mock_session = MagicMock()
    mock_session.get.return_value = mock_resp

    with patch("routers.xueqiu.requests.Session", return_value=mock_session):
        result = _fetch_market_rating()

    assert result["rating"] == 4.0


def test_fetch_skips_status_without_rating():
    """第一条无星级，第二条有星级，应取第二条"""
    timeline = _make_timeline([
        _make_status(1, "无关内容"),
        _make_status(2, "市场3.5星，值得关注。", "[6月11日]第2908期"),
    ])
    mock_resp = MagicMock()
    mock_resp.json.return_value = timeline
    mock_resp.raise_for_status = MagicMock()
    mock_session = MagicMock()
    mock_session.get.return_value = mock_resp

    with patch("routers.xueqiu.requests.Session", return_value=mock_session):
        result = _fetch_market_rating()

    assert result["rating"] == 3.5
    assert result["post_url"] == "https://xueqiu.com/3079173340/2"


def test_fetch_raises_when_no_rating_found():
    """所有动态均无星级时抛出 ValueError"""
    timeline = _make_timeline([
        _make_status(1, "无关内容"),
        _make_status(2, "还是无关"),
    ])
    mock_resp = MagicMock()
    mock_resp.json.return_value = timeline
    mock_resp.raise_for_status = MagicMock()
    mock_session = MagicMock()
    mock_session.get.return_value = mock_resp

    with patch("routers.xueqiu.requests.Session", return_value=mock_session):
        with pytest.raises(ValueError, match="未找到"):
            _fetch_market_rating()


# ── 缓存工具函数 ─────────────────────────────────────────────────────────────

def test_today_cache_path_contains_today(tmp_path):
    """缓存路径包含今日日期"""
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    with patch("routers.xueqiu.XUEQIU_CACHE_DIR", tmp_path):
        path = _today_cache_path()
    assert today in path.name


def test_read_today_cache_returns_none_when_missing(tmp_path):
    with patch("routers.xueqiu.XUEQIU_CACHE_DIR", tmp_path):
        assert _read_today_cache() is None


def test_write_and_read_cache_roundtrip(tmp_path):
    data = {"rating": 3.9, "rating_text": "3.9星"}
    with patch("routers.xueqiu.XUEQIU_CACHE_DIR", tmp_path):
        _write_cache(data)
        result = _read_today_cache()
    assert result["rating"] == 3.9


def test_purge_old_caches_removes_stale_files(tmp_path):
    """写入旧日期文件后 purge 应将其删除，保留今日文件"""
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    stale = tmp_path / "market_rating_2020-01-01.json"
    stale.write_text("{}")
    today_file = tmp_path / f"market_rating_{today}.json"
    today_file.write_text("{}")

    with patch("routers.xueqiu.XUEQIU_CACHE_DIR", tmp_path):
        _purge_old_caches()

    assert not stale.exists()
    assert today_file.exists()
```

- [ ] **Step 2: 运行测试，确认失败（模块不存在）**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
source venv/bin/activate
pytest tests/test_xueqiu.py -v 2>&1 | head -30
```

期望输出包含：`ModuleNotFoundError` 或 `ImportError: cannot import name`

---

## Task 2: 实现 `routers/xueqiu.py`

**Files:**
- Create: `routers/xueqiu.py`

- [ ] **Step 1: 创建路由文件**

```python
# routers/xueqiu.py
# -*- coding: utf-8 -*-
import re
import json
import logging
from datetime import datetime
from pathlib import Path

import requests
from fastapi import APIRouter
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

XUEQIU_USER_ID = "3079173340"
XUEQIU_CACHE_DIR = Path.home() / ".investment" / "xueqiu"
XUEQIU_CACHE_DIR.mkdir(parents=True, exist_ok=True)

_RATING_RE = re.compile(r"(\d+\.?\d*)星")

router = APIRouter(prefix="/api/xueqiu", tags=["雪球数据"])


# ── 缓存工具 ──────────────────────────────────────────────────────────────────

def _today_cache_path() -> Path:
    today = datetime.now().strftime("%Y-%m-%d")
    return XUEQIU_CACHE_DIR / f"market_rating_{today}.json"


def _read_today_cache():
    path = _today_cache_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("读取雪球缓存失败: %s", e)
        return None


def _write_cache(data: dict) -> None:
    path = _today_cache_path()
    try:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.error("写入雪球缓存失败: %s", e)


def _purge_old_caches() -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    for f in XUEQIU_CACHE_DIR.glob("market_rating_*.json"):
        if today not in f.name:
            try:
                f.unlink()
            except Exception as e:
                logger.warning("删除旧缓存失败: %s", e)


def _read_any_cache():
    """降级：返回目录中最新的任意缓存文件内容"""
    files = sorted(XUEQIU_CACHE_DIR.glob("market_rating_*.json"), reverse=True)
    for f in files:
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
    return None


# ── 抓取逻辑 ──────────────────────────────────────────────────────────────────

def _fetch_market_rating() -> dict:
    """
    从雪球抓取最新一篇含星级的动态。
    返回 dict，找不到时抛出 ValueError。
    """
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://xueqiu.com",
    })
    # 初始化 cookie
    session.get("https://xueqiu.com/", timeout=10)

    url = (
        f"https://xueqiu.com/v4/statuses/user_timeline.json"
        f"?user_id={XUEQIU_USER_ID}&page=1&count=20"
    )
    resp = session.get(url, timeout=10)
    resp.raise_for_status()
    statuses = resp.json().get("statuses", [])

    for status in statuses:
        description = status.get("description", "")
        m = _RATING_RE.search(description)
        if not m:
            continue

        rating = float(m.group(1))
        sid = status.get("id", "")
        title = status.get("title", "") or description[:30]
        created_ms = status.get("created_at", 0)
        try:
            post_date = datetime.fromtimestamp(created_ms / 1000).strftime("%Y-%m-%d")
        except Exception:
            post_date = ""

        return {
            "rating": rating,
            "rating_text": f"{rating}星",
            "post_title": title,
            "post_url": f"https://xueqiu.com/{XUEQIU_USER_ID}/{sid}",
            "post_date": post_date,
            "fetched_date": datetime.now().strftime("%Y-%m-%d"),
            "from_cache": False,
        }

    raise ValueError("未找到含星级的动态")


# ── API 端点 ──────────────────────────────────────────────────────────────────

@router.get("/market-rating", summary="获取螺丝钉最新市场星级")
async def get_market_rating():
    """
    返回银行螺丝钉最新一期市场星级。
    优先读取今日缓存，无缓存则抓取雪球并写入。
    """
    cached = _read_today_cache()
    if cached:
        cached["from_cache"] = True
        return JSONResponse(content=cached)

    try:
        data = _fetch_market_rating()
        _write_cache(data)
        _purge_old_caches()
        return JSONResponse(content=data)
    except Exception as e:
        logger.error("抓取螺丝钉星级失败: %s", e)
        stale = _read_any_cache()
        if stale:
            stale["from_cache"] = True
            stale["stale"] = True
            return JSONResponse(content=stale)
        return JSONResponse(status_code=500, content={"error": str(e)})
```

- [ ] **Step 2: 运行测试，确认全部通过**

```bash
pytest tests/test_xueqiu.py -v
```

期望输出：所有测试 `PASSED`

- [ ] **Step 3: 提交**

```bash
git add routers/xueqiu.py tests/test_xueqiu.py
git commit -m "feat(xueqiu): add market-rating scraper with daily cache"
```

---

## Task 3: 注册路由到 `main.py`

**Files:**
- Modify: `main.py`（两处：import 行 ~37，include_router 行 ~267）

- [ ] **Step 1: 在 import 块末尾添加一行**

在 `main.py` 第 37 行附近，找到：
```python
from routers import indicators as indicators_router
```
在其**后**添加：
```python
from routers import xueqiu as xueqiu_router
```

- [ ] **Step 2: 在 include_router 块末尾添加一行**

找到：
```python
app.include_router(indicators_router.router)     # 投资指标爬虫
```
在其**后**添加：
```python
app.include_router(xueqiu_router.router)         # 雪球螺丝钉数据
```

- [ ] **Step 3: 验证服务器可启动（无 ImportError）**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
source venv/bin/activate
python -c "from main import app; print('OK')"
```

期望输出：`OK`

- [ ] **Step 4: 提交**

```bash
git add main.py
git commit -m "feat(xueqiu): register xueqiu router in main app"
```

---

## Task 4: 修改 `home_page.html`

**Files:**
- Modify: `home_page.html`

### Step 1: 添加 CSS

- [ ] 找到 `.github-link:hover` 规则（约第 80 行），在其**后**插入：

```css
  /* ── 螺丝钉星级 ── */
  .luosidin-rating {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    color: var(--text-dim);
    text-decoration: none;
    font-size: 12px;
    transition: border-color .2s, color .2s;
    white-space: nowrap;
  }
  .luosidin-rating:hover { border-color: var(--yellow); color: var(--text); }
  .luosidin-rating-top { display: flex; align-items: center; gap: 6px; }
  .luosidin-star { color: var(--yellow); font-size: 14px; font-weight: 700; }
  .luosidin-title {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .luosidin-meta { font-size: 11px; color: var(--text-dim); text-align: right; }
```

### Step 2: 添加 HTML 组件

- [ ] 找到 header-status div（约第 269 行）：

```html
  <div class="header-status">
    <a class="github-link" href="https://github.com/sssunsha/investment" target="_blank" rel="noopener">
```

在 `<a class="github-link"` 的**前面**插入（作为 header-status 的第一个子元素）：

```html
    <a class="luosidin-rating" id="luosidin-rating" href="#" target="_blank" rel="noopener" style="display:none">
      <div class="luosidin-rating-top">
        <span class="luosidin-star" id="luosidin-star">★</span>
        <span class="luosidin-title" id="luosidin-title"></span>
      </div>
      <div class="luosidin-meta" id="luosidin-meta">螺丝钉估值</div>
    </a>
```

### Step 3: 添加 JS

- [ ] 找到页面底部的 `<script>` 块（约第 440 行附近），在 `DOMContentLoaded` 回调内，`fetch('/api/session/status')` 调用的**前面**插入：

```javascript
  // 螺丝钉市场星级
  fetch('/api/xueqiu/market-rating')
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (!d || d.error) return;
      const el = document.getElementById('luosidin-rating');
      document.getElementById('luosidin-star').textContent = '★ ' + d.rating_text;
      document.getElementById('luosidin-title').textContent = d.post_title;
      document.getElementById('luosidin-meta').textContent =
        '螺丝钉估值 · ' + (d.post_date || d.fetched_date);
      el.href = d.post_url;
      el.style.display = 'inline-flex';
    })
    .catch(() => {});
```

- [ ] **Step 4: 提交**

```bash
git add home_page.html
git commit -m "feat(xueqiu): add luosidin market-rating widget in homepage header"
```

---

## Task 5: 端到端冒烟测试

- [ ] **Step 1: 启动服务**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

- [ ] **Step 2: 直接调用 API**

新终端：
```bash
curl -s http://localhost:8000/api/xueqiu/market-rating | python3 -m json.tool
```

期望：返回含 `rating`、`post_url`、`post_title` 的 JSON，`from_cache` 为 `false`（首次）

- [ ] **Step 3: 再次调用，验证缓存命中**

```bash
curl -s http://localhost:8000/api/xueqiu/market-rating | python3 -m json.tool
```

期望：`from_cache` 为 `true`

- [ ] **Step 4: 打开首页，确认星级组件显示**

浏览器访问 `http://localhost:8000`，确认 header 右上角出现 `★ X.X星` 卡片，点击可跳转博文。
