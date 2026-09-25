"""user_email / host / event_id の解決とキャッシュを検証する。

`CLAUDE_PLUGIN_DATA` を一時ディレクトリに向けてテストを隔離する。代替経路
（`CLAUDE_PLUGIN_DATA` が無いときの `~/.claude/cc-governance/`）を検査するケースだけ、
`CLAUDE_PLUGIN_DATA` を外したうえで `HOME` を差し替える。
"""

import json
import platform
import subprocess
from pathlib import Path

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


def test_env_var_no_cache(monkeypatch):
    monkeypatch.setenv("CC_GOVERNANCE_USER_EMAIL", "Foo@Example.COM")
    assert _identity.get_user_email() == "foo@example.com"


def test_env_var_called_twice_caches(monkeypatch):
    monkeypatch.setenv("CC_GOVERNANCE_USER_EMAIL", "Foo@Example.COM")
    first = _identity.get_user_email()
    second = _identity.get_user_email()
    assert first == second == "foo@example.com"

    identity_path = _identity._identity_path()
    assert identity_path.exists()
    assert json.loads(identity_path.read_text())["user_email"] == "foo@example.com"


def test_git_config_success(monkeypatch):
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )
    assert _identity.get_user_email() == "bar@example.com"


def test_git_config_empty(monkeypatch):
    monkeypatch.setattr(_identity.subprocess, "run", _fake_run(returncode=0, stdout=""))
    assert _identity.get_user_email() is None


def test_git_config_nonzero_exit(monkeypatch):
    monkeypatch.setattr(_identity.subprocess, "run", _fake_run(returncode=1, stdout=""))
    assert _identity.get_user_email() is None


def test_git_missing(monkeypatch):
    monkeypatch.setattr(_identity.subprocess, "run", _fake_run_missing_git)
    assert _identity.get_user_email() is None


def test_cache_skips_subprocess_on_git_failure(monkeypatch):
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
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )
    cached = _identity.get_user_email()
    assert cached == "bar@example.com"

    monkeypatch.setenv("CC_GOVERNANCE_USER_EMAIL", "Other@Example.com")
    assert _identity.get_user_email() == "other@example.com"


def test_corrupt_cache_is_ignored(monkeypatch):
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
    identity_path = _identity._identity_path()
    assert not identity_path.parent.exists()

    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )
    _identity.get_user_email()

    assert identity_path.exists()


def test_host_matches_platform_node():
    assert _identity.get_host() == platform.node()


def test_event_id_are_distinct_uuid4_strings():
    ids = [_identity.new_event_id() for _ in range(1000)]
    assert len(ids) == len(set(ids))
    assert all(len(i) == 36 for i in ids)


def test_fallback_path_honors_home_override_not_real_home(monkeypatch, tmp_path):
    """CLAUDE_PLUGIN_DATA を外し HOME を差し替えると、
    差し替えた HOME 配下に identity.json が書かれ、本物のホームには書かれない。"""
    real_home_path = Path.home() / ".claude" / "cc-governance" / "identity.json"
    real_home_existed_before = real_home_path.exists()

    monkeypatch.delenv("CLAUDE_PLUGIN_DATA", raising=False)
    fake_home = tmp_path / "fakehome"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )

    _identity.get_user_email()

    expected_path = fake_home / ".claude" / "cc-governance" / "identity.json"
    assert expected_path.exists()
    assert json.loads(expected_path.read_text())["user_email"] == "bar@example.com"

    # 本物のホームは、このテストの前後で状態が変わっていないこと（新規作成もされない）
    assert real_home_path.exists() == real_home_existed_before


def test_unresolved_email_is_not_cached(monkeypatch):
    """解決できなかった結果を固定しない。後から git を設定すれば次の呼び出しで拾う。"""
    monkeypatch.setattr(_identity.subprocess, "run", _fake_run(returncode=0, stdout=""))
    assert _identity.get_user_email() is None
    assert not _identity._identity_path().exists()

    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )
    assert _identity.get_user_email() == "bar@example.com"


def test_null_cache_left_by_older_version_is_resolved(monkeypatch):
    identity_path = _identity._identity_path()
    identity_path.parent.mkdir(parents=True, exist_ok=True)
    identity_path.write_text(json.dumps({"user_email": None}))
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="Bar@Example.com\n")
    )

    assert _identity.get_user_email() == "bar@example.com"


def test_refresh_ignores_cache_and_updates_it(monkeypatch):
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="old@example.com\n")
    )
    _identity.get_user_email()
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="New@Example.com\n")
    )

    assert _identity.get_user_email(refresh=True) == "new@example.com"
    assert _identity.get_user_email() == "new@example.com"


def test_refresh_unresolved_drops_stale_cache(monkeypatch):
    monkeypatch.setattr(
        _identity.subprocess, "run", _fake_run(returncode=0, stdout="old@example.com\n")
    )
    _identity.get_user_email()
    monkeypatch.setattr(_identity.subprocess, "run", _fake_run(returncode=1, stdout=""))

    assert _identity.get_user_email(refresh=True) is None
    assert not _identity._identity_path().exists()
