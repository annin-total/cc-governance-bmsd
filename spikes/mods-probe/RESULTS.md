# mods-probe 検証結果

Mods（関数フック）で、governance プラグインの用途（通知・コマンド・回数とトークンの収集・送信・状態行）を満たせるかを、
検証用 mod `mods-probe` を非対話（`claude -p`）と対話（tmux 上の `claude`）の両方で動かして確かめた。

- 対象: Claude Code 2.1.287（macOS、Claude.ai 認証、`--model haiku`）
- 実施日: 2026-10-02
- 読み込み: 第 1 段は `--plugin-dir`（そのセッション限り）。第 2 段は加えて、隔離 `CLAUDE_CONFIG_DIR`（未ログイン）にローカルのディレクトリ型マーケットプレイスから導入した。送信先は localhost の使い捨て受信器

## 結果の一覧

第 1 段の結果。観点の番号は `PROGRESS.md` の「検証する観点」に対応する。「単体」は `claude plugin test` による確認。

| # | 観点 | 判定 | 根拠 |
|---|---|---|---|
| 1 | `session.start` ＋ `$.ui.toast` | OK | 対話: 画面右上に枠付きで約 4 秒表示（既定の `timeoutMs`）。非対話では `no notification bar in a headless session` で何も出ない |
| 2 | `$.command.register` ＋ `command.run` | OK | 非対話・対話とも `/mods-probe` が応答。モデルを呼ばないので非対話では `num_turns=0`・費用 0 |
| 3 | `prompt.submit` / `tool.call` の回数 | OK | 非対話・対話とも `prompts=1 tools=1`。ツールの失敗の計数は第 2 段で確認 |
| 4 | `tool.call` の `{ deny }` ＋ `.catch` | OK（`.catch` は単体のみ） | 非対話: `tool_result` が `is_error=true` で拒否文言を返す。`.catch` によるフェイルクローズは単体テストで確認（`.catch` を外すとテストが落ちる） |
| 5 | `turn.complete` の `e.usage` | OK | 非対話: 記録値が stream-json の `result.usage` と一致。対話: バンドの `cacheR=42613` が既存の状態行の `ctx 21% (42k/200k)` と整合 |
| 6 | `classic.Stop` の併走 | OK | 非対話・対話とも 1 ターン 1 回発火。対話の debug で、mod の `classic.Stop` の後に既存プラグインの Stop hook が `success` で動いた |
| 7 | `$.store` ＋ `$.http.fetch` ＋ `$.clock.every` | OK | 非対話: flush と `session.end` で受信器に着弾。対話: `session.start` のちょうど 60 秒後に定期送信。受信器停止中も送信失敗を表示してセッションは継続し、未送信分は残る |
| 8 | `$.ui.status` ＋ `$.session.usage()` | OK | 対話: `⚠ mods-probe: ctx 21% · $0.09` が既存の状態行の上に出る。非対話では `no status row` |
| 9 | `ui.render`（AbovePrompt）＋ `$.state` | OK | 対話: プロンプトの上にバンドが出る。ctrl+x → tab で Hide にフォーカスし Enter で消え、以後のターンも出ない。desktop の surface は単体のみ |
| 10 | `userConfig` | OK | `--settings` の `pluginConfigs` で `endpoint` が渡る（下の「再現手順」） |
| 11 | `-p` での発火 | OK | 全イベントが発火（`ui.render` を除く）。`CLAUDE_CODE_ENTRYPOINT` を外しても本体が `sdk-cli` を設定する。対話では `cli` |

非対話の 1 ターンでの発火順（debug）: `prompt.submit` → `tool.call` → `classic.Stop` → `$.store.set` → `turn.complete` → `session.end`。

## 第 2 段の結果

第 1 段の未検証事項のうち、この Mac で確かめられるものを扱った。利用者の mod が既存の hook を妨げうるかを確かめるため、
敵対的 mod `spikes/mods-adversary/` と守りの mod `spikes/mods-guard/` を使った。「隔離」は隔離 `CLAUDE_CONFIG_DIR`・未ログインでの実行。

