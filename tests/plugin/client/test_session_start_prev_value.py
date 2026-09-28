"""SessionStart が、旧値のある settings.json を置き換え、その旧値を policy 行の `prev_value` に載せることを検証する。"""

import json

import pytest
import session_start

PCT_NAME = "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
PCT_KEY = f"env.{PCT_NAME}"

pytestmark = pytest.mark.usefixtures("session_start_env", "spy_launch", "fixed_policy")


def test_旧値を置き換えてpolicy行に旧値を載せる(tmp_path):
    settings = tmp_path / "config" / "settings.json"
    settings.parent.mkdir(parents=True)
    before = {"model": "opus", "env": {PCT_NAME: "80", "HTTP_PROXY": "p"}}
    settings.write_text(json.dumps(before), encoding="utf-8")

    session_start.main()

    queue = (tmp_path / "state" / "queue.jsonl").read_text(encoding="utf-8")
    rows = [json.loads(line) for line in queue.splitlines()]
    pct = [r for r in rows if r.get("kind") == "policy" and r["key_name"] == PCT_KEY]
    assert [(r["value"], r["prev_value"], r["apply_result"]) for r in pct] == [
        ("60", "80", "applied")
    ]
    after = json.loads(settings.read_text(encoding="utf-8"))
    assert after == {
        "model": "opus",
        "env": {PCT_NAME: "60", "HTTP_PROXY": "p"},
    }
