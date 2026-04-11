# -*- coding: utf-8 -*-
"""
本地 JSON 文件缓存接口

~/.investment/ 目录下按日期保存各策略的分析快照，规则如下：
  - 目录：~/.investment/
  - 快照文件命名：{store}_{date}.json   例：mdtfr_pool_2026-04-11.json
  - 复盘日志文件：mdtfr_journal.json（追加式，所有历史记录）

接口：
  GET    /api/cache/{store}/{date}        读取指定日期的缓存
  PUT    /api/cache/{store}/{date}        写入/覆盖缓存
  DELETE /api/cache/{store}/{date}        删除缓存文件

  GET    /api/cache/journal/mdtfr         读取所有复盘记录
  POST   /api/cache/journal/mdtfr         追加一条复盘记录
"""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/cache", tags=["本地缓存"])

# 缓存根目录
CACHE_DIR = Path.home() / ".investment"
JOURNAL_FILE = CACHE_DIR / "mdtfr_journal.json"


def _ensure_dir() -> Path:
    """确保 ~/.investment 目录存在，返回其路径"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR


def _cache_file(store: str, date: str) -> Path:
    return _ensure_dir() / f"{store}_{date}.json"


# ── 快照缓存 ───────────────────────────────────────────────

# ── 复盘日志（必须在 /{store}/{date} 泛型路由之前注册）────────

@router.get("/journal/mdtfr", summary="读取所有复盘记录")
async def journal_get():
    _ensure_dir()
    if not JOURNAL_FILE.exists():
        return JSONResponse(content=[])
    try:
        data = json.loads(JOURNAL_FILE.read_text(encoding="utf-8"))
        return JSONResponse(content=data if isinstance(data, list) else [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取复盘记录失败: {e}")


@router.post("/journal/mdtfr", summary="追加一条复盘记录")
async def journal_post(request: Request):
    _ensure_dir()
    try:
        record = await request.json()
        records: list = []
        if JOURNAL_FILE.exists():
            try:
                records = json.loads(JOURNAL_FILE.read_text(encoding="utf-8"))
                if not isinstance(records, list):
                    records = []
            except Exception:
                records = []
        records.append(record)
        JOURNAL_FILE.write_text(
            json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return {"ok": True, "total": len(records), "file": str(JOURNAL_FILE)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存复盘记录失败: {e}")


# ── 快照缓存 ───────────────────────────────────────────────

@router.get("/{store}/{date}", summary="读取本地 JSON 缓存")
async def cache_get(store: str, date: str):
    path = _cache_file(store, date)
    if not path.exists():
        return JSONResponse(status_code=404, content={"detail": "缓存不存在"})
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return JSONResponse(content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取缓存失败: {e}")


@router.put("/{store}/{date}", summary="写入本地 JSON 缓存")
async def cache_put(store: str, date: str, request: Request):
    path = _cache_file(store, date)
    try:
        payload = await request.json()
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"ok": True, "file": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入缓存失败: {e}")


@router.delete("/{store}/{date}", summary="删除本地 JSON 缓存")
async def cache_delete(store: str, date: str):
    path = _cache_file(store, date)
    if not path.exists():
        return {"ok": True, "detail": "文件不存在，无需删除"}
    try:
        path.unlink()
        return {"ok": True, "file": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除缓存失败: {e}")
