# -*- coding: utf-8 -*-
"""
BaoStock 会话管理器

支持两种连接模式（CONNECTION_MODE）：

  per_call（默认）：
    每次 run_bs() 调用均执行 login → fn → logout，无需维持长连接，
    不启动心跳，适合低频调用或服务器连接不稳定的场景。

  persistent：
    维持全局唯一登录态，空闲超时自动登出，心跳任务定期保活，
    适合高频连续调用。
"""
import asyncio
import time
import logging
import datetime
import socket as _socket
from typing import Callable, Any

import baostock as bs
import baostock.common.context as _bs_ctx

logger = logging.getLogger(__name__)

# ── 可调参数（运行时可通过 update_config 修改） ───────────
CONNECTION_MODE = "per_call"   # "per_call" | "persistent"

HEARTBEAT_INTERVAL = 60        # 心跳间隔（秒），persistent 模式生效
IDLE_TIMEOUT = 600             # 空闲超时（秒），persistent 模式生效

HEARTBEAT_MIN = 10
HEARTBEAT_MAX = 3600
IDLE_MIN = 60
IDLE_MAX = 86400

# SDK socket 超时：服务端无响应时快速失败，避免挂起数分钟
BS_SOCKET_TIMEOUT = 15.0       # 秒
# ─────────────────────────────────────────────

_logged_in: bool = False
_last_active: float = 0.0

# 锁在首次进入 async 上下文时初始化，避免在事件循环启动前创建
_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


def _do_login() -> bool:
    """同步登录，返回是否成功（在线程池中调用）"""
    global _logged_in
    lg = bs.login()
    if lg.error_code == '0':
        _logged_in = True
        # 登录成功后立即给 SDK 内部 socket 设置超时，
        # 避免服务端无响应时 recv() 无限阻塞
        try:
            sock = getattr(_bs_ctx, "default_socket", None)
            if sock is not None:
                sock.settimeout(BS_SOCKET_TIMEOUT)
                logger.debug("SDK socket 超时已设为 %.0fs", BS_SOCKET_TIMEOUT)
        except Exception as e:
            logger.warning("设置 socket 超时失败（不影响功能）: %s", e)
        logger.info("BaoStock 登录成功")
        return True
    logger.error("BaoStock 登录失败: %s", lg.error_msg)
    _logged_in = False
    return False


def _do_logout() -> None:
    """同步登出（在线程池中调用）"""
    global _logged_in
    bs.logout()
    _logged_in = False
    logger.info("BaoStock 已登出")


async def run_bs(fn: Callable[[], Any]) -> Any:
    """
    统一 BaoStock SDK 调用入口。

    per_call 模式（默认）：
      每次调用均执行 login → fn → logout，无论成功与否都会登出。
      登录失败时返回 None。

    persistent 模式：
      维持长连接，未登录时自动登录，socket 错误时重置登录态以便下次重连。

    两种模式均保证：
      - 非阻塞：在线程池中执行，不阻塞 asyncio 事件循环
      - 串行化：持 asyncio.Lock，同一时间只有一个调用访问 SDK
    """
    global _logged_in, _last_active
    lock = _get_lock()
    async with lock:
        _last_active = time.monotonic()
        loop = asyncio.get_running_loop()

        if CONNECTION_MODE == "per_call":
            ok = await loop.run_in_executor(None, _do_login)
            if not ok:
                return None
            try:
                return await loop.run_in_executor(None, fn)
            finally:
                await loop.run_in_executor(None, _do_logout)

        else:  # persistent
            if not _logged_in:
                ok = await loop.run_in_executor(None, _do_login)
                if not ok:
                    return None
            try:
                return await loop.run_in_executor(None, fn)
            except Exception as exc:
                err_str = str(exc).lower()
                if any(k in err_str for k in ("recvsock", "timeout", "connection", "broken pipe", "socket")):
                    logger.warning("检测到 SDK 网络错误，重置登录态以便下次重连: %s", exc)
                    _logged_in = False
                raise


async def ensure_login() -> bool:
    """
    仅确保登录态（不执行 SDK 查询）。
    lifespan 启动时调用；per_call 模式下跳过（每次调用自行登录）。
    """
    if CONNECTION_MODE == "per_call":
        logger.info("per_call 模式：跳过启动预登录")
        return True
    global _logged_in, _last_active
    lock = _get_lock()
    async with lock:
        _last_active = time.monotonic()
        if _logged_in:
            return True
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _do_login)


