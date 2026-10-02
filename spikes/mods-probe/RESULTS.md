# mods-probe 検証結果

Mods（関数フック）で、governance プラグインの用途（通知・コマンド・回数とトークンの収集・送信・状態行）を満たせるかを、
検証用 mod `mods-probe` を非対話（`claude -p`）と対話（tmux 上の `claude`）の両方で動かして確かめた。

- 対象: Claude Code 2.1.287（macOS、Claude.ai 認証、`--model haiku`）
- 実施日: 2026-10-02
- 読み込み: `--plugin-dir`（そのセッション限り）。送信先は localhost の使い捨て受信器

## 結果の一覧

観点の番号は `PROGRESS.md` の「検証する観点」に対応する。「単体」は `claude plugin test` による確認。

| # | 観点 | 判定 | 根拠 |
|---|---|---|---|
| 1 | `session.start` ＋ `$.ui.toast` | OK | 対話: 画面右上に枠付きで約 4 秒表示（既定の `timeoutMs`）。非対話では `no notification bar in a headless session` で何も出ない |
| 2 | `$.command.register` ＋ `command.run` | OK | 非対話・対話とも `/mods-probe` が応答。モデルを呼ばないので非対話では `num_turns=0`・費用 0 |
| 3 | `prompt.submit` / `tool.call` の回数 | OK（エラーの計数は未確認） | 非対話・対話とも `prompts=1 tools=1`。ツールの失敗が起きず `toolErrors` は 0 のまま |
| 4 | `tool.call` の `{ deny }` ＋ `.catch` | OK（`.catch` は単体のみ） | 非対話: `tool_result` が `is_error=true` で拒否文言を返す。`.catch` によるフェイルクローズは単体テストで確認（`.catch` を外すとテストが落ちる） |
| 5 | `turn.complete` の `e.usage` | OK | 非対話: 記録値が stream-json の `result.usage` と一致。対話: バンドの `cacheR=42613` が既存の状態行の `ctx 21% (42k/200k)` と整合 |
| 6 | `classic.Stop` の併走 | OK | 非対話・対話とも 1 ターン 1 回発火。対話の debug で、mod の `classic.Stop` の後に既存プラグインの Stop hook が `success` で動いた |
| 7 | `$.store` ＋ `$.http.fetch` ＋ `$.clock.every` | OK | 非対話: flush と `session.end` で受信器に着弾。対話: `session.start` のちょうど 60 秒後に定期送信。受信器停止中も送信失敗を表示してセッションは継続し、未送信分は残る |
| 8 | `$.ui.status` ＋ `$.session.usage()` | OK | 対話: `⚠ mods-probe: ctx 21% · $0.09` が既存の状態行の上に出る。非対話では `no status row` |
| 9 | `ui.render`（AbovePrompt）＋ `$.state` | OK | 対話: プロンプトの上にバンドが出る。ctrl+x → tab で Hide にフォーカスし Enter で消え、以後のターンも出ない。desktop の surface は単体のみ |
| 10 | `userConfig` | OK | `--settings` の `pluginConfigs` で `endpoint` が渡る（下の「再現手順」） |
| 11 | `-p` での発火 | OK | 全イベントが発火（`ui.render` を除く）。`CLAUDE_CODE_ENTRYPOINT` を外しても本体が `sdk-cli` を設定する。対話では `cli` |

非対話の 1 ターンでの発火順（debug）: `prompt.submit` → `tool.call` → `classic.Stop` → `$.store.set` → `turn.complete` → `session.end`。

## governance プラグインへの示唆

### 事実として得られるもの

- **トークン数を transcript の解析なしで得られる。**`turn.complete` の `e.usage` にモデル名・入出力・キャッシュ読み書きが入る
- **Python の外部プロセスなしで UI を出せる。**トースト・状態行・プロンプト上のバンド（ボタン付き）を mod だけで描ける
- **定期送信を本体の中で回せる。**`$.clock.every` が対話セッション中に予定どおり発火し、`$.http.fetch` で送れる
- **蓄積がプロセスを跨いで残る。**`$.store` は `-p` の実行を跨いで値を保持する（モジュール変数はプロセスごとに 0 に戻る）
- **mod に npm の依存は要らない。**`mods-probe` は `claude-code` モジュールだけを import し、本体がそのまま実行する
- 既存の settings hook（`hooks/hooks.json`）は mod と併走し、mod が `next(e)` を返せば止まらない

### 注意点と罠（事実）

- **`$.http.fetch` は接続失敗で例外を投げる**（`ok:false` を返さない）。捕まえないと hook が skip され、`-p` では標準エラーに
  `mods-probe: session.end hook skipped: threw … ECONNREFUSED` が出る。これは現行の Design 原則「hook は常に exit 0、
  標準エラーにも何も出力しない」に反する。`command.run` では応答が `registered /mods-probe but no command.run hook answered it`
  という原因を取り違えやすい文言になる。このため `_flush` は `$.http.fetch` を try/catch で囲み、失敗を文字列で返す
  （単体テスト「送信が例外で失敗したら…」が落ちることを確かめる対象）。例外の文言には URL が含まれる
- **送信失敗は debug に error 行を残さない。**mod 側で記録しない限り、失敗に気づく手段がない
- **ガードは `.catch` を付けないとフェイルオープンになる。**`.catch` を外しても `claude plugin validate` は通る。テストで固定する必要がある
- **`$.store` は利用者単位の 1 ファイル。**保存先は `~/.claude/plugins/store/<plugin>_<id>-<hash>.json` で、プロジェクト別・
  セッション別ではない。並行セッションが同じファイルを読み書きする。容量の上限は合計 4 MiB の JSON（ガイドの記述・未検証）
