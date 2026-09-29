# 管理画面の中身の棚卸し

集計サーバの管理画面の中身（ページ・群・カード・タブ・指標・計算）を見直すための素材。
対象はサーバの development（`4555c06`）のコードと、`docs/`（spec・knowledge・decisions）である。
「推測」と書いたもの以外は、コードか文書で確かめた事実である。

## 要約

| 区分 | 数 |
| --- | ---: |
| 今のデータで導ける指標（3 節） | 109 |
| うち今の画面にあるもの | 45（うち一部だけ出ているもの 2） |
| うち今の画面に無いもの | 64 |
| 収集を足すと得られる指標（4 節） | 18 |

- 期間の約束: 概況とスキル・コマンドの利用は 7 日・28 日・12 か月を切り替える。日数の期間は「直近 N 日とその前の N 日」を比べ、
  12 か月は比べずに週（月曜始まり）と暦月で並べる。**12 か月は利用明細（`cost_daily`）から数える項目だけを出す**（`decisions/server.md` の判断 25。`events` の 1 年分は 200 名で十数秒〜数十秒の見積もり）
- 設定の適用状況は**固定 30 日**（`POLICY_DAYS`）、設定の効果は**期間なし**（利用者ごとの準拠開始日の前後 14 日。全期間を見る）
- `cost_daily` を数える窓は「今日と CSV の最終日の早いほう」で終わる。CSV は当日に 3 日前の分まで取れ、出た日の値は確定している（`knowledge/measurements.md`）。取り込みは手動で 1〜2 週ごと（`queries_cost.cost_window_end` のコメント）
- `events` と `cost_daily` は **`user_email` の完全一致**で結ぶ（`decisions/server.md` の判断 9。軸は `user_email × 日`。モデルでは結ばない）。
  端末側は `CC_GOVERNANCE_USER_EMAIL` → キャッシュ → `git config --global user.email` の順で解決して小文字化、CSV 側は取込時に前後の空白を除いて小文字化する（`ingestion/csv_import.py`）。一致しない分は照合率に出る
- 件数はすべて `event_id` で一意化して数える（`COUNT(DISTINCT event_id)`。再送の重複が DB に残るため）

---

## 1. 今の画面の構成

### 1.1 ページ一覧

| ページ | パス | 期間の切り替え | 群 | 組み立て（report） |
| --- | --- | --- | --- | --- |
| 概況 | `/` | 7 日・28 日・12 か月 | 利用（`use`）・データの届き具合（`data`） | `reports/overview.py`（`cost.py`・`cost_weeks.py`・`month.py`） |
| 設定の適用状況 | `/policy` | なし（固定 30 日） | 利用者（`who`）・設定と更新（`set`） | `reports/policy.py` |
| 設定の効果 | `/effect` | なし（準拠開始日の前後 14 日） | 設定は働いているか（`work`）・コストの前後差（`spend`） | `reports/effect.py` |
| スキル・コマンドの利用 | `/assets` | 7 日・28 日・12 か月（12 か月は何も出さない） | 呼び出し（`calls`）・サブエージェント（`agent`） | `reports/assets.py` |
| データと設定 | `/settings` | なし | （群なし。取り込む・書き出す・会社の休日の 3 区画） | `web/settings.py`（`reports/csv_files.py`・`export.py`・`holidays.py`） |

### 1.2 概況（`/`）

群「利用」: 直近 N 日とその前の N 日（12 か月は「直近 12 か月・週ごと・利用明細の項目だけ」）。
群「データの届き具合」: 直近 N 日とその前の N 日（照合率は CSV の最終日までの N 日）。12 か月ではこの群のカードを出さず、名前だけ注記する。

| 群 | カード | 値の意味 | 7/28 日 | 12 か月 | 母集団（分母） | 計算元 |
| --- | --- | --- | --- | --- | --- | --- |
| 利用 | 送信した利用者 | 記録を送った利用者の数と前期間との差。小グラフは日ごとの利用者数 | ○ | 「利用明細にいた利用者」に差し替え（12 か月の重複なし人数、週ごとの小グラフ） | `events` の全記録 | `queries_events._health_window_stats`（`COUNT(DISTINCT user_email)`）／12 か月は `cost_weeks.users`（`cost_daily` の `cost > 0`） |
| 利用 | 1 日あたりのセッション | 日ごとの `COUNT(DISTINCT session_id)` の期間平均（記録の無い日は 0）。**全体の合計であり 1 人あたりではない** | ○ | 出さない | `events` | `queries_events.user_session_trend` → `overview.sessions_per_day` |
| 利用 | コスト（利用明細） | 期間の合計と前期間比（%）。小グラフは 2N 日の日ごとの合計 | ○ | 「コスト（利用明細）」（12 か月の合計・月平均。前期間と比べない。週ごとの小グラフ） | `cost_daily` の全行 | `queries_cost.daily_cost` → `reports/cost.py`／`cost_weeks.cost` |
| 利用 | 月末のコスト見込み | 今月の実績 × 月の営業日数 ÷ 経過営業日（3 営業日未満は出さない）。副値に営業日あたり・1 人 1 営業日あたり（前月比） | 今月（期間と無関係） | 同じ | `cost_daily`。1 人あたりの分母はその月に `cost > 0` の利用者 | `reports/month.py`・`metrics/forecast.py`・`business_days.py`（祝日は `jpholiday`、会社の休日は `company_holidays`） |
| 利用 | 確認なしモードの記録 | `permission_mode = bypassPermissions` の記録の割合 | ○ | 出さない | `permission_mode` が非 NULL の記録（ツール呼び出しなど記録単位） | `queries_events.distribution` → `overview.bypass` |
| データの届き具合 | 受信した記録 | 記録の件数と前期間との差 | ○ | 出さない | `events` | `_health_window_stats` |
| データの届き具合 | CSV との照合率 | 記録を送った利用者のうち、同じ期間の `cost_daily` にもいた割合。前と比べない | ○ | 出さない | CSV の最終日で終わる N 日に `events` を送った利用者 | `queries_events.reconciliation_counts` |
| データの届き具合 | プラグインのエラー | `errors` の件数・種類数・段階ごとの内訳。1 件でもあれば注意 | ○（直近 N 日だけ） | 出さない | `errors` | `queries_errors.error_summary` |
| データの届き具合 | 項目の欠け（最大） | 4 項目の NULL 率の最大と、その項目名。20% 超で注意・50% 超で要確認 | ○ | 出さない | 項目ごとに「その項目が来るはずの記録」（下表） | `_health_window_stats`・`metrics/health.py` |

NULL 率の分母（`queries_events._HEALTH_NULL_SCOPES`）: `tool_name` は `PostToolUse`・`PostToolUseFailure`、`skill_name` は `tool_name = 'Skill'`、
`context_tokens` は `PreCompact`・`Stop`、`command_source` は `UserPromptExpansion`。

