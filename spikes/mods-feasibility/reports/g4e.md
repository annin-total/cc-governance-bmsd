# g4e 収集列を Mods 独自のイベントだけで取れるか（classic.* なし）と、sec-default の下で届くか

- 対象: Claude Code 2.1.288（macOS、Claude.ai 認証、`--model haiku`）。実施日 2026-10-03
- 正本: worktree `spikes/mods-feasibility/g4e/`（コミット e8a7052）。検証用 mod `feas-native`（classic.* は陽性対照の `classic.SessionStart` だけ）、比較用 `feas-cmp`（g4a と同じ command hook 8 種）、最小 MCP サーバ `mcp_ping.py`、`run.sh`（-p。第 3 引数 1 で `--managed-settings '{"permissions":{"deny":["WebFetch"]}}'`）、`tui.sh`（tmux）、`compare.py`
- 生ログ（コミットしない）: `$S/logs/<tag>/`（mod-*.json / cmd-*.json）、`$S/logs/<tag>.debug.log`・`.out`。`$S` = この REPORT.md のあるディレクトリ
- `claude plugin validate --strict` は feas-native・feas-cmp とも通過。`tsc` は未実行
- モデルを呼んだ実行は 13 回（n1・n2・n2s・n3・n4・n6・n6b・n6c・i1 で 3 プロンプト・m1・m2・m3）。n5・n5b・n5c・m4（/clear）はモデルを呼ばない（費用 0）

## 実行一覧

| tag | managed | 内容 |
|---|---|---|
| n1 | なし | Bash `echo hi`・Bash `false`・Skill `feas-cmp:feas-skill`・MCP `mcp__feasmcp__ping` |
| n2 / n2s | なし | `/feas-cmp:feasx`（commands/ の md）/ `/feas-cmp:feas-skill`（スキルのスラッシュ呼び出し） |
| n3 | なし | Agent 1 回（サブエージェントが Bash `echo sub`）、`--permission-mode acceptEdits` |
| n4 | なし | n1 を `--resume` して `/compact` |
| n5・n5b・n5c | なし | `--resume` して `/clear`（mod を直しながら 3 回） |
| n6 / n6b / n6c | なし | 自動圧縮の試み。n6c（`--autocompact 100000`＋`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=10`、n6b の resume）で発火 |
| i1 | なし | 対話（tmux）。sleep 20 完走 → sleep 20 を Esc で中断 → shift+tab で accept edits → `echo after` → `/exit` |
| m1 | **あり** | n1＋Agent を 1 プロンプトで、`--permission-mode acceptEdits` |
| m2 | **あり** | `/feas-cmp:feas-skill` |
| m3 / m4 | **あり** | m1 を resume して `/compact` / `/clear` |

## 列ごとの判定

