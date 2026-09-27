# UC36: サブエージェントと context_tokens

対応するユースケース: `.local/e2e-load-testing/e2e-usecases.md` の No.36（サブエージェントのイベント）・
No.37（context_tokens の取得）。

## 目的

- 親（メインの会話）とサブエージェント（Agent ツール）のイベントが `agent_id` で区別でき、二重に数えられていないかを見る
- `context_tokens` がどの hook で入り、どれで入らないかを実物で確かめる（`-k collect` は `HOOK_FIELDS` だけを
  見て `EXTRA_COLUMNS`＝`context_tokens` を判定しない）
- Stop 時点の transcript は遅れうると公式にあるため、1 回の観測で結論せず、複数回繰り返す

## 確かめる仮説（どう壊れうるか）

- `agent_id` はサブエージェント内のツール呼出にしか付かないと `docs/decisions/plugin.md` にある。実際にそうか、
  複数回サブエージェントを使ったときに値が使い回されない（別の呼出と混同されない）かを見る
- `context_tokens` は `collect.py` の実装上 `PreCompact`・`Stop` でしか解決しない（`_CONTEXT_TOKEN_HOOK_EVENTS`）。
  実物でもそのとおりで、ほかの hook では常に `None` かを確かめる
- **Stop 行には `agent_id` が無い。** サブエージェントを使うと、その内部の会話ループ自身が `UserPromptSubmit`/`Stop`
  を発火させる可能性があり、その場合サーバ側の「Stop の件数＝ターン数」という素朴な数え方が二重に数えてしまう
  おそれがある

## 手順

`pytest e2e` は使わず、UC35 と共通の `probe.py`（`tmp/e2e-load-testing/uc-35-skill-and-command-names/probe.py`）で
1 回の隔離ルート・1 セッション（`--continue` で継続）を使い回した。UC35 とは別のことを見るため、このフォルダの
`analyze.py` は同じ生データ（`.local/e2e-load-testing/uc-36-subagent-and-context-tokens/queue-raw.jsonl` に複製）を
別の観点で集計する。

セッションのうち、この UC に関わる部分:

1. `/compact` を実行（1 回目の `PreCompact` の観測）
2. Agent ツール（`subagent_type general-purpose`）でサブエージェントに `echo e2e-sub-1` を実行させ、その後
   親自身が `echo e2e-parent` を実行 → 応答
3. 再度 `/compact`（2 回目の `PreCompact` の観測）
4. Agent ツールで 2 回目のサブエージェント呼出（`echo e2e-sub-2`。親は Bash を持たない）→ 応答
5. 最後に "ok" とだけ応答させる（複数回の `Stop` の観測）

モデルは全セッション haiku。

## 結果（Claude Code 2.1.283 / macOS、2026-09-27 実測）

### context_tokens

| hook_event | context_tokens が入った回数 | 入らなかった回数 |
| --- | --- | --- |
| PreCompact | 2 / 2 | 0 |
| Stop | 7 / 7 | 0 |
| それ以外（SessionStart・UserPromptSubmit・UserPromptExpansion・PostToolUse・PostToolUseFailure） | 0 | 全件 |

3 回以上（`PreCompact` 2 回・`Stop` 7 回、計 9 回）観測し、すべて `PreCompact`・`Stop` の 2 hook にしか
入らないという実装どおりの結果になった。値は毎回異なり（21331 → 21827 → 21827 → 22404 → 23437 → 23437 →
22722 → 23411 → 23525 と単調に近い増加）、遅延で古い値が返る事例は今回は観測しなかった
（未検証: 長時間・大量の応答があるセッションでの遅延）。

### agent_id・二重計上

- サブエージェントの Bash 呼出（`PostToolUse`、`tool_name=Bash`）にだけ `agent_id` が入り、2 回のサブエージェント
  呼出で異なる値（例: `aa9de72f40ebdf5dd` / `adfdb7b1fff02fa11`）になった。親自身のツール呼出（`echo e2e-parent`）は
  `agent_id=None`。**呼出ごとに別の値になり、親子は `agent_id` の有無で正しく区別できる**
