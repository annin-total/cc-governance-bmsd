"""`session_start.py` が起動形態ごとに URL を開くかどうかを検証する結合テスト。

`_browser.open_url` を記録用の spy に差し替え、本物のブラウザは開かない。
状態・設定ディレクトリは `tmp_path` で隔離し、利用者本人の `~/.claude/` には触れない。
後半は `plugin/hooks` を実プロセスとして起動し、偽の `open` コマンドで
本物の `/usr/bin/open` が呼ばれないことまで確かめる。
"""

import json
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import _browser
import pytest
import session_start

MARKER = "ZZMARKER-URL-BODY"
URL_1 = "https://example.com/first"
URL_2 = "https://example.com/second"


pytestmark = pytest.mark.usefixtures("session_start_env", "spy_launch")


@pytest.fixture(autouse=True)
def _empty_settings(session_start_env):
    """設定ディレクトリに空の settings.json を置く。"""
    (session_start_env / "config").mkdir(parents=True, exist_ok=True)
    (session_start_env / "config" / "settings.json").write_text("{}", encoding="utf-8")


@pytest.fixture
def _open_spy(monkeypatch):
    """`_browser.open_url` を記録用の spy に差し替える。本物のブラウザを開かせないため。"""
    calls = []
    monkeypatch.setattr(_browser, "open_url", lambda url: calls.append(url))
    return calls


@pytest.fixture
def notices_file(write_notices):
    """url 付き 2 件（n-001, n-002）と url なし 1 件（n-003）を持つ notices.json を用意する。"""
    return write_notices(
        [
            {"id": "n-001", "title": "件名1", "body": f"本文1 {MARKER}", "url": URL_1},
            {"id": "n-002", "title": "件名2", "body": "本文2", "url": URL_2},
            {"id": "n-003", "title": "件名3", "body": "本文3"},
        ]
    )


@pytest.fixture
def notices_file_no_url(write_notices):
    """url を持たない項目だけの notices.json を用意する。"""
    return write_notices([{"id": "n-010", "title": "件名", "body": "本文のみ"}])


def _seen_file(tmp_path) -> Path:
    return tmp_path / "state" / "seen.json"


def _set_entrypoint(monkeypatch, value):
    if value is None:
        monkeypatch.delenv("CLAUDE_CODE_ENTRYPOINT", raising=False)
    else:
        monkeypatch.setenv("CLAUDE_CODE_ENTRYPOINT", value)


# ---- cli: 開く ----


def test_cli_opens_only_first_valid_url_once(
    notices_file, monkeypatch, capsys, _open_spy
):
    """cli では先頭の有効な URL（n-001 の URL_1）だけが 1 回開かれる。"""
    _set_entrypoint(monkeypatch, "cli")
    session_start.main()
    capsys.readouterr()
    assert _open_spy == [URL_1]


def test_cli_marks_all_unread_ids_as_seen(
    notices_file, tmp_path, monkeypatch, capsys, _open_spy
):
    """cli 実行後、seen.json に未読だった全 id（n-001, n-002, n-003）が入る。"""
    _set_entrypoint(monkeypatch, "cli")
    session_start.main()
    capsys.readouterr()
    seen = json.loads(_seen_file(tmp_path).read_text(encoding="utf-8"))
    assert set(seen) == {"n-001", "n-002", "n-003"}


def test_cli_system_message_contains_detail_line(
    notices_file, monkeypatch, capsys, _open_spy
):
    """systemMessage に `詳細: <url>` が含まれる。"""
    _set_entrypoint(monkeypatch, "cli")
    session_start.main()
    out = json.loads(capsys.readouterr().out)
    assert f"詳細: {URL_1}" in out["systemMessage"]
    assert f"詳細: {URL_2}" in out["systemMessage"]


def test_cli_second_run_does_not_open_again(
    notices_file, monkeypatch, capsys, _open_spy
):
    """1 回目の実行で既読になった後、2 回目の実行では開かない（未読が無いため）。"""
    _set_entrypoint(monkeypatch, "cli")
    session_start.main()
    capsys.readouterr()
    _open_spy.clear()

    session_start.main()
    capsys.readouterr()
    assert _open_spy == []


def test_cli_no_url_items_do_not_open(
    notices_file_no_url, monkeypatch, capsys, _open_spy
):
    """url なしの項目だけなら、cli でも開かない。"""
    _set_entrypoint(monkeypatch, "cli")
    session_start.main()
    capsys.readouterr()
    assert _open_spy == []


