"""`_settings.py` の TDD。settings.json はすべて tmp_path 配下に作る。

利用者本人の `~/.claude/settings.json` には一切触れない。
"""

import json
import os

import _settings
import policy
import pytest

PCT_KEY = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
AUTOUPDATE_KEY = "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate"


def _write_settings(tmp_path, content):
    """`content` を settings.json として書き、パスを返す。"""
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(content), encoding="utf-8")
    return path


def _apply(path):
    """現行の policy.py を適用する。バックアップと ONCE の記録は settings.json の隣に置く。"""
    return _settings.apply_settings(path, policy, path.parent / "governance")


def _entries(tmp_path):
    """tmp_path 直下のうち、governance/（バックアップ等の置き場）を除いたもの。"""
    return [p for p in tmp_path.iterdir() if p.name != "governance"]


def _rows_by_key(rows):
    """apply_settings の戻り値をキー名で引ける dict にする。"""
    return {row[0]: row for row in rows}


# ---- タスク 2: 読み取りと prev_value の解決 ----


_NO_FILE = object()

# (settings.json の内容, PCT_KEY の prev_value, AUTOUPDATE_KEY の prev_value)。_NO_FILE は書かない。
_READ_CASES = {
    "empty_object": ({}, None, None),
    "missing_file": (_NO_FILE, None, None),
    "pct_only": ({"env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "80"}}, "80", None),
    "both_already_policy_values": (
        {
            "env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"},
            "extraKnownMarketplaces": {
                "cc-marketplace-governance-bmsd": {"autoUpdate": True}
            },
        },
        "60",
        "true",
    ),
    "false_is_not_missing": (
        {
            "extraKnownMarketplaces": {
                "cc-marketplace-governance-bmsd": {"autoUpdate": False}
            }
        },
        None,
        "false",
    ),
    "numeric_pct": ({"env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": 60}}, "60", None),
    "env_not_dict": ({"env": "proxy"}, None, None),
    "env_empty": ({"env": {}}, None, None),
}


def _assert_prev(actual, expected):
    """期待値が None なら `is None`、それ以外は `==` で比べる。"""
    if expected is None:
        assert actual is None
    else:
        assert actual == expected


@pytest.mark.parametrize(
    ("content", "pct_prev", "autoupdate_prev"),
    _READ_CASES.values(),
    ids=_READ_CASES.keys(),
)
def test_read_prev_value(tmp_path, content, pct_prev, autoupdate_prev):
    if content is _NO_FILE:
        path = tmp_path / "settings.json"
    else:
        path = _write_settings(tmp_path, content)
    rows = _rows_by_key(_apply(path))
    _assert_prev(rows[PCT_KEY][2], pct_prev)
    _assert_prev(rows[AUTOUPDATE_KEY][2], autoupdate_prev)


# ---- タスク 3: 差分がなければ書かない ----

_BASELINE_ALREADY_OK = {
    "env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"},
    "extraKnownMarketplaces": {"cc-marketplace-governance-bmsd": {"autoUpdate": True}},
}


def test_already_ok_3_1_both_match(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_ALREADY_OK)
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][3] == "already_ok"
    assert rows[AUTOUPDATE_KEY][3] == "already_ok"


def test_already_ok_3_2_mtime_bit_exact(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_ALREADY_OK)
    os.utime(path, ns=(123_000_000_000, 456_000_000_000))
    before = path.stat().st_mtime_ns
    _apply(path)
    assert path.stat().st_mtime_ns == before


def test_already_ok_3_3_bytes_unchanged(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_ALREADY_OK)
    before = path.read_bytes()
    _apply(path)
    assert path.read_bytes() == before


def test_already_ok_3_4_no_tmp_file_left(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_ALREADY_OK)
    _apply(path)
    assert len(list(tmp_path.iterdir())) == 1


def test_already_ok_3_5_partial_diff_writes_only_that_key(tmp_path):
    content = {
        "env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"},
        "extraKnownMarketplaces": {
            "cc-marketplace-governance-bmsd": {"autoUpdate": False}
        },
    }
    path = _write_settings(tmp_path, content)
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][3] == "already_ok"
    assert rows[AUTOUPDATE_KEY][3] == "applied"