- **ただし `Stop` 行には `agent_id` が無い。** 実際に、Agent ツールを使った 2 回のターンでは、`Stop` が
  それぞれ 2 回ずつ（計 4 回）記録された。内訳は「サブエージェント自身の会話ループが終わったときの `Stop`」
  （直後にそのサブエージェントの `PostToolUse`（`agent_id` 付き）が記録される）と、「親の応答が終わったときの
  本来の `Stop`」の 2 つで、**どちらも `hook_event=Stop`・`agent_id=None` の同じ形の行になり、queue の行だけでは
  区別できない**。`prompt_id` は呼出ごとに変わるため、`session_id + prompt_id` の組でなら区別できるが、
  `agent_id` 単体では区別できない
- 全 7 回の `Stop` のうち 2 回が、この「サブエージェント境界の Stop」に当たる（本来のターン数は 5：
  `/e2e-probe` 1・プラグインコマンド 1・サブエージェント呼出 2 ターン・最後の応答 1 に対し、実際の `Stop` は 7）

### hook の登録

`SubagentStart`・`SubagentStop` は `installPath/hooks/hooks.json` に**登録されていない**
（登録済みは `PostToolUse` / `PostToolUseFailure` / `PreCompact` / `SessionStart` / `Stop` /
`UserPromptExpansion` / `UserPromptSubmit` のみ）。`agent_type` は契約（`contract.py`）に無く、収集していない
（`docs/decisions/plugin.md` の「サブエージェントの種別で層別しない」という既存の判断どおり）。

## 想定外だったこと

サブエージェントの呼出自体（`agent_id`）は親子で正しく区別できるが、**その呼出に付随する `Stop` 行が
親の `Stop` と見分けが付かない形で二重に記録される**点は、事前の想定（`agent_id` さえあれば二重計上を防げる）
より踏みやすい罠だった。`Stop` の件数を「セッションのターン数」や「利用回数」の代理指標として集計に使うと、
サブエージェントを多用する利用者ほど水増しされる。

## 課題と改善案

- **`docs/knowledge/upstream-features.md`**: 「サブエージェントの呼出は `Stop` を追加で 1 回発火させ、その
  `Stop` 行は `agent_id` を持たないため親の `Stop` と区別できない」という事実を追記する価値が高い
  （外界の事実で、我々の設計に依らず今後も効く）
- **`docs/decisions/plugin.md`**: 「サブエージェントの種別で層別しない」の隣に、「`Stop` の件数をターン数の
  代理指標に使わない」という採らない判断を足す根拠になる（`server/tests` 側で `Stop` を集計に使っている箇所が
  あれば、影響を確認する価値がある。未確認）
- **e2e スキルの拡張**: `-k collect` に、`context_tokens` が `PreCompact`・`Stop` 以外で `None` であることの
  assert を足せる。ただし `-k collect` の見本プロンプトは Agent ツールを呼ばないため、二重 `Stop` の再現には
  見本プロンプトの変更（plan-implement の作業）が要る
- **サーバ側の調査**: `server/tests` で `Stop` 由来の集計（ターン数・利用頻度）があるかは未確認。あるなら
  この二重計上の影響範囲を洗う価値がある

## コードの変更

なし（UC35 と共通。`probe.py` は開発ツリーの `plugin/` を変えていない）。

## 判定がゲートしているかの確認

`analyze.py` は、実採取データでは「Agent 呼出と同じ `prompt_id` を持つ `Stop`」が 2 件（観測した二重計上の件数）
であることを期待値として要求する。`--break` を付けると、そのうち 1 件を人工的に消してから判定し、
`NG: サブエージェント境界の Stop 重複という既知の挙動が再現しない（1 件、期待 2 件）` で確かに落ちることを
確認した（`.venv/bin/python analyze.py --break`）。

## 片付けたもの・残したもの

- UC35 と同じ隔離ルートを使い、`probe.py` の `finally` で片付け済み（UC35 の notes.md を参照）
- `queue-raw.jsonl`・`registered-hooks.json` は UC35 のものを複製して `.local/e2e-load-testing/
  uc-36-subagent-and-context-tokens/` に置いた（実データの識別子を含みうるため git 管理外）
- `analyze.py` は本 UC フォルダに残す
