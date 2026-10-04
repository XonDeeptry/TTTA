"""Số đo + band theo CÔNG THỨC — "Đo → Đếm → Viết" giai đoạn 1 (Idea/20261003-DoDemViet.md).

THUẦN và TẤT ĐỊNH: cùng đầu vào ⇒ cùng kết quả. Giai đoạn 1 chỉ chạy NGẦM — kết quả lưu vào
`gradings.assessment.measures` / `.shadow_bands` để so với điểm giáo viên, KHÔNG đổi điểm học viên.

⚠ Bảng ngưỡng dưới đây là ĐIỂM KHỞI ĐẦU (ước lượng từ tài liệu về đo độ trôi chảy/đa dạng từ),
CHƯA hiệu chỉnh. Giai đoạn 2 fit lại từ các bài giáo viên đã sửa điểm — đừng đọc chúng như sự thật.
"""

from __future__ import annotations

import re
from typing import Any

# ─── Nhịp nói (Fluency) — từ mốc từng từ của Azure ──────────────────────────────────────────────

PAUSE_SEC = 0.4  # khoảng lặng giữa hai từ coi là "ngắt"
LONG_PAUSE_SEC = 1.0  # ngắt dài (tìm từ / tìm ý)
RUN_BREAK_SEC = 0.25  # ranh giới một "đoạn nói liền" (mean length of run)


def fluency_measures(words: list[dict[str, Any]]) -> dict[str, float] | None:
    """Từ dòng thời gian Azure (`facts["words"]`). None khi quá ít từ để đo có nghĩa."""
    spoken = sorted(
        (
            w
            for w in words or []
            if isinstance(w, dict)
            and w.get("error_type") not in ("Omission", "Insertion")
            and isinstance(w.get("start_sec"), (int, float))
            and isinstance(w.get("end_sec"), (int, float))
            and w["end_sec"] >= w["start_sec"]
        ),
        key=lambda w: w["start_sec"],
    )
    if len(spoken) < 10:
        return None
    span = spoken[-1]["end_sec"] - spoken[0]["start_sec"]
    if span <= 0:
        return None
    gaps = [max(0.0, b["start_sec"] - a["end_sec"]) for a, b in zip(spoken, spoken[1:])]
    pauses = [g for g in gaps if g >= PAUSE_SEC]
    runs, current = [], 1
    for g in gaps:
        if g >= RUN_BREAK_SEC:
            runs.append(current)
            current = 1
        else:
            current += 1
    runs.append(current)
    minutes = span / 60
    return {
        "words": len(spoken),
        "speech_rate_wpm": round(len(spoken) / minutes, 1),
        "pauses_per_min": round(len(pauses) / minutes, 2),
        "long_pauses_per_min": round(sum(g >= LONG_PAUSE_SEC for g in gaps) / minutes, 2),
        "mean_pause_sec": round(sum(pauses) / len(pauses), 2) if pauses else 0.0,
        "mean_length_of_run": round(sum(runs) / len(runs), 2),
        "phonation_ratio": round(sum(w["end_sec"] - w["start_sec"] for w in spoken) / span, 3),
    }


# ─── Từ vựng (Lexical) ──────────────────────────────────────────────────────────────────────────

_WORD = re.compile(r"[a-z]+(?:'[a-z]+)?")
MTLD_THRESHOLD = 0.72


def tokens(text: str) -> list[str]:
    return _WORD.findall((text or "").lower())


def _mtld_pass(seq: list[str]) -> float:
    factors, types, count = 0.0, set(), 0
    for tok in seq:
        count += 1
        types.add(tok)
        if len(types) / count <= MTLD_THRESHOLD:
            factors += 1
            types, count = set(), 0
    if count:
        ttr = len(types) / count
        factors += (1 - ttr) / (1 - MTLD_THRESHOLD)
    return len(seq) / factors if factors else float(len(seq))


def mtld(seq: list[str]) -> float | None:
    """MTLD hai chiều (McCarthy & Jarvis 2010) — độ đa dạng từ KHÔNG phụ thuộc độ dài bài."""
    if len(seq) < 50:
        return None
    return round((_mtld_pass(seq) + _mtld_pass(list(reversed(seq)))) / 2, 1)


def _per_100(n: int, words: int) -> float:
    return round(100 * n / words, 2) if words else 0.0


def _sentences(text: str) -> int:
    return max(1, len([s for s in re.split(r"[.!?]+", text or "") if tokens(s)]))


def language_measures(transcript: str, evidence: dict[str, Any] | None) -> dict[str, Any]:
    toks = tokens(transcript)
    ev = evidence if isinstance(evidence, dict) else {}
    n = len(toks)
    grammar_errors = len(ev.get("grammar_errors") or [])
    sentences = _sentences(transcript)
    return {
        "tokens": n,
        "types": len(set(toks)),
        "mtld": mtld(toks),
        "lexical_errors_per_100w": _per_100(len(ev.get("lexical_errors") or []), n),
        "advanced_vocab_per_100w": _per_100(len(ev.get("advanced_vocabulary") or []), n),
        "sentences": sentences,
        "grammar_errors": grammar_errors,
        "error_free_ratio": round(max(0.0, 1 - grammar_errors / sentences), 3),
        "complex_per_100w": _per_100(len(ev.get("complex_structures") or []), n),
    }


# ─── Band theo công thức — NGƯỠNG KHỞI ĐIỂM, CHƯA HIỆU CHỈNH ────────────────────────────────────

# (ngưỡng tối thiểu, band) — giảm dần; dưới ngưỡng cuối ⇒ band 3.
WPM = [(150, 8), (130, 7), (110, 6), (90, 5), (70, 4)]
MLR = [(12, 8), (9, 7), (7, 6), (5, 5), (3, 4)]
MTLD_BANDS = [(90, 8), (75, 7), (60, 6), (45, 5), (30, 4)]
ERROR_FREE = [(0.9, 8), (0.75, 7), (0.6, 6), (0.45, 5), (0.3, 4)]
FLOOR = 3


def _lookup(value: float | None, table: list[tuple[float, int]]) -> int | None:
    if value is None:
        return None
    for minimum, band in table:
        if value >= minimum:
            return band
    return FLOOR


def shadow_bands(fluency: dict[str, float] | None, language: dict[str, Any]) -> dict[str, int]:
    """Band cho 3 tiêu chí Gemini đang chấm. Tiêu chí thiếu số đo ⇒ vắng mặt (không đoán)."""
    out: dict[str, int] = {}
    if fluency:
        band = min(_lookup(fluency["speech_rate_wpm"], WPM) or FLOOR, _lookup(fluency["mean_length_of_run"], MLR) or FLOOR)
        if fluency["long_pauses_per_min"] > 3:
            band -= 1
        out["fluency_coherence"] = max(FLOOR, band)
    lex = _lookup(language.get("mtld"), MTLD_BANDS)
    if lex is not None:
        if language["lexical_errors_per_100w"] > 2:
            lex -= 1
        if language["advanced_vocab_per_100w"] >= 2:
            lex += 1
        out["lexical_resource"] = max(FLOOR, min(9, lex))
    if language.get("tokens", 0) >= 30:
        gram = _lookup(language["error_free_ratio"], ERROR_FREE) or FLOOR
        if language["complex_per_100w"] < 1.5:
            gram = min(gram, 6)  # band 7+ cần dùng nhiều cấu trúc phức
        out["grammatical_range"] = max(FLOOR, gram)
    return out