async def manual_login() -> dict:
    """手动登录（供 /api/session/login 端点调用）"""
    global _logged_in, _last_active
    lock = _get_lock()
    async with lock:
        if _logged_in:
            _last_active = time.monotonic()
            return {"status": "already_logged_in"}
        loop = asyncio.get_running_loop()
        ok = await loop.run_in_executor(None, _do_login)
        if ok:
            _last_active = time.monotonic()
            return {"status": "logged_in"}
        return {"status": "error", "message": "登录失败，请检查网络"}


async def manual_logout() -> dict:
    """手动登出（供 /api/session/logout 端点调用）"""
    global _logged_in, _last_active
    lock = _get_lock()
    async with lock:
        if not _logged_in:
            return {"status": "already_logged_out"}
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _do_logout)
        _last_active = 0.0
        return {"status": "logged_out"}


def mark_disconnected() -> None:
    """persistent 模式下：SDK 网络错误时重置登录态，触发下次自动重连。"""
    global _logged_in
    if CONNECTION_MODE == "persistent":
        _logged_in = False
        logger.warning("SDK 网络错误，已重置登录态（下次请求自动重连）")


def get_status() -> dict:
    """返回当前会话状态"""
    idle = int(time.monotonic() - _last_active) if _last_active else None
    return {
        "logged_in": _logged_in,
        "connection_mode": CONNECTION_MODE,
        "idle_seconds": idle,
        "idle_timeout": IDLE_TIMEOUT,
        "heartbeat_interval": HEARTBEAT_INTERVAL,
    }


def update_config(
    heartbeat_interval: int | None,
    idle_timeout: int | None,
    connection_mode: str | None,
) -> dict:
    """动态修改连接模式、心跳间隔和空闲超时，返回更新后的完整配置"""
    global HEARTBEAT_INTERVAL, IDLE_TIMEOUT, CONNECTION_MODE
    if connection_mode is not None and connection_mode in ("per_call", "persistent"):
        CONNECTION_MODE = connection_mode
        logger.info("连接模式已切换为: %s", CONNECTION_MODE)
    if heartbeat_interval is not None:
        HEARTBEAT_INTERVAL = max(HEARTBEAT_MIN, min(HEARTBEAT_MAX, heartbeat_interval))
    if idle_timeout is not None:
        IDLE_TIMEOUT = max(IDLE_MIN, min(IDLE_MAX, idle_timeout))
    logger.info("会话配置已更新：模式 %s，心跳 %ds，空闲超时 %ds",
                CONNECTION_MODE, HEARTBEAT_INTERVAL, IDLE_TIMEOUT)
    return {
        "connection_mode": CONNECTION_MODE,
        "heartbeat_interval": HEARTBEAT_INTERVAL,
        "idle_timeout": IDLE_TIMEOUT,
    }


async def heartbeat_task() -> None:
    """
    后台心跳协程，由 lifespan 启动。
    - per_call 模式：仅 sleep，不做任何操作
    - persistent 模式：空闲超时自动登出，活跃时发送轻量查询保活
    """
    logger.info("BaoStock 心跳任务已启动（间隔 %ds，空闲超时 %ds，模式 %s）",
                HEARTBEAT_INTERVAL, IDLE_TIMEOUT, CONNECTION_MODE)
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)

        if CONNECTION_MODE == "per_call":
            continue  # per_call 模式无需心跳

        lock = _get_lock()
        async with lock:
            if not _logged_in:
                continue
            idle = time.monotonic() - _last_active
            loop = asyncio.get_running_loop()
            if idle >= IDLE_TIMEOUT:
                logger.info("空闲 %.0fs 超过阈值，自动登出", idle)
                await loop.run_in_executor(None, _do_logout)
                _last_active = 0.0
            else:
                today = datetime.date.today().strftime('%Y-%m-%d')
                try:
                    await loop.run_in_executor(
                        None,
                        lambda: bs.query_trade_dates(start_date=today, end_date=today)
                    )
                    logger.debug("心跳保活成功（空闲 %.0fs）", idle)
                except Exception as exc:
                    logger.warning("心跳保活失败: %s，尝试重新登录", exc)
                    await loop.run_in_executor(None, _do_login)
