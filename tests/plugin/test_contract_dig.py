"""dig(obj, path) によるキーパスの解決を検証する。"""

import contract
import pytest

_FOUND_CASES = {
    "single_key": (
        {"session_id": "7f678d60", "cwd": "/w"},
        ("session_id",),
        "7f678d60",
    ),
    "two_keys": (
        {"tool_name": "Skill", "tool_input": {"skill": "pdf"}},
        ("tool_input", "skill"),
        "pdf",
    ),
    "effort_level": ({"effort": {"level": "high"}}, ("effort", "level"), "high"),
}

_NONE_CASES = {
    "missing_leaf": (
        {"tool_name": "Bash", "tool_input": {"command": "ls", "description": "一覧"}},
        ("tool_input", "skill"),
    ),
    "missing_intermediate": (
        {"session_id": "s1", "hook_event_name": "Stop"},
        ("tool_input", "skill"),
    ),
    "intermediate_not_dict": ({"effort": "high"}, ("effort", "level")),
    "obj_is_none": (None, ("session_id",)),
    "obj_is_list": ([1, 2, 3], ("session_id",)),
    "value_is_none": ({"agent_id": None}, ("agent_id",)),
}


@pytest.mark.parametrize(
    ("obj", "path", "expected"), _FOUND_CASES.values(), ids=_FOUND_CASES.keys()
)
def test_dig_follows_key_path(obj, path, expected):
    assert contract.dig(obj, path) == expected


@pytest.mark.parametrize(("obj", "path"), _NONE_CASES.values(), ids=_NONE_CASES.keys())
def test_dig_returns_none(obj, path):
    """キー・途中の dict・値が無い、または対象が dict でなければ None。"""
    assert contract.dig(obj, path) is None