| タブ | 12 か月 | 行 | 列 | 計算元 |
| --- | --- | --- | --- | --- |
| 日ごとの利用 | 「週ごとの利用者」に差し替え（週の始まり・利用者数・棒。軸の下に暦月の人数） | 2N 日の日 | 日付・期間（直近／前）・利用者数・セッション数・セッション数の棒 | `overview.trend`／`cost_weeks.users` |
| 日ごとのコスト | 「週ごとのコスト」に差し替え（週の始まり・提供元ごと・合計・棒。薄い棒は途中の週） | CSV のある日 | 日付・提供元ごとのコスト（USD）・合計・棒 | `reports/cost.py`／`cost_weeks.cost` |
| 今月のコスト | 同じ | 営業日ごと／暦日ごと（区分で切替） | 日付・何営業日目・その日のコスト・棒・今月の累積（見込みを含む）・前月の累積 | `reports/month.py` |
| 使われ方 | 出さない | 値 | 区分（権限モード・effort・セッションの開始）・値・件数・割合・棒 | `overview.usage`（`distribution` を 3 列で） |
| 受信と項目の欠け | 出さない | 項目 | 区分（受信・項目の欠け）・項目・直近・前・差・状態 | `overview.health_rows` |
| プラグインのエラー | 出さない | 段階 × 種類 | 処理段階・エラーの種類・件数・端末数（利用者とホストの組）・最後に起きた版 | `queries_errors.error_summary` |

「使われ方」の分母は区分ごと: 権限モードと effort は値のある記録すべて、セッションの開始は `source` のある記録（= `SessionStart`）。

### 1.3 設定の適用状況（`/policy`）

群「利用者」: 直近 30 日・対象は分母の利用者。群「設定と更新」: 直近 30 日・端末ごとに最新の報告 1 件。
分母（`queries_policy.denominator_users`）: CSV を一度でも取り込んでいれば「`cost_daily` の 30 日（CSV の最終日で終わる）に現れる利用者」、無ければ「`policy_state` の 30 日に現れる利用者」。
端末 = `(user_email, host)`。対象の設定は `policy.SET` のスカラ値 6 項目。準拠は `prev_value`（セッション開始時点で既にあった値）と配布値の一致。

| 群 | カード | 値の意味 | 母集団 | 計算元 |
| --- | --- | --- | --- | --- |
| 利用者 | すべての設定を適用 | 全端末の全項目が配布値の利用者数と割合 | 分母の利用者 | `rollup.users`・`compliance` |
| 利用者 | 未適用のある利用者 | 1 台でも違う値か未設定の端末がある利用者数。副値に未適用の端末数 | 同上 | 同上 |
| 利用者 | プラグイン未導入 | `cost_daily` の窓にいて `policy_state` の窓にいない利用者 | 同上（CSV があるときだけ意味を持つ） | `queries_policy.not_introduced` |
| 利用者 | 報告が止まった端末 | 最後の `policy_state` から 14 日以上経った端末の数（と利用者数） | 30 日に報告のあった端末 | `queries_policy.stale_terminals` |
| 設定と更新 | 設定ごとの適用率 | 6 項目それぞれの適用率。最も低い項目を副値に | 分母の利用者 | `policy.compliance_rate` |
| 設定と更新 | プラグインが最新版の端末 | 端末ごとの最新 `plugin_version`（`REFERENCE_KEY` の行）のうち最新版の台数 | 30 日に報告のあった端末 | `queries_policy.plugin_version_distribution` |
| 設定と更新 | 本体が最新版の端末 | 端末ごとに版のある最新 `events` 行の `claude_code_version` のうち最新版の台数 | 30 日に `PreCompact`・`Stop` を送った端末 | `queries_policy.claude_code_version_distribution` |

| タブ | 行 | 列 |
| --- | --- | --- |
| 利用者ごと | 利用者 | 状態（未適用あり・未導入・報告停止・すべて適用）・利用者・端末数・6 項目の適用の点・最終報告日 |
| 端末ごと | 端末 | 状態（未適用・報告停止・適用）・利用者・端末名・自動圧縮のしきい値の現在値・未適用の設定・最終報告日 |
| 設定ごと | 設定 | 設定・適用済み／対象・適用率・棒・未適用の端末 |
| バージョン | 種類 × 版 | 種類（プラグイン・本体）・版・端末数・棒 |

### 1.4 設定の効果（`/effect`）

実験は定数で固定: `REFERENCE_KEY = env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`、`REFERENCE_VALUE = "60"`、`EFFECT_PROVIDER = aws-bedrock`。
準拠開始日 = 利用者ごとに `prev_value` が `"60"` になった最初の日（全期間）。前後差は時期の変動を含み、施策の効果とは読まない（実測で対照なしだと偽の −12.5%。`knowledge/measurements.md`）。

| 群 | カード | 値の意味 | 母集団 | 計算元 |
| --- | --- | --- | --- | --- |
| 設定は働いているか | 圧縮直前のコンテキスト（中央の区間） | `PreCompact` の `context_tokens` を 20,000 刻みで数えた、適用後の中央の区間（適用前も副値） | 準拠者の前後 14 日の `PreCompact` | `queries_policy.context_samples`・`metrics/context.py` |
| 設定は働いているか | 応答終了時のコンテキスト（中央の区間） | 同じく `Stop` | 準拠者の前後 14 日の `Stop` | 同上 |
| コストの前後差 | 設定を守り始めた利用者 | 準拠開始日のある利用者の数 | 全期間 | `compliance_start_dates` |
| コストの前後差 | 1 人 1 日あたりのコスト | 前（−14〜−1 日）と後（+1〜+14 日）の、のべ人日で重み付けした 1 人 1 日コスト | その相対日が CSV の期間に入る準拠者（欠損日は 0） | `cost_by_user_day`・`metrics/effect.py` |
| コストの前後差 | 1 人 1 日あたりのトークン | 同じく、入力＋キャッシュ読み＋キャッシュ書き（出力を含まない） | 同上 | 同上 |

| タブ | 行 | 列 |
| --- | --- | --- |
| 圧縮直前の分布 | 区間 | トークン数の区間・適用前の件数・割合・適用後の件数・割合 |
| 応答終了時の分布 | 区間 | 同上 |
| 日ごとの 1 人あたり | 相対日 | 守り始めてからの日数・期間（前／後）・対象者数・1 人あたりトークン・1 人あたりコスト・棒 |

### 1.5 スキル・コマンドの利用（`/assets`）

群「呼び出し」: 直近 N 日とその前の N 日。群「サブエージェント」: 直近 N 日・分母は全記録。12 か月はすべて出さない（すべて `events` から数えるため）。

| 群 | カード | 値の意味 | 母集団 | 計算元 |
| --- | --- | --- | --- | --- |
| 呼び出し | スキルの呼び出し | `skill_name` のある記録の件数・前との差・種類数・上位 3 件と割合 | `skill_name` 非 NULL の記録（`PostToolUse` の Skill） | `queries_events.skill_usage` → `metrics/usage.py` |
| 呼び出し | コマンドの呼び出し | `command_name` のある記録の件数・差・種類数・上位 3 件（定義元をまたいで合計） | `UserPromptExpansion` | `queries_events.command_usage` |
| サブエージェント | サブエージェントの中の記録 | `agent_id` が非 NULL の記録の割合 | 直近 N 日の全記録 | `queries_events.subagent_counts` |