| 列 | 判定 | 使ったイベントとキー | 根拠 |
|---|---|---|---|
| session_id | 一致 | 各イベントで `$.session.id()`。`session.end` は `e.sessionId` | 全実行・全イベントで一致。`/clear` の後の新しい id は `session.end`（reason clear）の `next(e)` の後でもまだ古い id で、`command.run`（clear）の `next(e)` が返った後に新しい id になる（n5c: d4b62817 → a9576629 = command hook の SessionStart(clear) の id） |
| prompt_id | 条件付き | 独自イベントに無い。`turn.complete` の時点で transcript（`<CLAUDE_CONFIG_DIR or ~/.claude>/projects/<root の英数字以外を - に>/<id>.jsonl`）の最後の user 行の `promptId` を読む。`$.fs.read` と `$.process.run(['tail','-c','262144',path])` の両方で試した | Stop との比較 11 件すべて一致（n1・n2・n2s・n3・n6・n6b・n6c・i1×2・m1・m2）。**`turn.start` の時点では不安定**: 新規の -p では transcript がまだ無く ENOENT（n1・n3・m2・i1 の 1 ターン目）、resume では前のプロンプトの id が出た（n6: 71cc50c2、正しくは 9383c2ca）。UserPromptSubmit・PostToolUse の行に付けるには、ターン終わりまで行を保留するか、tool.call ごとに読む必要がある（後者は未検証）。`$.fs.read` は 4 MiB 超で reject（型の記述）、`tail` は Windows に無い |
| tool_name | 一致 | `tool.call` の `e.tool` | `Bash`・`Skill`・`ToolSearch`・`mcp__feasmcp__ping`・`Agent`（n1・n3・m1）。MCP も同じ表記 |
| PostToolUse / PostToolUseFailure の区別 | 一致 | `tool.call` の `await next(e)` の結果の `isError` | `false`（Exit code 1）で isError=true、他は false。n1・m1 で件数一致 |
| source | 条件付き | 独自イベントに source は無い。組み立てる: `session.start` で `$.session.turns()`>0 か `messages()` が空でない → resume、0 → startup。`session.compact` の `next(e)` が skip でなく返ったら compact、`command.run`（clear）の後に clear | `session.start` は 1 プロセス 1 回で、/clear・圧縮で再発火しない（n4・n5・m3・m4）。startup は turns=0・messages=0、resume は turns≥1（n4: 1/20、n5: 1/6、m4: 3/5）。**自動圧縮が失敗した n6c では command hook の SessionStart(compact) は出ず、mod の `next(e)` は reject**（debug `Reactive compact: no assistant messages in summarize set, bailing` → `its next() rejected below it (session.compact)`）。成功時だけ compact を出せば一致する。`--fork-session`・`--continue`・SDK の resume、/clear を `$.command.run` 以外の経路で起こした場合は未検証 |
| compact_trigger | 一致 | `session.compact` の `e.trigger` | manual（n4・m3）・auto（n6c）とも PreCompact の `trigger` と一致 |
| command_name | 一致 | `command.run` の `e.command` | `feas-cmp:feasx`（n2）・`feas-cmp:feas-skill`（n2s・m2）。command.run は UserPromptExpansion より先に来る |
| command_source | 条件付き | `$.command.list()` から同名の `source`（型 CommandSource: builtin・plugin・user・mcp） | plugin は 3 件一致。**語彙が違う可能性**: hook 側の `command_source` が取りうる値（project・mcp_prompt など）と CommandSource の対応は未確認。`command.run` は組み込み（compact・clear・exit）でも発火するので、`source==='builtin'` を除いて UserPromptExpansion に当てた。組み込みの prompt 型コマンドで UserPromptExpansion が出るかは未確認 |
| skill_name | 一致 | `tool.call`（`e.tool==='Skill'`）の `e.skill` | `feas-cmp:feas-skill`（n1・n2s・m1）。`skill.prompt` でも取れるが sec-default に飛ばされる（下） |
| effort_level | 取れない（未検証） | `turn.step` の `e.effort` | haiku では両側とも無い（hook に `effort` キー無し、`turn.step` も absent）。effort 対応モデルでの値は未確認 |
| permission_mode | 条件付き | 独自イベントにも `$` にも現在のモードは無い。`$.config.list()` の `permissionMode` 行は設定値（常に `auto`）で、実効値ではない（n3・m1 で hook は acceptEdits、行は auto）。transcript の、利用者が打った user 行の `permissionMode` を `turn.complete` で読む | Stop との比較: m1 acceptEdits=acceptEdits、n6・n6b・n6c default=default。**スラッシュコマンドのターンでは user 行に permissionMode が無い**（n2・n2s・m2 は null。hook は default）。i1 は最初の mod の読み方の不具合で null（tool_result 行を拾った。transcript には default・acceptEdits が正しく入っている）。直した読み方は m1 で確かめた。ターン途中の shift+tab は反映されない（推測。transcript は打った時点の値）。`agent.spawn` の `permissionMode` はサブエージェント起動時だけで、sec-default が購読する |
| agent_id | 一致 | `tool.call` の `e.agentId` | n3 `aa0b7708d54ec7ea8`、m1 `a4393151d9bfa2ada`（サブエージェント内の Bash）。Agent ツール自体の呼び出しには無い（両側同じ） |
| is_interrupt | 条件付き | 独自イベントに真偽値は無い。`tool.call` の結果の `isError` と、`text` の `[Request interrupted by user for tool use]` | 今の行で出るのは `false` だけ（n1・m1 の `false` コマンド）。Esc 中断（i1）では command hook は PostToolUse も PostToolUseFailure も出さず、mod には isError=true・text 先頭 `Exit code 137\n[Request interrupted by user for tool use]` が来た。文言で中断を見分けて除けば今と同じ件数になる（文言は安定の保証が無い。推測） |
| context_tokens | 一致 | `turn.complete`（agentId なし）と `session.compact` の時点の `$.session.usage().context.tokens` | Stop 11 件（n1 27345・n2 26181・n2s 26508・n3 27549・n6 27640・n6b 26163・n6c 26557・i1 40567/41133・m1 27764・m2 26238）と PreCompact 3 件（n4 27345・n6c 26163・m3 27764）がすべて command hook の `_context.context_tokens` と一致 |

