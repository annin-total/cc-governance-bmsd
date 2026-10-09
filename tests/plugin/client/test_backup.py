"""settings.json のバックアップ（`<config_dir>/settings-backups/<YYYY_MMDD_HHMM>/`）を検証する。

`CLAUDE_CONFIG_DIR`・`CLAUDE_PLUGIN_DATA`・`HOME` を tmp_path に向ける。利用者本人の `~/.claude/` には触れない。
"""

import datetime
import importlib
import json
import os
import re
from pathlib import Path
from types import SimpleNamespace

import _govdir
import _settings
import pytest

_STAMP = "2026_1009_1530"


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "state"))
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "home"))
    (tmp_path / "config").mkdir()
    (tmp_path / "home").mkdir()


def _backup_module():
    return importlib.import_module("_backup")


def _fix_stamp(monkeypatch, stamp: str = _STAMP) -> None:
    monkeypatch.setattr(_backup_module(), "_stamp", lambda: stamp)


def _root() -> Path:
    return _govdir.config_dir() / "settings-backups"


def _folders() -> list:
    return sorted(p.name for p in _root().iterdir()) if _root().exists() else []


def _write_settings(data: dict) -> None:
    _govdir.settings_path().write_text(json.dumps(data), encoding="utf-8")


def _apply(set_: dict) -> str:
    """`set_` を SET として当て、先頭のキーの apply_result を返す。"""
    policy = SimpleNamespace(SET=set_, ADD={}, REMOVE={}, ONCE={})
    rows = _settings.apply_settings(
        _govdir.settings_path(), policy, _govdir.governance_dir()
    )
    return rows[0][3]


def test_書き換える直前の内容をconfig_dir直下に日時の名前で保存する():
    _write_settings({"n": 0, "keep": "x"})
    raw = _govdir.settings_path().read_bytes()
    before = datetime.datetime.now().astimezone()
    assert _apply({"n": 1}) == "applied"
    after = datetime.datetime.now().astimezone()

    [name] = _folders()
    assert re.fullmatch(r"\d{4}_\d{4}_\d{4}", name)
    assert name in {t.strftime("%Y_%m%d_%H%M") for t in (before, after)}
    assert [p.name for p in (_root() / name).iterdir()] == ["settings.json"]
    assert (_root() / name / "settings.json").read_bytes() == raw


@pytest.mark.skipif(os.name == "nt", reason="POSIX の権限ビットを見る")
def test_バックアップは本人だけが読める権限で作る():
    _write_settings({"n": 0})
    assert _apply({"n": 1}) == "applied"
    [folder] = _root().iterdir()
    assert (folder / "settings.json").stat().st_mode & 0o777 == 0o600


def test_同じ分なら連番を付けすべて残す(monkeypatch):
    _fix_stamp(monkeypatch)
    _write_settings({"n": 0})
    for i in range(1, 13):
        assert _apply({"n": i}) == "applied"

    expected = [_STAMP] + [f"{_STAMP}-{k}" for k in range(2, 13)]
    assert sorted(_folders()) == sorted(expected)
    kept = {
        name: json.loads((_root() / name / "settings.json").read_text())["n"]
        for name in expected
    }
    assert [kept[name] for name in expected] == list(range(12))


def test_直前のバックアップと同じ内容なら作らない(monkeypatch):
    _fix_stamp(monkeypatch)
    backup = _backup_module().backup
    _write_settings({"n": 0})
    backup(_govdir.settings_path())
    backup(_govdir.settings_path())
    assert _folders() == [_STAMP]
    _write_settings({"n": 1})
    backup(_govdir.settings_path())
    _write_settings({"n": 0})
    backup(_govdir.settings_path())
    assert sorted(_folders()) == [_STAMP, f"{_STAMP}-2", f"{_STAMP}-3"]


def test_直前は連番を数値で並べて選ぶ(monkeypatch):
    """`-10` が `-9` より後。文字列で並べると `-9` を直前と取り違える。"""
    _fix_stamp(monkeypatch)
    for k in range(1, 11):
        name = _STAMP if k == 1 else f"{_STAMP}-{k}"
        (_root() / name).mkdir(parents=True)
        (_root() / name / "settings.json").write_text(f'{{"n": {k}}}')
    _write_settings({"n": 10})
    _backup_module().backup(_govdir.settings_path())
    assert len(_folders()) == 10, "最新（-10）と同じ内容なので作らない"

    _write_settings({"n": 9})
    _backup_module().backup(_govdir.settings_path())
    assert f"{_STAMP}-11" in _folders()


