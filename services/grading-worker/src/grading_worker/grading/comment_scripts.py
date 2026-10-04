"""Bốc NGẪU NHIÊN một kịch bản nhận xét cho mỗi tiêu chí × band (học thuật ILM 2026-10-03).

Vì sao: học thuật nhận thấy mọi bài cùng band nhận gần như cùng một nhận xét — "một kịch bản cố
định". Họ soạn ≥3 kịch bản cho mỗi tiêu chí × band (`comment_bank[].band`); mỗi bài chỉ đưa MỘT
kịch bản mỗi nhóm vào prompt, nên hai bài cùng band đọc lên khác nhau như người chấm thật.

Xoay (chủ dự án 2026-10-03): NGẪU NHIÊN, nhưng KHÔNG lặp lại kịch bản học viên đã nhận ở bài
TRƯỚC cho cùng tiêu chí × band. Đo trước khi có luật này: bốc độc lập từng bài thì ~1/3 cặp bài
liền nhau của cùng một em trùng kịch bản (97/299). Worker nhớ "bài trước" ở Redis
`scripts:last:{studentId}` (dấu vân tay, không lưu nguyên văn). Ô chỉ có MỘT kịch bản thì vẫn dùng.
Mẫu KHÔNG gắn band giữ nguyên như trước.

Chỉ chạy ở worker (lúc chấm thật). Màn xem trước prompt của dashboard vẫn hiện ĐỦ mọi kịch bản —
đó là chỗ học thuật kiểm tra kho kịch bản, không phải một lượt chấm.
"""

from __future__ import annotations

import copy
import hashlib
import random
from typing import Any


def merge_template_scripts(rubric: dict[str, Any], template_scripts: list[Any]) -> dict[str, Any]:
    """Gộp kịch bản của CẤU TRÚC dùng chung (`templateScripts` từ core-api) vào `comment_bank` của khóa.

    Kịch bản sống ở cấu trúc (22 khóa dùng chung 2 cấu trúc — học thuật sửa một chỗ). Khóa nào tự
    soạn kịch bản cho một tiêu chí × band thì kịch bản của khóa THẮNG cho đúng ô đó.
    """
    clean = [
        {"dimension": e.get("dimension"), "band": str(e["band"]), "intent": None, "text": str(e.get("text") or "").strip()}
        for e in template_scripts or []
        if isinstance(e, dict) and e.get("band") and e.get("dimension") and str(e.get("text") or "").strip()
    ]
    if not clean:
        return rubric
    bank = list(rubric.get("comment_bank") or [])
    own = {(e.get("dimension"), str(e["band"])) for e in bank if isinstance(e, dict) and e.get("band")}
    out = copy.deepcopy(rubric)
    out["comment_bank"] = bank + [e for e in clean if (e["dimension"], e["band"]) not in own]
    return out


def cell_key(dimension: Any, band: Any) -> str:
    return f"{dimension}|{band}"


def fingerprint(text: str) -> str:
    """Dấu vân tay ngắn của một kịch bản — học thuật sửa chữ thì coi như kịch bản mới (hợp lý)."""
    return hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:12]


def band_key(score: Any) -> str | None:
    """Điểm LLM trả → khóa band như `bandValues` (`6` → "6", `6.5` → "6.5", `6.0` → "6")."""
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        return None
    return str(int(score)) if float(score).is_integer() else str(score)


def choose_band_scripts(
    rubric: dict[str, Any], rng: random.Random, avoid: dict[str, str] | None = None
) -> tuple[dict[str, Any], dict[str, str]]:
    """Bản sao rubric với MỘT kịch bản / (tiêu chí, band), tránh kịch bản `avoid` của bài trước.

    Trả thêm `picks` {"tiêu chí|band": dấu vân tay} — caller chỉ ghi nhớ những ô khớp điểm thật.
    """
    bank = rubric.get("comment_bank") or []
    if not any(isinstance(e, dict) and e.get("band") for e in bank):
        return rubric, {}
    avoid = avoid if isinstance(avoid, dict) else {}
    groups: dict[str, list[int]] = {}
    for index, entry in enumerate(bank):
        if isinstance(entry, dict) and entry.get("band"):
            groups.setdefault(cell_key(entry.get("dimension"), str(entry["band"])), []).append(index)
    keep: set[int] = set()
    picks: dict[str, str] = {}
    for cell, indexes in groups.items():
        fresh = [i for i in indexes if fingerprint(bank[i]["text"]) != avoid.get(cell)] or indexes
        chosen = rng.choice(fresh)
        keep.add(chosen)
        picks[cell] = fingerprint(bank[chosen]["text"])
    out = copy.deepcopy(rubric)
    out["comment_bank"] = [
        entry for index, entry in enumerate(bank) if not (isinstance(entry, dict) and entry.get("band")) or index in keep
    ]
    return out, picks


def pick_band_scripts(rubric: dict[str, Any], seed: int) -> dict[str, Any]:
    """Bốc tất định theo `seed`, không tránh lặp — giữ cho test/caller cũ."""
    return choose_band_scripts(rubric, random.Random(seed))[0]
