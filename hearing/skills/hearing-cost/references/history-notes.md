# 履歴の読み方の覚え書き

確認日: 2026-10-01。形を確かめたのは Claude Code 2.1.286 の実機 1 台だけ。ほかの版・OS は未確認。
読むのは `scripts/collect.py` だけ（`scan` は `scan.py`、共通の小物は `_common.py` に分かれている）。LLM は履歴を直接開かず、`collect` が出す集計 JSON だけを読む。

## 保存先

- 設定ディレクトリは `CLAUDE_CONFIG_DIR`、なければホームの `.claude`（Windows は `%USERPROFILE%\.claude`）。
- transcript は `<設定ディレクトリ>/projects/<作業ディレクトリをエンコードした名前>/<sessionId>.jsonl`。
  フォルダ名は cwd の区切り文字を `-` に置き換えた形で、パスそのものなので出力に出さない。
- サブエージェントは `<sessionId>/subagents/agent-<agentId>.jsonl`（隣に `.meta.json`。読まない）。行の `sessionId` は親と同じで、`agentId` と `isSidechain: true` が付く。
- workflows は `<sessionId>/workflows/` 以下にあるとされる（実機では未観測）。`collect` は `projects/` 以下を再帰で読むので、置き場所が変わっても拾える。
- 大きな tool 結果は `tool-results/` に退避されることがある（実機では未観測）。`collect` はファイル数と合計バイトだけ数える。
- `.orphaned*`・`*.superseded*` を名前に含むファイルは集計に入れず、件数だけ数える。

## 行の種類（トップレベルの `type`）

実機で見えたもの: `assistant`・`user`・`attachment`・`system`・`cost-state`・`queue-operation`・`last-prompt`・`ai-title`・`atis-latch`・`mode`。
ほかに `summary`・`file-history-snapshot` などがあるとされる。未知の型は `_other` として件数だけ数える。

- `assistant` 行だけ全体を JSON として読む。1 回の API 応答が content ブロックごとに複数行に分かれて書かれ、各行に同じ `message.id`・`requestId` と（途中値を含む）`usage` が付く。
- `assistant` 以外の行は全体を読まず、深さ 1 のキー（`type`・`timestamp`・`sessionId`・`agentId`・`uuid`・`isSidechain`・`isMeta` 等）だけを抜く。`attachment` の中身にも `type` キーがあるので、深さを見て取り違えないようにしている。
- `user` 行のうち tool 結果を含むものは `message` だけ読んで文字数を数える。スラッシュ起動は `<command-name>` の名前だけを正規表現で抜く。
- `timestamp` は UTC の ISO8601（例 `2026-09-10T10:00:00.000Z`）。`cost-state`・`ai-title` 等には無い。

## usage の項目（`message.usage`）

| 項目 | 意味 |
|---|---|
| `input_tokens` | 新規入力（キャッシュ外） |
| `output_tokens` | 出力（thinking を含む） |
| `cache_creation_input_tokens` | キャッシュ書き込み |
| `cache_read_input_tokens` | キャッシュ読み込み |
| `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` | 書き込みの TTL 別内訳 |
| `iterations` | 読まない（二重計上になる） |

ほかに `service_tier`・`server_tool_use`・`output_tokens_details` などがあるが読まない。`model` が `<synthetic>` の行は API 呼び出しではないので除く。

## 重複排除

- キーは `message.id` と `requestId` の組。どちらも無ければ `uuid`（フォールバックとして件数を数える）。
- 同じキーの行は、トークン項目ごとに最大値を取ってまとめる（途中値の行が先に来ても、順序に関係なく同じ結果になる）。
- ファイル・サブエージェント・sidechain をまたいで 1 回だけ数える。実機では assistant 行のおよそ 3 分の 2 が重複だった。
- 既知の限界: ストリーミング途中の行で `requestId` が片方にしか無いと別キー扱いになり、二重に数えうる。`coverage.dedup_*` で件数だけ見える。

## 巨大行

- 1 行が既定 50,000,000 バイト（`--max-line-bytes`）を超えたら読まずに飛ばし、件数だけ数える。
- 壊れた行（JSON として読めない・オブジェクトでない・途中で切れている・`type` が無い）は種類別に件数だけ数える。例外メッセージは出さない。

## cost-state

