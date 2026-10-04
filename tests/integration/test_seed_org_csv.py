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
