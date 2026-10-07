"""案 51 の人数とコストの割合の検査（check.py から呼ぶ）: 図の合計と置き場・コストの多い課（CD5）。"""

from check5 import goto

CONC_JS = "Array.from(document.querySelectorAll('main .conc-wrap')).map((w) => [w.dataset.conc, Number((w.querySelector('[data-cost-total]') || {}).dataset?.costTotal)])"


def conc(page, base: str, data: dict) -> list:
    """人数とコストの割合: どの型・置き場でも、図に使ったコストの合計が利用明細のコストと一致する。置き場がカードならタブが無く、タブならカードが無い。"""
    out = []
    for period in ("7", "28"):
        total = data["p"][period]["r3"]["cost"]["total"]
        for cc, cd in zip(("CC1", "CC2", "CC3", "CC4"), ("CD1", "CD2", "CD3", "CD4")):
            for at in ("card", "tab"):
                goto(page, f"{base}?page=cost&period={period}&conc={cc}&concd={cd}&concAt={at}#conc")
                got = page.evaluate(CONC_JS)
                cards, tab = page.locator("main .card[data-ref^=conc_]").count(), page.locator("#conc").count()
                if sorted(t for t, _ in got) != [cc, cd] or (cards, tab) != ((2, 0) if at == "card" else (0, 1)):
                    out.append(f"集中 {period} {cc} {cd} {at}: 図か置き場が違う（{got} カード {cards} タブ {tab}）")
                out += [f"集中 {period} {t} {at}: 図の合計 {v} が利用明細のコスト {total:.2f} と合わない" for t, v in got if not abs(v - total) < 0.01]
    return out


TOP_JS = "Array.from(document.querySelectorAll('main .card[data-ref=conc_depts] .conc-top .conc-drow')).map((r) => [r.dataset.sec, Number(r.dataset.cost)])"
TAB_SECS_JS = "Array.from(document.querySelectorAll('#depts tbody tr[data-kind=section]')).map((r) => [r.dataset.sec, Number(r.querySelector('td.c-usd_strong').dataset.v)])"


def top_sections(page, base: str) -> list:
    """CD5: コストの多い課の 5 つが多い順で、部署ごとのタブの課の行の上位 5 つ（不明を除く）と課と金額が一致する。"""
    out = []
    for period in ("7", "28", "12m"):
        goto(page, f"{base}?page=cost&period={period}#depts")
        got, tab = page.evaluate(TOP_JS), page.evaluate(TAB_SECS_JS)
        want = sorted(tab, key=lambda r: -r[1])[:5]
        if len(got) != 5 or [g[1] for g in got] != sorted((g[1] for g in got), reverse=True) or [g[0] for g in got] != [w[0] for w in want] \
                or any(abs(g[1] - w[1]) > 0.005 for g, w in zip(got, want)):
            out.append(f"CD5 {period}: コストの多い課が部署ごとのタブの上位 5 課と合わない（{got} ≠ {want}）")
    return out
