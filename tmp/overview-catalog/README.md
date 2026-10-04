# 仕組みの紹介ページのカタログ

本部の管理側・上長向けに、この仕組み全体を 1 ページで紹介する HTML の案を 12 個並べたもの。**一時的な文書で、採る案が決まったら消す。**

- 共通の正本: `brief.md`（読者・語彙・事実・形式の決まり）。各案はここに書いた事実だけを使う
- 各案: `ideas/NN-*/index.html`（1 ファイル完結。外部の読み込みなし、file:// で開ける）
- Artifact のリンク: 下の表（中身は各 `index.html` と同じ）

| No | 名前 | 構成 | 見た目 | Artifact |
| --- | --- | --- | --- | --- |
| 01 | 一枚図 | 大きな構成図 1 枚と吹き出し。下に細い帯で要点 | 白地・濃紺＋橙 | [開く](https://claude.ai/artifact/EUndKBAheu4sVeGC1us3ns) |
| 02 | 章立ての文書 | 左に固定の目次、7 章 | 管理画面の見た目 | [開く](https://claude.ai/artifact/8vY2J8PCqGHozbntSNstJa) |
| 03 | 問答 | 上長の問い 9 つを見出しに、答えは図表 | 生成りの紙面・明朝見出し・墨＋朱 | [開く](https://claude.ai/artifact/JATRpbpUQAr2BHrtb3U4hA) |
| 04 | スライド | 16:9 を 10 枚、1 枚 1 メッセージ | 大きな色面・太いゴシック | [開く](https://claude.ai/artifact/8JxwCzfDhpJAASr4RQbufR) |
| 05 | 時系列 | 設定の更新から管理画面での確認までの 7 段 | 白地・ティール＋琥珀 | [開く](https://claude.ai/artifact/AenKJct2SFC7vGaXxJJH4P) |
| 06 | 役割別のレーン図 | 5 レーンのスイムレーン図が主役 | グレー基調・レーンごとの淡色 | [開く](https://claude.ai/artifact/YGSqXTd1FyfUihDKkP5uAL) |
| 07 | ダッシュボード | 数字のカード、構成図のカード、要点のカード | 管理画面の見た目 | [開く](https://claude.ai/artifact/8ujunQodL3pXUdXLnUq64n) |
| 08 | 報告書 | 要点 3 つ、図番号・表番号付きの節、A4 印刷対応 | モノクロ＋赤 | [開く](https://claude.ai/artifact/5fuTvGiLfwGP8p6YT6Tyt7) |
| 09 | ガイドブック | 番号付きの 5 つの要点とアイコン | 青緑＋淡黄・角丸 | [開く](https://claude.ai/artifact/1cSV6FcDw4umZ1aisDr4MQ) |
| 10 | 帳票 | ほぼすべて表（T1〜T8）、図は 1 枚 | 精密な罫線・紺 1 色 | [開く](https://claude.ai/artifact/UVit3s5z1xDwZ9LoJyQm1d) |
| 11 | 3 層構造 | 配る・集める・見るの 3 層の帯 | 青緑系の濃淡 | [開く](https://claude.ai/artifact/SiQ9iio4cY7PXdu1i6JXsJ) |
| 12 | タブ切替 | 6 タブを 1 画面ずつ（`#overview` などで直接開ける） | 紺のアプリ風 | [開く](https://claude.ai/artifact/HjsvESd1gftjsfDmEEQpTu) |

## 比べるときの注意

- 現在の進み具合（デプロイ済みか等）は、どの案にも載せていない
- 03 の分布図は見方の模式図で、実測値ではない（図中に明記）
- 07・12 の「8 区分」「3 件」などの数は、`brief.md` の表の行数を数えたもの
- 幅 375px では、01・06・08・10 の図や表は枠の中だけで横にスクロールする（ページ全体はスクロールしない）