- `{"type":"cost-state","sessionId":…,"modelUsage":{<モデル ID>:{inputTokens,outputTokens,cacheReadInputTokens,cacheCreationInputTokens,thinkingTokens,webSearchRequests,costUSD}},"totalCostUSD":…,…}`。timestamp は無い。
- セッション内の累積値のスナップショットが何度も書かれる。`collect` は sessionId ごとに合計が最大のもの（＝最後）を採る。
- assistant 行に出ない補助モデル（実機では Haiku）がここにだけ出る。金額フィールド（`costUSD`・`totalCostUSD`）は読んでも出力しない。
- 再開・分岐での累積の振る舞いは未確認。進行中のセッションでは transcript より古いことがあり、差が負になる。

## effort

- `assistant` 行のトップレベルに `effort`（例 `medium`）と `perTurnEffort` がある（2.1.286）。古い版には無い。
- 無い行は「記録なし」であり、0 や低いという意味ではない。`collect` は版ごとに「読めた行数／全行数」を出す。

## スキル・MCP の記録

- Skill ツール: assistant 行の content にある `{"type":"tool_use","name":"Skill","input":{"skill":"<名前>"}}`。
- スラッシュ起動: user 行の本文に `<command-name>/<名前></command-name>` が入る。`/clear` などの組み込みコマンドも同じ形。
- `attributionSkill`: assistant 行のトップレベル。スキルの実行中は行ごとに付くので、行数は呼び出し回数ではない。(sessionId, スキル名) の distinct で数える。
- MCP ツール名は `mcp__<サーバ名>__<ツール名>`。assistant 行には `attributionMcpServer` もある（未使用）。
- 分類は `collect` が付ける: 名前に `:` を含む＝plugin、`<設定ディレクトリ>/skills/` の個人定義と一致＝personal、それ以外＝builtin_or_unknown。

## OS 差

- 文字コードは UTF-8 で読み、BOM・不正バイト・CRLF を許容する。出力も UTF-8 を明示する（日本語 Windows の既定 cp932 を避ける）。標準出力には ASCII だけを出す。
- パスは標準 API で扱い、区切り文字を決め打ちしない。WSL とネイティブの履歴は別の設定ディレクトリになる。
- 日別・時間帯は `--local-tz` のとき端末のローカル時刻で数える（調書には書かない）。

## 集計 JSON のスキーマ（schema_version 1.0）

キーは英小文字のスネークケース。トークンは種別ごとに `input`（新規入力）・`output`（出力）・`cache_creation`（キャッシュ書き込み）・`cache_read`（キャッシュ読み込み）・`cache_creation_5m`／`cache_creation_1h`（書き込みの内訳）で持ち、種別を合算した値は持たない。
「期間内」は assistant 行の timestamp が [start, end) に入ること。ラベル `S-xxxxxxxx` はセッション、`P-xxxxxxxx` は cwd の sha256 先頭 8 桁で、対応表は無い。

