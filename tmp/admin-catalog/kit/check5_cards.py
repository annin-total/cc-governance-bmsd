"""案 51 のカードの検査（check.py から呼ぶ。concepts5.md の 7 章）: カードの組・群 G3・コストのグラフ K・基準超え D・月末の見込みの前月の実績・サマリー S2。
期待する値は設計の表をここに写し、画面を描く目録（cards5.js など）からは読まない。"""

from check5 import goto

HOME_COUNTS = {"7": 12, "28": 11, "12m": 10}
COST_MUST = ("top_spenders", "new_users", "cache_read_share")
COST_CARDS = ("cost_total", "per_bd", "per_user_bd", "forecast")
CHARTS = {  # 4.3 の型の表（部品＋足すもの）
    "K1": ("bars", "pair", "pair", "cum"),
    "K2": ("bars", "bdbars", "bdbars", "cum+bars"),
    "K3": ("area", "bdbars", "pair", "cum"),
    "K4": ("area", "bdbars+avg", "dist", "cum+prev"),
    "K5": ("grid", "bdbars+avg", "dist+strip", "cum+prev"),
    "K6": ("split", "bdbars+avg", "line", "cum+prev"),
    "K7": ("area+shadow", "bdbars+avg", "dist", "cum+prev"),
}
# 時系列の部品（K7 の影を除く）は前と直近を同じ軸に並べる: 軸の日数が期間の 2 倍で、前と直近の色が違う
SERIES_JS = """(days) => Array.from(document.querySelectorAll('main .k5-wrap svg[data-days]')).map((s) => {
  const col = (sel) => { const e = s.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return e.tagName === 'rect' ? cs.fill : cs.stroke; };
  return [s.closest('.card').dataset.ref, Number(s.dataset.days), col('.k5-old'), col('.k5-new')]; })"""
PART_JS = """(r) => { const c = document.querySelector(`main .card[data-ref=${r}]`); if (!c) return null;
  const w = c.querySelector('.k5-wrap'), has = (s) => Boolean(c.querySelector(s));
  if (!w) return has('.fc-cum') ? 'cum' : has('.pair') ? 'pair' : has('.spark') ? 'bars' : '?';
  const extra = [['.k5-shadow', 'shadow'], ['.k5-avg', 'avg'], ['.k5-strip', 'strip'], ['.k5-prev', 'prev']].filter(([s]) => has(s)).map(([, n]) => n);
  if (w.dataset.part === 'cum' && has('rect.bar-hi')) extra.push('bars');
  return [w.dataset.part, ...extra].join('+'); }"""
REFS_JS = "Array.from(document.querySelectorAll('main .card[data-ref]')).map((c) => c.dataset.ref)"
STATES = ("ok", "warn", "ng")
OVER_JS = """(r) => { const c = document.querySelector(`main .card[data-ref=${r}]`); if (!c) return null;
  return { bigs: Array.from(c.querySelectorAll('.ov-big')).map((b) => [b.querySelector('.k-value').textContent, b.textContent]), text: c.textContent,
    table: Array.from(c.querySelectorAll('.ov-table tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent)),
    dots: Array.from(c.querySelectorAll('.ov-dot-row')).map((row) => [row.querySelectorAll('.ov-sq').length, row.querySelectorAll('.ov-sq.is-new').length, row.querySelectorAll('[class*=is-out]').length]) }; }"""


def cards(page, base: str) -> list:
    """概況のカードの組（cost が無く cost_total・per_bd がある・プラグインのエラーと top_spenders が無い・枚数）とコストと利用者の 3 枚。"""
    out = []
    for period, n in HOME_COUNTS.items():
        goto(page, f"{base}?page=home&period={period}")
        refs = page.evaluate(REFS_JS)
        if "cost" in refs or not {"cost_total", "per_bd"} <= set(refs) or {"plugin_errors", "top_spenders"} & set(refs) or len(refs) != n:
            out.append(f"概況 {period}: カードの組が設計と違う（{len(refs)} 枚 {refs[:4]}…）")
    goto(page, f"{base}?page=cost")
    missing = [r for r in COST_MUST if r not in page.evaluate(REFS_JS)]
    if missing:
        out.append(f"コストと利用者: {missing} が無い")
    return out


