# 数据备份与恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在每次写操作（amounts/journal）前自动备份当前文件内容到 NDJSON 文件，并提供 UI 弹窗和命令行脚本两种恢复途径。

**Architecture:** 后端 `routers/cache.py` 新增 `_append_backup` 工具函数，在 `amounts_put` 和 `journal_post` 中插入备份调用，同时新增 3 个备份 API（list/entry/restore）。前端新增 `js/mdtfr/backup.js` 模块驱动弹窗，脚本 `scripts/restore_backup.py` 提供离线恢复能力。

**Tech Stack:** Python / FastAPI 后端，NDJSON 文件格式，Vanilla JS ES modules，pytest 测试

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `routers/cache.py` | **修改** | 新增 `_append_backup`、`AMOUNTS_BAK_FILE`、`JOURNAL_BAK_FILE` 常量；修改 `amounts_put`/`journal_post`；新增 3 个备份 API |
| `tests/test_backup.py` | **新增** | `_append_backup` 逻辑、backup API 端点、restore 行为的单元测试 |
| `scripts/restore_backup.py` | **新增** | 离线命令行恢复脚本 |
| `js/mdtfr/backup.js` | **新增** | 备份弹窗逻辑：openBackupDialog、closeBackupDialog、loadBackupList、restoreBackup |
| `strategy_page.html` | **修改** | 新增 `backup-overlay` HTML + `💾 备份` 按钮 |
| `js/main.js` | **修改** | import backup.js，绑定 openBackupDialog/closeBackupDialog 到 window |

---

## Task 1: _append_backup 工具函数 + 备份常量

**Files:**
- Modify: `routers/cache.py`
- Test: `tests/test_backup.py`

- [ ] **Step 1: 在 tests/test_backup.py 中写 _append_backup 的失败测试**

新建文件 `tests/test_backup.py`：

```python
# -*- coding: utf-8 -*-
"""routers/cache.py 备份相关逻辑单元测试"""
import json
import pytest
from pathlib import Path


# ── _append_backup ────────────────────────────────────────────

class TestAppendBackup:
    def test_creates_file_on_first_write(self, tmp_path):
        from routers.cache import _append_backup
        bak = tmp_path / "test.bak.ndjson"
        _append_backup(bak, {"ts": "2026-01-01T00:00:00", "data": {"x": 1}})
        assert bak.exists()
        lines = bak.read_text().splitlines()
        assert len(lines) == 1
        row = json.loads(lines[0])
        assert row["data"]["x"] == 1

    def test_appends_successive_entries(self, tmp_path):
        from routers.cache import _append_backup
        bak = tmp_path / "test.bak.ndjson"
        _append_backup(bak, {"ts": "t1", "data": {"n": 1}})
        _append_backup(bak, {"ts": "t2", "data": {"n": 2}})
        lines = bak.read_text().splitlines()
        assert len(lines) == 2
        assert json.loads(lines[1])["data"]["n"] == 2

    def test_trims_to_max_lines(self, tmp_path):
        from routers.cache import _append_backup, BAK_MAX_LINES
        bak = tmp_path / "test.bak.ndjson"
        for i in range(BAK_MAX_LINES + 5):
            _append_backup(bak, {"ts": f"t{i}", "data": {"i": i}})
        lines = bak.read_text().splitlines()
        assert len(lines) == BAK_MAX_LINES
        # 最旧的 5 条被删掉，第一行应是 index=5
        assert json.loads(lines[0])["data"]["i"] == 5

    def test_newest_entry_is_last_line(self, tmp_path):
        from routers.cache import _append_backup
        bak = tmp_path / "test.bak.ndjson"
        _append_backup(bak, {"ts": "old", "data": {}})
        _append_backup(bak, {"ts": "new", "data": {"latest": True}})
        lines = bak.read_text().splitlines()
        assert json.loads(lines[-1])["ts"] == "new"
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
python -m pytest tests/test_backup.py::TestAppendBackup -v
```

期望：FAIL（`_append_backup` 和 `BAK_MAX_LINES` 未定义）

- [ ] **Step 3: 在 cache.py 中添加常量和函数**

在 `cache.py` 中，紧接 `AMOUNTS_FILE` 常量之后添加（约第 312 行附近）：