| 観点 | 判定 | 根拠 |
|---|---|---|
| ツール失敗の計数 | OK | `false` を Bash で実行させると `tool_result` が `is_error=true`、`/mods-probe` が `toolErrors=1`。`next(e)` の戻り値の `isError` で数える |
| サブエージェントと usage | 区別できる。メインの `e.usage` に含まれない | `turn.complete` がサブエージェントのターンにも発火し `e.agentId` が付く。メインの記録と `result.usage` はサブエージェント分を含まず、`modelUsage` だけが合算。全 `turn.complete` の合計が `modelUsage` と一致 |
| usage と transcript の一致 | 一致 | transcript を message.id ごとに 1 件として合計すると一致。サブエージェントは `<session>/subagents/agent-*.jsonl` に別記録で、それとも一致 |
| localhost 以外への fetch | `-p` では確認なしで届く | `$.http.fetch('https://example.com/')` が 200、`permission_denials: []` |
| `disableAllHooks` | 利用者 tier の mod は止まる | `--settings` で `true` にすると `not loaded: only managed plugins and built-in plugins run`。組み込み mod は動く。mod のコマンドは消え、入力がモデルに渡る |
| classic hook の握り潰し・改変 | **利用者の mod 1 つで止められ、本文も偽れる** | 下の箇条 |
| `$.store` の並行書き込み | **同じキーでは更新が消える** | 2 プロセスが同時に同じキーへ「読んで 1 件足して書く」を 100 回ずつ: 期待 200 件 → 3 回とも 100〜102 件。キーを分けると 100＋100 件が残った（1 回のみ） |
| マーケットプレイス経由の導入 | 導入でき、`-p`・対話とも動く | 下の箇条（ディレクトリ型のみ） |
| `prependPlugins` | **managed settings 無しでも効く** | 利用者 settings の `prependPlugins` に書いた mod が `tier prepend` で読み込まれる |
| 守りの mod | 利用者 tier の mod には効く。利用者が settings を書き換えれば外せる | 下の箇条 |
| ホットリロード | 実用的 | 下の箇条 |

classic hook の握り潰し・改変（`mods-adversary`、利用者 tier）:

- `swallow`（`next` を呼ばず `{}` を返す）で、プラグインの command hook と settings の hook（`--settings`・本人の `~/.claude/settings.json`）が動かなくなる。
  プラグインの command hook は、governance が使う 9 イベント（SessionStart・UserPromptExpansion・UserPromptSubmit・PreToolUse・PostToolUse・
  PostToolUseFailure・Stop・PreCompact・SessionEnd）すべてで止まった。本人が入れている他プラグインの hook も巻き添えになる
- 画面にも標準エラーにも何も出ない。debug にだけ `answered classic.Stop without next() …; nothing beneath it ran` と残る
- `rewrite-body`（`prompt` 等を書き換えて `next`）では、下の command hook が偽の値を stdin で受け取る
- `rewrite-envelope`（`session_id` の書き換え）は本体が拒否し、その mod の hook を skip して下を本物の入力で実行する
- 型定義の記述では classic の連鎖は「managed settings の hook → mod → その他の settings hook」の順。実機の結果はこれと整合する

マーケットプレイス経由の導入（隔離、ディレクトリ型）:

- 実行元: 導入時にキャッシュ `plugins/cache/<marketplace>/<plugin>/<版>/` へコピーされるが、**実行されるのは元ディレクトリ**。
  元を書き換えると即座に反映され、キャッシュを書き換えても変わらない。元が無いと読み込まれない（キャッシュへ戻らない）
- 型の書き込み: `tsconfig.json`・`.claude-plugin/types/` は元にもキャッシュにも書かれない。書かれるのは `--plugin-dir` のときだけ
- 版の更新: コードは更新操作なしで反映される。`claude plugin update` で版番号とキャッシュ（旧版も残る）が進むが、実行元は元ディレクトリのまま
- `$.store`: ファイル名は `<plugin>_<marketplace>-<ハッシュ>.json`（`--plugin-dir` では marketplace が `inline`）。導入方法が違えば別ファイル
- userConfig のキー: `pluginConfigs["<plugin>@<marketplace>"]`。短いキー `pluginConfigs["mods-probe"]` は読まれない
- 同名の mod を `--plugin-dir` でも渡すと `@inline` だけが読み込まれる

守りの mod（隔離、利用者 settings の `prependPlugins` に置く）:

- `guard`（`classic.*` を `next.to(e, 'append')`）: 利用者 tier を飛ばして下へ渡す。`swallow` でも hook が動き、`rewrite-body` でも本物の値が届く。
  `next.to` を `next` に変えると握り潰しが戻る
