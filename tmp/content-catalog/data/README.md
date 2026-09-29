# data — ダミーデータと値

`data.js` は `window.DATA` を定義する。値は seed の合成データ（40 人・400 日、メールは `userNNN@example.com`）から作る。
指標の意味と計算は `inventory.md`（棚卸し）が正本で、ここは値の置き場所だけを書く。

## 作り方

```bash
SP=<スクラッチパッド>            # venv（flask・jpholiday・playwright）と server のスナップショットを置く場所
git -C product/cc-governance-bmsd/server archive 4555c06 | tar -x -C $SP/server
mkdir -p $SP/scripts $SP/plugin/hooks                        # seed は自分の 1 つ上の server/ と plugin/hooks/hooks.json を読む
cp scripts/seed_dashboard*.py $SP/scripts/ && cp plugin/hooks/hooks.json $SP/plugin/hooks/
DB_DSN=sqlite:///$SP/seed.db $SP/venv/bin/python $SP/scripts/seed_dashboard.py --users 40 --days 400
$SP/venv/bin/python tmp/content-catalog/data/build_data.py --server $SP/server --db $SP/seed.db
```

- seed の最終日は実行した日になる（`time.time()`）。基準日（`meta.asof`）は events の最終日
- `build_data.py` は example.com 以外のメールが出力に入ると止まる
- 浮動小数は小数 6 桁で丸める（表示の丸めには影響しない）

## キーの構造

| 場所 | 中身 | 出所 |
| --- | --- | --- |
| `meta` | `asof`（epoch 日・JST）・`periods`（`["7","28","12m"]`）・`users` | |
| `p[期間]` | 概況とスキル・コマンドの利用の集計結果そのまま（`period`・`cost`・`month`・`users`・`events`・`sessions`・`bypass`・`reconciliation`・`errors`・`nulls`・`trend`・`usage`・`health`・`skills`・`commands`・`agent`、12m は `period`・`cost`・`month`・`cost_users` だけ） | サーバの `reports/overview.py`・`assets.py` |
| `p[期間].x` | 今の画面に無い指標の表と系列（下表） | `extras.py`・`extras_events.py` |
| `p[期間].m` | 今の画面に無い指標の率・比・一覧（下表） | `extras_more.py` |
| `fixed.policy` | 設定の適用状況（固定 30 日） | `reports/policy.py` |
| `fixed.effect` | 設定の効果（準拠開始日の前後 14 日） | `reports/effect.py` |
| `fixed.settings` | データと設定（`holidays`・`files`・`export`） | `reports/holidays.py`・`csv_files.py`・`export.py` |
| `fixed.x`・`fixed.m` | 期間に依らない足した指標 | `extras.py`・`extras_more.py` |

期間の窓: 利用明細（cost_daily）の指標は今の画面と同じく **CSV の最終日で終わる窓**（`x.cost.start`〜`end`）、
記録（events）の指標は **今日で終わる窓**（`period.start`〜`end`、前の期間は `prev_start`〜`prev_end`）。
**記録の指標は 7・28 日だけ**で、12m には入れていない（今の仕様どおり。12m の `x` は利用明細の項目と `months`）。

### `p[期間].x`

