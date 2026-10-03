# g4a 収集列の実機検証（mod の classic.* と command hook の突き合わせ）

- 対象: Claude Code 2.1.288（macOS、Claude.ai 認証、`--model haiku`）。実施日 2026-10-03
- 検証用 mod `feas-collect` と比較用プラグイン `feas-cmp`（command hook だけ。8 イベントの stdin をそのまま記録）を同じ実行で `--plugin-dir` から読み込み、イベントごとに順に突き合わせた
- 正本: worktree `spikes/mods-feasibility/g4a/`（コミット 199754f）。`run.sh`（-p）・`tui.sh`（tmux）・`compare.py`（突き合わせ）
- 生ログ（コミットしない）: `$S/logs/<tag>/`（mod-*.json / cmd-*.json）、`$S/logs/<tag>.debug.log`、`$S/logs/<tag>.out`。`$S` = `<scratchpad>/g4a`
- 回帰確認: `claude plugin test spikes/mods-probe` は 2.1.288 で 7 pass / 0 fail
- `claude plugin validate --strict` は feas-collect・feas-cmp とも通過
- モデルを呼んだ実行は 10 回（r1・r2・r2b・r4・r5・r6・r7・i1 で 2 プロンプト・i2 で 1 プロンプト）。r3・r8 はモデルを呼ばない（num_turns=0・費用 0）

## 実行一覧

| tag | 形 | 内容 |
|---|---|---|
| r1 | -p・両方 | Bash `echo hi`・Bash `false`・Skill `feas-cmp:feas-skill` |
| r2 | -p・両方 | `/feasx`（名前空間なし） |
| r2b | -p・両方 | `/feas-cmp:feasx`（プラグインの command） |
| r3 | -p・両方 | `/feas-mod`（mod が答えるコマンド）。シェルで `CC_GOVERNANCE_DISABLE=fromshell` |
| r4 | -p・両方 | Agent ツール 1 回（前景）。サブエージェントが Bash `echo sub` |
| r5 | -p・両方 | r1 を `--resume` して `/compact` |
| r6 | -p・両方 | 圧縮後の r1 を `--resume` して 1 ターン |
| r7 | -p・**mod だけ** | Bash `echo hi`。`--settings` の env に `CC_GOVERNANCE_DISABLE=fromsettings` |
| r8 | -p・両方 | r7 を `--resume` して `/clear` |
| i1 | 対話・両方 | 未信頼フォルダで起動→信頼を承認→`/feas-mod`→Bash `sleep 20` を Esc で中断 ×2→`/exit` |
| i2 | 対話・**command だけ** | i1 の中断と `/exit` を mod なしで再現（差の切り分け） |

## 発火回数（mod / command）