- `guard-reg`（`plugin.register` で、`e.uses.events` が classic に触れる利用者 tier の mod を `refuse`）: 敵対的 mod の読み込みを拒否する。
  判定中の例外は捕まえないとフェイルオープンになる（`admitted`）。拒否は debug にだけ残る。debug では拒否より前に `loaded (worker …)` が出る
- 外し方: 利用者が `prependPlugins` から消すと、`guard` は `next.to is available to managed plugins (prependPlugins / appendPlugins) only` で
  読み込み自体が失敗し、標準エラーには何も出ない
- 順序: 敵対的 mod も `prependPlugins` に入れると、`guard` は前後どちらに置いても効かない（`next.to` は下の tier を飛ばすだけで同じ prepend の後続は飛ばさない）。
  `guard-reg` は tier 限定を外したうえで先に書いた場合だけ拒否できる
- 副作用: classic を観測するだけの正当な利用者 mod も、`guard` では classic を受け取れず、`guard-reg` では読み込めない

ホットリロード（対話、`--plugin-dir`）:

- mod のファイルや `hooks.json` の変更が約 1 秒で反映され、画面に `mods-probe: reloaded` と出る
- モジュール変数は 0 に戻る。`$.state` と `$.store` は残る
- リロードのたびに `session.start` が再発火し、旧版の `session.end` は来ない
- 構文エラーでは `reload failed, the previous version stays loaded` と出て、前の版が動き続ける

## governance プラグインへの示唆

### 事実として得られるもの

- **トークン数を transcript の解析なしで得られる。**`turn.complete` の `e.usage` にモデル名・入出力・キャッシュ読み書きが入る
- **Python の外部プロセスなしで UI を出せる。**トースト・状態行・プロンプト上のバンド（ボタン付き）を mod だけで描ける
- **定期送信を本体の中で回せる。**`$.clock.every` が対話セッション中に予定どおり発火し、`$.http.fetch` で送れる
- **蓄積がプロセスを跨いで残る。**`$.store` は `-p` の実行を跨いで値を保持する（モジュール変数はプロセスごとに 0 に戻る）
- **mod に npm の依存は要らない。**`mods-probe` は `claude-code` モジュールだけを import し、本体がそのまま実行する
- 既存の settings hook（`hooks/hooks.json`）は mod と併走し、mod が `next(e)` を返せば止まらない
- **トークン数はサブエージェントの分も取れる。**`turn.complete` を `e.agentId` の有無を問わず全件足すと `modelUsage` と一致する。メインのターンだけでは過少になる

### 注意点と罠（事実）

- **`$.http.fetch` は接続失敗で例外を投げる**（`ok:false` を返さない）。捕まえないと hook が skip され、`-p` では標準エラーに
  `mods-probe: session.end hook skipped: threw … ECONNREFUSED` が出る。これは現行の Design 原則「hook は常に exit 0、
  標準エラーにも何も出力しない」に反する。`command.run` では応答が `registered /mods-probe but no command.run hook answered it`
  という原因を取り違えやすい文言になる。このため `_flush` は `$.http.fetch` を try/catch で囲み、失敗を文字列で返す
  （単体テスト「送信が例外で失敗したら…」で固定している）。例外の文言には URL が含まれる
- **送信失敗は debug に error 行を残さない。**mod 側で記録しない限り、失敗に気づく手段がない
- **ガードは `.catch` を付けないとフェイルオープンになる。**`.catch` を外しても `claude plugin validate` は通る。テストで固定する必要がある
- **`$.store` は利用者単位の 1 ファイル。**保存先は `~/.claude/plugins/store/<plugin>_<marketplace>-<hash>.json` で、プロジェクト別・
  セッション別ではない。並行セッションが同じキーを読んで書くと、互いの更新が消える
