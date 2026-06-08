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
