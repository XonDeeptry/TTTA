"""F11 FR-09 — bộ phân tích payload là CƠ CHẾ AN TOÀN của cả tính năng.

Danh sách 20 chuỗi ở `AC_09_4_FALL_THROUGH` được liệt kê từng cái một theo đúng AC-09.4: mỗi
chuỗi là một ca test riêng, vì mỗi chuỗi là một cách mà một tin nhắn bình thường của học viên có
thể bị hiểu nhầm thành cú bấm nút. Tất cả phải trả None ⇒ rơi xuống nhánh flag-cho-tư-vấn cũ.
"""

import pytest

from grading_worker.buttons import build_reply_buttons, build_select_student_buttons, parse_ilm_payload

# AC-09.4 — 20 chuỗi phải rơi xuống nhánh flag (KHÔNG được nhận là nút).
AC_09_4_FALL_THROUGH = [
    None,
    "",
    "xin chào cô",
    "#ilm",
    "#ilm:",
    "#ilm:ack",  # thiếu đối số
    "#ilm:ack:",  # đối số rỗng
    "#ilm:ack:abc",  # đối số không phải chữ số
    "#ilm:ack:12 ",  # khoảng trắng cuối — KHÔNG cắt
    " #ilm:ack:12",  # khoảng trắng đầu — KHÔNG cắt
    "#ILM:ack:12",  # hoa/thường — KHÔNG chuẩn hóa
    "#Ilm:ack:12",
    "#ilm:unknown_action:1",
    "#ilm:ack:1:2",  # sai số đối số
    "#ilm:select_student:1",  # sai số đối số
    "#ilm:select_student:1:2:3",
    "#ilm:ack:1234567890123",  # 13 chữ số, vượt trần
    "prefix #ilm:ack:1",  # tiền tố không ở vị trí 0
    "#ilm:ack:-1",
    "#ilm:ack:1.0",
    "#ilm:ack:٣",  # chữ số Unicode, không phải ASCII
]


@pytest.mark.parametrize("text", AC_09_4_FALL_THROUGH)
def test_ac_09_4_every_non_payload_string_falls_through(text):
    assert parse_ilm_payload(text) is None


def test_ac_09_4_covers_every_string_the_spec_enumerates():
    """Chốt số lượng: bớt một ca là bớt một lỗ hổng của ranh giới sản phẩm.

    AC-09.4 có 19 gạch đầu dòng, trong đó hai gạch liệt kê hai chuỗi (khoảng-trắng-đầu/cuối và
    hai biến thể hoa/thường) ⇒ 21 chuỗi rời rạc.
    """
    assert len(AC_09_4_FALL_THROUGH) == 21
    assert len(set(map(repr, AC_09_4_FALL_THROUGH))) == 21  # không có ca nào bị chép trùng


@pytest.mark.parametrize(
    "text,expected",
    [
        ("#ilm:ack:12", ("ack", [12])),
        ("#ilm:ack:1", ("ack", [1])),
        ("#ilm:ack:123456789012", ("ack", [123456789012])),  # đúng 12 chữ số = hợp lệ
        ("#ilm:request_advisor:7", ("request_advisor", [7])),
        ("#ilm:select_student:9:50", ("select_student", [9, 50])),
    ],
)
def test_ac_09_7_valid_payloads_parse(text, expected):
    assert parse_ilm_payload(text) == expected


@pytest.mark.parametrize("bad", [123, 1.5, b"#ilm:ack:1", ["#ilm:ack:1"], {"text": "#ilm:ack:1"}])
def test_non_string_input_never_raises(bad):
    assert parse_ilm_payload(bad) is None


# ─── FR-07: bộ nút cho tin nhận xét ─────────────────────────────────────────────────────


def reply(buttons):
    return {"show_total": True, "show_level": True, "template": "{{feedback}}", "buttons": buttons}


def test_ac_07_2_maps_title_action_to_payload():
    buttons = build_reply_buttons(
        reply([{"title": "Em đã xem", "action": "ack"}, {"title": "Nhờ cô", "action": "request_advisor"}]), 123
    )
    assert [b.to_dict() for b in buttons] == [
        {"title": "Em đã xem", "action": "ack", "payload": "#ilm:ack:123"},
        {"title": "Nhờ cô", "action": "request_advisor", "payload": "#ilm:request_advisor:123"},
    ]


