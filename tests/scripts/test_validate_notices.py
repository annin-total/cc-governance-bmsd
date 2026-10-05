"""`validate_plugin.py` の notices.json 検査は、壊れた notices.json で NG になる。"""

import json
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "scripts"))

from plugin_checks import notices, report

_VALID = {
    "id": "n-1",
    "title": "件名",
    "body": "本文",
    "label": "詳細",
    "url": "https://example.com/a",
}


def _check(tmp_path, monkeypatch, content) -> bool:
    """notices.json に `content`（文字列ならそのまま、他は JSON）を書いて検査し、NG なら真を返す。"""
    monkeypatch.setattr(report, "FAIL", False)
    text = content if isinstance(content, str) else json.dumps(content)
    (tmp_path / "notices.json").write_text(text, encoding="utf-8")
    notices.check_notices_json(tmp_path)
    return report.FAIL


@pytest.mark.parametrize(
    "content",
    [
        [],
        [_VALID],
        [{"id": "a", "title": "t", "body": ""}],
        [{"id": "a", "title": "t", "body": "b", "url": "https://example.com"}],
        [{"id": f"n-{i}", "title": "t", "body": "b"} for i in range(26)],
    ],
    ids=["empty", "full", "no_url", "url_no_label", "max_count"],
)
def test_正しいnotices_jsonはOK(tmp_path, monkeypatch, content):
    assert not _check(tmp_path, monkeypatch, content)


@pytest.mark.parametrize(
    "content",
    [
        "{not json",
        {"id": "a"},
        ["a"],
        [{"title": "t"}],
        [{"id": 1}],
        [{"id": ""}],
        [_VALID, _VALID],
        [{**_VALID, "title": 1}],
        [{**_VALID, "body": None}],
        [{"id": "a", "body": "b"}],
        [{"id": "a", "title": "t"}],
        [{**_VALID, "label": 1}],
        [{**_VALID, "url": 1}],
        [{**_VALID, "url": "http://example.com"}],
        [{**_VALID, "url": "https://"}],
        [{**_VALID, "url": "javascript:alert(1)"}],
        [{**_VALID, "url": ""}],
        [{**_VALID, "url": "https://example.com/a b"}],
        [{**_VALID, "url": "https://example.com/日本"}],
        [{**_VALID, "url": "https://example.com/" + "a" * 2048}],
        [{"id": f"n-{i}", "title": "t", "body": "b"} for i in range(27)],
    ],
    ids=[
        "broken_json",
        "not_array",
        "item_not_object",
        "no_id",
        "id_not_string",
        "id_empty",
        "id_duplicate",
        "title_not_string",
        "body_null",
        "no_title",
        "no_body",
        "label_not_string",
        "url_not_string",
        "url_http",
        "url_no_host",
        "url_javascript",
        "url_empty",
        "url_space",
        "url_non_ascii",
        "url_too_long",
        "too_many",
    ],
)
def test_壊れたnotices_jsonはNG(tmp_path, monkeypatch, content):
    assert _check(tmp_path, monkeypatch, content)


def test_notices_jsonが無ければNG(tmp_path, monkeypatch):
    monkeypatch.setattr(report, "FAIL", False)
    notices.check_notices_json(tmp_path)
    assert report.FAIL


def test_同梱のnotices_jsonはOK(monkeypatch):
    monkeypatch.setattr(report, "FAIL", False)
    notices.check_notices_json(_ROOT / "plugin")
    assert not report.FAIL
