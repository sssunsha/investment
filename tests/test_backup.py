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
