"""collect.py の抽出処理（hook 入力から送信する1行分の dict を組み立てる）のテスト。"""

import collect
import pytest
from contract import EXTRA_COLUMNS, HOOK_FIELDS, to_day

EXPECTED_KEYS = (
    {"kind"}
    | {name for name, _ in EXTRA_COLUMNS}
    | {name for name, _, _ in HOOK_FIELDS}
)


@pytest.fixture(autouse=True)
def _fixed_identity(monkeypatch, tmp_path):
    """event_id / ts を固定し、実 HOME を書き換えないように状態ディレクトリを隔離する。"""
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "plugin-data"))
    monkeypatch.setenv("CC_GOVERNANCE_USER_EMAIL", "test@example.com")
    counter = iter(range(1, 10_000))
    monkeypatch.setattr(
        collect._identity, "new_event_id", lambda: f"event-{next(counter)}"
    )
    monkeypatch.setattr(collect.time, "time", lambda: 1_700_000_000)
    yield


def test_output_key_set_matches_contract(all_hook_inputs):
    """#1: 出力のキー集合が過不足なく一致する。"""
    for raw in all_hook_inputs:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert set(row.keys()) == EXPECTED_KEYS


def test_kind_session_id_hook_event(all_hook_inputs):
    """#2: kind / session_id / hook_event が期待どおり。"""
    for raw in all_hook_inputs:
        ev = raw["hook_event_name"]
        row = collect.extract_event(raw, ev)
        assert row["kind"] == "event"
        assert row["session_id"] is not None
        assert row["hook_event"] == ev


def test_day_matches_to_day_of_ts(all_hook_inputs):
    """#3: day が契約の to_day(ts) の戻り値と一致する。"""
    for raw in all_hook_inputs:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["day"] == to_day(row["ts"])


def test_agent_id_always_none(all_hook_inputs):
    """#4: サブエージェントを使わずに採取したため agent_id は常に None。"""
    for raw in all_hook_inputs:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["agent_id"] is None


def test_tool_name_matches_input(hook_inputs):
    """#5: PostToolUse 60 件で tool_name が入力と一致する。"""
    rows = list(hook_inputs("PostToolUse"))
    assert len(rows) == 60
    for raw in rows:
        row = collect.extract_event(raw, "PostToolUse")
        assert row["tool_name"] == raw["tool_name"]


def test_skill_name_matches_when_present(hook_inputs):
    """#6: tool_input.skill を持つ PostToolUse 1 件で skill_name が一致する。"""
    matched = [
        raw
        for raw in hook_inputs("PostToolUse")
        if isinstance(raw.get("tool_input"), dict) and "skill" in raw["tool_input"]
    ]
    assert len(matched) == 1
    raw = matched[0]
    row = collect.extract_event(raw, "PostToolUse")
    assert row["skill_name"] == raw["tool_input"]["skill"]


def test_skill_name_none_when_tool_input_without_skill(hook_inputs):
    """#7: tool_input はあるが skill が無い PostToolUse 59 件で skill_name = None。"""
    rows = [
        raw
        for raw in hook_inputs("PostToolUse")
        if isinstance(raw.get("tool_input"), dict) and "skill" not in raw["tool_input"]
    ]
    assert len(rows) == 59
    for raw in rows:
        row = collect.extract_event(raw, "PostToolUse")
        assert row["skill_name"] is None


def test_skill_name_none_when_no_tool_input(hook_inputs):
    """#8: tool_input を持たない 49 件で skill_name = None。例外を投げない。"""
    events = (
        "UserPromptSubmit",
        "SessionStart",
        "SessionEnd",
        "UserPromptExpansion",
        "Stop",
        "PreCompact",
    )
    rows = []
    for ev in events:
        rows.extend(
            (ev, raw)
            for raw in hook_inputs(ev)
            if not isinstance(raw.get("tool_input"), dict)
        )
    assert len(rows) == 49
    for ev, raw in rows:
        row = collect.extract_event(raw, ev)
        assert row["skill_name"] is None


