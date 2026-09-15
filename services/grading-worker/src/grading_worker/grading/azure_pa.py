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

Đối chiếu phản hồi THẬT 2026-09-15 (IELTS Part 1, 303 giây, 30 đoạn, 452 từ): cấu trúc JSON khớp.
Hai lỗi của bản đầu, cả hai do pilot tìm ra:
- Giới hạn 10 từ lỗi đã BỎ 17 trong 27 từ Azure đánh dấu Mispronunciation — Gemini không bao giờ
  thấy chúng nên không có hướng sửa. Nay lấy mọi từ Mispronunciation và mọi từ dưới ngưỡng.
- Chỉ lưu mốc bắt đầu làm tròn 0,1 s. Hệ thống phía sau (từ điển, bảng lỗi phát âm §8.4) cần
  khoảng [bắt đầu, kết thúc] của từ VÀ của âm vị yếu, cùng dòng thời gian mọi từ.

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
# Từ có độ chính xác dưới ngưỡng này được coi là lỗi dù Azure không gắn ErrorType.
LOW_WORD_ACCURACY = 60
# Âm vị dưới ngưỡng này được liệt kê là âm vị yếu của từ đó.
LOW_PHONEME_ACCURACY = 60
# Trần an toàn cho prompt và tin nhắn — clip 5 phút thật có 27 từ Mispronunciation, 63 từ < 80.
MAX_ERRORS = 80

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
    60 giây của REST short-audio). Trả về JSON thô của từng đoạn Azure nhận dạng được.
    Đo 2026-09-15: clip 303 giây mất 147,7 giây (~0,49× thời gian thực)."""
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


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _error_type(word: dict[str, Any]) -> str:
    return str((word.get("PronunciationAssessment") or {}).get("ErrorType") or "None")


def _accuracy(node: dict[str, Any]) -> float | None:
    return _number((node.get("PronunciationAssessment") or {}).get("AccuracyScore"))


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _span(node: dict[str, Any]) -> tuple[float | None, float | None]:
    """[bắt đầu, kết thúc] tính bằng giây, từ Offset/Duration (đơn vị 100 ns) của Azure."""
    offset = _number(node.get("Offset"))
    duration = _number(node.get("Duration"))
    start = round(offset / TICKS_PER_SEC, 2) if offset is not None else None
    end = round((offset + duration) / TICKS_PER_SEC, 2) if offset is not None and duration is not None else None
    return start, end


def _heard(phoneme: dict[str, Any]) -> str:
    expected = str(phoneme.get("Phoneme") or "")
    nbest = (phoneme.get("PronunciationAssessment") or {}).get("NBestPhonemes") or []
    top = str(nbest[0].get("Phoneme") or "") if nbest and isinstance(nbest[0], dict) else ""
    return top if top and top != expected else ""


def _position(index: int, count: int) -> str:
    if index == count - 1 and count > 1:
        return "final"
    return "initial" if index == 0 else "medial"


def _weak_phonemes(word: dict[str, Any]) -> list[dict[str, Any]]:
    phonemes = [p for p in word.get("Phonemes") or [] if isinstance(p, dict)]
    out = []
    for i, p in enumerate(phonemes):
        acc = _accuracy(p)
        if acc is None or acc >= LOW_PHONEME_ACCURACY:
            continue
        start, end = _span(p)
        out.append(
            {
                "phoneme": str(p.get("Phoneme") or ""),
                "accuracy": acc,
                "heard": _heard(p),
                "position": _position(i, len(phonemes)),
                "start_sec": start,
                "end_sec": end,
            }
        )
    return out


def _worst_phoneme(word: dict[str, Any]) -> dict[str, Any] | None:
    phonemes = [p for p in word.get("Phonemes") or [] if _accuracy(p) is not None]
    if not phonemes:
        return None
    worst = min(phonemes, key=lambda p: _accuracy(p) or 0)
    return {"expected": str(worst.get("Phoneme") or ""), "heard": _heard(worst), "accuracy": _accuracy(worst)}


def _prosody_errors(word: dict[str, Any]) -> list[str]:
    prosody = ((word.get("PronunciationAssessment") or {}).get("Feedback") or {}).get("Prosody") or {}
    found = []
    for aspect in ("Break", "Intonation"):
        for error_type in (prosody.get(aspect) or {}).get("ErrorTypes") or []:
            if error_type and error_type != "None":
                found.append(str(error_type))
    return found


def summarize(segments: list[dict[str, Any]], scripted: bool) -> dict[str, Any]:
    """Gộp các đoạn Azure: điểm tổng (trung bình có trọng số theo số từ), âm đuôi, trọng âm, MỌI từ
    phát âm kém kèm khoảng thời gian và âm vị yếu, dòng thời gian mọi từ, transcript."""
    weighted: dict[str, list[float]] = {k: [0.0, 0.0] for k in SCORE_FIELDS}
    words: list[dict[str, Any]] = []
    transcript: list[str] = []

    for segment in segments:
        nbest = (segment.get("NBest") or [{}])[0] or {}
        seg_words = [w for w in nbest.get("Words") or [] if isinstance(w, dict)]
        weight = max(1, sum(1 for w in seg_words if _error_type(w) not in ("Omission", "Insertion")))
        pa = nbest.get("PronunciationAssessment") or {}
        for name, field in SCORE_FIELDS.items():
            value = _number(pa.get(field))
            if value is not None:
                weighted[name][0] += value * weight
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
    word_stress = _mean([v for v in (_mean(stress_words), scores["prosody"]) if v is not None])

    candidates = [
        w
        for w in spoken
        if w.get("Word") and ((_accuracy(w) or 100) < LOW_WORD_ACCURACY or _error_type(w) == "Mispronunciation")
    ]
    if len(candidates) > MAX_ERRORS:  # giữ những từ tệ nhất, rồi xếp lại theo thời gian
        candidates = sorted(candidates, key=lambda w: _accuracy(w) or 0)[:MAX_ERRORS]
    errors = []
    for w in candidates:
        start, end = _span(w)
        worst = _worst_phoneme(w)
        errors.append(
            {
                "word": str(w["Word"]),
                "accuracy": _accuracy(w),
                "error_type": _error_type(w),
                "phoneme": worst["expected"] if worst else "",
                "heard_phoneme": worst["heard"] if worst else "",
                "offset_sec": start,  # giữ tên cũ cho bản ghi trước 09-15 và giao diện
                "start_sec": start,
                "end_sec": end,
                "weak_phonemes": _weak_phonemes(w),
            }
        )
    errors.sort(key=lambda e: (e["start_sec"] is None, e["start_sec"] or 0))

    timeline = []
    prosody_counts: dict[str, int] = {}
    for w in words:
        start, end = _span(w)
        timeline.append(
            {"word": str(w.get("Word") or ""), "start_sec": start, "end_sec": end, "accuracy": _accuracy(w), "error_type": _error_type(w)}
        )
        for error_type in _prosody_errors(w):
            prosody_counts[error_type] = prosody_counts.get(error_type, 0) + 1

    return {
        "engine": "azure-pronunciation-assessment",
        "mode": "scripted" if scripted else "unscripted",
        "scores": scores,
        "ending_sounds": _mean(finals),
        "word_stress": word_stress,
        "word_count": len(spoken),
        "omissions": sum(1 for w in words if _error_type(w) == "Omission"),
        "insertions": sum(1 for w in words if _error_type(w) == "Insertion"),
        "prosody_feedback": prosody_counts,
        "errors": errors,
        "words": timeline,
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
    chỉ chấm nửa mạch lạc ⇒ trung bình với nửa trôi chảy của Azure. Từ phát âm sai lấy từ Azure
    (theo thứ tự thời gian, kèm khoảng [bắt đầu, kết thúc]); Gemini chỉ góp phần `suggestion`."""
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
        llm_words: dict[str, list[dict[str, Any]]] = {}
        for w in pron.get("mispronounced_words") or []:
            if isinstance(w, dict) and w.get("word"):
                llm_words.setdefault(str(w["word"]).lower(), []).append(w)
        merged = []
        for e in facts.get("errors") or []:
            # Cùng một từ có thể sai nhiều lần — ghép lần lượt, không dùng lại một gợi ý cho mọi lần.
            same_word = llm_words.get(e["word"].lower()) or []
            llm = same_word.pop(0) if same_word else {}
            suggestion = llm.get("suggestion") or (
                f"Chú ý âm /{e['phoneme']}/ trong từ này" if e.get("phoneme") else "Nghe lại và đọc chậm từ này"
            )
            item: dict[str, Any] = {"word": e["word"], "heard_as": _heard_as(e), "suggestion": str(suggestion)}
            start = e.get("start_sec", e.get("offset_sec"))
            if start is not None:
                item["approx_position_sec"] = start
                item["start_sec"] = start
            if e.get("end_sec") is not None:
                item["end_sec"] = e["end_sec"]
            merged.append(item)
        pron["mispronounced_words"] = merged
    return out


