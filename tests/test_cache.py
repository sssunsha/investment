# -*- coding: utf-8 -*-
"""routers/cache.py 的单元测试 — 覆盖 upsert、日期解析、月份边界"""
import json
import pytest
from pathlib import Path

from routers.cache import (
    _parse_date,
    _read_json,
    _write_json,
    _month_dir,
)


# ── _parse_date ───────────────────────────────────────────────

class TestParseDate:
    def test_valid_date(self):
        assert _parse_date("2026-05-10") == ("2026", "05")

    def test_year_month_extracted(self):
        year, month = _parse_date("2026-12-31")
        assert year == "2026"
        assert month == "12"

    def test_invalid_format_raises(self):
        with pytest.raises(ValueError):
            _parse_date("20260510")

    def test_missing_day_raises(self):
        with pytest.raises(ValueError):
            _parse_date("2026-05")

    def test_text_raises(self):
        with pytest.raises(ValueError):
            _parse_date("not-a-date")


# ── _read_json / _write_json ──────────────────────────────────

class TestReadWriteJson:
    def test_missing_file_returns_default(self, tmp_path):
        p = tmp_path / "ghost.json"
        assert _read_json(p, []) == []
        assert _read_json(p, {}) == {}

    def test_round_trip_list(self, tmp_path):
        p = tmp_path / "data.json"
        payload = [{"key": "v1"}, {"key": "v2"}]
        _write_json(p, payload)
        assert _read_json(p, []) == payload

    def test_round_trip_dict(self, tmp_path):
        p = tmp_path / "data.json"
        payload = {"2026-05-10": [1, 2, 3]}
        _write_json(p, payload)
        assert _read_json(p, {}) == payload

    def test_corrupt_file_returns_default(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("not json", encoding="utf-8")
        assert _read_json(p, "fallback") == "fallback"


# ── journal upsert 逻辑（直接调用纯函数，不走 HTTP）────────────

def _do_upsert(records: list, new_record: dict, key: str = "data_date") -> list:
    """从 journal_post 提取的 upsert 核心逻辑"""
    idx = next((i for i, r in enumerate(records) if r.get(key) == new_record.get(key)), -1)
    if idx >= 0:
        records[idx] = new_record
    else:
        records.append(new_record)
    return records, idx


class TestJournalUpsert:
    def test_first_record_appended(self):
        records = []
        records, idx = _do_upsert(records, {"data_date": "2026-05-10", "note": "a"})
        assert len(records) == 1
        assert idx == -1  # 新增

    def test_duplicate_date_replaced(self):
        records = [{"data_date": "2026-05-10", "note": "old"}]
        records, idx = _do_upsert(records, {"data_date": "2026-05-10", "note": "new"})
        assert len(records) == 1
        assert records[0]["note"] == "new"
        assert idx == 0  # 替换位置

    def test_different_dates_both_kept(self):
        records = [{"data_date": "2026-05-09", "note": "a"}]
        records, idx = _do_upsert(records, {"data_date": "2026-05-10", "note": "b"})
        assert len(records) == 2
        assert idx == -1

    def test_multiple_upserts_keep_order(self):
        records = [
            {"data_date": "2026-05-08", "note": "a"},
            {"data_date": "2026-05-09", "note": "b"},
        ]
        records, idx = _do_upsert(records, {"data_date": "2026-05-09", "note": "b_updated"})
        assert records[1]["note"] == "b_updated"
        assert records[0]["note"] == "a"  # 前面的记录未变

    def test_month_boundary_append(self):
        records = [{"data_date": "2026-04-30", "note": "apr"}]
        records, _ = _do_upsert(records, {"data_date": "2026-05-01", "note": "may"})
        assert len(records) == 2

    def test_aw_journal_uses_date_key(self):
        records = [{"date": "2026-05-10", "action": "buy"}]
        records, idx = _do_upsert(records, {"date": "2026-05-10", "action": "sell"}, key="date")
        assert len(records) == 1
        assert records[0]["action"] == "sell"
        assert idx == 0