| タブ | 行 | 列 |
| --- | --- | --- |
| スキル | スキル名 | スキル・呼び出し回数・棒・前の期間・差・利用者数・利用者の差（区分: 増えた・減った・変わらない） |
| コマンド | コマンド名 × 定義元 | コマンド・定義元（生値）・同上 |
| サブエージェント | 中／外 | 記録・件数・割合・棒 |

### 1.6 データと設定（`/settings`）

| 区画 | 中身 | 計算元 |
| --- | --- | --- |
| 取り込む | 利用明細の CSV の取込。取り込んだファイルの一覧（ファイル名・期間・大きさ・削除） | `reports/csv_files.py`（`cost_daily.source_file` と `CSV_DIR` の和集合） |
| 書き出す | 月ごとの 4 表の CSV の ZIP。月・行数（4 表）・大きさの目安 | `reports/export.py`・`metrics/export.py` |
| 会社の休日 | 日付・曜日・名前・削除。期間でまとめて追加 | `reports/holidays.py`（`company_holidays`） |

---

## 2. 使えるデータ

### 2.1 表と列

**`events`**（端末の利用ログ。append-only。1 行 = hook の 1 発火）

| 列 | 型 | 意味 |
| --- | --- | --- |
| `event_id` | VARCHAR(36) | 記録ごとの UUID（端末で付与。再送で同じ値が重複して入りうる） |
| `ts` | INTEGER | epoch 秒（端末の時計） |
| `day` | INTEGER | JST の epoch 日 |
| `user_email` | VARCHAR(255) | 利用者（小文字化。解決できなければ NULL） |
| `host` | VARCHAR(255) | 端末のホスト名 |
| `hook_event` | VARCHAR(64) | hook の名前 |
| `context_tokens` | INTEGER | transcript 末尾の `message.usage` の入力＋キャッシュ読み＋キャッシュ書き（コンテキストの大きさ） |
| `claude_code_version` | VARCHAR(32) | transcript 末尾側の `version`（本体の版） |
| `session_id` | VARCHAR(255) | セッションの識別子 |
| `prompt_id` | VARCHAR(255) | 指示（ターン）の識別子 |
| `tool_name` | VARCHAR(255) | ツール名（MCP は `mcp__<server>__<tool>`） |
| `source` | VARCHAR(255) | セッションの開始のしかた（`startup`・`resume`・`clear`・`compact`） |
| `compact_trigger` | VARCHAR(255) | 圧縮の契機（上流の `trigger`。`auto`・`manual`） |
| `command_name` | VARCHAR(255) | 展開されたコマンド名（プラグイン同梱は `<プラグイン名>:<名前>`） |
| `command_source` | VARCHAR(255) | コマンドの定義元（観測値は `userSettings`・`plugin`） |
| `skill_name` | VARCHAR(255) | `tool_input.skill`（Skill ツールのとき） |
| `effort_level` | VARCHAR(255) | `effort.level`（`low`・`medium`・`high`。effort 対応モデルのときだけ） |
| `permission_mode` | VARCHAR(255) | 権限モード（`default`・`acceptEdits`・`plan`・`bypassPermissions`・`auto` など） |
| `agent_id` | VARCHAR(255) | サブエージェントの識別子（サブエージェント内のツール呼び出しにだけ付く。起動ごとに違う値） |
| `is_interrupt` | INTEGER | ツールの失敗が利用者の中断によるものか（0/1） |

**events に `model` の列は無い。**モデルは `cost_daily.model` だけにある（`SessionStart` の `model` は収集していない。4 節）。

**`policy_state`**（設定の適用結果。append-only。`SessionStart` ごとに配る設定の項目数だけ行ができる。無効化スイッチでも止まらない）

| 列 | 型 | 意味 |
| --- | --- | --- |
| `event_id`・`ts`・`day`・`user_email`・`host` | — | events と同じ |
| `key_name` | VARCHAR(128) | 設定のパス（`SET` はそのまま、ほかは `add:`・`remove:`・`once:` 付き） |
| `value` | VARCHAR(255) | 配った値 |
| `prev_value` | VARCHAR(255) | 書き込み前の値（スカラだけ）。準拠の判定に使う |
| `apply_result` | VARCHAR(32) | 適用の結果（`applied`・`already_ok`・`pending`・`skipped_missing`・`skipped_conflict`・`write_failed`・`parse_failed`。`plugin/hooks/_policy_ops.py` ほか） |
| `plugin_version` | VARCHAR(32) | プラグインの版 |

**`errors`**（hook の失敗。append-only。例外メッセージは持たない）

| 列 | 型 | 意味 |
| --- | --- | --- |
| `event_id`・`ts`・`day`・`user_email`・`host`・`hook_event` | — | events と同じ |
| `plugin_version` | VARCHAR(32) | プラグインの版 |
| `stage` | VARCHAR(255) | 処理段階（`apply_settings`・`collect`・`send`・`identity`・`notices`・`statusline`・`mark_seen`） |
| `error_type` | VARCHAR(255) | 例外クラス名か `HTTP <状態コード>` |

**`cost_daily`**（AI Gateway の日次 CSV。取込で `day` 単位に置き換える）

| 列（CSV のヘッダ） | 型 | 意味 |
| --- | --- | --- |
| `day`（Date） | INTEGER | 日（JST の epoch 日に変換） |
| `user_email`（User Email） | VARCHAR(255) | 利用者（取込で小文字化） |
| `provider`（Provider） | VARCHAR(255) | 提供元（`aws-bedrock`・`google-vertex`。1 ファイルに 2 種ある） |
| `model`（Model） | VARCHAR(255) | モデル名（AI Gateway の表記。端末の表記とは違う。名寄せしない） |
| `currency`（Currency） | VARCHAR(255) | 通貨（観測は USD だけ） |
| `cost`（Cost） | DOUBLE | コスト |
| `input_tokens`（Input Tokens） | BIGINT | 入力トークン（実測では全行で `uncached_input_tokens` と一致） |
| `output_tokens`（Output Tokens） | BIGINT | 出力トークン |
| `cache_read_tokens`（Cache Read Tokens） | BIGINT | キャッシュ読み込み（入力の約 166 倍。実測） |
| `cache_write_tokens`（Cache Write Tokens） | BIGINT | キャッシュ書き込み |
| `cached_input_tokens`（Cached Input Tokens） | BIGINT | 意味は未確認（`cache_read_tokens` との関係を文書で確かめられない） |
| `uncached_input_tokens`（Uncached Input Tokens） | BIGINT | キャッシュされない入力 |
| `source_file` | VARCHAR(255) | 取り込んだファイル名（サーバが付与） |

- 行の粒度は「日 × 利用者 × 提供元 × モデル」と**推測**する（列の構成から。文書に明記は無い）。モデル別に取れるのは `cost` と 6 種のトークンすべて
- CSV には Claude Code 以外の利用も含むとされる（運用上の記憶。`docs/` には記載が無く未確認）。このため「コスト ÷ セッション」などの突合は過大になりうる
- 取込の遅れ: 取れるのは 3 日前の分まで。画面の窓は CSV の最終日で終わる