def test_is_interrupt_false_becomes_int_zero(hook_inputs):
    """#9: PostToolUseFailure 3 件で is_interrupt(false) が int 0 になる。"""
    rows = list(hook_inputs("PostToolUseFailure"))
    assert len(rows) == 3
    for raw in rows:
        assert raw["is_interrupt"] is False
        row = collect.extract_event(raw, "PostToolUseFailure")
        assert row["is_interrupt"] == 0
        assert row["is_interrupt"] is not False


def test_is_interrupt_none_when_absent(all_hook_inputs):
    """#10: is_interrupt を持たない 109 件で None。"""
    rows = [raw for raw in all_hook_inputs if "is_interrupt" not in raw]
    assert len(rows) == 109
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["is_interrupt"] is None


def test_permission_mode_present(all_hook_inputs):
    """#11: permission_mode を持つ 94 件で値が一致する。"""
    rows = [raw for raw in all_hook_inputs if "permission_mode" in raw]
    assert len(rows) == 94
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["permission_mode"] == raw["permission_mode"]


def test_permission_mode_absent(all_hook_inputs):
    """#12: permission_mode を持たない 18 件で None。"""
    rows = [raw for raw in all_hook_inputs if "permission_mode" not in raw]
    assert len(rows) == 18
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["permission_mode"] is None


def test_effort_level_present(all_hook_inputs):
    """#13: effort.level を持つ 74 件で high / medium のいずれか。"""
    rows = [
        raw
        for raw in all_hook_inputs
        if isinstance(raw.get("effort"), dict) and "level" in raw["effort"]
    ]
    assert len(rows) == 74
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["effort_level"] in ("high", "medium")


def test_effort_level_absent(all_hook_inputs):
    """#14: effort を持たない 38 件で None。"""
    rows = [raw for raw in all_hook_inputs if not isinstance(raw.get("effort"), dict)]
    assert len(rows) == 38
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["effort_level"] is None


def test_compact_trigger_present(hook_inputs):
    """#15: PreCompact 1 件で compact_trigger = manual。"""
    rows = list(hook_inputs("PreCompact"))
    assert len(rows) == 1
    raw = rows[0]
    assert raw["trigger"] == "manual"
    row = collect.extract_event(raw, "PreCompact")
    assert row["compact_trigger"] == "manual"


def test_compact_trigger_absent(all_hook_inputs):
    """#16: trigger を持たない 111 件で None。"""
    rows = [raw for raw in all_hook_inputs if "trigger" not in raw]
    assert len(rows) == 111
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["compact_trigger"] is None


def test_source_present(hook_inputs):
    """#17: SessionStart 9 件で source が入力と一致する。"""
    rows = list(hook_inputs("SessionStart"))
    assert len(rows) == 9
    for raw in rows:
        row = collect.extract_event(raw, "SessionStart")
        assert row["source"] == raw["source"]


def test_source_absent(all_hook_inputs):
    """#18: source を持たない 103 件で None。"""
    rows = [raw for raw in all_hook_inputs if "source" not in raw]
    assert len(rows) == 103
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["source"] is None


def test_command_name_source_present(hook_inputs):
    """#19: UserPromptExpansion 4 件で command_name / command_source が一致する。"""
    rows = list(hook_inputs("UserPromptExpansion"))
    assert len(rows) == 4
    for raw in rows:
        row = collect.extract_event(raw, "UserPromptExpansion")
        assert row["command_name"] == raw["command_name"]
        assert row["command_source"] == raw["command_source"]


def test_command_name_source_absent(all_hook_inputs):
    """#20: UserPromptExpansion 以外の 108 件で None。"""
    rows = [
        raw
        for raw in all_hook_inputs
        if raw["hook_event_name"] != "UserPromptExpansion"
    ]
    assert len(rows) == 108
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["command_name"] is None
        assert row["command_source"] is None


