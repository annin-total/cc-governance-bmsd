# 上流に実在する項目と hook

Claude Code が届ける収集項目・hook・環境変数のうち、**実在を確認できたもの**の目録。網羅ではない。
断りのない限り Claude Code 2.1.278 / macOS での実測。公式ドキュメントにだけ拠る行は「公式のみ・実測なし」と書く。

## 1. `SessionStart` の再開（`source` が `resume`・`fork`）でだけ届くキー

公式（hooks、2026-09-28 取得）は、`source` が `resume` か `fork` で、transcript に Claude の応答が 1 回以上あるときに次の 4 つが届くと書く（2.1.251 以降）。実測値は `resume` で得たもの。

| キーパス | 実測値 | 何が分かるか | 付随する事実 |
| --- | --- | --- | --- |
| `context_tokens` | `45689` | 再開時点のコンテキストトークン数（素データ。加工不要） | transcript 末尾から算出した値と同一セッションで誤差 0.8% |
| `prompt_cache_likely_expired` | 真偽 | Claude Code 自身の「キャッシュが切れた可能性が高い」判定 | — |
| `estimated_cache_write_usd` | `0.4569` | その再開が生むキャッシュ書込の USD 見積（上流が算出） | — |
| `seconds_since_last_response` | 秒 | 前回応答からの経過時間 | — |

## 2. hook stdin に届くキー

| キーパス | 届く hook | 実測値 | 何が分かるか | 付随する事実 |
| --- | --- | --- | --- | --- |
| `agent_type` | サブエージェント内のツール呼出 | `"Explore"` | どの種類のサブエージェントが動いたか | 親子の分離だけなら `agent_id` の有無で付く |
| `tool_input.subagent_type` | `PostToolUse`（`tool_name=="Agent"`） | `"Explore"` | どのサブエージェントが何回呼ばれたか | — |
| `model` | `SessionStart` のみ | `claude-opus-5[1m]` | セッション開始時点のモデル＝コンテキストウィンドウのサイズの区別 | `claude -p` では `SessionStart` にも無い。`model` のキーだけでは途中のモデル切替は追えない（切替は `PostModelSwitch` で届く。公式のみ・実測なし） |
| `duration_ms` | `PostToolUse` | `1846` / `387` | ツール 1 回の実行時間 | タスク遂行の速さではない |
| `tool_response.commandName` / `.success` | `PostToolUse`（Skill） | `tool_input.skill` と同じ値 / `true` | スキル呼出の成否 | — |
| `mcp_server`（トップレベル dict） | MCP ツールの `PreToolUse`・`PermissionRequest`・`PermissionDenied`・`PostToolUse`・`PostToolUseFailure`（公式 hooks、2026-09-28 取得。2.1.274 以降）。実測は `PostToolUseFailure` だけ | `{"name":..., "source":"user"}` | MCP サーバ名と**出自**（配布か個人設定か） | サーバ名は `tool_name`（`mcp__<server>__<tool>`）からも分解できる |
| `error` | `StopFailure` | — | ターン失敗の種別 | 値は `rate_limit`・`overloaded`・`authentication_failed`・`oauth_org_not_allowed`・`account_on_hold`・`billing_error`・`invalid_request`・`model_not_found`・`server_error`・`max_output_tokens`・`cloud_credential_error`・`unknown` の列挙。公式のみ・実測なし（hooks、2026-09-28 取得） |
| `reason` | `SessionEnd` | `"prompt_input_exit"` / `"other"` | セッションの閉じ方 | 公式（hooks、2026-09-28 取得）の値は `clear`・`resume`・`logout`・`prompt_input_exit`・`other`。実測したのは 2 値だけ |
| `tool_use_id` | ツール系 hook | `toolu_01…` | 呼出の一意識別 | — |
| `expansion_type` | `UserPromptExpansion` | `"slash_command"` / `"mcp_prompt"` | コマンド以外の展開との区別 | MCP の prompt だけ `mcp_prompt`（2.1.289） |
| `command_source` | `UserPromptExpansion` | `"userSettings"` / `"plugin"` / `"projectSettings"` / `"mcp"` | コマンドの出どころ | 利用者のコマンド・skill が `userSettings`、プラグイン同梱が `plugin`（2.1.283）、プロジェクトの `.claude/commands/` が `projectSettings`、MCP の prompt が `mcp`（2.1.289）。組み込みのコマンド（`/context`）では `UserPromptExpansion` も `UserPromptSubmit` も発火しない（2.1.289）。managed・local の値は未確認 |
| `command_name` / `tool_input.skill` | `UserPromptExpansion` / `PostToolUse`（Skill） | `"<プラグイン名>:foo"` / `"foo"` | 呼ばれたコマンド・スキルの名前 | 2.1.283。プラグイン同梱のものは `<プラグイン名>:<名前>`、利用者のものは名前だけ |
| `background_tasks` / `session_crons` | `Stop` | ともに空リスト | 背景実行・定期実行の利用有無 | — |
| `scratchpad_dir` | 一部 hook（`claude -p` には無い） | — | — | — |
| `stop_hook_active` | `Stop` | — | hook 再入防止フラグ | Claude Code 内部の状態 |