**`company_holidays`**（サーバ専用。契約の表ではない）: `day` INTEGER（主キー）・`name` VARCHAR(255)。営業日の計算（見込み・今月のコスト）に使う。

### 2.2 hook_event × 項目（`events`）

登録している hook は 7 つ（`plugin/hooks/hooks.json`）。`SessionEnd`・`PreToolUse` などは登録していないので `events` に来ない。
全行に入る列: `event_id`・`ts`・`day`・`user_email`・`host`・`hook_event`。
凡例: ○ = 届く ／ △ = 条件付き ／ × = 来ない（NULL）。根拠は契約の註記・`plugin/hooks/collect.py`・実採取の hook 入力（`tests/fixtures/hook_inputs/` 112 件）・`knowledge/`。

| 項目 | SessionStart | UserPromptSubmit | UserPromptExpansion | PostToolUse | PostToolUseFailure | PreCompact | Stop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `session_id` | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `prompt_id` | △（採取 9 件中 2 件） | ○ | ○ | ○（サブエージェント内は呼んだターンの値） | ○ | ○ | ○ |
| `tool_name` | × | × | × | ○ | ○ | × | × |
| `source` | ○ | × | × | × | × | × | × |
| `compact_trigger` | × | × | × | × | × | ○ | × |
| `command_name` | × | × | ○ | × | × | × | × |
| `command_source` | × | × | ○ | × | × | × | × |
| `skill_name` | × | × | × | △（Skill のときだけ） | ×（失敗したスキル呼び出しでは hook 自体が発火しない） | × | × |
| `effort_level` | × | ×（採取 0/16） | ×（採取 0/4） | △（effort 対応モデルのとき） | △（同） | ×（採取 0/1） | △（同） |
| `permission_mode` | ×（`-p` で None。対話は未確認） | ○ | ○ | ○ | ○ | 未確認（採取 1 件に無い） | ○ |
| `agent_id` | × | × | × | △（サブエージェント内だけ。Agent ツール自体の行には無い） | △（同） | × | ×（文書で確認） |
| `is_interrupt` | × | × | × | × | ○ | × | × |
| `context_tokens` | × | × | × | × | × | ○（transcript から） | ○（同。対話では 1 ターン遅れうる） |
| `claude_code_version` | × | × | × | × | × | ○（同） | ○（同） |

頻度: `PostToolUse`・`PostToolUseFailure` が最多（1 ターンに数回〜数十回）、`UserPromptSubmit`・`UserPromptExpansion`・`Stop` が中、`SessionStart`・`PreCompact` が低。
記録単位の割合（権限モード・effort・サブエージェント）は、ツール呼び出しの多い使い方に重みが寄る。
Agent ツールを使うと、利用者の入力 1 回で `UserPromptSubmit` と `Stop` が 2 組出ることがある（`knowledge/upstream-features.md`。解釈は推定）。

### 2.3 母集団の取り方

| 母集団 | 取り方 | 注意 |
| --- | --- | --- |
| 記録を送った利用者 | `events` の DISTINCT `user_email` | 無効化スイッチ中の人・未導入の人を含まない。`user_email` NULL は 1 人に潰れる |
| 利用明細の利用者 | `cost_daily` の `cost > 0` の DISTINCT `user_email` | 最も広い分母。Claude Code 以外の利用を含みうる（未確認） |
| 設定を報告した利用者・端末 | `policy_state` の DISTINCT `user_email`・`(user_email, host)` | 無効化スイッチでも届く |
| 人日 | DISTINCT `(user_email, day)` | 1 人 1 日あたりの分母 |

---

## 3. 導ける指標の一覧（今のデータ）

列: 期間は「7 日／28 日／12 か月」（○ 出せる、× 今の仕様では出さない＝`events` 由来）。重さは 軽い（`cost_daily`・`policy_state`・`errors` の集計）／中（`events` の期間 1 回の集計）／重い（`events` をセッション・利用者・指示ごとに組む、表をまたいで結ぶ、利用者ごとのループ）。
個人は「利用者ごとの値・順位・一覧として出せるか」。今の画面は「ページ・カードかタブ」。

### 3.1 利用者と頻度

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| active_users | 記録を送った利用者 | 期間に 1 件でも記録を送った人数 | `events` の `COUNT(DISTINCT user_email)` | ○／○／× | 中 | — | 概況・送信した利用者 |
| billed_users | 利用明細にいた利用者 | 期間にコストがあった人数 | `cost_daily` の `cost > 0` の DISTINCT `user_email` | ○／○／○ | 軽い | — | 概況 12 か月・利用明細にいた利用者（今月の人数は見込みの注記） |
| daily_active_users | 日ごとの利用者数 | 日ごとの利用者数の推移 | `events` を `day` で束ね DISTINCT `user_email` | ○／○／× | 中 | — | 概況・日ごとの利用タブ・送信した利用者の小グラフ |
| weekly_billed_users | 週ごと・月ごとの利用者数 | 週（月曜始まり）・暦月ごとの重複なし人数 | `cost_daily` の `(day, user_email)` を週・月で重複除去 | ×／×／○（7・28 日でも出せる） | 軽い | — | 概況 12 か月・週ごとの利用者タブ |
| active_days_per_user | 利用した日数 | 1 人が期間に使った日数 | 利用者ごとの DISTINCT `day`（`cost_daily` の `cost > 0`、または `events`） | ○／○／○（`cost_daily` なら） | 軽い | ○ | — |
| active_day_rate | 営業日の利用率 | 期間の営業日のうち使った日の割合 | `active_days_per_user` ÷ 営業日数（`business_days`：祝日と `company_holidays` を除く） | ○／○／○ | 軽い | ○ | — |
| stickiness | 定着度 | 平均の日次利用者 ÷ 期間の利用者（毎日使う人の多さ） | `daily_active_users` の平均 ÷ `billed_users`（または `active_users`） | ○／○／○（`cost_daily` なら） | 軽い | — | — |
| new_users | 使い始めた利用者 | 期間に初めて現れた人 | 利用者ごとの `cost_daily` 全期間の `MIN(day)` が期間内 | ○／○／○ | 軽い | ○ | — |
| retention_rate | 継続率・離れた利用者 | 前期間の利用者のうち今期間も使った割合と、使わなくなった人 | 前期間と今期間の利用者の集合の積・差 | ○／○／○（月単位で比べる） | 軽い | ○ | — |
| weekday_profile | 曜日ごとの利用 | 曜日ごとの平均の利用者数・コスト | `day` を曜日に直して平均 | ○／○／○（`cost_daily` なら） | 軽い | — | — |
| off_day_usage | 休日の利用 | 週末・祝日・会社の休日の利用者数とコスト | `business_days.off_days` の日の `cost_daily` | ○／○／○ | 軽い | ○ | —（今月のコストのタブは休日を示すが量を分けない） |
| hour_profile | 時間帯ごとの利用 | 時（JST）ごとの記録件数・利用者数 | `events.ts` を JST の時に直して束ねる | ○／○／× | 中 | ○ | — |
| user_activity_rank | 利用者ごとの利用量の順位 | 利用者ごとのセッション数・指示数・ツール呼び出し数の順位 | `events` を `user_email` で束ね、各 hook の件数 | ○／○／× | 中 | ○ | — |
| terminals_per_user | 1 人あたりの端末数 | 利用者が使う端末の数 | `policy_state` の利用者ごとの DISTINCT `host`（30 日） | 固定 30 日 | 軽い | ○ | 設定の適用状況・利用者ごとタブの端末 |

