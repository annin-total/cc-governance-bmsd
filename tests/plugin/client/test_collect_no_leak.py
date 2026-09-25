"""自由文（prompt / tool_response / message 等）が送信行に現れないことの回帰テスト。"""

import json

import collect
import pytest
from contract import HOOK_FIELDS, dig

SENTINEL_PREFIX = "SENTINEL-"


@pytest.fixture(autouse=True)
def _isolate_state_dir(monkeypatch, tmp_path):
    """実 HOME を書き換えないように状態ディレクトリを隔離し、user_email を固定する。"""
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "plugin-data"))
    monkeypatch.setenv("CC_GOVERNANCE_USER_EMAIL", "test@example.com")


def _stringify(value):
    """契約の VARCHAR 変換と同じ規則で文字列化する（真偽値は小文字）。"""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _traceable_string_values(raw, row):
    """出力に現れてよい文字列値の集合（契約が名指しするキーパス + EXTRA_COLUMNS）。"""
    obj = raw if isinstance(raw, dict) else {}
    allowed = set()
    for _, path, _ in HOOK_FIELDS:
        value = dig(obj, path)
        if value is not None:
            allowed.add(_stringify(value))
    for key in ("event_id", "host", "user_email", "hook_event"):
        value = row.get(key)
        if value is not None:
            allowed.add(_stringify(value))
    return allowed


def test_no_sentinel_in_output_for_all_fixtures(all_hook_inputs):
    """fixture 112 件の出力 JSON 文字列に SENTINEL- が現れない。"""
    for raw in all_hook_inputs:
        row = collect.extract_event(raw, raw["hook_event_name"])
        text = json.dumps(row, ensure_ascii=False)
        assert SENTINEL_PREFIX not in text


def test_string_values_trace_to_named_keypaths(all_hook_inputs):
    """出力の文字列値はいずれも、契約が名指しするキーパスの値か EXTRA_COLUMNS の値と一致する。"""
    for raw in all_hook_inputs:
        row = collect.extract_event(raw, raw["hook_event_name"])
        allowed = _traceable_string_values(raw, row)
        for key, value in row.items():
            if key == "kind" or not isinstance(value, str):
                continue
            assert value in allowed, f"{key}={value!r} が名指しされたキーパスに無い"


def _base_input(**overrides):
    """最小限の hook 入力を組み立てる。"""
    base = {"session_id": "s-1", "hook_event_name": "PostToolUse", "tool_name": "Bash"}
    base.update(overrides)
    return base


def test_sentinel_in_prompt_does_not_leak():
    raw = _base_input(prompt="SENTINEL-0001")
    row = collect.extract_event(raw, "PostToolUse")
    assert "SENTINEL-0001" not in json.dumps(row, ensure_ascii=False)


def test_sentinel_in_tool_response_does_not_leak():
    raw = _base_input(tool_response="SENTINEL-0002")
    row = collect.extract_event(raw, "PostToolUse")
    assert "SENTINEL-0002" not in json.dumps(row, ensure_ascii=False)


def test_sentinel_in_message_does_not_leak():
    raw = _base_input(message="SENTINEL-0003")
    row = collect.extract_event(raw, "PostToolUse")
    assert "SENTINEL-0003" not in json.dumps(row, ensure_ascii=False)


def test_sentinel_in_tool_input_command_does_not_leak():
    raw = _base_input(tool_input={"command": "SENTINEL-0004"})
    row = collect.extract_event(raw, "PostToolUse")
    assert "SENTINEL-0004" not in json.dumps(row, ensure_ascii=False)
    assert row["skill_name"] is None


def test_sentinel_in_tool_input_description_does_not_leak():
    raw = _base_input(tool_input={"description": "SENTINEL-0005"})
    row = collect.extract_event(raw, "PostToolUse")
    assert "SENTINEL-0005" not in json.dumps(row, ensure_ascii=False)


def test_sentinel_in_tool_input_query_does_not_leak():
    raw = _base_input(tool_input={"query": "SENTINEL-0006"})
    row = collect.extract_event(raw, "PostToolUse")
    assert "SENTINEL-0006" not in json.dumps(row, ensure_ascii=False)


def test_sentinel_deep_in_tool_input_does_not_leak():
    raw = _base_input(tool_input={"a": {"b": {"c": "SENTINEL-0007"}}})
    row = collect.extract_event(raw, "PostToolUse")
    assert "SENTINEL-0007" not in json.dumps(row, ensure_ascii=False)


def test_skill_present_alongside_sentinel_command():
    raw = _base_input(tool_input={"skill": "my-skill", "command": "SENTINEL-0008"})
    row = collect.extract_event(raw, "PostToolUse")
    assert row["skill_name"] == "my-skill"
    assert "SENTINEL-0008" not in json.dumps(row, ensure_ascii=False)


def test_1mb_sentinel_in_prompt_does_not_leak_and_output_is_small():
    huge = "SENTINEL-0009" * (1024 * 1024 // len("SENTINEL-0009") + 1)
    raw = _base_input(prompt=huge)
    row = collect.extract_event(raw, "PostToolUse")
    text = json.dumps(row, ensure_ascii=False)
    assert "SENTINEL-0009" not in text
    assert len(text.encode("utf-8")) < 4096


def test_special_characters_in_freetext_do_not_leak_or_raise():
    nasty = 'SENTINEL-0010\n"quoted"\x00tail'
    raw = _base_input(prompt=nasty, tool_response=nasty, message=nasty)
    row = collect.extract_event(raw, "PostToolUse")
    text = json.dumps(row, ensure_ascii=False)
    assert "SENTINEL-0010" not in text
