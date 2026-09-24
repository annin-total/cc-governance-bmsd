"""`_settings.py` が、利用者の設定ファイルを壊さず、1 つの異常で止まらないことを検証する。

計画書のケース表に無い境界を扱う。ここで守るのは「例外を出さない」ことではなく、
**例外を出さず、かつ利用者のファイルを壊さない**ことである。
"""

import json
import os
import sys
from pathlib import Path

import _settings
import policy
import pytest

_PCT_KEY = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"


def _results(rows):
    """(key_name, apply_result) の dict に畳む。"""
    return {key: result for key, _value, _prev, result in rows}


def test_非UTF8のファイルで例外が漏れない(tmp_path):
    """非 UTF-8 のバイト列を含む settings.json で `parse_failed` を返し、ファイルを触らない。

    `UnicodeDecodeError` は `ValueError` 派生で `OSError` ではない。捕まえ損ねると
    SessionStart のたびに例外が漏れ、お知らせも policy イベントも到達しないまま
    その端末が準拠率の分母から静かに消える。
    """
    path = tmp_path / "settings.json"
    raw = b'{"env":{"X":"\x93\xfa\x96{"}}'  # CP932 の「日本」
    path.write_bytes(raw)
    before = path.stat().st_mtime_ns

    rows = _settings.apply_settings(str(path), policy, tmp_path / "governance")

    assert set(_results(rows).values()) == {"parse_failed"}
    assert path.read_bytes() == raw
    assert path.stat().st_mtime_ns == before


def test_深い入れ子のJSONで例外が漏れない(tmp_path):
    """再帰上限を超える入れ子の JSON で `parse_failed` を返す（`RecursionError` は ValueError 派生ではない）。"""
    path = tmp_path / "settings.json"
    # トップレベルが dict になる形にする。list にすると `isinstance(data, dict)` の
    # 検査で先に落ち、RecursionError を捕まえていなくてもテストが通ってしまう。
    depth = sys.getrecursionlimit() * 10
    raw = ('{"a":' * depth) + "1" + ("}" * depth)
    path.write_text(raw, encoding="utf-8")

    rows = _settings.apply_settings(str(path), policy, tmp_path / "governance")

    assert set(_results(rows).values()) == {"parse_failed"}
    assert path.read_text(encoding="utf-8") == raw


@pytest.mark.skipif(os.name == "nt", reason="symlink の作成に特権が要る")
def test_シンボリックリンクを壊さず実体に書く(tmp_path):
    """settings.json がシンボリックリンクでも、リンクのまま実体側が書き換わる。

    `os.replace` はリンクそのものを置き換える。解決しないと dotfiles 管理下の端末で
    リンクが普通のファイルに化け、実体は古い内容のまま取り残される。しかも結果は
    `applied` と記録されるため、壊れたことが画面から分からない。
    """
    real = tmp_path / "real.json"
    real.write_text("{}", encoding="utf-8")
    link = tmp_path / "settings.json"
    link.symlink_to(real)

    rows = _settings.apply_settings(str(link), policy, tmp_path / "governance")

    assert _results(rows)[_PCT_KEY] == "applied"
    assert link.is_symlink(), "リンクが普通のファイルに置き換わった"
    assert (
        json.loads(real.read_text(encoding="utf-8"))["env"][
            "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
        ]
        == "60"
    ), "実体側に書かれていない"


def test_一時ファイルを対象と同じディレクトリに作る(tmp_path, monkeypatch):
    """一時ファイルを対象ファイルと同じディレクトリに作る。

    別ディレクトリ（`$TMPDIR` 等）に作ると、ホームが別ファイルシステムの端末で
    `os.replace` がクロスデバイスで失敗し、恒久的に `write_failed` になる。
    """
    path = tmp_path / "sub" / "settings.json"
    path.parent.mkdir()
    path.write_text("{}", encoding="utf-8")

    seen = []
    real_mkstemp = _settings.tempfile.mkstemp

    def _spy(*args, **kwargs):
        seen.append(kwargs.get("dir"))
        return real_mkstemp(*args, **kwargs)

    monkeypatch.setattr(_settings.tempfile, "mkstemp", _spy)
    _settings.apply_settings(str(path), policy, tmp_path / "governance")

    assert seen, "一時ファイルが作られていない"
    assert [Path(d).resolve() for d in seen] == [path.parent.resolve()] * len(seen)


def test_envがdictでないときファイルを触らない(tmp_path):
    """`{"env":"proxy"}` で 2 キーとも `skipped_missing` になり、ファイルが不変である。

    戻り値だけを縛ると、途中の型検査を落としても通る。ここでファイル不変まで縛る。
    """
    path = tmp_path / "settings.json"
    raw = '{"env":"proxy"}'
    path.write_text(raw, encoding="utf-8")
    before = path.stat().st_mtime_ns

    rows = _settings.apply_settings(str(path), policy, tmp_path / "governance")

    assert set(_results(rows).values()) == {"skipped_missing"}
    assert path.read_text(encoding="utf-8") == raw
    assert path.stat().st_mtime_ns == before
    assert len(list(path.parent.iterdir())) == 1


def test_真偽値と整数を同一視しない(tmp_path):
    """`autoUpdate` が `1`（整数）のとき、`True` と等価でも `applied` にする。

    Python では `1 == True` が真である。素の `==` で比べると、整数の 1 が入った端末を
    準拠済みと誤認し、JSON 上は `true` でない値が残り続ける。
    """
    path = tmp_path / "settings.json"
    path.write_text(
        json.dumps(
            {
                "extraKnownMarketplaces": {
                    "cc-marketplace-governance-bmsd": {"autoUpdate": 1}
                }
            }
        ),
        encoding="utf-8",
    )

    rows = _settings.apply_settings(str(path), policy, tmp_path / "governance")
    auto_key = next(k for k in policy.SET if k.endswith("autoUpdate"))

    assert _results(rows)[auto_key] == "applied"
    written = json.loads(path.read_text(encoding="utf-8"))
    assert (
        written["extraKnownMarketplaces"]["cc-marketplace-governance-bmsd"][
            "autoUpdate"
        ]
        is True
    )
