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
    for raw in all_hook_inputs:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert set(row.keys()) == EXPECTED_KEYS


def test_kind_session_id_hook_event(all_hook_inputs):
    for raw in all_hook_inputs:
        ev = raw["hook_event_name"]
        row = collect.extract_event(raw, ev)
        assert row["kind"] == "event"
        assert row["session_id"] is not None
        assert row["hook_event"] == ev


def test_day_matches_to_day_of_ts(all_hook_inputs):
    for raw in all_hook_inputs:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["day"] == to_day(row["ts"])


def test_agent_id_always_none(all_hook_inputs):
    """サブエージェントを使わずに採取したため agent_id は常に None。"""
    for raw in all_hook_inputs:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["agent_id"] is None


def test_tool_name_matches_input(hook_inputs):
    """PostToolUse 60 件で tool_name が入力と一致する。"""
    rows = list(hook_inputs("PostToolUse"))
    assert len(rows) == 60
    for raw in rows:
        row = collect.extract_event(raw, "PostToolUse")
        assert row["tool_name"] == raw["tool_name"]


def test_skill_name_matches_when_present(hook_inputs):
    """tool_input.skill を持つ PostToolUse 1 件で skill_name が一致する。"""
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
    """tool_input はあるが skill が無い PostToolUse 59 件で skill_name = None。"""
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
    """tool_input を持たない 49 件で skill_name = None。例外を投げない。"""
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
    """PostToolUseFailure 3 件で is_interrupt(false) が int 0 になる。"""
    rows = list(hook_inputs("PostToolUseFailure"))
    assert len(rows) == 3
    for raw in rows:
        assert raw["is_interrupt"] is False
        row = collect.extract_event(raw, "PostToolUseFailure")
        assert row["is_interrupt"] == 0
        assert row["is_interrupt"] is not False


# (hook 入力の選別条件, 件数, None になる列)。選別した行ではすべての列が None になる。
_ABSENT_CASES = {
    "is_interrupt": (lambda raw: "is_interrupt" not in raw, 109, ("is_interrupt",)),
    "permission_mode": (
        lambda raw: "permission_mode" not in raw,
        18,
        ("permission_mode",),
    ),
    "effort_level": (
        lambda raw: not isinstance(raw.get("effort"), dict),
        38,
        ("effort_level",),
    ),
    "compact_trigger": (lambda raw: "trigger" not in raw, 111, ("compact_trigger",)),
    "source": (lambda raw: "source" not in raw, 103, ("source",)),
    "command_name_source": (
        lambda raw: raw["hook_event_name"] != "UserPromptExpansion",
        108,
        ("command_name", "command_source"),
    ),
    "prompt_id": (lambda raw: "prompt_id" not in raw, 9, ("prompt_id",)),
}

# 入力のキーと出力の列が同名で、値がそのまま入るもの: (キー, 持つ件数)
_COPIED_CASES = {"permission_mode": 94, "prompt_id": 103}


@pytest.mark.parametrize(
    ("predicate", "count", "columns"),
    _ABSENT_CASES.values(),
    ids=_ABSENT_CASES.keys(),
)
def test_field_none_when_absent(all_hook_inputs, predicate, count, columns):
    rows = [raw for raw in all_hook_inputs if predicate(raw)]
    assert len(rows) == count
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        for column in columns:
            assert row[column] is None


@pytest.mark.parametrize(
    ("key", "count"), _COPIED_CASES.items(), ids=_COPIED_CASES.keys()
)
def test_field_copied_when_present(all_hook_inputs, key, count):
    rows = [raw for raw in all_hook_inputs if key in raw]
    assert len(rows) == count
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row[key] == raw[key]


def test_effort_level_present(all_hook_inputs):
    """effort.level を持つ 74 件で high / medium のいずれか。"""
    rows = [
        raw
        for raw in all_hook_inputs
        if isinstance(raw.get("effort"), dict) and "level" in raw["effort"]
    ]
    assert len(rows) == 74
    for raw in rows:
        row = collect.extract_event(raw, raw["hook_event_name"])
        assert row["effort_level"] in ("high", "medium")


