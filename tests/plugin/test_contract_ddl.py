"""ddl() による 4 テーブルの CREATE TABLE 文の組み立てを検証する。"""

import sqlite3

import contract
import pytest


def test_ddl_returns_four_statements_for_four_tables():
    statements = contract.ddl()
    assert len(statements) == 4
    joined = " ".join(statements)
    assert "events" in joined
    assert "policy_state" in joined
    assert "cost_daily" in joined
    assert "errors" in joined


def test_ddl_statements_start_with_create_table_if_not_exists():
    for statement in contract.ddl():
        assert statement.startswith("CREATE TABLE IF NOT EXISTS")


def test_ddl_has_no_constraints():
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
        "claude_code_version",
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


def test_errors_columns_match_error_columns():
    conn = sqlite3.connect(":memory:")
    for statement in contract.ddl():
        conn.execute(statement)
    assert _table_columns(conn, "errors") == [
        "event_id",
        "ts",
        "day",
        "user_email",
        "host",
        "hook_event",
        "plugin_version",
        "stage",
        "error_type",
    ]


def test_cost_daily_columns_match_csv_columns():
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
