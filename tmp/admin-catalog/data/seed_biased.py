"""カタログ用の偏りのある合成データを、空の DB（DB_DSN）に作る。本物の seed（scripts/seed_dashboard.py）は変えない。

使い方: DB_DSN=sqlite:///<db> python seed_biased.py --server <server> --scripts <seed の scripts/> [--users 40] [--days 400]
端末・設定の報告・エラーは本物の seed の関数（_terminals・_row）をそのまま使い、記録と利用明細だけを利用者の型で偏らせる。
受信と取込はサーバの本体（ndjson.ingest・csv_import.import_all）を通し、1 行でも捨てられたら止まる。
"""

import argparse
import dataclasses
import datetime as dt
import json
import random
import sys
import uuid
from pathlib import Path

SEED = 20260930
ASOF = dt.datetime(2026, 9, 18, 18, 0, tzinfo=dt.timezone(dt.timedelta(hours=9)))  # 月の途中に置き、今月の見込みが出る日にする
EPOCH = dt.date(1970, 1, 1)
DAY, JST = 86400, 9 * 3600
BEFORE_THRESHOLD, AFTER_THRESHOLD = 165_000, 120_000  # 自動コンパクトのしきい値（既定・配布した 60%）
BUILTIN = ("Read", "Edit", "Bash", "Grep", "Glob", "Write")
SKILLS = {"brainstorming": 6, "systematic-debugging": 4, "governance:reapply": 3, "pdf": 2, "frontend-design": 2,
          "xlsx": 1, "test-driven-development": 1, "writing-plans": 1}
COMMANDS = {("compact", "builtin"): 5, ("clear", "builtin"): 4, ("resume", "builtin"): 3, ("review", "userSettings"): 3,
            ("deploy", "userSettings"): 1, ("governance:reapply", "plugin"): 1}
MCP = {"github": ("get_file_contents", "search_code", "create_pull_request", "list_issues"),
       "context7": ("resolve-library-id", "query-docs"), "slack": ("post_message", "search_messages"),
       "atlassian": ("get_issue", "search")}
MCP_WEIGHT = {"github": 5, "context7": 3, "slack": 1, "atlassian": 1}
MODELS = {"sonnet": "claude-sonnet-4-5", "opus": "claude-opus-4-1", "haiku": "claude-haiku-4-5"}
UNIT_PER_MTOK = {"sonnet": 1.2, "opus": 4.0, "haiku": 0.4}
# 型ごと: (記録の日の確率, 1 日のセッション, 利用明細の日の確率, 1 日のコスト, スキル, コマンド, MCP, Web, サブエージェント, 溜める人)
TIERS = {
    "heavy": (0.92, (1, 3), 0.95, 28, 0.85, 1.0, 0.7, 0.6, 0.7, 0.6),
    "regular": (0.65, (1, 2), 0.8, 11, 0.4, 0.7, 0.3, 0.35, 0.25, 0.35),
    "light": (0.3, (1, 1), 0.5, 3.5, 0.1, 0.35, 0.1, 0.1, 0.0, 0.2),
    "dormant": (0.05, (1, 1), 0.6, 7, 0.0, 0.2, 0.0, 0.0, 0.0, 0.2),
    "none": (0.0, (0, 0), 0.6, 5, 0, 0, 0, 0, 0, 0),
}
TIER_COUNTS = (("heavy", 6), ("regular", 12), ("light", 10), ("dormant", 8))
QUITTERS, QUIT_AGO = 4, (35, 160)  # 途中で離れる人（利用明細も記録も止まる）
CSV_LAG = 2  # 利用明細の最終日は基準日の 2 日前
RECENT_BUMP, BUMP_DAYS, BUMP_TIERS = 1.3, 7, ("heavy", "regular")  # 利用明細の最後の 7 日だけ、よく使う人と普段使う人のコストを上げる（7 日のコストを注意にする）
# 古い版の利用者の人数（本体・プラグイン）。ほかは最新の版にそろえ、古い版がほぼ全員にならないようにする
OLD_CORE, OLD_PLUGIN, LATEST_CORE, LATEST_PLUGIN = 5, 8, "2.1.283", "0.2.1"
RECENT_SPREAD = 6  # 途絶えていない端末の、必ず記録を作る日を基準日から何日前まで散らすか


