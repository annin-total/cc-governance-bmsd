"""合成データの、どの端末がいつ何行を出すか（利用者の役割と日程）と、組織の名簿に誰が載るか。"""

import json
import random
import uuid
from pathlib import Path

from ccgov.constants import EVENT_STUDY_SPAN, POLICY_DAYS, STALE_DAYS
from ccgov.store.queries_events import _HEALTH_NULL_SCOPES
from ccgov.vendor import contract, policy
from seed_dashboard_columns import CSV_RULES, RULES, Ctx, Term
from seed_org_columns import ORG_RULES, org_unit

HOOKS_JSON = Path(__file__).resolve().parents[1] / "plugin" / "hooks" / "hooks.json"
ACTIVE_RATE = 0.8
NULL_RATE = 0.1
CSV_LAG_DAYS = 1
SECONDS_PER_DAY = 86400
PLUGIN_VERSIONS = ("0.1.9", "0.2.0", "0.2.1")
CLAUDE_CODE_VERSIONS = ("2.1.281", "2.1.282", "2.1.283")
# (stage, error_type, hook_event)。plugin/hooks/ の append_error の呼び出しに合わせる
ERRORS = (
    ("send", "HTTP 401", None),
    ("send", "ConnectionRefusedError", None),
    ("apply_settings", "PermissionError", "SessionStart"),
    ("collect", "KeyError", "Stop"),
)
# 名簿は利用者より多く（使っていない人がいる）、反映の遅れで利用者の一部が載っていない
ROSTER_EXTRA_RATE = 0.5
ROSTER_LAG_RATE = 0.05
# 実物の名簿で、業務メールの無い人の書き方
NO_EMAILS = ("", "-")


def user_email(i: int) -> str:
    """合成利用者 i のメール。利用ログ・明細・組織 CSV で同じ人を指す。"""
    return f"user{i:03d}@example.com"


def scalar_keys() -> list:
    """準拠率の対象になる SET のキー（値がスカラのもの）。"""
    return [
        k
        for k, v in policy.SET.items()
        if v is not None and not isinstance(v, (dict, list))
    ]


def _terminals(rng: random.Random, n_users: int, today: int, days: int) -> tuple:
    """(端末のリスト, 未導入の利用者のリスト)。途絶えた端末をリストの後ろに置く。"""
    users = [user_email(i) for i in range(n_users)]
    n_small, n_off = max(1, n_users // 10), max(1, n_users // 5)
    keys = scalar_keys()
    terms = []
    for i, user in enumerate(users[n_small:]):
        stale = i >= n_users - 2 * n_small
        # 途絶えた端末は最終日を STALE_DAYS より前、POLICY_DAYS の集計期間の中に置く
        stop = today - rng.randint(STALE_DAYS + 1, POLICY_DAYS - 2) if stale else today
        install = rng.randint(today - days + 1, stop - EVENT_STUDY_SPAN - 1)
        start = install + rng.randint(1, EVENT_STUDY_SPAN)
        off = frozenset(keys[i % len(keys) :] if i < n_off else [])
        for h in range(2 if i % 5 == 0 else 1):
            version = PLUGIN_VERSIONS[(i + h) % len(PLUGIN_VERSIONS)]
            cc_version = CLAUDE_CODE_VERSIONS[i % len(CLAUDE_CODE_VERSIONS)]
            host = f"pc-{i:03d}-{h}"
            terms.append(
                Term(user, host, version, cc_version, install, start, stop, off)
            )
    return terms, users[:n_small]


def _row(kind: str, ctx: Ctx) -> dict:
    return {"kind": kind, **{name: rule(ctx) for name, rule in RULES[kind].items()}}


def _event(ctx: Ctx) -> dict:
    """概況の NULL 率の対象の列に、一部の欠けを混ぜる。"""
    row = _row("event", ctx)
    for column in _HEALTH_NULL_SCOPES:
        if ctx.rng.random() < NULL_RATE:
            row[column] = None
    return row


def _session(rng: random.Random, term: Term, ts: int, hooks: list, error) -> list:
    """1 セッションの policy・event・error 行。先頭の hook が SessionStart。"""
    session = str(uuid.UUID(int=rng.getrandbits(128)))
    rows = [
        _row("policy", Ctx(rng, term.user, ts, term=term, key=k)) for k in scalar_keys()
    ]
    events = hooks[:1] + [rng.choice(hooks[1:]) for _ in range(rng.randint(6, 14))]
    for n, hook in enumerate(events):
        ctx = Ctx(rng, term.user, ts + n * 30, term=term, hook=hook, session=session)
        rows.append(_event(ctx))
    if error:
        rows.append(_row("error", Ctx(rng, term.user, ts, term=term, error=error)))
    return rows


def _cost(rng: random.Random, user: str, day: int, start) -> dict:
    factor = 1.3 if start is None or day < start else 1.0
    ctx = Ctx(rng, user, day=day, factor=factor)
    return {header: rule(ctx) for header, rule in CSV_RULES.items()}


def generate(rng: random.Random, n_users: int, days: int, base_ts: int) -> tuple:
    """(NDJSON に載せる行のリスト, CSV の行のリスト)。`base_ts` の日を今日とする。"""
    today = contract.to_day(base_ts)
    hooks = sorted(
        json.loads(HOOKS_JSON.read_text(encoding="utf-8"))["hooks"],
        key=lambda h: h != "SessionStart",
    )
    terms, not_introduced = _terminals(rng, n_users, today, days)
    rows, costs = [], []
    for idx, term in enumerate(terms):
        for d in range(term.install, term.stop + 1):
            if d != term.stop and rng.random() > ACTIVE_RATE:
                continue
            error = ERRORS[idx % len(ERRORS)] if d == term.stop else None
            for s in range(rng.randint(1, 2)):
                back = (today - d) * SECONDS_PER_DAY + rng.randint(3600, 6 * 3600)
                rows += _session(
                    rng, term, base_ts - back, hooks, error if s == 0 else None
                )
    first, last = today - days + 1, today - CSV_LAG_DAYS
    spans = {
        t.user: (max(first, t.install - EVENT_STUDY_SPAN), min(last, t.stop), t.start)
        for t in terms
    }
    spans.update({u: (first, last, None) for u in not_introduced})
    for user, (lo, hi, start) in spans.items():
        for d in range(lo, hi + 1):
            if rng.random() <= ACTIVE_RATE:
                costs.append(_cost(rng, user, d, start))
    return rows, costs


def roster(rng: random.Random, n_users: int) -> list:
    """組織 CSV の行。利用者のうち新しく入った人を除き、利用者でない人を足す。"""
    n_lag = max(1, int(n_users * ROSTER_LAG_RATE))
    n_extra = max(len(NO_EMAILS) + 1, int(n_users * ROSTER_EXTRA_RATE))
    people = list(range(n_users - n_lag)) + list(range(n_users, n_users + n_extra))
    rows = []
    for i in people:
        ctx = Ctx(rng, user_email(i), org=org_unit(rng))
        rows.append({header: rule(ctx) for header, rule in ORG_RULES.items()})
    for row, email in zip(rows[-len(NO_EMAILS) :], NO_EMAILS):
        row["Email - Primary Work"] = email
    return rows
