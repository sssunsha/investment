# -*- coding: utf-8 -*-
"""解析工具函数（供所有 parser 模块共用）"""
import re
from typing import Optional


def _parse_float(value: str) -> Optional[float]:
    """将带 %、逗号的字符串解析为 float；无法解析时返回 None"""
    if value is None:
        return None
    value = str(value).strip().replace('%', '').replace(',', '')
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _parse_date(text: str) -> Optional[str]:
    """从任意文本中提取日期，返回 YYYY-MM-DD 或 YYYY-MM；无匹配返回 None"""
    if not text:
        return None
    text = str(text)
    # 中文完整日期：2026年04月17日 / 2026年4月7日
    m = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日', text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    # 中文年月：2026年03月
    m = re.search(r'(\d{4})年(\d{1,2})月', text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    # ISO：2026-4-7
    m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return None
