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
