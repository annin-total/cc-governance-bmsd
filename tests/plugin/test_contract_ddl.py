"""ddl() による 3 テーブルの CREATE TABLE 文の組み立てを検証する。"""

import sqlite3

import contract
import pytest


def test_ddl_returns_three_statements_for_three_tables():
    """返る文は 3 つで、events / policy_state / cost_daily を対象とする。"""
    statements = contract.ddl()
    assert len(statements) == 3
    joined = " ".join(statements)
    assert "events" in joined
    assert "policy_state" in joined
    assert "cost_daily" in joined


def test_ddl_statements_start_with_create_table_if_not_exists():
    """3 文はいずれも CREATE TABLE IF NOT EXISTS で始まる。"""
    for statement in contract.ddl():
        assert statement.startswith("CREATE TABLE IF NOT EXISTS")


def test_ddl_has_no_constraints():
    """主キー・外部キー・NOT NULL・DEFAULT を一切含まない。"""
    joined = " ".join(contract.ddl())
    for forbidden in (
        "PRIMARY KEY",
        "UNIQUE",
        "FOREIGN KEY",
        "AUTOINCREMENT",
        "AUTO_INCREMENT",
        "NOT NULL",
        "DEFAULT",
    ):
        assert forbidden not in joined


def _table_columns(conn, table_name):
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return [row[1] for row in rows]


def test_events_columns_are_extra_columns_then_hook_fields():
    """events の列名が EXTRA_COLUMNS + HOOK_FIELDS の順と一致する。"""
    conn = sqlite3.connect(":memory:")
    for statement in contract.ddl():
        conn.execute(statement)
    assert _table_columns(conn, "events") == [
        "event_id",
        "ts",
        "day",
        "user_email",
        "host",
        "hook_event",
        "context_tokens",
        "session_id",
        "prompt_id",
        "tool_name",
        "source",
        "compact_trigger",
        "command_name",
        "command_source",
        "skill_name",
        "effort_level",
        "permission_mode",
        "agent_id",
        "is_interrupt",
    ]


def test_policy_state_columns_match_policy_columns():
    """policy_state の列名が POLICY_COLUMNS の順と一致する。"""
    conn = sqlite3.connect(":memory:")
    for statement in contract.ddl():
        conn.execute(statement)
    assert _table_columns(conn, "policy_state") == [
        "event_id",
        "ts",
        "day",
        "user_email",
        "host",
        "key_name",
        "value",
        "prev_value",
        "apply_result",
        "plugin_version",
    ]


def test_cost_daily_columns_match_csv_columns():
    """cost_daily の列名が CSV_COLUMNS の DB 列名の順と一致する。"""
    conn = sqlite3.connect(":memory:")
    for statement in contract.ddl():
        conn.execute(statement)
    assert _table_columns(conn, "cost_daily") == [
        "day",
        "user_email",
        "provider",
        "model",
        "currency",
        "cost",
        "input_tokens",
        "output_tokens",
        "cache_read_tokens",
        "cache_write_tokens",
        "cached_input_tokens",
        "uncached_input_tokens",
        "source_file",
    ]


def test_ddl_raises_on_duplicate_column_name(monkeypatch):
    """HOOK_FIELDS と EXTRA_COLUMNS の列名が重複すると例外を投げる。"""
    monkeypatch.setattr(
        contract,
        "EXTRA_COLUMNS",
        contract.EXTRA_COLUMNS + (("tool_name", "VARCHAR(255)"),),
    )
    with pytest.raises(ValueError) as exc_info:
        contract.ddl()
    assert "tool_name" in str(exc_info.value)


def test_ddl_creates_no_table_before_raising(monkeypatch):
    """重複検出時は文の組み立て前に例外が出るため、CREATE TABLE が 1 文も実行されない。"""
    monkeypatch.setattr(
        contract,
        "EXTRA_COLUMNS",
        contract.EXTRA_COLUMNS + (("tool_name", "VARCHAR(255)"),),
    )
    conn = sqlite3.connect(":memory:")
    with pytest.raises(ValueError):
        for statement in contract.ddl():
            conn.execute(statement)
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    assert tables == []
