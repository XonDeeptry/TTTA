"""Chấm NHIỀU lượt độc lập rồi lấy TRUNG VỊ mỗi tiêu chí (chủ dự án 2026-10-03).

Vì sao: cùng một file gửi hai lần cách nhau 3 phút (bài 265/266, tài khoản Bùi Văn Sơn) ra 6.0 và
7.0 — ba tiêu chí Gemini chấm lệch ±1 band giữa các lượt, kể cả cùng cài đặt (Gemini 3.x dao động
dù temperature = 0; CLAUDE.md đã ghi). Phát âm do Azure đo nên đứng yên. Trung vị của 3 lượt khử
được một lượt lệch; số lượt CHẴN lấy trung vị DƯỚI (nghiêng về chấm chặt, đúng yêu cầu học thuật).

Nhận xét/hướng sửa/từ phát âm sai lấy NGUYÊN từ lượt GẦN trung vị nhất (tổng độ lệch nhỏ nhất) —
để chữ trong nhận xét khớp điểm nhất có thể; chỉ trường `score` bị thay bằng trung vị. `delivery`
(đọc / học thuộc / tự nhiên) theo đa số. THUẦN, có test; phần gọi LLM song song nằm ở pipeline.
"""

from __future__ import annotations

import copy
from collections import Counter
from typing import Any

from .providers.base import GradingResult


def _score(data: dict[str, Any], key: str) -> float | None:
    v = ((data.get("scores") or {}).get(key) or {}).get("score")
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def lower_median(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[(len(ordered) - 1) // 2]


def combine(results: list[GradingResult]) -> tuple[GradingResult, dict[str, Any]]:
    """Gộp các lượt ĐÃ validate. Trả (kết quả gộp, thống kê để lưu/soi)."""
    if len(results) == 1:
        return results[0], {"runs": 1}
    keys = list((results[0].data.get("scores") or {}).keys())
    medians: dict[str, float] = {}
    per_run: dict[str, list[float]] = {}
    for key in keys:
        vals = [s for r in results if (s := _score(r.data, key)) is not None]
        if vals:
            medians[key] = lower_median(vals)
            per_run[key] = vals

    def distance(r: GradingResult) -> float:
        return sum(abs((_score(r.data, k) or medians[k]) - medians[k]) for k in medians)

    best = min(results, key=distance)
    data = copy.deepcopy(best.data)
    for key, med in medians.items():
        value: float | int = int(med) if float(med).is_integer() else med
        data["scores"][key]["score"] = value
    styles = [r.data["delivery"]["style"] for r in results if isinstance(r.data.get("delivery"), dict) and r.data["delivery"].get("style")]
    if styles and isinstance(data.get("delivery"), dict):
        majority = Counter(styles).most_common(1)[0][0]
        if majority != data["delivery"].get("style"):
            donor = next(r for r in results if isinstance(r.data.get("delivery"), dict) and r.data["delivery"].get("style") == majority)
            data["delivery"] = copy.deepcopy(donor.data["delivery"])
    combined = GradingResult(
        data=data,
        input_tokens=sum(r.input_tokens for r in results),
        output_tokens=sum(r.output_tokens for r in results),
        provider=best.provider,
        model=best.model,
    )
    return combined, {"runs": len(results), "scores_per_run": per_run, "median": medians}
