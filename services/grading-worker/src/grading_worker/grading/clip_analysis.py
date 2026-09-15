"""Cắt từng đoạn lỗi phát âm và cho Gemini NGHE LẠI — quyết định ILM 2026-09-15 (pilot).

Vì sao: Azure đo độ chính xác âm vị rất ổn định nhưng không nói được học viên THỰC SỰ phát âm thế
nào, và ở chế độ nói tự do nó còn bỏ sót lỗi (nghe nhầm thành một từ khác rồi chấm như đúng).
Nghe cả bài 5 phút, Gemini chỉ đoán chung chung. Nghe đúng đoạn 1–2 giây quanh một từ, nó trả lời
được câu hỏi hẹp: "từ này học viên đọc ra sao, có sai không, sửa thế nào".

Luồng (ILM chốt):
1. Ứng viên = MỌI từ Azure đánh dấu + những từ Gemini (nghe cả bài) cho là sai mà Azure bỏ sót.
   Từ Gemini đề xuất lấy MỐC từ dòng thời gian của Azure — không có trong dòng thời gian thì không
   cắt được, bỏ.
2. Cắt từng đoạn [bắt đầu − 0,35 s, kết thúc + 0,35 s] từ audio16k.wav. KHÔNG giới hạn số đoạn:
   học viên sai bao nhiêu thì cắt bấy nhiêu, việc lọc là của giáo viên.
3. Gemini nghe theo lô, trả `said`, `is_error`, `issue`, `suggestion` cho từng đoạn.
4. Ghép: từ Azure LUÔN giữ (điểm Azure không đổi); Gemini nghe thấy không sai ⇒ `needs_review`.
   Từ Gemini đề xuất chỉ vào danh sách khi nghe đoạn cắt XÁC NHẬN là sai.

Các hàm ghép/căn mốc/dựng nhãn là THUẦN và có test; phần gọi ffmpeg + Gemini mỏng.
"""

from __future__ import annotations

import os
from collections import Counter
from typing import Any

from ..config import ConfigStore
from ..media.ffmpeg import cut_clip
from .providers.factory import _resolve_model, _resolve_temperature
from .providers.gemini import GeminiProvider

PAD_SEC = 0.35
MIN_CLIP_SEC = 0.6
CLIPS_PER_CALL = 40
_PUNCT = ".,!?;:\"'()[]"

CLIP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "said": {"type": "string"},
                    "is_error": {"type": "boolean"},
                    "issue": {"type": "string"},
                    "suggestion": {"type": "string"},
                },
                "required": ["index", "said", "is_error", "issue", "suggestion"],
            },
        }
    },
    "required": ["items"],
}


class ClipAnalysisUnavailable(RuntimeError):
    pass


def _norm(word: Any) -> str:
    return str(word or "").strip().strip(_PUNCT).lower()


def build_candidates(facts: dict[str, Any], llm_words: list[Any]) -> list[dict[str, Any]]:
    """Từ Azure đánh dấu (giữ thứ tự) + từ Gemini đề xuất mà Azure không đánh dấu, căn mốc theo dòng
    thời gian Azure — lấy lần xuất hiện gần mốc ước lượng của Gemini nhất, mỗi mốc dùng một lần."""
    errors = [e for e in facts.get("errors") or [] if isinstance(e, dict) and e.get("start_sec") is not None]
    candidates = [{**e, "source": "azure"} for e in errors]

    unmatched_azure = Counter(_norm(e["word"]) for e in errors)
    used_starts = {e["start_sec"] for e in errors}
    timeline = [
        w for w in facts.get("words") or [] if isinstance(w, dict) and w.get("start_sec") is not None and w.get("error_type") != "Omission"
    ]
    for proposal in llm_words or []:
        if not isinstance(proposal, dict):
            continue
        key = _norm(proposal.get("word"))
        if not key:
            continue
        if unmatched_azure[key] > 0:  # chính là một từ Azure đã đánh dấu
            unmatched_azure[key] -= 1
            continue
        occurrences = [w for w in timeline if _norm(w.get("word")) == key and w["start_sec"] not in used_starts]
        if not occurrences:
            continue  # không có mốc Azure ⇒ không cắt được đoạn để xác nhận
        approx = proposal.get("approx_position_sec")
        if isinstance(approx, (int, float)) and not isinstance(approx, bool):
            best = min(occurrences, key=lambda w: abs(w["start_sec"] - float(approx)))
        else:
            best = occurrences[0]
        used_starts.add(best["start_sec"])
        candidates.append(
            {
                "word": best.get("word") or proposal.get("word"),
                "accuracy": best.get("accuracy"),
                "start_sec": best["start_sec"],
                "end_sec": best.get("end_sec"),
                "weak_phonemes": [],
                "source": "gemini",
                "llm_heard_as": str(proposal.get("heard_as") or ""),
                "llm_suggestion": str(proposal.get("suggestion") or ""),
            }
        )
    return candidates


def clip_bounds(candidate: dict[str, Any]) -> tuple[float, float]:
    start = float(candidate["start_sec"])
    end = candidate.get("end_sec")
    end_f = float(end) if isinstance(end, (int, float)) and not isinstance(end, bool) and end > start else start + MIN_CLIP_SEC
    return round(max(0.0, start - PAD_SEC), 3), round(end_f + PAD_SEC, 3)


def clip_label(index: int, candidate: dict[str, Any]) -> str:
    label = f"[{index}] Từ mục tiêu: \"{candidate['word']}\""
    if candidate.get("source") == "azure":
        weak = ", ".join(
            f"/{p['phoneme']}/ ({p.get('position', '')}, {p.get('accuracy')})" for p in candidate.get("weak_phonemes") or []
        )
        label += f" — Azure đo độ chính xác {candidate.get('accuracy')}" + (f"; âm vị yếu: {weak}" if weak else "")
    else:
        label += " — nghi phát âm sai khi nghe cả bài (Azure không đánh dấu)"
    return label


