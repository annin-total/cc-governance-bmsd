"""`_browser.py` の起動形態判定とブラウザ起動処理を検証する。

`subprocess.Popen` / `os.startfile` / `sys.platform` はすべて monkeypatch で差し替え、
本物のブラウザを絶対に開かない（`tests/conftest.py` が `CLAUDE_CODE_ENTRYPOINT` を消す）。
"""

import subprocess

import _browser
import pytest

# ---- is_interactive / is_headless ----


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("cli", True),
        ("sdk-cli", False),
        ("sdk-ts", False),
        ("sdk-py", False),
        ("claude-vscode", False),
        ("", False),
        (None, False),
    ],
)
def test_is_interactive_by_entrypoint(monkeypatch, value, expected):
    """#1: CLAUDE_CODE_ENTRYPOINT の値ごとに is_interactive の真偽が変わる。cli だけ真。"""
    if value is None:
        monkeypatch.delenv("CLAUDE_CODE_ENTRYPOINT", raising=False)
    else:
        monkeypatch.setenv("CLAUDE_CODE_ENTRYPOINT", value)
    assert _browser.is_interactive() is expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("cli", False),
        ("sdk-cli", True),
        ("sdk-ts", True),
        ("sdk-py", True),
        ("claude-vscode", False),
        ("", False),
        (None, False),
    ],
)
def test_is_headless_by_entrypoint(monkeypatch, value, expected):
    """#2: CLAUDE_CODE_ENTRYPOINT の値ごとに is_headless の真偽が変わる。sdk- 接頭辞だけ真。"""
    if value is None:
        monkeypatch.delenv("CLAUDE_CODE_ENTRYPOINT", raising=False)
    else:
        monkeypatch.setenv("CLAUDE_CODE_ENTRYPOINT", value)
    assert _browser.is_headless() is expected


# ---- open_url: darwin ----


class _FakePopen:
    """subprocess.Popen の偽物。呼び出し引数を記録するだけ。"""

    def __init__(self, args, **kwargs):
        self.args = args
        self.kwargs = kwargs


def test_open_url_darwin_uses_popen_with_detach_flags(monkeypatch):
    """#4: darwin では Popen が ["open", url] という配列で、DEVNULL 3 つと start_new_session=True で呼ばれる。"""
    monkeypatch.setattr(_browser.sys, "platform", "darwin")
    calls = []

    def fake_popen(args, **kwargs):
        calls.append((args, kwargs))
        return _FakePopen(args, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    _browser.open_url("https://example.com/path")

    assert len(calls) == 1
    args, kwargs = calls[0]
    assert args == ["open", "https://example.com/path"]
    assert kwargs["stdin"] is subprocess.DEVNULL
    assert kwargs["stdout"] is subprocess.DEVNULL
    assert kwargs["stderr"] is subprocess.DEVNULL
    assert kwargs["start_new_session"] is True
    assert "shell" not in kwargs


def test_open_url_darwin_query_with_ampersand_stays_one_argument(monkeypatch):
    """#5: `&` を含むクエリの URL が分断されず、Popen の args の要素 1 個として渡る（シェルを通さない）。"""
    monkeypatch.setattr(_browser.sys, "platform", "darwin")
    calls = []
    monkeypatch.setattr(
        subprocess,
        "Popen",
        lambda args, **kwargs: (
            calls.append((args, kwargs)) or _FakePopen(args, **kwargs)
        ),
    )

    url = "https://example.com/?a=1&b=2&rm=-rf"
    _browser.open_url(url)

    args, _ = calls[0]
    assert args == ["open", url]
    assert len(args) == 2


def test_open_url_darwin_popen_oserror_does_not_raise(monkeypatch):
    """#6: darwin で Popen が OSError を投げても open_url からは例外が漏れない。"""
    monkeypatch.setattr(_browser.sys, "platform", "darwin")

    def raiser(*_args, **_kwargs):
        raise OSError("boom")

    monkeypatch.setattr(subprocess, "Popen", raiser)

    _browser.open_url("https://example.com")


def test_open_url_darwin_popen_valueerror_does_not_raise(monkeypatch):
    """#7: darwin で Popen が ValueError を投げても open_url からは例外が漏れない。"""
    monkeypatch.setattr(_browser.sys, "platform", "darwin")

    def raiser(*_args, **_kwargs):
        raise ValueError("boom")

    monkeypatch.setattr(subprocess, "Popen", raiser)

    _browser.open_url("https://example.com")


# ---- open_url: win32 ----


def test_open_url_win32_uses_startfile_and_not_popen(monkeypatch):
    """#8: win32 では os.startfile が URL 1 個で 1 回呼ばれ、Popen は呼ばれない。"""
    import os

    monkeypatch.setattr(_browser.sys, "platform", "win32")
    calls = []
    monkeypatch.setattr(os, "startfile", lambda url: calls.append(url), raising=False)
    popen_calls = []
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: popen_calls.append((a, k)))

    _browser.open_url("https://example.com/path?x=1")

    assert calls == ["https://example.com/path?x=1"]
    assert popen_calls == []


def test_open_url_win32_startfile_oserror_does_not_raise(monkeypatch):
    """#9: win32 で os.startfile が OSError を投げても open_url からは例外が漏れない。"""
    import os

    monkeypatch.setattr(_browser.sys, "platform", "win32")

    def raiser(_url):
        raise OSError("boom")

    monkeypatch.setattr(os, "startfile", raiser, raising=False)

    _browser.open_url("https://example.com")


def test_open_url_win32_startfile_valueerror_does_not_raise(monkeypatch):
    """#10: win32 で os.startfile が ValueError を投げても open_url からは例外が漏れない。"""
    import os

    monkeypatch.setattr(_browser.sys, "platform", "win32")

    def raiser(_url):
        raise ValueError("boom")

    monkeypatch.setattr(os, "startfile", raiser, raising=False)

    _browser.open_url("https://example.com")


# ---- open_url: それ以外の OS ----


def test_open_url_linux_calls_nothing(monkeypatch):
    """#11: linux では Popen も os.startfile も呼ばれない（何もしない）。"""
    import os

    monkeypatch.setattr(_browser.sys, "platform", "linux")
    popen_calls = []
    startfile_calls = []
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: popen_calls.append((a, k)))
    monkeypatch.setattr(
        os, "startfile", lambda *a, **k: startfile_calls.append((a, k)), raising=False
    )

    _browser.open_url("https://example.com")

    assert popen_calls == []
    assert startfile_calls == []
