"""Nhánh "cấp độ theo lớp": worker phải chuyển `className` của học viên xuống core-api để
core-api chọn được criteria mà lớp đã ghim.

Lý do file này tồn tại, và tại sao nó KHÔNG chỉ là một `assert_awaited_with`: fixture
`core_api` là một `AsyncMock` TRẦN — nó nuốt mọi tham số, đúng loại mù đã để lọt lỗi thiếu
`schema=` ngày 2026-08-25 (changelog v1.6 §B.1). Bài học ở đó được áp dụng lại nguyên vẹn:
ràng lời gọi vào CHỮ KÝ THẬT của `CoreApiClient.get_criteria` bằng `inspect.signature().bind()`,
để ai đổi chữ ký mà quên sửa pipeline thì test phải đỏ.
"""

import contextlib
import inspect
from unittest.mock import AsyncMock, MagicMock

import pytest

from grading_worker.core_api_client import CoreApiClient
from grading_worker.pipeline import SubmissionPipeline

from test_pipeline import _gradable_patches, _setup_gradable, base_message  # tests/ không phải package


@pytest.fixture
def core_api():
    api = AsyncMock()
    api.upsert_submission.return_value = {"id": 1}
    return api


@pytest.fixture
def config():
    cfg = AsyncMock()
    cfg.get_int.return_value = 420
    cfg.get.return_value = None
    return cfg


@pytest.fixture
def pipeline(core_api, config):
    return SubmissionPipeline(core_api, config, http=AsyncMock(), publish=AsyncMock())


async def _run_gradable(p, core_api, class_name=...):
    _setup_gradable(core_api)
    if class_name is not ...:
        core_api.get_student.return_value = {**core_api.get_student.return_value, "className": class_name}
    with contextlib.ExitStack() as stack:
        for patcher in _gradable_patches():
            stack.enter_context(patcher)
        await p.handle(base_message())
    assert core_api.get_criteria.await_count == 1
    call = core_api.get_criteria.await_args
    return call.args, call.kwargs


async def test_class_name_is_forwarded_to_core_api(pipeline, core_api):
    args, kwargs = await _run_gradable(pipeline, core_api, "10A")
    passed = args[1] if len(args) > 1 else kwargs.get("class_name")
    assert passed == "10A"


async def test_missing_class_name_becomes_none_not_keyerror(pipeline, core_api):
    """Học viên chưa gán lớp là trạng thái BÌNH THƯỜNG (`Student.className` nullable) — phải
    xuống None để core-api dùng fallback, tuyệt đối không được ném KeyError."""
    args, kwargs = await _run_gradable(pipeline, core_api)  # get_student KHÔNG có khóa className
    passed = args[1] if len(args) > 1 else kwargs.get("class_name")
    assert passed is None


async def test_call_binds_to_real_core_api_client_signature(pipeline, core_api):
    """Chốt chặn thật: lượt gọi pipeline thực hiện phải hợp lệ với chữ ký THẬT của
    `CoreApiClient.get_criteria`. Mock trần chấp nhận mọi thứ; `bind()` thì không."""
    args, kwargs = await _run_gradable(pipeline, core_api, "10A")

    bound = inspect.signature(CoreApiClient.get_criteria).bind(object(), *args, **kwargs)
    bound.apply_defaults()
    assert bound.arguments["course_id"] == 1
    assert bound.arguments["class_name"] == "10A"


@pytest.mark.parametrize(
    "class_name,expected_params",
    [("10A", {"className": "10A"}), (None, None), ("", None)],
)
async def test_client_sends_class_name_as_query_param(class_name, expected_params):
    """Tầng HTTP: chỉ gửi `className` khi thật sự có giá trị. Chuỗi rỗng cũng không gửi — vì
    `?className=` khiến core-api đi tra `classes_config` bằng khóa rỗng một cách vô ích."""
    client = CoreApiClient.__new__(CoreApiClient)  # bỏ qua __init__ để không mở httpx thật
    res = MagicMock(status_code=200)
    res.json.return_value = {"id": 5}
    client._client = AsyncMock()
    client._client.get.return_value = res

    assert await CoreApiClient.get_criteria(client, 7, class_name) == {"id": 5}
    client._client.get.assert_awaited_once_with("/internal/criteria/7", params=expected_params)
