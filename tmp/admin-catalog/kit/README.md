# kit — 構成案のキット（案 31・51）

今の本物の画面の CSS（`static/`。文字の大きさだけ 5 段に変えてある）と部品を写し、設計（`../concepts.md`）のカード・タブ・状態・増減・サマリーを足したもの。
カードとタブの中身は目録（`catalog_cards*.js`・`catalog_tabs*.js`）にだけ書き、案の `ia.js` は id で並べる。

## 定義の書き方

案は `ideas/NN-<slug>/` に `index.html`（`kit/index.html` の写し。書き換えない）・`ia.js`・`README.md` を置く。

```js
(() => {
  const { build } = window.CATALOG;
  window.IA = build({
    id: "NN-slug", name: "案 NN 名前",
    look: { delta: { arrow: true, color: "better" } },   // 省略すると既定（案 31）
    pages: [
      { id: "home", title: "概況", home: true, summary: true, lead: "…",
        groups: [["コスト", ["cost", "per_user_bd"]], ["設定の適用", ["all_applied", "off_users"]]] },
      { id: "cost", title: "コストと利用者", periods: true, lead: "…",
        groups: [["コスト", ["cost", "per_user_bd"]]], tabs: ["user_cost", "cost_daily"] },
      { id: "collect", title: "収集の状態", lead: "…", groups: [["受信", ["events_received"]]], tabs: ["health"] },
    ],
  });
})();
```

- 群は `[見出し, [カード id], { win, note }]`。窓はカードの `win` から決まり、窓の違うカードを 1 つの群に入れるとコンソールにエラーを出す
- 同じページに同じカードを 2 回置くとエラー。概況（`home: true`）は専用ページのカードを id で呼び、押すと専用ページのタブへ期間と基準日を引き継いで移る。概況のカードは専用ページのどれかに置く
- 概況の群は並びと窓だけを決める。見出しは最新のサマリーのタイトルと「主な指標」の 2 つで、カードは 1 つの格子に流し、「主な指標」の横に窓の `brief`（`catalog_cards.js` の窓）を 1 行で並べる
- カードを押すと、定義の開くタブの候補のうちページにある最初のタブを開く。無ければ押せない
- サマリーの一覧・作成と編集・データと設定のページは `build` が末尾に足す
- 小さな群を 1 行に並べるのは `look.pack`（既定で有効）。並べたくない群は、その間に大きな群を置くか `pack: false` にする

## 見せ方の設定（`look`）

| キー | 値（既定） | 意味 |
| --- | --- | --- |
| `delta.color` | `"tone"` / `"better"` / `"none"` | 増減のチップの色。tone: 改善＝青・悪化＝濃い灰の太字・中立＝薄い灰。better: 改善だけ青 |
| `delta.arrow` | `false` | ▲▼ を付ける |
| `delta.word` | `false` | 「改善」「悪化」を値の後ろに添える |
| `delta.palette` | `""` | 比較用の色の組（`br` 青と赤・`gr` 緑と赤・`blue` 青だけ。`compare.js` が選ぶ） |
| `pack` | `true` | 窓の違う小さな群（カード 2 列以下）が続くとき、4 列に収まるだけ 1 行に並べる。群ごとに見出しと期間の注記を持つ。`false` で 1 群 1 行（専用ページ） |
| `asofAt` | `"header"` / `"page"` / `"range"` / `"step"` | 基準日の置き場（`basedate.js`）。header: ヘッダーの「時点」を日付の指定に置き換える。page: ページ内の期間のタブの前。range: 期間のタブの後ろの期間の表示を押すと日付を選ぶ。step: header に前後の送り（7 日、28 日のタブでは 28 日） |
| `fs` | `"F5"` / `"F6"` / `"F7"` | 文字の大きさの段の組。F5 は `static/tokens.css`、ほかは `compare.css` |

合計と 1 営業日あたりを別にしたカード `cost_total`・`per_bd` も目録にある（案 51）。
基準を超えた利用者（`catalog_over.js`）は区分ごとの `over_day`・`over_week`・`over_month` と、要確認と注意を 2 つの大きな数字で並べる `over_<区分>_duo`（案 51）。
カード・列・絞り込みの `only: ["7"]` は出す期間を限る（12 か月で出さないのは `long` を持たないこと）。12 か月の群の注記の理由はカードの `longWhy`。
案の `compare: true` は比較用の切り替え（`compare.js`）を画面の右上に出す（案 31）。チップの見せ方 `?chips=A|B|C|D`・文字の大きさ `?fs=F5|F6|F7`・基準日の置き場 `?base=P1|P2|P3|P4`。

