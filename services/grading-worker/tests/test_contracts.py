"""F11 AC-01.3/01.4 — bản Python của bộ hằng số nút bấm phải khớp TỪNG GIÁ TRỊ với hai bản TS
(`zalo-gateway/src/contracts.ts`, `core-api/src/contracts.ts`). Repo không có cơ chế chia sẻ
package giữa hai ngôn ngữ, nên ba test giống hệt nhau ở ba nơi chính là lưới đỡ duy nhất: gõ sai
một chữ ở một bản sẽ làm nút chết ÂM THẦM (payload rơi xuống nhánh flag).
"""

from grading_worker import contracts


def test_closed_action_set_and_prefix():
    assert contracts.ILM_PAYLOAD_PREFIX == "#ilm:"
    assert contracts.BUTTON_ACTIONS == ("ack", "request_advisor", "select_student")


def test_zalo_limits():
    assert contracts.MAX_BUTTONS == 5
    assert contracts.MAX_BUTTON_TITLE_LEN == 100
    assert contracts.MAX_BUTTON_PAYLOAD_LEN == 1000
    assert contracts.MAX_OUTBOUND_TEXT_LEN == 2000


def test_pre_f11_topology_constants_unchanged():
    assert contracts.EXCHANGE == "ilm.direct"
    assert contracts.DLX == "ilm.dlx"
    assert contracts.RETRY_EXCHANGE == "ilm.retry"
    assert contracts.Q_SUBMISSIONS == "submissions"
    assert contracts.Q_OUTBOUND == "outbound"
    assert contracts.MAX_RETRIES == 3
    assert contracts.RETRY_TTL_MS == 30_000


def test_outbound_message_without_buttons_is_byte_identical_to_pre_f11():
    """AC-01.5 — mọi call site cũ (không truyền `buttons`) phải sinh ra ĐÚNG dict như trước."""
    msg = contracts.OutboundMessage(zaloUserId="u1", text="xin chào")
    assert msg.to_dict() == {"v": 1, "zaloUserId": "u1", "text": "xin chào"}

    with_ids = contracts.OutboundMessage(zaloUserId="u1", text="t", submissionId="9", templateKey="k")
    assert with_ids.to_dict() == {"v": 1, "zaloUserId": "u1", "text": "t", "templateKey": "k", "submissionId": "9"}


def test_outbound_message_omits_buttons_key_when_none_or_empty():
    """AC-01.5/01.6 — None VÀ [] đều KHÔNG được xuất hiện dưới dạng `"buttons": []` trên wire."""
    assert "buttons" not in contracts.OutboundMessage(zaloUserId="u1", text="t", buttons=None).to_dict()
    assert "buttons" not in contracts.OutboundMessage(zaloUserId="u1", text="t", buttons=[]).to_dict()


def test_outbound_message_serializes_buttons():
    msg = contracts.OutboundMessage(
        zaloUserId="u1",
        text="t",
        buttons=[contracts.OutboundButton(title="Em đã xem", action="ack", payload="#ilm:ack:1")],
    )
    assert msg.to_dict()["buttons"] == [{"title": "Em đã xem", "action": "ack", "payload": "#ilm:ack:1"}]
