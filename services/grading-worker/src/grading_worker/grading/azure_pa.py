"""Azure Pronunciation Assessment — Azure CHẤM ĐIỂM, Gemini chỉ VIẾT NHẬN XÉT (kiến trúc B).

Quyết định Chủ tịch 2026-09-15 (ILM-Clone Decisions Log D149–D152), thiết kế ở ILM-Clone
`20260909-Spec-Grading-TTTA.md` §4–§6, §8.3, §13A:

- Điểm các tiêu chí đo được từ TÍN HIỆU ÂM THANH lấy từ Azure, tất định (đo 09-09: chấm lại cùng
  clip lệch 0.0). Gemini nhận các điểm đó như dữ kiện đã chốt và viết nhận xét khớp với chúng.
- IELTS: Azure chỉ đo được Phát âm và Trôi chảy. Từ vựng, Ngữ pháp và nửa MẠCH LẠC của
  "fluency_coherence" vẫn do Gemini chấm (D150) — hệ thống lấy trung bình hai nửa.
- KID: chấm THEO BÀI ĐỌC (`reference_text`) khi lớp có văn bản bài đọc (§13A: không có văn bản
  thì Azure bịa từ trên giọng trẻ em — `tappinga`). Không có ⇒ vẫn chấm tự do nhưng gắn cờ (D151).
- Thang 0–100 của Azure quy đổi sang thang rubric bằng BẢNG NGƯỠNG, mặc định ở đây, đội học thuật
  ghi đè qua setting `azure.score_thresholds_json` (D152).

Phần gọi SDK (`run_assessment`) mỏng và KHÔNG có test tự động — nó chỉ kiểm chứng được bằng khóa
thật. Mọi phần có logic (tóm tắt JSON, quy đổi, ghép điểm, dựng prompt) là hàm THUẦN và có test.
"""

from __future__ import annotations

import copy
import json
import logging
import math
import threading
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

TICKS_PER_SEC = 10_000_000
MAX_TRANSCRIPT_CHARS = 4000
MAX_ERRORS = 10
LOW_WORD_ACCURACY = 60

SCORE_FIELDS = {
    "accuracy": "AccuracyScore",
    "fluency": "FluencyScore",
    "prosody": "ProsodyScore",
    "completeness": "CompletenessScore",
    "pron": "PronScore",
}

# Ngưỡng mặc định (D152) — ĐỀ XUẤT ban đầu, đội học thuật hiệu chỉnh sau khi đối chiếu bài chấm tay.
# Mỗi cặp (điểm Azure tối thiểu, mức rubric); dưới ngưỡng thấp nhất ⇒ mức nhỏ nhất của thang.
DEFAULT_THRESHOLDS: dict[int, list[tuple[float, float]]] = {
    5: [(90, 5), (75, 4), (60, 3), (45, 2), (30, 1)],
    9: [(95, 9), (88, 8), (80, 7), (72, 6), (62, 5), (52, 4), (40, 3), (25, 2), (10, 1)],
}


class AzureAssessmentError(RuntimeError):
    pass


@dataclass(frozen=True)
class AzureSettings:
    key: str
    region: str
    language: str = "en-US"


async def load_azure_settings(config: Any) -> AzureSettings | None:
    """None ⇒ chưa cấu hình Azure ⇒ pipeline chấm bằng Gemini như trước (không gián đoạn pilot)."""
    key = await config.get("azure.speech_key")
    region = await config.get("azure.speech_region")
    if not (isinstance(key, str) and key.strip() and isinstance(region, str) and region.strip()):
        return None
    language = await config.get("azure.language")
    lang = language.strip() if isinstance(language, str) and language.strip() else "en-US"
    return AzureSettings(key=key.strip(), region=region.strip(), language=lang)


# ─── gọi SDK — chạy trong thread (asyncio.to_thread), không test tự động ─────────────────────


