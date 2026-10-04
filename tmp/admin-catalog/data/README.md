# data — 第 4 弾のダミーデータと値

`data.js` は `window.DATA` を定義する。値は `seed_biased.py` が作る偏りのある合成データ（200 人・400 日、メールは `userNNN@example.com`）から作る。
今の画面の集計はサーバの report をそのまま呼び、足りない値を `extras*.py` が数える。状態の判定と閾値は `judge.py`（設計 4.4 の constants の名前案の写し。閾値ちょうどは該当する）。

## 作り方

スクラッチパッドに venv（playwright・jpholiday とサーバの requirements 入り）・`server/` のスナップショット・`scripts/` の本物の seed を用意して使う。

```bash
SP=<スクラッチパッド>
git archive origin/development scripts | tar -x -C $SP                     # scripts/ の本物の seed
git -C <本体>/server archive <gitlink> | tar -x -C $SP/server               # server/ のスナップショット
rm -f $SP/biased.db                                                         # 空の DB でないと seed が止まる
DB_DSN=sqlite:///$SP/biased.db $SP/venv/bin/python data/seed_biased.py --server $SP/server --scripts $SP/scripts
$SP/venv/bin/python data/build_data.py --server $SP/server --scripts $SP/scripts --db $SP/biased.db
```

- 今日は `ASOF`（2026-09-18 18:00 JST）に固定する。乱数の種も固定で、何度流しても同じ値になる
- **利用明細は今日と前日の分が無い**（`CSV_LAG`）。最終日は 09/16
- **期間のページの窓（`bill`・`rec`・`month`）は利用明細の最終日で終わる**（`meta.end`。サーバの `windows.period` に渡す日を最終日にする）。**状態のページの窓は今日で終わる**（`fixed.now` の `rec7`・設定の適用状況の `p30`）。`match7` は最終日までの 7 日
- 受信と取り込みはサーバの本体を通し、1 行でも捨てられたら止まる。example.com 以外のメールが出力に入ると止まる。`applied_mix` の 3 区分の合計が対象と合わないとき、`sections` の合計が利用者数・コストと合わないときも止まる
- 組織 CSV は `scripts/` の `seed_dashboard_rows.roster()`（`seed_org_columns`）の合成で、実物は使わない。部は 2 つ・課は 8 つ、名簿に無い利用者（不明）は約 5%（7 日の窓には出ず、28 日・12 か月に出る）、名簿には利用者でない人も約 50%

## データの偏り

| 観点 | 偏り |
| --- | --- |
| 利用者の型 | よく使う 30 人・普段使う 60 人・たまに使う 50 人・ほぼ使わない 40 人・未導入 20 人。未導入とほぼ使わない人にも利用明細のコストはある。20 人は 35〜160 日前に使うのをやめる |
| コスト | 利用明細の最後の 7 日だけ、よく使う人と普段使う人のコストを 1.18 倍にし（`RECENT_BUMP`）、よく使う人のうち 8 人は 0.3 倍にする（`RECENT_DROP`。基準超えに離脱を出す）。7 日のコストは注意（1 営業日あたり +10.9%）、28 日と月末の見込みは前より下がる |
| 基準超え（7 日） | 日次は要確認 11・注意 3 人（新規 1・離脱 6）、週次は要確認 19・注意 15 人（新規 5・離脱 3）。28 日の月次は要確認 22・注意 11 人 |
| バージョン | 利用者ごとにバージョンをそろえ、本体 25 人・プラグイン 40 人だけを古いバージョンにする（`OLD_CORE`・`OLD_PLUGIN`）。直近 30 日の対象では本体 22 人・プラグイン 36 人 |
| 呼び出し・モデル・セッション | スキルは一部の人だけ、コマンドは `compact`・`clear`・`resume` が多い。Opus はよく使う人の約 7 割。しきい値を守る前後で自動コンパクトに達する大きさが変わる |
| 暦日 | 週末は記録が平日の 15%、利用明細が 12% の確率で出る |

注意・要確認が出るカード（7 日）: `cost`（注意）・`per_user_bd`（注意）・`over_day`・`over_week`（要確認。注意の人もいる）・`off_users`・`applied_mix`（要確認）・`not_introduced`・`core_outdated`・`plugin_outdated`・`plugin_errors`（注意）。
正常: `forecast`・`billed_users`・`null_rate`・`csv_freshness`。`went_silent` は 0 人（途絶えた端末は本物の seed が 15 日以上前に止めるため）。

