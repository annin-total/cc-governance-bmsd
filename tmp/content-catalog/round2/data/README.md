# data — 第 2 弾のダミーデータと値

`data.js` は `window.DATA` を定義する。値は `seed_biased.py` が作る偏りのある合成データ（40 人・400 日、メールは `userNNN@example.com`）から作る。
キーの構造は第 1 弾（`../../data/README.md`）と同じで、ここには作り方・データの偏り・第 2 弾で足したキーだけを書く。

## 作り方

第 1 弾の手順で用意したスクラッチパッド（venv・`server/` のスナップショット・`scripts/` の本物の seed）を使う。

```bash
SP=<スクラッチパッド>
rm -f $SP/biased.db                                            # 空の DB でないと seed が止まる
DB_DSN=sqlite:///$SP/biased.db $SP/venv/bin/python round2/data/seed_biased.py --server $SP/server --scripts $SP/scripts
$SP/venv/bin/python round2/data/build_data.py --server $SP/server --db $SP/biased.db
```

- `seed_biased.py` は本物の seed（`scripts/seed_dashboard*.py`）の端末・設定の報告・エラーの関数をそのまま使い、記録と利用明細だけを利用者の型で偏らせる。
  受信と取り込みはサーバの本体を通し、1 行でも捨てられたら止まる。本物の seed は変えない
- 基準日は `ASOF`（2026-09-18 18:00 JST）に固定する。月の途中に置くことで、今月の見込みと営業日あたりの値が空にならない。乱数の種も固定で、何度流しても同じ値になる
- `build_data.py` は `extras*.py` を呼んで今の画面に無い指標を足す。example.com 以外のメールが出力に入ると止まる

## データの偏り

| 観点 | 偏り |
| --- | --- |
| 利用者の型 | よく使う 6 人・普段使う 12 人・たまに使う 10 人・ほぼ使わない 8 人・未導入 4 人。未導入とほぼ使わない人にも利用明細のコストはある。たまに使う人とほぼ使わない人のうち 4 人は 35〜160 日前に使うのをやめる |
| スキル | 一部の人だけ（400 日で 11 人）。`brainstorming`・`systematic-debugging`・`governance:reapply`・`pdf`・`frontend-design` などを重み付きで選ぶ |
| コマンド | `compact`・`clear`・`resume` が多く、`review`・`deploy`（userSettings）・`governance:reapply`（plugin）は少ない（17 人） |
| 外部ツール | MCP（`github`・`context7`・`slack`・`atlassian`）は 8 人、WebSearch・WebFetch は 9 人 |
| サブエージェント | Agent ツールの起動は 6 人。起動の後に `agent_id` 付きの組み込みツールが続く |
| モデル | よく使う人の約 7 割が Opus、普段使う人の 1 割が Opus、軽い人の一部が Haiku、残りは Sonnet。コストでは Opus が約 6 割、利用者数では Sonnet が多い |
| セッションの大きさ | 溜める人（1 指示で 7,000〜14,000 トークン増える）と小さく分ける人（4,000〜9,000）。準拠前はしきい値 165,000、準拠後は 120,000 で自動コンパクトに達し、28 日で約 4 割のセッションが達する |
| 暦日 | 週末は記録が平日の 15%、利用明細が 12% の確率で出る |

## 第 2 弾で足したキー

`p[期間]`（7・28 日。`extras_r2.period`）

| キー | 形 |
| --- | --- |
| `calls.skills`・`calls.commands`・`calls.external`・`calls.agents` | `{total, prev, delta, change, users, users_prev, all_users, reach, kinds, top[], rows[]}`。`rows` は `{key, kind, label, calls, prev, diff, users, users_prev, share, trend}` を回数の多い順、`top` はその先頭 3 行。外部ツールは MCP をサーバ名で 1 行にまとめ（`kind: "mcp"`、`label` は「github（MCP）」）、WebSearch・WebFetch は名前のまま（`kind: "web"`）。組み込みのツールとスキル・Agent は入れない。サブエージェントは種類を記録していないため `key: "agent"` の 1 行。`all_users` は直近の期間に記録を送った人数 |
| `size` | 直近の期間に始まったセッションの `{sessions, median, q1, q3, auto_sessions, auto_share, users}`、前の期間の同じ形の `prev`、区間ごとの `dist[]`（`{bin, prev, recent, prev_share, recent_share}`、幅 20,000 トークン）。大きさは応答終了（Stop）の記録のコンテキストのセッション内の最大で、応答終了の記録が無いセッションは数えない |
| `x.people[]` の記録のある行 | `skill_calls, skill_kinds, skills_top[], skills_top_text, command_calls, command_kinds, commands_top[], commands_top_text, external_calls, agent_launches, session_size, auto_share, sized_sessions` を足す。`*_top` は `{key, calls}` の上位 3 つ |
| `x.activity[]` | `x.people` のうち記録のある行（利用者ごとの使い方・呼び出しのタブの行） |
| `m.uncollected_rows[]` | `{email, reason}`。`reason` は `billed_only`（コストはあるが記録が無い）か `stopped`（前の期間は記録があった） |

全期間（`extras_r2.lists`）: `x.billed[]` は `x.people` のうちコストの順位のある行。12m は `x.model_keys[]`（モデルの並び）を足す。

`p["12m"].m`（`extras_r2.retention_12m`）: `retention_rate`・`left_users[]`・`retention_month`（最後の完全な暦月）・`retention_rows[]`（暦月ごとの `{day, rate, left}`）。

`fixed`

| キー | 形 |
| --- | --- |
| `effect2` | 準拠開始日の前 14 日と後 14 日（当日は除く）に始まったセッションの `before`・`after`（`size` と同じ形）と `dist[]`（`{bin, before, after, before_share, after_share}`） |
| `x.terminals[]` | `policy.terminals` の各行に本体の版 `core` を足したもの |

## 第 1 弾の README と違う点

- 第 1 弾の「seed の癖」（モデル・スキルがほぼ均等、MCP が 0 など）はこのデータには当てはまらない。偏りは上の表のとおり
- 基準日は実行した日ではなく `ASOF` で固定する
