"""`session_start.py` がプラグインの更新の段へ `source` を渡すこと、無効化スイッチで止まらないことを検証する。"""

import json

import _updater
import pytest
import session_start

pytestmark = pytest.mark.usefixtures("session_start_env", "spy_launch", "fixed_policy")


@pytest.fixture
def spy_update(monkeypatch) -> list:
    calls = []
    monkeypatch.setattr(_updater, "update_if_due", calls.append)
    return calls


def _error_rows(tmp_path) -> list:
    path = tmp_path / "state" / "queue.jsonl"
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    return [r for r in rows if r.get("kind") == "error"]


@pytest.mark.parametrize("source", ["startup", "resume"])
def test_sourceを更新の段へ渡す(spy_update, monkeypatch, source):
    monkeypatch.setattr(
        session_start, "_read_stdin_json", lambda: {"session_id": "s", "source": source}
    )

    session_start.main()

    assert spy_update == [source]


def test_無効化スイッチでも更新の段は動く(spy_update, monkeypatch, capsys):
    monkeypatch.setenv("CC_GOVERNANCE_DISABLE", "1")

    session_start.main()

    assert spy_update == ["startup"]
    assert "systemMessage" not in json.loads(capsys.readouterr().out)


def test_無効化スイッチで標準入力が読めなくても送信判定は動き行を積まない(
    spy_update, monkeypatch, tmp_path, spy_launch
):
    monkeypatch.setenv("CC_GOVERNANCE_DISABLE", "1")
    monkeypatch.setattr(
        session_start,
        "_read_stdin_json",
        lambda: (_ for _ in ()).throw(RecursionError()),
    )

    session_start.main()

    assert spy_update == [None]
    assert len(spy_launch) == 1
    assert _error_rows(tmp_path) == []