def run_assessment(
    wav_path: str,
    settings: AzureSettings,
    reference_text: str | None,
    timeout_sec: float = 900,
) -> list[dict[str, Any]]:
    """Continuous recognition + pronunciation assessment trên cả file (clip 5 phút vượt giới hạn
    60 giây của REST short-audio). Trả về JSON thô của từng đoạn Azure nhận dạng được."""
    import azure.cognitiveservices.speech as speechsdk  # noqa: PLC0415 — chỉ nạp khi thật sự dùng

    scripted = bool(reference_text and reference_text.strip())
    speech_config = speechsdk.SpeechConfig(subscription=settings.key, region=settings.region)
    speech_config.speech_recognition_language = settings.language
    pa_config = speechsdk.PronunciationAssessmentConfig(
        reference_text=reference_text.strip() if scripted and reference_text else "",
        grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
        enable_miscue=scripted,
    )
    pa_config.phoneme_alphabet = "IPA"
    pa_config.nbest_phoneme_count = 5
    pa_config.enable_prosody_assessment()

    audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
    pa_config.apply_to(recognizer)

    segments: list[dict[str, Any]] = []
    errors: list[str] = []
    done = threading.Event()

    def on_recognized(evt: Any) -> None:
        if evt.result.reason != speechsdk.ResultReason.RecognizedSpeech:
            return
        raw = evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
        if raw:
            segments.append(json.loads(raw))

    def on_canceled(evt: Any) -> None:
        details = evt.cancellation_details
        if details.reason == speechsdk.CancellationReason.Error:
            errors.append(f"{details.error_code}: {details.error_details}")
        done.set()  # EndOfStream cũng đi qua đây — đó là kết thúc bình thường

    recognizer.recognized.connect(on_recognized)
    recognizer.session_stopped.connect(lambda _evt: done.set())
    recognizer.canceled.connect(on_canceled)

    recognizer.start_continuous_recognition()
    finished = done.wait(timeout_sec)
    recognizer.stop_continuous_recognition()

    if errors:
        raise AzureAssessmentError(errors[0])
    if not finished:
        raise AzureAssessmentError(f"Azure không trả kết quả sau {int(timeout_sec)} giây")
    return segments


# ─── tóm tắt JSON Azure thành dữ kiện — THUẦN ─────────────────────────────────────────────────


def _error_type(word: dict[str, Any]) -> str:
    return str((word.get("PronunciationAssessment") or {}).get("ErrorType") or "None")


def _accuracy(node: dict[str, Any]) -> float | None:
    value = (node.get("PronunciationAssessment") or {}).get("AccuracyScore")
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _worst_phoneme(word: dict[str, Any]) -> dict[str, Any] | None:
    phonemes = [p for p in word.get("Phonemes") or [] if _accuracy(p) is not None]
    if not phonemes:
        return None
    worst = min(phonemes, key=lambda p: _accuracy(p) or 0)
    expected = str(worst.get("Phoneme") or "")
    nbest = (worst.get("PronunciationAssessment") or {}).get("NBestPhonemes") or []
    heard = str(nbest[0].get("Phoneme") or "") if nbest and isinstance(nbest[0], dict) else ""
    return {"expected": expected, "heard": heard if heard and heard != expected else "", "accuracy": _accuracy(worst)}