```python
AMOUNTS_BAK_FILE = CACHE_DIR / "mdtfr_amounts.bak.ndjson"
JOURNAL_BAK_FILE = CACHE_DIR / "mdtfr_journal.bak.ndjson"
BAK_MAX_LINES    = 1000


def _append_backup(bak_file: Path, entry: dict) -> None:
    """向 NDJSON 备份文件追加一行，超出 BAK_MAX_LINES 时删除最旧行"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry, ensure_ascii=False)
    lines = bak_file.read_text(encoding='utf-8').splitlines() if bak_file.exists() else []
    lines.append(line)
    if len(lines) > BAK_MAX_LINES:
        lines = lines[-BAK_MAX_LINES:]
    bak_file.write_text('\n'.join(lines) + '\n', encoding='utf-8')
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
python -m pytest tests/test_backup.py::TestAppendBackup -v
```

期望：4 passed

- [ ] **Step 5: Commit**

```bash
git add routers/cache.py tests/test_backup.py
git commit -m "feat(backup): add _append_backup utility and BAK constants to cache.py"
```

---

## Task 2: amounts_put 和 journal_post 写前备份

**Files:**
- Modify: `routers/cache.py`
- Test: `tests/test_backup.py`

- [ ] **Step 1: 写集成测试（通过 TestClient 验证备份文件被创建）**

在 `tests/test_backup.py` 末尾追加：

```python
# ── 写操作触发备份 ─────────────────────────────────────────────

class TestAmountsPutCreatesBackup:
    def test_backup_created_on_put(self, tmp_path, monkeypatch):
        import routers.cache as cache_mod
        monkeypatch.setattr(cache_mod, 'AMOUNTS_FILE',     tmp_path / "amounts.json")
        monkeypatch.setattr(cache_mod, 'AMOUNTS_BAK_FILE', tmp_path / "amounts.bak.ndjson")
        monkeypatch.setattr(cache_mod, 'CACHE_DIR',        tmp_path)

        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)

        # 先写一笔原始数据
        client.put("/api/cache/amounts", json={"007301": 5000.0})
        # 再写入新数据触发备份
        client.put("/api/cache/amounts", json={"007301": 6000.0})

        bak = tmp_path / "amounts.bak.ndjson"
        assert bak.exists()
        lines = bak.read_text().splitlines()
        assert len(lines) == 1
        row = json.loads(lines[0])
        assert row["data"]["007301"] == 5000.0

    def test_backup_not_created_when_file_empty(self, tmp_path, monkeypatch):
        """首次写入时主文件不存在，无需备份"""
        import routers.cache as cache_mod
        monkeypatch.setattr(cache_mod, 'AMOUNTS_FILE',     tmp_path / "amounts.json")
        monkeypatch.setattr(cache_mod, 'AMOUNTS_BAK_FILE', tmp_path / "amounts.bak.ndjson")
        monkeypatch.setattr(cache_mod, 'CACHE_DIR',        tmp_path)

        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        client.put("/api/cache/amounts", json={"007301": 5000.0})

        bak = tmp_path / "amounts.bak.ndjson"
        assert not bak.exists()


class TestJournalPostCreatesBackup:
    def test_backup_created_on_post(self, tmp_path, monkeypatch):
        import routers.cache as cache_mod
        monkeypatch.setattr(cache_mod, 'JOURNAL_BAK_FILE', tmp_path / "journal.bak.ndjson")
        monkeypatch.setattr(cache_mod, 'CACHE_DIR',        tmp_path)

        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)

        record1 = {"data_date": "2026-06-01", "trade_records": [{"type": "buy"}]}
        record2 = {"data_date": "2026-06-01", "trade_records": [{"type": "sell"}]}

        client.post("/api/cache/journal", json=record1)
        client.post("/api/cache/journal", json=record2)  # upsert triggers backup

        bak = tmp_path / "journal.bak.ndjson"
        assert bak.exists()
        lines = bak.read_text().splitlines()
        assert len(lines) == 1
        row = json.loads(lines[0])
        assert row["month"] == "2026-06"
        assert len(row["data"]) == 1
        assert row["data"][0]["trade_records"][0]["type"] == "buy"
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
python -m pytest tests/test_backup.py::TestAmountsPutCreatesBackup tests/test_backup.py::TestJournalPostCreatesBackup -v
```