- **`$.ui.status` は行頭に `⚠` が付き黄色で描かれる。**mod は装飾を指定していない。理由は不明
- **`e.usage` は 1 ターン内の API 呼び出しの合計。**API 呼び出し単位ではない
- **mod が答えるスラッシュコマンドは `prompt.submit` に数えない。**
- **`-p` では `CLAUDE_CODE_ENTRYPOINT=sdk-cli`**（外から外しても本体が設定する）。対話では `cli`
- **mod の拒否は権限拒否として数えない。**`-p` の結果の `permission_denials` は空のまま
- **フォルダ信頼の承認前は読み込まれない。**debug に `hooks modules not loaded until workspace trust is accepted`
- **`userConfig` は `--plugin-dir` では settings の `pluginConfigs` から読む。project settings は読まない。**値が無いと debug に
  `no pluginConfigs[...] in user, --settings or managed settings (project settings are not read)`
- **`--plugin-dir` で読むと、本体が mod のディレクトリに書き込む。**直下の `tsconfig.json` と `.claude-plugin/types/claude-code-tools/`。
  現行の「配布物を汚さない」との関係は、マーケットプレイス経由の導入で確かめていない
- `--plugin-dir` の mod は `tier user` で読み込まれる。組み込み mod（`cc-plugin-agents-md@builtin`・`cc-plugin-telemetry@builtin`）も同時に読み込まれる
- localhost への `$.http.fetch` は許可確認なしで通る
- 所要時間（`next` 込み、debug の値）: `-p` では `classic.Stop` が約 0.5 秒、対話では約 20ms。差の原因は調べていない

### 推測

- 推測: 現行の Stop hook での transcript 解析と statusline の外部プロセスは、`turn.complete` と `$.ui.status` で置き換えられる
- 推測: 送信の失敗を捕まえる実装を規約にしないと、mod 化で Design 原則（標準エラーに出さない）が崩れやすい。テストで固定するのが前提になる
- 推測: `$.store` が利用者単位の 1 ファイルなので、並行セッションの書き込みが互いの蓄積を上書きしうる（`mods-probe` は読んで足して書くだけで排他していない）

### 組織での運用の論点【ガイドの記述・未検証】

外部ガイドの「組織での運用とガバナンス」「settings hook から mod への移行パターン」による。実機では確かめていない。

- git・URL・npm から入れたプラグインはキャッシュにコピーされ、managed `enabledPlugins` で有効化しても**ユーザー tier** になる。
  組織の mod（prepend tier）にするには、管理者だけが書けるディレクトリ型マーケットプレイスと managed settings が要る
- 組み込みガード `sec-default` は、Bedrock 等の API 経由の利用では **managed settings があるマシンでしか読み込まれない**
- したがって mod は利用者が外せる前提になり、強制が要る制御は deny ルールや settings hook に残す。mod は可視化・案内・利便性に使う
- settings hook は非推奨ではなく mod と併走する。移行は必須ではない
- managed の `disableAllHooks`・`disableSideloadFlags`・`allowManagedModsOnly` で mod が止まる

## 未検証事項

- Bedrock 認証下での動作（会社 PC は Bedrock）と、そのときの `e.usage` の中身
- Windows での動作
- Desktop・VS Code の surface（バンドは単体テストのみ）
- マーケットプレイス経由の導入、キャッシュへのコピー、本体による書き込み（`tsconfig.json` 等）の扱い
- 社内の受信先（localhost 以外）への `$.http.fetch` で許可確認が出るか
- ホットリロード
- サブエージェントのターン（`e.agentId` の有無による区別）
- ツールが失敗したときの `toolErrors` の計数
- `$.clock.every` の長時間運用、並行セッションでの `$.store` の競合
- `.catch` によるフェイルクローズの実機での発生
- 管理設定（`disableAllHooks` 等）による無効化

## 再現手順

本番の受信先には向けない。送信の確認は localhost で受信器を立てて行う。利用者本人の `settings.json` は書き換えない
（`--plugin-dir` と `--settings` はそのセッションだけに効く）。

```bash
# worktree のルートで
claude plugin validate spikes/mods-probe   # マニフェストと hooks の検証
(cd spikes/mods-probe && tsc -p .)        # 型検査（tsconfig.json は本体が生成したもの）
claude plugin test spikes/mods-probe      # tests/*.test.tsx を実行
```

送信先を渡す settings（例 `probe-settings.json`）:

```json
{"pluginConfigs":{"mods-probe":{"options":{"endpoint":"http://127.0.0.1:18765/ingest"}}}}
```

受信器は POST を受けて 200 を返すだけの使い捨てのもの（例: Python の `http.server` を継承した数行のスクリプト）でよい。

```bash
# 非対話。Claude Code の中から起動するときは CLAUDE_CODE_ENTRYPOINT などの継承された変数を env -u で外す
claude -p "/mods-probe" --plugin-dir spikes/mods-probe --settings probe-settings.json --debug-file probe.debug.log
claude -p "/mods-probe flush" --plugin-dir spikes/mods-probe --settings probe-settings.json

# 対話（フォルダ信頼を承認するまで mod は読み込まれない）
claude --plugin-dir spikes/mods-probe --model haiku --settings probe-settings.json --debug-file probe.debug.log
```

確認後の痕跡: `~/.claude/plugins/store/mods-probe_*.json`、検証ディレクトリの transcript（`~/.claude/projects/` 配下）、
`~/.claude.json` の `projects` に追加された検証ディレクトリ。