### 3.2 セッションと指示

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sessions_per_day | 1 日あたりのセッション（全体） | 全員合計のセッション数の日平均 | 日ごとの `COUNT(DISTINCT session_id)` の平均（記録の無い日は 0） | ○／○／× | 中 | — | 概況・1 日あたりのセッション |
| sessions_daily | 日ごとのセッション数 | 日ごとの全体のセッション数 | `day` で束ね DISTINCT `session_id` | ○／○／× | 中 | — | 概況・日ごとの利用タブ |
| sessions_per_user_day | 1 人 1 日あたりのセッション | 使った日に 1 人が開くセッション数 | DISTINCT `session_id` ÷ 人日 | ○／○／× | 中 | ○ | — |
| prompts_total | 指示の数 | 利用者が送った指示の数 | `UserPromptSubmit` の DISTINCT `event_id` | ○／○／× | 中 | ○ | — |
| prompts_per_session | 1 セッションあたりの指示 | セッションの深さ | `prompts_total` ÷ DISTINCT `session_id` | ○／○／× | 中 | ○ | — |
| prompts_per_user_day | 1 人 1 日あたりの指示 | 使った日の指示の多さ | `prompts_total` ÷ 人日 | ○／○／× | 中 | ○ | — |
| tool_calls_per_prompt | 1 指示あたりのツール呼び出し | 1 回の指示で動くツールの数（任せ方の大きさ） | ツール系の記録を `prompt_id` で束ねた件数の平均・中央値（サブエージェント内も親の `prompt_id`） | ○／○／× | 重い | ○ | — |
| session_span | セッションの長さ | 最初と最後の記録の間の時間 | `session_id` ごとの `MAX(ts) − MIN(ts)` の中央値（放置時間を含むため長く出ると推測） | ○／○／× | 重い | ○ | — |

### 3.3 コストとトークン

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cost_total | コスト合計 | 期間の合計コスト | `cost_daily` の `SUM(cost)`（窓は CSV の最終日で終わる） | ○／○／○ | 軽い | ○ | 概況・コスト（利用明細） |
| cost_change | コストの前期間比 | 直近と前の期間の増減率 | (直近 − 前) ÷ 前 | ○／○／×（12 か月は比べない） | 軽い | ○ | 概況・コストの差 |
| cost_by_provider | 日ごと・週ごと・提供元ごとのコスト | 提供元別の推移 | `day × provider` の `SUM(cost)`（12 か月は週・暦月に集約） | ○／○／○ | 軽い | ○ | 概況・日ごとのコスト／週ごとのコスト |
| cost_monthly_avg | 月平均コスト | 12 か月の 1 か月あたり | 合計 ÷ CSV のある日数 × 1 か月の日数 | ×／×／○ | 軽い | ○ | 概況 12 か月・コストの副値 |
| month_forecast | 月末のコスト見込み | 今月の着地見込み | 実績 × 月の営業日 ÷ 経過営業日（3 営業日未満は出さない） | 今月 | 軽い | ○ | 概況・月末のコスト見込み |
| cost_per_business_day | 営業日あたりのコスト | 今月・前月の営業日あたり | 実績 ÷ 経過営業日 | 今月・前月 | 軽い | — | 概況・見込みの副値 |
| cost_per_user_business_day | 1 人 1 営業日あたりのコスト | 利用者の増減を除いた単価 | 営業日あたり ÷ その月に `cost > 0` の人数 | 今月・前月 | 軽い | — | 概況・見込みの副値 |
| month_cumulative | 今月の累積と前月の累積 | 営業日・暦日で揃えた累積の比較 | `forecast.month` の行 | 今月・前月 | 軽い | — | 概況・今月のコストタブ |
| cost_per_user | 1 人あたりコスト | 期間の 1 人あたり | `cost_total` ÷ `billed_users` | ○／○／○ | 軽い | — | — |
| cost_per_user_day | 1 人 1 日あたりのコスト（全体） | 使った日の 1 人あたり | `cost_total` ÷ `cost > 0` の人日 | ○／○／○ | 軽い | ○ | —（設定の効果には準拠者・Bedrock・前後比較の形でだけある） |
| cost_rank_by_user | 利用者ごとのコスト順位 | 誰にいくらかかっているか。前期間・差・日数を添える | `cost_daily` を `user_email` で `SUM(cost)` し降順 | ○／○／○ | 軽い | ○ | — |
| cost_concentration | コストの集中 | 上位 N 人（例: 5 人・上位 10%）の占有率と、1 人あたりの分布（中央値・p90・最大） | 利用者別の合計を並べて累積 | ○／○／○ | 軽い | — | — |
| cost_user_change | 利用者ごとのコストの増減 | 前期間から大きく増えた・減った人 | 利用者別の直近 − 前 | ○／○／○（月で比べる） | 軽い | ○ | — |
| tokens_by_kind | トークンの内訳 | 入力・出力・キャッシュ読み・キャッシュ書きの合計 | `cost_daily` の 4 列の `SUM` | ○／○／○ | 軽い | ○ | — |
| tokens_per_user_day | 1 人 1 日あたりのトークン（全体） | 使った日の 1 人あたりの処理量 | トークン合計 ÷ 人日 | ○／○／○ | 軽い | ○ | —（設定の効果には準拠者の前後比較の形でだけある） |
| cache_read_share | キャッシュ読み込みの割合 | 入力側のうちキャッシュから読んだ割合（高いほど安く済む） | `cache_read` ÷ (`input` + `cache_read` + `cache_write`) | ○／○／○ | 軽い | ○ | — |
| cache_write_share | キャッシュ書き込みの割合 | 入力側のうちキャッシュを作った割合（再開・切れが多いと上がる） | `cache_write` ÷ 同 | ○／○／○ | 軽い | ○ | — |
| output_ratio | 出力の割合 | 入力側に対する出力の比 | `output` ÷ (`input` + `cache_read` + `cache_write`) | ○／○／○ | 軽い | ○ | — |
| unit_cost | 100 万トークンあたりのコスト | 実効単価 | `cost` ÷ 4 種の合計 × 10⁶ | ○／○／○ | 軽い | ○ | — |
| cost_per_session | 1 セッションあたりのコスト | 1 回の作業の値段 | `(user_email, day)` で `cost_daily` と `events` の DISTINCT `session_id` を結んで比（CSV は Claude Code 以外を含みうる） | ○／○／× | 重い | ○ | — |
| cost_per_prompt | 1 指示あたりのコスト | 1 回の指示の値段 | 同じく `UserPromptSubmit` の件数で割る | ○／○／× | 重い | ○ | — |

### 3.4 モデル

