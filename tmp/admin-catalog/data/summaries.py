"""サマリーの見本（作成日の新しい順）。`body` が None のものは、モックが概況の注意・要確認のカードから下書きを作って本文にする。

`ng`・`warn` は作った時点の概況のカードのうち要確認・注意の枚数（本文の行の数と同じ）。`body` が None のものは None で、モックが下書きから数える。
"""

WEEK = 7
BULLET = "・"
BODIES = {
    7: "・要確認 · 基準を超えた利用者（週次）（要確認 17 人・注意 12 人）\n・要確認 · 未適用のある利用者 33 人\n・注意 · プラグイン未導入 20 人\n・注意 · 本体が古いバージョンの利用者 24 人\n\n"
       "未適用の 33 人には部ごとに連絡済み。",
    14: "・注意 · 1 営業日あたりのコスト $2,084（前との率 +11.2%）\n・要確認 · 未適用のある利用者 36 人\n・注意 · プラグイン未導入 21 人\n\n"
        "月初の利用が多く、1 営業日あたりのコストが上がった。",
}


def _md(day: int) -> str:
    import datetime as dt

    d = dt.date(1970, 1, 1) + dt.timedelta(days=day)
    return f"{d.month:02d}/{d.day:02d}"


def build(today: int, csv_end: int) -> list:
    """基準日の既定は利用明細の最終日。"""
    out = [{"id": "s1", "created": today, "updated": today, "asof": csv_end, "body": None, "note": "上位の利用者には個別に確認する。"}]
    for i, ago in enumerate(sorted(BODIES), start=2):
        asof = csv_end - ago
        out.append({"id": f"s{i}", "created": asof, "updated": asof + (1 if ago == 14 else 0), "asof": asof, "body": BODIES[ago], "note": None})
    for s in out:
        lines = (s["body"] or "").split("\n")
        s["ng"], s["warn"] = (None, None) if s["body"] is None else (sum(x.startswith(f"{BULLET}要確認") for x in lines), sum(x.startswith(f"{BULLET}注意") for x in lines))
        s["title"] = f"週次サマリー（{_md(s['asof'] - WEEK + 1)}〜{_md(s['asof'])}）"
    return out
