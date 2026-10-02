"""サマリーの見本（作成日の新しい順）。`body` が None のものは、モックが概況の注意・要確認のカードから下書きを作って本文にする。"""

WEEK = 7
BODIES = {
    7: "・要確認 · 基準を超えた利用者（週次） 4 人（要確認 2 人・注意 2 人）\n・要確認 · 未適用のある利用者 7 人\n・注意 · プラグイン未導入 4 人\n・注意 · 本体が古いバージョンの利用者 9 人\n\n"
       "未適用の 7 人には個別に連絡済み。",
    14: "・注意 · コスト（利用明細） $2,104（1 営業日あたり +11.2%）\n・要確認 · 未適用のある利用者 8 人\n・注意 · プラグイン未導入 4 人\n\n"
        "月初の利用が多く、1 営業日あたりのコストが上がった。",
}


def _md(day: int) -> str:
    import datetime as dt

    d = dt.date(1970, 1, 1) + dt.timedelta(days=day)
    return f"{d.month:02d}/{d.day:02d}"


def build(today: int) -> list:
    out = [{"id": "s1", "created": today, "updated": today, "asof": today, "body": None, "note": "上位の利用者には個別に確認する。"}]
    for i, ago in enumerate(sorted(BODIES), start=2):
        asof = today - ago
        out.append({"id": f"s{i}", "created": asof, "updated": asof + (1 if ago == 14 else 0), "asof": asof, "body": BODIES[ago], "note": None})
    for s in out:
        s["title"] = f"週次サマリー（{_md(s['asof'] - WEEK + 1)}〜{_md(s['asof'])}）"
    return out