def groups_g3(page, base: str) -> list:
    """G3: どの専用ページも群が 3 つ以下で、群の中の窓が 1 つ。"""
    goto(page, f"{base}?page=cost&g=G3")
    pages = page.evaluate("window.IA.pages.filter((p) => !p.home && p.groups).map((p) => [p.id, p.groups.map((g) => [...new Set(g.cards.map((c) => c.win))].length)])")
    return [f"G3 {pid}: 群が {len(g)} つか、窓が 2 つ以上の群がある {g}" for pid, g in pages if len(g) > 3 or any(n != 1 for n in g)]


def charts(page, base: str) -> list:
    """K: 型ごとに 4 枚の部品が表のとおり。K4 の 7 日は 4 枚すべて違う。12 か月に影・基準線・2 本の棒が無い。"""
    out = []
    for k, want in CHARTS.items():
        goto(page, f"{base}?page=home&chart={k}")
        got = tuple(page.evaluate(PART_JS, r) for r in COST_CARDS)
        if got != want:
            out.append(f"{k}: 部品が表と違う {got} ≠ {want}")
        for ref, days, old, new in page.evaluate(SERIES_JS, 7):
            if days != 14 or not old or not new or old == new:
                out.append(f"{k} {ref}: 時系列が前と直近の 14 日を同じ軸に持たないか、色が 2 つでない（{days} 日 {old} {new}）")
        if k in ("K2", "K3", "K4", "K6") and not page.evaluate(SERIES_JS, 7):
            out.append(f"{k}: 前と直近を並べる時系列の部品が無い")
        if k == "K4" and len({(g or "").split("+")[0] for g in got}) != len(got):
            out.append(f"K4: 7 日の 4 枚に同じ部品がある {got}")
        goto(page, f"{base}?page=home&period=12m&chart={k}")
        sel = ", ".join(f"main .card[data-ref={r}] {s}" for r in COST_CARDS for s in (".k5-shadow", ".k5-avg", ".pair"))
        if page.locator(sel).count():
            out.append(f"{k} 12 か月: 影・基準線・2 本の棒がある")
    return out


def _moves(rows: list, span: str) -> dict:
    m = {(a, b): 0 for a in STATES for b in STATES}
    for r in rows:
        if r["span"] == span:
            m[(r["prev_state"], r["state"])] += 1
    return m


def _expect(form: str, m: dict, s: dict) -> list:
    """型ごとに画面に出るはずの文字（一覧の行から数え直した数）。"""
    ins = lambda t: sum(m[(x, t)] for x in STATES if x != t)  # noqa: E731
    outs = lambda t: sum(m[(t, x)] for x in STATES if x != t)  # noqa: E731
    if form == "D1":
        return [f"新規 {ins(t)} 人" for t in ("ng", "warn")] + [f"離脱 {outs(t)} 人" for t in ("ng", "warn")]
    if form == "D2":
        return [f"新規 {m[('ok', t)]} 人" for t in ("ng", "warn")] + [f"離脱 {m[(t, 'ok')]} 人" for t in ("ng", "warn")] + [f"注意→要確認 {m[('warn', 'ng')]} · 要確認→注意 {m[('ng', 'warn')]}"]
    if form == "D4":
        return [f"悪化 {m[('ok', 'warn')] + m[('ok', 'ng')] + m[('warn', 'ng')]} 人", f"改善 {m[('ng', 'warn')] + m[('ng', 'ok')] + m[('warn', 'ok')]} 人"]
    if form == "D6":
        return [f"{'+' if d > 0 else '−' if d < 0 else '±'}{abs(d)} 人" for d in (s["ng"] - s["prev_ng"], s["warn"] - s["prev_warn"])]
    return []


