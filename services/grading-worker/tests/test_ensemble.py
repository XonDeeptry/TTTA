"""Chấm nhiều lượt, lấy trung vị (chủ dự án 2026-10-03: cùng file ra 6.0 rồi 7.0)."""

from __future__ import annotations

from grading_worker.grading.ensemble import combine, lower_median
from grading_worker.grading.providers.base import GradingResult


def _run(fc, lr, comment, style="spontaneous", tokens=(100, 50)):
    return GradingResult(
        data={
            "scores": {"fc": {"score": fc, "comment": comment}, "lr": {"score": lr, "comment": comment}},
            "feedback": comment,
            "delivery": {"style": style, "evidence": f"ev-{comment}"},
        },
        input_tokens=tokens[0], output_tokens=tokens[1], provider="gemini", model="m",
    )


def test_lower_median_is_the_middle_and_the_lower_middle_for_even_counts():
    assert lower_median([7, 5, 6]) == 6
    assert lower_median([7, 6]) == 6  # chẵn ⇒ nghiêng về chấm chặt
    assert lower_median([6.5]) == 6.5


def test_takes_the_median_per_criterion_and_comments_from_the_closest_run():
    combined, meta = combine([_run(6, 7, "A"), _run(7, 7, "B"), _run(5, 6, "C")])
    assert combined.data["scores"]["fc"]["score"] == 6 and combined.data["scores"]["lr"]["score"] == 7
    assert combined.data["scores"]["fc"]["comment"] == "A"  # lượt A khớp trung vị đúng cả hai tiêu chí
    assert meta["runs"] == 3 and meta["scores_per_run"]["fc"] == [6, 7, 5]


def test_one_outlier_run_cannot_lift_the_score():
    combined, _ = combine([_run(6, 6, "A"), _run(8, 8, "B"), _run(6, 6, "C")])
    assert (combined.data["scores"]["fc"]["score"], combined.data["scores"]["lr"]["score"]) == (6, 6)


def test_delivery_follows_the_majority_and_tokens_are_summed():
    combined, _ = combine([_run(6, 6, "A", "spontaneous"), _run(6, 6, "B", "read"), _run(6, 6, "C", "read")])
    assert combined.data["delivery"]["style"] == "read"
    assert (combined.input_tokens, combined.output_tokens) == (300, 150)


def test_a_single_run_is_returned_untouched():
    one = _run(6, 7, "A")
    combined, meta = combine([one])
    assert combined is one and meta == {"runs": 1}
