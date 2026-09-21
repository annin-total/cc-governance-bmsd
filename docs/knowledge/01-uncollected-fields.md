# 収集できるが今回は集めない項目

実機（Claude Code 2.1.278）で**実在を確認済み**だが、設計書 §3.2 の契約に入れていない項目。
実在が確認できていないものは載せない。

## 1. `SessionStart`（`source="resume"`）でしか届かない 4 キー

セッションを再開したときだけ付く。**関心の対象（長時間継続したセッション）と観測機会が一致している**のが特徴。

| キーパス | 実測値 | 何が分かるか | 今回採らなかった理由 |
| --- | --- | --- | --- |
| `context_tokens` | `45689` | 再開時点の文脈トークン数（素データ。加工不要） | `context_tokens` は transcript 末尾読取に一本化した。resume 限定の経路を足すと同じ列に 2 つの取得元ができる。**ただし末尾読取の検算に使える**（同一セッションで誤差 0.8%） |
| `prompt_cache_likely_expired` | 真偽 | Claude Code 自身の「キャッシュが切れた可能性が高い」判定 | キャッシュ切れを主題にした画面を持たないため。**公式ドキュメント未記載**で、予告なく消えうる |
| `estimated_cache_write_usd` | `0.4569` | 上流が算出した、その再開が生むキャッシュ書込の USD 見積 | コストの正本は AI Gateway CSV（利用者 × 日）。端末側に金額を持つと突合軸が増える |
| `seconds_since_last_response` | 秒 | 前回応答からの経過時間 | 同上。**公式ドキュメント未記載**。「N 分以内に再開せよ」型の施策を立案するときの唯一の材料（→ 05） |

## 2. hook stdin に届くが採らないキー

| キーパス | 届く hook | 実測値 | 何が分かるか | 今回採らなかった理由 |
| --- | --- | --- | --- | --- |
| `agent_type` | サブエージェント内のツール呼出 | `"Explore"` | どの種類のサブエージェントが動いたか | 親子の分離は `agent_id` の有無で足りる |
| `tool_input.subagent_type` | `PostToolUse`（`tool_name=="Agent"`） | `"Explore"` | どのサブエージェントが何回呼ばれたか | `tool_input` から名指しで読むキーを増やしたくない（現在は `skill` の 1 つだけ） |
| `model` | `SessionStart` のみ | `claude-opus-5[1m]` | セッション開始時点のモデル＝窓サイズの区別 | 絶対値で見る方針なので窓サイズが要らない。窓は `PreCompact` 時点の `context_tokens` の分布の方が正確に分かる（実際に限界に達した値のため）。`claude -p` では `SessionStart` にすら無く、途中のモデル切替も追えない |
| `duration_ms` | `PostToolUse` | `1846` / `387` | ツール 1 回の実行時間 | タスク遂行の速さではない。効果測定には `Stop.ts − UserPromptSubmit.ts` を使う |
| `tool_response.commandName` / `.success` | `PostToolUse`（Skill） | `tool_input.skill` と同じ値 / `true` | スキル呼出の成否 | 失敗した invoke では hook 自体が発火しないため、成否の判定が要らない |
| `mcp_server`（トップレベル dict） | `PostToolUseFailure` | `{"name":..., "source":"user"}` | MCP サーバ名と**出自**（配布か個人設定か） | サーバ名は `tool_name`（`mcp__<server>__<tool>`）から集計時に分解できる。**成功時にも付くかは未確認**、かつ 2.1.274 で入ったばかり |
| `error_type` | `StopFailure` | — | ターン失敗の種別 | 失敗の有無は `hook_event` が `…Failure` かで分かる |
| `reason` | `SessionEnd` | `"prompt_input_exit"` / `"other"` | セッションの閉じ方 | 対応する問いが無い（→ 02） |
| `tool_use_id` | ツール系 hook | `toolu_01…` | 呼出の一意識別 | `event_id` で足りる |
| `expansion_type` | `UserPromptExpansion` | `"slash_command"` | コマンド以外の展開との区別 | `command_source` と重複 |
| `background_tasks` / `session_crons` | `Stop` | ともに空リスト | 背景実行・定期実行の利用有無 | 現時点で問いが無い |
| `scratchpad_dir` | 一部 hook（`claude -p` には無い） | — | — | ほぼ何も分からない |
| `stop_hook_active` | `Stop` | — | hook 再入防止フラグ | 実装内部の状態 |

**自由文・本文を含むため原則として触れないもの**: `prompt` / `tool_response.stdout` / `tool_response.stderr` /
`last_assistant_message` / `error` / `custom_instructions`（`PreCompact`）/ `command_args` / `cwd`（絶対パス）。
これらは「採らなかった」ではなく**採ってはいけない**側にある。

## 3. transcript の `message.usage` にある付随キー

設計書 §3.4 が足す 3 値のほかに、実データ（20 transcript）で常に付いていたキー。

```
output_tokens  output_tokens_details  server_tool_use  service_tier
cache_creation  inference_geo  iterations  speed
```

`output_tokens` は応答側のトークン数で、文脈量には加えない。
`cache_creation`（dict）と `cache_creation_input_tokens` の関係は**未確認**。
付随キーが 7 つあること自体が、上流がこの構造を拡張し続けている証拠である。

## 4. hook プロセスに渡る環境変数（収集項目ではない）

`CLAUDE_PLUGIN_DATA` / `CLAUDE_PLUGIN_ROOT` のほかに、実機で存在を確認したもの。

```
CLAUDE_PROJECT_DIR  CLAUDE_ENV_FILE  CLAUDE_CODE_SESSION_ID  CLAUDE_CODE_ENTRYPOINT  CLAUDE_PID
```

`CLAUDE_ENV_FILE` は `~/.claude/session-env/<session_id>/<hook>.sh` を指す。
hook から環境変数をセッションへ戻す経路だが、この設計では使わない。