def summarize(segments: list[dict[str, Any]], scripted: bool) -> dict[str, Any]:
    """Gộp các đoạn Azure: điểm tổng (trung bình có trọng số theo số từ), âm đuôi, trọng âm,
    danh sách từ phát âm kém nhất, transcript."""
    weighted: dict[str, list[float]] = {k: [0.0, 0.0] for k in SCORE_FIELDS}
    words: list[dict[str, Any]] = []
    transcript: list[str] = []

    for segment in segments:
        nbest = (segment.get("NBest") or [{}])[0] or {}
        seg_words = [w for w in nbest.get("Words") or [] if isinstance(w, dict)]
        weight = max(1, sum(1 for w in seg_words if _error_type(w) not in ("Omission", "Insertion")))
        pa = nbest.get("PronunciationAssessment") or {}
        for name, field in SCORE_FIELDS.items():
            value = pa.get(field)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                weighted[name][0] += float(value) * weight
                weighted[name][1] += weight
        display = nbest.get("Display") or segment.get("DisplayText")
        if display:
            transcript.append(str(display))
        words.extend(seg_words)

    scores = {name: (round(total / count, 2) if count else None) for name, (total, count) in weighted.items()}
    spoken = [w for w in words if _error_type(w) not in ("Omission", "Insertion")]

    # Âm đuôi (§5.2): độ chính xác của âm vị CUỐI mỗi từ được nói.
    finals = [a for w in spoken if (w.get("Phonemes") or []) and (a := _accuracy(w["Phonemes"][-1])) is not None]
    # Trọng âm (§6.1): độ chính xác âm tiết của từ nhiều âm tiết, kết hợp prosody khi có.
    stress_words = []
    for w in spoken:
        syllables = [a for s in w.get("Syllables") or [] if (a := _accuracy(s)) is not None]
        if len(syllables) >= 2:
            stress_words.append(sum(syllables) / len(syllables))
    syllable_score = _mean(stress_words)
    parts = [v for v in (syllable_score, scores["prosody"]) if v is not None]
    word_stress = _mean(parts)

    candidates = [
        w
        for w in spoken
        if w.get("Word") and ((_accuracy(w) or 100) < LOW_WORD_ACCURACY or _error_type(w) == "Mispronunciation")
    ]
    candidates.sort(key=lambda w: _accuracy(w) or 0)
    errors = []
    for w in candidates[:MAX_ERRORS]:
        worst = _worst_phoneme(w)
        offset = w.get("Offset")
        errors.append(
            {
                "word": str(w["Word"]),
                "accuracy": _accuracy(w),
                "error_type": _error_type(w),
                "phoneme": worst["expected"] if worst else "",
                "heard_phoneme": worst["heard"] if worst else "",
                "offset_sec": round(offset / TICKS_PER_SEC, 1) if isinstance(offset, (int, float)) else None,
            }
        )

    return {
        "engine": "azure-pronunciation-assessment",
        "mode": "scripted" if scripted else "unscripted",
        "scores": scores,
        "ending_sounds": _mean(finals),
        "word_stress": word_stress,
        "word_count": len(spoken),
        "omissions": sum(1 for w in words if _error_type(w) == "Omission"),
        "insertions": sum(1 for w in words if _error_type(w) == "Insertion"),
        "errors": errors,
        "transcript": " ".join(transcript)[:MAX_TRANSCRIPT_CHARS],
    }


# ─── quy đổi 0–100 → thang rubric — THUẦN ─────────────────────────────────────────────────────


def parse_thresholds(raw: str | None) -> dict[int, list[tuple[float, float]]]:
    """`azure.score_thresholds_json`, dạng {"5": [[90,5],[75,4],...], "9": [...]}. Hỏng ⇒ bỏ qua
    (dùng mặc định) kèm warning — một setting gõ sai không được làm dừng việc chấm."""
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
        out: dict[int, list[tuple[float, float]]] = {}
        for scale_max, rows in data.items():
            pairs = sorted(((float(a), float(b)) for a, b in rows), key=lambda p: -p[0])
            out[int(scale_max)] = pairs
        return out
    except (ValueError, TypeError, AttributeError):
        logger.warning("azure.score_thresholds_json không hợp lệ — dùng ngưỡng mặc định")
        return {}


def _snap(value: float, scale: dict[str, Any]) -> float:
    lo, hi, step = float(scale["min"]), float(scale["max"]), float(scale["step"]) or 1.0
    snapped = lo + math.floor((value - lo) / step + 0.5) * step
    snapped = min(hi, max(lo, snapped))
    return int(snapped) if float(snapped).is_integer() else snapped


