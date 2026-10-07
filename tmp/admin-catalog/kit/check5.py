"""案 51 の操作と画面の検査（check.py から呼ぶ。concepts5.md の 7 章）: 31 に 51 の機能が無い・状態のページ・カレンダー（全型）・固定のヘッダー・比較のパネル。
カードの検査は check5_cards.py、部署は check5_org.py。"""

import datetime as dt
from urllib.parse import parse_qs, urlparse

EPOCH = dt.date(1970, 1, 1)
# 31 の画面に無いこと: カレンダー・部署の絞り込み・課の列・部署ごと・取り込みの欄・比較のパネル・51 の部品
ABSENT_31 = ("[data-cal-open]", ".cal-strip", "[data-df]", "td.c-person", "#depts", ".org-import", "[data-cmp5]", ".k5-wrap", ".chip-note", ".sum-s2", "[data-fold]", ".fold-more")
ABSENT_PAGES = ("?page=home", "?page=cost", "?page=cost#user_cost", "?page=settings", "?page=activity#user_use")
USERS_31 = 40
NOW_PAGES = ("policy", "collect")
STAMP_CARDS = ("all_applied", "off_users", "not_introduced", "core_outdated", "plugin_outdated")
CAL_TYPES = ("CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7")
ASOF = "2026-09-01"
SCROLL_Y = 600
HEAD_MAX = 44  # HV3・HV4（スクロール後）のヘッダーの高さ（px）
BAND_JS = "(() => { const e = document.querySelector('[data-period-display]'); return e ? e.textContent.trim() : null; })()"
CELLS_JS = "Array.from(document.querySelectorAll('[data-cal] [data-day]')).map((b) => [Number(b.dataset.day), b.className, b.disabled, Number(b.dataset.pick || b.dataset.day)])"
CARD_TEXT_JS = "(r) => { const c = document.querySelector(`main .card[data-ref=${r}]`); return c ? c.textContent : null; }"


def md(day: int) -> str:
    return (EPOCH + dt.timedelta(days=day)).strftime("%m/%d")


def goto(page, url: str) -> None:
    page.goto(url)
    page.wait_for_load_state("load")


def _asof(page) -> list:
    return parse_qs(urlparse(page.url).query).get("asof", [])


def absent_31(page, base: str) -> list:
    """31 の画面に 51 の機能が無く、読むデータが data.js（40 名）で、ヘッダーが固定でない。"""
    out = []
    for q in ABSENT_PAGES:
        goto(page, base + q)
        found = [s for s in ABSENT_31 if page.locator(s).count()]
        if found:
            out.append(f"31 {q}: 51 の機能がある {found}")
        if page.evaluate("getComputedStyle(document.querySelector('header.top')).position") == "sticky":
            out.append(f"31 {q}: ヘッダーが固定されている")
    src = page.evaluate("Array.from(document.scripts).map((s) => s.getAttribute('src') || '').filter((s) => /data\\/data\\d*\\.js$/.test(s))")
    if src != ["../../data/data.js"] or page.evaluate("window.DATA.meta.users") != USERS_31:
        out.append(f"31: 読むデータが data.js（{USERS_31} 名）でない（{src}）")
    return out


def now_pages(page, base: str, meta: dict) -> list:
    """状態のページ: 帯が今日の「MM/DD 時点」で押せず、期間のタブが無い。asof を付けても中身と帯が変わらない。概況の状態のカードは「今日 時点」。"""
    out, want = [], f"{md(meta['today'])} 時点"
    for pid in NOW_PAGES:
        goto(page, f"{base}?page={pid}")
        plain = (page.inner_text("main"), page.evaluate(BAND_JS))
        if plain[1] != want or page.locator("[data-period-display] button").count() or page.locator(".chipbar.period").count():
            out.append(f"{pid}: 帯が「{want}」でないか、押せるか、期間のタブがある（{plain[1]}）")
        goto(page, f"{base}?page={pid}&asof={ASOF}")
        if (page.inner_text("main"), page.evaluate(BAND_JS)) != plain:
            out.append(f"{pid}: asof を付けると中身か帯が変わる")
    for q in ("", f"&asof={ASOF}&period=28"):
        goto(page, f"{base}?page=home{q}")
        for r in STAMP_CARDS:
            text = page.evaluate(CARD_TEXT_JS, r)
            if not text or want not in text:
                out.append(f"概況{q}: {r} が無いか「{want}」を持たない")
    return out


def _open(page) -> None:
    if page.locator("[data-cal-open]").count():
        page.locator("[data-cal-open]").first.click()


