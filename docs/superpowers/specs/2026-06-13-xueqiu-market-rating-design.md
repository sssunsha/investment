# 雪球"螺丝钉"市场星级展示功能设计文档

## 功能概述

在 `home_page.html` 的 header 右上角展示博主"银行螺丝钉"（雪球 ID：3079173340）发布的最新一期"现在市场是几星级"数据，包含星级数字和对应博文链接。

---

## 后端设计

### 新增路由文件

`routers/xueqiu.py`

### 接口

```
GET /api/xueqiu/market-rating
```

### 响应结构

```json
{
  "rating": 3.9,
  "rating_text": "3.9星",
  "post_title": "[6月12日]第2909期指数估值",
  "post_url": "https://xueqiu.com/3079173340/xxxxxxx",
  "post_date": "2026-06-12",
  "fetched_date": "2026-06-13",
  "from_cache": true
}
```

失败时返回 HTTP 500，响应体：`{"error": "..."}`

### 抓取逻辑

1. 用 `requests.Session` GET `https://xueqiu.com/` 初始化 cookie
2. 请求 `/v4/statuses/user_timeline.json?user_id=3079173340&page=1&count=20`
3. 遍历动态列表，正则 `(\d+\.?\d*)星` 匹配 `description` 字段，取第一条命中结果
4. 从命中博文提取：星级数字、文章标题、文章 ID（拼接 URL：`https://xueqiu.com/3079173340/{id}`）、发布日期

### 缓存策略

- 缓存目录：`~/.investment/xueqiu/`
- 文件命名：`market_rating_YYYY-MM-DD.json`（以**今日日期**为 key）
- 读取时：检查是否存在 `market_rating_{today}.json`，存在则直接返回（`from_cache: true`）
- 写入时：抓取成功后写入当日缓存文件，同时删除所有其他 `market_rating_*.json` 旧文件
- 抓取失败时：若存在任意旧缓存文件则返回最新的一份（降级），否则抛出 HTTP 500

### 注册到主应用

在 `main.py` 中 import 并 `app.include_router(xueqiu_router.router)`

---

## 前端设计

### 修改文件

`home_page.html`

### 组件位置

插入到 `.header-status` 内部的**最左侧**（GitHub 链接之前）。

### 视觉结构

```
┌───────────────────────────────────┐
│  ★ 3.9星  [6月12日]第2909期...   │
│          螺丝钉估值 · 2026-06-12  │
└───────────────────────────────────┘
```

- 整体为 `<a>` 链接，`target="_blank" rel="noopener"`，点击跳转博文
- 星级数字用 `var(--yellow)` 高亮
- 标题超出截断（`max-width: 180px` + `text-overflow: ellipsis`）
- 加载中：显示 `检测中...` 文字
- 失败：整个组件 `display: none`，不影响 header 布局

### 前端逻辑

- `DOMContentLoaded` 时 `fetch('/api/xueqiu/market-rating')`
- 成功：渲染星级 + 标题 + 日期
- 失败（网络错误或非 2xx）：隐藏组件
- 纯内联 `<script>`，无需新建 JS 文件

---

## CSP 影响

无。所有网络请求均为后端发起，前端只调用自身 `/api/xueqiu/market-rating`，符合现有 `connect-src 'self'` 策略。

---

## 文件变更清单

| 文件 | 变更类型 |
|------|----------|
| `routers/xueqiu.py` | 新增 |
| `main.py` | 修改（注册路由） |
| `home_page.html` | 修改（header 组件 + CSS + JS） |