def _args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--server", required=True, type=Path)
    p.add_argument("--scripts", required=True, type=Path)
    p.add_argument("--users", type=int, default=40)
    p.add_argument("--days", type=int, default=400)
    return p.parse_args()


def _weighted(rng, table: dict, k: int) -> list:
    keys, out = list(table), []
    while len(out) < min(k, len(keys)):
        pick = rng.choices(keys, weights=[table[x] for x in keys])[0]
        if pick not in out:
            out.append(pick)
    return out


def _profiles(rng, introduced: list, not_introduced: list) -> dict:
    order = introduced[:]
    rng.shuffle(order)
    tiers = [t for t, n in TIER_COUNTS for _ in range(n)]
    tiers += ["dormant"] * (len(order) - len(tiers))
    profs = {u: {"tier": "none", "model": "sonnet"} for u in not_introduced}
    for u, tier in zip(order, tiers):
        _, _, _, _, sk, cm, mcp, web, ag, acc = TIERS[tier]
        profs[u] = {
            "tier": tier,
            "skills": _weighted(rng, SKILLS, rng.randint(1, 4)) if rng.random() < sk else [],
            "commands": _weighted(rng, COMMANDS, rng.randint(1, 4)) if rng.random() < cm else [],
            "mcp": _weighted(rng, MCP_WEIGHT, rng.randint(1, 3)) if rng.random() < mcp else [],
            "web": rng.random() < web, "agent": rng.random() < ag, "accumulate": rng.random() < acc,
            "bypass": rng.random() < 0.15, "p_skill": rng.uniform(0.1, 0.35), "p_cmd": rng.uniform(0.05, 0.2),
            "p_ext": rng.uniform(0.15, 0.5), "p_agent": rng.uniform(0.1, 0.3), "quit": None,
        }
    for u in [u for u in order if profs[u]["tier"] in ("light", "dormant")][:QUITTERS]:
        profs[u]["quit"] = rng.randint(*QUIT_AGO)  # 何日前に使うのをやめたか
    for u, p in profs.items():  # モデルの構成: Opus は上位の型の一部、Haiku は軽い型の一部
        p["cache"] = rng.uniform(0.55, 0.82)
        r = rng.random()
        p["model"] = ("opus" if r < 0.7 else "sonnet") if p["tier"] == "heavy" else \
            ("opus" if r < 0.1 else "sonnet") if p["tier"] == "regular" else ("haiku" if r < 0.35 else "sonnet")
    return profs


