# data — 第 3 弾のダミーデータと値

`data.js` は `window.DATA` を定義する。値は `seed_biased.py` が作る偏りのある合成データ（40 人・400 日、メールは `userNNN@example.com`）から作る。
今の画面の集計はサーバの report をそのまま呼び、足りない値を `extras*.py` が数える。状態の判定と閾値は `judge.py`（設計 4.4 の constants の名前案の写し。閾値ちょうどは該当する）。

## 作り方

スクラッチパッドに venv（playwright・jpholiday 入り）・`server/` のスナップショット・`scripts/` の本物の seed を用意して使う。

```bash
SP=<スクラッチパッド>
rm -f $SP/biased.db                                            # 空の DB でないと seed が止まる
DB_DSN=sqlite:///$SP/biased.db $SP/venv/bin/python data/seed_biased.py --server $SP/server --scripts $SP/scripts
$SP/venv/bin/python data/build_data.py --server $SP/server --db $SP/biased.db
```

- 基準日（今日）は `ASOF`（2026-09-18 18:00 JST）に固定する。乱数の種も固定で、何度流しても同じ値になる
- **利用明細は今日と前日の分が無い**（`CSV_LAG`）。最終日は 09/16
- 受信と取り込みはサーバの本体を通し、1 行でも捨てられたら止まる。example.com 以外のメールが出力に入ると止まる

## データの偏り

| 観点 | 偏り |
| --- | --- |
| 利用者の型 | よく使う 6 人・普段使う 12 人・たまに使う 10 人・ほぼ使わない 8 人・未導入 4 人。未導入とほぼ使わない人にも利用明細のコストはある。4 人は 35〜160 日前に使うのをやめる |
| コスト | 利用明細の最後の 7 日だけ、よく使う人と普段使う人のコストを 1.3 倍にする（`RECENT_BUMP`）。7 日のコストは注意（1 営業日あたり +13.4%）、28 日と月末の見込みは前より下がる（改善） |
| 版 | 利用者ごとに版をそろえ、本体 5 人・プラグイン 8 人だけを古い版にする（`OLD_CORE`・`OLD_PLUGIN`）。直近 30 日の対象では本体 4 人・プラグイン 7 人 |
| 呼び出し・モデル・セッション | スキルは一部の人だけ、コマンドは `compact`・`clear`・`resume` が多い。Opus はよく使う人の約 7 割。しきい値を守る前後で自動コンパクトに達する大きさが変わる |
| 暦日 | 週末は記録が平日の 15%、利用明細が 12% の確率で出る |

注意・要確認が出るカード（7 日）: `cost`（注意）・`over_day`（注意）・`over_week`（要確認）・`off_users`（要確認）・`not_introduced`・`core_outdated`・`plugin_outdated`・`plugin_errors`（注意）。
正常: `per_user_bd`・`forecast`・`billed_users`・`null_rate`。

## 構造

| 場所 | 中身 |
| --- | --- |
| `meta` | `asof`（今日）・`first_day`（利用明細の最初の日）・`periods`・`users` |
| `p[7・28・12m]` | サーバの概況とスキル・コマンドの集計（`period`・`cost`・`month`・`events`・`errors`・`nulls`・`health`・`usage`・`reconciliation` など）に、次を足したもの |
| `p[k].x` | `cost`（合計・人数・1 人あたりなど）・`models`・`tokens`・`people`・`billed`（`user_cost` の行。`state`〔期間の基準の判定。12 か月は null〕・`cost_change`・`tags` を足す）。7・28 日は `active`・`active_prev`・`daily`・`days_dist`・`activity`（`user_use`・`user_calls` の行）。12 か月は `months`・`model_keys` |
| `p[k].m` | `new_user_count`・`retention_rate`・`left_users`（12 か月は暦月の `retention_rows` など） |
| `p[k].calls`・`p[k].size` | 呼び出し 4 種の合計と上位・セッションの大きさ（7・28 日） |
| `p[k].r3.cost` | `bill` の窓の `total`・`bd`（営業日数）・`per_bd`・`users`・`per_user_bd` と前の期間の `prev_*`、`*_change`（率）、`state`（1 営業日あたりの率）・`per_user_state`・`users_state`（減った率）、`daily`（日ごとの人数）。12 か月は前と状態が無い |
| `p[k].r3` | `model_pt`（最も多いモデルの割合の差）。7・28 日は `changes`（利用状況と受信のカードの増減）と `calls`（呼び出し先の行。`tags` は種類と増減） |
| `p[7・28].r3.over` | 基準を超えた利用者（`extras_r3_over.py`）。区分（7 日は `day`・`week`、28 日は `month`）ごとに `users`・`prev_users`・`delta`・`new`・`left`・`ng`・`warn`・`prev_*`・`ng_delta`・`ok`・`all_users`・`user_share`・`cost_share`・`state`・`top`（上位 3 人）。`spans`・`state`（区分の最も重いもの）・`rows`（`over_users` の行。利用者 × 区分）・`row_users` |
| `p.7.r3` | `silent`（`went_silent` の人数・前・差と `user_delivery` の行）・`errors`（利用者数の行と状態）・`nulls`（状態） |
| `fixed.r3.forecast` | 月末の見込みの前月の実績との `change`・`state` |
| `fixed.r3.policy` | 利用者単位の適用状況。`users`（状態・設定ごとの点・最も古い本体とプラグインの版・`tags`）・`items`（`off_users` を足す）・`counts`・`states`・`core`・`plugin`（`latest`・`outdated`・`parts`・`state`）・`versions` |
| `fixed.r3.summaries` | サマリーの見本 3 件（`summaries.py`）。`body` が null の 1 件は、キットが概況から下書きを作る |
| `fixed.policy`・`fixed.effect`・`fixed.effect2`・`fixed.m`・`fixed.settings` | サーバの集計（適用状況・設定の効果・データと設定）と、適用前後のセッションの大きさ・利用明細の鮮度 |
