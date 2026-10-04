# kit — 第 4 弾の構成案のキット

今の本物の画面の CSS（`static/`。文字の大きさだけ 5 段に変えてある）と部品を写し、設計（`../concepts.md`）のカード・タブ・状態・増減・サマリー・上部の固定の帯・カレンダーを足したもの。
カードとタブの中身は目録（`catalog_cards*.js`・`catalog_over.js`・`catalog_tabs*.js`）にだけ書き、案の `ia.js` は id で並べる。

## 定義の書き方

案は `ideas/NN-<slug>/` に `index.html`（`kit/index.html` の写し。書き換えない）・`ia.js`・`README.md`（必要なら `shots.json`）を置く。動く見本は `ideas/41-base/ia.js`（キットの動作確認用の最小の定義）。

```js
(() => {
  const { build } = window.CATALOG;
  window.IA = build({
    id: "NN-slug", name: "案 NN 名前",
    compare: true,                                               // 比較用の切り替えを右上に出す（案 41）
    look: { over: "O2", cost: "C31", ver: "V3", head: "H1" },    // 省略すると既定（推奨。下の表）
    pages: [
      { id: "home", title: "概況", home: true, summary: true, lead: "…", cards: ["cost", "per_user_bd", "applied_mix"] },
      { id: "cost", title: "コストと利用者", periods: true, lead: "…", cards: ["cost", "per_user_bd"], tabs: ["user_cost", "sections"] },
      { id: "policy", title: "設定の適用状況", now: true, data: "fixed.r3.policy", lead: "…", cards: ["all_applied"], tabs: ["policy_users"] },
      { id: "collect", title: "収集の状態", now: true, data: "fixed.now", lead: "…", cards: ["events_received"], tabs: ["health"] },
    ],
  });
})();
```

- **ページは `cards: [id…]`（表示の順）。**群を持たず、1 つの 4 列の格子に流す。広いカード（`wide`）の前に空いた列は後ろの 1 列のカードで埋まる（`grid-auto-flow: dense`）。12 か月で出さないカードは断らずに詰める
- `periods: true` は期間のタブを持つページ（概況は既定で持つ）。`now: true` は**状態のページ**（設定の適用状況・収集の状態）で、帯は「MM/DD 時点」（今日）で押せず、期間のタブを出さない。期間のタブも `now` も無いページ（設定の効果）は、帯が「MM/DD 時点 ▾」でカレンダーを開く
- `data` はページの値の根（既定は `p.{period}`）。カードの値の根はカードの窓から決まる（`catalog_cards.js` の `W`。`rec7`・`match7` は `fixed.now`、`p30` は `fixed.r3.policy`）
- 同じページに同じカードを 2 回置くとコンソールにエラー。概況（`home: true`）のカードは専用ページと同じ定義で、押すと専用ページのタブへ期間と基準日を引き継いで移る。移り先はカードを置いたページ、無ければ開くタブを持つページ（概況専用の `applied_mix` は `policy_users` を持つページ）
- 概況の今日の時点の窓（`rec7`・`p30`・`now`）のカードは、添える数字の前に「MM/DD 時点」を自動で付ける（`catalog.js` の `cardOf`）
- カードを押すと、定義の開くタブの候補のうちページにある最初のタブを開く。無ければ押せない。ページの `borrow: [タブ id]` は、ページに開く先の無いカードを押したとき、そのタブを持つ別のページへ移す（例: 利用状況の `cache_read_share` → `borrow: ["models"]`、案 42 の利用状況 → `borrow: ["user_all"]`）
- サマリーの一覧・作成と編集・データと設定のページは `build` が末尾に足す（帯は「MM/DD 時点」）

## 見せ方（`look`）と比較用の切り替え

| キー | 値（既定＝推奨） | 意味 |
| --- | --- | --- |
| `over` | `O1`〜`O5`（`O2`） | 基準超えのカード（設計 2.3）。`over_day`・`over_week`・`over_month` を置けば型に従って描く。O5 は概況だけ O4、専用ページは O1 |
| `cost` | `C31`・`C32`（`C31`） | コストのカード。`cards` に `"cost"` を置けば、C32 では `cost_total`・`per_bd` の 2 枚に展開する（`cost_total`・`per_bd` を直接置かない） |
| `ver` | `V1`〜`V3`（`V3`） | バージョンの帯の色（V1・V3 は 3 段、V2 は 2 区分）と、`plugin_errors` の内訳（V3 は上位 3 行） |
| `head` | `H1`・`H2`（`H1`） | ヘッダー。H1 は右端にサマリー・データと設定、H2 はサマリーをページの並びに入れる |

