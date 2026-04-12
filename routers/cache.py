# -*- coding: utf-8 -*-
"""
本地 JSON 文件缓存接口

目录结构：
  ~/.investment/
    YYYY/
      MM/
        mdtfr_pool.json     — 当月每日标的池快照：{"YYYY-MM-DD": [...], ...}
        mdtfr_journal.json  — 当月 MDTFR 复盘记录数组，按 data_date 去重（upsert）
        aw_journal.json     — 当月 AW 再平衡复盘记录数组，按 date 去重（upsert）

接口：
  GET    /api/cache/pool/{date}                  读取指定日期标的池快照（从当月文件中取）
  PUT    /api/cache/pool/{date}                  写入/覆盖指定日期标的池快照
  DELETE /api/cache/pool/{date}                  删除指定日期标的池快照

  GET    /api/cache/journal/{year}/{month}        读取指定月份所有 MDTFR 复盘记录
  POST   /api/cache/journal                       追加/更新一条 MDTFR 复盘记录（按 data_date upsert）

  GET    /api/cache/aw-journal/{year}/{month}     读取指定月份所有 AW 复盘记录
  POST   /api/cache/aw-journal                    追加/更新一条 AW 复盘记录（按 date upsert）
"""
import json
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/cache", tags=["本地缓存"])

# 缓存根目录
CACHE_DIR = Path.home() / ".investment"


def _month_dir(year: str, month: str) -> Path:
    """确保 ~/.investment/YYYY/MM 目录存在并返回路径"""
    d = CACHE_DIR / year / month
    d.mkdir(parents=True, exist_ok=True)
    return d


def _parse_date(date: str) -> tuple[str, str]:
    """从 YYYY-MM-DD 解析出 (year, month)，格式不合法时抛出 ValueError"""
    m = re.fullmatch(r'(\d{4})-(\d{2})-\d{2}', date)
    if not m:
        raise ValueError(f"日期格式不合法: {date}，应为 YYYY-MM-DD")
    return m.group(1), m.group(2)


def _pool_file(date: str) -> tuple[Path, str, str]:
    """返回 (pool文件路径, year, month)"""
    year, month = _parse_date(date)
    return _month_dir(year, month) / "mdtfr_pool.json", year, month


def _journal_file(year: str, month: str) -> Path:
    """返回 journal 文件路径（同时确保目录存在）"""
    return _month_dir(year, month) / "mdtfr_journal.json"


def _read_json(path: Path, default):
    """安全读取 JSON 文件，解析失败时返回 default"""
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── 标的池快照 ─────────────────────────────────────────────────