# ─── dữ kiện Azure cho prompt Gemini — THUẦN ──────────────────────────────────────────────────


def _fmt(value: float | None) -> str:
    return "—" if value is None else f"{value:g}"


def _mmss(seconds: float | None) -> str:
    if seconds is None:
        return "?"
    whole = max(0.0, float(seconds))
    return f"{int(whole // 60)}:{whole % 60:04.1f}"


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
    ]
    prosody = facts.get("prosody_feedback") or {}
    if prosody:
        detail = ", ".join(f"{name} ở {count} từ" for name, count in sorted(prosody.items(), key=lambda kv: -kv[1]))
        lines.append(
            f"Phản hồi ngữ điệu của Azure trên {facts.get('word_count', '?')} từ: {detail} "
            "(Monotone = giọng đều; UnexpectedBreak/MissingBreak = ngắt hơi sai chỗ)."
        )
    lines.append(
        "ĐIỂM CÁC TIÊU CHÍ SAU ĐÃ ĐƯỢC HỆ THỐNG CHỐT. Trả ĐÚNG số này trong trường 'score', và viết nhận xét, hướng sửa KHỚP với mức điểm đó:"
    )
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
            f"Từ phát âm kém đo được — {len(errors)} từ, theo thứ tự thời gian. Trong 'mispronounced_words' "
            "phải trả ĐỦ TẤT CẢ các từ này (một mục cho mỗi dòng, kể cả từ lặp lại), KHÔNG thêm từ khác, "
            "và viết 'suggestion' cụ thể cho từng từ dựa vào âm vị yếu:"
        )
        for e in errors:
            weak = ", ".join(
                f"/{p['phoneme']}/ {p['position']} {_fmt(p['accuracy'])}" + (f" nghe như /{p['heard']}/" if p.get("heard") else "")
                for p in e.get("weak_phonemes") or []
            )
            lines.append(
                f"  - {_mmss(e.get('start_sec', e.get('offset_sec')))}–{_mmss(e.get('end_sec'))} {e['word']} "
                f"(độ chính xác {_fmt(e.get('accuracy'))}; âm vị yếu: {weak or 'không có âm vị dưới ngưỡng'})"
            )
    else:
        lines.append("Azure không phát hiện từ phát âm kém rõ rệt — để 'mispronounced_words' là mảng rỗng.")
    if facts.get("transcript"):
        lines.append(
            "Bản ghi lời nói do Azure nhận dạng (có thể sai ở số ít/số nhiều, thì, phủ định — KHÔNG trừ điểm "
            f"ngữ pháp chỉ vì bản ghi): {facts['transcript'][:2500]}"
        )
    return "\n".join(lines)


def storable(facts: dict[str, Any], measured: dict[str, dict[str, float]]) -> dict[str, Any]:
    """Bản ghi vào `gradings.assessment` — dữ kiện gốc để giáo viên đối chiếu, để hệ thống phía sau
    dùng mốc thời gian, và để đo độ lệch sau này."""
    return {**facts, "measured": measured}