- `compare: true` の案は画面の右上に切り替えを出し、`?over=`・`?cost=`・`?ver=`・`?head=` で選ぶ（押した値はタブを閉じるまで覚える）。切り替えの既定は案の `look`
- 増減のチップ（型 C）・文字の大きさ（F5）・基準日の置き場（P3）は全案の既定で、切り替えない

## 案 41・42 の担当へ

- **案 41**（`41-base`）: `ideas/41-base/ia.js` は 1 章・3 章の並びをそのまま書いた最小の定義（`compare: true`）。本格的な `README.md` と、切り替えの各値・`sections`・部で絞った一覧などの `shots.json` を足す。撮影の名前は `shoot.py` の `EXTRAS` と重ねない
- **案 42**（`42-users`）: 41 の定義を写し、`look` に推奨の 4 つを書く（`compare` は付けない）。違いは設計 6.2 の 3 点
  - コストと利用者の `cards` を 利用者数 → 基準超え → コスト → … の順にする
  - タブ `user_all`（目録にある。`user_cost`・`user_use`・`user_calls` を開く先として置き換える）をコストと利用者に置き、利用状況は `daily_use`・`calls`・`session_size`・`usage_modes` と `borrow: ["user_all", "models"]`
  - 課ごとはタブ `sections_rec`（記録の段つき。DOM の id は `sections` のまま）を置く。12 か月では記録の段を出さない
- 撮れない撮影（案に無いページや要素）は失敗になる。案に合わない撮影は `shots.json` に `[名前, null, null]` を書いて外す

## 目録の部品

- 基準超え（`catalog_over.js`・`over.js`）: `overCard(区分, 型)`。O2・O4 は要確認だけを数え、注意の札を出さない（状態の絞り込み「注意以上」で残るのは要確認がいるときだけ）
- 概況専用 `applied_mix`: 未適用・未導入の 2 つの大きな数字（`values`）と 3 色の帯（`viz.kind: "mix"`）。状態は `off_users` と `not_introduced` の重い方
- `cost`（C31）: 合計の右に 1 営業日あたりを第 2 の数字（`value2`）で出す
- カードの `span` は帯と期間の違うカードが添える期間（無ければ窓の `span`）。カードの `only: ["7"]` は出す期間を限る（12 か月で出さないのは `long` を持たないこと）
- タブの `dept: true` は部の絞り込み（すべて・部ごと・不明の 1 択。`fixed.org.depts`）を出す。課の列は `SECTION`（不明・課の欄が空は「不明」「—」で、状態の札を付けない）
- タブ `sections`・`sections_rec`（課ごと）、`user_all`（列の上の段 `bands: [[見出し, 列数]]`。両方の段は帯の期間）

## 撮影と検査

- `python kit/shoot.py ideas/NN-<slug>`: 全ページ × 期間と、絞り込み・基準日・押した移り先・カレンダーを開いた画面・利用明細の古さの警告（読み込み前に今日を最終日 + 3 日に差し替える）・課ごと・部で絞った一覧・サマリーを撮る。
  コンソールのエラー・横スクロール・撮れなかった定義・定義に無い画像のどれかがあれば終了コード 1。`shots.json` の 4 番目の要素は差し替えの名前（`shoot.py` の `PRE`）
- `python kit/check.py ideas/NN-<slug>`: 同じページの同じカード・基準超えの区分・設計 2 章の全カードとタブが目録にあるか・閾値の「以上」・データの札と値・窓の終わり（`bill`・`rec`・`match7` は利用明細の最終日、`rec7`・`p30` は今日）・課ごとの合計・`applied_mix`・`meta.users`。
  画面の決まり（`check_screen.py`）: 群の見出しと注記が無い・概況の見出しはサマリーのタイトルと「主な指標」だけ・使わない語（「版」「新たに該当」「外れた」「離れた」「異常値」）・期間の表示が帯に 1 つ・ヘッダーと帯が sticky でスクロール後も上端・置かないカード・見出しが 1 行・基準超えは 2 列幅以下・文字の大きさは 5 段で直書きしない。
  操作の検査（`check_flows.py`）: 状態のページ・概況の状態のカード・カレンダー・古さの警告の境・O2 と O4・`applied_mix`・部の絞り込みと不明の行
- URL は `?page=<id>&period=7|28|12m&asof=YYYY-MM-DD&filter=warn|ng#<タブ>:<区分>`。基準日（`asof`）は期間の終わりで、既定（利用明細の最終日）なら付けない。ページを移っても引き継ぎ、状態のページでも消さない