`cost_daily.model` だけが持つ。`events` とはモデルで結ばない（名寄せ表を持たない判断）。

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cost_by_model | モデルごとのコスト | どのモデルにいくらかかっているか | `cost_daily` を `model` で `SUM(cost)` | ○／○／○ | 軽い | ○ | — |
| tokens_by_model | モデルごとのトークン | モデル別の 4 種のトークン | `model` で 4 列を `SUM` | ○／○／○ | 軽い | ○ | — |
| users_by_model | モデルごとの利用者数 | そのモデルを使った人数 | `model` ごとの `cost > 0` の DISTINCT `user_email` | ○／○／○ | 軽い | — | — |
| model_mix_by_user | 利用者ごとのモデル構成 | 1 人のコストのうち各モデルの割合（上位モデルに偏る人） | 利用者 × `model` のコスト比 | ○／○／○ | 軽い | ○ | — |
| model_efficiency | モデルごとの単価とキャッシュ | モデル別の 100 万トークンあたりコストとキャッシュ読み込みの割合 | `unit_cost`・`cache_read_share` を `model` で | ○／○／○ | 軽い | — | — |
| model_trend | モデル構成の推移 | 週ごとのモデル別コストの割合（切り替えの広がり） | 週 × `model` の `SUM(cost)` | ○／○／○ | 軽い | — | — |

### 3.5 スキルとコマンド

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| skill_calls | スキルの呼び出し | 呼び出し回数と前期間との差 | `skill_name` 非 NULL の DISTINCT `event_id` | ○／○／× | 中 | ○ | スキル・コマンドの利用・スキルの呼び出し |
| skill_calls_by_name | スキルごとの呼び出し | スキル別の回数・利用者数・差・増減の区分、上位 3 件の割合 | `skill_name` で束ね、直近と前を条件付き集約 | ○／○／× | 中 | ○ | スキルタブ・カードの上位 3 件 |
| command_calls | コマンドの呼び出し | 呼び出し回数と差 | `command_name` 非 NULL の DISTINCT `event_id` | ○／○／× | 中 | ○ | コマンドの呼び出し |
| command_calls_by_name | コマンドごとの呼び出し | コマンド × 定義元の回数・利用者数・差 | `command_name`・`command_source` で束ねる | ○／○／× | 中 | ○ | コマンドタブ・カードの上位 3 件 |
| asset_kinds | 使われた種類の数 | 使われたスキル・コマンドの種類数 | DISTINCT 名前 | ○／○／× | 中 | ○ | カードの副値 |
| asset_user_rate | スキル・コマンドを使った人の割合 | 利用者のうちスキル（コマンド）を 1 回でも使った割合 | 使った DISTINCT `user_email` ÷ `active_users` | ○／○／× | 中 | — | — |
| command_source_share | 定義元ごとの割合 | プラグイン同梱・利用者定義などの割合 | `command_source` 別の件数の割合（観測値は `plugin`・`userSettings`。ほかの値は未確認） | ○／○／× | 中 | ○ | —（タブに列はあるが集計しない） |
| distributed_asset_calls | 配布したスキル・コマンドの利用 | このプラグインが配ったものの回数・利用者・利用率 | 名前が `<プラグイン名>:` で始まるものに絞る（接頭辞での判別はスキルにも効くと推測） | ○／○／× | 中 | ○ | — |
| asset_calls_per_user | 利用者ごとの呼び出し | 1 人ごとのスキル・コマンドの回数と種類 | `user_email` で束ねる | ○／○／× | 中 | ○ | — |
| asset_first_use | 初めて使った利用者 | スキル・コマンドごとの新たな利用者（広がり） | 利用者 × 名前の `MIN(day)`（全期間）が期間内 | ○／○／× | 重い | ○ | — |

### 3.6 ツール

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tool_calls | ツールの呼び出し | ツールを動かした回数 | `hook_event IN ('PostToolUse','PostToolUseFailure')` の DISTINCT `event_id` | ○／○／× | 中 | ○ | — |
| tool_calls_by_name | ツールごとの利用 | ツール別の回数・利用者数・差 | `tool_name` で束ねる | ○／○／× | 中 | ○ | — |
| tool_failure_rate | ツールの失敗の割合 | 全体とツール別の失敗の割合 | `PostToolUseFailure` ÷ (`PostToolUse` + `PostToolUseFailure`) | ○／○／× | 中 | ○ | — |
| interrupt_rate | 中断の割合 | 利用者がツールの実行を止めた割合 | `is_interrupt = 1` ÷ ツール系の記録（または ÷ `PostToolUseFailure`）。ツール実行外の中断は現れないと推測 | ○／○／× | 中 | ○ | — |
| mcp_usage | MCP の利用 | MCP ツールの割合と MCP サーバごとの回数・利用者 | `tool_name LIKE 'mcp__%'`、`mcp__<server>__<tool>` を分解 | ○／○／× | 中 | ○ | — |
| tool_calls_per_user_day | 1 人 1 日あたりのツール呼び出し | 任せている作業量 | `tool_calls` ÷ 人日 | ○／○／× | 中 | ○ | — |

### 3.7 サブエージェント

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| subagent_record_share | サブエージェントの中の記録 | 全記録のうちサブエージェント内の割合 | `agent_id` 非 NULL ÷ 全記録 | ○／○／× | 中 | ○ | スキル・コマンドの利用・サブエージェントの中の記録・タブ |
| subagent_runs | サブエージェントの起動回数 | 何回サブエージェントを使ったか | DISTINCT `agent_id`（内でツールを使った起動だけ）、または `tool_name = 'Agent'` の `PostToolUse` の件数 | ○／○／× | 中 | ○ | — |
| subagent_user_rate | サブエージェントを使った人の割合 | 利用者のうち使った人 | `agent_id` 非 NULL の DISTINCT `user_email` ÷ `active_users` | ○／○／× | 中 | — | — |
| subagent_tools_per_run | 1 起動あたりのツール呼び出し | サブエージェントに任せた作業の大きさ | `agent_id` ごとの件数の中央値 | ○／○／× | 重い | ○ | — |

### 3.8 使われ方（権限モード・effort・開始のしかた）

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| permission_mode_share | 権限モードの分布（記録単位） | 記録のうち各モードの割合 | `permission_mode` 別の DISTINCT `event_id` の割合 | ○／○／× | 中 | ○ | 概況・使われ方タブ |
| bypass_rate | 確認なしモードの割合 | `bypassPermissions` の記録の割合 | `bypassPermissions` ÷ `permission_mode` 非 NULL | ○／○／× | 中 | ○ | 概況・確認なしモードの記録 |
| bypass_users | 確認なしモードを使った利用者 | 使った人の数と一覧 | `bypassPermissions` の記録がある DISTINCT `user_email` | ○／○／× | 中 | ○ | — |
| permission_mode_by_prompt | 権限モードの分布（指示単位） | 指示の時点のモードの割合（記録単位はツールの多いモードに寄るため） | `UserPromptSubmit` の `permission_mode` の割合 | ○／○／× | 中 | ○ | — |
| effort_share | effort の分布 | 記録のうち effort ごとの割合 | `effort_level` 別の割合 | ○／○／× | 中 | ○ | 概況・使われ方タブ |
| effort_by_user | 利用者ごとの effort | 1 人ごとの effort の構成（`high` に偏る人など） | 利用者 × `effort_level` | ○／○／× | 中 | ○ | — |
| session_source_share | セッションの開始のしかた | 新規・再開・クリア後・圧縮後の割合 | `SessionStart` の `source` 別の割合 | ○／○／× | 中 | ○ | 概況・使われ方タブ |

