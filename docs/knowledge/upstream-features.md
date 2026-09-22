# 上流に実在する項目と hook

Claude Code が届ける収集項目・hook・環境変数のうち、**実在を確認できたもの**の目録。
実在が確認できていないものは載せない。網羅ではない。
断りのない限り Claude Code 2.1.278 / macOS での実測。

## 1. `SessionStart`（`source="resume"`）でしか届かないキー

セッションを再開したときだけ付く。

| キーパス | 実測値 | 何が分かるか | 付随する事実 |
| --- | --- | --- | --- |
| `context_tokens` | `45689` | 再開時点の文脈トークン数（素データ。加工不要） | transcript 末尾から算出した値と同一セッションで誤差 0.8% |
| `prompt_cache_likely_expired` | 真偽 | Claude Code 自身の「キャッシュが切れた可能性が高い」判定 | **公式ドキュメント未記載** |
| `estimated_cache_write_usd` | `0.4569` | その再開が生むキャッシュ書込の USD 見積（上流が算出） | — |
| `seconds_since_last_response` | 秒 | 前回応答からの経過時間 | **公式ドキュメント未記載** |

## 2. hook stdin に届くキー

| キーパス | 届く hook | 実測値 | 何が分かるか | 付随する事実 |
| --- | --- | --- | --- | --- |
| `agent_type` | サブエージェント内のツール呼出 | `"Explore"` | どの種類のサブエージェントが動いたか | 親子の分離だけなら `agent_id` の有無で付く |
| `tool_input.subagent_type` | `PostToolUse`（`tool_name=="Agent"`） | `"Explore"` | どのサブエージェントが何回呼ばれたか | — |
| `model` | `SessionStart` のみ | `claude-opus-5[1m]` | セッション開始時点のモデル＝窓サイズの区別 | `claude -p` では `SessionStart` にも無い。途中のモデル切替は追えない |
| `duration_ms` | `PostToolUse` | `1846` / `387` | ツール 1 回の実行時間 | タスク遂行の速さではない |
| `tool_response.commandName` / `.success` | `PostToolUse`（Skill） | `tool_input.skill` と同じ値 / `true` | スキル呼出の成否 | — |
| `mcp_server`（トップレベル dict） | `PostToolUseFailure` | `{"name":..., "source":"user"}` | MCP サーバ名と**出自**（配布か個人設定か） | 2.1.274 で入った。**成功時にも付くかは未確認**。サーバ名は `tool_name`（`mcp__<server>__<tool>`）からも分解できる |
| `error_type` | `StopFailure` | — | ターン失敗の種別 | 値は自由文に近い |
| `reason` | `SessionEnd` | `"prompt_input_exit"` / `"other"` | セッションの閉じ方 | — |
| `tool_use_id` | ツール系 hook | `toolu_01…` | 呼出の一意識別 | — |
| `expansion_type` | `UserPromptExpansion` | `"slash_command"` | コマンド以外の展開との区別 | `command_source` と同じことが分かる |
| `background_tasks` / `session_crons` | `Stop` | ともに空リスト | 背景実行・定期実行の利用有無 | — |
| `scratchpad_dir` | 一部 hook（`claude -p` には無い） | — | — | — |
| `stop_hook_active` | `Stop` | — | hook 再入防止フラグ | Claude Code 内部の状態 |

**自由文・本文を含むキー**: `prompt` / `tool_response.stdout` / `tool_response.stderr` /
`last_assistant_message` / `error` / `custom_instructions`（`PreCompact`）/ `command_args` / `cwd`（絶対パス）。

## 3. transcript の `message.usage` にあるキー

実データ（20 transcript）で常に付いていたキー。

```
input_tokens  cache_creation_input_tokens  cache_read_input_tokens
output_tokens  output_tokens_details  server_tool_use  service_tier
cache_creation  inference_geo  iterations  speed
```

前の 3 つが文脈量を表す値である。`output_tokens` は応答側のトークン数であり、文脈量ではない。
`cache_creation`（dict）と `cache_creation_input_tokens` の関係は**未確認**。

## 4. hook プロセスに渡る環境変数

実機で存在を確認したもの。

```
CLAUDE_PLUGIN_DATA  CLAUDE_PLUGIN_ROOT  CLAUDE_PROJECT_DIR  CLAUDE_ENV_FILE
CLAUDE_CODE_SESSION_ID  CLAUDE_CODE_ENTRYPOINT  CLAUDE_PID
```

`CLAUDE_ENV_FILE` は `~/.claude/session-env/<session_id>/<hook>.sh` を指す。
hook から環境変数をセッションへ戻す経路である。

## 5. hook が届けるもの

公式の hook は全 31 種ある。このうち実在が確認できているものの性質。

| hook | いつ発火するか | そこでしか取れないもの | 付随する事実 |
| --- | --- | --- | --- |
| `PreToolUse` | ツール呼出の**前**（最高頻度帯） | 無い。`tool_name` / `tool_input` / `permission_mode` / `effort` はすべて `PostToolUse` にも届く | `PostToolUse` は加えて成否と `duration_ms` を持つ |
| `SessionEnd` | セッション終了時（低頻度） | `reason`（`"prompt_input_exit"` / `"other"`） | 異常終了でも発火するかは**未検証**（発火しないと見られるが**推測**） |
| `StopFailure` | ターンが失敗で終わったとき（中頻度） | `error_type` | `error_type` の値は自由文に近い |
| `SubagentStart` / `SubagentStop` | サブエージェントの開始・終了 | サブエージェントの区切り | `agent_id` / `agent_type` は `PostToolUse` にも付く |
| `PostCompact` | 自動圧縮の**後**（低頻度） | 圧縮**後**のコンテキスト量＝「圧縮の効き目」 | **キー構成が未確認**（`transcript_path` が届くかも未確認） |
| `PreModelSwitch` / `PostModelSwitch` | モデル切替時 | 切替の発生と前後のモデル | — |

`SessionEnd` の文脈量は `Stop` の最終値と同じで、`UserPromptSubmit` の文脈量は
前ターンの `Stop` の値と同じである。

## 6. hook の頻度帯

hook は 1 発火につき Python プロセスを 1 つ起動する。

| 頻度帯 | hook | 目安 |
| --- | --- | --- |
| 最高 | `PreToolUse` / `PostToolUse` / `PostToolUseFailure` | ツール呼出ごと（1 ターンに数回〜数十回） |
| 中 | `UserPromptSubmit` / `UserPromptExpansion` / `Stop` / `StopFailure` / `SubagentStart` / `SubagentStop` | ターン・サブエージェントごと |
| 低 | `SessionStart` / `SessionEnd` / `PreCompact` | セッション・事象ごと（1 日に数回） |
