"""`_settings.py` の TDD。settings.json はすべて tmp_path 配下に作る。

利用者本人の `~/.claude/settings.json` には一切触れない。
"""

import json
import os

import pytest

import _settings
from contract import POLICY

PCT_KEY = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
AUTOUPDATE_KEY = "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate"


def _write_settings(tmp_path, content):
    """`content` を settings.json として書き、パスを返す。"""
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(content), encoding="utf-8")
    return path


def _rows_by_key(rows):
    """apply_settings の戻り値をキー名で引ける dict にする。"""
    return {row[0]: row for row in rows}


# ---- タスク 2: 読み取りと prev_value の解決 ----


def test_read_2_1_empty_object(tmp_path):
    path = _write_settings(tmp_path, {})
    rows = _rows_by_key(_settings.apply_settings(path, POLICY))
    assert rows[PCT_KEY][2] is None
    assert rows[AUTOUPDATE_KEY][2] is None


def test_read_2_2_missing_file(tmp_path):
    path = tmp_path / "settings.json"
    rows = _rows_by_key(_settings.apply_settings(path, POLICY))
    assert rows[PCT_KEY][2] is None
    assert rows[AUTOUPDATE_KEY][2] is None


def test_read_2_3_pct_only(tmp_path):
    path = _write_settings(tmp_path, {"env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "80"}})
    rows = _rows_by_key(_settings.apply_settings(path, POLICY))
    assert rows[PCT_KEY][2] == "80"
    assert rows[AUTOUPDATE_KEY][2] is None


def test_read_2_4_both_already_policy_values(tmp_path):
    path = _write_settings(
        tmp_path,
        {
            "env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"},
            "extraKnownMarketplaces": {"cc-marketplace-governance-bmsd": {"autoUpdate": True}},
        },
    )
    rows = _rows_by_key(_settings.apply_settings(path, POLICY))
    assert rows[PCT_KEY][2] == "60"
    assert rows[AUTOUPDATE_KEY][2] == "true"


def test_read_2_5_false_is_not_missing(tmp_path):
    path = _write_settings(
        tmp_path,
        {"extraKnownMarketplaces": {"cc-marketplace-governance-bmsd": {"autoUpdate": False}}},
    )
    rows = _rows_by_key(_settings.apply_settings(path, POLICY))
    assert rows[PCT_KEY][2] is None
    assert rows[AUTOUPDATE_KEY][2] == "false"


def test_read_2_6_numeric_pct(tmp_path):
    path = _write_settings(tmp_path, {"env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": 60}})
    rows = _rows_by_key(_settings.apply_settings(path, POLICY))
    assert rows[PCT_KEY][2] == "60"
    assert rows[AUTOUPDATE_KEY][2] is None


def test_read_2_7_env_not_dict(tmp_path):
    path = _write_settings(tmp_path, {"env": "proxy"})
    rows = _rows_by_key(_settings.apply_settings(path, POLICY))
    assert rows[PCT_KEY][2] is None
    assert rows[AUTOUPDATE_KEY][2] is None


def test_read_2_8_env_empty(tmp_path):
    path = _write_settings(tmp_path, {"env": {}})
    rows = _rows_by_key(_settings.apply_settings(path, POLICY))
    assert rows[PCT_KEY][2] is None
    assert rows[AUTOUPDATE_KEY][2] is None