### 3.9 コンテキストと圧縮

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| compact_count | 圧縮の回数 | 圧縮が走った回数と、自動・手動の内訳 | `PreCompact` の DISTINCT `event_id`、`compact_trigger` 別 | ○／○／× | 中 | ○ | — |
| auto_compact_rate | 自動圧縮の頻度 | セッション（または人日）あたりの自動圧縮 | `compact_trigger = 'auto'` の件数 ÷ セッション数 | ○／○／× | 中 | ○ | — |
| context_size | コンテキストの大きさ | 応答終了時・圧縮直前のトークン数の中央値・p90（準拠と無関係に全体） | `Stop`・`PreCompact` の `context_tokens` の分位 | ○／○／× | 中 | ○ | — |
| large_context_share | 大きなコンテキストの割合 | 閾値（例: 20 万）を超えた応答の割合 | `Stop` の `context_tokens` > 閾値 ÷ `Stop` | ○／○／× | 中 | ○ | — |
| precompact_context_shift | 圧縮直前のコンテキストの前後比較 | しきい値を守り始めた前後で、圧縮が小さいうちに走るようになったか | 準拠者の前後 14 日の `PreCompact` の `context_tokens` を 2 万刻みで数え、中央の区間 | 準拠開始日の前後 | 重い | ○ | 設定の効果・圧縮直前のコンテキスト・分布タブ |
| stop_context_shift | 応答終了時のコンテキストの前後比較 | 同じく応答終了時 | 同じく `Stop` | 準拠開始日の前後 | 重い | ○ | 設定の効果・応答終了時のコンテキスト・分布タブ |

### 3.10 設定の適用

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| all_applied_users | すべての設定を適用した利用者 | 全端末の全項目が配布値の人数と割合 | 端末ごとの最新 `prev_value` と配布値の一致を利用者で集約 | 固定 30 日 | 中 | ○ | 設定の適用状況・すべての設定を適用 |
| off_users | 未適用のある利用者 | 1 台でも違う値の人と、その端末数 | 同上の否定 | 固定 30 日 | 中 | ○ | 未適用のある利用者 |
| not_introduced_users | プラグイン未導入 | コストがあるのに設定の報告が無い人 | `cost_daily` の窓 − `policy_state` の窓 | 固定 30 日 | 軽い | ○ | プラグイン未導入 |
| stale_terminals | 報告が止まった端末 | 最後の報告から 14 日以上の端末と人数 | `policy_state` の端末ごとの `MAX(day)` | 固定 30 日 | 軽い | ○ | 報告が止まった端末 |
| setting_compliance_rate | 設定ごとの適用率 | 項目ごとの適用済み／対象・率・未適用の端末数 | 項目ごとに `compliance_rate` | 固定 30 日 | 中 | ○ | 設定ごとの適用率・設定ごとタブ・利用者ごとタブの点 |
| terminal_values | 端末ごとの現在の値 | 端末の状態・しきい値の現在値・未適用の設定・最終報告日 | 端末ごとの最新 1 行 | 固定 30 日 | 中 | ○ | 端末ごとタブ |
| adopters | 設定を守り始めた利用者 | しきい値を守り始めた人数 | 利用者ごとの `prev_value = '60'` の `MIN(day)` | 全期間 | 軽い | ○ | 設定の効果・設定を守り始めた利用者 |
| effect_cost_per_user_day | 守り始めた前後の 1 人 1 日コスト | イベントスタディの前後差 | 相対日 ±14（0 日を除く）・`aws-bedrock`・欠損日は 0・のべ人日で重み付け | 準拠開始日の前後 | 中 | — | 設定の効果・1 人 1 日あたりのコスト・日ごとの 1 人あたりタブ |
| effect_tokens_per_user_day | 守り始めた前後の 1 人 1 日トークン | 同じく入力＋キャッシュ読み書き | 同上 | 準拠開始日の前後 | 中 | — | 設定の効果・1 人 1 日あたりのトークン・同タブ |
| time_to_comply | 適用までの日数 | 報告が始まってから守り始めるまでの日数 | 利用者ごとの準拠開始日 − 最初の `policy_state` の日 | 全期間 | 軽い | ○ | — |
| apply_result_share | 適用結果の内訳 | 書き込みの成否（`applied`・`already_ok`・`write_failed`・`parse_failed`・`skipped_conflict` ほか）の割合と該当端末 | `policy_state.apply_result` の分布 | ○／○／○ | 中 | ○ | — |
| compliance_trend | 適用率の推移 | 週ごとの適用率 | 各週末時点の端末ごとの最新値で率を出し直す | 任意 | 重い | — | — |

### 3.11 版

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| plugin_latest_terminals | プラグインが最新版の端末 | 最新版の台数と全台数 | `REFERENCE_KEY` の行の端末ごとの最新 `plugin_version` | 固定 30 日 | 中 | ○ | 設定の適用状況・プラグインが最新版の端末 |
| core_latest_terminals | 本体が最新版の端末 | 最新版の台数と全台数 | 版のある `events` の端末ごとの最新 `claude_code_version` | 固定 30 日 | 重い | ○ | 本体が最新版の端末 |
| version_distribution | 版の分布 | 版ごとの台数（プラグイン・本体） | 同上を版で束ねる | 固定 30 日 | 中 | — | バージョンタブ |
| version_by_terminal | 端末ごとの版 | 古い版に留まる端末と利用者 | 端末一覧に最新の版を付ける | 固定 30 日 | 中 | ○ | — |
| version_rollout | 版が行き渡るまでの日数 | 新しい版の初出から端末の大半が追いつくまで | 版ごとの端末の初出日の分布 | 全期間 | 重い | — | — |

### 3.12 収集の状態とエラー

