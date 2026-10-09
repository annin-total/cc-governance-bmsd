"""プラグインの更新の起動条件・間隔の記録・子が実行するコマンドを検証する。

起動と子の 2 コマンドは `subprocess.Popen` をスパイする。時間切れだけは POSIX で偽の claude を実際に起動して確かめる。
"""

import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

import _updater
import policy
import pytest

MKT = policy.MARKETPLACE
PLUGIN = "governance"
CLAUDE_DIR = "/opt/bin"
CLAUDE = CLAUDE_DIR + "/claude"


@pytest.fixture
def state_dir(tmp_path, monkeypatch) -> Path:
    """状態ディレクトリ。名前はマーケットプレイス名と関係させない（名前から何も取らない）。"""
    path = tmp_path / "state"
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(path))
    monkeypatch.delenv("CLAUDE_PLUGIN_ROOT", raising=False)
    monkeypatch.delenv("CLAUDE_CODE_ENTRYPOINT", raising=False)
    monkeypatch.setattr(_updater.shutil, "which", lambda name: CLAUDE)
    monkeypatch.setenv("PATH", os.pathsep.join([CLAUDE_DIR, os.environ["PATH"]]))
    return path


@pytest.fixture
def popen(monkeypatch, state_dir) -> list:
    """起動の呼び出しを (argv, kwargs, その時点で記録が在ったか) として積む。"""
    calls = []

    def _spy(argv, **kwargs):
        calls.append((argv, kwargs, (state_dir / "update_at").exists()))

    monkeypatch.setattr(_updater.subprocess, "Popen", _spy)
    return calls


def _record(state_dir: Path, age_sec: float) -> Path:
    path = state_dir / "update_at"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()
    mtime = time.time() - age_sec
    os.utime(path, (mtime, mtime))
    return path


def test_startupの対話で子を切り離して起動する(popen, state_dir):
    _updater.update_if_due("startup")

    assert len(popen) == 1
    argv, kwargs, recorded = popen[0]
    assert argv == [
        sys.executable,
        str(Path(_updater.__file__).resolve()),
        CLAUDE,
        MKT,
        PLUGIN,
    ]
    assert kwargs["start_new_session"] is True
    assert kwargs["cwd"] == str(state_dir), "子はプロジェクトのフォルダで動かさない"
    for stream in ("stdin", "stdout", "stderr"):
        assert kwargs[stream] is subprocess.DEVNULL
    assert recorded, "時刻の記録は起動より前に書く"


@pytest.mark.parametrize("source", ["resume", "clear", "compact", None, "unknown"])
def test_startup以外では起動しない(popen, state_dir, source):
    _updater.update_if_due(source)

    assert popen == []
    assert not (state_dir / "update_at").exists()


def test_非対話では起動しない(popen, state_dir, monkeypatch):
    monkeypatch.setenv("CLAUDE_CODE_ENTRYPOINT", "sdk-cli")

    _updater.update_if_due("startup")

    assert popen == []


def test_対話のentrypointなら起動する(popen, monkeypatch):
    monkeypatch.setenv("CLAUDE_CODE_ENTRYPOINT", "cli")

    _updater.update_if_due("startup")

    assert len(popen) == 1


def test_間隔の内側では起動しない(popen, state_dir):
    record = _record(state_dir, _updater.UPDATE_INTERVAL_SEC - 60)
    before = record.stat().st_mtime

    _updater.update_if_due("startup")

    assert popen == []
    assert record.stat().st_mtime == before


def test_間隔を過ぎたら起動して記録を新しくする(popen, state_dir):
    record = _record(state_dir, _updater.UPDATE_INTERVAL_SEC + 60)

    _updater.update_if_due("startup")

    assert len(popen) == 1
    assert time.time() - record.stat().st_mtime < 60


def test_記録の時刻が未来なら起動する(popen, state_dir):
    _record(state_dir, -3600)

    _updater.update_if_due("startup")

    assert len(popen) == 1


def test_記録を書けなければ起動しない(popen, state_dir):
    state_dir.mkdir(parents=True)
    state_dir.chmod(0o500)
    try:
        _updater.update_if_due("startup")
    finally:
        state_dir.chmod(0o700)

    assert popen == []
    assert not (state_dir / "update_at").exists()


def test_claudeが見つからなければ起動せず記録もしない(popen, state_dir, monkeypatch):
    monkeypatch.setattr(_updater.shutil, "which", lambda name: None)

    _updater.update_if_due("startup")

    assert popen == []
    assert not (state_dir / "update_at").exists()


@pytest.mark.parametrize(
    "found",
    [
        os.path.join(os.sep, "elsewhere", "claude"),
        # Windows の which は現在のフォルダを最優先で探す
        os.path.join(os.curdir, "claude.cmd"),
        os.path.join(os.pardir, "claude"),
    ],
)
def test_PATHの項目に無いフォルダのclaudeは使わない(
    popen, state_dir, monkeypatch, found
):
    monkeypatch.setattr(_updater.shutil, "which", lambda name: found)
    monkeypatch.setenv("PATH", os.pathsep.join([CLAUDE_DIR, os.curdir, ""]))

    _updater.update_if_due("startup")

    assert popen == []
    assert not (state_dir / "update_at").exists()


def test_PATHの項目は正規化して比べる(popen, state_dir, monkeypatch):
    monkeypatch.setenv("CC_TEST_OPT", "/opt")
    monkeypatch.setenv("PATH", os.path.join("$CC_TEST_OPT", "bin", ""))

    _updater.update_if_due("startup")

    assert len(popen) == 1
    assert popen[0][0][2] == CLAUDE


