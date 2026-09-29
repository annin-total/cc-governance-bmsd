# kit — 構成案を定義から描く仕組み

案 1 つ = `ideas/NN-<slug>/` に `ia.js`（定義）と `index.html`（`kit/index.html` の写し。書き換えない）。
`index.html?page=<id>&period=7|28|12m` で各ページが file:// のまま開く。見た目・操作は本物の画面と同じ
（CSS と `app.js` は server 4555c06 の `static/` の写し。描画はサーバのテンプレートを JS に写したもの）。

- 手本: `kit/sample/ia.js`（部品を一通り使う）、`ideas/00-current/ia.js`（今の構成。本物と DOM・画像が一致する）
- 値: `data/data.js`（キーは `data/README.md`、指標の意味は `data/inventory.md`）
- 撮影: `venv/bin/python kit/shoot.py ideas/NN-<slug> [--out 置き場]`。効くページは 3 期間、効かないページは 1 枚。
  幅 1440・fullPage・下段は最初のタブ。コンソールのエラーか横スクロールが 1 つでもあれば終了コード 1

## 定義の書き方

```js
window.IA = { id: "03-cost-first", name: "案 03 コスト中心", pages: [ページ, ...] };
```

**ページ** `{ id, title, lead, periods, data, nav, groups, tabs }` または `{ id, title, lead, nav: "end", data, sections }`
- `periods: true` で期間の切り替えを出し、`?period=` が効く（無ければ期間は 7 日の値で固定）
- `data`: 値の場所の根。既定 `"p.{period}"`。`"fixed.policy"` など。群・タブにも `data` を書ける
- どこからでも `P`（今の期間の `p[期間]`）・`F`（`fixed`）・`M`（`meta`）と仕様値（`POLICY_DAYS` など）を引ける
- `nav: "end"` は見出し帯の右端（データと設定の位置）に出す

**文言の雛形** `"{x[cost][total]:usd}"`・`"{x.cost.total:usd}"`。書式は `num dec1 usd usd0 tok pct day md ym mon weekday
signed signed1 signed_pct bin rel size count asof setting provider model field basis basis_note`。
値の場所が無ければコンソールにエラーを出す（撮影で数える）。値が `null` なら「—」。

**群** `{ id, label, scope, longScope, note, data, cards: [カード, ...] }`。群の中は同じ期間・同じ母集団にする

**カード** `{ label, value, unit, delta, sub, state, tab, chip, wide, viz, cap: [左, 中, 右], empty, capEmpty, long }`
- `tab`（と `chip`）で押したときに開くタブ。無ければ押せないカード
- `state`: `"ok"|"warn"|"ng"|"neutral"` を返す値の場所。右上に状態の印を出す
- `delta` が `+` で始まると強調色

**タブ** `{ id, label, hint, title, scope, note, unit, rows, cols, sort: [キー, "asc"|"desc"], chipsBy, chips|chipTerms, chipsAll, search, q, chart, long }`
- `rows`: 行の並びの場所。`q`: 絞り込みの対象の雛形（行で埋める）、`search`: 入力欄の案内
- `chipsBy`: 行の区分の列。`chips: [{id, label, tone}]` か、`chipTerms`（区分を行から集めて名前を引く）

**列** `{ key, kind, label, sort, unit, terms, by, den, each, sub }`。`sort: null` で並べ替えない、文字列なら別の列で並べる。
`each` は並びの要素ごとに列を作る（設定ごとの点など）。`den` は棒の分母（`"100"`・行の列名・省略で列の最大）

**12 か月（`long`）**: カード・タブとも、未指定は 12 か月で出さない（カードは群の注記に名前、タブは「12 か月では出しません」）、
`"same"` はそのまま、オブジェクトは差し替え（タブは差し替え先の `id` で開く）

**節（データと設定の形）** `sections: [{ id, title, lead, blocks: [...] }]`。ブロックは `form`・`note`・`notice`・`table`（`tab` にタブの定義）・`months`

## 部品

**カードのグラフ（`viz.kind`）**

| kind | 見た目 | 主な項目 |
| --- | --- | --- |
| （なし） | 値だけ | |
| `spark` | 折れ線（直近の期間を濃く）・点ごとのツールチップ | `src` 行の並び・`field`・`fmt` |
| `bars` | 小さな縦棒（`period` が recent の行・`hiLast` 本を濃く） | `src`・`field`・`fmt`・`tipLabel`・`limit` |
| `pair` | 2 本の横棒で比べる（先を薄く） | `src`・`terms: {キー: 名前}`・`field` |
| `meter` | 帯（割合） | `src` 値・`den` 分母の場所か数・`tone`（ok・warn・ng・neutral） |
| `stack` | 積み上げの帯と凡例 | `src`（`[キー, 値]` の並び、または行と `field`）・`terms`・`tone`（warn・accent） |
| `rates` | 内訳の行（名前・横棒・右端の値）。順位にも使う | `src`・`field`・`den`（省略 100・`"max"`・場所）・`label` 雛形・`terms`・`right: [雛形]`・`limit` |
| `hist` | 分布の棒（期間を横に並べる） | `src`・`sides`（行の `<side>_share`）・`terms` |
| `forecast` | 月末の見込み（今の概況のカード専用） | `src: "month"`・`stats` |

**タブのグラフ（`chart.kind`）**: `bars`（`panels: [{title, field}]`、2 つ以上で横に並べる・`dayKeys: false` で日以外の軸・`tick` 目盛りの雛形）、
`stacked`（`fields: [{field, label}]` か `series` の場所＋`seriesField`・`shade` 直近を濃い地・`months` 月の行・`fmt`・`legend`）、
`hist`（`sides`・`terms`・`tick`）、`month`（今月の累積と見込み。区分で営業日・暦日を切り替える）。
どれも `key`（行の列）で表の行と結び、当てると棒と行が連動する。

**セル（`col.kind`）**: `text num dec1 pct pct_strong usd usd_strong usd_sub tok bar rank user model date day ym md weekday week mday cum
tag term code stage state diff measure measure_sub last_day user_state terminal_state dot off_keys dash_num value setting ratio version
count_of bin rel num_sub span bytes delete delete_file`

## 仕組み

`index.html` が `data.js` → `fmt.js`（書式・雛形）→ `labels.js`（共通の語・仕様値）→ `geo.js`（座標）→ `viz.js`（カードのグラフ）→
`cells.js`・`table.js`（表）→ `charts.js`（タブのグラフ）→ `page.js`（群・カード・タブ）→ `ia.js` → `boot.js`（描画）→ `static/app.js`（操作）の順に読む。
`app.js` は本物のまま使うため、描いた DOM が本物と同じなら操作（タブ・絞り込み・並べ替え・ツールチップ・連動）も同じになる。
