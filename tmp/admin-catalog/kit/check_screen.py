"""画面の決まりの検査（check.py から呼ぶ）: ページごとに開いた画面の見出し・語・文字の大きさ・帯・カード。CSS と JS の直書きの文字の大きさ。"""

import re
from pathlib import Path

KIT = Path(__file__).resolve().parent
TIERS = {12.0, 14.0, 16.0, 22.0, 40.0}  # tokens.css の 5 段（F5）
BANNED = ("版", "新たに該当", "外れた", "離れた", "異常値")
HOME_CARDS = "主な指標"
NOT_PLACED = ("top_spenders", "new_users")  # どのページにも置かないカード
ACTIVITY_ONLY = "cache_read_share"
LABEL_LINE = 1.3  # カードの見出しの高さが行の高さのこの倍より大きければ 2 行に折れている
WIDE_MAX = 2.1  # 基準超えのカードの幅は 1 列のカードのこの倍まで（2 列幅以下）
FONT_DECL = re.compile(r"(?<![-\w])(font-size|font)\s*:\s*([^;}]+)")
FONT_OK = re.compile(r"^(inherit|var\(--fs[\w-]*\).*)$")
HOME_JS = """(() => ({
  heads: Array.from(document.querySelectorAll('main h2')).map((h) => h.firstChild.textContent.trim()),
  title: window.DATA.fixed.r3.summaries[0].title,
}))()"""
# 群の見出し（下段の「詳しい一覧」はタブの入口なので除く）・群の注記・帯の期間の表示
PAGE_JS = """(() => ({
  glabels: Array.from(document.querySelectorAll('main .glabel')).filter((e) => !e.closest('#detail')).length,
  gnotes: document.querySelectorAll('.gnote').length,
  displays: document.querySelectorAll('[data-period-display]').length,
  inBand: document.querySelectorAll('.band [data-period-display]').length,
  sticky: getComputedStyle(document.querySelector('[data-sticky]') || document.body).position,
  refs: Array.from(document.querySelectorAll('main .card[data-ref]')).map((c) => c.dataset.ref),
  labels: Array.from(document.querySelectorAll('main .card .k-label > span:first-child')).map((s) =>
    [s.textContent, s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight)]),
  over: (() => {
    const one = Array.from(document.querySelectorAll('main .card:not(.wide)')).map((c) => c.getBoundingClientRect().width)[0] || 1;
    return Array.from(document.querySelectorAll('main .card[data-ref^=over_]')).map((c) => [c.dataset.ref, c.getBoundingClientRect().width / one, c.querySelectorAll('.srow').length]);
  })(),
}))()"""
STICKY_JS = """(() => { window.scrollTo(0, document.body.scrollHeight); const t = document.querySelector('.top').getBoundingClientRect(),
  b = document.querySelector('.band').getBoundingClientRect(); return [window.scrollY, t.top, b.top - t.bottom]; })()"""
# 文字を持つ要素（直下に文字か、入力欄）の計算後の大きさ
SIZES_JS = """Array.from(new Set(Array.from(document.querySelectorAll('body *')).filter((e) =>
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName) || Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
  .map((e) => parseFloat(getComputedStyle(e).fontSize))))"""


def data_patch(expr: str) -> str:
    """読み込み前に入れるスクリプト: data.js が window.DATA に入れた値 v を `expr` で書き換えてから置く。"""
    return ('Object.defineProperty(window, "DATA", { configurable: true, set(v) { ' + expr
            + '; Object.defineProperty(window, "DATA", { value: v, writable: true, configurable: true }); } });')


def static_fonts() -> list:
    """CSS の font-size・font が tokens.css の --fs-* だけを使い、JS が文字の大きさを書かないか。"""
    out = []
    for css in sorted(KIT.rglob("*.css")):
        for prop, value in FONT_DECL.findall(css.read_text(encoding="utf-8")):
            if not FONT_OK.match(value.strip()):
                out.append(f"{css.relative_to(KIT)}: 直書きの {prop}: {value.strip()}")
    for js in sorted(KIT.rglob("*.js")):
        if re.search(r"font-size|fontSize", js.read_text(encoding="utf-8")):
            out.append(f"{js.relative_to(KIT)}: JS が文字の大きさを書いている")
    return out


def _cards(where: str, page_id: str, d: dict) -> list:
    out = [f"{where}: 置かないカード {r} がある" for r in d["refs"] if r in NOT_PLACED]
    if ACTIVITY_ONLY in d["refs"] and page_id != "activity":
        out.append(f"{where}: {ACTIVITY_ONLY} が利用状況の外にある")
    out += [f"{where}: カードの見出しが 1 行に収まらない: {t}" for t, n in d["labels"] if n > LABEL_LINE]
    out += [f"{where}: 基準超えのカード {r} が 2 列幅を超える（{w:.1f} 列）か区分の行を持つ" for r, w, rows in d["over"] if w > WIDE_MAX or rows]
    return out


def page_problems(page, where: str, page_id: str, home: bool) -> list:
    """開いているページの検査。where は報告に使う名前。"""
    out = []
    text = page.evaluate("document.body.textContent")
    out += [f"{where}: 画面に「{w}」がある" for w in BANNED if w in text]
    sizes = sorted(set(page.evaluate(SIZES_JS)) - TIERS)
    if sizes:
        out.append(f"{where}: 5 段に無い文字の大きさ {sizes}")
    d = page.evaluate(PAGE_JS)
    if (d["glabels"] and not home) or d["gnotes"]:
        out.append(f"{where}: 群の見出し {d['glabels']}・群の注記 {d['gnotes']} がある")
    if d["displays"] != 1 or d["inBand"] != 1:
        out.append(f"{where}: 期間の表示が帯に 1 つだけでない（{d['displays']} 個・帯に {d['inBand']} 個）")
    if d["sticky"] != "sticky":
        out.append(f"{where}: ヘッダーと帯が sticky でない（{d['sticky']}）")
    else:
        scrolled, top, gap = page.evaluate(STICKY_JS)
        if scrolled and (abs(top) > 1 or abs(gap) > 1):
            out.append(f"{where}: スクロール後にヘッダーと帯が上端に無い（ヘッダー {top}・帯との隙間 {gap}）")
    out += _cards(where, page_id, d)
    if home:
        h = page.evaluate(HOME_JS)
        if h["heads"] != [h["title"], HOME_CARDS]:
            out.append(f"{where}: 概況の見出しがサマリーのタイトルと「{HOME_CARDS}」だけでない: {h['heads']}")
    return out