期望：FAIL（备份文件未被创建）

- [ ] **Step 3: 修改 amounts_put，写前备份**

找到 `amounts_put`（约第 344 行），将函数体改为：

```python
@router.put("/amounts", summary="写入持仓金额（code_c → 元）")
async def amounts_put(request: Request):
    try:
        payload = await request.json()
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        # 写前备份：仅当主文件已存在时才备份
        if AMOUNTS_FILE.exists():
            existing = _read_json(AMOUNTS_FILE, {})
            if existing:
                from datetime import datetime
                _append_backup(AMOUNTS_BAK_FILE, {
                    "ts": datetime.now().isoformat(),
                    "data": existing,
                })
        _write_json(AMOUNTS_FILE, payload)
        return {"ok": True, "file": str(AMOUNTS_FILE)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入持仓金额失败: {e}")
```

- [ ] **Step 4: 修改 journal_post，写前备份**

找到 `journal_post`（约第 196 行），在 `_write_json(path, records)` 这行**之前**插入备份逻辑。将整个函数体改为：

```python
@router.post("/journal", summary="追加/更新一条复盘记录（按 data_date upsert）")
async def journal_post(request: Request):
    try:
        record = await request.json()
        data_date: str = record.get("data_date", "")
        try:
            year, month = _parse_date(data_date)
        except ValueError:
            from datetime import datetime
            now = datetime.now()
            year, month = str(now.year), f"{now.month:02d}"

        path = _journal_file(year, month)
        records: list = _read_json(path, [])
        if not isinstance(records, list):
            records = []

        # 写前备份：仅当该月 journal 已有内容时才备份
        if records:
            from datetime import datetime
            _append_backup(JOURNAL_BAK_FILE, {
                "ts": datetime.now().isoformat(),
                "month": f"{year}-{month}",
                "data": records,
            })

        # upsert：若已有相同 data_date 的记录则替换，否则追加
        idx = next((i for i, r in enumerate(records) if r.get("data_date") == data_date), -1)
        if idx >= 0:
            records[idx] = record
        else:
            records.append(record)

        _write_json(path, records)
        return {"ok": True, "total": len(records), "upserted": idx >= 0, "file": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存复盘记录失败: {e}")
```

- [ ] **Step 5: 运行测试，确认通过**

```bash
python -m pytest tests/test_backup.py -v
```

期望：全部 passed

- [ ] **Step 6: Commit**

```bash
git add routers/cache.py tests/test_backup.py
git commit -m "feat(backup): auto-backup amounts and journal before write operations"
```

---

## Task 3: 备份查询与恢复 API（3 个端点）

**Files:**
- Modify: `routers/cache.py`
- Test: `tests/test_backup.py`

- [ ] **Step 1: 写 API 测试**

在 `tests/test_backup.py` 末尾追加：

