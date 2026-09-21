"""`queries_events.py` の集計クエリを、既知データ（`test_fixtures.py`）で検証する。

基準日は 20005。`RECENT_DAYS = 7` の直近窓は `day >= 19999`、前 7 日は `19992..19998`。
"""

# ruff: noqa: F811

import queries_events
from test_fixtures import (
    TODAY,
    assert_invariant_under_duplication,
    duplicate_events,
    known_db,  # noqa: F401
)


def test_skill_usage_returns_two_rows_ordered_by_recent_calls(known_db):
    """スキル別は 2 行、直近の呼出回数の降順（pdf が先）。"""
    rows = queries_events.skill_usage(known_db, TODAY)
    assert [r[0] for r in rows] == ["pdf", "xlsx"]


def test_skill_usage_values(known_db):
    """pdf: 直近呼出 3・利用者 2・前呼出 1・前利用者 1。xlsx: 直近呼出 1・利用者 1・前呼出 1・前利用者 1。"""
    rows = {r[0]: r[1:] for r in queries_events.skill_usage(known_db, TODAY)}
    assert rows["pdf"] == (3, 2, 1, 1)
    assert rows["xlsx"] == (1, 1, 1, 1)


def test_skill_usage_unchanged_after_duplicate_injection(known_db):
    """`events` を複製しても pdf の呼出は 3 のまま。"""

    def compute():
        return sorted(queries_events.skill_usage(known_db, TODAY))

    result = assert_invariant_under_duplication(known_db, compute)
    assert {row[0]: row[1] for row in result}["pdf"] == 3


def test_skill_usage_count_star_would_double_pdf(known_db):
    """`COUNT(*)` で実装した場合に起きる差の対照実験。重複注入後、`COUNT(*)` は pdf を 6 にする。"""
    duplicate_events(known_db)
    cur = known_db.cursor()
    cur.execute("SELECT COUNT(*) FROM events WHERE skill_name = 'pdf' AND day >= 19999")
    assert cur.fetchone()[0] == 6
    rows = {r[0]: r[1] for r in queries_events.skill_usage(known_db, TODAY)}
    assert rows["pdf"] == 3


def test_command_usage_returns_two_rows(known_db):
    """コマンド別は `review`/`project` と `review`/`user` の 2 行。"""
    rows = queries_events.command_usage(known_db, TODAY)
    keys = {(r[0], r[1]) for r in rows}
    assert keys == {("review", "project"), ("review", "user")}


def test_command_usage_values(known_db):
    """それぞれ直近呼出 1・利用者 1。"""
    rows = {(r[0], r[1]): r[2:4] for r in queries_events.command_usage(known_db, TODAY)}
    assert rows[("review", "project")] == (1, 1)
    assert rows[("review", "user")] == (1, 1)


def test_command_usage_unchanged_after_duplicate_injection(known_db):
    """`events` を複製しても値は変化しない。"""

    def compute():
        return sorted(queries_events.command_usage(known_db, TODAY))

    assert_invariant_under_duplication(known_db, compute)


def test_subagent_ratio(known_db):
    """分母 13（直近 7 日の全イベント）・分子 2（e9, e10）・割合 15.4%。"""
    [(numerator, denominator, rate)] = queries_events.subagent_ratio(known_db, TODAY)
    assert denominator == 13
    assert numerator == 2
    assert rate == 15.4


def test_subagent_ratio_unchanged_after_duplicate_injection(known_db):
    """重複行を注入しても割合は 15.4% のまま。"""

    def compute():
        return queries_events.subagent_ratio(known_db, TODAY)

    assert_invariant_under_duplication(known_db, compute)


def test_subagent_ratio_count_star_would_differ(known_db):
    """`COUNT(*)` で実装した場合、重複注入後に分母が 26 になる（この差が対照実験で落ちる）。"""
    duplicate_events(known_db)
    cur = known_db.cursor()
    cur.execute("SELECT COUNT(*) FROM events WHERE day >= 19999")
    assert cur.fetchone()[0] == 26
    [(_, denominator, _)] = queries_events.subagent_ratio(known_db, TODAY)
    assert denominator == 13
