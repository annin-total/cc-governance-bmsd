"""user_email / host / event_id の解決とキャッシュを検証する。

`CLAUDE_PLUGIN_DATA` を一時ディレクトリに向けてテストを隔離する。代替経路
（`CLAUDE_PLUGIN_DATA` が無いときの `~/.claude/cc-governance/`）を検査するケースだけ、
`CLAUDE_PLUGIN_DATA` を外したうえで `HOME` を差し替える。
"""

import json
import platform
import subprocess

import _identity
import pytest


class _FailingGitRun:
    """呼ばれたら失敗する subprocess.run の偽物。呼ばれたことを記録する。"""

    def __init__(self):
        self.called = False

    def __call__(self, *args, **kwargs):
        self.called = True
        raise AssertionError("subprocess.run が呼ばれてはいけない")


def _fake_run(returncode: int = 0, stdout: str = ""):
    """git config の代わりに使う subprocess.run の偽物を作る。"""

    def _run(*args, **kwargs):
        return subprocess.CompletedProcess(args, returncode, stdout=stdout, stderr="")

    return _run


def _fake_run_missing_git(*args, **kwargs):
    """git 自体が存在しない場合を模す。"""
    raise FileNotFoundError("git")


@pytest.fixture(autouse=True)
def _isolate_state_dir(monkeypatch, tmp_path):
    """CLAUDE_PLUGIN_DATA を一時ディレクトリに向け、環境変数をクリアする。"""
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "plugin-data"))
    monkeypatch.delenv("CC_GOVERNANCE_USER_EMAIL", raising=False)
    return tmp_path


def test_env_var_no_cache(monkeypatch, tmp_path):
    """#1: 環境変数あり・キャッシュ無し -> 小文字化された値を返す。"""
    monkeypatch.setenv("CC_GOVERNANCE_USER_EMAIL", "Foo@Example.COM")
    assert _identity.get_user_email() == "foo@example.com"


def test_env_var_called_twice_caches(monkeypatch, tmp_path):
    """#2: 直後にもう一度呼んでも同じ値。identity.json が存在しその値を持つ。"""
    monkeypatch.setenv("CC_GOVERNANCE_USER_EMAIL", "Foo@Example.COM")
    first = _identity.get_user_email()
    second = _identity.get_user_email()
    assert first == second == "foo@example.com"

    identity_path = _identity._identity_path()
    assert identity_path.exists()
    assert json.loads(identity_path.read_text())["user_email"] == "foo@example.com"


def test_git_config_success(monkeypatch):
    """#3: 環境変数なし、git config が値を返す -> 小文字化して返す。"""
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )
    assert _identity.get_user_email() == "bar@example.com"


def test_git_config_empty(monkeypatch):
    """#4: 環境変数なし、git config が空文字を返す -> None。"""
    monkeypatch.setattr(_identity.subprocess, "run", _fake_run(returncode=0, stdout=""))
    assert _identity.get_user_email() is None


def test_git_config_nonzero_exit(monkeypatch):
    """#5: 環境変数なし、git config が非 0 で終了する -> None（例外を投げない）。"""
    monkeypatch.setattr(_identity.subprocess, "run", _fake_run(returncode=1, stdout=""))
    assert _identity.get_user_email() is None


def test_git_missing(monkeypatch):
    """#6: 環境変数なし、git が存在しない -> None（例外を投げない）。"""
    monkeypatch.setattr(_identity.subprocess, "run", _fake_run_missing_git)
    assert _identity.get_user_email() is None


def test_cache_skips_subprocess_on_git_failure(monkeypatch):
    """#7: キャッシュ済みの状態で git config が失敗する細工をしても、
    キャッシュの値を返し subprocess を起動しない。"""
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )
    first = _identity.get_user_email()
    assert first == "bar@example.com"

    failing_run = _FailingGitRun()
    monkeypatch.setattr(_identity.subprocess, "run", failing_run)
    second = _identity.get_user_email()

    assert second == "bar@example.com"
    assert failing_run.called is False


def test_env_var_wins_over_cache(monkeypatch):
    """#8: キャッシュ済みでも、環境変数があればその値を返す（環境変数が最優先）。"""
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )
    cached = _identity.get_user_email()
    assert cached == "bar@example.com"

    monkeypatch.setenv("CC_GOVERNANCE_USER_EMAIL", "Other@Example.com")
    assert _identity.get_user_email() == "other@example.com"


def test_corrupt_cache_is_ignored(monkeypatch):
    """#9: identity.json が壊れた JSON -> 例外なし。解決し直して上書きする。"""
    identity_path = _identity._identity_path()
    identity_path.parent.mkdir(parents=True, exist_ok=True)
    identity_path.write_text("{not valid json")

    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )
    result = _identity.get_user_email()

    assert result == "bar@example.com"
    assert json.loads(identity_path.read_text())["user_email"] == "bar@example.com"


def test_missing_parent_dir_is_created(monkeypatch):
    """#10: identity.json の親ディレクトリが無い -> ディレクトリを作って書き込む。"""
    identity_path = _identity._identity_path()
    assert not identity_path.parent.exists()

    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )
    _identity.get_user_email()

    assert identity_path.exists()


def test_host_matches_platform_node():
    """#11: host は platform.node() と一致する。"""
    assert _identity.get_host() == platform.node()


def test_event_id_are_distinct_uuid4_strings():
    """#12: event_id を 1000 回呼ぶとすべて相異なり、長さ 36。"""
    ids = [_identity.new_event_id() for _ in range(1000)]
    assert len(ids) == len(set(ids))
    assert all(len(i) == 36 for i in ids)