def to_band(value: float | None, scale: dict[str, Any], overrides: dict[int, list[tuple[float, float]]]) -> float | None:
    if value is None:
        return None
    scale_max = int(scale["max"])
    table = overrides.get(scale_max) or DEFAULT_THRESHOLDS.get(scale_max)
    if table:
        for minimum, band in table:
            if value >= minimum:
                return _snap(band, scale)
        return _snap(float(scale["min"]), scale)
    # Thang không có bảng ⇒ tuyến tính, để hệ thống vẫn chạy với rubric tự dựng.
    lo, hi = float(scale["min"]), float(scale["max"])
    return _snap(lo + (hi - lo) * value / 100.0, scale)


def is_ielts(rubric: dict[str, Any]) -> bool:
    return any(d["key"] == "fluency_coherence" for d in rubric["dimensions"])


def azure_metric(dimension_key: str, facts: dict[str, Any], ielts: bool) -> float | None:
    """Tiêu chí nào đo được bằng Azure, bằng chỉ số nào (§6). None ⇒ tiêu chí để Gemini chấm."""
    s = facts["scores"]
    if dimension_key == "pronunciation":
        if ielts:
            return _mean([v for v in (s.get("accuracy"), s.get("prosody")) if v is not None])
        return s.get("accuracy")
    if dimension_key == "intonation":
        return s.get("prosody")
    if dimension_key == "ending_sounds":
        return facts.get("ending_sounds")
    if dimension_key == "word_stress":
        return facts.get("word_stress")
    if dimension_key in ("fluency", "fluency_coherence"):
        return s.get("fluency")
    return None


def measure_bands(
    rubric: dict[str, Any], facts: dict[str, Any], overrides: dict[int, list[tuple[float, float]]]
) -> dict[str, dict[str, float]]:
    ielts = is_ielts(rubric)
    measured: dict[str, dict[str, float]] = {}
    for dim in rubric["dimensions"]:
        metric = azure_metric(dim["key"], facts, ielts)
        band = to_band(metric, rubric["scale"], overrides)
        if metric is not None and band is not None:
            measured[dim["key"]] = {"metric": round(metric, 1), "band": band}
    return measured


def _heard_as(error: dict[str, Any]) -> str:
    if error.get("heard_phoneme") and error.get("phoneme"):
        return f"/{error['heard_phoneme']}/ thay vì /{error['phoneme']}/"
    return ""


def apply_azure_scores(
    rubric: dict[str, Any],
    data: dict[str, Any],
    facts: dict[str, Any],
    measured: dict[str, dict[str, float]],
) -> dict[str, Any]:
    """Ghi đè điểm Gemini bằng điểm Azure cho các tiêu chí đo được. `fluency_coherence`: Gemini
    chỉ chấm nửa mạch lạc ⇒ trung bình với nửa trôi chảy của Azure. Từ phát âm sai lấy từ Azure;
    Gemini chỉ góp phần `suggestion` cho đúng những từ đó."""
    out = copy.deepcopy(data)
    scores = out.setdefault("scores", {})
    for key, m in measured.items():
        dim = scores.setdefault(key, {})
        band = m["band"]
        if key == "fluency_coherence":
            llm_half = dim.get("score")
            if isinstance(llm_half, (int, float)) and not isinstance(llm_half, bool):
                band = _snap((float(band) + float(llm_half)) / 2, rubric["scale"])
        dim["score"] = band

    pron = scores.get("pronunciation")
    if isinstance(pron, dict):
        llm_words = {
            str(w.get("word", "")).lower(): w
            for w in pron.get("mispronounced_words") or []
            if isinstance(w, dict) and w.get("word")
        }
        merged = []
        for e in facts.get("errors") or []:
            llm = llm_words.get(e["word"].lower()) or {}
            suggestion = llm.get("suggestion") or (
                f"Chú ý âm /{e['phoneme']}/ trong từ này" if e.get("phoneme") else "Nghe lại và đọc chậm từ này"
            )
            item: dict[str, Any] = {"word": e["word"], "heard_as": _heard_as(e), "suggestion": str(suggestion)}
            if e.get("offset_sec") is not None:
                item["approx_position_sec"] = e["offset_sec"]
            merged.append(item)
        pron["mispronounced_words"] = merged
    return out


