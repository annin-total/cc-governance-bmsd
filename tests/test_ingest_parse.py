"""ingest.parse_line / parse_lines の検査と列変換を確かめる。"""

from ingest import parse_line, parse_lines
from shared import EXTRA_COLUMNS, HOOK_FIELDS, POLICY_COLUMNS

_EVENTS_COLUMNS = tuple(EXTRA_COLUMNS) + tuple(
    (name, type_) for name, _, type_ in HOOK_FIELDS
)
_EVENTS_NAMES = [name for name, _ in _EVENTS_COLUMNS]
_POLICY_NAMES = [name for name, _ in POLICY_COLUMNS]


def _events_value(values: tuple, name: str):
    """events 列定義における `name` の値を取り出す。"""
    return values[_EVENTS_NAMES.index(name)]


def _policy_value(values: tuple, name: str):
    """policy_state 列定義における `name` の値を取り出す。"""
    return values[_POLICY_NAMES.index(name)]


def test_event_with_tool_name_is_accepted():
    """# 1: 通常の event 行を採用し、tool_name と day を正しく持つ。"""
    line = b'{"kind":"event","event_id":"e1","ts":1758400000,"tool_name":"Bash"}'
    result = parse_line(line)
    assert result is not None
    kind, values = result
    assert kind == "event"
    assert _events_value(values, "tool_name") == "Bash"
    assert _events_value(values, "day") == 20352


def test_day_is_recomputed_at_jst_midnight_boundary():
    """# 2: JST 当日 0 時ちょうどの ts は当日の day になる。"""
    line = b'{"kind":"event","event_id":"e2","ts":1758380400}'
    kind, values = parse_line(line)
    assert kind == "event"
    assert _events_value(values, "day") == 20352


def test_day_is_recomputed_just_before_jst_midnight():
    """# 3: JST 前日 23:59:59 の ts は前日の day になる。"""
    line = b'{"kind":"event","event_id":"e3","ts":1758380399}'
    kind, values = parse_line(line)
    assert kind == "event"
    assert _events_value(values, "day") == 20351


def test_day_field_in_payload_is_ignored_and_recomputed():
    """# 4: 行が持つ day は無視し、ts から再計算した値を使う。"""
    line = b'{"kind":"event","event_id":"e4","ts":1758400000,"day":1}'
    kind, values = parse_line(line)
    assert kind == "event"
    assert _events_value(values, "day") == 20352


def test_is_interrupt_true_is_coerced_to_one():
    """# 5: is_interrupt=true は INTEGER 1 に変換される。"""
    line = b'{"kind":"event","event_id":"e5","ts":1758400000,"is_interrupt":true}'
    kind, values = parse_line(line)
    assert kind == "event"
    assert _events_value(values, "is_interrupt") == 1


def test_is_interrupt_non_numeric_string_becomes_none():
    """# 6: is_interrupt="yes" は INTEGER に変換できず None になる。"""
    line = b'{"kind":"event","event_id":"e6","ts":1758400000,"is_interrupt":"yes"}'
    kind, values = parse_line(line)
    assert kind == "event"
    assert _events_value(values, "is_interrupt") is None


def test_prompt_and_tool_response_never_appear_in_any_column():
    """# 7: prompt / tool_response はどの列定義にも現れず、行は採用される。"""
    line = (
        b'{"kind":"event","event_id":"e7","ts":1758400000,'
        b'"prompt":"\xe7\xa7\x98\xe5\xaf\x86","tool_response":"x"}'
    )
    result = parse_line(line)
    assert result is not None
    assert "prompt" not in _EVENTS_NAMES
    assert "tool_response" not in _EVENTS_NAMES


def test_missing_optional_hook_fields_become_none():
    """# 8: tool_name / skill_name / context_tokens が無ければすべて None になる。"""
    line = b'{"kind":"event","event_id":"e8","ts":1758400000}'
    kind, values = parse_line(line)
    assert kind == "event"
    assert _events_value(values, "tool_name") is None
    assert _events_value(values, "skill_name") is None
    assert _events_value(values, "context_tokens") is None