## 構造

| 場所 | 中身 |
| --- | --- |
| `meta` | `today`（今日）・`csv_end`（利用明細の最終日）・`end`（期間のページの終わりの既定。利用明細が無ければ今日の 2 日前）・`first_day`（利用明細の最初の日）・`first_pick`（選べる最初の日）・`days`（日ごとの `csv`〔利用明細の行がある〕・`rec`〔記録がある〕）・`csv_stale_days`（`judge.CSV_STALE_DAYS`）・`periods`・`users` |
| `p[7・28・12m]` | サーバの概況とスキル・コマンドの集計（`period`・`cost`・`month`・`usage`・`trend` など。窓は `meta.end` で終わる）に、次を足したもの。状態のページの値は持たない（`fixed.now`） |
| `p[k].x` | `cost`・`models`・`tokens`・`people`・`billed`（`user_cost` の行。`state`・`cost_change`・`tags`・`dept`・`section`）。7・28 日は `active`・`active_prev`・`daily`・`days_dist`・`activity`（`user_use`・`user_calls` の行）。12 か月は `months`・`model_keys` |
| `p[k].m` | `new_user_count`・`retention_rate`・`left_users`（12 か月は暦月の `retention_rows` など） |
| `p[k].calls`・`p[k].size` | 呼び出し 4 種の合計と上位・セッションの大きさ（7・28 日） |
| `p[k].r3.cost` | `bill` の窓の `total`・`bd`・`per_bd`・`users`・`per_user_bd` と `prev_*`、`*_change`、`state`・`per_user_state`・`users_state`、`daily`。12 か月は前と状態が無い |
| `p[k].r3` | `model_pt`。7・28 日は `changes`（利用状況のカードの増減）と `calls`（呼び出し先の行） |
| `p[7・28].r3.over` | 基準を超えた利用者。区分（7 日は `day`・`week`、28 日は `month`）ごとに `users`・`prev_users`・`delta`・`new`・`left`・`ng`・`warn`・`prev_*`・`ng_delta`・`cost_share`・`state` と、状態ごとの `ng_new`・`ng_left`・`warn_new`・`warn_left`・`ng_cost_share`（要確認の人の分）など。`rows`（`over_users` の行。`dept`・`section` つき） |
| `p[k].r3.sections` | 課ごとの `dept`・`section`（名簿に無い人は null、課の欄が空なら ""）・`users`・`cost`・`share`・`per_user_bd`。7・28 日は `prev`・`diff`・`change`・`over`（7 日は週次、28 日は月次の注意以上の人数）と記録の段（`rec_users`・`days_per_user`・`prompts_per_person_day`・`skill_calls`・`command_calls`）。合計は `r3.cost` の人数とコストに一致する |
| `fixed.now` | 状態のページの値（今日までの 7 日）。`period`・`events`・`users`・`errors`・`nulls`・`health`・`reconciliation`（`match7`）と `r3`（`silent`〔`user_delivery` の行に `dept`・`section`〕・`errors`〔`rows`・`state`・`top`＝件数の多い上位 3 つ〕・`nulls`・`changes`〔`events` の率・`senders`〕） |
| `fixed.r3.forecast` | 月末の見込みの前月の実績との `change`・`state` |
| `fixed.r3.policy` | 利用者単位の適用状況（今日までの 30 日）。`users`（`dept`・`section` つき）・`items`・`counts`・`mix`（`applied_mix` の `ok`・`off`・`none`・`total`）・`states`・`core`・`plugin`（`parts` は [バージョン, 人数, 最新からの距離 0・1・2]）・`versions` |
| `fixed.r3.summaries` | サマリーの見本 3 件。基準日は利用明細の最終日から。`body` が null の 1 件は、キットが概況から下書きを作る |
| `fixed.org` | 組織 CSV の `imported`（取り込み日）・`rows`（行数）・`depts`（部の並び） |
| `fixed.policy`・`fixed.effect`・`fixed.effect2`・`fixed.settings` | サーバの集計（適用状況・設定の効果・データと設定）と、適用前後のセッションの大きさ |
