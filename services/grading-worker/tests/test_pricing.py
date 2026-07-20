from grading_worker.pricing import estimate_cost_usd


def test_known_model_computes_nonzero_cost():
    cost = estimate_cost_usd("gemini", "gemini-2.5-flash", input_tokens=1_000_000, output_tokens=1_000_000)
    assert cost == 2.80  # 0.30 + 2.50 theo bảng giá tham khảo


def test_unknown_model_returns_zero_not_an_error():
    cost = estimate_cost_usd("openai", "some-future-model", input_tokens=1000, output_tokens=1000)
    assert cost == 0.0


def test_zero_tokens_costs_zero():
    assert estimate_cost_usd("gemini", "gemini-2.5-flash", 0, 0) == 0.0
