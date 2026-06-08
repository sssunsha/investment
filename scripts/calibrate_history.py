#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MDTFR 历史交易数据 T+1 净值校准脚本

用法：
  python scripts/calibrate_history.py --dry-run
  python scripts/calibrate_history.py
  python scripts/calibrate_history.py --code 007301
  python scripts/calibrate_history.py --force
"""
import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

CACHE_DIR        = Path.home() / ".investment"
AMOUNTS_FILE     = CACHE_DIR / "mdtfr_amounts.json"
AMOUNTS_BAK_FILE = CACHE_DIR / "mdtfr_amounts.bak.ndjson"
JOURNAL_BAK_FILE = CACHE_DIR / "mdtfr_journal.bak.ndjson"


def lookup_real_price(
    code_c: str,
    trade_date: str,
    cache_dir: Path = CACHE_DIR,
    use_api: bool = True,
) -> float | None:
    """
    查询 trade_date 当天的真实收盘价。

    优先级：
    1. pool 缓存：遍历所有月份 pool 文件，找 item.latest_date == trade_date 的条目
    2. 天天基金 API（use_api=True 时）
    返回 None 表示找不到。
    """
    year = trade_date[:4]
    # 搜索范围：trade_date 所在年的所有月份，以及前一年最后几个月
    for y in [year, str(int(year) - 1)]:
        base = cache_dir / y
        if not base.exists():
            continue
        for month_dir in sorted(base.iterdir()):
            pool_file = month_dir / "mdtfr_pool.json"
            if not pool_file.exists():
                continue
            try:
                monthly: dict = json.loads(pool_file.read_text(encoding='utf-8'))
            except Exception:
                continue
            for _key, items in monthly.items():
                if not isinstance(items, list):
                    continue
                for item in items:
                    if (item.get('code_c') == code_c
                            and item.get('latest_date') == trade_date
                            and item.get('latest_close') is not None):
                        return float(item['latest_close'])

    if not use_api:
        return None

    # 回退：天天基金 API
    try:
        project_root = Path(__file__).parent.parent
        if str(project_root) not in sys.path:
            sys.path.insert(0, str(project_root))
        from services.fund_nav import fetch_fund_nav_series
        end_date = (datetime.strptime(trade_date, '%Y-%m-%d') + timedelta(days=3)).strftime('%Y-%m-%d')
        rows = fetch_fund_nav_series(code_c, trade_date, end_date)
        for row in rows:
            if row.get('date') == trade_date:
                return float(row['close'])
    except Exception as e:
        print(f"  ⚠ API 查询失败 ({code_c} {trade_date}): {e}", file=sys.stderr)

    return None


def run_cascade(
    trades: list[dict],
    price_map: dict,
) -> list[dict]:
    """
    按时间顺序级联重算所有 trade 的真实 shares/pnl。

    price_map: {(code_c, data_date): real_price}
    返回每条 trade 的副本，新增字段：
      real_price  — 真实净值（float）
      real_shares — 真实份额（float）
      real_pnl    — 真实盈亏（float | None，buy 为 None）
      _state_before — 该笔前的持仓快照 {shares, cost}
      skipped     — True 表示跳过（无价格 or 卖出时无持仓）
    """
    state: dict[str, dict] = {}   # code_c -> {shares, cost}
    results = []

    for trade in sorted(trades, key=lambda t: t['data_date']):
        code_c     = trade['code_c']
        trade_type = trade['type']
        amt        = float(trade['amt'])
        data_date  = trade['data_date']

        if code_c not in state:
            state[code_c] = {"shares": 0.0, "cost": 0.0}

        real_price = price_map.get((code_c, data_date))
        out = {**trade, "_state_before": dict(state[code_c])}

        if real_price is None:
            out["skipped"] = True
            out["skip_reason"] = "价格未找到"
            results.append(out)
            continue

        out["real_price"] = real_price

        if trade_type == "buy":
            real_shares = amt / real_price
            state[code_c]["shares"] += real_shares
            state[code_c]["cost"]   += amt
            out["real_shares"] = real_shares
            out["real_pnl"]    = None
            out["skipped"]     = False

        elif trade_type == "sell":
            prev_shares = state[code_c]["shares"]
            prev_cost   = state[code_c]["cost"]

            if prev_shares <= 0:
                out["skipped"]     = True
                out["skip_reason"] = "卖出时持仓为零"
                results.append(out)
                continue

            mkt_val     = prev_shares * real_price
            ratio       = min(amt / mkt_val, 1.0) if mkt_val > 0 else 0.0
            sold_shares = prev_shares * ratio
            cost_basis  = prev_cost   * ratio
            real_pnl    = amt - cost_basis

            state[code_c]["shares"] = max(0.0, prev_shares - sold_shares)
            state[code_c]["cost"]   = max(0.0, prev_cost   - cost_basis)

            out["real_shares"]  = sold_shares
            out["real_pnl"]     = real_pnl
            out["_cost_basis"]  = cost_basis
            out["skipped"]      = False
        else:
            out["skipped"]     = True
            out["skip_reason"] = f"未知交易类型: {trade_type}"

        results.append(out)

    results.append({"_final_state": state})
    return results


# ── 备份工具（独立，不依赖 routers/cache.py）──────────────────

def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return default


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def _append_bak(bak_file: Path, entry: dict, max_lines: int = 1000) -> None:
    line = json.dumps(entry, ensure_ascii=False)
    lines = bak_file.read_text(encoding='utf-8').splitlines() if bak_file.exists() else []
    lines.append(line)
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    bak_file.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def _ensure_backups() -> bool:
    """确保备份文件存在，若无则自动创建当前快照。返回 True 表示备份已就绪。"""
    for bak_file, main_file, bak_type in [
        (AMOUNTS_BAK_FILE, AMOUNTS_FILE, "amounts"),
        (JOURNAL_BAK_FILE, None, "journal"),
    ]:
        if bak_file.exists():
            lines = [ln for ln in bak_file.read_text().splitlines() if ln.strip()]
            if lines:
                continue  # 已有备份
        # 自动创建备份
        if bak_type == "amounts" and main_file and main_file.exists():
            data = _read_json(main_file, {})
            if data:
                _append_bak(bak_file, {"ts": datetime.now().isoformat(), "data": data})
                print(f"✓ 已自动备份 {bak_type}")
                continue
        # journal 备份：遍历所有月份
        if bak_type == "journal":
            for year_dir in sorted(CACHE_DIR.iterdir()):
                if not year_dir.is_dir() or not year_dir.name.isdigit():
                    continue
                for month_dir in sorted(year_dir.iterdir()):
                    jf = month_dir / "mdtfr_journal.json"
                    if not jf.exists():
                        continue
                    records = _read_json(jf, [])
                    if records:
                        month_str = f"{year_dir.name}-{month_dir.name}"
                        _append_bak(JOURNAL_BAK_FILE, {
                            "ts": datetime.now().isoformat(),
                            "month": month_str,
                            "data": records,
                        })
            print("✓ 已自动备份 journal")
    return True


# ── Journal 读取 ───────────────────────────────────────────────

def collect_journal_trades(
    filter_code: str | None = None,
    force: bool = False,
    cache_dir: Path = CACHE_DIR,
) -> list[dict]:
    """
    从所有月份 journal 文件中收集 trade_records，返回按 data_date 排序的列表。
    force=False 时跳过 settled=True 的记录。
    """
    trades = []
    for year_dir in sorted(cache_dir.iterdir()):
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue
        for month_dir in sorted(year_dir.iterdir()):
            jf = month_dir / "mdtfr_journal.json"
            if not jf.exists():
                continue
            records = _read_json(jf, [])
            if not isinstance(records, list):
                continue
            for rec in records:
                data_date = rec.get("data_date", "")
                for tr in rec.get("trade_records", []):
                    code_c = tr.get("code_c", "")
                    if filter_code and code_c != filter_code:
                        continue
                    if not force and tr.get("settled"):
                        continue
                    trades.append({
                        "data_date": data_date,
                        "type":      tr.get("type", ""),
                        "code_c":    code_c,
                        "name":      tr.get("name", ""),
                        "amt":       float(tr.get("amt") or 0),
                        "shares":    float(tr.get("shares") or 0),
                        "price":     tr.get("price"),
                        "pnl":       tr.get("pnl"),
                        "_rec_data_date": data_date,
                    })
    return sorted(trades, key=lambda t: t["data_date"])


# ── 价格查询（批量）──────────────────────────────────────────────

def build_price_map(
    trades: list[dict],
    cache_dir: Path = CACHE_DIR,
) -> dict:
    """
    为每笔 trade 查询真实 T 日净值，返回 {(code_c, data_date): price}。
    找不到时不包含该键。
    """
    needed = {(t["code_c"], t["data_date"]) for t in trades}
    price_map = {}
    for code_c, data_date in sorted(needed):
        price = lookup_real_price(code_c, data_date, cache_dir=cache_dir)
        if price is not None:
            price_map[(code_c, data_date)] = price
        else:
            print(f"  ⚠ 未找到 {code_c} 在 {data_date} 的净值，将跳过该笔", file=sys.stderr)
    return price_map


# ── 预览输出 ───────────────────────────────────────────────────

def print_preview(results: list[dict]) -> None:
    print("\n=== 校准预览（dry-run，未写入）===\n")
    fmt_y = lambda n: f"¥{n:,.2f}" if n is not None else "–"
    fmt_n = lambda n: f"{n:,.4f}" if n is not None else "–"

    for r in results:
        if "_final_state" in r:
            state = r["_final_state"]
            print("\n最终持仓（校准后）:")
            for code_c, s in state.items():
                shares = s["shares"]
                cost   = s["cost"]
                if shares > 0.001:
                    print(f"  {code_c}: {fmt_n(shares)} 份  成本: {fmt_y(cost)}")
                else:
                    print(f"  {code_c}: 0 份（已清仓）")
            continue

        if r.get("skipped"):
            reason = r.get("skip_reason", "")
            print(f"[{r['data_date']}] ⚠ 跳过 {r['name']} ({r['code_c']})  原因: {reason}")
            continue

        trade_type = r["type"]
        label      = "买入" if trade_type == "buy" else "卖出"
        old_price  = r.get("price")
        new_price  = r.get("real_price")
        old_shares = r.get("shares")
        new_shares = r.get("real_shares")
        delta      = (new_shares - old_shares) if (new_shares is not None and old_shares is not None) else None

        print(f"[{r['data_date']}] {label} {r['name']} ({r['code_c']})  amt={fmt_y(r['amt'])}")
        print(f"  净值:  {old_price} → {new_price}")
        delta_str = f"  ({'+' if (delta or 0) >= 0 else ''}{fmt_n(delta)})" if delta is not None else ""
        print(f"  份额:  {fmt_n(old_shares)} → {fmt_n(new_shares)}{delta_str}")
        if trade_type == "sell":
            old_pnl = r.get("pnl")
            new_pnl = r.get("real_pnl")
            print(f"  收益:  {fmt_y(old_pnl)} → {fmt_y(new_pnl)}")
        print()


# ── 写入 ──────────────────────────────────────────────────────

def apply_calibration(results: list[dict], cache_dir: Path = CACHE_DIR) -> None:
    """将校准结果写入 journal 和 amounts.json"""
    # 提取最终 state
    final_state_entry = next((r for r in results if "_final_state" in r), None)
    final_state = final_state_entry["_final_state"] if final_state_entry else {}

    # ── 更新 journal ────────────────────────────────────────────
    journal_updates: dict[str, dict[str, dict]] = {}  # month_str -> {data_date -> {code_c -> fields}}
    for r in results:
        if "_final_state" in r or r.get("skipped"):
            continue
        data_date = r["_rec_data_date"]
        year, month = data_date[:4], data_date[5:7]
        month_str = f"{year}-{month}"
        journal_updates.setdefault(month_str, {}).setdefault(data_date, {})[r["code_c"]] = {
            "shares":  round(r["real_shares"], 4),
            "price":   r["real_price"],
            "settled": True,
            **({"pnl": round(r["real_pnl"], 2)} if r.get("real_pnl") is not None else {}),
        }

    for month_str, date_map in journal_updates.items():
        year, month = month_str[:4], month_str[5:7]
        jf = cache_dir / year / month / "mdtfr_journal.json"
        records = _read_json(jf, [])
        if not isinstance(records, list):
            continue
        for rec in records:
            dd = rec.get("data_date", "")
            if dd not in date_map:
                continue
            code_updates = date_map[dd]
            for tr in rec.get("trade_records", []):
                if tr.get("code_c") in code_updates:
                    tr.update(code_updates[tr["code_c"]])
        _write_json(jf, records)
        print(f"✓ 已更新 journal {month_str}")

    # ── 更新 amounts.json ───────────────────────────────────────
    amounts = _read_json(AMOUNTS_FILE, {})
    if not isinstance(amounts, dict):
        amounts = {}

    shares_map = amounts.get("__shares__", {})
    for code_c, s in final_state.items():
        shares_map[code_c] = round(s["shares"], 6)
    amounts["__shares__"] = shares_map

    cost_map = amounts.get("__cost__", {})
    for code_c, s in final_state.items():
        cost_map[code_c] = round(s["cost"], 2)
    amounts["__cost__"] = cost_map

    total_realized = sum(
        r["real_pnl"]
        for r in results
        if not r.get("skipped") and r.get("type") == "sell" and r.get("real_pnl") is not None
        and "_final_state" not in r
    )
    amounts["__realized_pnl__"] = round(total_realized, 2)

    _write_json(AMOUNTS_FILE, amounts)
    print(f"✓ 已更新 amounts.json (__shares__, __cost__, __realized_pnl__={total_realized:.2f})")


# ── Main ──────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="MDTFR 历史数据 T+1 净值校准工具")
    parser.add_argument("--dry-run", action="store_true", help="预览校准结果，不写入文件")
    parser.add_argument("--code",    default=None,        help="仅校准指定 code_c")
    parser.add_argument("--force",   action="store_true", help="强制重算已 settled 的记录")
    args = parser.parse_args()

    print("=== MDTFR 历史数据 T+1 净值校准 ===\n")

    # 前置检查：pending_corrections
    amounts_data = _read_json(AMOUNTS_FILE, {})
    pending = amounts_data.get("__pending_corrections__", [])
    if pending:
        print(f"⚠ 存在 {len(pending)} 条待结算记录（__pending_corrections__），"
              f"建议等 T+1 修正完成后再校准。\n", file=sys.stderr)

    # 确保备份存在
    if not args.dry_run:
        _ensure_backups()

    # 收集 trades
    trades = collect_journal_trades(filter_code=args.code, force=args.force)
    if not trades:
        print("✓ 无需校准的历史记录（所有记录已 settled 或无记录）。")
        return

    print(f"找到 {len(trades)} 条待校准记录：")
    for t in trades:
        label = "买入" if t["type"] == "buy" else "卖出"
        print(f"  [{t['data_date']}] {label} {t['name']} ({t['code_c']}) ¥{t['amt']:,.2f}")

    # 查询真实价格
    print("\n查询真实 T 日净值...")
    price_map = build_price_map(trades)

    # 级联重算
    results = run_cascade(trades, price_map)

    # 预览
    print_preview(results)

    if args.dry_run:
        print("[dry-run] 未写入任何文件。")
        return

    confirm = input("确认写入以上校准结果? [y/N]: ").strip().lower()
    if confirm != "y":
        print("已取消。")
        return

    apply_calibration(results)
    print("\n✅ 校准完成。")


if __name__ == "__main__":
    main()