def _statusline_fixture(tmp_path, monkeypatch) -> tuple:
    """statusLine.command が指す候補を作り、(command, 写されるべき名前と中身) を返す。"""
    scripts = tmp_path / "scripts"
    (scripts / "folder").mkdir(parents=True)
    (scripts / "abs.sh").write_text("abs")
    (scripts / "rel.sh").write_text("rel")
    (tmp_path / "home" / "tilde.sh").write_text("tilde")
    (tmp_path / "envdir").mkdir()
    (tmp_path / "envdir" / "env.sh").write_text("env")
    monkeypatch.setenv("SL_DIR", str(tmp_path / "envdir"))
    monkeypatch.chdir(scripts)
    command = (
        f'bash "{(scripts / "abs.sh").as_posix()}" {(scripts / "folder").as_posix()} '
        f"rel.sh ~/tilde.sh $SL_DIR/env.sh {(scripts / 'missing.sh').as_posix()}"
    )
    return command, {"abs.sh": "abs", "tilde.sh": "tilde", "env.sh": "env"}


@pytest.mark.skipif(os.name == "nt", reason="POSIX のシェルの書き方で組み立てる")
def test_statusLineを書き換えるときだけ指すファイルを写す(tmp_path, monkeypatch):
    command, expected = _statusline_fixture(tmp_path, monkeypatch)
    old = {"type": "command", "command": command}
    _write_settings({"statusLine": old, "n": 0})

    assert _apply({"n": 1}) == "applied"
    [first] = _folders()
    assert [p.name for p in (_root() / first).iterdir()] == ["settings.json"]

    assert _apply({"statusLine": {"type": "command", "command": "new"}}) == "applied"
    [second] = [name for name in _folders() if name != first]
    copied = {p.name: p for p in (_root() / second).iterdir()}
    assert sorted(copied) == sorted(["settings.json", *expected])
    for name, text in expected.items():
        assert copied[name].read_text() == text
        assert copied[name].stat().st_mode & 0o777 == 0o600


@pytest.mark.skipif(os.name == "nt", reason="POSIX のシェルの書き方で組み立てる")
def test_上限を超えるファイルは写さずに進める(tmp_path):
    limit = _backup_module().MAX_STATUSLINE_FILE_BYTES
    (tmp_path / "at_limit.sh").write_bytes(b"a" * limit)
    (tmp_path / "over.bin").write_bytes(b"b" * (limit + 1))
    command = (
        f"{(tmp_path / 'over.bin').as_posix()} {(tmp_path / 'at_limit.sh').as_posix()}"
    )
    _write_settings({"statusLine": {"type": "command", "command": command}})

    assert _apply({"statusLine": {"type": "command", "command": "y"}}) == "applied"
    [name] = _folders()
    copied = sorted(p.name for p in (_root() / name).iterdir())
    assert copied == ["at_limit.sh", "settings.json"]


def test_statusLineのファイルの内容だけが変わっても新しく作る(tmp_path, monkeypatch):
    _fix_stamp(monkeypatch)
    target = tmp_path / "sl.sh"
    target.write_text("v1")
    statusline = {"type": "command", "command": target.as_posix()}
    _write_settings({"statusLine": statusline})
    backup = _backup_module().backup

    backup(_govdir.settings_path(), statusline)
    backup(_govdir.settings_path(), statusline)
    assert _folders() == [_STAMP]

    target.write_text("v2")
    backup(_govdir.settings_path(), statusline)
    assert sorted(_folders()) == [_STAMP, f"{_STAMP}-2"]
    assert (_root() / f"{_STAMP}-2" / "sl.sh").read_text() == "v2"


def test_statusLineが既に同じなら書かず写さない(tmp_path, monkeypatch):
    value = {"type": "command", "command": "x"}
    _write_settings({"statusLine": value})
    assert _apply({"statusLine": value}) == "already_ok"
    assert _folders() == []


def test_元のファイルが無ければ保存せずに書く():
    assert _apply({"n": 1}) == "applied"
    assert _folders() == []


def test_保存に失敗したら書かない():
    raw = '{"n": 0}'
    _govdir.settings_path().write_text(raw, encoding="utf-8")
    _root().write_text("", encoding="utf-8")  # フォルダを作れない

    assert _apply({"n": 1}) == "write_failed"
    assert _govdir.settings_path().read_text(encoding="utf-8") == raw


