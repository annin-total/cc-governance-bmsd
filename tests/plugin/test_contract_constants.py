"""契約の 5 定数を検証する。"""

import ast
import pathlib
import sys

import contract


def test_hook_fields_and_extra_columns_have_disjoint_names():
    """HOOK_FIELDS と EXTRA_COLUMNS の列名集合の積は空集合である。"""
    hook_names = {name for name, _, _ in contract.HOOK_FIELDS}
    extra_names = {name for name, _ in contract.EXTRA_COLUMNS}
    assert hook_names & extra_names == set()


def test_events_column_order():
    """EXTRA_COLUMNS + HOOK_FIELDS の列名の並びが events の列順である。"""
    extra_names = [name for name, _ in contract.EXTRA_COLUMNS]
    hook_names = [name for name, _, _ in contract.HOOK_FIELDS]
    assert extra_names + hook_names == [
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


def test_policy_columns_order():
    """POLICY_COLUMNS の列名の並びが policy_state の列順である。"""
    names = [name for name, _ in contract.POLICY_COLUMNS]
    assert names == [
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


def test_csv_columns_db_name_order():
    """CSV_COLUMNS の DB 列名の並びが cost_daily の列順である。"""
    names = [db_name for _, db_name, _ in contract.CSV_COLUMNS]
    assert names == [
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


def test_csv_columns_none_header_is_source_file_only():
    """CSV_COLUMNS のうちヘッダ名が None の要素は source_file の 1 つだけである。"""
    none_header = [
        db_name for header, db_name, _ in contract.CSV_COLUMNS if header is None
    ]
    assert none_header == ["source_file"]


def test_type_tokens_are_subset_of_known_types():
    """5 定数に現れる型文字列の先頭トークンの集合が既知の型の部分集合である。"""
    tokens = set()
    for _, _, type_str in contract.HOOK_FIELDS:
        tokens.add(type_str.split("(")[0])
    for _, type_str in contract.EXTRA_COLUMNS:
        tokens.add(type_str.split("(")[0])
    for _, type_str in contract.POLICY_COLUMNS:
        tokens.add(type_str.split("(")[0])
    for _, _, type_str in contract.CSV_COLUMNS:
        tokens.add(type_str.split("(")[0])
    assert tokens <= {"VARCHAR", "INTEGER", "BIGINT", "DOUBLE"}


def test_contract_imports_only_standard_library():
    """contract.py がサードパーティを import していない。"""
    stdlib_names = (
        set(sys.stdlib_module_names) if hasattr(sys, "stdlib_module_names") else None
    )
    contract_path = pathlib.Path(contract.__file__)
    tree = ast.parse(contract_path.read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imported.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    if stdlib_names is not None:
        assert imported <= stdlib_names
    else:
        assert imported <= {"typing", "sqlite3", "datetime", "uuid", "time"}