```python
# ── 备份 API ─────────────────────────────────────────────────

class TestBackupApi:
    def _setup(self, tmp_path, monkeypatch):
        import routers.cache as cache_mod
        monkeypatch.setattr(cache_mod, 'AMOUNTS_FILE',     tmp_path / "amounts.json")
        monkeypatch.setattr(cache_mod, 'AMOUNTS_BAK_FILE', tmp_path / "amounts.bak.ndjson")
        monkeypatch.setattr(cache_mod, 'JOURNAL_BAK_FILE', tmp_path / "journal.bak.ndjson")
        monkeypatch.setattr(cache_mod, 'CACHE_DIR',        tmp_path)
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app), cache_mod

    def _seed_amounts_bak(self, tmp_path, entries):
        """直接写入备份文件用于测试"""
        import json
        bak = tmp_path / "amounts.bak.ndjson"
        bak.write_text('\n'.join(json.dumps(e, ensure_ascii=False) for e in entries) + '\n')

    def test_backup_list_amounts_empty(self, tmp_path, monkeypatch):
        client, _ = self._setup(tmp_path, monkeypatch)
        resp = client.get("/api/cache/backup/list?type=amounts&limit=20")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_backup_list_amounts_returns_meta_newest_first(self, tmp_path, monkeypatch):
        client, _ = self._setup(tmp_path, monkeypatch)
        self._seed_amounts_bak(tmp_path, [
            {"ts": "2026-06-07T10:00:00", "data": {"a": 1}},
            {"ts": "2026-06-08T10:00:00", "data": {"a": 2}},
        ])
        resp = client.get("/api/cache/backup/list?type=amounts&limit=20")
        items = resp.json()
        assert len(items) == 2
        assert items[0]["index"] == 0
        assert items[0]["ts"] == "2026-06-08T10:00:00"   # newest first
        assert items[1]["ts"] == "2026-06-07T10:00:00"
        assert "data" not in items[0]                     # no full data in list

    def test_backup_list_respects_limit(self, tmp_path, monkeypatch):
        client, _ = self._setup(tmp_path, monkeypatch)
        entries = [{"ts": f"2026-06-0{i}T00:00:00", "data": {}} for i in range(1, 6)]
        self._seed_amounts_bak(tmp_path, entries)
        resp = client.get("/api/cache/backup/list?type=amounts&limit=3")
        assert len(resp.json()) == 3

    def test_backup_entry_returns_full_data(self, tmp_path, monkeypatch):
        client, _ = self._setup(tmp_path, monkeypatch)
        self._seed_amounts_bak(tmp_path, [
            {"ts": "t1", "data": {"x": 1}},
            {"ts": "t2", "data": {"x": 2}},
        ])
        resp = client.get("/api/cache/backup/entry?type=amounts&index=0")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ts"] == "t2"      # index=0 → newest
        assert body["data"]["x"] == 2

    def test_backup_entry_out_of_range_404(self, tmp_path, monkeypatch):
        client, _ = self._setup(tmp_path, monkeypatch)
        self._seed_amounts_bak(tmp_path, [{"ts": "t1", "data": {}}])
        resp = client.get("/api/cache/backup/entry?type=amounts&index=5")
        assert resp.status_code == 404

    def test_restore_writes_backup_data_to_main_file(self, tmp_path, monkeypatch):
        client, cache_mod = self._setup(tmp_path, monkeypatch)
        # 种入备份
        self._seed_amounts_bak(tmp_path, [{"ts": "t1", "data": {"007301": 5000.0}}])
        # 当前主文件有不同内容
        import json
        (tmp_path / "amounts.json").write_text(json.dumps({"007301": 9999.0}))

        resp = client.post("/api/cache/backup/restore", json={"type": "amounts", "index": 0})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        restored = json.loads((tmp_path / "amounts.json").read_text())
        assert restored["007301"] == 5000.0

    def test_restore_auto_backs_up_current_before_restoring(self, tmp_path, monkeypatch):
        client, _ = self._setup(tmp_path, monkeypatch)
        self._seed_amounts_bak(tmp_path, [{"ts": "t1", "data": {"x": 1}}])
        import json
        current = {"current_key": 42}
        (tmp_path / "amounts.json").write_text(json.dumps(current))

        client.post("/api/cache/backup/restore", json={"type": "amounts", "index": 0})

        bak_lines = (tmp_path / "amounts.bak.ndjson").read_text().splitlines()
        # 原来 1 行，restore 前再备份了当前状态，现在 2 行
        assert len(bak_lines) == 2
        last = json.loads(bak_lines[-1])
        assert last["data"]["current_key"] == 42
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
python -m pytest tests/test_backup.py::TestBackupApi -v
```

期望：FAIL（API 端点不存在）

- [ ] **Step 3: 在 cache.py 中实现 3 个备份 API**

在 `cache.py` 末尾（`aw_rebalance_log_put` 函数之后）添加：