class Session:
    """1 セッションの記録を作る。コンテキストは指示ごとに増え、しきい値を超えると自動コンパクトで戻る。"""

    def __init__(self, g, term, prof, ts: int, compliant: bool):
        self.g, self.term, self.prof, self.ts = g, term, prof, ts
        self.sid = str(uuid.UUID(int=g.rng.getrandbits(128)))
        self.mode = "bypassPermissions" if prof["bypass"] and g.rng.random() < 0.6 else \
            g.rng.choice(("default", "default", "acceptEdits", "plan"))
        self.threshold = AFTER_THRESHOLD if compliant else BEFORE_THRESHOLD
        self.ctx = g.rng.randint(15_000, 30_000)
        self.rows = []

    def ev(self, hook: str, **kw) -> None:
        rng = self.g.rng
        self.ts += rng.randint(5, 40)
        row = {c: None for c in self.g.event_cols}
        row.update(kind="event", event_id=str(uuid.UUID(int=rng.getrandbits(128))), ts=self.ts, day=self.g.to_day(self.ts),
                   user_email=self.term.user, host=self.term.host, hook_event=hook, session_id=self.sid,
                   permission_mode=self.mode, prompt_id=None if hook == "SessionStart" else self.pid)
        if hook in ("PreCompact", "Stop"):
            row["claude_code_version"] = self.term.claude_code_version
        if hook in ("PostToolUse", "PostToolUseFailure", "Stop"):
            row["effort_level"] = rng.choice(("low", "medium", "medium", "high"))
        row.update(kw)
        for col in self.g.null_cols:
            if row.get(col) is not None and rng.random() < 0.02:
                row[col] = None
        self.rows.append(row)

    def tool(self, name: str, **kw) -> None:
        fail = self.g.rng.random() < 0.05
        self.ev("PostToolUseFailure" if fail else "PostToolUse", tool_name=name,
                is_interrupt=(self.g.rng.random() < 0.3) if fail else None, **kw)

    def compact(self, trigger: str) -> None:
        self.ev("PreCompact", context_tokens=self.ctx, compact_trigger=trigger)
        self.ctx = self.g.rng.randint(25_000, 40_000)

    def prompt(self) -> None:
        rng, p = self.g.rng, self.prof
        self.pid = str(uuid.UUID(int=rng.getrandbits(128)))
        if p["commands"] and rng.random() < p["p_cmd"]:
            name, source = rng.choice(p["commands"])
            self.ev("UserPromptExpansion", command_name=name, command_source=source)
            if name == "compact":
                self.compact("manual")
        self.ev("UserPromptSubmit")
        for _ in range(rng.randint(1, 4)):
            self.tool(rng.choice(BUILTIN))
        if p["skills"] and rng.random() < p["p_skill"]:
            self.tool("Skill", skill_name=rng.choice(p["skills"]))
        if (p["mcp"] or p["web"]) and rng.random() < p["p_ext"]:
            opts = [f"mcp__{s}__{rng.choice(MCP[s])}" for s in p["mcp"]] + (["WebSearch", "WebFetch"] if p["web"] else [])
            self.tool(rng.choice(opts))
        if p["agent"] and rng.random() < p["p_agent"]:
            self.tool("Agent")
            aid = str(uuid.UUID(int=rng.getrandbits(128)))
            for _ in range(rng.randint(2, 5)):
                self.tool(rng.choice(BUILTIN), agent_id=aid)
        self.ctx += rng.randint(*self.step)
        if self.ctx > self.threshold:
            self.compact("auto")
        self.ev("Stop", context_tokens=self.ctx)

    def build(self) -> list:
        rng = self.g.rng
        self.pid = None
        self.ev("SessionStart", source=rng.choice(("startup", "startup", "resume", "clear")))
        long_ = self.prof["accumulate"] or rng.random() < 0.1  # 分ける人もときどき長く続ける
        self.step = (7_000, 14_000) if self.prof["accumulate"] else (4_000, 9_000)
        for _ in range(rng.randint(5, 24) if long_ else rng.randint(2, 7)):
            self.prompt()
        return self.rows


class Gen:
    def __init__(self, rng, event_cols, null_cols, to_day):
        self.rng, self.event_cols, self.null_cols, self.to_day = rng, event_cols, null_cols, to_day


def _weekend(day: int) -> bool:
    return (day + 3) % 7 >= 5  # epoch 日 0 は木曜


def _versions(terms: list) -> list:
    """利用者ごとに版をそろえ、決めた人数だけ古い版にする（乱数は本体の流れと分ける）。"""
    users = sorted({t.user for t in terms})
    rng = random.Random(SEED + 1)
    old_core, old_plugin = set(rng.sample(users, OLD_CORE)), set(rng.sample(users, OLD_PLUGIN))
    out = []
    for t in terms:
        core = t.claude_code_version if t.user in old_core and t.claude_code_version != LATEST_CORE else "2.1.282" if t.user in old_core else LATEST_CORE
        plugin = t.plugin_version if t.user in old_plugin and t.plugin_version != LATEST_PLUGIN else "0.2.0" if t.user in old_plugin else LATEST_PLUGIN
        out.append(dataclasses.replace(t, claude_code_version=core, plugin_version=plugin))
    return out


def _csv_rows(rng, user: str, prof: dict, lo: int, hi: int, start, csv_cols: list, bump_from: int) -> list:
    tier = TIERS[prof["tier"]]
    out = []
    for d in range(lo, hi + 1):
        if rng.random() > tier[2] * (0.12 if _weekend(d) else 1.0):
            continue
        base = tier[3] * rng.uniform(0.5, 1.5) * (1.3 if start is None or d < start else 1.0)
        if d >= bump_from and prof["tier"] in BUMP_TIERS:
            base *= RECENT_BUMP
        parts = [(prof["model"], 1.0)]
        if prof["model"] == "sonnet" and rng.random() < 0.25:
            parts = [("sonnet", 0.8), ("haiku", 0.2)]
        elif prof["model"] == "opus" and rng.random() < 0.4:
            parts = [("opus", 0.75), ("sonnet", 0.25)]
        for m, share in parts:
            cost = round(base * share * (2.5 if m == "opus" else 0.3 if m == "haiku" else 1.0), 2)
            tok = cost / UNIT_PER_MTOK[m] * 1e6
            c = prof["cache"] * rng.uniform(0.95, 1.05)  # 利用者ごとのキャッシュ読みの割合
            i, o, cr, cw = int(tok * (0.87 - c)), int(tok * 0.03), int(tok * c), int(tok * 0.10)
            vals = [(EPOCH + dt.timedelta(days=d)).isoformat(), user,
                    "aws-bedrock" if rng.random() < 0.8 else "google-vertex", MODELS[m], "USD", cost, i, o, cr, cw, cr, i]
            out.append(dict(zip(csv_cols, vals)))
    return out


