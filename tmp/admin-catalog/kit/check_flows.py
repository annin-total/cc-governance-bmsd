"""操作と差し替えを伴う画面の検査（check.py から呼ぶ）: 状態のページ・概況の状態のカード・カレンダー・古さの警告・O2 と O4・applied_mix・課ごと・不明の行。"""

import datetime as dt
from urllib.parse import parse_qs, urlparse

from check_screen import data_patch

EPOCH = dt.date(1970, 1, 1)
NOW_PAGES = ("policy", "collect")
NOW_CARDS = ("applied_mix", "core_outdated", "plugin_outdated", "plugin_errors")
ASOF = "2026-09-01"
TOKENS = {"ok": "--ok", "none": "--warn", "off": "--ng"}  # applied_mix の帯の色（すべて適用・未導入・未適用）
USER_TABS = ("sections", "user_cost", "user_all", "over_users")  # コストと利用者のうち、案にあるものを調べる（不明の行を必ず持つのは over_users 以外）
MAIN_JS = "document.querySelector('main').innerText"
BAND_JS = "document.querySelector('.band [data-period-display]').textContent"
CARD_JS = "(r) => { const c = document.querySelector(`main .card[data-ref=${r}]`); return c ? [c.textContent, c.dataset.state, c.classList.contains('is-dim')] : null; }"
CAL_JS = """(() => Array.from(document.querySelectorAll('[data-cal] [data-day]')).map((b) => [Number(b.dataset.day), b.className, b.disabled]))()"""
ONLY_WARN = "for (const k of Object.keys(v.p)) { const o = v.p[k].r3.over; if (o) for (const s of o.spans) { o[s].warn = o[s].warn || 1; o[s].ng = 0; } }"


def md(day: int) -> str:
    return (EPOCH + dt.timedelta(days=day)).strftime("%m/%d")


def _goto(page, url: str):
    page.goto(url)
    page.wait_for_load_state("load")


def now_pages(page, base: str, meta: dict) -> list:
    """状態のページ: 帯が今日の時点で押してもカレンダーが開かず、期間のタブが無い。asof を付けても同じ。期間のページへ移ると asof が戻る。"""
    out, want = [], f"{md(meta['today'])} 時点"
    for pid in NOW_PAGES:
        _goto(page, f"{base}?page={pid}")
        plain = (page.evaluate(MAIN_JS), page.evaluate(BAND_JS))
        page.click(".band [data-period-display]")
        if plain[1] != want or page.locator("[data-cal]").count() or page.locator(".band .chipbar.period").count():
            out.append(f"{pid}: 帯が「{want}」でない・押すとカレンダーが開く・期間のタブがある（{plain[1]}）")
        _goto(page, f"{base}?page={pid}&asof={ASOF}")
        if (page.evaluate(MAIN_JS), page.evaluate(BAND_JS)) != plain:
            out.append(f"{pid}: asof を付けると値か帯が変わる")
        page.click("header a[href*='page=cost']")
        page.wait_for_load_state("load")
        if parse_qs(urlparse(page.url).query).get("asof") != [ASOF]:
            out.append(f"{pid}: 期間のページへ移ると asof が戻らない（{page.url}）")
    return out


def home_now_cards(page, base: str, meta: dict) -> list:
    """概況の状態のカード: asof と期間を変えても値が変わらず、「今日 時点」を持つ。"""
    out, seen = [], {}
    for q in ("", f"&asof={ASOF}", "&period=28", f"&period=12m&asof={ASOF}"):
        _goto(page, f"{base}?page=home{q}")
        for r in NOW_CARDS:
            got = page.evaluate(CARD_JS, r)
            if got is None or f"{md(meta['today'])} 時点" not in got[0]:
                out.append(f"概況{q}: {r} が無いか「今日 時点」を持たない")
            elif seen.setdefault(r, got[0]) != got[0]:
                out.append(f"概況{q}: {r} の中身が asof・期間で変わる")
    return out


def calendar(page, base: str, meta: dict) -> list:
    """カレンダー: 3 つの見せ方の日がある・取り込み待ちと選べる最初の日より前が押せない・押せる日を押すと asof が変わる。"""
    out = []
    _goto(page, f"{base}?page=cost")
    page.click("[data-cal-open]")
    cells = page.evaluate(CAL_JS)
    for kind in ("cal-has", "cal-wait", "cal-none"):
        if not any(kind in c for _, c, _ in cells):
            out.append(f"カレンダー: {kind} の日が無い")
    if [d for d, c, off in cells if ("cal-wait" in c or d > meta["end"]) and not off]:
        out.append("カレンダー: 取り込み待ちか利用明細の最終日より後の日が押せる")
    for _ in range(24):  # 選べる最初の日の月まで戻す
        if any(d == meta["first_pick"] for d, _, _ in page.evaluate(CAL_JS)):
            break
        page.click("[data-cal-move='-1']")
    cells = page.evaluate(CAL_JS)
    if [d for d, _, off in cells if d < meta["first_pick"] and not off] or [d for d, _, off in cells if d == meta["first_pick"] and off]:
        out.append("カレンダー: 選べる最初の日より前が押せるか、最初の日が押せない")
    pick = meta["end"] - 3
    _goto(page, f"{base}?page=cost")
    page.click("[data-cal-open]")
    page.click(f"[data-cal] [data-day='{pick}']")
    page.wait_for_load_state("load")
    if parse_qs(urlparse(page.url).query).get("asof") != [(EPOCH + dt.timedelta(days=pick)).isoformat()]:
        out.append(f"カレンダー: 日を押しても asof が変わらない（{page.url}）")
    return out