```python
# ── 备份查询与恢复 ──────────────────────────────────────────────

def _read_bak_lines(bak_type: str) -> list[dict]:
    """读取备份文件所有行，返回解析后的 list（最旧→最新顺序）"""
    bak_file = AMOUNTS_BAK_FILE if bak_type == "amounts" else JOURNAL_BAK_FILE
    if not bak_file.exists():
        return []
    lines = bak_file.read_text(encoding='utf-8').splitlines()
    result = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            result.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return result


@router.get("/backup/list", summary="列出备份快照元信息（不含完整data）")
async def backup_list(type: str = "amounts", limit: int = 20):
    if type not in ("amounts", "journal"):
        raise HTTPException(status_code=400, detail="type 必须为 amounts 或 journal")
    rows = _read_bak_lines(type)
    # 倒序：index=0 为最新
    rows_rev = list(reversed(rows))[:limit]
    result = []
    for idx, row in enumerate(rows_rev):
        item: dict = {"index": idx, "ts": row.get("ts", "")}
        if type == "journal" and "month" in row:
            item["month"] = row["month"]
        result.append(item)
    return JSONResponse(content=result)


@router.get("/backup/entry", summary="读取单条备份完整内容")
async def backup_entry(type: str = "amounts", index: int = 0):
    if type not in ("amounts", "journal"):
        raise HTTPException(status_code=400, detail="type 必须为 amounts 或 journal")
    rows = list(reversed(_read_bak_lines(type)))
    if index >= len(rows):
        raise HTTPException(status_code=404, detail=f"备份索引 {index} 不存在，共 {len(rows)} 条")
    return JSONResponse(content=rows[index])


@router.post("/backup/restore", summary="从备份恢复主文件")
async def backup_restore(request: Request):
    try:
        body = await request.json()
        bak_type: str = body.get("type", "")
        index: int    = int(body.get("index", 0))
    except Exception:
        raise HTTPException(status_code=400, detail="请求体格式错误，需要 {type, index}")

    if bak_type not in ("amounts", "journal"):
        raise HTTPException(status_code=400, detail="type 必须为 amounts 或 journal")

    rows = list(reversed(_read_bak_lines(bak_type)))
    if index >= len(rows):
        raise HTTPException(status_code=404, detail=f"备份索引 {index} 不存在，共 {len(rows)} 条")

    entry = rows[index]
    from datetime import datetime

    if bak_type == "amounts":
        # 先把当前状态备份
        if AMOUNTS_FILE.exists():
            existing = _read_json(AMOUNTS_FILE, {})
            if existing:
                _append_backup(AMOUNTS_BAK_FILE, {"ts": datetime.now().isoformat(), "data": existing})
        _write_json(AMOUNTS_FILE, entry["data"])
    else:
        # journal：从 entry["month"] 推断目标文件
        month_str: str = entry.get("month", "")
        try:
            year, month = _parse_date(month_str + "-01")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"备份条目 month 字段无效: {month_str}")
        path = _journal_file(year, month)
        # 先把当前状态备份
        existing_records = _read_json(path, [])
        if existing_records:
            _append_backup(JOURNAL_BAK_FILE, {
                "ts": datetime.now().isoformat(),
                "month": month_str,
                "data": existing_records,
            })
        _write_json(path, entry["data"])

    return {"ok": True, "restored_ts": entry.get("ts", ""), "backup_created": True}
```

- [ ] **Step 4: 运行所有 backup 测试**

```bash
python -m pytest tests/test_backup.py -v
```

期望：全部 passed

- [ ] **Step 5: Commit**

```bash
git add routers/cache.py tests/test_backup.py
git commit -m "feat(backup): add backup list/entry/restore API endpoints"
```

---

## Task 4: 命令行恢复脚本 scripts/restore_backup.py

**Files:**
- Create: `scripts/restore_backup.py`

- [ ] **Step 1: 创建 scripts/ 目录并新建脚本**

```bash
mkdir -p /Users/I340818/workspace/personal/workspace/investment/scripts
```

创建 `scripts/restore_backup.py`：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MDTFR 数据备份恢复脚本

用法：
  python scripts/restore_backup.py --type amounts --list
  python scripts/restore_backup.py --type amounts --index 0
  python scripts/restore_backup.py --type journal --index 0 --dry-run
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

CACHE_DIR        = Path.home() / ".investment"
AMOUNTS_FILE     = CACHE_DIR / "mdtfr_amounts.json"
AMOUNTS_BAK_FILE = CACHE_DIR / "mdtfr_amounts.bak.ndjson"
JOURNAL_BAK_FILE = CACHE_DIR / "mdtfr_journal.bak.ndjson"


