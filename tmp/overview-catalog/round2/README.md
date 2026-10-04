# 仕組みの紹介ページのカタログ 第 2 弾

第 1 弾（`../README.md`）の評価を受けて、骨組みと配色を発散させた 12 案。**一時的な文書で、採る案が決まったら消す。**

- 共通の正本: `brief.md`（事実・語彙・文体・節の責務・配色・案の割り振り）
- 各案: `ideas/NN-*/index.html`（1 ファイル完結、file:// で開ける）。右上の「配色（仮）」で 3 つの配色を切り替える（1 管理画面の配色、2 青緑の濃淡、3 案ごとの派生）。初期の配色は `#scheme=1..3`
- 画像: `shots/NN-*-schemes.png`（3 配色の 1 画面目を並べたもの）、`shots/NN-*-full.png`（配色 1 の全体）

## 第 1 弾からの変更

- 事実: 利用者は約 200 名。利用者ごとの一覧を見られる（「個人の監視をしない」を消した）。配る設定の主役は自動更新で、自動コンパクトは第 1 弾の施策の例として小さく。管理画面は画面名を出さず「分かること」で書く
- 節の順と責務を全案でそろえた（概要 → 構成 → 仕組み → 収集範囲 → 管理画面で分かること → 運用 → 限界）。各事実は 1 か所にだけ書く（冒頭の要約を除く）
- 文体は第 1 弾 02 の語彙を軸に冗長さを削った。数字のカードは置かない

| No | 名前 | 骨組み | 配色 3 | Artifact |
| --- | --- | --- | --- | --- |
| 01 | document | 第 1 弾 02 の改訂。左の固定目次＋7 節 | 白地の文書 | [開く](https://claude.ai/artifact/4snc7BzgCmC6darXBCz5NC) |
| 02 | brief-doc | 目次なしの 1 段組。表と図だけで読ませる | 濃紺の見出し帯 | [開く](https://claude.ai/artifact/CZpSi79MYmcvAS49cDT39U) |
| 03 | swimlane | 第 1 弾 06 の改訂。冒頭に 5 レーンの流れ図 | 経路の二色 | [開く](https://claude.ai/artifact/5FZ62BTViPQeaoJ8x69tay) |
| 04 | lane-sections | レーン図を節ごとに描き、関係するレーンだけを濃く | 灰色と焦点色 | [開く](https://claude.ai/artifact/63snUk9gZwDJGPvprnJ8xZ) |
| 05 | key-points | 第 1 弾 09 の骨組みを書き言葉に。番号付きの要点 7 つ | 要点の朱 | [開く](https://claude.ai/artifact/8wJHvMiEctTUDeo4UNuU28) |
| 06 | points-detail | 冒頭に 1 行の要点 7 つ、押すと同じ番号の詳細へ | 墨の索引 | [開く](https://claude.ai/artifact/V479saPtDp788kZN4uHEbM) |
| 07 | layers | 第 1 弾 11 の改訂。構成を配る・集める・見るの 3 層の図に | 層の帯 | [開く](https://claude.ai/artifact/R3NSEeNA9Ei5vkT9kUvdiX) |
| 08 | layer-index | 3 層のタイルが目次。読んでいる層が上部の帯に出る | 濃色の目次 | [開く](https://claude.ai/artifact/KuTdgYNkwEpd8J8dihqBQr) |
| 09 | board | 第 1 弾 07 から数字のカードを除いた、カードの格子 | 罫線の格子 | [開く](https://claude.ai/artifact/42mCkPv46Lro55oTXHgV2G) |
| 10 | overview-first | 1 画面目に概要と構成、以下は付録の表 | 全体像の地色 | [開く](https://claude.ai/artifact/RTe5EhXCx2CQ8LTk1ZJCoV) |
| 11 | doc-lane | 01 の文書型の「構成」に 03 のレーン図 | 経路の二色 | [開く](https://claude.ai/artifact/3AKi7HySFRKQxiTczj4x3G) |
| 12 | points-layers | 05 の番号付きの要点の「構成」に 07 の 3 層の図 | 番号の強調 | [開く](https://claude.ai/artifact/653FiHpkY3UfmXpxXZacYx) |

## 比べるときの注意

- 02 は本文が 01 とほぼ同じで、違いは目次の有無だけになった
- 05 と 06 は詳細の見た目が近い。違いは要点の置き方（各節の頭か、冒頭にまとめるか）
- 幅 375px では、03・09・11 などの図は枠の中だけ横にスクロールする（ページ全体はスクロールしない）
