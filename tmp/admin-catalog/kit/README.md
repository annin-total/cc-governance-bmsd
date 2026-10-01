# kit — 第 3 弾の構成案のキット

今の本物の画面の CSS（`static/`）と部品を写し、設計（`../concepts.md`）のカード・タブ・状態・増減・サマリーを足したもの。
カードとタブの中身は目録（`catalog_cards*.js`・`catalog_tabs*.js`）にだけ書き、案の `ia.js` は id で並べる。

## 定義の書き方

案は `ideas/NN-<slug>/` に `index.html`（`kit/index.html` の写し。書き換えない）・`ia.js`・`README.md` を置く。

```js
(() => {
  const { build } = window.CATALOG;
  window.IA = build({
    id: "NN-slug", name: "案 NN 名前",
    look: { delta: { arrow: true, color: "better" }, filter: "hide" },   // 省略すると既定（案 31）
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
- カードを押すと、定義の開くタブの候補のうちページにある最初のタブを開く。無ければ押せない
- サマリーの一覧・作成と編集・データと設定のページは `build` が末尾に足す
- 小さな群を 1 行に並べるのは `look.pack`（既定で有効）。並べたくない群は、その間に大きな群を置くか `pack: false` にする

## 見せ方の設定（`look`）

| キー | 値（既定） | 意味 |
| --- | --- | --- |
| `delta.color` | `"tone"` / `"better"` / `"none"` | 増減のチップの色。tone: 改善＝青・悪化＝濃い灰の太字・中立＝薄い灰。better: 改善だけ青 |
| `delta.arrow` | `false` | ▲▼ を付ける |
| `delta.word` | `false` | 「改善」「悪化」を値の後ろに添える |
| `delta.worseOnly` | `false` | 悪化だけチップにし、改善と中立は地の文字 |
| `delta.prev` | `false` | 前の値を添える（「+12.3%（前 $1,040）」） |
| `okMark` | `false` | 正常にも灰の「正常」の札 |
| `filter` | `"dim"` / `"hide"` | 状態の絞り込みで該当しないカードを薄くするか隠すか |
| `groupTitle` | `"group"` / `"window"` | 概況の群の見出しを群の名前にするか窓の名前にするか |
| `pageLink` | `true` | 概況の群の見出しの右に専用ページへの入口 |
| `pack` | `true` | 窓の違う小さな群（カード 2 列以下）が続くとき、4 列に収まるだけ 1 行に並べる。群ごとに見出しと期間の注記を持つ。`false` で 1 群 1 行 |

案ごとに分ける・まとめるカードも目録にある: `cost_total`・`per_bd`・`top10_share`・`top_spenders_only`（上位 10% を添えない。案 32）、
`users_all`・`calls_all`・`session_all`・`applied_all`・`outdated_all`（案 33。内訳は行ごとの札を持つ `staterows`）。

- 札と「一覧」の入口は両方出す（並ぶときの入口は矢印だけ）。`delta.prev` のときは添える数字から前の値を抜く。矢印は中立に付けない
- 案のフォルダに `shots.json`（`[[名前, 問い合わせ, 押す要素], …]`）を置くと、撮影の追加分に足す
案 34 の部品: `top_spenders_diff`（内訳に前との差）・タブ `user_all`（`replaces` で `user_cost`・`user_use`・`user_calls` を開く先として置き換える。列の上の段は `bands: [[見出し, 列数]]`）。
ページの `borrow: [タブ id]` は、ページに開く先の無いカードを押したとき、そのタブを持つ別のページへ期間と基準日を引き継いで移す。

## 撮影と検査

- `python kit/shoot.py ideas/NN-<slug>`: 全ページ × 期間と、絞り込み・基準日・押した移り先・サマリーを撮る。コンソールのエラーか横スクロールがあれば終了コード 1
- `python kit/check.py ideas/NN-<slug>`: 同じページの同じカード・設計 2 章の全カードとタブが目録にあるか・閾値の「以上」・データの札と値の一致
- URL は `?page=<id>&period=7|28|12m&asof=YYYY-MM-DD&filter=warn|ng#<タブ>:<区分>`