def over(page, base: str, data: dict) -> list:
    """D: 型ごとのカードの数が over_users の行（前と今の状態）から数えた数と一致する。D2 は 新規 − 離脱 ＝ 注意以上の差、D3 の表は前と直近の人数に合う。"""
    out = []
    for period, spans in (("7", ("day", "week")), ("28", ("month",))):
        o = data["p"][period]["r3"]["over"]
        for form in ("D1", "D2", "D3", "D4", "D5", "D6"):
            goto(page, f"{base}?page=home&period={period}&over={form}")
            for span in spans:
                s, m, got = o[span], _moves(o["rows"], span), page.evaluate(OVER_JS, f"over_{span}_duo")
                where = f"{form} {period} {span}"
                if not got or [b[0] for b in got["bigs"]] != [f"{s['ng']}人", f"{s['warn']}人"]:
                    out.append(f"{where}: 大きな数字が要確認・注意の人数と違う")
                    continue
                out += [f"{where}: 「{w}」が無い" for w in _expect(form, m, s) if w not in got["text"]]
                if form == "D2" and sum(m[("ok", t)] for t in ("ng", "warn")) - sum(m[(t, "ok")] for t in ("ng", "warn")) != s["users"] - s["prev_users"]:
                    out.append(f"{where}: 新規の合計 − 離脱の合計が注意以上の差と合わない")
                if form == "D3":
                    want = [[("—" if a == b == "ok" else str(m[(a, b)])) for b in STATES] for a in STATES]
                    rows_ok = sum(m[(a, b)] for a in ("warn", "ng") for b in STATES) == s["prev_users"] and sum(m[(a, b)] for a in STATES for b in ("warn", "ng")) == s["users"]
                    if got["table"] != want or not rows_ok:
                        out.append(f"{where}: 移動の表が一覧の行と合わないか、合計が前と直近の人数と合わない")
                if form == "D5":
                    want = [[m[(t, t)] + sum(m[(x, t)] for x in STATES if x != t) + sum(m[(t, x)] for x in STATES if x != t), sum(m[(x, t)] for x in STATES if x != t),
                             sum(m[(t, x)] for x in STATES if x != t)] for t in ("ng", "warn")]
                    if got["dots"] != want:
                        out.append(f"{where}: 四角の数が一覧の行と合わない {got['dots']} ≠ {want}")
    return out


CHIP_JS = "(() => { const c = document.querySelector('main .change.worse'), m = document.querySelector('main .mark.ng'); return c && m ? [getComputedStyle(c).color, getComputedStyle(m).color] : null; })()"


def chip_ng(page, base: str) -> list:
    """CH2: 悪化のチップの色が要確認の札の色と同じ。"""
    goto(page, f"{base}?page=home&chip=CH2")
    got = page.evaluate(CHIP_JS)
    return [] if got and got[0] == got[1] else [f"CH2: 悪化のチップの色が要確認の札の色と違う（{got}）"]


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


def forecast_and_summary(page, base: str) -> list:
    """月末の見込み: 「N 月の実績」がチップと同じ行にあり、添える数字に無い。S2: 概況の枠の外にサマリーの見出しが無い。"""
    out = []
    goto(page, f"{base}?page=home")
    g = page.evaluate("""(() => { const s = document.querySelector('main .card[data-ref=forecast] .k-sub'), n = s && s.querySelector('.chip-note'), c = s && s.querySelector('.change');
      if (!n || !c) return null; const a = c.getBoundingClientRect(), b = n.getBoundingClientRect();
      return { same: Math.abs(a.top - b.top) < 4 || b.top >= a.bottom - 1 && b.top - a.bottom < 8, note: n.textContent, rest: s.textContent.replace(n.textContent, '') }; })()""")
    if not g or not g["same"] or "月の実績" not in g["note"] or "実績" in g["rest"]:
        out.append(f"月末の見込み: 前月の実績がチップと同じ行（か直下）に無いか、添える数字にもある（{g}）")
    goto(page, f"{base}?page=home&sum=S2")
    heads = page.evaluate("Array.from(document.querySelectorAll('main h2')).map((h) => h.firstChild.textContent.trim())")
    if heads != ["主な指標"] or not page.locator(".sum-s2").count():
        out.append(f"S2: 枠の外にサマリーの見出しがある（{heads}）")
    return out