def test_ac_07_3_select_student_authored_by_a_teacher_is_skipped():
    buttons = build_reply_buttons(
        reply([{"title": "Chọn HV", "action": "select_student"}, {"title": "Em đã xem", "action": "ack"}]), 1
    )
    assert [b.action for b in buttons] == ["ack"]


@pytest.mark.parametrize(
    "student_reply",
    [None, {}, {"buttons": None}, {"buttons": "ack"}, {"buttons": []}, "student_reply", [], 7],
)
def test_ac_07_4_missing_or_malformed_student_reply_yields_no_buttons(student_reply):
    assert build_reply_buttons(student_reply, 1) == []


@pytest.mark.parametrize(
    "entry",
    [
        "ack",
        None,
        {"action": "ack"},
        {"title": 7, "action": "ack"},
        {"title": "   ", "action": "ack"},
        {"title": "x" * 101, "action": "ack"},
        {"title": "Em đã xem"},
        {"title": "Em đã xem", "action": 3},
        {"title": "Em đã xem", "action": "delete_account"},
    ],
)
def test_ac_07_5_malformed_entries_are_skipped_never_raised(entry):
    buttons = build_reply_buttons(reply([entry, {"title": "Em đã xem", "action": "ack"}]), 9)
    assert [b.payload for b in buttons] == ["#ilm:ack:9"]


@pytest.mark.parametrize("grading_id", [None, "99", 1.5, 0, -1, True])
def test_ac_07_6_a_bad_grading_id_produces_no_buttons(grading_id):
    assert build_reply_buttons(reply([{"title": "Em đã xem", "action": "ack"}]), grading_id) == []


def test_ac_07_7_producer_truncates_to_five():
    many = [{"title": f"nút {i}", "action": "ack"} for i in range(8)]
    buttons = build_reply_buttons(reply(many), 5)
    assert len(buttons) == 5
    assert buttons[0].title == "nút 0" and buttons[4].title == "nút 4"


def test_br_06_payloads_never_carry_teacher_authored_text():
    buttons = build_reply_buttons(reply([{"title": "Em; đã: xem #ilm:ack:999", "action": "ack"}]), 42)
    assert buttons[0].payload == "#ilm:ack:42"
    assert parse_ilm_payload(buttons[0].payload) == ("ack", [42])


# ─── FR-08: bộ nút hỏi định danh anh/chị/em ─────────────────────────────────────────────


def binding(bid, student_id=1, name="Nam"):
    return {"id": bid, "studentId": student_id, "displayName": name, "zaloUserId": "zalo-1", "status": "active"}


def test_ac_08_5_one_button_per_active_binding():
    buttons = build_select_student_buttons([binding(9, 1, "Nam"), binding(10, 2, "Lan")], 50)
    assert [b.to_dict() for b in buttons] == [
        {"title": "Nam", "action": "select_student", "payload": "#ilm:select_student:9:50"},
        {"title": "Lan", "action": "select_student", "payload": "#ilm:select_student:10:50"},
    ]
    assert parse_ilm_payload(buttons[0].payload) == ("select_student", [9, 50])


def test_ac_08_5_falls_back_to_zalo_user_id_when_display_name_is_missing():
    b = dict(binding(9), displayName=None)
    assert build_select_student_buttons([b], 50)[0].title == "zalo-1"


def test_ac_08_7_more_than_five_bindings_yields_NO_buttons_never_a_truncated_list():
    six = [binding(i, i) for i in range(1, 7)]
    assert build_select_student_buttons(six, 50) == []


def test_ac_08_7_an_over_long_label_drops_all_buttons_rather_than_hiding_a_sibling():
    two = [binding(9, 1, "x" * 101), binding(10, 2, "Lan")]
    assert build_select_student_buttons(two, 50) == []


def test_ac_08_8_a_binding_without_a_student_is_never_offered():
    buttons = build_select_student_buttons([binding(9, None), binding(10, 2, "Lan")], 50)
    assert [b.title for b in buttons] == ["Lan"]


@pytest.mark.parametrize("submission_id", [None, "50", 0, -1])
def test_a_bad_submission_id_produces_no_select_buttons(submission_id):
    assert build_select_student_buttons([binding(9)], submission_id) == []