def stale(ctx, base: str, pages: list) -> list:
    """古さの警告: 今日を最終日 + 2 にすると出ず、+ 3 で全ページの帯に出る。csv_freshness の札も同じ境で切り替わる。"""
    out = []
    for add, want in ((-1, False), (0, True)):
        page = ctx.new_page()
        page.add_init_script(data_patch(f"v.meta.today = v.meta.csv_end + v.meta.csv_stale_days + ({add})"))
        for pid in pages:
            _goto(page, f"{base}?page={pid}")
            if bool(page.locator(".band [data-stale]").count()) != want:
                out.append(f"古さの警告: {pid} で今日 = 最終日 + 閾値{add:+d} の帯の警告が {'無い' if want else 'ある'}")
        _goto(page, f"{base}?page=collect")
        got = page.evaluate(CARD_JS, "csv_freshness")
        if got and (got[1] == "warn") != want:
            out.append(f"古さの警告: csv_freshness の札が警告と食い違う（{got[1]}・警告 {want}）")
        page.close()
    return out


def ng_only(ctx, base: str) -> list:
    """O2・O4: 注意の人だけがいるデータで、カードに札が無く、絞り込み「注意以上」で薄くなる。"""
    out = []
    page = ctx.new_page()
    page.add_init_script(data_patch(ONLY_WARN))
    for form in ("O2", "O4"):
        for pid in ("home", "cost"):
            _goto(page, f"{base}?page={pid}&over={form}&filter=warn")
            for r in ("over_day", "over_week"):
                got = page.evaluate(CARD_JS, r)
                if not got or got[1] == "warn" or not got[2]:
                    out.append(f"{form} {pid}: 注意だけのとき {r} に札があるか薄くならない（{got and got[1:]}）")
    page.close()
    return out


def applied_mix(page, base: str, data: dict) -> list:
    """applied_mix: 3 区分の合計が対象と一致し、未適用・未導入が off_users・not_introduced と一致する。帯の色は状態の色。"""
    out, mix = [], data["fixed"]["r3"]["policy"]["mix"]
    _goto(page, f"{base}?page=home")
    js = "(t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [getComputedStyle(document.querySelector(`.mix-${k}`)).backgroundColor, (() => { const e = document.createElement('i'); e.style.background = `var(${v})`; document.body.append(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; })(), Number(document.querySelector(`.stack .mix-${k}`).style.flexGrow)]]))"
    got = page.evaluate(js, TOKENS)
    if sum(g[2] for g in got.values()) != mix["total"]:
        out.append(f"applied_mix: 帯の合計 {sum(g[2] for g in got.values())} が対象 {mix['total']} と合わない")
    out += [f"applied_mix: {k} の色が {TOKENS[k]} でない" for k, g in got.items() if g[0] != g[1]]
    vals = page.locator("main .card[data-ref=applied_mix] .k-value").all_inner_texts()
    _goto(page, f"{base}?page=policy")
    want = [page.locator(f"main .card[data-ref={r}] .k-value").inner_text() for r in ("off_users", "not_introduced")]
    if vals != want:
        out.append(f"applied_mix: 未適用・未導入 {vals} が off_users・not_introduced {want} と合わない")
    return out


def org(page, base: str, data: dict) -> list:
    """課ごとの部の絞り込みが部の行と合う。部・課が不明の行（課ごと・利用者ごと）に状態の札が無い。"""
    out = []
    _goto(page, f"{base}?page=cost&period=28#sections")
    rows = data["p"]["28"]["r3"]["sections"]
    for dept in data["fixed"]["org"]["depts"]:
        page.click(f"#sections [data-dept-chip='{dept}']")
        shown = page.locator("#sections tbody tr:visible").count()
        if shown != sum(r["dept"] == dept for r in rows):
            out.append(f"課ごと: 部 {dept} で絞った行 {shown} が部の行の数と合わない")
    tabs = [t for t in USER_TABS if t in page.evaluate("Array.from(document.querySelectorAll('[data-panel]')).map((p) => p.id)")]
    if not any(t in tabs for t in ("user_cost", "user_all")):
        out.append(f"コストと利用者に利用者ごとのタブが無い（{tabs}）")
    for tab in tabs:
        _goto(page, f"{base}?page=cost&period=28#{tab}")
        bad = page.locator(f"#{tab} tbody tr[data-dept=unknown] :is(td.c-dept, td.c-section) .mark").count()
        bad += page.locator("#sections tbody tr[data-dept=unknown] .mark").count() if tab == "sections" else 0
        if (tab != "over_users" and not page.locator(f"#{tab} tbody tr[data-dept=unknown]").count()) or bad:
            out.append(f"{tab}: 不明の行が無いか、不明の行に状態の札がある（{bad}）")
    return out