- 札と「一覧」の入口は両方出す（並ぶときの入口は矢印だけ）。状態の絞り込みは該当しないカードを薄くする。矢印は中立に付けない
- 案のフォルダに `shots.json`（`[[名前, 問い合わせ, 押す要素], …]`）を置くと、撮影の追加分に足す。`[名前, null, null]` はその撮影をこの案では撮らない。定義した撮影が撮れないとき・定義に無い画像が `shots/` に残るときは失敗にする

## 案 51 で足したもの（第 5 弾。`../concepts5.md`）

**31 の画面を 1 画素も変えない。**案 51 の追加は look のキー（既定は 31 の挙動）か、`index5.html` だけが読むファイルに置く。51 の `index.html` は `index5.html` の写し（`data/data5.js` を読む）。

| look のキー | 51 の値 | 既定（31） | 意味 |
| --- | --- | --- | --- |
| `ends` | `"bill"` | `"asof"` | 期間のページは利用明細の最終日で終わり、状態のページ（`now: true`）は今日の時点。基準日は帯の期間の表示とカレンダー（`period5.js`・`calendar*.js`）。窓 `rec7`・`match7` とタブ `health`・`errors`・`user_delivery` の値の根は `today`（`fixed.now`） |
| `sticky`・`hv` | `"header"`・切り替え | `""`・`"HV1"` | ヘッダーだけを固定し、高さの型（`head5.css`） |
| `brief`・`forecastPrev`・`org` | `false`・`"chip"`・`true` | `true`・`""`・`false` | 主な指標の横の期間・見込みの前月の実績・組織 CSV（課の列・`depts`・取り込みの欄） |
| `groups`・`chart`・`over`・`sum`・`df`・`cal`・`stale`・`lag` | 切り替え | `"G31"`・`"K1"`・`""`・`"S1"`・`"F0"`・`"CA1"`・`"W0"`・`""` | 群（ページの `groups3`）・コストのグラフ・基準超えの下段・サマリー・部署の絞り込み・カレンダー・古さの警告・遅れの見本 |

- `compare: "r5"` の案は右下の「☰ 比較」のパネル（`compare5.js`）。切り替えは `SWITCHES` の表だけで定義する
- 51 だけが読むファイル: `labels5.js`（語）・`period5.js`（帯の期間の表示と警告）・`calendar.js`・`calendar_strip.js`（CA7）・`compare5.js`・`cards5.js`（`look` に合わせたカードの差し替え。`CATALOG.cardAdapters`）・`tabs5.js`（課の列と `depts`。`CATALOG.tabAdapters`）・`viz5.js`・`viz5b.js`（コストのグラフの部品）・`over5.js`（D1〜D6）・`deptfilter.js`・`pages5.js`（組織 CSV の欄）と CSS（`head5.css`・`calendar.css`・`compare5.css`・`parts5.css`）
- 共有のファイルの 51 用の口: `catalog.js` の差し替え（`adapt`）・窓とタブの `today`・`stamp`、`table.js` の行の `rowData`、`static/app.js` の `data-dept-out` と `kit:refilter`、`card.js` の `chipNote` と `k5` の部品
- 利用者の並ぶタブは目録で `org: true`

## 撮影と検査

- `python kit/shoot.py ideas/NN-<slug>`: 全ページ × 期間と、絞り込み・基準日・押した移り先・サマリーを撮る。コンソールのエラーか横スクロールがあれば終了コード 1
- `python kit/check.py ideas/NN-<slug>`: 同じページの同じカード・設計 2 章の全カードとタブが目録にあるか・閾値の「以上」・データの札と値の一致。
  画面の決まり（`check_screen.py`）: 概況の見出しがサマリーのタイトルと「主な指標」だけ・画面に「版」「新たに該当」「外れた」「離れた」が無い・CSS と JS に直書きの文字の大きさが無い・計算後の文字の大きさが 5 段だけ
- `python kit/check_frozen.py ideas/31-skeleton`: 31 を撮り直し、コミット済みの `shots/` と画素で比べる（1 枚でも違えば終了コード 1）。31 の見た目を変えないための検査
- `check.py` は案 51（`compare: "r5"`）では `check5.py`・`check5_cards.py`・`check5_org.py` の決まり（設計 7 章）を、ほかの案では 51 の機能が無いことを確かめる。撮影の `shots.json` の押す要素に `"scroll"` と書くと、スクロールして画面の大きさで撮る
- URL は `?page=<id>&period=7|28|12m&asof=YYYY-MM-DD&filter=warn|ng#<タブ>:<区分>`。基準日（`asof`）は全ページで選べ、ページを移っても引き継ぐ。今日なら付けない
