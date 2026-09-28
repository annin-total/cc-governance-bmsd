"""`scripts/seed_dashboard.py` が作る DB で、管理画面の表と分布が空にならないことを確かめる。

集計は画面と同じ `ccgov.store.queries_*` で行う（flask を要さない）。
"""

import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "scripts" / "seed_dashboard.py"
sys.path.insert(0, str(ROOT / "server"))

from ccgov.constants import EFFECT_PROVIDER, REFERENCE_KEY, REFERENCE_VALUE
from ccgov.store import queries_errors, queries_events, queries_policy
from ccgov.vendor import contract, policy


def _run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture(scope="module")
def seeded(tmp_path_factory):
    """既定の規模で 1 回だけ流した DB への接続と、集計の基準日。"""
    db_path = tmp_path_factory.mktemp("seed") / "seed.db"
    result = _run(str(db_path))
    assert result.returncode == 0, result.stderr
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("DB_DSN", f"sqlite:///{db_path}")
        conn = sqlite3.connect(db_path)
        yield conn, contract.to_day(int(time.time()))
        conn.close()


def _scalar_set_items() -> list:
    return [
        (key, contract.policy_text(value))
        for key, value in policy.SET.items()
        if value is not None and not isinstance(value, (dict, list))
    ]


def test_seed_fills_every_table(seeded):
    conn, today = seeded
    for key, expected in _scalar_set_items():
        numerator, denominator, _ = queries_policy.compliance_rate(
            conn, today, key, expected
        )[0]
        assert 0 < numerator < denominator, key
        assert queries_policy.non_compliant(conn, today, key, expected), key
    assert queries_policy.latest_values(conn, today, REFERENCE_KEY)
    assert queries_policy.not_introduced(conn, today)
    assert queries_policy.stale_terminals(conn, today)
    assert (
        len(queries_policy.plugin_version_distribution(conn, today, REFERENCE_KEY)) > 1
    )
    assert len(queries_policy.claude_code_version_distribution(conn, today)) > 1

    errors = queries_errors.error_summary(conn, today)
    assert ("send", "HTTP 401") in {(stage, kind) for stage, kind, *_ in errors}

    health = queries_events.health_counts(conn, today)["recent"]
    assert all(rate and rate < 100 for rate in health["null_rates"].values()), health
    for column in ("permission_mode", "effort_level", "source"):
        assert queries_events.distribution(conn, today, column), column
    assert queries_events.skill_usage(conn, today)
    sources = {source for _, source, *_ in queries_events.command_usage(conn, today)}
    assert {"plugin", "userSettings"} <= sources
    assert queries_events.subagent_ratio(conn, today)[0][0] > 0
    assert queries_events.daily_cost(conn)
    assert queries_events.reconciliation_rate(conn, today)[0][0] > 0

    starts = queries_policy.compliance_start_dates(conn, REFERENCE_KEY, REFERENCE_VALUE)
    assert len(set(starts.values())) > 1
    assert queries_policy.event_study(
        conn, REFERENCE_KEY, REFERENCE_VALUE, EFFECT_PROVIDER
    )
    for hook_event in ("PreCompact", "Stop"):
        distribution = queries_policy.context_distribution(conn, hook_event, starts)
        assert set(distribution) == {"before", "after"}, hook_event


def test_seed_guards(tmp_path):
    no_csv = tmp_path / "no_csv.db"
    result = _run(str(no_csv), "--no-csv")
    assert result.returncode == 0, result.stderr
    conn = sqlite3.connect(no_csv)
    try:
        assert conn.execute("SELECT COUNT(*) FROM cost_daily").fetchone() == (0,)
    finally:
        conn.close()

    before = os.stat(no_csv).st_mtime_ns
    assert _run(str(no_csv), "--no-csv").returncode != 0
    assert os.stat(no_csv).st_mtime_ns == before

    for args in (("--users", "1"), ("--days", "1")):
        target = tmp_path / f"small{args[0]}.db"
        assert _run(str(target), *args).returncode != 0, args
        assert not target.exists(), args