def test_テストの環境ではPATHからclaudeが見つからない():
    assert shutil.which("claude") is None, "tests/conftest.py のガードが効いていない"


def test_plugin_jsonの名前が読めなければ起動しない(popen, tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_PLUGIN_ROOT", str(tmp_path / "no-plugin"))

    _updater.update_if_due("startup")

    assert popen == []


def test_起動の失敗を外に出さない(state_dir, monkeypatch):
    def _fail(*_args, **_kwargs):
        raise OSError("boom")

    monkeypatch.setattr(_updater.subprocess, "Popen", _fail)

    _updater.update_if_due("startup")


# --- 子プロセス（`python3 _updater.py <claude> <mkt> <plugin>`）


class _FakeProc:
    def __init__(self, calls: list, argv: list, kwargs: dict, wait_error=None) -> None:
        self.pid = -1
        self.returncode = 1
        self._calls = calls
        self._wait_error = wait_error
        calls.append({"argv": argv, "kwargs": kwargs, "timeouts": []})

    def wait(self, timeout=None) -> int:
        self._calls[-1]["timeouts"].append(timeout)
        if self._wait_error is not None:
            raise self._wait_error
        return self.returncode


def _spy_run(monkeypatch) -> list:
    calls = []
    monkeypatch.setattr(
        _updater.subprocess, "Popen", lambda argv, **kw: _FakeProc(calls, argv, kw)
    )
    return calls


@pytest.fixture
def run_calls(monkeypatch) -> list:
    return _spy_run(monkeypatch)


def _commands(plugin: str = PLUGIN, mkt: str = MKT) -> list:
    return [
        [CLAUDE, "plugin", "marketplace", "update", mkt],
        [CLAUDE, "plugin", "update", f"{plugin}@{mkt}", "--scope", "user"],
    ]


def test_子はマーケットプレイスの更新からプラグインの更新の順に実行する(run_calls):
    _updater.run(CLAUDE, MKT, PLUGIN)

    assert [c["argv"] for c in run_calls] == _commands()
    for call in run_calls:
        timeout = call["timeouts"][0]
        assert isinstance(timeout, (int, float)) and 0 < timeout, (
            "正の数の時間切れで待つ"
        )
        assert call["kwargs"]["start_new_session"] is (os.name != "nt")
        for stream in ("stdin", "stdout", "stderr"):
            assert call["kwargs"][stream] is subprocess.DEVNULL


@pytest.mark.parametrize(
    "failure",
    [
        subprocess.TimeoutExpired("claude", 1),
        OSError("boom"),
        None,  # 終了コード 1 で終わる
    ],
)
def test_1つ目が失敗しても2つ目を実行し例外を外に出さない(monkeypatch, failure):
    calls = []

    def _popen(argv, **kwargs):
        if calls:
            calls.append({"argv": argv})
            raise OSError("second")
        if isinstance(failure, OSError):
            calls.append({"argv": argv})
            raise failure
        return _FakeProc(calls, argv, kwargs, wait_error=failure)

    monkeypatch.setattr(_updater.subprocess, "Popen", _popen)
    monkeypatch.setattr(_updater, "_kill", lambda proc: None)

    _updater.run(CLAUDE, MKT, PLUGIN)

    assert len(calls) == 2


def test_子は引数が足りなければ何もしない(run_calls, monkeypatch):
    monkeypatch.setattr(sys, "argv", ["_updater.py", CLAUDE])

    _updater._main()

    assert run_calls == []


def test_起動時の引数を受けた子はマーケットプレイス名とプラグイン名を取り違えない(
    popen, monkeypatch
):
    _updater.update_if_due("startup")
    child_args = popen[0][0][2:]
    run_calls = _spy_run(monkeypatch)
    monkeypatch.setattr(sys, "argv", ["_updater.py", *child_args])

    _updater._main()

    assert [c["argv"] for c in run_calls] == _commands()


_FAKE_CLAUDE = """#!/bin/sh
sleep 30 &
echo $! >> "$(dirname "$0")/grandchild.pid"
wait
"""


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


@pytest.mark.skipif(os.name == "nt", reason="POSIX のプロセスグループで止める")
def test_時間切れで子と孫を止めて次へ進む(tmp_path, monkeypatch):
    claude = tmp_path / "claude"
    claude.write_text(_FAKE_CLAUDE, encoding="utf-8")
    claude.chmod(0o755)
    monkeypatch.setattr(_updater, "COMMAND_TIMEOUT_SEC", 2)
    started_argv = []
    real_popen = subprocess.Popen

    def _popen(argv, **kwargs):
        started_argv.append(argv)
        return real_popen(argv, **kwargs)

    monkeypatch.setattr(_updater.subprocess, "Popen", _popen)
    pid_file = tmp_path / "grandchild.pid"

    started = time.monotonic()
    _updater.run(str(claude), MKT, PLUGIN)
    elapsed = time.monotonic() - started

    grandchildren = [int(x) for x in pid_file.read_text(encoding="utf-8").split()]
    try:
        assert elapsed < 15, "時間切れで待つのをやめる"
        assert len(started_argv) == 2, "1 つ目の時間切れの後に 2 つ目へ進む"
        deadline = time.monotonic() + 5
        while any(map(_alive, grandchildren)) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not any(map(_alive, grandchildren)), "孫もグループごと止める"
    finally:
        for pid in filter(_alive, grandchildren):
            os.kill(pid, signal.SIGKILL)