| キー | 意味 |
|---|---|
| `schema_version` / `generated_at` | スキーマの版 / 生成時刻（UTC） |
| `params` | `start`・`end`（UTC）、`timezone`（local/utc）、`utc_offset_minutes`、`exclude_session_given`、`max_line_bytes` |
| `coverage.files_total` / `files_processed` / `files_unreadable` | 見つけた jsonl 系ファイル数 / 読んだ数 / 開けなかった数 |
| `coverage.files_orphaned` / `files_superseded` | 集計から外したファイル数 |
| `coverage.lines_total` / `lines_processed` | 全行数 / 処理できた行数 |
| `coverage.lines_unreadable` | 読めなかった行の種類別件数（`json_decode`・`not_object`・`truncated`・`no_type`・`empty`・`error_<例外名>`） |
| `coverage.lines_oversize_skipped` / `lines_invalid_utf8` | 巨大行で飛ばした数 / 不正バイトを含んだ行数（置換して処理） |
| `coverage.assistant_lines` | assistant 行の数（synthetic を含む） |
| `coverage.records_before_dedup` / `records_after_dedup` / `dedup_removed` | 重複排除の前後の件数と差 |
| `coverage.dedup_fallback_uuid` / `dedup_no_key` | uuid で代用した行数 / キーが無く 1 行 1 件とした数 |
| `coverage.synthetic_lines` / `usage_missing_lines` | 除外した `<synthetic>` 行 / usage が無い・壊れた行（0 とみなす） |
| `coverage.records_out_of_period` / `records_timestamp_missing` | 期間外の件数 / timestamp が無い・読めない件数 |
| `coverage.excluded_session_lines` / `excluded_session_records` | `--exclude-session` で外した行数・件数 |
| `coverage.user_lines_duplicate` | 同じ uuid の user 行の重複 |
| `coverage.records_timestamp_out_of_range` | 2020 年より前・現在の翌日より後の timestamp を採らず、不明扱いにした行数 |
| `coverage.projects_dir_found` / `walk_errors` | `projects/` の有無 / 歩けなかったフォルダ数 |
| `coverage.coverage_ratio` | 処理できた行／全行（巨大行・壊れた行を除いた割合）。目安 0.9 未満なら「部分的な集計」 |
| `history_range` | `oldest_ts`・`newest_ts`（期間内外を問わず履歴全体）と `files_with_lines` |
| `retention` | `cleanup_period_days`（設定値、無ければ既定 30 と仮定し `cleanup_period_days_source` に `default_assumed`）、`history_starts_after_period_start`、`oldest_near_cleanup_cutoff`、`suspected_gap`（両方真のとき。断定ではない） |
| `settings` | `settings.json` の `found`・`cleanup_period_days`・`model`（`alias`・`bucket`・`generation` のみ。生の ID は出さない）・`effort_level`・`always_thinking_enabled`・`mcp_servers_count` |
| `line_types` / `versions` | 行の種類別件数 / assistant 行の版別件数 |
| `totals` | 期間内の `api_calls`（重複排除後の件数）、`sidechain_api_calls`、`tokens_by_type`、`active_days` |
| `models.buckets.<名前>` | 名前はファミリー（`opus` 等や新しい語）・`other_claude`・`non_claude`・`unknown`。各々 `api_calls`、`generations`（世代別件数、例 `5-5`）、`tokens` |
| `effort.effort` / `effort.per_turn_effort` | `observed_n`（記録あり）、`absent_n`（記録なし。0 ではない）、`values`（値別件数） |
| `effort.by_version.<版>` | `records`、`effort_observed`、`per_turn_effort_observed` |
| `sessions.count` / `subagents_distinct` | 期間内のセッション数（sessionId）/ サブエージェント数（agentId） |
| `sessions.active_minutes` / `length_buckets` | 稼働分の合計・中央値・p90・最大 / 長さの分布。定義は `length_definition`（間隔 30 分超で分割し稼働時間を足す） |
| `sessions.top_by_output` ほか | `top_by_output`・`top_by_cache_creation`・`top_by_input`・`top_by_cache_read`。各 5 件まで `{session, value, share}`（share は種別の全体に対する寄与率） |
| `sessions.details.<S-ラベル>` | 上位に出たセッションの `project`、`api_calls`、`turns`（人の入力）、`active_minutes`、`segments`、`subagents`、`sidechain_ratio`、`tokens`、`model_buckets`、`effort`、`tools`、`file_extensions` |
| `projects` | `count` と `top_by_output`（`label`・`sessions`・`api_calls`・`tokens`） |
| `tools.calls_by_name` / `file_extensions` | tool 名別の呼び出し数 / ファイル系ツールの拡張子別件数（`(none)`・`(other)` あり） |
| `tools.result_chars` | tool 結果の文字数: `count`・`chars_total`・`chars_max`・`buckets`・`by_tool` |
| `tools.tool_results_dir` | `tool-results/` のファイル数と合計バイト |
| `skills.skill_tool.<名前>` | Skill ツールの呼び出し数と `classification` |
| `skills.slash_commands.<名前>` | `<command-name>` の件数と `classification`（組み込みコマンドを含む） |
| `skills.attribution_skill.<名前>` | `sessions`（distinct 数）、`lines`（行数。呼び出し回数ではない）、`classification` |
| `skills.installed` | `personal`・`plugin` ごとの `count`、SKILL.md のバイト数、description の文字数（合計・最大） |
| `mcp` | `servers_used`、`configured_servers_count`、`servers.<名前>` の `calls`・`distinct_tools` |
| `cost_state` | `confidence`（常に `estimate`）、`sessions_with_snapshot`、`by_family.<名前>` の `cost_state`・`transcript`・`outside_transcript`（差。負もありうる）・`only_in_cost_state` |
| `timeline` | `by_day`・`by_hour`（件数。調書には書かない） |

スキル名・MCP サーバ名・tool 名は名前のまま入っている。調書には名前を出さず分類と件数で書く。

実データと食い違ったら実データを優先し、必要なら Web 検索する。
