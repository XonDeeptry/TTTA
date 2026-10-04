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
# Từ không có mốc Azure: cửa sổ quanh mốc ước lượng của Gemini (ước lượng lệch được ~1 giây).
UNANCHORED_BEFORE_SEC = 0.8
UNANCHORED_AFTER_SEC = 1.6
UNCLEAR_SUGGESTION = "Đoạn này cô chưa nghe rõ, em đọc lại thật to và rõ từng âm của từ này nhé."
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
        approx = proposal.get("approx_position_sec")
        has_approx = isinstance(approx, (int, float)) and not isinstance(approx, bool) and approx >= 0
        occurrences = [w for w in timeline if _norm(w.get("word")) == key and w["start_sec"] not in used_starts]
        if not occurrences:
            # Học thuật 2026-09-29: từ đọc sai/không rõ đến mức Azure nghe thành từ khác (hoặc không
            # thành từ nào) thì dòng thời gian không có nó — trước đây bị BỎ. Nay cắt quanh mốc ước
            # lượng của Gemini. Không có cả mốc ước lượng thì không đánh dấu thời điểm được ⇒ bỏ.
            if not has_approx:
                continue
            candidates.append(
                {
                    "word": str(proposal.get("word")).strip(),
                    "accuracy": None,
                    "start_sec": round(max(0.0, float(approx) - UNANCHORED_BEFORE_SEC), 2),
                    "end_sec": round(float(approx) + UNANCHORED_AFTER_SEC, 2),
                    "weak_phonemes": [],
                    "source": "gemini",
                    "anchored": False,
                    "approx_sec": round(float(approx), 2),
                    "llm_heard_as": str(proposal.get("heard_as") or ""),
                    "llm_suggestion": str(proposal.get("suggestion") or ""),
                }
            )
            continue
        if has_approx:
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
    elif candidate.get("anchored") is False:
        label += " — nghi đọc sai hoặc nói không rõ khi nghe cả bài; mốc là ƯỚC LƯỢNG, từ có thể nằm lệch trong đoạn"
    else:
        label += " — nghi phát âm sai khi nghe cả bài (Azure không đánh dấu)"
    return label


def address_for(rubric: dict[str, Any] | None) -> str:
    """Cách gọi học viên lấy theo giọng điệu rubric — lớp thiếu nhi ghi "gọi học viên là 'con'".
    Giáo viên thiếu nhi viết "con" 131/131 lần khi sửa nhận xét (2026-10-03); mặc định "em"."""
    tone = str((rubric or {}).get("tone") or "")
    return "con" if "'con'" in tone or '"con"' in tone else "em"


def build_clip_instruction(address: str = "em") -> str:
    return "\n".join(
        [
            "Bạn là giáo viên phát âm tiếng Anh của trung tâm ILM, chấm bài nói của học viên Việt Nam.",
            "Bạn nhận nhiều ĐOẠN AUDIO RẤT NGẮN. Mỗi đoạn được cắt quanh MỘT từ học viên nói (thêm khoảng 0,35 giây trước và sau), kèm nhãn [số] và từ mục tiêu.",
            "Với TỪNG đoạn, nghe kỹ và trả về một mục có đúng 'index' của nhãn:",
            "- said: học viên thực sự phát âm từ đó thế nào — ghi bằng IPA, ví dụ /ˈmjuːsɪk/.",
            "- is_error: true nếu phát âm SAI rõ rệt so với cách đọc chuẩn (người nghe khó hiểu hoặc sai âm), false nếu chấp nhận được.",
            "- issue: lỗi cụ thể (âm nào, sai thế nào, ở vị trí nào trong từ); để rỗng nếu is_error là false.",
            "- suggestion: hướng sửa cụ thể, làm được ngay, bằng tiếng Việt, giọng thẳng thắn, cụ thể của giáo viên ILM: xưng 'cô', gọi học viên là '{address}' (KHÔNG dùng 'bạn', KHÔNG gọi tên); ví dụ '{address_cap} đặt nhẹ đầu lưỡi giữa hai hàm răng rồi thổi hơi ra để đọc /θ/ nhé.'; để rỗng nếu is_error là false.",
            "CHỈ dựa trên đoạn audio. Học viên nói ở chỗ từ mục tiêu nhưng KHÔNG NGHE RÕ, hoặc nói ra âm không thành từ có nghĩa: vẫn là LỖI — is_error = true, said = IPA những gì nghe được (rỗng nếu không nghe ra), issue = 'nói không rõ', suggestion = nhắc {address} đọc lại to, rõ từ mục tiêu. Chỉ khi đoạn hoàn toàn không có tiếng học viên ở chỗ đó thì said = '' và is_error = false. Không bỏ sót đoạn nào.",
        ]
    ).replace("{address_cap}", address.capitalize()).replace("{address}", address)


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
        # Học thuật 2026-09-29: KHÔNG bỏ từ Gemini đề xuất chỉ vì nghe đoạn cắt không xác nhận (đoạn
        # không rõ, mốc lệch). Giữ lại, đánh dấu thời điểm, gắn `needs_review` để giáo viên nghe ▶ rồi
        # quyết định — giống từ Azure bị hai lượt bất đồng.
        confirmed = bool(result and result.get("is_error"))
        result = result or {}
        item = {
            "word": str(candidate["word"]),
            "heard_as": str(result.get("said") or candidate.get("llm_heard_as") or ""),
            "suggestion": str(result.get("suggestion") or candidate.get("llm_suggestion") or UNCLEAR_SUGGESTION),
            "issue": str(result.get("issue") or ""),
            # Mốc học viên thấy: mốc thật của Azure, hoặc mốc ước lượng của Gemini (không phải đầu cửa sổ cắt).
            "approx_position_sec": candidate.get("approx_sec", candidate["start_sec"]),
            "start_sec": candidate.get("approx_sec", candidate["start_sec"]),
            **({"end_sec": candidate["end_sec"]} if candidate.get("end_sec") is not None and "approx_sec" not in candidate else {}),
            "source": "gemini",
            "gemini_confirmed": confirmed,
        }
        if not confirmed:
            item["needs_review"] = True
        merged.append(item)
    merged.sort(key=lambda w: (w.get("start_sec") is None, w.get("start_sec") or 0))
    return merged


async def analyze_error_clips(
    config: ConfigStore,
    wav_path: str,
    candidates: list[dict[str, Any]],
    address: str = "em",
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
            system_instruction=build_clip_instruction(address),
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