- **`$.ui.status` は行頭に `⚠` が付き黄色で描かれる。**mod は装飾を指定していない。理由は不明
- **`e.usage` は 1 ターン内の API 呼び出しの合計。**API 呼び出し単位ではない
- **mod が答えるスラッシュコマンドは `prompt.submit` に数えない。**
- **`-p` では `CLAUDE_CODE_ENTRYPOINT=sdk-cli`**（外から外しても本体が設定する）。対話では `cli`
- **mod の拒否は権限拒否として数えない。**`-p` の結果の `permission_denials` は空のまま
- **フォルダ信頼の承認前は読み込まれない。**debug に `hooks modules not loaded until workspace trust is accepted`
- **`userConfig` は `--plugin-dir` では settings の `pluginConfigs` から読む。project settings は読まない。**値が無いと debug に
  `no pluginConfigs[...] in user, --settings or managed settings (project settings are not read)`
- **`--plugin-dir` で読むと、本体が mod のディレクトリに書き込む。**直下の `tsconfig.json` と `.claude-plugin/types/`。
  マーケットプレイス経由では書かれない
- `--plugin-dir` やマーケットプレイスで入れた mod は `tier user` で読み込まれる。組み込み mod（`cc-plugin-agents-md@builtin`・`cc-plugin-telemetry@builtin`）も同時に読み込まれる
- `-p` では localhost にも外部 URL にも `$.http.fetch` が許可確認なしで通る
- **Agent ツールは既定でバックグラウンドで動き、完了通知でメインのターンがもう 1 回走る。**プロンプト 1 回で `turn.complete` が 2 回出うる
- **transcript は同じ message.id の usage を content ブロックごとの行に重複して載せる。**行単位で足すと過大になる
- **mod の失敗の多くはフェイルオープン。**hook が例外を投げる・`next` に不正な引数を渡すと、その hook を skip して下を実行する
- **ディレクトリ型マーケットプレイスでは元ディレクトリを書き換えた瞬間に全利用者へ反映される。**版番号は実行に影響しない
- 所要時間（`next` 込み、debug の値）: `-p` では `classic.Stop` が約 0.5 秒、対話では約 20ms。差の原因は調べていない

### 推測

- 推測: 現行の Stop hook での transcript 解析と statusline の外部プロセスは、`turn.complete` と `$.ui.status` で置き換えられる
- 推測: 送信の失敗を捕まえる実装を規約にしないと、mod 化で Design 原則（標準エラーに出さない）が崩れやすい。テストで固定するのが前提になる
- 推測: `mods-probe` の buffer（単一キーへの追記）は、並行セッションのターン終了が数 ms 以内に重なると記録を失う。セッション別のキーにするなどの設計が要る
- 推測: 現行の Stop hook での transcript 解析が `subagents/` を読んでいなければ、現行の値はサブエージェント分を落としている（現行実装は未確認）
- 推測: ホットリロードで初期化が再実行されるので、集計値はモジュール変数でなく `$.store`・`$.state` に置く必要がある

### 組織での運用の論点

事実:

- 利用者は settings だけで mod の序列を変えられる。`prependPlugins` は managed settings 無しでも効き、`disableAllHooks` は利用者 tier の mod を止める
- 利用者の mod 1 つで、governance の command hook（9 イベント）を無言で止め、送る値を偽れる。止まったことは debug にしか残らない
- 利用者 settings の `prependPlugins` に置いた守りの mod は、利用者 tier の mod には効くが、利用者が settings を書き換えれば外せる。
  観測するだけの正当な mod も巻き添えにする
- 組み込みガード `cc-plugin-sec-default@builtin` は、managed settings が無く Team・Enterprise の組織でもない環境では
  `not seated` で読み込まれない（`prependPlugins` に書いても同じ）

推測:

- 利用者の settings を正本とする限り、mod で収集を強制することはできない。守りの mod は「うっかり入れた mod」への防御にとどまる。
  強制が要るなら managed settings（利用者が書けない場所）が前提になり、mod は可視化・案内・利便性に使うのが妥当
- 利用者が自分の settings で hook を止められるのは mod 以前からである。mod で新たに増えたのは、本文を偽れることと、他の hook を選んで止められること

## 未検証事項

- Bedrock 認証下での動作（会社 PC は Bedrock）と、そのときの `e.usage` の中身
- Windows での動作
- Desktop・VS Code の surface（バンドは単体テストのみ）
- managed settings 下の挙動: managed と利用者の `prependPlugins` の優先、managed の hook が mod に止められないこと、
  managed に置いた守りの mod、`disableSideloadFlags`・`allowManagedModsOnly`
