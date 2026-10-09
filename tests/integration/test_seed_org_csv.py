"""`scripts/seed_org_csv.py` が、明細の合成利用者と突き合わせられる組織 CSV を作ることを確かめる。"""

import csv
import random
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "scripts" / "seed_org_csv.py"
sys.path.insert(0, str(ROOT / "server"))
sys.path.insert(0, str(ROOT / "scripts"))

from seed_dashboard import DEFAULT_DAYS, DEFAULT_USERS, SEED
from seed_dashboard_rows import generate
from seed_org_columns import ORG_RULES

# 実物の組織 CSV の見出し。順も含めて合わせる
HEADERS = [
    "Worker Active",
    "Not Counted in HC",
    "Preferred Full Name in Local Language 1",
    "(Primary Position) Worker & Employee Type",
    "Department",
    "Section",
    "Group",
    "Team",
    "Email - Primary Work",
]
LEVELS = ("Department", "Section", "Group", "Team")


def _run(out: Path) -> bytes:
    subprocess.run(
        [sys.executable, str(SCRIPT), "--out", str(out)],
        capture_output=True,
        text=True,
        check=True,
    )
    return out.read_bytes()


@pytest.fixture(scope="module")
def org(tmp_path_factory) -> tuple:
    """(書き出したバイト列, 見出し, 行)。"""
    raw = _run(tmp_path_factory.mktemp("org") / "org.csv")
    reader = csv.DictReader(raw.decode("utf-8").splitlines())
    return raw, reader.fieldnames, list(reader)


def test_header_matches_the_real_one(org) -> None:
    raw, fieldnames, _ = org
    assert fieldnames == HEADERS == list(ORG_RULES)
    assert not raw.startswith(b"\xef\xbb\xbf")


def test_roster_overlaps_cost_users_but_differs(org) -> None:
    _, costs = generate(random.Random(SEED), DEFAULT_USERS, DEFAULT_DAYS, 1790000000)
    cost_users = {c["User Email"] for c in costs}
    roster = {r["Email - Primary Work"] for r in org[2]}
    assert cost_users - roster, "名簿の反映遅れで、明細の利用者の一部は名簿にいない"
    assert roster - cost_users - {"", "-"}, (
        "名簿には Claude Code を使っていない人もいる"
    )
    assert len(cost_users & roster) >= 0.8 * len(cost_users)


def test_roster_has_the_quirks_of_the_real_one(org) -> None:
    rows = org[2]
    emails = [r["Email - Primary Work"] for r in rows]
    assert "" in emails and "-" in emails
    for column in ("Worker Active", "Not Counted in HC"):
        assert {r[column] for r in rows} == {"1", ""}
    assert any(not r["Team"] for r in rows) and any(r["Team"] for r in rows)


def test_hierarchy_has_no_child_without_parent(org) -> None:
    for row in org[2]:
        path = [row[level] for level in LEVELS]
        filled = [v for v in path if v]
        assert filled and path == filled + [""] * path.count("")
        parent = ""
        for level, value in zip(LEVELS, filled):
            name, code = value.split()
            assert name == level and code.startswith(parent), row
            parent = code


def test_output_is_reproducible(org, tmp_path) -> None:
    assert _run(tmp_path / "again.csv") == org[0]


def test_server_reads_the_roster(org) -> None:
    """サーバの組織 CSV の読み取りが、合成の名簿の列を引け、メールアドレスの無い行だけを捨てる。"""
    from ccgov.ingestion import roster_csv

    raw, _, rows = org
    parsed, dropped = roster_csv.parse(raw)
    no_email = sum(r["Email - Primary Work"] in ("", "-") for r in rows)
    assert dropped == no_email > 0
    assert len(parsed) == len(rows) - no_email
    assert {r["department"] for r in parsed} == {r["Department"] for r in rows}


def test_server_finds_cost_users_in_the_roster(org) -> None:
    """サーバの氏名・部・課の引き当てが、合成の明細の利用者を合成の名簿で引ける（名簿に無い人は不明になる）。"""
    from ccgov.ingestion import roster_csv
    from ccgov.metrics import roster

    parsed, _ = roster_csv.parse(org[0])
    people = {r["email"]: r for r in parsed}
    _, costs = generate(random.Random(SEED), DEFAULT_USERS, DEFAULT_DAYS, 1790000000)
    found = {e: roster.person(people, e) for e in {c["User Email"] for c in costs}}
    unlisted = {e for e, p in found.items() if not p["listed"]}
    assert unlisted == {e for e in found if e.lower() not in people} != set()
    listed = [p for p in found.values() if p["listed"]]
    assert listed and all(p["name"] and p["dept"] for p in listed)
    assert {p["dept"] for p in listed} <= {r["department"] for r in parsed}