| id | 名前 | 意味 | 計算 | 期間 | 重さ | 個人 | 今の画面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| events_received | 受信した記録 | 記録の件数と前期間との差（急落は収集の停止） | DISTINCT `event_id` | ○／○／× | 中 | ○ | 概況・受信した記録・受信と項目の欠けタブ |
| reconciliation_rate | CSV との照合率 | 記録を送った人のうち利用明細にもいた割合（低下は `user_email` の不一致） | CSV の最終日で終わる窓で、`events` の利用者 ∩ `cost_daily` の利用者 ÷ `events` の利用者 | ○／○／× | 中 | — | 概況・CSV との照合率 |
| null_rate_by_field | 項目の欠け | 4 項目の NULL 率と状態（100% は上流のキー改名を疑う） | 項目ごとの分母の記録のうち NULL | ○／○／× | 中 | — | 概況・項目の欠け（最大）・受信と項目の欠けタブ |
| plugin_errors | プラグインのエラー | 段階 × 種類ごとの件数・端末数・最後の版 | `errors` を `stage`・`error_type` で束ねる | ○／○／○（`errors` は小さい。今は直近 N 日だけ） | 軽い | ○ | 概況・プラグインのエラー・同タブ |
| uncollected_billed_users | 記録の無い利用明細の利用者 | コストがあるのに記録を送っていない人（未導入・無効化スイッチ・メールの不一致） | `cost_daily` の窓の利用者 − `events` の窓の利用者 | ○／○／× | 中 | ○ | —（照合率は逆向きで `events` 側が分母） |
| collection_disabled_users | 収集を止めている疑いのある利用者 | 設定の報告はあるが記録が無い人 | `policy_state` の窓の利用者 − `events` の窓の利用者（無効化スイッチは `policy_state` を止めないため。判定は推測を含む） | ○／○／× | 中 | ○ | — |
| events_per_user_day | 1 人 1 日あたりの記録件数 | 極端に少ない端末（取りこぼし）の手がかり | DISTINCT `event_id` ÷ 人日 | ○／○／× | 中 | ○ | — |
| context_capture_rate | コンテキストの取得率 | `Stop` のうち `context_tokens` を取れた割合（ベースラインは約 3.5%。`decisions/plugin.md`） | `null_rate_by_field` の `context_tokens` を `hook_event` 別・利用者別に | ○／○／× | 中 | ○ | 一部（概況の項目の欠けに全体の率だけ） |
| unknown_user_share | 利用者不明の記録 | `user_email` が NULL の記録の割合（照合できない） | `user_email IS NULL` ÷ 全記録 | ○／○／× | 中 | — | — |
| csv_freshness | 利用明細の鮮度 | CSV の最終日と今日の差（取り込み忘れ） | `MAX(cost_daily.day)` と今日の差 | 現時点 | 軽い | — | 一部（見込みの「時点」・コストの範囲の日付として出る） |

---

## 4. 収集を足すと得られる指標

上流の hook が項目を持つかは `docs/knowledge/upstream-features.md` と `claude-code-behavior.md` で確かめた。
「判断」は `docs/decisions/plugin.md` の「採らない」「再検討の条件」に当たるもの（足すなら判断を開き直す）。

| id | 名前 | 足すもの（hook・項目） | 得られること | 上流での確認 | 判断との関係 |
| --- | --- | --- | --- | --- | --- |
| session_model_share | セッションのモデル分布 | `SessionStart` の `model` | セッション開始時のモデルの割合、1M コンテキスト（`[1m]` 付き）の利用率。コンテキストの分布をモデルで層別 | 実測あり（`claude -p` では `SessionStart` にも無い） | 再検討の条件に掲載。CSV の `Model` とは突き合わせない |
| model_switch_count | モデルの切り替え | `PostModelSwitch` を登録し `from_model`・`to_model` | 途中の切り替えの回数と向き | 公式のみ・実測なし | — |
| subagent_type_share | サブエージェントの種類 | サブエージェント内の `agent_type`、または `PostToolUse`（Agent）の `tool_input.subagent_type` | どの種類（Explore など）がどれだけ使われたか | 実測あり | 「種別で層別しない」「`tool_input` から読むキーを増やさない」を採っている |
| tool_duration | ツールの実行時間 | `PostToolUse` の `duration_ms` | ツール別の実行時間の分布（作業の速さではない） | 実測あり | — |
| skill_success_rate | スキル呼び出しの成否 | `PostToolUse`（Skill）の `tool_response.success` | スキルの成功率 | 実測は `true` だけ。失敗したスキル呼び出しでは hook 自体が発火しないため、`false` が届く場面は未確認 | `tool_input` 以外の入力を読むことになる |
| mcp_server_origin | MCP サーバの出自 | ツール系 hook の `mcp_server`（`name`・`source`） | 配布した MCP か個人設定かの割合 | 公式あり。実測は `PostToolUseFailure` だけ | — |
| turn_failure_rate | ターンの失敗 | `StopFailure` を登録し `error` | レート制限・過負荷・認証などの失敗の頻度と種類 | 公式のみ・実測なし | — |
| session_end_reason | セッションの閉じ方 | `SessionEnd` を登録し `reason` | 閉じ方（`prompt_input_exit`・`clear`・`logout` など）の割合 | 実測は 2 値だけ（`prompt_input_exit`・`other`） | — |
| session_duration | セッションの長さ（正確） | `SessionEnd` の `ts` | 開始から終了までの時間 | `SessionEnd` は実在。異常終了で発火しないと推測 | コンテキスト取得の hook としては「増やさない」を採っている（列を取らない登録なら別） |
| resume_cache_expiry | 再開時のキャッシュ切れ | `SessionStart`（`resume`・`fork`）の `prompt_cache_likely_expired`・`seconds_since_last_response` | 「前回応答から N 分でキャッシュが切れる」の実データ | 公式あり・`resume` で実測 | 再検討の条件に掲載 |
| resume_cache_write_usd | 再開が生むキャッシュ書き込み額 | 同 `estimated_cache_write_usd` | CSV の Cache Write を再開の行動に分解 | 公式あり・`resume` で実測 | 再検討の条件に掲載 |
| post_compact_context | 圧縮後のコンテキスト | `PostCompact` を登録し、その時点の transcript を読む | 圧縮でどれだけ減ったか（しきい値の効き目の直接の測定） | `PostCompact` は公式のみ・実測なし。圧縮後のトークン数は入力に無く、transcript から読めるかは未検証 | 再検討の条件に掲載 |
| permission_denied_count | 権限の拒否 | `PermissionDenied` を登録 | 拒否の回数（安全性の材料） | 未確認（deny ルールでは発火しなかった。auto mode の分類器での発火は未確認） | 再検討の条件に掲載 |
| background_use | 背景実行・定期実行の利用 | `Stop` の `background_tasks`・`session_crons` | 背景タスク・定期実行を使う人の割合 | キーは実在。実測は空リストだけで、中身の形は未確認 | — |
| entrypoint_share | 起動のしかた | hook の環境変数 `CLAUDE_CODE_ENTRYPOINT`（`cli`・`sdk-cli`・`sdk-ts`・`claude-vscode` など）を端末で列にする | 対話・`claude -p`・SDK・IDE の割合 | 実在を確認。未文書化で値は変わりうる | — |
| turn_output_tokens | 1 応答あたりのトークン | `Stop` で既に読む transcript の `message.usage` から `output_tokens`・キャッシュ読み書きを別々に送る | 応答ごとの出力量・キャッシュの効き | キーは実在（20 transcript で常にあった） | トークンの正本は CSV とする判断（二重取得を避ける）に当たる |
| event_plugin_version | 記録ごとのプラグインの版 | `events` に端末側でプラグインの版を付ける（hook の項目ではなく端末の値） | 版ごとの欠け・エラー・挙動の比較 | 端末の値なので上流に依らない | — |
| headcount_adoption_rate | 社員に対する利用率 | 社員名簿（人数・部署）を外部データとして取り込む | 利用率・部署ごとの利用とコスト | hook ではない。データを得られるかは未確認 | — |