## 回数の比較（command hook / 独自イベントで組み立てた件数）

対応: UserPromptSubmit=`prompt.submit`、UserPromptExpansion=`command.run`（source が builtin 以外）、PostToolUse=`tool.call` の isError なし、PostToolUseFailure=`tool.call` の isError あり（中断の文言を除く）、PreCompact=`session.compact`、Stop=`turn.complete`（agentId なし・reason≠aborted）、SessionStart=`session.start`（startup/resume のみ。compact・clear は上の組み立て）

| tag | SessionStart | UPE | UPS | PostToolUse | PTUFailure | PreCompact | Stop | SessionEnd |
|---|---|---|---|---|---|---|---|---|
| n1 | 1/1 | 0/0 | 1/1 | 4/4 | 1/1 | 0/0 | 1/1 | 1/1 |
| n2 | 1/1 | 1/1 | 1/1 | 0/0 | 0/0 | 0/0 | 1/1 | 1/1 |
| n2s | 1/1 | 1/1 | 1/1 | 1/1 | 0/0 | 0/0 | 1/1 | 1/1 |
| n3 | 1/1 | 0/0 | 1/1 | 2/2 | 0/0 | 0/0 | 1/1 | 1/1 |
| n4 | 2/1＋compact 1 | 0/0 | 0/0 | 0/0 | 0/0 | 1/1 | 0/0 | 1/1 |
| n5 | 2/1＋clear 1 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 2/2 |
| n6c | 1/1 | 0/0 | 1/1 | 0/0 | 0/0 | 1/1 | 1/1 | 1/1 |
| i1 | 1/1 | 0/0 | 3/3 | 2/2 | 0/0（中断 1 を除外） | 0/0 | 2/2（aborted 1 を除外） | 1/1 |
| m1 | 1/1 | 0/0 | 1/1 | 6/6 | 1/1 | 0/0 | 1/1 | 1/1 |
| m2 | 1/1 | 1/1 | 1/1 | 0/0 | 0/0 | 0/0 | 1/1 | 1/1 |
| m3 | 2/1＋compact 1 | 0/0 | 0/0 | 0/0 | 0/0 | 1/1 | 0/0 | 1/1 |
| m4 | 2/1＋clear 1 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 2/2 |

- 除外しないと i1 で差が出る: PostToolUseFailure 0/1（Esc 中断）、Stop 2/3（`turn.complete` reason=aborted、isAborted=true）。中断されたプロンプトの UserPromptSubmit は両側とも数える（3/3）
- サブエージェントの `turn.complete`（agentId あり）は Stop から除く（n3・m1 で 1 件ずつ）
- i1 の対話 `/exit` で command hook の SessionEnd は今回は動いた（reason `prompt_input_exit`）。g4a では取り消されていた。差の原因は調べていない

## sec-default が座った状態で届くか（m1〜m4）

全 4 実行で debug に `cc-plugin-sec-default@builtin seated outermost: this machine has managed settings`。