def test_missing_event_id_is_dropped():
    """# 9: event_id が無い行は破棄する。"""
    line = b'{"kind":"event","ts":1758400000}'
    assert parse_line(line) is None


def test_empty_event_id_is_dropped():
    """# 10: event_id が空文字の行は破棄する。"""
    line = b'{"kind":"event","event_id":"","ts":1758400000}'
    assert parse_line(line) is None


def test_missing_ts_is_dropped():
    """# 11: ts が無い行は破棄する。"""
    line = b'{"kind":"event","event_id":"e11"}'
    assert parse_line(line) is None


def test_null_ts_is_dropped():
    """# 12: ts が null の行は破棄する。"""
    line = b'{"kind":"event","event_id":"e12","ts":null}'
    assert parse_line(line) is None


def test_unknown_kind_is_dropped():
    """# 13: kind が未知の値の行は破棄する。"""
    line = b'{"kind":"foo","event_id":"e13","ts":1758400000}'
    assert parse_line(line) is None


def test_missing_kind_is_dropped():
    """# 14: kind が無い行は破棄する。"""
    line = b'{"event_id":"e14","ts":1758400000}'
    assert parse_line(line) is None


def test_invalid_json_is_dropped():
    """# 15: JSON としてパースできない行は破棄する。"""
    line = b'{"kind":"event","event_id":'
    assert parse_line(line) is None


def test_non_dict_json_is_dropped():
    """# 16: dict ではない JSON（配列）は破棄する。"""
    line = b"[1,2,3]"
    assert parse_line(line) is None


def test_blank_lines_are_ignored_and_not_counted_as_dropped():
    """# 17: 空行・空白のみの行は無視し、dropped に数えない。"""
    rows, dropped = parse_lines(b"\n   \n")
    assert rows == []
    assert dropped == 0


def test_policy_row_is_accepted_with_policy_columns():
    """# 18: policy 行は policy_state の列定義で採用され、day も再計算される。"""
    line = (
        b'{"kind":"policy","event_id":"p1","ts":1758400000,'
        b'"key_name":"env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE","value":"60",'
        b'"prev_value":null,"apply_result":"applied"}'
    )
    kind, values = parse_line(line)
    assert kind == "policy"
    assert _policy_value(values, "prev_value") is None
    assert _policy_value(values, "apply_result") == "applied"
    assert _policy_value(values, "day") == 20352


def test_ts_non_numeric_string_is_dropped_but_sibling_row_is_stored():
    """# 19: ts が数値化できない文字列の行は破棄し、同じリクエスト内の正常行は保存される。"""
    good = b'{"kind":"event","event_id":"e19a","ts":1758400000}'
    poison = b'{"kind":"event","event_id":"e19b","ts":"abc"}'
    rows, dropped = parse_lines(good + b"\n" + poison)
    assert dropped == 1
    assert len(rows) == 1
    assert rows[0][0] == "event"


def test_ts_array_is_dropped_but_sibling_row_is_stored():
    """# 20: ts が配列の行は破棄し、同じリクエスト内の正常行は保存される。"""
    good = b'{"kind":"event","event_id":"e20a","ts":1758400000}'
    poison = b'{"kind":"event","event_id":"e20b","ts":[1]}'
    rows, dropped = parse_lines(good + b"\n" + poison)
    assert dropped == 1
    assert len(rows) == 1
    assert rows[0][0] == "event"


def test_ts_dict_is_dropped_but_sibling_row_is_stored():
    """# 21: ts が辞書の行は破棄し、同じリクエスト内の正常行は保存される。"""
    good = b'{"kind":"event","event_id":"e21a","ts":1758400000}'
    poison = b'{"kind":"event","event_id":"e21b","ts":{"a":1}}'
    rows, dropped = parse_lines(good + b"\n" + poison)
    assert dropped == 1
    assert len(rows) == 1
    assert rows[0][0] == "event"