def _read_bak(bak_file: Path) -> list[dict]:
    if not bak_file.exists():
        return []
    rows = []
    for line in bak_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def _append_backup(bak_file: Path, entry: dict, max_lines: int = 1000) -> None:
    line = json.dumps(entry, ensure_ascii=False)
    lines = bak_file.read_text(encoding='utf-8').splitlines() if bak_file.exists() else []
    lines.append(line)
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    bak_file.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def cmd_list(bak_type: str) -> None:
    bak_file = AMOUNTS_BAK_FILE if bak_type == "amounts" else JOURNAL_BAK_FILE
    rows = list(reversed(_read_bak(bak_file)))
    if not rows:
        print(f"（无 {bak_type} 备份记录）")
        return
    print(f"{'index':<8} {'时间戳':<28} {'附加信息'}")
    print("-" * 60)
    for idx, row in enumerate(rows):
        extra = f"month={row['month']}" if "month" in row else ""
        print(f"{idx:<8} {row.get('ts', '?'):<28} {extra}")


def cmd_restore(bak_type: str, index: int, dry_run: bool) -> None:
    bak_file = AMOUNTS_BAK_FILE if bak_type == "amounts" else JOURNAL_BAK_FILE
    rows = list(reversed(_read_bak(bak_file)))

    if not rows:
        print(f"错误：找不到任何 {bak_type} 备份", file=sys.stderr)
        sys.exit(1)
    if index >= len(rows):
        print(f"错误：索引 {index} 超出范围（共 {len(rows)} 条）", file=sys.stderr)
        sys.exit(1)

    entry = rows[index]
    ts    = entry.get("ts", "?")
    data  = entry["data"]

    print(f"\n备份时间：{ts}")
    print(f"类型：{bak_type}")
    if "month" in entry:
        print(f"月份：{entry['month']}")
    print(f"数据预览：{json.dumps(data, ensure_ascii=False)[:200]}...")

    if dry_run:
        print("\n[dry-run] 未写入任何文件。")
        return

    confirm = input("\n确认恢复至此备份？(y/N): ").strip().lower()
    if confirm != "y":
        print("已取消。")
        return

    if bak_type == "amounts":
        # 先备份当前状态
        if AMOUNTS_FILE.exists():
            current = json.loads(AMOUNTS_FILE.read_text(encoding='utf-8'))
            if current:
                _append_backup(AMOUNTS_BAK_FILE, {"ts": datetime.now().isoformat(), "data": current})
                print("✓ 当前状态已备份")
        _write_json(AMOUNTS_FILE, data)
        print(f"✓ 已恢复 {AMOUNTS_FILE}")
    else:
        month_str: str = entry.get("month", "")
        if not month_str:
            print("错误：备份条目缺少 month 字段", file=sys.stderr)
            sys.exit(1)
        year, month = month_str[:4], month_str[5:7]
        journal_dir = CACHE_DIR / year / month
        journal_dir.mkdir(parents=True, exist_ok=True)
        journal_path = journal_dir / "mdtfr_journal.json"
        # 先备份当前状态
        if journal_path.exists():
            current_recs = json.loads(journal_path.read_text(encoding='utf-8'))
            if current_recs:
                _append_backup(JOURNAL_BAK_FILE, {
                    "ts": datetime.now().isoformat(),
                    "month": month_str,
                    "data": current_recs,
                })
                print("✓ 当前状态已备份")
        _write_json(journal_path, data)
        print(f"✓ 已恢复 {journal_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="MDTFR 数据备份恢复工具")
    parser.add_argument("--type",    required=True, choices=["amounts", "journal"])
    parser.add_argument("--list",    action="store_true", help="列出所有备份点")
    parser.add_argument("--index",   type=int, default=0, help="备份索引（0=最新）")
    parser.add_argument("--dry-run", action="store_true", help="预览不写入")
    args = parser.parse_args()

    if args.list:
        cmd_list(args.type)
    else:
        cmd_restore(args.type, args.index, args.dry_run)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 手动验证脚本（smoke test）**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
python scripts/restore_backup.py --type amounts --list
```

期望：列出备份点（或显示"无备份记录"）— 不报错即可。

```bash
python scripts/restore_backup.py --type amounts --index 0 --dry-run
```

期望：显示备份数据预览并提示 `[dry-run] 未写入任何文件。`

- [ ] **Step 3: Commit**

```bash
git add scripts/restore_backup.py
git commit -m "feat(backup): add restore_backup.py CLI script"
```

---

## Task 5: backup.js 前端模块

**Files:**
- Create: `js/mdtfr/backup.js`

- [ ] **Step 1: 创建 js/mdtfr/backup.js**

```js
// js/mdtfr/backup.js
// 备份管理弹窗：列出备份快照，支持恢复

import { escHtml } from '../utils.js';
import { loadAmounts, refreshAllPosPct } from './amounts.js';
import { loadAvailable, refreshTotalDisplay } from './available.js';
import { renderCorrectionStatus } from './corrections.js';

// 当前激活的 tab：'amounts' | 'journal'
let _activeTab = 'amounts';

export function openBackupDialog() {
  const overlay = document.getElementById('backup-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  _renderTabs();
  _loadList();
}

export function closeBackupDialog() {
  document.getElementById('backup-overlay')?.classList.remove('open');
}

function _renderTabs() {
  const tabs = document.getElementById('backup-tabs');
  if (!tabs) return;
  const mk = (type, label) => {
    const active = _activeTab === type;
    return `<button onclick="window._backupSwitchTab('${type}')"
      style="padding:6px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;
             border:1px solid ${active ? 'rgba(168,85,247,.6)' : 'rgba(255,255,255,.15)'};
             background:${active ? 'rgba(168,85,247,.15)' : 'transparent'};
             color:${active ? 'var(--purple)' : 'var(--text-dim)'}">
      ${label}
    </button>`;
  };
  tabs.innerHTML = mk('amounts', '📊 持仓 & 资金') + mk('journal', '📋 操作历史');
}

window._backupSwitchTab = function(type) {
  _activeTab = type;
  _renderTabs();
  _loadList();
};

async function _loadList() {
  const body = document.getElementById('backup-body');
  if (!body) return;
  body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0;text-align:center">加载中...</div>';
  try {
    const res = await fetch(`/api/cache/backup/list?type=${_activeTab}&limit=20`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();

    if (items.length === 0) {
      body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0;text-align:center">暂无备份记录</div>';
      return;
    }

    const jth = t => `<th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
    const jtd = t => `<td style="padding:8px 10px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.04)">${t}</td>`;

    const rows = items.map(item => {
      const dt   = new Date(item.ts);
      const tsStr = isNaN(dt) ? item.ts : `${dt.toLocaleDateString('zh-CN')} ${dt.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
      const extra = item.month ? `<span style="color:var(--text-dim);font-size:12px">${item.month}</span>` : '';
      return `<tr>
        ${jtd(`<span style="color:var(--text)">${tsStr}</span>`)}
        ${jtd(extra)}
        ${jtd(`<button onclick="window._backupRestore(${item.index})"
          style="padding:4px 12px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;
                 border:1px solid rgba(168,85,247,.4);background:rgba(168,85,247,.1);color:var(--purple)">
          恢复至此
        </button>`)}
      </tr>`;
    }).join('');

    body.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${jth('备份时间')}${jth('附加信息')}${jth('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:12px;padding:10px 12px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:6px;font-size:12px;color:var(--yellow)">
        ⚠ 恢复操作不可逆。执行前当前状态会被自动备份一次。
      </div>`;
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px 0">加载失败: ${escHtml(e.message)}</div>`;
  }
}

window._backupRestore = function(index) {
  const type = _activeTab;
  if (typeof window.showConfirm === 'function') {
    window.showConfirm(
      `确认恢复至该备份？\n当前状态将被自动备份后覆盖。`,
      async () => { await _doRestore(type, index); },
      '恢复'
    );
  } else {
    if (!confirm('确认恢复至该备份？当前状态将被自动备份后覆盖。')) return;
    _doRestore(type, index);
  }
};

async function _doRestore(type, index) {
  try {
    const res = await fetch('/api/cache/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, index }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 恢复成功：刷新持仓/资金数据
    if (type === 'amounts') {
      await loadAmounts();
      await loadAvailable();
      refreshAllPosPct();
      refreshTotalDisplay();
      renderCorrectionStatus();
    }

    closeBackupDialog();

    // 显示 toast
    const { showToast } = await import('./journal.js');
    showToast(`✅ 已恢复至 ${data.restored_ts?.slice(0, 19) || '备份'}`, 'var(--green)');
  } catch(e) {
    const { showToast } = await import('./journal.js');
    showToast(`❌ 恢复失败: ${e.message}`, 'var(--red)');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/mdtfr/backup.js
git commit -m "feat(backup): add backup.js frontend module"
```

---

## Task 6: strategy_page.html + main.js 集成

**Files:**
- Modify: `strategy_page.html`
- Modify: `js/main.js`

- [ ] **Step 1: 在 strategy_page.html 中新增 backup-overlay**

找到 `correction-overlay` 结束标签之后，插入：

```html
<!-- 备份管理弹窗 -->
<div id="backup-overlay" class="journal-overlay" onclick="if(event.target===this)closeBackupDialog()">
  <div class="journal-modal">
    <div class="journal-modal-head">
      <span style="font-size:18px;font-weight:700;flex:1">💾 数据备份与恢复</span>
      <button onclick="closeBackupDialog()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:5px 12px;border-radius:6px;font-size:13px;cursor:pointer">✕ 关闭</button>
    </div>
    <div class="journal-table-wrap">
      <div id="backup-tabs" style="display:flex;gap:8px;margin-bottom:16px"></div>
      <div id="backup-body"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 在 section-actions 中新增 💾 备份按钮**

找到 `section-actions` div 中调试按钮（`🐛 调试`）这行，在其**之前**插入：

```html
<button class="btn btn-ghost btn-sm" onclick="openBackupDialog()" title="数据备份与恢复">💾 备份</button>
```

完整的 `section-actions` 应为：

```html
<div class="section-actions">
  <button class="btn btn-ghost btn-sm" onclick="openBackupDialog()" title="数据备份与恢复">💾 备份</button>
  <button class="btn btn-ghost btn-sm" id="mdtfr-debug-btn" onclick="toggleMdtfrDebug()">🐛 调试</button>
  <button class="btn btn-ghost btn-sm" onclick="showConfirm('确认清空今日缓存数据？下次加载将重新获取行情。', clearMdtfrCache, '清空')" style="border-color:var(--red);color:var(--red)">🗑 清空数据</button>
  <button class="btn btn-primary" id="mdtfr-btn" onclick="loadMdtfrPool()">▶ 加载数据</button>
</div>
```

- [ ] **Step 3: 在 main.js 中 import 并绑定**

在 `js/main.js` 的 import 块末尾（`closeCorrectionDialog` import 之后）添加：

```js
import { openBackupDialog, closeBackupDialog } from './mdtfr/backup.js';
```

在 `Object.assign(window, { ... })` 块中，找到 `closeCorrectionDialog` 行之后添加：

```js
  // 备份管理弹窗
  openBackupDialog, closeBackupDialog,
```

- [ ] **Step 4: 手动验证页面**

服务器已运行（http://localhost:9001）。打开 http://localhost:9001/strategy#mdtfr：

1. 确认 `section-actions` 工具栏出现 `💾 备份` 按钮
2. 点击按钮 → 弹窗打开，显示两个 Tab
3. 切换 Tab → 列表刷新
4. 点击背景 → 弹窗关闭

- [ ] **Step 5: Commit**

```bash
git add strategy_page.html js/main.js
git commit -m "feat(backup): integrate backup dialog into strategy page and main.js"
```

---

## Task 7: 运行完整测试套件

- [ ] **Step 1: 运行全量测试**

```bash
cd /Users/I340818/workspace/personal/workspace/investment
python -m pytest tests/test_backup.py tests/test_cache.py -v
```

期望：全部 passed（test_backup.py 全部通过，test_cache.py 不受影响）

- [ ] **Step 2: 运行全量回归测试**

```bash
python -m pytest --ignore=test_fund_enhanced.py -q
```

期望：113+ passed，0 failed（pre-existing error in test_fund_enhanced.py 忽略）

- [ ] **Step 3: 手动端对端验证**

1. 打开 http://localhost:9001/strategy#mdtfr，加载数据
2. 确认一笔交易（任意），触发 `PUT /api/cache/amounts`
3. 检查 `~/.investment/mdtfr_amounts.bak.ndjson` 存在且有一行
4. 打开 `💾 备份` 弹窗，切换持仓 & 资金 Tab → 显示 1 条备份记录
5. 点击「恢复至此」→ 二次确认 → 恢复成功 toast 显示
6. 命令行验证：`python scripts/restore_backup.py --type amounts --list`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(backup): T+1 auto-backup system — end-to-end verified"
```