def calendar(page, base: str, meta: dict) -> list:
    """どの型も: 3 つの見せ方の日がある・取り込み待ちと範囲の外が押せない・押せる日を押すと asof が押した日（CA4 はその週の最後の選べる日）・「最新」で asof が外れる。"""
    out = []
    for cal in CAL_TYPES:
        goto(page, f"{base}?page=cost&cal={cal}")
        _open(page)
        cells = page.evaluate(CELLS_JS)
        if not any("cal-has" in c for _, c, _, _ in cells) or not any("cal-wait" in c for _, c, _, _ in cells):
            out.append(f"{cal}: 利用明細ありか取り込み待ちの日が無い")
        bad = [d for d, c, off, to in cells if not off and ("cal-wait" in c or to > meta["end"] or to < meta["first_pick"])]
        if bad:
            out.append(f"{cal}: 取り込み待ちか範囲の外の日が押せる {[md(d) for d in bad[:3]]}")
        pick = next(((d, to) for d, c, off, to in cells if not off and d == meta["end"] - 3), None)
        if not pick:
            out.append(f"{cal}: 最終日の 3 日前が押せない")
            continue
        page.locator(f"[data-cal] [data-day='{pick[0]}']").first.click()
        page.wait_for_load_state("load")
        if _asof(page) != [(EPOCH + dt.timedelta(days=pick[1])).isoformat()]:
            out.append(f"{cal}: 日を押しても asof が押した日にならない（{page.url}）")
        _open(page)
        page.locator("[data-cal-latest]").first.click()
        page.wait_for_load_state("load")
        if _asof(page):
            out.append(f"{cal}: 「最新」で asof が外れない")
    return out


def sticky(page, base: str) -> list:
    """スクロールの後、ヘッダーは上端にあり、帯は上端に無い。HV3・HV4 のスクロール後のヘッダーは 44px 以下。"""
    out = []
    for hv in ("HV1", "HV2", "HV3", "HV4"):
        goto(page, f"{base}?page=home&hv={hv}")
        page.evaluate(f"window.scrollTo({{ top: {SCROLL_Y}, behavior: 'instant' }})")
        page.wait_for_timeout(400)
        g = page.evaluate("({ top: document.querySelector('header.top').getBoundingClientRect().top, h: document.querySelector('header.top .bar').getBoundingClientRect().height,"
                          " band: document.querySelector('main .page-head').getBoundingClientRect().top })")
        if abs(g["top"]) > 0.5 or g["band"] >= 0:
            out.append(f"{hv}: スクロール後、ヘッダーが上端に無いか帯が残っている（{g}）")
        if hv in ("HV3", "HV4") and g["h"] > HEAD_MAX:
            out.append(f"{hv}: スクロール後のヘッダーの高さ {g['h']}px が {HEAD_MAX}px を超える")
    return out


def compare_panel(browser, base: str) -> list:
    """localStorage が空・使えないとき「☰ 比較」だけで閉じている。ボタンを外しても中身の位置が変わらない。行の数とコピーする URL。"""
    out = []
    for blocked in (False, True):
        ctx = browser.new_context()
        if blocked:
            ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } })")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        goto(page, f"{base}?page=home")
        if page.locator("[data-cmp-toggle]").count() != 1 or page.locator(".cmp-panel").is_visible() or errors:
            out.append(f"比較（localStorage {'使えない' if blocked else '空'}）: ボタンが 1 つでないか、パネルが開いているか、例外 {errors[:1]}")
        ctx.close()
    page = browser.new_page()
    goto(page, f"{base}?page=cost")
    pos = "JSON.stringify(Array.from(document.querySelectorAll('main .card')).slice(0, 4).map((c) => c.getBoundingClientRect().toJSON()))"
    with_btn = page.evaluate(pos)
    page.evaluate("document.querySelector('[data-cmp5]').remove()")
    if page.evaluate(pos) != with_btn:
        out.append("比較: ボタンを外すとページの中身の位置が変わる")
    goto(page, f"{base}?page=cost")
    keys = page.evaluate("Object.keys(window.KIT.compare5.SWITCHES)")
    if page.locator("[data-cmp-row]").count() != len(keys):
        out.append("比較: パネルの行の数が切り替えの表と合わない")
    q = parse_qs(urlparse(page.evaluate("window.KIT.compare5.fullUrl()")).query)  # 問い合わせに切り替えが無いページから
    missing = [k for k in keys if k not in q]
    goto(page, f"{base}?page=cost&g=G3&chart=K2")
    q = parse_qs(urlparse(page.evaluate("window.KIT.compare5.fullUrl()")).query)
    if missing or q.get("g") != ["G3"] or q.get("chart") != ["K2"]:
        out.append(f"比較: コピーする URL に全切り替えの今の値が無い（無いキー {missing}）")
    page.close()
    return out
