"""CSV 取込（`csv_import.py`）のテスト。

このファイルはタスク 1〜8 を通じて育てる。
"""

from pathlib import Path

import csv_import
import pytest
from shared import CSV_COLUMNS

FIXTURES = Path(__file__).parent / "fixtures"


# --- タスク 2: ヘッダの射影 -------------------------------------------------

_EXPECTED_DB_COLUMNS = {db_name for _, db_name, _ in CSV_COLUMNS}


def test_projection_key_set_matches_csv_columns():
    """2-1: daily_a.csv（15 列）の抽出結果のキー集合が CSV_COLUMNS の DB 列名集合と一致する。"""
    rows, dropped = csv_import.parse_file(str(FIXTURES / "daily_a.csv"))
    assert dropped == 0
    assert set(rows[0].keys()) == _EXPECTED_DB_COLUMNS


def test_projection_ignores_extra_column_key_set():
    """2-2: extra_column.csv（16 列目に Region）でも 2-1 と同じキー集合。Region は現れない。"""
    rows, dropped = csv_import.parse_file(str(FIXTURES / "extra_column.csv"))
    assert dropped == 0
    assert set(rows[0].keys()) == _EXPECTED_DB_COLUMNS
    assert "Region" not in rows[0]


def test_projection_extra_column_row_count_is_three():
    """2-3: extra_column.csv の取り込まれる行数は 3。Region の有無で行が減らない。"""
    rows, dropped = csv_import.parse_file(str(FIXTURES / "extra_column.csv"))
    assert len(rows) == 3
    assert dropped == 0


def test_projection_column_order_independent(tmp_path):
    """2-4: ヘッダの列順を入れ替えても user_email の値は User Email 列の値になる。"""
    header = (
        "Model,Date,Workspace ID,Provider,User ID,User Email,User Name,Cost,"
        "Currency,Input Tokens,Output Tokens,Cache Read Tokens,Cache Write Tokens,"
        "Cached Input Tokens,Uncached Input Tokens"
    )
    row = (
        "CLAUDE_SONNET_4_6,2026-07-01,workspace-01,aws-bedrock,user-0001,"
        "user0001@example.com,user0001,1.0,USD,100,200,0,0,0,100"
    )
    path = tmp_path / "reordered.csv"
    path.write_bytes((header + "\r\n" + row + "\r\n").encode("utf-8"))

    rows, dropped = csv_import.parse_file(str(path))
    assert dropped == 0
    assert rows[0]["user_email"] == "user0001@example.com"
    assert rows[0]["model"] == "CLAUDE_SONNET_4_6"


def test_projection_missing_cost_column_fails(tmp_path):
    """2-5: Cost 列を欠いた CSV は取り込まず、例外で失敗として報告する。"""
    header = (
        "Date,Workspace ID,Provider,Model,User ID,User Email,User Name,"
        "Currency,Input Tokens,Output Tokens,Cache Read Tokens,Cache Write Tokens,"
        "Cached Input Tokens,Uncached Input Tokens"
    )
    row = (
        "2026-07-01,workspace-01,aws-bedrock,CLAUDE_SONNET_4_6,user-0001,"
        "user0001@example.com,user0001,USD,100,200,0,0,0,100"
    )
    path = tmp_path / "no_cost.csv"
    path.write_bytes((header + "\r\n" + row + "\r\n").encode("utf-8"))

    with pytest.raises(ValueError):
        csv_import.parse_file(str(path))


def test_projection_scientific_notation_cost(tmp_path):
    """2-6: `2.3e-05` / `4.60E-05` の Cost が浮動小数として正しく保存される。"""
    header = (
        "Date,Workspace ID,Provider,Model,User ID,User Email,User Name,Cost,"
        "Currency,Input Tokens,Output Tokens,Cache Read Tokens,Cache Write Tokens,"
        "Cached Input Tokens,Uncached Input Tokens"
    )
    row1 = (
        "2026-07-01,workspace-01,aws-bedrock,m,user-0001,"
        "user0001@example.com,user0001,2.3e-05,USD,1,1,0,0,0,1"
    )
    row2 = (
        "2026-07-01,workspace-01,aws-bedrock,m,user-0002,"
        "user0002@example.com,user0002,4.60E-05,USD,1,1,0,0,0,1"
    )
    rows_text = f"{row1}\r\n{row2}"
    path = tmp_path / "scientific.csv"
    path.write_bytes((header + "\r\n" + rows_text + "\r\n").encode("utf-8"))

    rows, dropped = csv_import.parse_file(str(path))
    assert dropped == 0
    assert rows[0]["cost"] == 0.000023
    assert rows[1]["cost"] == 0.0000460