# ─── dữ kiện Azure cho prompt Gemini — THUẦN ──────────────────────────────────────────────────


def _fmt(value: float | None) -> str:
    return "—" if value is None else f"{value:g}"


def _mmss(seconds: float | None) -> str:
    if seconds is None:
        return "?"
    s = max(0, int(seconds))
    return f"{s // 60}:{s % 60:02d}"


def build_facts_instruction(rubric: dict[str, Any], facts: dict[str, Any], measured: dict[str, dict[str, float]]) -> str:
    labels = {d["key"]: d["label"] for d in rubric["dimensions"]}
    s = facts["scores"]
    lines = [
        "",
        "DỮ KIỆN ĐO BẰNG AZURE PRONUNCIATION ASSESSMENT (đo từ tín hiệu âm thanh, tất định — tin tưởng các số này):",
        f"Chế độ: {'đọc theo văn bản bài đọc' if facts['mode'] == 'scripted' else 'nói tự do (không có văn bản mẫu)'}.",
        f"Điểm 0–100: độ chính xác {_fmt(s.get('accuracy'))}, trôi chảy {_fmt(s.get('fluency'))}, "
        f"ngữ điệu (prosody) {_fmt(s.get('prosody'))}, âm đuôi {_fmt(facts.get('ending_sounds'))}, "
        f"trọng âm {_fmt(facts.get('word_stress'))}"
        + (f", độ đầy đủ so với bài đọc {_fmt(s.get('completeness'))}" if facts["mode"] == "scripted" else "")
        + ".",
        "ĐIỂM CÁC TIÊU CHÍ SAU ĐÃ ĐƯỢC HỆ THỐNG CHỐT. Trả ĐÚNG số này trong trường 'score', và viết nhận xét, hướng sửa KHỚP với mức điểm đó:",
    ]
    for key, m in measured.items():
        if key == "fluency_coherence":
            continue
        lines.append(f"  - {labels.get(key, key)}: {_fmt(m['band'])}")
    if "fluency_coherence" in measured:
        lines.append(
            f"  - {labels.get('fluency_coherence', 'fluency_coherence')}: phần TRÔI CHẢY đã đo được band "
            f"{_fmt(measured['fluency_coherence']['band'])}. Trường 'score' của tiêu chí này bạn CHỈ chấm phần "
            "MẠCH LẠC (coherence); hệ thống tự kết hợp hai phần."
        )
    errors = facts.get("errors") or []
    if errors:
        lines.append(
            "Từ phát âm kém đo được — trong 'mispronounced_words' CHỈ được dùng các từ trong danh sách này, "
            "KHÔNG thêm từ khác; viết 'suggestion' cụ thể cho từng từ:"
        )
        for e in errors:
            sound = f", âm /{e['phoneme']}/" if e.get("phoneme") else ""
            heard = f" nghe như /{e['heard_phoneme']}/" if e.get("heard_phoneme") else ""
            lines.append(f"  - {e['word']} (độ chính xác {_fmt(e.get('accuracy'))}{sound}{heard}, lúc {_mmss(e.get('offset_sec'))})")
    else:
        lines.append("Azure không phát hiện từ phát âm kém rõ rệt — để 'mispronounced_words' là mảng rỗng.")
    if facts.get("transcript"):
        lines.append(
            "Bản ghi lời nói do Azure nhận dạng (có thể sai ở số ít/số nhiều, thì, phủ định — KHÔNG trừ điểm "
            f"ngữ pháp chỉ vì bản ghi): {facts['transcript'][:2500]}"
        )
    return "\n".join(lines)


def storable(facts: dict[str, Any], measured: dict[str, dict[str, float]]) -> dict[str, Any]:
    """Bản ghi vào `gradings.assessment` — dữ kiện gốc để giáo viên đối chiếu và để đo độ lệch sau này."""
    return {**facts, "measured": measured}
