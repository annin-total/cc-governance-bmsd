"""画面の決まりの検査（check.py から呼ぶ）: 概況の見出しは 2 つだけ・使わない語・文字の大きさは 5 段で、直書きしない。"""

import re
from pathlib import Path

KIT = Path(__file__).resolve().parent
TIERS = {12.0, 14.0, 16.0, 22.0, 40.0}  # tokens.css の 5 段（F5）
BANNED = ("版", "新たに該当", "外れた", "離れた")
HOME_CARDS = "主な指標"
FONT_DECL = re.compile(r"(?<![-\w])(font-size|font)\s*:\s*([^;}]+)")
FONT_OK = re.compile(r"^(inherit|var\(--fs[\w-]*\).*)$")
HOME_JS = """(() => ({
  heads: Array.from(document.querySelectorAll('main h2')).map((h) => h.firstChild.textContent.trim()),
  notes: document.querySelectorAll('main .gnote').length,
  title: window.DATA.fixed.r3.summaries[0].title,
}))()"""
# 文字を持つ要素（直下に文字か、入力欄）の計算後の大きさ
SIZES_JS = """Array.from(new Set(Array.from(document.querySelectorAll('body *')).filter((e) =>
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName) || Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
  .map((e) => parseFloat(getComputedStyle(e).fontSize))))"""


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


def page_problems(page, where: str, home: bool) -> list:
    """開いているページの検査。where は報告に使う名前。"""
    out = []
    text = page.evaluate("document.body.textContent")
    out += [f"{where}: 画面に「{w}」がある" for w in BANNED if w in text]
    sizes = sorted(set(page.evaluate(SIZES_JS)) - TIERS)
    if sizes:
        out.append(f"{where}: 5 段に無い文字の大きさ {sizes}")
    if home:
        h = page.evaluate(HOME_JS)
        if h["heads"] != [h["title"], HOME_CARDS] or h["notes"]:
            out.append(f"{where}: 概況の見出しがサマリーのタイトルと「{HOME_CARDS}」だけでない: {h['heads']}（注記 {h['notes']}）")
    return out