def main() -> None:
    args = _args()
    sys.path.insert(0, str(args.server.resolve()))
    sys.path.insert(0, str(args.scripts.resolve()))
    from ccgov.constants import EVENT_STUDY_SPAN
    from ccgov.store.queries_events import _HEALTH_NULL_SCOPES
    from ccgov.vendor import contract
    from seed_dashboard import _import_csv, _load
    from seed_dashboard_columns import CSV_RULES, RULES, Ctx
    from seed_dashboard_rows import ERRORS, _row, _terminals, scalar_keys

    rng = random.Random(SEED)
    base_ts = int(ASOF.timestamp())
    today = contract.to_day(base_ts)
    terms, not_introduced = _terminals(rng, args.users, today, args.days)
    terms = _versions(terms)
    introduced = list(dict.fromkeys(t.user for t in terms))
    profs = _profiles(rng, introduced, not_introduced)
    hosts = {u: sum(t.user == u for t in terms) for u in introduced}
    g = Gen(rng, list(RULES["event"]), list(_HEALTH_NULL_SCOPES), contract.to_day)
    rows = []
    for idx, term in enumerate(terms):
        prof = profs[term.user]
        p_day, n_sess = TIERS[prof["tier"]][0] / (1.6 if hosts[term.user] > 1 else 1), TIERS[prof["tier"]][1]
        stop = min(term.stop, today - prof["quit"]) if prof.get("quit") else term.stop
        # 報告の最終日は必ず記録を作る。途絶えていない端末は直近の数日に散らし、基準日に全員が集まらないようにする
        forced = stop - rng.randint(0, RECENT_SPREAD) if stop == today else stop
        for d in range(term.install, stop + 1):
            last = d == forced
            if not last and rng.random() > p_day * (0.15 if _weekend(d) else 1.0):
                continue
            for s in range(rng.randint(*n_sess) if not last else 1):
                hour = rng.choices(range(8, 23), weights=[2, 6, 8, 8, 4, 7, 8, 8, 7, 5, 3, 2, 1, 1, 1])[0]
                ts = d * DAY - JST + hour * 3600 + rng.randint(0, 3599)
                if ts > base_ts:
                    continue
                rows += [_row("policy", Ctx(rng, term.user, ts, term=term, key=k)) for k in scalar_keys()]
                rows += Session(g, term, prof, ts, d >= term.start).build()
                if last and s == 0:
                    rows.append(_row("error", Ctx(rng, term.user, ts, term=term, error=ERRORS[idx % len(ERRORS)])))
    first, last_csv = today - args.days + 1, today - CSV_LAG  # 利用明細は今日と前日の分が無い
    quit_ = {u: today - p["quit"] for u, p in profs.items() if p.get("quit")}
    spans = {t.user: (max(first, t.install - EVENT_STUDY_SPAN), min(last_csv, t.stop, quit_.get(t.user, last_csv)), t.start) for t in terms}
    spans.update({u: (first, last_csv, None) for u in not_introduced})
    costs = []
    for user, (lo, hi, start) in spans.items():
        costs += _csv_rows(rng, user, profs[user], lo, hi, start, list(CSV_RULES), last_csv - BUMP_DAYS + 1)
    _load(rows, costs, False)
    kinds = {k: sum(r["kind"] == k for r in rows) for k in ("event", "policy", "error")}
    print(f"users={args.users} days={args.days} {kinds} cost_daily={len(costs)}")
    tiers = {}
    for u, p in profs.items():
        tiers.setdefault(p["tier"], []).append(u)
    print(json.dumps({t: len(v) for t, v in tiers.items()}))


if __name__ == "__main__":
    main()
