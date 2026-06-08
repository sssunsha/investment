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
        assert row["data"]["007301"] == 5000.0  # noqa: S1244

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
