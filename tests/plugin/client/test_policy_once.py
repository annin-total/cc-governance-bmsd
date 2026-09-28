"""ONCE の 1 回だけの適用・値を変えたときの再適用・`/governance:reapply` を検証する。

`CLAUDE_CONFIG_DIR` を tmp_path に向ける。利用者本人の `~/.claude/` には触れない。
"""

import json
from types import SimpleNamespace

import _govdir
import _settings
import pytest
import reapply

STATUS = {"type": "command", "command": 'node "${GOVERNANCE_HOME}/statusline.js"'}


@pytest.fixture(autouse=True)
def _config_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "config"))
    (tmp_path / "config").mkdir()


def _policy(once: dict) -> SimpleNamespace:
    return SimpleNamespace(SET={}, ADD={}, REMOVE={}, ONCE=once)


def _apply(once: dict) -> dict:
    rows = _settings.apply_settings(
        _govdir.settings_path(), _policy(once), _govdir.governance_dir()
    )
    return {key: result for key, _value, _prev, result in rows}


def _read() -> dict:
    return json.loads(_govdir.settings_path().read_text(encoding="utf-8"))


def _write(data: dict) -> None:
    _govdir.settings_path().write_text(json.dumps(data), encoding="utf-8")


def _expected_command() -> str:
    return f'node "{_govdir.governance_dir().as_posix()}/statusline.js"'


def test_1回目にプレースホルダを絶対パスへ置換して書く():
    assert _apply({"statusLine": STATUS}) == {"once:statusLine": "applied"}
    command = _read()["statusLine"]["command"]
    assert command == _expected_command()
    assert "\\" not in command and "${" not in command


def test_利用者が変えた後は戻さない():
    _apply({"statusLine": STATUS})
    _write({"statusLine": {"type": "command", "command": "mine"}})

    assert _apply({"statusLine": STATUS}) == {"once:statusLine": "already_ok"}
    assert _read()["statusLine"]["command"] == "mine"


def test_値を変えて配れば再度1回だけ書く():
    _apply({"statusLine": STATUS})
    _write({"statusLine": {"type": "command", "command": "mine"}})
    changed = {**STATUS, "padding": 1}

    assert _apply({"statusLine": changed}) == {"once:statusLine": "applied"}
    assert _read()["statusLine"]["padding"] == 1
    _write({"statusLine": {"type": "command", "command": "mine"}})
    assert _apply({"statusLine": changed}) == {"once:statusLine": "already_ok"}
    assert _read()["statusLine"]["command"] == "mine"


def test_前の値へ戻して配ると再び1回だけ書く():
    """ONCE の記録は今の組だけを持つ。A → B → A と配ると、利用者の値を再び 1 回だけ上書きする。"""
    changed = {**STATUS, "padding": 1}
    _apply({"statusLine": STATUS})
    _write({"statusLine": {"type": "command", "command": "mine"}})
    _apply({"statusLine": changed})
    _write({"statusLine": {"type": "command", "command": "mine"}})

    assert _apply({"statusLine": STATUS}) == {"once:statusLine": "applied"}
    assert _read()["statusLine"]["command"] == _expected_command()
    _write({"statusLine": {"type": "command", "command": "mine"}})
    assert _apply({"statusLine": STATUS}) == {"once:statusLine": "already_ok"}


def test_既に同じ値なら書かずに適用済みにする():
    _write({"statusLine": {**STATUS, "command": _expected_command()}})
    assert _apply({"statusLine": STATUS}) == {"once:statusLine": "already_ok"}
    _write({"statusLine": {"type": "command", "command": "mine"}})
    assert _apply({"statusLine": STATUS}) == {"once:statusLine": "already_ok"}


def test_書けなかった組は適用済みにしない(monkeypatch):
    _write({})

    def _raise(*_args, **_kwargs):
        raise OSError("boom")

    # monkeypatch.undo() は使わない。_config_dir の CLAUDE_CONFIG_DIR まで外れる
    original = _settings.os.replace
    monkeypatch.setattr(_settings.os, "replace", _raise)
    assert _apply({"statusLine": STATUS}) == {"once:statusLine": "write_failed"}
    monkeypatch.setattr(_settings.os, "replace", original)
    assert _apply({"statusLine": STATUS}) == {"once:statusLine": "applied"}


def test_reapplyで記録を消して再適用する(monkeypatch, capsys):
    _apply({"statusLine": STATUS})
    _write({"statusLine": {"type": "command", "command": "mine"}})
    monkeypatch.setattr(reapply, "policy", _policy({"statusLine": STATUS}))

    reapply.main()

    assert _read()["statusLine"]["command"] == _expected_command()
    assert capsys.readouterr().out == "applied\tonce:statusLine\n"