| キー | 形 | 棚卸しの id |
| --- | --- | --- |
| `cost` | `{total, prev, change, users, users_prev, per_user, per_user_prev, per_user_change, per_person_day, top10_share, top10_n, top5_share, start, end}` | cost_total・cost_change・cost_per_user・cost_per_user_day・cost_concentration・billed_users |
| `models[]` | `{key, cost, prev, diff, share, input, output, cache_read, cache_write, tokens, users, per_mtok}` | cost_by_model・tokens_by_model・users_by_model・model_efficiency |
| `tokens` | `{input, output, cache_read, cache_write, total, cache_read_share, output_share}` | tokens_by_kind・cache_read_share・output_ratio |
| `people[]` | 利用者ごと。利用明細: `email, rank, cost, cost_prev, cost_diff, share, cum_share, days, per_day, tokens, input, output, cache_read, cache_write, cache_share, models{モデル: コスト}, top_model`。記録（7・28 日）: `active_days, sessions, prompts, prompts_per_session, interrupts, interrupt_rate, tool_calls, skills, commands, agent_rate, bypass_rate, compacts, version, last_day`。コストの多い順、記録だけの人は後ろ（`rank` なし） | cost_rank_by_user・cost_user_change・model_mix_by_user・user_activity_rank・asset_calls_per_user・active_days_per_user |
| `cost_dist[]` | 1 人あたりコストの分布 `{bin, label, count, now_share}` | cost_per_user（分布） |
| `weekday[]` | 曜日（`key` 0=月）ごとの 1 日平均 `{key, cost, users}` | weekday_profile |
| `months[]`（12m） | 暦月 `{day, cost, users, per_user, new_users, models}` | model_trend・new_users |
| `active`・`active_prev` | `{users, dau, days_per_user, stickiness, sessions, sessions_per_person_day, prompts, prompts_per_session, prompts_per_person_day, interrupts, interrupt_rate, compacts, auto_compacts, auto_share, compacts_per_session, stop_median, stop_p90, skills_users, commands_users, agent_users, bypass_users, *_reach}` | active_users・stickiness・sessions_per_user_day・prompts_total・prompts_per_session・prompts_per_user_day・interrupt_rate・compact_count・auto_compact_rate・context_size・asset_user_rate・bypass_users |
| `daily[]` | 前と直近の期間の日ごと `{day, period, users, sessions, prompts, skills, commands, interrupts, tool_calls, cost, cost_users, cost_per_user}` | daily_active_users・sessions_daily |
| `tools[]` | `{key, calls, failures, fail_rate, users, share}` | tool_calls・tool_calls_by_name・tool_failure_rate |
| `context[]` | 応答終了時のコンテキストの分布（直近と前）`{bin, prev, recent, prev_share, recent_share}` | context_size |
| `hours[]` | 時間帯（JST）ごとの指示 `{key, prompts, share}` | hour_profile |
| `days_dist[]`・`sessions_dist[]` | 利用した日数の分布・1 セッションの指示の数の分布 | active_days_per_user・prompts_per_session |

### `p[期間].m`

利用明細（全期間）: `off_day_cost_share`・`off_day_users`（off_day_usage）、`active_day_rate`・`business_days`、
`new_users[]`・`new_user_count`（new_users）、`retention_rate`・`left_users[]`（7・28 日。retention_rate）、
`cache_write_share`（cache_write_share）、`unit_cost`（unit_cost、100 万トークンあたり USD）。

記録（7・28 日）: `session_span_median_min`・`session_span_dist[]`（session_span）、`tool_calls_per_prompt`、
`cost_per_session`・`cost_per_prompt`（**コストは利用明細の窓、分母は記録の窓**で、窓が 1 日ずれる）、`mcp_calls`・`mcp_users`（mcp_usage。seed に MCP は無く 0）、
`tool_calls_per_person_day`、`subagent_runs`・`subagent_users`・`subagent_user_rate`・`subagent_tools_per_run`、
`permission_mode_by_prompt[]`、`command_source_share[]`、`skill_first_users[]`（asset_first_use）、`effort_by_user{}`、
`large_context_share`（10 万トークン以上）、`context_capture_rate`、`events_per_person_day`、`unknown_user_share`、
`uncollected_billed_users[]`、`collection_stopped_users[]`（collection_disabled_users）。

### `fixed.x`・`fixed.m`

- `x.policy_cost[]`: 適用の状態（ok・off・none・stale）ごとの人数と、利用明細の最終日までの 30 日のコスト
- `m.time_to_comply_median`・`m.time_to_comply_dist[]`（time_to_comply）、`m.apply_result_share[]`（apply_result_share）、
  `m.compliance_trend[]`（週ごと・各週末までの 30 日で端末ごとに最新の報告・設定の平均。compliance_trend）、
  `m.core_by_terminal[]`（version_by_terminal）、`m.csv_freshness_days`・`m.csv_end`（csv_freshness）

## 値を持たない指標

棚卸しの id のうち、ここに値の無いもの: `weekly_billed_users` の 7・28 日（12m の `cost_users` だけ）、
`distributed_asset_calls`（配布物の一覧との突き合わせが要る）、`version_rollout`、`retention_rate` の 12m（`months` から月ごとに出せる）。
収集を足すと得られる指標（棚卸しの 4 節）は値を持たない。

## seed の癖（値を読むときの注意）

seed は一様な乱数で作るため、モデル・提供元・権限モード・スキルがほぼ均等に出る。時間帯はほぼ 0〜6 時に寄り、
セッションは 15 分未満に収まる。利用者数の伸び（12 か月で 8 → 40 人）はある。形の確認には使えるが、傾向の議論には使えない。