def test_prompt_id_present(all_hook_inputs):
    """#21: prompt_id を持つ 103 件で値が一致する。"""
    rows = [raw for raw in all_hook_inputs if "prompt_id" in raw]
    assert len(rows) == 103
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["prompt_id"] == raw["prompt_id"]


def test_prompt_id_absent(all_hook_inputs):
    """#22: prompt_id を持たない 9 件で None。"""
    rows = [raw for raw in all_hook_inputs if "prompt_id" not in raw]
    assert len(rows) == 9
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["prompt_id"] is None


def test_context_tokens_called_for_stop(hook_inputs, monkeypatch):
    """#23: hook_event=Stop で context_tokens の算出が 1 回呼ばれる。"""
    raw = next(iter(hook_inputs("Stop")))
    called = []
    monkeypatch.setattr(
        collect._context, "context_tokens", lambda path: called.append(path) or 42
    )
    row = collect.extract_event(raw, "Stop")
    assert len(called) == 1
    assert row["context_tokens"] == 42


def test_context_tokens_called_for_precompact(hook_inputs, monkeypatch):
    """#24: hook_event=PreCompact で context_tokens の算出が 1 回呼ばれる。"""
    raw = next(iter(hook_inputs("PreCompact")))
    called = []
    monkeypatch.setattr(
        collect._context, "context_tokens", lambda path: called.append(path) or 7
    )
    row = collect.extract_event(raw, "PreCompact")
    assert len(called) == 1
    assert row["context_tokens"] == 7


def test_context_tokens_not_called_otherwise(hook_inputs, monkeypatch):
    """#25: hook_event=PostToolUse で context_tokens は呼ばれず None。"""
    raw = next(iter(hook_inputs("PostToolUse")))
    called = []
    monkeypatch.setattr(
        collect._context, "context_tokens", lambda path: called.append(path) or 99
    )
    row = collect.extract_event(raw, "PostToolUse")
    assert called == []
    assert row["context_tokens"] is None


def test_context_tokens_ignores_input_value(hook_inputs, monkeypatch):
    """#26: 入力に context_tokens を持つ SessionStart 3 件でも None（入力の値を使わない）。"""
    rows = [raw for raw in hook_inputs("SessionStart") if "context_tokens" in raw]
    assert len(rows) == 3
    monkeypatch.setattr(collect._context, "context_tokens", lambda path: 123456)
    for raw in rows:
        row = collect.extract_event(raw, "SessionStart")
        assert row["context_tokens"] is None


def test_empty_dict_all_hook_fields_none():
    """#27: {} でも例外なく HOOK_FIELDS 由来の 12 列がすべて None。"""
    row = collect.extract_event({}, "PostToolUse")
    for name, _, _ in HOOK_FIELDS:
        assert row[name] is None


def test_non_dict_input_all_hook_fields_none():
    """#28: list / str / None でも例外なく HOOK_FIELDS 由来の 12 列がすべて None。"""
    for raw in ([], "x", None):
        row = collect.extract_event(raw, "PostToolUse")
        for name, _, _ in HOOK_FIELDS:
            assert row[name] is None


def test_unknown_keys_only_input_matches_key_set():
    """#29: 契約に無いキーだけを持つ入力でも #1 と同じキー集合を返す。"""
    row = collect.extract_event({"foo": "bar", "baz": {"qux": 1}}, "PostToolUse")
    assert set(row.keys()) == EXPECTED_KEYS


def test_unregistered_hook_event_still_extracts(hook_inputs):
    """#30: SessionEnd 8 件（登録しない hook）でも例外なく同じキー集合の行を返す。"""
    rows = list(hook_inputs("SessionEnd"))
    assert len(rows) == 8
    for raw in rows:
        row = collect.extract_event(raw, "SessionEnd")
        assert set(row.keys()) == EXPECTED_KEYS