**自由文・本文を含むキー**: `prompt` / `tool_response.stdout` / `tool_response.stderr` /
`last_assistant_message` / `error`（`PostToolUseFailure`）/ `custom_instructions`（`PreCompact`）/ `command_args` / `cwd`（絶対パス）。

## 3. transcript の `message.usage` にあるキー

実データ（20 transcript）で常に付いていたキー。

```
input_tokens  cache_creation_input_tokens  cache_read_input_tokens
output_tokens  output_tokens_details  server_tool_use  service_tier
cache_creation  inference_geo  iterations  speed
```

前の 3 つがコンテキストトークン数を表す値である。`output_tokens` は応答側のトークン数であり、コンテキストトークン数ではない。
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

公式の hook のうち、次のものの性質。

| hook | いつ発火するか | そこでしか取れないもの | 付随する事実 |
| --- | --- | --- | --- |
| `PreToolUse` | ツール呼出の**前**（最高頻度帯） | `tool_name` / `tool_input` / `permission_mode` / `effort` はすべて `PostToolUse` にも届く。権限で拒否された呼出が `PreToolUse` にだけ現れるかは**未検証** | `PostToolUse` は加えて成否と `duration_ms` を持つ |
| `SessionEnd` | セッション終了時（低頻度） | `reason`（値は上表） | 異常終了でも発火するかは**未検証**（発火しないと見られるが**推測**） |
| `StopFailure` | ターンが失敗で終わったとき（中頻度） | `error`（値は上表） | 公式のみ・実測なし |
| `SubagentStart` / `SubagentStop` | サブエージェントの開始・終了 | サブエージェントの区切り | `agent_id` / `agent_type` は `PostToolUse` にも付く |
| `PostCompact` | 圧縮の**後**（低頻度） | 圧縮の契機（`trigger`: `manual`/`auto`）と要約（`compact_summary`） | 入力は共通入力に加えてこの 2 つ。公式のみ・実測なし（hooks、2026-09-28 取得）。圧縮後のコンテキストトークン数は入力に無く、transcript から読めるかは**未検証** |
| `PreModelSwitch` / `PostModelSwitch` | モデル切替時 | `from_model` / `to_model` | 公式のみ・実測なし（hooks、2026-09-28 取得） |

`SessionEnd` のコンテキストトークン数は `Stop` の最終値と同じで、`UserPromptSubmit` のコンテキストトークン数は
前ターンの `Stop` の値と同じである。

組み込みのスラッシュコマンド `/compact` は `UserPromptExpansion` を経ず、直接 `PreCompact` に入る（2.1.283、`claude -p`）。

Agent ツールを使ったターンの hook の順序（2.1.283、`claude -p --continue`・haiku、2 回。解釈は推定）:
Agent の `PostToolUse` が先に戻る → 親の `Stop` → サブエージェントのツール呼出（`agent_id` 付き。`prompt_id` は Agent を呼んだターンのもの）
→ 親の新しいターン（`UserPromptSubmit` と `Stop`）。利用者の入力 1 回で `UserPromptSubmit` と `Stop` が 2 組出る。
Agent 自体の `PostToolUse` には `agent_id` が無く、`Stop` にも無い。`agent_id` の値はサブエージェントの呼出ごとに異なる。

## 6. hook の頻度帯

hook は 1 発火につき Python プロセスを 1 つ起動する。

| 頻度帯 | hook | 目安 |
| --- | --- | --- |
| 最高 | `PreToolUse` / `PostToolUse` / `PostToolUseFailure` | ツール呼出ごと（1 ターンに数回〜数十回） |
| 中 | `UserPromptSubmit` / `UserPromptExpansion` / `Stop` / `StopFailure` / `SubagentStart` / `SubagentStop` | ターン・サブエージェントごと |
| 低 | `SessionStart` / `SessionEnd` / `PreCompact` | セッション・事象ごと（1 日に数回） |

`PermissionDenied` と `PermissionRequest` も存在する（2.1.283、`claude -p` で各 1〜2 回の観測）。

- `PermissionRequest` は、`-p` の既定モードで許可リスト外のツールを呼ぶと発火する。
  届くキーは `session_id`・`transcript_path`・`cwd`・`prompt_id`・`permission_mode`・`hook_event_name`・`tool_name`・`tool_input`・`permission_suggestions`
- `PermissionDenied` は、`-p` の既定モードの拒否でも、`--permission-mode auto` での deny ルールの拒否でも発火しなかった。
  公式ドキュメント（hooks、2026-09）は、auto mode の拒否で発火し、分類器の判定が無い拒否も含むと書くが、
  deny ルールの拒否では発火しなかった。分類器による拒否での発火は未確認