def test_cli_unparsable_url_does_not_hide_other_notices(
    write_notices, monkeypatch, capsys, _open_spy
):
    """`urlsplit` が例外を投げる url があっても、全項目が表示され、正常な URL が開く。"""
    write_notices(
        [
            {"id": "n-020", "title": "件名A", "body": "本文A", "url": "https://[x/"},
            {"id": "n-021", "title": "件名B", "body": "本文B", "url": URL_1},
        ]
    )
    _set_entrypoint(monkeypatch, "cli")

    session_start.main()
    message = json.loads(capsys.readouterr().out)["systemMessage"]
    assert "件名A" in message
    assert "件名B" in message
    assert "https://[x/" not in message
    assert _open_spy == [URL_1]


# ---- sdk-*（非対話）: 開かない・既読にもしない ----


def test_headless_sdk_does_not_open(notices_file, monkeypatch, capsys, _open_spy):
    """sdk-cli では開かない。"""
    _set_entrypoint(monkeypatch, "sdk-cli")
    session_start.main()
    capsys.readouterr()
    assert _open_spy == []


def test_headless_sdk_does_not_create_seen_file(
    notices_file, tmp_path, monkeypatch, capsys, _open_spy
):
    """sdk-cli では seen.json を作らない（既読にしない）。"""
    _set_entrypoint(monkeypatch, "sdk-cli")
    session_start.main()
    capsys.readouterr()
    assert not _seen_file(tmp_path).exists()


def test_headless_sdk_does_not_update_existing_seen_file(
    notices_file, tmp_path, monkeypatch, capsys, _open_spy
):
    """既に seen.json がある状態で sdk-cli を実行しても、既読は更新されない。"""
    seen_path = _seen_file(tmp_path)
    seen_path.parent.mkdir(parents=True, exist_ok=True)
    seen_path.write_text(json.dumps(["n-001"]), encoding="utf-8")
    _set_entrypoint(monkeypatch, "sdk-cli")

    session_start.main()
    capsys.readouterr()

    seen = json.loads(seen_path.read_text(encoding="utf-8"))
    assert set(seen) == {"n-001"}


def test_headless_sdk_still_emits_system_message(
    notices_file, monkeypatch, capsys, _open_spy
):
    """sdk-cli でも systemMessage 自体は出力される（テキストは出す）。"""
    _set_entrypoint(monkeypatch, "sdk-cli")
    session_start.main()
    out = json.loads(capsys.readouterr().out)
    assert "systemMessage" in out


# ---- 非対話でも非 headless（未設定・空・claude-vscode）: 開かないが既読にはする ----


@pytest.mark.parametrize("value", [None, "", "claude-vscode"])
def test_non_cli_non_headless_does_not_open(
    notices_file, monkeypatch, capsys, _open_spy, value
):
    """未設定・空・claude-vscode では開かない。"""
    _set_entrypoint(monkeypatch, value)
    session_start.main()
    capsys.readouterr()
    assert _open_spy == []


@pytest.mark.parametrize("value", [None, "", "claude-vscode"])
def test_non_cli_non_headless_still_marks_seen(
    notices_file, tmp_path, monkeypatch, capsys, _open_spy, value
):
    """未設定・空・claude-vscode でも既読には入る。"""
    _set_entrypoint(monkeypatch, value)
    session_start.main()
    capsys.readouterr()
    seen = json.loads(_seen_file(tmp_path).read_text(encoding="utf-8"))
    assert set(seen) == {"n-001", "n-002", "n-003"}


# ---- CC_GOVERNANCE_DISABLE ----


def test_disabled_does_not_open(notices_file, monkeypatch, capsys, _open_spy):
    """CC_GOVERNANCE_DISABLE=1 では開かない（お知らせ自体が出ないため）。"""
    _set_entrypoint(monkeypatch, "cli")
    monkeypatch.setenv("CC_GOVERNANCE_DISABLE", "1")
    session_start.main()
    capsys.readouterr()
    assert _open_spy == []


# ---- 既読を書けない ----


def test_seen_write_failure_does_not_open(
    notices_file, tmp_path, monkeypatch, capsys, _open_spy
):
    """状態ディレクトリの位置をファイルで塞ぎ、seen を書けなくすると、cli でも開かない。"""
    state_path = tmp_path / "state"
    if state_path.exists():
        shutil.rmtree(state_path)
    state_path.write_text("blocked", encoding="utf-8")
    _set_entrypoint(monkeypatch, "cli")

    session_start.main()
    capsys.readouterr()

    assert _open_spy == []