| tag | SessionStart | UserPromptExpansion | UserPromptSubmit | PostToolUse | PostToolUseFailure | PreCompact | Stop | SessionEnd |
|---|---|---|---|---|---|---|---|---|
| r1 | 1/1 | 0/0 | 1/1 | 2/2 | 1/1 | 0/0 | 1/1 | 1/1 |
| r2 | 1/1 | 0/0 | 1/1 | 1/1 | 0/0 | 0/0 | 1/1 | 1/1 |
| r2b | 1/1 | 1/1 | 1/1 | 0/0 | 0/0 | 0/0 | 1/1 | 1/1 |
| r3 | 1/1 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 1/1 |
| r4 | 1/1 | 0/0 | 1/1 | 2/2 | 0/0 | 0/0 | 1/1 | 1/1 |
| r5 | 2/2 | 0/0 | 0/0 | 0/0 | 0/0 | 1/1 | 0/0 | 1/1 |
| r6 | 1/1 | 0/0 | 1/1 | 0/0 | 0/0 | 0/0 | 1/1 | 1/1 |
| r7 | 1/– | 0/– | 1/– | 1/– | 0/– | 0/– | 1/– | 1/– |
| r8 | 2/2 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 2/2 |
| i1 | 1/1 | 0/0 | 2/2 | 0/0 | **2/0** | 0/0 | 0/0 | **1/0** |
| i2 | –/1 | –/0 | –/1 | –/0 | –/**0** | –/0 | –/0 | –/**0** |

-p の 9 実行では、全イベントで件数が一致した。差が出たのは対話の 2 か所だけ（下の「見つけた差」）。

## 列ごとの判定

| 列 | 判定 | 根拠（値は mod と command の両方。ファイルは `$S/logs/<tag>/`） |
|---|---|---|
| session_id | 一致 | 全実行・全イベントで一致。`$.session.id()` も 48 記録すべてで `e.session_id` と同じ。`/clear` の後は両側とも新しい id（r8: 40a7d943… → bac9f507…）。サブエージェントのツール呼び出しも親の id（r4） |
| prompt_id | 一致 | r1 `5d108e80-…` など全実行で一致。SessionEnd にも載る。r3 では UserPromptSubmit が無いのに SessionEnd に prompt_id が付く（両側同じ） |
| tool_name | 一致 | `Bash`・`Skill`・`Agent`（r1・r2・r4） |
| source | 一致 | SessionStart: `startup`（r1）・`resume`（r5・r6・r8）・`compact`（r5）・`clear`（r8）。**UserPromptSubmit の `source` キーは -p でも対話でも両側に無い**（r1・i1）。型 L13693 は「ロールアウト中は省かれうる」と書く。今のデータでも UserPromptSubmit 行の source は NULL のはず（推測。手元の端末の観測からの推論） |
| compact_trigger | 一致（manual のみ） | r5 PreCompact `trigger: "manual"`。auto は未検証 |
| command_name / command_source | 一致 | r2b `feas-cmp:feasx` / `plugin`。名前空間なしの `/feasx`（r2）は展開されず、UserPromptExpansion は両側とも 0 件。モデルが Skill ツールで `feas-cmp:feasx` を呼んだ |
| skill_name（tool_input.skill） | 一致 | r1 `feas-cmp:feas-skill`、r2 `feas-cmp:feasx`（command もモデルからは Skill ツールで呼ばれる） |
| effort_level | 取れない（未検証） | haiku では両側とも `effort` キーが無い。effort 対応モデルでの値は未確認 |
| permission_mode | 一致 | `default`。SessionStart・SessionEnd は両側とも無い |
| agent_id | 一致 | r4 サブエージェント内の Bash の PostToolUse で両側 `af694057aa3e0f24f`。Agent ツール自体の PostToolUse には無い |
| is_interrupt | 一致（false のみ） | r1 の `false` コマンドで両側 `False`。**Esc 中断（i1）では mod 側だけが発火し `is_interrupt: false`**。true は一度も観測していない |
| context_tokens | 一致 | Stop: r1 32960=32960・r2 32800=32800・r2b 32015=32015・r4 32559=32559・r6（圧縮後）32776=32776。PreCompact: r5 32960=32960。左が `$.session.usage().context.tokens`、右がその時点に command hook が `_context.context_tokens(transcript_path)` で読んだ値。r7（mod だけ）は事後に venv の python で読んだ値と一致（32499）。r6 は `result.usage` の 10+17828+14938=32776 とも一致 |
| claude_code_version | 一致 | `$.session.version().version` = transcript の `version` = `2.1.288`（Stop・PreCompact の全件）。`base`=`2.1.288`、`builtAt`=`2026-10-02T16:42:03Z` も取れる |
| host | 一致（末尾の改行を除けば） | `$.process.run(['hostname'])` の stdout は `<hostname>.local\n`、`platform.node()` は `<hostname>.local`。trim が要る。macOS のみ |
| user_email | 取れる | `$.process.run(['git','config','--global','user.email'])` がシェルの値と同じ（-p・対話とも、許可確認なし） |
| CC_GOVERNANCE_DISABLE | 取れる | シェルの export（r3: `fromshell`）と `--settings` の env（r7: `fromsettings`）の両方を `$.env.get` で読めた。未設定は `undefined` |
| 他の env | – | `CLAUDE_CONFIG_DIR` は未設定で `undefined`。`CLAUDE_CODE_ENTRYPOINT` は -p で `sdk-cli`、対話で `cli` |

## 見つけた差（件数の変わる条件）

1. **Esc でツールを中断すると、mod の classic.PostToolUseFailure だけが発火する**（事実、i1 で 2 回再現）。command hook は動かず、debug にも実行の痕跡が無い。mod を外した i2 でも command hook は発火しなかったので、mod が command hook を止めたのではなく、本体が中断時に command hook を走らせないと見られる（推測）。mod に移すと、今は 0 件の「中断されたツール失敗」の行が増える。そのときの `is_interrupt` は `false`（中断なのに true にならない）。Stop は両側とも来ない
2. **対話の `/exit` で SessionEnd の command hook が取り消される**（事実）。debug `SessionEnd:prompt_input_exit [python3 ".../dump.py" SessionEnd] cancelled`。mod なしの i2 でも同じ。mod は 1 件記録した。今の governance は SessionEnd を登録していないので収集には影響しない
3. **mod が答えるスラッシュコマンドは UserPromptSubmit・UserPromptExpansion・Stop を出さない**（事実、r3 と i1。両側とも 0 件）。今の `/reapply` はスキル（`disable-model-invocation: true`）なので、r2b と同じく UserPromptExpansion・UserPromptSubmit・Stop（と reapply.py を走らせる Bash の PostToolUse）が出ているはず。mod のコマンドにするとそれらの行が消える（推測。r2b は commands/ の md で確かめ、スキルのスラッシュ呼び出しでは確かめていない）
4. 名前空間なしの `/feasx` は展開されない（r2）。モデルが Skill ツールで呼ぶので UserPromptExpansion ではなく PostToolUse（skill_name 付き）になる。両側で同じなので mod 化の差ではない

## その他の事実

- 発火順: 各セッションで classic.SessionStart が mod の `session.start` より先に来る（r1: 749593 → 750829 ms）。`/clear`（r8）と圧縮（r5）では `session.start` は再発火せず、classic.SessionStart だけが来る
- フォルダ信頼: 承認するまでは mod も command hook も何も記録しない（i1）。承認後に両側 1 回ずつ。取りこぼしの差は無い
- `$.session.usage().context.tokens` は**そのプロセスで最初の応答が来るまで無い**。SessionStart（11 件中 10 件）・最初の UserPromptSubmit・多くの SessionEnd で `window` だけ。transcript から読むと前の値が出る（r5・r6 の resume 時 32960）。今の列は PreCompact・Stop だけなので影響しない。ただし resume 直後の `/compact`（r5）の PreCompact では値があった
- 圧縮直後の SessionStart(compact) の時点では、両側とも圧縮前の値（32960）のまま
- サブエージェント内の PostToolUse の `context.tokens` と transcript_path は親のもの（r4: 32044 で一致）
- 対話では command hook の SessionStart が mod より 8.4 秒遅れて記録された（i1。この Mac の event-loop の停滞が debug に出ている）。-p では 0.6 秒

## 未検証事項

- effort.level の値（haiku では両側とも無い）
- PreCompact の `trigger: auto`、API エラーのターンでの context_tokens
- is_interrupt が true になる条件
- UserPromptExpansion の `command_source` が `plugin` 以外（user・project・mcp_prompt）
- ホットリロード時の二重計上、`--safe-mode`・`disableAllHooks` で止まる範囲、他の mod との順序
- Windows（`hostname` の大小文字・COMPUTERNAME）、Bedrock 認証
- スキルのスラッシュ呼び出し（`/cc-governance-bmsd:reapply` の形）での UserPromptExpansion
- mod の JS での coerce（bool → 0/1・切り詰め・小文字化）
- 型検査（`tsc`）は実行していない。`claude plugin validate --strict` のみ

## 痕跡（本人の環境。消していない）

- `~/.claude/projects/` に 3 ディレクトリ: `-private-tmp-claude-501--…-scratchpad-g4a-ws`（transcript 7 件: 22649065・b962c854・48ab6389・5b983dc3（subagents/ 付き）・40a7d943・bac9f507・be0fde90、と memory/）、`…-g4a-ws-i1`（52e3924e.jsonl・memory/）、`…-g4a-ws-i2`（d89deede.jsonl・memory/）
- `~/.claude.json` の projects に 3 件: `$S/ws`・`$S/ws-i1`・`$S/ws-i2`（ws-i1・ws-i2 はフォルダ信頼の承認を含む）
- `~/.claude/plugins/store/`: feas-collect のファイルはできていない（`$.store` を使っていない）。`cc-plugin-diff_builtin-3903e77c01b1.json` の mtime が 19:27 に更新（組み込み mod。他のセッションの可能性もある）
- `~/.claude/security/security_warnings_state_<session>.{json,lock}`（本人が入れている security-guidance プラグイン由来。上の 7 セッション分）
- `~/.claude/shell-snapshots/` に対話の Bash ツールのスナップショット
- worktree の `plugin/hooks/__pycache__/_context.cpython-313.pyc` を比較用 dump.py の import が作ったので、自分で消した（ディレクトリごと、19:18 作成のもの）。以後は `sys.dont_write_bytecode` で作らない。`plugin/`・`server/`・`docs/` の追跡ファイルは変更なし
- 子の claude・tmux（`-L gov4a`）は残っていない。ソケットも削除済み
