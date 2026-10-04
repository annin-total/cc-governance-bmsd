"""案の検査: (1) 同じページに同じカードが 2 回出ない (2) 基準超えの区分が期間のタブに合う (3) 設計 2 章の全カード・全タブが目録にある
(4) 状態の判定が閾値の「以上」で動き、データの札・窓の終わり・合計が合う (5) 画面の決まり（check_screen.py）(6) 操作と差し替えの検査（check_flows.py）。

使い方: python kit/check.py ideas/NN-<slug>（playwright の入った Python で）。1 つでも外れたら終了コード 1。
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))
import judge  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_flows  # noqa: E402
import check_screen  # noqa: E402

PERIODS = ("7", "28", "12m")
IA_JS = "window.IA.pages.map((p) => ({ id: p.id, periods: Boolean(p.periods), home: Boolean(p.home), over: (p.cards || []).some((c) => /^over_/.test(c.ref)) }))"
REFS_JS = "Array.from(document.querySelectorAll('main .card[data-ref]')).map((c) => c.dataset.ref)"
# 基準超え: 期間ごとに出してよい区分（7 日＝日次・週次、28 日＝月次、12 か月は出さない）
OVER_SPANS = {"7": {"day", "week"}, "28": {"month"}, "12m": set()}
OVER_REF = re.compile(r"^over_(day|week|month)")
USERS_RANGE = (180, 220)  # meta.users（約 200 名）
OVER_FORMS = ("O1", "O2", "O3", "O4")
CATALOG_JS = "({ cards: Object.keys(window.CATALOG.K), tabs: Object.values(window.CATALOG.T).flatMap((t) => [t.id, (t.long || {}).id]).filter(Boolean) })"


def _design_ids() -> tuple:
    """concepts.md の 2.1・2.5（カード）と 2.2（タブ）の id。"""
    text = (ROOT / "concepts.md").read_text(encoding="utf-8")
    sec = lambda a, b: text[text.index(a):text.index(b)]  # noqa: E731
    cards = set(re.findall(r"^\| `(\w+)` \|", sec("### 2.1", "### 2.2") + sec("### 2.5", "## 3."), re.M))
    cards |= set(re.findall(r"`(\w+)`", re.search(r"\*\*設定の効果\*\* — (.*?)タブ", text).group(1)))
    tabs = set()
    for line in re.findall(r"^\| (`[^|]+) \|", sec("### 2.2", "### 2.3"), re.M):
        tabs |= set(re.findall(r"`(\w+)`", line))
    return cards, tabs


def _dom(idea: Path) -> list:
    problems = []
    base = (idea / "index.html").as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base)
        pages, catalog = page.evaluate(IA_JS), page.evaluate(CATALOG_JS)
        for pg in pages:
            for period in PERIODS if pg["periods"] else (None,):
                page.goto(f"{base}?page={pg['id']}" + (f"&period={period}" if period else ""))
                problems += check_screen.page_problems(page, f"{pg['id']} {period or ''}", pg["id"], pg["home"])
                refs = page.evaluate(REFS_JS)
                dup = [k for k, n in Counter(refs).items() if n > 1]
                if dup:
                    problems.append(f"{pg['id']} {period or ''}: 同じカードが 2 回: {dup}")
                spans = {m.group(1) for m in map(OVER_REF.match, refs) if m}
                if period and spans != (OVER_SPANS[period] if pg["over"] else set()):
                    problems.append(f"{pg['id']} {period}: 基準超えの区分が期間に合わない: {sorted(spans)}")
        for form in OVER_FORMS:  # 基準超えの見せ方ごとに、見出しが 1 行・2 列幅以下か
            for pid, period in (("home", "7"), ("home", "28"), ("cost", "7"), ("cost", "28")):
                page.goto(f"{base}?page={pid}&period={period}&over={form}")
                problems += check_screen.page_problems(page, f"{pid} {period} {form}", pid, pid == "home")
        data, meta = _load(), page.evaluate("window.DATA.meta")
        problems += check_flows.now_pages(page, base, meta) + check_flows.home_now_cards(page, base, meta) + check_flows.calendar(page, base, meta)
        problems += check_flows.applied_mix(page, base, data) + check_flows.org(page, base, data)
        ctx = browser.new_context()
        problems += check_flows.stale(ctx, base, [pg["id"] for pg in pages]) + check_flows.ng_only(ctx, base)
        browser.close()
    cards, tabs = _design_ids()
    for kind, want, have in (("カード", cards, catalog["cards"]), ("タブ", tabs, catalog["tabs"])):
        missing = sorted(want - set(have))
        if missing:
            problems.append(f"設計 2 章の{kind}が目録に無い: {missing}")
    return problems


def _thresholds() -> list:
    """閾値ちょうど・直前の値で判定を確かめる。"""
    cases = [
        (judge.rise(10, judge.COST_RISE), judge.WARN), (judge.rise(9.9, judge.COST_RISE), judge.OK), (judge.rise(15, judge.COST_RISE), judge.NG),
        (judge.drop(-10, judge.USERS_DROP), judge.WARN), (judge.drop(-9.9, judge.USERS_DROP), judge.OK), (judge.drop(-15, judge.USERS_DROP), judge.NG),
        (judge.over(1, judge.CORE_OUTDATED_ELEVATED), judge.WARN), (judge.over(0, judge.CORE_OUTDATED_ELEVATED), judge.OK),
        (judge.over(1, judge.ERROR_COUNT_ELEVATED), judge.WARN), (judge.over(1, None, judge.NON_COMPLIANT_USERS_HIGH), judge.NG),
        (judge.over(20, judge.NULL_RATE_ELEVATED, judge.NULL_RATE_HIGH), judge.WARN), (judge.over(50, judge.NULL_RATE_ELEVATED, judge.NULL_RATE_HIGH), judge.NG),
        (judge.over(3, judge.CSV_STALE_DAYS), judge.WARN), (judge.over(2, judge.CSV_STALE_DAYS), judge.OK),
    ]
    for k in ("day", "week", "month"):
        e, h = judge.USER_COST_ELEVATED[k], judge.USER_COST_HIGH[k]
        cases += [(judge.over(e, e, h), judge.WARN), (judge.over(e - 0.01, e, h), judge.OK), (judge.over(h, e, h), judge.NG)]
    return [f"閾値の判定 {i}: {got} ≠ {want}" for i, (got, want) in enumerate(cases) if got != want]


def _load() -> dict:
    text = (ROOT / "data" / "data.js").read_text(encoding="utf-8")
    return json.loads(text[text.index("{"):text.rindex("}") + 1])


def _windows(d: dict) -> list:
    """窓の終わり: bill・rec・match7 は利用明細の最終日、rec7・p30 は今日。人数は約 200 名。"""
    m, out = d["meta"], []
    ends = {f"p.{k}.period（rec）": d["p"][k]["period"]["end"] for k in PERIODS}
    ends.update({f"p.{k}.r3.cost（bill）": d["p"][k]["r3"]["cost"]["end"] for k in PERIODS})
    ends["fixed.now.match（match7）"] = d["fixed"]["now"]["match"]["end"]
    out += [f"{k} の終わりが利用明細の最終日でない" for k, v in ends.items() if v != m["csv_end"]]
    for k, v in (("fixed.now.period（rec7）", d["fixed"]["now"]["period"]["end"]), ("fixed.r3.policy（p30）", d["fixed"]["r3"]["policy"]["end"])):
        if v != m["today"]:
            out.append(f"{k} の終わりが今日でない")
    if not USERS_RANGE[0] <= m["users"] <= USERS_RANGE[1]:
        out.append(f"meta.users {m['users']} が {USERS_RANGE} に無い")
    return out


def _org(d: dict) -> list:
    """課ごとの合計が利用者数・コストに一致し（不明を含む）、部で絞った行の合計が部ごとの利用者の数と一致する。applied_mix の 3 区分の合計。"""
    out = []
    for k in PERIODS:
        rows, c = d["p"][k]["r3"]["sections"], d["p"][k]["r3"]["cost"]
        if sum(r["users"] for r in rows) != c["users"] or abs(sum(r["cost"] for r in rows) - c["total"]) > 0.01:
            out.append(f"p.{k} sections の合計が billed_users・cost と合わない")
        billed = Counter(r["dept"] for r in d["p"][k]["x"]["billed"] if r["cost"] > 0)
        by = Counter()
        for r in rows:
            by[r["dept"]] += r["users"]
        if by != billed:
            out.append(f"p.{k} sections の部ごとの利用者 {dict(by)} が利用者ごとの部 {dict(billed)} と合わない")
    pol = d["fixed"]["r3"]["policy"]
    mix, counts = pol["mix"], pol["counts"]
    if mix["ok"] + mix["off"] + mix["none"] != pol["denominator"] or (mix["off"], mix["none"]) != (counts["off"], counts["none"]):
        out.append(f"applied_mix {mix} が対象・off_users・not_introduced と合わない")
    return out


def _data() -> list:
    """data.js の札が、値と閾値から判定し直したものと合うか。"""
    d = _load()
    out = _windows(d) + _org(d)
    for key in ("7", "28"):
        c = d["p"][key]["r3"]["cost"]
        for state, rate, rule in (("state", "per_bd_change", judge.rise), ("per_user_state", "per_user_bd_change", judge.rise)):
            if c[state] != rule(c[rate], judge.COST_RISE):
                out.append(f"p.{key} {state} が {rate} と合わない")
        if c["users_state"] != judge.drop(c["users_change"], judge.USERS_DROP):
            out.append(f"p.{key} users_state が合わない")
    for key, spans in (("7", ("day", "week")), ("28", ("month",))):
        over = d["p"][key]["r3"]["over"]
        if over["spans"] != list(spans) or "12m" in d["p"] and "over" in d["p"]["12m"]["r3"]:
            out.append(f"p.{key} の基準を超えた利用者の区分が期間に合わない: {over['spans']}")
        for r in over["rows"]:
            if r["state"] != judge.over(r["value"], judge.USER_COST_ELEVATED[r["span"]], judge.USER_COST_HIGH[r["span"]]):
                out.append(f"p.{key} over_users の {r['email']}（{r['span']}）の状態が金額と合わない")
        for s in spans:
            c = over[s]
            if c["users"] != c["ng"] + c["warn"] or c["delta"] != c["users"] - c["prev_users"] or c["prev_users"] != c["prev_ng"] + c["prev_warn"]:
                out.append(f"p.{key} {s} の人数が内訳と合わない")
            rows = [r for r in over["rows"] if r["span"] == s]  # 一覧を基準で絞ったときの人数が、カードの人数と合うか
            got = {"new": sum(r["kind"] == "new" for r in rows), "left": sum(r["kind"] == "left" for r in rows),
                   "ng": sum(r["state"] == judge.NG for r in rows), "warn": sum(r["state"] == judge.WARN for r in rows)}
            if any(got[k] != c[k] for k in got):
                out.append(f"p.{key} {s}: 一覧の区分と人数 {got} がカードと合わない")
    return out


def main() -> None:
    idea = Path(sys.argv[1]).resolve()
    problems = _thresholds() + _data() + check_screen.static_fonts() + _dom(idea)
    for p in problems:
        print(p)
    print("すべて合格" if not problems else f"{len(problems)} 件の問題")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