@router.get("/pool/{date}", summary="读取指定日期标的池快照")
async def pool_get(date: str):
    try:
        pool_path, _, _ = _pool_file(date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    monthly: dict = _read_json(pool_path, {})
    if date not in monthly:
        return JSONResponse(status_code=404, content={"detail": "缓存不存在"})
    return JSONResponse(content=monthly[date])


@router.put("/pool/{date}", summary="写入指定日期标的池快照")
async def pool_put(date: str, request: Request):
    try:
        pool_path, _, _ = _pool_file(date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        payload = await request.json()
        monthly: dict = _read_json(pool_path, {})
        monthly[date] = payload
        _write_json(pool_path, monthly)
        return {"ok": True, "file": str(pool_path), "date": date}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入缓存失败: {e}")


@router.delete("/pool/{date}", summary="删除指定日期标的池快照")
async def pool_delete(date: str):
    try:
        pool_path, _, _ = _pool_file(date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    monthly: dict = _read_json(pool_path, {})
    if date not in monthly:
        return {"ok": True, "detail": "日期不存在，无需删除"}
    try:
        del monthly[date]
        _write_json(pool_path, monthly)
        return {"ok": True, "file": str(pool_path), "date": date}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除缓存失败: {e}")


# ── 复盘日志 ───────────────────────────────────────────────────

@router.get("/journal/{year}/{month}", summary="读取指定月份所有复盘记录")
async def journal_get(year: str, month: str):
    path = _journal_file(year, month)
    data = _read_json(path, [])
    return JSONResponse(content=data if isinstance(data, list) else [])


@router.post("/journal", summary="追加/更新一条复盘记录（按 data_date upsert）")
async def journal_post(request: Request):
    try:
        record = await request.json()
        data_date: str = record.get("data_date", "")
        try:
            year, month = _parse_date(data_date)
        except ValueError:
            # data_date 不合法时用保存时间推断年月
            from datetime import datetime
            now = datetime.now()
            year, month = str(now.year), f"{now.month:02d}"

        path = _journal_file(year, month)
        records: list = _read_json(path, [])
        if not isinstance(records, list):
            records = []

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


@router.get("/pool/latest-before/{date}", summary="查找指定日期之前最近的标的池快照（跨月/年查找）")
async def pool_latest_before(date: str):
    """
    从指定日期向前搜索最近一次有效的标的池快照，最多回溯 3 个月。
    用于在 watch state 为空时，判断历史数据中该标的是否已经跌破 MA20。
    """
    try:
        year, month = _parse_date(date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    def _prev_yms(y: str, m: str, n: int):
        """生成从 (y, m) 开始向前 n 个月的 (year, month) 列表"""
        result = []
        yi, mi = int(y), int(m)
        for _ in range(n):
            result.append((str(yi), f'{mi:02d}'))
            mi -= 1
            if mi == 0:
                mi = 12
                yi -= 1
        return result

    for y, m in _prev_yms(year, month, 3):
        # 直接构造路径，不强制创建目录
        pool_path = CACHE_DIR / y / m / "mdtfr_pool.json"
        monthly = _read_json(pool_path, {})
        if not isinstance(monthly, dict):
            continue
        # 找该月所有严格早于 date 的日期，取最大（最近的）
        prev_dates = sorted([d for d in monthly.keys() if d < date], reverse=True)
        if prev_dates:
            latest = prev_dates[0]
            return JSONResponse(content={"date": latest, "items": monthly[latest]})

    return JSONResponse(status_code=404, content={"detail": "未找到历史快照"})


def _aw_journal_file(year: str, month: str) -> Path:
    """返回 AW 复盘 journal 文件路径（同时确保目录存在）"""
    return _month_dir(year, month) / "aw_journal.json"


# ── AW 再平衡复盘日志 ──────────────────────────────────────────

@router.get("/aw-journal/{year}/{month}", summary="读取指定月份所有 AW 再平衡复盘记录")
async def aw_journal_get(year: str, month: str):
    path = _aw_journal_file(year, month)
    data = _read_json(path, [])
    return JSONResponse(content=data if isinstance(data, list) else [])


@router.post("/aw-journal", summary="追加/更新一条 AW 再平衡复盘记录（按 date upsert）")
async def aw_journal_post(request: Request):
    try:
        record = await request.json()
        date: str = record.get("date", "")
        try:
            year, month = _parse_date(date)
        except ValueError:
            from datetime import datetime
            now = datetime.now()
            year, month = str(now.year), f"{now.month:02d}"

        path = _aw_journal_file(year, month)
        records: list = _read_json(path, [])
        if not isinstance(records, list):
            records = []

        # upsert：若已有相同 date 的记录则替换，否则追加
        idx = next((i for i, r in enumerate(records) if r.get("date") == date), -1)
        if idx >= 0:
            records[idx] = record
        else:
            records.append(record)

        _write_json(path, records)
        return {"ok": True, "total": len(records), "upserted": idx >= 0, "file": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存 AW 复盘记录失败: {e}")




WATCH_FILE = CACHE_DIR / "mdtfr_watch.json"
AMOUNTS_FILE = CACHE_DIR / "mdtfr_amounts.json"


@router.get("/watchstate", summary="读取MA20跌破连续观察状态")
async def watchstate_get():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    data = _read_json(WATCH_FILE, [])
    return JSONResponse(content=data if isinstance(data, list) else [])


@router.put("/watchstate", summary="写入MA20跌破连续观察状态")
async def watchstate_put(request: Request):
    try:
        payload = await request.json()
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _write_json(WATCH_FILE, payload)
        return {"ok": True, "file": str(WATCH_FILE)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入观察状态失败: {e}")


# ── 持仓金额 ───────────────────────────────────────────────────

@router.get("/amounts", summary="读取持仓金额（code_c → 元）")
async def amounts_get():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    data = _read_json(AMOUNTS_FILE, {})
    return JSONResponse(content=data if isinstance(data, dict) else {})


@router.put("/amounts", summary="写入持仓金额（code_c → 元）")
async def amounts_put(request: Request):
    try:
        payload = await request.json()
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _write_json(AMOUNTS_FILE, payload)
        return {"ok": True, "file": str(AMOUNTS_FILE)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入持仓金额失败: {e}")