@pytest.mark.skipif(
    os.name == "nt", reason="chmod によるパーミッション制御は POSIX 限定"
)
def test_seen_write_readonly_dir_does_not_open(
    notices_file, tmp_path, monkeypatch, capsys, _open_spy
):
    """状態ディレクトリを読み取り専用にして seen を書けなくすると、cli でも開かない。"""
    state_dir = tmp_path / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    state_dir.chmod(stat.S_IRUSR | stat.S_IXUSR)
    _set_entrypoint(monkeypatch, "cli")
    try:
        session_start.main()
        capsys.readouterr()
        assert _open_spy == []
    finally:
        state_dir.chmod(stat.S_IRWXU)


# ---- 標準出力の書き出し失敗 ----


def test_stdout_write_failure_does_not_open(
    notices_file, monkeypatch, _open_spy, raising_stdout
):
    """標準出力への write が例外を投げると開かない（_emit_output が False のため）。"""
    _set_entrypoint(monkeypatch, "cli")
    original_stdout = session_start.sys.stdout
    session_start.sys.stdout = raising_stdout
    try:
        session_start.main()
    finally:
        session_start.sys.stdout = original_stdout
    assert _open_spy == []


def test_stdout_flush_failure_does_not_open(
    notices_file, monkeypatch, _open_spy, flush_raising_stdout
):
    """標準出力への flush が例外を投げると開かない（_emit_output が False のため）。"""
    _set_entrypoint(monkeypatch, "cli")
    original_stdout = session_start.sys.stdout
    session_start.sys.stdout = flush_raising_stdout
    try:
        session_start.main()
    finally:
        session_start.sys.stdout = original_stdout
    assert _open_spy == []


# ---- open_url が例外を投げても hook 全体は無事に終わる ----


def test_open_url_exception_does_not_break_output_or_collection(
    notices_file, monkeypatch, capsys, spy_launch
):
    """open_url が例外を投げても、標準出力は JSON 1 個、標準エラーは空、収集ステップも走る。"""
    _set_entrypoint(monkeypatch, "cli")

    def _raiser(_url):
        raise RuntimeError("boom")

    monkeypatch.setattr(_browser, "open_url", _raiser)

    session_start.main()
    captured = capsys.readouterr()

    lines = captured.out.splitlines()
    assert len(lines) == 1
    json.loads(lines[0])
    assert captured.err == ""
    assert len(spy_launch) == 1


# ---- 実プロセス版 ----


@pytest.mark.skipif(
    sys.platform != "darwin", reason="darwin だけが `open` コマンドで開く"
)
def test_real_process_opens_url_via_fake_open_not_real_one(hooks_dir, tmp_path):
    """実プロセスで起動し、PATH 先頭の偽 `open` に URL が渡ることを確かめる。
    本物の /usr/bin/open は PATH より後ろに置かれるため呼ばれない。偽 open が呼ばれた記録で担保する。
    """
    notices_path = tmp_path / "plugin" / "notices.json"
    notices_path.write_text(
        json.dumps(
            [
                {
                    "id": "n-real",
                    "title": "件名",
                    "body": "本文",
                    "url": "https://example.com/real",
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    fake_bin_dir = tmp_path / "fakebin"
    fake_bin_dir.mkdir()
    record_path = tmp_path / "open-calls.txt"
    fake_open = fake_bin_dir / "open"
    fake_open.write_text(
        f'#!/bin/sh\necho "$@" >> "{record_path}"\nexit 0\n',
        encoding="utf-8",
    )
    fake_open.chmod(
        fake_open.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH
    )

    env = os.environ.copy()
    env.pop("CC_GOVERNANCE_DISABLE", None)
    env["CLAUDE_PLUGIN_DATA"] = str(tmp_path / "state")
    env["CLAUDE_CONFIG_DIR"] = str(tmp_path / "config")
    env["CLAUDE_CODE_ENTRYPOINT"] = "cli"
    # 偽 open が実行できなくても本物の /usr/bin/open に落ちないよう、PATH を偽の bin だけにする。
    env["PATH"] = str(fake_bin_dir)

    result = subprocess.run(
        [sys.executable, str(hooks_dir / "session_start.py"), "SessionStart"],
        input='{"session_id":"s","source":"startup"}',
        text=True,
        capture_output=True,
        env=env,
        timeout=15,
        check=False,
    )

    assert result.returncode == 0
    assert result.stderr == ""

    # ブラウザ起動は detach され、hook プロセスはそれを待たない。書き込みが追いつくまで待つ。
    import time

    deadline = time.monotonic() + 5
    while not record_path.exists() and time.monotonic() < deadline:
        time.sleep(0.05)

    assert record_path.exists(), (
        "偽 open が呼ばれなかった（本物の open が使われた可能性がある）"
    )
    recorded = record_path.read_text(encoding="utf-8").strip()
    assert recorded == "https://example.com/real"