def test_compact_trigger_present(hook_inputs):
    """PreCompact 1 件で compact_trigger = manual。"""
    rows = list(hook_inputs("PreCompact"))
    assert len(rows) == 1
    raw = rows[0]
    assert raw["trigger"] == "manual"
    row = collect.extract_event(raw, "PreCompact")
    assert row["compact_trigger"] == "manual"


def test_source_present(hook_inputs):
    """SessionStart 9 件で source が入力と一致する。"""
    rows = list(hook_inputs("SessionStart"))
    assert len(rows) == 9
    for raw in rows:
        row = collect.extract_event(raw, "SessionStart")
        assert row["source"] == raw["source"]


def test_command_name_source_present(hook_inputs):
    """UserPromptExpansion 4 件で command_name / command_source が一致する。"""
    rows = list(hook_inputs("UserPromptExpansion"))
    assert len(rows) == 4
    for raw in rows:
        row = collect.extract_event(raw, "UserPromptExpansion")
        assert row["command_name"] == raw["command_name"]
        assert row["command_source"] == raw["command_source"]


def test_context_tokens_called_for_stop(hook_inputs, monkeypatch):
    raw = next(iter(hook_inputs("Stop")))
    called = []
    monkeypatch.setattr(
        collect._context, "context_tokens", lambda path: called.append(path) or 42
    )
    row = collect.extract_event(raw, "Stop")
    assert len(called) == 1
    assert row["context_tokens"] == 42


def test_context_tokens_called_for_precompact(hook_inputs, monkeypatch):
    raw = next(iter(hook_inputs("PreCompact")))
    called = []
    monkeypatch.setattr(
        collect._context, "context_tokens", lambda path: called.append(path) or 7
    )
    row = collect.extract_event(raw, "PreCompact")
    assert len(called) == 1
    assert row["context_tokens"] == 7


def test_context_tokens_not_called_otherwise(hook_inputs, monkeypatch):
    """hook_event=PostToolUse で context_tokens は呼ばれず None。"""
    raw = next(iter(hook_inputs("PostToolUse")))
    called = []
    monkeypatch.setattr(
        collect._context, "context_tokens", lambda path: called.append(path) or 99
    )
    row = collect.extract_event(raw, "PostToolUse")
    assert called == []
    assert row["context_tokens"] is None


def test_context_tokens_ignores_input_value(hook_inputs, monkeypatch):
    """入力に context_tokens を持つ SessionStart 3 件でも None（入力の値を使わない）。"""
    rows = [raw for raw in hook_inputs("SessionStart") if "context_tokens" in raw]
    assert len(rows) == 3
    monkeypatch.setattr(collect._context, "context_tokens", lambda path: 123456)
    for raw in rows:
        row = collect.extract_event(raw, "SessionStart")
        assert row["context_tokens"] is None


def test_empty_dict_all_hook_fields_none():
    """{} でも例外なく HOOK_FIELDS 由来の 12 列がすべて None。"""
    row = collect.extract_event({}, "PostToolUse")
    for name, _, _ in HOOK_FIELDS:
        assert row[name] is None


def test_non_dict_input_all_hook_fields_none():
    """list / str / None でも例外なく HOOK_FIELDS 由来の 12 列がすべて None。"""
    for raw in ([], "x", None):
        row = collect.extract_event(raw, "PostToolUse")
        for name, _, _ in HOOK_FIELDS:
            assert row[name] is None


def test_unknown_keys_only_input_matches_key_set():
    row = collect.extract_event({"foo": "bar", "baz": {"qux": 1}}, "PostToolUse")
    assert set(row.keys()) == EXPECTED_KEYS


def test_unregistered_hook_event_still_extracts(hook_inputs):
    """SessionEnd 8 件（登録しない hook）でも例外なく同じキー集合の行を返す。"""
    rows = list(hook_inputs("SessionEnd"))
    assert len(rows) == 8
    for raw in rows:
        row = collect.extract_event(raw, "SessionEnd")
        assert set(row.keys()) == EXPECTED_KEYS
