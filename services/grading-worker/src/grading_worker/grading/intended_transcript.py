"""Bài NÓI TỰ DO: Gemini ghi lại lời học viên ĐỊNH nói → Azure chấm SCRIPTED theo văn bản đó.

Vì sao (đo 2026-10-01 trên 11 bài IELTS dev-test "Bùi Văn Sơn", bài 209–219): ở chế độ unscripted,
Azure tự đoán từ rồi chấm phát âm theo CHÍNH từ nó đoán. Học viên đọc sai đến mức giống một từ khác
thì Azure chấm từ khác đó: "gangs" thành "girls"/"games", "government" thành "woman", "funerals"
thành "followers". 32/67 từ bị gắn cờ (48%) là từ học viên KHÔNG hề nói, kéo theo hướng sửa sai từ.
Cùng 11 bài, Azure scripted theo bản ghi "lời định nói" của Gemini: 10/10 lần "gang(s)" nhận đúng,
mọi từ bị gắn cờ đều là từ học viên định nói, cùng mốc giây với bản cũ (vd. 64.30 s: serial → several).

Chia việc: LLM hiểu NGỮ CẢNH (từ nào học viên định nói); Azure đo TÍN HIỆU (âm vị, mốc giây, tất
định). Phát âm vẫn chấm từ audio — văn bản chỉ để Azure biết đo từ nào, không phải chấm từ văn bản
(khác hẳn nhánh transcript F2 đã gỡ ngày 2026-08-25).

Bài đọc có văn bản mẫu (lớp thiếu nhi có `readingText`) KHÔNG đi qua đây — văn bản bài đọc luôn thắng.
"""

from __future__ import annotations

import re
from typing import Any

from ..config import ConfigStore
from .providers.factory import _resolve_model
from .providers.gemini import GeminiProvider

# Trần an toàn cho reference_text của Azure — clip tối đa 7 phút ≈ 1 000 từ ≈ 6 000 ký tự.
MAX_CHARS = 8000
# Ít hơn ngần này từ thì không đủ làm văn bản tham chiếu — rơi về unscripted như cũ.
MIN_WORDS = 3

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"transcript": {"type": "string"}},
    "required": ["transcript"],
}

# Nguyên văn prompt đã đo trên 11 bài ngày 2026-10-01 — sửa thì đo lại.
INSTRUCTION = (
    "Transcribe this English speaking recording by a Vietnamese learner. Write the words the speaker "
    "INTENDED to say, in order, as plain text. If a word is mispronounced so badly it sounds like another "
    "word, write the word the speaker clearly meant from the context and topic (e.g. 'gangs', not 'games'). "
    "Do NOT correct grammar, do NOT paraphrase, do NOT add words the speaker did not attempt, keep "
    "repetitions and false starts. Output only the transcript."
)


class IntendedTranscriptUnavailable(RuntimeError):
    pass


def clean_transcript(raw: Any) -> str:
    """Một dòng, khoảng trắng gọn, cắt theo trần — THUẦN, có test."""
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS].rsplit(" ", 1)[0]
    return text


async def transcribe_intended(config: ConfigStore, audio_path: str) -> tuple[str, dict[str, Any]]:
    """Trả (bản ghi lời định nói, thống kê chi phí). Không dùng được ⇒ raise — caller rơi về unscripted."""
    api_key = await config.get("llm.gemini_api_key")
    if not isinstance(api_key, str) or not api_key.strip():
        raise IntendedTranscriptUnavailable("chưa có khóa Gemini")
    model = await _resolve_model("gemini", config)
    result = await GeminiProvider(api_key.strip()).grade(
        system_instruction=INSTRUCTION,
        user_instruction="Transcribe the recording.",
        audio_path=audio_path,
        mime_type="audio/mp3",
        schema=SCHEMA,
        model=model,
        temperature=0.0,  # bản ghi càng ổn định thì điểm Azure (tất định theo văn bản) càng ổn định
    )
    text = clean_transcript((result.data or {}).get("transcript"))
    if len(text.split()) < MIN_WORDS:
        raise IntendedTranscriptUnavailable(f"bản ghi quá ngắn ({len(text.split())} từ)")
    return text, {"model": model, "input_tokens": result.input_tokens, "output_tokens": result.output_tokens}