@pytest.mark.skipif(
    os.name == "nt" or os.geteuid() == 0, reason="POSIX の権限ビットで読めなくする"
)
def test_写すファイルを読めなくても設定は保存して書く(tmp_path):
    """statusLine の指すファイルはプラグインが書き換えないので、読めなければ写さずに進める。"""
    target = tmp_path / "sl.sh"
    target.write_text("x")
    target.chmod(0)
    _write_settings({"statusLine": {"type": "command", "command": target.as_posix()}})
    raw = _govdir.settings_path().read_bytes()

    assert _apply({"statusLine": {"type": "command", "command": "y"}}) == "applied"
    [name] = _folders()
    folder = _root() / name
    assert sorted(f.name for f in folder.iterdir()) == ["settings.json"]
    assert (folder / "settings.json").read_bytes() == raw


def test_途中で書けなければ書きかけのフォルダを残さない(tmp_path, monkeypatch):
    target = tmp_path / "sl.sh"
    target.write_text("x")
    _write_settings({"statusLine": {"type": "command", "command": target.as_posix()}})
    real_open = os.open

    def _fail_second(path, *args, **kwargs):
        if Path(path).name == "sl.sh":
            raise OSError(28, "No space left on device")
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr(os, "open", _fail_second)
    assert _apply({"statusLine": {"type": "command", "command": "y"}}) == "write_failed"
    assert _folders() == []


def test_旧governance_backupsには書かず既存も触らない():
    old_dir = _govdir.governance_dir() / "backups"
    old_dir.mkdir(parents=True)
    old = old_dir / "settings-old.json"
    old.write_text("old")
    stat = old.stat()
    _write_settings({"n": 0})

    assert _apply({"n": 1}) == "applied"
    assert [p.name for p in old_dir.iterdir()] == ["settings-old.json"]
    assert old.read_text() == "old"
    assert old.stat().st_mtime_ns == stat.st_mtime_ns
    assert len(_folders()) == 1


def test_CLAUDE_CONFIG_DIRに置きホームの既定の場所には置かない(tmp_path):
    _write_settings({"n": 0})
    assert _apply({"n": 1}) == "applied"
    assert len(_folders()) == 1
    assert not (tmp_path / "home" / ".claude").exists()


def _record() -> Path:
    return Path(os.environ["CLAUDE_PLUGIN_DATA"]) / "last_plugin_version"


def test_版が変わったら作り同じ版なら作らない(monkeypatch):
    _fix_stamp(monkeypatch)
    on_update = _backup_module().backup_if_updated
    _write_settings({"n": 0})
    on_update("1.0.0")
    assert _folders() == [_STAMP], "記録が無い（初回導入）ときも作る"
    _write_settings({"n": 1})
    on_update("1.0.0")
    assert _folders() == [_STAMP]
    on_update("1.1.0")
    assert sorted(_folders()) == [_STAMP, f"{_STAMP}-2"]
    saved = json.loads((_root() / f"{_STAMP}-2" / "settings.json").read_text())
    assert saved == {"n": 1}


def test_版の変化で作れなければ記録せず次回また試す(monkeypatch):
    on_update = _backup_module().backup_if_updated
    _write_settings({"n": 0})
    _root().write_text("")
    with pytest.raises(OSError):
        on_update("1.0.0")
    assert not _record().exists()

    _root().unlink()
    on_update("1.0.0")
    assert len(_folders()) == 1
    assert _record().read_text(encoding="utf-8") == "1.0.0"


def test_版が読めなければ作らず記録もしない():
    _write_settings({"n": 0})
    _backup_module().backup_if_updated(None)
    assert _folders() == []
    assert not _record().exists()


def test_settingsが無ければ作らずに記録する():
    _backup_module().backup_if_updated("1.0.0")
    assert _folders() == []
    assert _record().read_text(encoding="utf-8") == "1.0.0"


def test_SessionStartが導入直後にバックアップを作る(tmp_path, monkeypatch, capsys):
    import session_start

    root = tmp_path / "root" / ".claude-plugin"
    root.mkdir(parents=True)
    (root / "plugin.json").write_text('{"version": "9.9.9"}')
    monkeypatch.setenv("CLAUDE_PLUGIN_ROOT", str(tmp_path / "root"))
    monkeypatch.setattr(session_start.sys, "argv", ["session_start.py", "SessionStart"])
    monkeypatch.setattr(session_start, "_read_stdin_json", lambda: {"session_id": "s"})
    monkeypatch.setattr(session_start._spool, "should_send", lambda: False)
    _write_settings({"keep": "x"})
    raw = _govdir.settings_path().read_bytes()

    session_start.main()

    assert capsys.readouterr().err == ""
    first = min(_root().iterdir(), key=lambda p: p.name)
    assert (first / "settings.json").read_bytes() == raw, "適用より前の内容を残す"
    assert _record().read_text(encoding="utf-8") == "9.9.9"