def build_clip_instruction() -> str:
    return "\n".join(
        [
            "Bạn là giáo viên phát âm tiếng Anh của trung tâm ILM, chấm bài nói của học viên Việt Nam.",
            "Bạn nhận nhiều ĐOẠN AUDIO RẤT NGẮN. Mỗi đoạn được cắt quanh MỘT từ học viên nói (thêm khoảng 0,35 giây trước và sau), kèm nhãn [số] và từ mục tiêu.",
            "Với TỪNG đoạn, nghe kỹ và trả về một mục có đúng 'index' của nhãn:",
            "- said: học viên thực sự phát âm từ đó thế nào — ghi bằng IPA, ví dụ /ˈmjuːsɪk/.",
            "- is_error: true nếu phát âm SAI rõ rệt so với cách đọc chuẩn (người nghe khó hiểu hoặc sai âm), false nếu chấp nhận được.",
            "- issue: lỗi cụ thể (âm nào, sai thế nào, ở vị trí nào trong từ); để rỗng nếu is_error là false.",
            "- suggestion: hướng sửa cụ thể, làm được ngay, bằng tiếng Việt, giọng khích lệ của giáo viên ILM: xưng 'cô', gọi học viên là 'em' (KHÔNG dùng 'bạn'); ví dụ 'Em đặt nhẹ đầu lưỡi giữa hai hàm răng rồi thổi hơi ra để đọc /θ/ nhé.'; để rỗng nếu is_error là false.",
            "CHỈ dựa trên đoạn audio. Nghe không rõ hoặc đoạn không chứa từ mục tiêu thì said = '' và is_error = false. Không bỏ sót đoạn nào.",
        ]
    )


def merge_clip_results(
    mispronounced: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
    results: list[Any],
) -> list[dict[str, Any]]:
    """`mispronounced` là danh sách `apply_azure_scores` dựng từ các từ Azure — cùng thứ tự với phần
    `source == "azure"` của `candidates`."""
    by_index = {r["index"]: r for r in results if isinstance(r, dict) and isinstance(r.get("index"), int)}
    azure_items = iter(mispronounced)
    merged: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates):
        result = by_index.get(index)
        if candidate.get("source") == "azure":
            item = dict(next(azure_items, {"word": candidate["word"], "heard_as": "", "suggestion": ""}))
            item["source"] = "azure"
            if result:
                if result.get("said"):
                    item["heard_as"] = str(result["said"])
                if result.get("suggestion"):
                    item["suggestion"] = str(result["suggestion"])
                if result.get("issue"):
                    item["issue"] = str(result["issue"])
                item["gemini_confirmed"] = bool(result.get("is_error"))
                if not result.get("is_error"):
                    item["needs_review"] = True  # Azure nói sai, Gemini nghe thấy ổn — giáo viên phán
            merged.append(item)
            continue
        if not result or not result.get("is_error"):
            continue  # từ Gemini đề xuất chỉ vào danh sách khi nghe đoạn cắt xác nhận
        merged.append(
            {
                "word": str(candidate["word"]),
                "heard_as": str(result.get("said") or candidate.get("llm_heard_as") or ""),
                "suggestion": str(result.get("suggestion") or candidate.get("llm_suggestion") or "Nghe lại và đọc chậm từ này"),
                "issue": str(result.get("issue") or ""),
                "approx_position_sec": candidate["start_sec"],
                "start_sec": candidate["start_sec"],
                **({"end_sec": candidate["end_sec"]} if candidate.get("end_sec") is not None else {}),
                "source": "gemini",
                "gemini_confirmed": True,
            }
        )
    merged.sort(key=lambda w: (w.get("start_sec") is None, w.get("start_sec") or 0))
    return merged


async def analyze_error_clips(
    config: ConfigStore,
    wav_path: str,
    candidates: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Cắt đoạn + gọi Gemini theo lô. Trả (kết quả từng đoạn, thống kê để lưu và ghi chi phí)."""
    api_key = await config.get("llm.gemini_api_key")
    if not isinstance(api_key, str) or not api_key.strip():
        raise ClipAnalysisUnavailable("chưa có khóa Gemini")
    if not candidates:
        return [], {"clips": 0, "input_tokens": 0, "output_tokens": 0}

    provider = GeminiProvider(api_key.strip())
    model = await _resolve_model("gemini", config)
    temperature = await _resolve_temperature({}, config)
    clip_dir = os.path.join(os.path.dirname(wav_path), "error-clips")
    os.makedirs(clip_dir, exist_ok=True)

    clips: list[tuple[str, str]] = []
    for index, candidate in enumerate(candidates):
        start, end = clip_bounds(candidate)
        path = os.path.join(clip_dir, f"clip_{index:03d}.wav")
        await cut_clip(wav_path, start, end, path)
        clips.append((clip_label(index, candidate), path))

    results: list[Any] = []
    input_tokens = output_tokens = 0
    for offset in range(0, len(clips), CLIPS_PER_CALL):
        batch = clips[offset : offset + CLIPS_PER_CALL]
        response = await provider.analyze_clips(
            system_instruction=build_clip_instruction(),
            clips=batch,
            schema=CLIP_SCHEMA,
            model=model,
            temperature=temperature,
        )
        results.extend(response.data.get("items") or [])
        input_tokens += response.input_tokens
        output_tokens += response.output_tokens

    return results, {
        "clips": len(clips),
        "batches": (len(clips) + CLIPS_PER_CALL - 1) // CLIPS_PER_CALL,
        "provider": "gemini",
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }
