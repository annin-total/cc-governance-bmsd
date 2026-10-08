"""`scripts/seed_dashboard.py` が作る DB で、管理画面の表と分布が空にならないことを確かめる。

集計は画面と同じ `ccgov.store.queries_*`・`ccgov.reports`・`ccgov.metrics` の関数で行う（flask を要さない）。
`SEED_DASHBOARD_TEST_DSN` に空の DB の DSN を渡すと、全ての表の検査をその DB で行う（既定は一時の SQLite）。
"""

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "scripts" / "seed_dashboard.py"
sys.path.insert(0, str(ROOT / "server"))
sys.path.insert(0, str(ROOT / "scripts"))

from ccgov.constants import (
    EFFECT_PROVIDER,
    EVENT_STUDY_SPAN,
    REFERENCE_KEY,
    REFERENCE_VALUE,
)
from ccgov.metrics.health import null_rates
from ccgov.metrics.rates import rate_row
from ccgov.reports import assets, effect, period_end
from ccgov.reports import policy as policy_report
from ccgov.store import db, queries_cost, queries_errors, queries_events, queries_policy
from ccgov.vendor import contract, policy
from seed_dashboard import _check_rules
from seed_dashboard_columns import RULES
from seed_dashboard_rows import scalar_keys


def _run(dsn: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "DB_DSN": dsn},
    )


def _count(dsn: str, table: str, monkeypatch) -> int:
    monkeypatch.setenv("DB_DSN", dsn)
    conn = db.connect()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        return cur.fetchone()[0]
    finally:
        conn.close()


@pytest.fixture(scope="module")
def seeded(tmp_path_factory):
    """既定の規模で 1 回だけ流した DB への接続と、集計の基準日。"""
    dsn = os.environ.get("SEED_DASHBOARD_TEST_DSN") or (
        f"sqlite:///{tmp_path_factory.mktemp('seed') / 'seed.db'}"
    )
    result = _run(dsn)
    assert result.returncode == 0, result.stderr
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("DB_DSN", dsn)  # 集計の関数が方言を DB_DSN から決める
        conn = db.connect()
        yield conn, contract.to_day(int(time.time()))
        conn.close()


def test_画面の全ての表と分布が埋まる(seeded):
    conn, today = seeded
    for key in scalar_keys():
        expected = contract.policy_text(policy.SET[key])
        numerator, denominator, _ = policy_report.compliance_rate(
            conn, today, key, expected
        )[0]
        assert 0 < numerator < denominator, key
        assert policy_report.non_compliant(conn, today, key, expected), key
    assert queries_policy.latest_values(conn, today, REFERENCE_KEY)
    assert queries_policy.not_introduced(conn, today)
    assert queries_policy.stale_terminals(conn, today)
    assert (
        len(queries_policy.plugin_version_distribution(conn, today, REFERENCE_KEY)) > 1
    )
    assert len(queries_policy.claude_code_version_distribution(conn, today)) > 1

    errors = queries_errors.error_summary(conn, today)
    assert ("send", "HTTP 401") in {(stage, kind) for stage, kind, *_ in errors}

    recent = queries_events.health_window_counts(conn, today)["recent"]
    health = {"null_rates": null_rates(recent["null_counts"])}
    assert all(rate and rate < 100 for rate in health["null_rates"].values()), health
    for column in ("permission_mode", "effort_level", "source"):
        assert queries_events.distribution(conn, today, column), column
    assert queries_events.skill_usage(conn, today)
    sources = {source for _, source, *_ in queries_events.command_usage(conn, today)}
    assert {"plugin", "userSettings"} <= sources
    assert assets.subagent_ratio(conn, today)[0][0] > 0
    assert queries_cost.daily_cost(conn)
    assert rate_row(*queries_events.reconciliation_counts(conn, today))[0] > 0

    _, end = period_end.bounds(
        conn, today
    )  # 設定の効果は画面と同じく利用明細の最終日で切る
    starts = queries_policy.compliance_start_dates(
        conn, REFERENCE_KEY, REFERENCE_VALUE, end
    )
    # 準拠開始日が散らばらないと、イベントスタディの相対日の人数の変化が見えない
    assert max(starts.values()) - min(starts.values()) >= EVENT_STUDY_SPAN
    assert effect.event_study(
        conn, REFERENCE_KEY, REFERENCE_VALUE, EFFECT_PROVIDER, end
    )
    for hook_event in ("PreCompact", "Stop"):
        distribution = effect.context_distribution(conn, hook_event, starts, end)
        assert set(distribution) == {"before", "after"}, hook_event


def test_CSVなし_行の在るDB_下限を割る引数を扱う(tmp_path, monkeypatch):
    dsn = f"sqlite:///{tmp_path / 'no_csv.db'}"
    result = _run(dsn, "--no-csv")
    assert result.returncode == 0, result.stderr
    assert _count(dsn, "cost_daily", monkeypatch) == 0

    events = _count(dsn, "events", monkeypatch)
    assert _run(dsn, "--no-csv").returncode != 0
    assert _count(dsn, "events", monkeypatch) == events

    for args in (("--users", "1"), ("--days", "1")):
        target = tmp_path / f"small{args[0]}.db"
        assert _run(f"sqlite:///{target}", *args).returncode != 0, args
        assert not target.exists(), args


def test_対応表と契約の列が食い違えば名指しで止まる(monkeypatch):
    missing = next(iter(RULES["event"]))
    monkeypatch.delitem(RULES["event"], missing)
    with pytest.raises(SystemExit, match=missing):
        _check_rules()
    monkeypatch.setitem(RULES["policy"], "not_in_contract", lambda c: None)
    with pytest.raises(SystemExit, match="not_in_contract"):
        _check_rules()
