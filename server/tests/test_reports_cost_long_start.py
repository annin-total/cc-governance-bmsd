"""12 か月のコストの始まり。終わりの月から数えて 12 番目の暦月の 1 日から数え、CSV がそれより後に始まるときだけ CSV の最初の日から数える。"""

import datetime

from known_data import insert_cost_daily

from ccgov.metrics import calendar, windows
from ccgov.reports import cost


def D(text: str) -> int:
    return calendar.to_day(datetime.date.fromisoformat(text))


def _add(conn, *days: str) -> None:
    for day in days:
        insert_cost_daily(
            conn, day=D(day), user_email="u1", provider="aws-bedrock", cost=1.0
        )


def _months(conn, end: str) -> tuple:
    found = cost.build(conn, windows.period("12m", D(end)))
    rows = [
        (calendar.to_date(m["day"]).isoformat(), m["partial"]) for m in found["months"]
    ]
    return calendar.to_date(found["start"]).isoformat(), rows


def test_first_day_without_rows_does_not_delay_the_start(db_conn):
    """2025-11-01 は土曜で行が無い。始まりは 11-01 のままで、最初の月は途中にならない。"""
    _add(db_conn, "2025-10-31", "2025-11-03", "2026-10-07")
    start, rows = _months(db_conn, "2026-10-07")
    assert start == "2025-11-01"
    assert rows[0] == ("2025-11-01", False)
    assert len(rows) == 12
    assert [p for _, p in rows].count(True) == 1 and rows[-1][1]


def test_csv_starting_after_the_first_day_counts_from_the_csv(db_conn):
    """CSV が 2026-05-20 から始まるときは、その日から数え、その月は途中の月になる。"""
    _add(db_conn, "2026-05-20", "2026-10-31")
    start, rows = _months(db_conn, "2026-10-31")
    assert start == "2026-05-20"
    assert rows[0] == ("2026-05-20", True)
    assert [d for d, _ in rows][-1] == "2026-10-01" and len(rows) == 6


def test_missing_months_after_the_first_day_stay_in_the_rows(db_conn):
    """CSV は前から続くが、始まりの前後の取り込みが欠けている。欠けた月は 0 で表に残る。"""
    _add(db_conn, "2024-01-01", "2025-10-14", "2026-01-12", "2026-10-07")
    found = cost.build(db_conn, windows.period("12m", D("2026-10-07")))
    assert found["start"] == D("2025-11-01")
    totals = [m["total"] for m in found["months"]]
    assert len(totals) == 12 and totals[:2] == [0, 0] and totals[2] == 1.0