def test_already_ok_3_6_numeric_pct_is_applied(tmp_path):
    path = _write_settings(tmp_path, {"env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": 60}})
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][3] == "applied"


def test_already_ok_3_7_no_writable_diff_leaves_mtime(tmp_path):
    path = _write_settings(tmp_path, {"env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"}})
    os.utime(path, ns=(123_000_000_000, 456_000_000_000))
    before = path.stat().st_mtime_ns
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][3] == "already_ok"
    assert rows[AUTOUPDATE_KEY][3] == "skipped_missing"
    assert path.stat().st_mtime_ns == before


# ---- タスク 4: 適用（既存設定の保全・入れ子への書き込み・原子的置換） ----

_BASELINE_APPLY = {
    "model": "opus",
    "permissions": {"allow": ["Bash(ls:*)"]},
    "env": {"HTTP_PROXY": "http://proxy.example:8080"},
    "statusLine": {"type": "command", "command": "echo hi"},
}


def test_apply_4_1_top_level_keys_preserved(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_APPLY)
    _apply(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert set(data.keys()) == {"model", "permissions", "env", "statusLine"}


def test_apply_4_2_untouched_values_preserved(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_APPLY)
    _apply(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["model"] == "opus"
    assert data["permissions"] == {"allow": ["Bash(ls:*)"]}
    assert data["statusLine"] == {"type": "command", "command": "echo hi"}


def test_apply_4_3_env_keys_and_http_proxy_preserved(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_APPLY)
    _apply(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert set(data["env"].keys()) == {"HTTP_PROXY", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"}
    assert data["env"]["HTTP_PROXY"] == "http://proxy.example:8080"


def test_apply_4_4_pct_applied_autoupdate_skipped(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_APPLY)
    rows = _rows_by_key(_apply(path))
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["env"]["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] == "60"
    assert rows[AUTOUPDATE_KEY][3] == "skipped_missing"
    assert "extraKnownMarketplaces" not in data


def test_apply_4_5_env_section_created(tmp_path):
    path = _write_settings(tmp_path, {})
    _apply(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert list(data.keys()) == ["env"]
    assert data["env"] == {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"}


def test_apply_4_6_file_created_when_missing(tmp_path):
    path = tmp_path / "settings.json"
    rows = _rows_by_key(_apply(path))
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["env"] == {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"}
    assert rows[PCT_KEY][3] == "applied"
    assert rows[AUTOUPDATE_KEY][3] == "skipped_missing"


def test_apply_4_7_valid_json_with_trailing_newline(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_APPLY)
    _apply(path)
    text = path.read_text(encoding="utf-8")
    json.loads(text)
    assert text.endswith("\n")
    assert not text.endswith("\n\n")


def test_apply_4_8_no_tmp_file_left(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_APPLY)
    _apply(path)
    assert len(_entries(tmp_path)) == 1


def test_apply_4_9_replace_failure_leaves_original(tmp_path, monkeypatch):
    path = _write_settings(tmp_path, _BASELINE_APPLY)
    before_bytes = path.read_bytes()
    before_mtime = path.stat().st_mtime_ns

    def _raise(*args, **kwargs):
        raise OSError("boom")

    monkeypatch.setattr(_settings.os, "replace", _raise)
    rows = _rows_by_key(_apply(path))

    assert path.read_bytes() == before_bytes
    assert path.stat().st_mtime_ns == before_mtime
    assert len(_entries(tmp_path)) == 1
    assert rows[PCT_KEY][3] == "write_failed"


def test_apply_4_10_tmp_write_failure_leaves_original(tmp_path, monkeypatch):
    path = _write_settings(tmp_path, _BASELINE_APPLY)
    before_bytes = path.read_bytes()
    before_mtime = path.stat().st_mtime_ns

    def _raise(*args, **kwargs):
        raise OSError("boom")

    monkeypatch.setattr(_settings.json, "dumps", _raise)
    rows = _rows_by_key(_apply(path))

    assert path.read_bytes() == before_bytes
    assert path.stat().st_mtime_ns == before_mtime
    assert len(list(tmp_path.iterdir())) == 1
    assert rows[PCT_KEY][3] == "write_failed"


def test_apply_4_11_existing_marketplace_entry_already_ok(tmp_path):
    content = dict(_BASELINE_APPLY)
    content["extraKnownMarketplaces"] = {
        "cc-marketplace-governance-bmsd": {
            "source": {"source": "github", "repo": "x/y"},
            "autoUpdate": True,
        }
    }
    path = _write_settings(tmp_path, content)
    rows = _rows_by_key(_apply(path))
    data = json.loads(path.read_text(encoding="utf-8"))
    assert rows[AUTOUPDATE_KEY][3] == "already_ok"
    assert rows[PCT_KEY][3] == "applied"
    entry = data["extraKnownMarketplaces"]["cc-marketplace-governance-bmsd"]
    assert entry["autoUpdate"] is True
    assert entry["source"] == {"source": "github", "repo": "x/y"}


def test_apply_4_12_autoupdate_restored_siblings_preserved(tmp_path):
    content = dict(_BASELINE_APPLY)
    content["extraKnownMarketplaces"] = {
        "other-marketplace": {"autoUpdate": True},
        "cc-marketplace-governance-bmsd": {
            "source": {"source": "github", "repo": "x/y"},
            "autoUpdate": False,
        },
    }
    path = _write_settings(tmp_path, content)
    rows = _rows_by_key(_apply(path))
    data = json.loads(path.read_text(encoding="utf-8"))
    assert rows[AUTOUPDATE_KEY][3] == "applied"
    marketplaces = data["extraKnownMarketplaces"]
    assert marketplaces["other-marketplace"] == {"autoUpdate": True}
    entry = marketplaces["cc-marketplace-governance-bmsd"]
    assert entry["autoUpdate"] is True
    assert entry["source"] == {"source": "github", "repo": "x/y"}


def test_apply_4_13_no_extraknownmarketplaces_section_at_all(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_APPLY)
    rows = _rows_by_key(_apply(path))
    data = json.loads(path.read_text(encoding="utf-8"))
    assert rows[AUTOUPDATE_KEY][3] == "skipped_missing"
    assert "extraKnownMarketplaces" not in data


def test_apply_4_14_entry_missing_not_created(tmp_path):
    content = dict(_BASELINE_APPLY)
    content["extraKnownMarketplaces"] = {
        "other-marketplace": {
            "source": {"source": "github", "repo": "x/y"},
            "autoUpdate": True,
        }
    }
    path = _write_settings(tmp_path, content)
    rows = _rows_by_key(_apply(path))
    data = json.loads(path.read_text(encoding="utf-8"))
    assert rows[AUTOUPDATE_KEY][3] == "skipped_missing"
    marketplaces = data["extraKnownMarketplaces"]
    assert "cc-marketplace-governance-bmsd" not in marketplaces
    assert marketplaces["other-marketplace"] == {
        "source": {"source": "github", "repo": "x/y"},
        "autoUpdate": True,
    }


def test_apply_4_15_leaf_missing_is_not_entry_missing(tmp_path):
    content = dict(_BASELINE_APPLY)
    content["extraKnownMarketplaces"] = {
        "cc-marketplace-governance-bmsd": {
            "source": {"source": "github", "repo": "x/y"}
        }
    }
    path = _write_settings(tmp_path, content)
    rows = _rows_by_key(_apply(path))
    data = json.loads(path.read_text(encoding="utf-8"))
    assert rows[AUTOUPDATE_KEY][3] == "applied"
    entry = data["extraKnownMarketplaces"]["cc-marketplace-governance-bmsd"]
    assert entry["autoUpdate"] is True
    assert entry["source"] == {"source": "github", "repo": "x/y"}


# ---- タスク 5: mtime の衝突とパース失敗 ----

_CONFLICT_INPUT = {
    "model": "opus",
    "extraKnownMarketplaces": {
        "cc-marketplace-governance-bmsd": {
            "source": {"source": "github", "repo": "x/y"}
        }
    },
}


def _interrupt_after_read(monkeypatch, path, new_content):
    """置換直前（一時ファイル作成時）に、テスト側が別内容で settings.json を上書きする。"""
    original_mkstemp = _settings.tempfile.mkstemp

    def _mkstemp(*args, **kwargs):
        path.write_text(json.dumps(new_content), encoding="utf-8")
        os.utime(path, ns=(999_000_000_000, 999_000_000_000))
        return original_mkstemp(*args, **kwargs)

    monkeypatch.setattr(_settings.tempfile, "mkstemp", _mkstemp)


def test_conflict_5_1_both_skipped(tmp_path, monkeypatch):
    path = _write_settings(tmp_path, _CONFLICT_INPUT)
    _interrupt_after_read(monkeypatch, path, {"model": "sonnet"})
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][3] == "skipped_conflict"
    assert rows[AUTOUPDATE_KEY][3] == "skipped_conflict"


def test_conflict_5_2_file_keeps_interrupted_content(tmp_path, monkeypatch):
    path = _write_settings(tmp_path, _CONFLICT_INPUT)
    _interrupt_after_read(monkeypatch, path, {"model": "sonnet"})
    _apply(path)
    assert json.loads(path.read_text(encoding="utf-8")) == {"model": "sonnet"}


def test_conflict_5_3_prev_value_is_read_time_value(tmp_path, monkeypatch):
    path = _write_settings(tmp_path, _CONFLICT_INPUT)
    _interrupt_after_read(monkeypatch, path, {"model": "sonnet"})
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][2] is None
    assert rows[AUTOUPDATE_KEY][2] is None


def test_conflict_5_4_no_tmp_file_left(tmp_path, monkeypatch):
    path = _write_settings(tmp_path, _CONFLICT_INPUT)
    _interrupt_after_read(monkeypatch, path, {"model": "sonnet"})
    _apply(path)
    assert len(list(tmp_path.iterdir())) == 1


def test_conflict_5_5_same_content_different_mtime(tmp_path, monkeypatch):
    path = _write_settings(tmp_path, _CONFLICT_INPUT)
    _interrupt_after_read(monkeypatch, path, _CONFLICT_INPUT)
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][3] == "skipped_conflict"
    assert rows[AUTOUPDATE_KEY][3] == "skipped_conflict"


def test_parse_failed_5_6_truncated_json(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text('{"model":"opus"', encoding="utf-8")
    before_bytes = path.read_bytes()
    before_mtime = path.stat().st_mtime_ns
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][3] == "parse_failed"
    assert rows[AUTOUPDATE_KEY][3] == "parse_failed"
    assert path.read_bytes() == before_bytes
    assert path.stat().st_mtime_ns == before_mtime


def test_parse_failed_5_7_prev_value_none_no_exception(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text('{"model":"opus"', encoding="utf-8")
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][2] is None
    assert rows[AUTOUPDATE_KEY][2] is None


def test_parse_failed_5_8_empty_file(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text("", encoding="utf-8")
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][3] == "parse_failed"
    assert path.read_bytes() == b""


def test_parse_failed_5_9_top_level_list(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text("[1,2,3]", encoding="utf-8")
    before_bytes = path.read_bytes()
    rows = _rows_by_key(_apply(path))
    assert rows[PCT_KEY][3] == "parse_failed"
    assert path.read_bytes() == before_bytes


def test_parse_failed_5_10_unreadable_file(tmp_path):
    path = _write_settings(tmp_path, {"model": "opus"})
    os.chmod(path, 0o000)
    try:
        rows = _rows_by_key(_apply(path))
    finally:
        os.chmod(path, 0o600)
    assert rows[PCT_KEY][3] == "parse_failed"


# ---- タスク 6: apply_result の 6 通りが揃うことの確認 ----


def _result_6_1(tmp_path):
    path = _write_settings(tmp_path, {})
    return _rows_by_key(_apply(path))


def _result_6_2(tmp_path):
    path = _write_settings(tmp_path, {"env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "80"}})
    return _rows_by_key(_apply(path))


def _result_6_3(tmp_path):
    path = _write_settings(tmp_path, _BASELINE_ALREADY_OK)
    return _rows_by_key(_apply(path))


def _result_6_4(tmp_path, monkeypatch):
    path = _write_settings(tmp_path, _CONFLICT_INPUT)
    _interrupt_after_read(monkeypatch, path, {"model": "sonnet"})
    return _rows_by_key(_apply(path))


def _result_6_5(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text('{"model":"opus"', encoding="utf-8")
    return _rows_by_key(_apply(path))


def _result_6_6(tmp_path, monkeypatch):
    path = _write_settings(tmp_path, {})

    def _raise(*args, **kwargs):
        raise OSError("boom")

    monkeypatch.setattr(_settings.os, "replace", _raise)
    return _rows_by_key(_apply(path))


def _result_6_7(tmp_path):
    path = _write_settings(tmp_path, {})
    return _rows_by_key(_apply(path))


def test_result_6_1_applied(tmp_path):
    rows = _result_6_1(tmp_path)
    assert rows[PCT_KEY][2] is None
    assert rows[PCT_KEY][3] == "applied"


def test_result_6_2_applied_with_prev(tmp_path):
    rows = _result_6_2(tmp_path)
    assert rows[PCT_KEY][2] == "80"
    assert rows[PCT_KEY][3] == "applied"


def test_result_6_3_already_ok(tmp_path):
    rows = _result_6_3(tmp_path)
    assert rows[PCT_KEY][2] == "60"
    assert rows[PCT_KEY][3] == "already_ok"


def test_result_6_4_skipped_conflict(tmp_path, monkeypatch):
    rows = _result_6_4(tmp_path, monkeypatch)
    assert rows[PCT_KEY][2] is None
    assert rows[PCT_KEY][3] == "skipped_conflict"


def test_result_6_5_parse_failed(tmp_path):
    rows = _result_6_5(tmp_path)
    assert rows[PCT_KEY][2] is None
    assert rows[PCT_KEY][3] == "parse_failed"


def test_result_6_6_write_failed(tmp_path, monkeypatch):
    rows = _result_6_6(tmp_path, monkeypatch)
    assert rows[PCT_KEY][2] is None
    assert rows[PCT_KEY][3] == "write_failed"


def test_result_6_7_skipped_missing(tmp_path):
    rows = _result_6_7(tmp_path)
    assert rows[AUTOUPDATE_KEY][3] == "skipped_missing"
    assert rows[PCT_KEY][3] == "applied"


def test_result_6_8_all_six_apply_results_observed(tmp_path, monkeypatch):
    all_rows = []
    dirs = [tmp_path / str(i) for i in range(7)]
    for d in dirs:
        d.mkdir()
    all_rows += list(_result_6_1(dirs[0]).values())
    all_rows += list(_result_6_2(dirs[1]).values())
    all_rows += list(_result_6_3(dirs[2]).values())
    all_rows += list(_result_6_4(dirs[3], monkeypatch).values())
    all_rows += list(_result_6_5(dirs[4]).values())
    all_rows += list(_result_6_6(dirs[5], monkeypatch).values())
    all_rows += list(_result_6_7(dirs[6]).values())

    observed = {row[3] for row in all_rows}
    assert observed == {
        "already_ok",
        "applied",
        "skipped_conflict",
        "skipped_missing",
        "parse_failed",
        "write_failed",
    }


def test_result_6_9_value_is_always_policy_value(tmp_path, monkeypatch):
    dirs = [tmp_path / str(i) for i in range(7)]
    for d in dirs:
        d.mkdir()
    results = [
        _result_6_1(dirs[0]),
        _result_6_2(dirs[1]),
        _result_6_3(dirs[2]),
        _result_6_4(dirs[3], monkeypatch),
        _result_6_5(dirs[4]),
        _result_6_6(dirs[5], monkeypatch),
        _result_6_7(dirs[6]),
    ]
    for rows in results:
        assert rows[PCT_KEY][1] == "60"
        assert rows[AUTOUPDATE_KEY][1] == "true"
