# -*- coding: utf-8 -*-
"""
会话管理路由
提供 BaoStock 登录/登出/状态查询/配置修改端点，在 Swagger 中可见。
"""
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field
from session import manual_login, manual_logout, get_status, update_config, HEARTBEAT_MIN, HEARTBEAT_MAX, IDLE_MIN, IDLE_MAX

router = APIRouter(prefix="/api/session", tags=["会话管理"])


class SessionConfig(BaseModel):
    heartbeat_interval: Optional[int] = Field(
        None,
        description=f"心跳保活间隔（秒），范围 {HEARTBEAT_MIN}–{HEARTBEAT_MAX}",
        ge=HEARTBEAT_MIN,
        le=HEARTBEAT_MAX,
        example=60,
    )
    idle_timeout: Optional[int] = Field(
        None,
        description=f"空闲自动登出阈值（秒），范围 {IDLE_MIN}–{IDLE_MAX}",
        ge=IDLE_MIN,
        le=IDLE_MAX,
        example=600,
    )


@router.post(
    "/login",
    summary="登录 BaoStock",
    description="""
手动触发 BaoStock 登录。

- 若当前已登录，则直接返回 `already_logged_in`，并刷新活跃时间。
- 若当前未登录，则发起登录请求。

服务启动后心跳任务会自动维持登录态，通常无需手动调用。
    """
)
async def login():
    return await manual_login()


@router.post(
    "/logout",
    summary="登出 BaoStock",
    description="""
手动触发 BaoStock 登出。

- 登出后心跳任务不会自动重连，下次 API 调用时将自动重新登录。
    """
)
async def logout():
    return await manual_logout()


@router.get(
    "/status",
    summary="查询会话状态",
    description="""
返回当前 BaoStock 会话状态，包括：

| 字段 | 说明 |
|------|------|
| `logged_in` | 是否处于登录状态 |
| `idle_seconds` | 距上次 API 调用的空闲秒数 |
| `idle_timeout` | 自动登出阈值（秒） |
| `heartbeat_interval` | 心跳保活间隔（秒） |
    """
)
def status():
    return get_status()


@router.patch(
    "/config",
    summary="修改会话配置",
    description=f"""
动态修改心跳间隔和空闲超时设置，**立即生效**，无需重启服务。

| 参数 | 说明 | 范围 |
|------|------|------|
| `heartbeat_interval` | 心跳保活间隔（秒） | {HEARTBEAT_MIN}–{HEARTBEAT_MAX} |
| `idle_timeout` | 空闲自动登出阈值（秒） | {IDLE_MIN}–{IDLE_MAX} |

两个参数均为可选，只传需要修改的字段即可。
    """
)
def update_session_config(config: SessionConfig):
    return update_config(
        heartbeat_interval=config.heartbeat_interval,
        idle_timeout=config.idle_timeout,
    )