- git・URL・npm から入れたプラグインの実行元と tier（キャッシュから実行されるか、managed `enabledPlugins` で有効化したときの tier）
- 対話セッションでの外部 URL への `$.http.fetch` の許可確認
- 拒否された mod のトップレベルのコードが実行されるか
- リロード後に旧版の `$.clock.every` のタイマーが残るか。`$.clock.every` の長時間運用
- settings.json の command hook を守りの mod で守れるか（守りの実験はプラグインの command hook だけで観測した）
- `transcript_path`・`cwd` の書き換え、バックグラウンドのサブエージェント完了で走るターンで `prompt.submit` が発火するか
- `.catch` によるフェイルクローズの実機での発生
- `$.store` の容量の上限

## 再現手順

本番の受信先には向けない。送信の確認は localhost で受信器を立てて行う。利用者本人の `settings.json` は書き換えない
（`--plugin-dir` と `--settings` はそのセッションだけに効く）。

```bash
# worktree のルートで
claude plugin validate spikes/mods-probe   # マニフェストと hooks の検証
(cd spikes/mods-probe && npx -y -p typescript@5 tsc -p .)  # 型検査。tsconfig.json は本体が生成したもので、一度 --plugin-dir で読み込んだ後に通る
claude plugin test spikes/mods-probe      # tests/*.test.tsx を実行
```

送信先を渡す settings（例 `probe-settings.json`）:

```json
{"pluginConfigs":{"mods-probe":{"options":{"endpoint":"http://127.0.0.1:18765/ingest"}}}}
```

キーはプラグインの ID で決まる。`--plugin-dir` では `pluginConfigs["mods-probe"]`（または `"mods-probe@inline"`）、
マーケットプレイスで入れたら `pluginConfigs["mods-probe@<marketplace>"]` と書く（この場合、短いキーは読まれない）。

受信器は POST を受けて 200 を返すだけの使い捨てのもの（例: Python の `http.server` を継承した数行のスクリプト）でよい。

```bash
# 非対話。Claude Code の中から起動するときは CLAUDE_CODE_ENTRYPOINT などの継承された変数を env -u で外す
claude -p "/mods-probe" --plugin-dir spikes/mods-probe --settings probe-settings.json --debug-file probe.debug.log
claude -p "/mods-probe flush" --plugin-dir spikes/mods-probe --settings probe-settings.json

# 対話（フォルダ信頼を承認するまで mod は読み込まれない）
claude --plugin-dir spikes/mods-probe --model haiku --settings probe-settings.json --debug-file probe.debug.log
```

敵対的 mod は、比較用の command hook（stdin をファイルに追記するだけのもの）を持つプラグインと一緒に読み込む。
`mode` は `swallow`（既定）・`rewrite-envelope`・`rewrite-body` で、`pluginConfigs["mods-adversary"].options.mode` で渡す。
`swallow` では本人の settings の hook もそのセッションに限り止まる。隔離 `CLAUDE_CONFIG_DIR`（未ログイン）では
Stop・PostToolUse が発火しないので、観測できるのは SessionStart・UserPromptSubmit に限られる。

```bash
claude -p "Run \`echo hi\` with the Bash tool, then reply OK" --plugin-dir spikes/mods-adversary --plugin-dir <比較用プラグイン> \
  --settings adversary-settings.json --debug-file adv.debug.log
```

守りの mod は `prependPlugins` に置かないと読み込まれない（`next.to is available to managed plugins (prependPlugins / appendPlugins) only`）。
隔離 `CLAUDE_CONFIG_DIR` で、`spikes/mods-guard/guard`・`guard-reg`・`mods-adversary` を載せたディレクトリ型マーケットプレイス
（`.claude-plugin/marketplace.json` はリポジトリに含めていない）を `claude plugin marketplace add` し、`claude plugin install` したうえで、
その config の `settings.json` に書く。

```json
{"prependPlugins":["guard@<marketplace>"]}
```

判定は debug で見る。守れたときは `mods-adversary: classic.UserPromptSubmit bypassed by guard (tier user)`、
拒否したときは `judged by guard-reg: refused by guard-reg` が出る。未ログインでも SessionStart・UserPromptSubmit は発火する。

確認後の痕跡: `~/.claude/plugins/store/mods-probe_*.json`、検証ディレクトリの transcript（`~/.claude/projects/` 配下）、
`~/.claude.json` の `projects` に追加された検証ディレクトリ。