| イベント・API | 届くか | 根拠 |
|---|---|---|
| session.start | 届く | m1〜m4 で各 1 件 |
| prompt.submit | 届く | m1・m2 で各 1 件 |
| turn.start / turn.step / turn.complete | 届く | m1: 1 / 9 / 2（サブエージェント分を含む） |
| tool.call（結果の isError・agentId を含む） | 届く | m1: 7 件、PostToolUse 6 / Failure 1 と一致 |
| session.compact | 届く | m3: trigger manual、context.tokens 27764 一致 |
| session.end | 届く | m1〜m4、m4 は clear と other の 2 件 |
| command.run（＋`$.command.list()`） | 届く | m2・m3・m4。m2 で source plugin |
| `$.session.usage`・`id`・`turns`・`messages`・`root`・`model`、`$.config.list`、`$.fs.read`・`write`、`$.process.run`、`$.env.get` | 動く | m1〜m4 の記録がすべて書け、prompt_id・permission_mode・context_tokens が一致。`FEAS ... failed` は 0 件 |
| classic.SessionStart（陽性対照） | **届かない** | `feas-native: classic.SessionStart bypassed by cc-plugin-sec-default (tier user); beneath runs`（m1〜m4、resume では 2 回） |
| skill.prompt（陽性対照） | **届かない** | `feas-native: skill.prompt bypassed by cc-plugin-sec-default (tier user); beneath runs`（m1・m2） |

`bypassed by cc-plugin-sec-default` は classic.SessionStart と skill.prompt の 2 種だけで、上の独自イベントには 1 件も出ていない。

## 事実と推測

- 事実: 上の表の一致・不一致、件数、debug の行。transcript の user 行に `promptId` と（打った行だけ）`permissionMode` があること
- 推測: `[Request interrupted by user for tool use]` の文言や transcript の形が将来も変わらないこと。ターン途中のモード変更が transcript に出ないこと。本物の managed（ファイル・MDM・server-managed）や Team・Enterprise のサインインでも `--managed-settings` と同じ購読範囲で sec-default が座ること（g3a と同じ前提）

## 未検証事項

- effort_level（effort 対応モデル）
- command_source の plugin 以外（user・project・mcp）と、hook の語彙との対応
- tool.call ごとに transcript を読んで UserPromptSubmit・PostToolUse の行に prompt_id・permission_mode を付ける方式（今回は turn.complete の時点だけ）。4 MiB を超える transcript、Windows（tail が無い）
- ターン途中の shift+tab、plan・bypassPermissions・auto モード
- --fork-session・--continue・SDK での resume の判定、サブエージェントの圧縮（session.compact の agentId）
- 自動圧縮が成功した場合の SessionStart(compact)（n6c は失敗した圧縮）
- i1 は直す前の mod で走らせた（permission_mode の読み方。n1〜n5c は tail と after の記録を足す前の版）
- tsc、ホットリロード、他の mod との順序、Bedrock 認証

## 痕跡（本人の環境。消していない）

- `~/.claude/projects/` に 2 ディレクトリ: `-private-tmp-claude-501--…-scratchpad-g4e-ws`（transcript 12 件: 46a07ef1・78547791・7c1e3108（ディレクトリ付き）・7f40a7fd（ディレクトリ付き）・83f6e55c・8e547d97・91027309・9ed1cbee・a9576629・afd6520a・d4b62817 と memory/）、`…-g4e-ws-i1`（c7136e95.jsonl・memory/）
- `~/.claude.json` の projects に 2 件: `$S/ws`・`$S/ws-i1`（ws-i1 はフォルダ信頼の承認を含む）
- `~/.claude/plugins/store/`: feas-native のファイルは無い。`cc-plugin-diff_builtin-3903e77c01b1.json` の mtime が 20:54 に更新（組み込み mod。他セッションの可能性あり）
- `~/.claude/security/` に上のセッション分の security_warnings_state（本人の security-guidance プラグイン由来、16 ファイル）、`~/.claude/shell-snapshots/` に対話の Bash のスナップショット（推測。g4a と同じ）
- worktree: `plugin/`・`server/`・`docs/` は変更なし。`plugin/hooks/__pycache__` は作られていない。本体が書いた `g4e/feas-native/.claude-plugin/types/` と `tsconfig.json` は .gitignore で無視
- 子の claude・tmux（`-L gov4e`）は残っていない。ソケット `/private/tmp/tmux-501/gov4e` は削除済み
