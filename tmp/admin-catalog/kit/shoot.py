"""案のフォルダの全ページを撮る。期間の効くページは 7・28・12m、効かないページは 1 枚。幅 1440・fullPage・下段は最初のタブ。
加えて、概況の絞り込み「要確認」・基準日を選んだ概況・カードやマスを押した移り先・サマリーの開いた行と編集を撮る（EXTRAS）。

使い方: python kit/shoot.py ideas/NN-<slug> [--out 撮った画像の置き場（既定は案のフォルダの shots/）]
コンソールのエラー（ページの例外を含む）・横スクロール・撮れなかった定義・定義に無い画像を数え、1 つでもあれば終了コード 1 で終わる。
"""

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

WIDTH, HEIGHT = 1440, 900
PERIODS = ("7", "28", "12m")
PAGES_JS = "window.IA.pages.map((p) => ({ id: p.id, periods: Boolean(p.periods) }))"
OVERFLOW_JS = "document.documentElement.scrollWidth > document.documentElement.clientWidth"
ASOF = "2026-09-11"
SETTLE_MS, SETTLE_TRIES = 300, 20
# 案 51 のヘッダーの固定（html の data-sticky）: 全体を撮るときは固定を外して上へ戻し、ヘッダーをスクロールした位置でなく上端に描く。
# 押す要素の代わりに SCROLL と書くと、SCROLL_Y だけスクロールして画面の大きさで撮る（固定のヘッダーの見え方）
STICKY_JS = "Boolean(document.documentElement.dataset.sticky)"
UNSTICK_CSS = ":root[data-sticky] .top { position: relative; }"
TOP_JS = "window.scrollTo({ top: 0, behavior: 'instant' })"
SCROLL, SCROLL_Y = "scroll", 600
# (名前, URL の問い合わせ, 押す要素)。押す要素があれば、押して移った先を撮る。要素はカンマで候補を並べ、最初に見えるものを押す
FIRST_CARD = "main .kpis a.card[href^='?']"
EXTRAS = (
    ("x-home-filter-ng", "?page=home&filter=ng", None),
    ("x-home-filter-warn-12m", "?page=home&period=12m&filter=warn", None),
    ("x-home-asof", f"?page=home&period=28&asof={ASOF}", None),
    ("x-go-cost", f"?page=home&period=28&asof={ASOF}", FIRST_CARD),
    ("x-go-over-week", f"?page=home&asof={ASOF}", "[data-ref^=over_week]"),
    ("x-go-off-users", "?page=home", "[data-ref=off_users]"),
    ("x-go-core-outdated", "?page=home", "[data-ref=core_outdated]"),
    ("x-cost-open-user-cost", "?page=cost&filter=warn", "[data-ref=per_user_bd]"),
    ("x-summary-open", "?page=summary", "details summary"),
    ("x-summary-edit-s2", "?page=summary_edit&id=s2", None),
)
EXTRA_FILE = "shots.json"  # 案のフォルダに置くと、[名前, 問い合わせ, 押す要素] の並びを EXTRAS に足す。[名前, null, null] はその撮影をこの案では撮らない。押す要素は SCROLL も書ける


def _args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("idea", type=Path)
    p.add_argument("--out", type=Path)
    return p.parse_args()


def _settle(page) -> None:
    """なめらかなスクロールが止まり、当てた見た目の遷移が終わるまで待つ（マウスの下の要素が時間で変わり、画像が揺れるため）。"""
    last = None
    for _ in range(SETTLE_TRIES):
        page.wait_for_timeout(SETTLE_MS)
        now = page.evaluate("window.scrollY")
        if now == last:
            break
        last = now
    page.wait_for_timeout(SETTLE_MS)


def _shoot(ctx, url: str, path: Path, click=None):
    """1 ページを撮り（click があれば押した後）、(エラーの一覧, 横スクロールの有無) を返す。押す要素が無ければ None。"""
    page = ctx.new_page()
    errors: list = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_load_state("load")
    if click == SCROLL:
        page.evaluate(f"window.scrollTo(0, {SCROLL_Y})")
        _settle(page)
        overflow = page.evaluate(OVERFLOW_JS)
        page.screenshot(path=str(path))
        page.close()
        return errors, overflow
    if click and not page.locator(f"{click} >> visible=true").count():  # 案にその要素が無ければ撮らない
        page.close()
        return None
    if click:
        page.locator(f"{click} >> visible=true").first.click()
        page.wait_for_load_state("load")
        _settle(page)
    overflow = page.evaluate(OVERFLOW_JS)
    if page.evaluate(STICKY_JS):
        page.add_style_tag(content=UNSTICK_CSS)
        page.evaluate(TOP_JS)
    page.screenshot(path=str(path), full_page=True)
    page.close()
    return errors, overflow


def _report(name: str, errors: list, overflow: bool) -> int:
    print(f"{name}: {'ok' if not errors and not overflow else f'errors={len(errors)} overflow={overflow}'}")
    for e in errors[:5]:
        print(f"  {e}")
    return bool(errors) + overflow


def main() -> None:
    args = _args()
    idea = args.idea.resolve()
    out = (args.out or idea / "shots").resolve()
    out.mkdir(parents=True, exist_ok=True)
    base = (idea / "index.html").as_uri()
    failed = 0
    shot_names: set = set()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--lang=ja-JP"])
        ctx = browser.new_context(viewport={"width": WIDTH, "height": HEIGHT}, locale="ja-JP", timezone_id="Asia/Tokyo")
        probe = ctx.new_page()
        probe.goto(base)
        pages = probe.evaluate(PAGES_JS)
        probe.close()
        for pg in pages:
            for period in PERIODS if pg["periods"] else (None,):
                name = pg["id"] + (f"-{period}" if period else "")
                url = f"{base}?page={pg['id']}" + (f"&period={period}" if period else "")
                failed += _report(name, *_shoot(ctx, url, out / f"{name}.png"))
                shot_names.add(name)
        ids = {pg["id"] for pg in pages}
        extra = idea / EXTRA_FILE
        defs = EXTRAS + tuple(tuple(x) for x in (json.loads(extra.read_text(encoding="utf-8")) if extra.exists() else []))
        skip = {d[0] for d in defs if d[1] is None}
        for name, query, click in (d for d in defs if d[0] not in skip):
            page_id = query.split("page=")[1].split("#")[0].split("&")[0]
            shot = _shoot(ctx, base + query, out / f"{name}.png", click) if page_id in ids else None
            if shot is None:  # 定義した撮影が撮れないのは失敗。案に合わない撮影は shots.json で外す
                print(f"{name}: 撮れない（ページ {page_id} か押す要素 {click} が無い）")
                failed += 1
                continue
            failed += _report(name, *shot)
            shot_names.add(name)
        stale = sorted(f.stem for f in out.glob("*.png") if f.stem not in shot_names)
        for name in stale:  # 定義に無い画像（消えた撮影の残り）も失敗
            print(f"{name}: 定義に無い画像が残っている")
        failed += len(stale)
        print(f"撮った {len(shot_names)} 枚 · 外した {len(skip)} 件（{', '.join(sorted(skip)) or 'なし'}）")
        browser.close()
    print(f"{out}: {'すべて正常' if not failed else f'{failed} 件の問題'}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
