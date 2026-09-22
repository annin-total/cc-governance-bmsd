"""dig(obj, path) によるキーパスの解決を検証する。"""

import contract


def test_dig_single_key():
    """1 階層のキーパスをたどれる。"""
    obj = {"session_id": "7f678d60", "cwd": "/w"}
    assert contract.dig(obj, ("session_id",)) == "7f678d60"


def test_dig_two_keys():
    """2 階層のキーパスをたどれる。"""
    obj = {"tool_name": "Skill", "tool_input": {"skill": "pdf"}}
    assert contract.dig(obj, ("tool_input", "skill")) == "pdf"


def test_dig_effort_level():
    """effort.level のキーパスをたどれる。"""
    obj = {"effort": {"level": "high"}}
    assert contract.dig(obj, ("effort", "level")) == "high"


def test_dig_missing_leaf():
    """末端のキーが無ければ None を返す。"""
    obj = {"tool_name": "Bash", "tool_input": {"command": "ls", "description": "一覧"}}
    assert contract.dig(obj, ("tool_input", "skill")) is None


def test_dig_missing_intermediate():
    """途中のキーが無ければ None を返す。"""
    obj = {"session_id": "s1", "hook_event_name": "Stop"}
    assert contract.dig(obj, ("tool_input", "skill")) is None


def test_dig_intermediate_not_dict():
    """途中の値が dict でなければ None を返す。"""
    obj = {"effort": "high"}
    assert contract.dig(obj, ("effort", "level")) is None


def test_dig_obj_is_none():
    """対象が None なら None を返す。"""
    assert contract.dig(None, ("session_id",)) is None


def test_dig_obj_is_list():
    """対象が dict でなければ None を返す。"""
    assert contract.dig([1, 2, 3], ("session_id",)) is None


def test_dig_value_is_none():
    """値そのものが None であれば None を返す。"""
    obj = {"agent_id": None}
    assert contract.dig(obj, ("agent_id",)) is None
