# 登録していない hook

設計書 §3.3 が登録する 7 種以外で、実在が確認されているもの。
公式の hook は全 31 種あり、ここに挙げるのはそのうち検討の俎上に載ったものだけである。

| hook | いつ発火するか | そこでしか取れないもの | 登録しない理由 |
| --- | --- | --- | --- |
| `PreToolUse` | ツール呼出の**前**（最高頻度帯） | 無い。`tool_name` / `tool_input` / `permission_mode` / `effort` はすべて `PostToolUse` にも届く | 最高頻度帯のプロセス起動が倍になる代償に対し、増分がほぼゼロ。`PostToolUse` は加えて成否と `duration_ms` を持つ |
| `SessionEnd` | セッション終了時（低頻度） | `reason`（`"prompt_input_exit"` / `"other"`） | セッション終端は最終イベントの時刻で代替できる。**異常終了では発火しない前提**であり、終端の指標としても信頼できない |
| `StopFailure` | ターンが失敗で終わったとき（中頻度） | `error_type` | 失敗で終わったターンの終点は、`Stop` の欠落として間接的に見える。`error_type` は自由文に近く、分類を持ち込むことになる |
| `SubagentStart` / `SubagentStop` | サブエージェントの開始・終了 | サブエージェントの区切り | `agent_id` / `agent_type` が `PostToolUse` に付くため、識別も作業量の測定も既存の hook で成立する |
| `PostCompact` | 自動圧縮の**後**（低頻度） | 圧縮**後**のコンテキスト量＝「圧縮の効き目」 | **キー構成が未確認**（`transcript_path` が届くかも未確認）。調査価値は高いが、`PreCompact` 時点の値だけで閾値の策定はできる（→ 05） |
| `PreModelSwitch` / `PostModelSwitch` | モデル切替時 | 切替の発生と前後のモデル | `model` を採らない方針（→ 01）と整合。モデル別の層別をしないので、切替を追う意味が無い |

## 頻度帯の目安

hook は 1 発火につき Python プロセスを 1 つ起動する。**最高頻度帯への追加は、
得られる情報が他で代替できないときだけ正当化される。**

| 頻度帯 | hook | 目安 |
| --- | --- | --- |
| 最高 | `PreToolUse` / `PostToolUse` / `PostToolUseFailure` | ツール呼出ごと（1 ターンに数回〜数十回） |
| 中 | `UserPromptSubmit` / `UserPromptExpansion` / `Stop` / `StopFailure` / `SubagentStart` / `SubagentStop` | ターン・サブエージェントごと |
| 低 | `SessionStart` / `SessionEnd` / `PreCompact` | セッション・事象ごと（1 日に数回） |

## コンテキスト量を取る hook を増やすとどうなるか

`context_tokens` の取得は **既に登録済みの hook の中で行うため、プロセス起動回数は増えない**。
増えるのは末尾 256KB の読取 1 回分だけである。それでも次の 2 つは採らない。

- `SessionEnd` から取る — `Stop` で毎ターン取るなら最終値も含まれる。重複
- `UserPromptSubmit` から取る — 前ターンの `Stop` の値と同じ。重複
