# Claude Code の挙動

拡張や検証のときに知っていると手戻りが減る、上流の振る舞い。
macOS での実測。確かめた版は各行に添える。版の無い行は記録が無い（観測は 2026-09、同時期の版は 2.1.278〜2.1.283）。

## プラグインの配置と更新

| 事実 | いつ効くか |
| --- | --- |
| アンインストールすると `plugins/data/<plugin>-<marketplace>/` は配下ごと消えるが、**`plugins/cache/<marketplace>/<plugin>/<version>/` は残る**（`.in_use` / `.orphaned_at` マーカー付き）。`.orphaned_at` の付いた版ディレクトリは 14 日後に背景の掃除で消えるが、掃除は `installed_plugins.json` に導入が 1 つ以上記録されている間だけ走り、最後のプラグインをアンインストールした後は次に導入するまで残る（公式 plugins/loading、2026-09-28 取得）。`settings.json` からは `enabledPlugins` のその項目だけを消し、ほかのキー（`env`・`statusLine`・`extraKnownMarketplaces` など）は変えない。`--keep-data` を付けると `data/` を残す（2.1.283） | 端末の掃除手順を書くとき。再導入で古い版が残っていても異常ではない |
| プラグインの変更が効くのは、次の起動（プロセスの起動）か、開いているセッションでの `/reload-plugins` の実行の後である。`claude plugin update` で入れた版も、`hooks.json` の変更も同じ（公式 plugins/cli-reference・plugins/loading・plugin-marketplaces、2026-09-28 取得。`/reload-plugins` での反映は未検証）。プラグインの hook が実行時に読むファイルは、同じパスのファイルを書き換えた場合（`directory` ソースなど、その場から読み込まれるプラグイン）、**次のツール実行から即時に効く**。cache へ複製されたプラグインが更新された場合は、`/reload-plugins` まで hook が旧版のパスで動く（公式 plugins/loading、2026-09-28 取得）。プラグインを更新した後、新しいプロセスで `claude -p --resume <session_id>` を実行すると、同じ session_id のまま hook が新しい版の `installPath` から動く（2.1.283。対話の `/resume` は未確認） | プラグインの変更が端末に効くタイミングを見積もるとき。反映の単位はセッションではなく、次の起動（プロセスの起動）か `/reload-plugins` |
| `directory`（ローカルパス）ソースのマーケットプレイスでは、`CLAUDE_PLUGIN_ROOT` が **`cache/` の複製ではなく元のディレクトリ**を指す。cache 側を編集しても何も起きない。このとき `claude plugin list` と `installed_plugins.json` の `installPath` は cache 配下を示したままで、実際に動く場所と一致しない（2.1.282）。git リモート（http で配信）ソースでは `plugins/cache/<marketplace>/<plugin>/<version>/` を指した（2.1.278）。Mods（関数フック）も同じく元のディレクトリから実行される。元のディレクトリを書き換えると `claude plugin update` を待たずに次の起動から新しいコードが動き、元のディレクトリが無いと cache があっても読み込まれない（2.1.287、隔離環境） | ローカル開発で「直したのに反映されない」と迷ったとき。ディレクトリ型で配ると、版の更新操作と実際に動くコードが一致しない |
| 公式（plugins/loading、2026-09-28 取得）は、settings が宣言し `known_marketplaces.json` に無いマーケットプレイスをセッション開始後に背景で clone し、有効化済みで未キャッシュのプラグインを取得すると書く。一方、隔離環境で `settings.json` に `extraKnownMarketplaces` / `enabledPlugins` を書いて起動を繰り返しただけでは、`temp_git_…_clone` が残って導入が進まない例が 2 つあった（版は記録なし）。`claude plugin marketplace add` と `claude plugin install` の明示実行で完了した | 設定の配布だけで導入が終わる前提を置くとき |
| 自動更新は、対話セッションで最初のメッセージを送った後、最大 10 分の無作為な遅延を置いて走り、自動更新が有効なマーケットプレイスとそこから導入したプラグインをディスク上で更新する（公式 plugins/loading、2026-09-28 取得）。`claude -p` と、メッセージを送らない起動では走らない（推定） | 展開の所要時間を見積もるとき。自動更新を起こす検証では、対話セッションでメッセージを送る |
| `claude plugin marketplace add <url> --scope user` は利用者の `settings.json` に `extraKnownMarketplaces.<name>.source` を書き、`claude plugin install <id> --scope user` は `enabledPlugins.<id>: true` を書く（2.1.282・隔離環境で観測） | `extraKnownMarketplaces` の項目が在る前提で設定を書くとき |
| マーケットプレイスの `autoUpdate` は `settings.json` の `extraKnownMarketplaces.<name>.autoUpdate` が権威であり、セッション開始時に `plugins/known_marketplaces.json` へ上書き同期される。社外のマーケットプレイスは既定で無効（git リモートから導入した直後、どちらのファイルにもキーが無い）（2026-09 確認。2.1.282 の隔離環境では、`SessionStart` hook が `settings.json` に書いた値は、そのセッションの終了後の `known_marketplaces.json` には無く、次のセッション開始後に現れた） | 自動更新を有効にしたいとき。`known_marketplaces.json` を書き換えても次の起動で戻る |
| 手動更新は 2 段階である。`claude plugin marketplace update` はカタログだけを更新し、導入済みプラグインの版は `claude plugin update` で上がる。`source` に到達できなくても端末の複製で動き続け、止まるのは更新だけ | 更新手順を書くとき。版が上がらないと迷ったとき |
| `env` ブロックも普通のキーとして設定の優先順位（managed > `--settings` > プロジェクトの local > プロジェクトの共有 > 利用者）に従う。シェルで export した値は settings の `env` に負ける（2.1.283 でも `DISABLE_AUTOUPDATER` で確認）。hook プロセスの環境変数には合成後の実効値が入る（2.1.282 実測 + 公式ドキュメント settings / env-vars） | 利用者の `settings.json` の値は実効値とは限らない。上位の層の上書きはその値に現れない |
| `DISABLE_AUTOUPDATER` は `1`・`true`・`yes`・`on` のときだけ自動更新を無効にし、`0`・`false` は無効化しないと読まれる（`claude doctor` の `Auto-updates:` の表示とバイナリ内の判定で確認）。`DISABLE_UPDATES` も `0`・`false` では無効化しない（表示で確認。判定の実装は未特定）。settings の `env` で与えても環境変数で与えても同じ（2.1.283・native） | 自動更新の無効化を打ち消したいとき。キーを消さずに `"0"` で上書きできる |
| 公式（env-vars・plugins/loading、2026-09-28 取得）は、`FORCE_AUTOUPDATE_PLUGINS=1` を置くと、`DISABLE_AUTOUPDATER`・`DISABLE_UPDATES`・`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` で自動更新が止まっていても、プラグインの自動更新だけは走ると書く。settings の `env.FORCE_AUTOUPDATE_PLUGINS` は hook プロセスまで値が届く。プラグインの自動更新が実際に走るかは**未検証** | 本体の自動更新を抑止している端末で、プラグインの更新だけを生かせるかを考えるとき |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` は公開された環境変数で、自動圧縮が走る点を auto-compact window に対する 1〜100 の割合で指定する。低いほど早く圧縮し、既定より高い値は無視される（閾値を上げる向きには使えない）。auto-compact window はモデルで異なるため、発火する絶対トークン数もモデルで異なる。効くのはコンテキストの上限に達する前に圧縮するセッションだけ（公式ドキュメント env-vars / model-config、2026-09 確認。実測ではない） | 自動圧縮を早める設定の効き目を見積もるとき |
| 外部から `export CLAUDE_PLUGIN_DATA=...` しても **Claude Code は無視する**。実際のプラグインのデータ領域は、Claude Code が自前で計算する `$CLAUDE_CONFIG_DIR/plugins/data/<plugin>-<marketplace>/` に固定される | hook を手動実行するときと `claude` に実行させるときとで、状態ディレクトリが別物になりうる。検証手順は実際に使われるパスを毎回計算し直す |
| macOS で `HOME` を差し替えて `claude` を起動すると、`Login successful` の直後に `Not logged in` が出て認証が壊れる。macOS の Security フレームワークが login Keychain を `$HOME/Library/Keychains/login.keychain-db` で解決するため、`HOME` を差し替えると認証情報が入った本来の Keychain に届かない | 隔離環境を作るとき |
| macOS で `CLAUDE_CONFIG_DIR` を設定してログインすると、キーチェーンに `Claude Code-credentials-<8 桁>` の項目ができる。8 桁は `CLAUDE_CONFIG_DIR` に渡した文字列そのものの SHA-256 の先頭 8 桁で、パスを正規化しない（`/var/...` と `/private/var/...` は別の項目になる）。config ディレクトリを消しても項目は残り、`security delete-generic-password -s` で消せる（Claude Code 2.1.283・macOS） | 隔離環境を片付けるとき |
| `claude plugin marketplace add` は bare リポジトリを直接指すと失敗するが、http(s) の git URL なら通る。http の git URL は末尾に `.git` が要り、無いと marketplace.json の URL と解釈して 404 になる（2.1.282） | ローカルの git リポジトリをマーケットプレイスとして登録するとき |
| マーケットプレイスを remove してから add し直すと `plugins/data/` が空になり、プラグインが置いた状態が消える。`claude plugin marketplace remove` は `settings.json` の `extraKnownMarketplaces.<name>` を、後から足されたキー（`autoUpdate` など）ごと消す。`add` し直すと `source` だけの項目ができる（2.1.283） | 登録をやり直す手順を書くとき。データを残したいなら remove を避ける |
| マーケットプレイスを `#<ref>` 付きで登録すると `settings.json` の `source.ref` に入り、`ref` を付けている間は 2 段階の更新（`claude plugin marketplace update` → `claude plugin update`）が `ref` の先端の版を入れる。既定ブランチの版は拾わない（2.1.282） | ref 付きで導入した環境の版の見積もりをするとき |
| `claude plugin update` は、計算した版が `installed_plugins.json` の記録と同じなら入れ替えない。版は `plugin.json` の `version` が最優先で、無ければマーケットプレイスの項目の `version`、それも無ければソースのコミット SHA などから決まる（公式 plugins/loading、2026-09-28 取得）。`version` を固定していると、中身が変わっても `already at the latest version` と答える（2.1.283）。版が下がる向きにも入れ替える（2.1.282・2.1.283）。`uninstall` → `install` なら同じ版でも入れ直す（2.1.283） | ref を外す・切り替えるときに、端末の版が意図せず下がりうることを見積もるとき。`version` を固定したまま中身だけ変えても端末に届かない |
| 無人の対話起動（pty 越し）は、初回起動時の対話 3 段（テーマ選択・フォルダ信頼・API キー確認）で止まる。`.claude.json` に `hasCompletedOnboarding` / `theme` / `projects["<cwd>"].hasTrustDialogAccepted`（`<cwd>` は realpath で書く。macOS の `/tmp` は `/private/tmp` に解決される）を事前投入すると前の 2 段は越えられるが、API キー確認の段は pty へのキー送信が要り、事前投入だけでは越えられない。`claude -p` は対話起動ではないため、この 3 段自体を踏まず事前投入なしで動く | 無人でセッションを起動する検証を組むとき。越えられる段と越えられない段を混同しない |

## settings.json の読み込み

| 事実 | いつ効くか |
| --- | --- |
| 本体は、次の `settings.json` をファイルごと黙って無視する: JSON として壊れている・空・トップが配列か `null`・スキーマ違反のキーが 1 つでもある（`env` が文字列、`cleanupPeriodDays` が文字列、`autoUpdatesChannel` が `latest`・`stable`・`rc` 以外、`minimumVersion` の型違いなど。ただし `hooks` の型違いではファイルは無視されなかった）・約 2 MiB を超える（2,097,142 バイトは読み、2,097,162 バイトは読まない）。同じファイルの正しいキー（`enabledPlugins`・`hooks`・`env`）も効かないので、そこで有効化したプラグインは読み込まれず hook も動かない。`claude -p` の stderr・stream-json・終了コードには何も出ず、`claude doctor` の `Invalid settings` にだけファイルとキーが名指しで出る。無視したファイルを本体は書き換えない（2.1.283、隔離環境の `claude -p`）。公式（settings、2026-09-28 取得）は、このようなファイル（Settings Error）について、対話起動の開始時にダイアログを出し、修正・終了・壊れた設定を除いた続行を選ばせると書く（対話起動は未検証）。公式は別に、権限ルールの書式違いや未知の hook イベント名のように項目単位で失敗するもの（Settings Warning）は、その値だけを捨てて残りを効かせると書く | `settings.json` に値を書くとき。型や列挙値を 1 つ誤ると、そのファイルに依る設定とプラグインが全部止まる。止まるかはキーによる |
| 本体は BOM 付き・非 UTF-8（Latin-1）の `settings.json` を読む。`extraKnownMarketplaces` が配列でも読む（2.1.283） | 同じファイルを厳格な JSON パーサで読むと、本体と解釈が食い違う |
| schemastore の Claude Code の settings のスキーマと、本体の検証は一致しない。`env` の値に整数（`60`）を置くと、本体は受け付け（ファイルは無視されない）、schemastore のスキーマは拒否する（2.1.283、スキーマは 2026-09-25 取得。逆向き（schemastore が通し本体が捨てる値）は未確認） | schemastore のスキーマで本体の検証を代用するとき |

## hook の実行環境

| 事実 | いつ効くか |
| --- | --- |
| 公式ドキュメント（plugins-reference、2026-09）は、hook の `command` の中の `${...}` を Claude Code がその場で置換し、同じ値を環境変数としても渡すと書く。2.1.278 では、単引用符で囲んだ `${CLAUDE_PLUGIN_DATA}` がリテラルのまま届き、二重引用符の `${CLAUDE_PLUGIN_ROOT}` は展開された | コマンド文字列の変数は**二重引用符**で囲む（公式も同じく推奨する）。パスに空白が入りうる |
| **起動モードでキーの有無が変わる。** `claude -p` では `permission_mode` が既定で `default`（`SessionStart` では `None`）。`--permission-mode auto` を付けると `auto` が届く（2.1.283） | 非対話での検証結果を対話セッションの結論にしない。どのキーも「必ずある」前提で設計しない |
| 子プロセスには **親の Claude Code セッションの環境変数が引き継がれる**（`CLAUDECODE` / `CLAUDE_CODE_SESSION_ID` / `settings.json` の `env` 由来の値など） | 検証するときは `env -u …` で外す。外さないと対照群が壊れる |
| **失敗したスキル呼出では `PreToolUse` / `PostToolUse` が発火しない**（存在しないスキル名で確認）。モデルにはツールエラーが返っている | 存在しないスキル名の呼出は、ツール系 hook の件数には現れない |
| `CLAUDE_CODE_ENTRYPOINT` は対話起動で `cli`、`claude -p` で `sdk-cli`（`--output-format stream-json` でも同じ）。親プロセスから `cli` を継承した状態で `claude -p` を起動しても `sdk-cli` に上書きされる。**未文書化**（`hooks` / `env-vars` の公式ページに記載が無い）。公式ドキュメント（monitoring-usage）の OTEL 属性 `app.entrypoint` の例には `cli` / `sdk-cli` / `sdk-ts` / `sdk-py` / `claude-vscode` などが挙がる（2.1.281 実測 + 公式ドキュメント）。`claude -p` が `sdk-cli` に書き換えるのは、継承した値が `cli` か空のときだけで、`sdk-ts`・`sdk-py`・`claude-vscode`・未知の値はそのまま hook に届く。`--input-format stream-json` の起動でも `sdk-cli` になる（2.1.283） | 起動形態を hook 側で判定するとき。未文書化のため名前・値は上流の都合で変わりうる |
| `claude -p` では `SessionStart` の `systemMessage` が、プレーン出力にも `--output-format json` の標準出力にも現れない。`--output-format stream-json --verbose` では `type:"system"`・`subtype:"hook_response"` の `output` に入る（2.1.281、ログイン済みで実測。2.1.282 では未ログインでも同じく入る） | 非対話の出力を機械処理するスクリプトへの影響を見積もるとき。お知らせが毎回出ても、プレーンと `json` の出力は汚れない |
| 対話起動では `SessionStart` の `systemMessage` が `SessionStart:<source> says: ` の接頭辞つきで表示され、複数行でも接頭辞は 1 行目だけに付く。長い文面はファイルへ退避され、先頭のプレビューとパスだけが表示される。退避の境界は字種で異なる（隔離環境で文字数を変えて目視） | hook から人に見せる文面の長さを決めるとき |
| 未ログインでも `SessionStart` hook（プラグインの hook を含む）は発火し、その後に `Login expired` で終了する（2.1.281）。未ログインの `claude -p` では、`SessionStart` の後に `UserPromptSubmit` も発火する（2.1.282）。`Stop` は発火しない（2.1.283） | hook の挙動だけを確かめたいとき。ログインしなくても観測でき、発火するのは `SessionStart` だけとは限らない |
| hook stdin の `effort`（`effort.level`）は、モデルが effort に対応するときだけ届く。`claude -p --model sonnet` では既定で `high`、`--effort low` で `low`。`--model haiku`（実体は `claude-haiku-4-5-20251001`）では `--effort` を付けても無い（2.1.282、Anthropic API の認証で実測） | `effort` が届かないとき、上流の変更とモデルの違いを取り違えないため |
| `claude -p` でも、`--continue` と `/compact` で `PreCompact`（`trigger` は `manual`）が発火する。`--continue` の起動では `SessionStart` の `source` が `resume`、圧縮の後にもう一度 `compact` で発火する（2.1.282） | 非対話で圧縮系の hook を起こすとき |
| 許可されたディレクトリの外を触る Bash は権限で拒否され、`PostToolUseFailure` は発火しない。作業ディレクトリ内で失敗したコマンドは `PostToolUseFailure`（`is_interrupt` は `false`）になる（2.1.282、`claude -p`） | ツールの失敗を意図して起こすとき |
| `/login` は OAuth の認可 URL を、`PATH` 上の `open` で開く（2.1.281、macOS） | `PATH` に偽の `open` を置いて hook のブラウザ起動を数えるとき。ログインの分も記録されるので、URL で区別する |
| `SessionStart` の標準入力には `-p` かどうかを示すキーが無く、`source` は対話・`-p` のどちらも `startup` になる。hook の標準入出力は対話起動でも端末に接続されていない（`isatty` では対話かどうかを判別できない）（2.1.281） | stdin の内容や `isatty` で対話起動を判定しようとしたとき。どちらも根拠にならない |
| hook の `command` に書いた `python3` は、利用者の `PATH` で解決される。pyenv などのシムに当たると、起動のたびにシム自身の処理が乗る（2.1.283、pyenv 2.6.13 で観測） | hook の遅さを調べるとき。hook の処理より `python3` の起動の仕方が効くことがある |
| hook が `timeout` を超えると、本体は待つのをやめる。`--output-format stream-json --verbose` の `hook_response` に `outcome: "cancelled"`・`exit_code: 1` が出る。hook のプロセスは最後まで走り、副作用（ファイルの書き込み）を残すことがある。stream-json に `hook_response` が出るのは `SessionStart` の hook だけ（2.1.283） | 打ち切りを検出するとき。`cancelled` の数は「処理されなかった数」ではない。`SessionStart` 以外の打ち切りは stream-json では見えない |

## transcript

| 事実 | いつ効くか |
| --- | --- |
| 公式ドキュメント（hooks の Common input fields）は、transcript は非同期に書かれ、hook の発火時点では現在のターンの最新のメッセージを含まないことがある、と書く。`claude -p` の `Stop` では最新の応答まで書かれていた（実測） | 対話セッションで `Stop` のコンテキストトークン数を読むとき。1 ターン遅れうる |
| `message.usage` の 3 値がすべて 0 の行が実在する（`isApiErrorMessage: true` の `assistant` 行） | 合計 0 を値として扱うと、API エラー応答がコンテキストトークン数に混ざる |
| transcript の `user`・`assistant`・`attachment`・`system` の行には、本体の版を示す文字列の `version`（例 `"2.1.283"`）が付く。`queue-operation`・`last-prompt` などの行には無い。hook の標準入力（`SessionStart`・`UserPromptSubmit`・`Stop`）と hook の環境変数には版を示すものが無い（2.1.283、`claude -p`） | hook から本体の版を得たいとき。transcript の形は公式の契約ではない |
| `claude -p` のプロンプトとツールの入出力は、config ディレクトリの中では `projects/<cwd を変換した名前>/` の transcript にだけ現れた（2.1.282、隔離した config で全ファイルを走査） | 本文が残る場所を調べるとき。transcript の置き場は本体の管理下にある |
| 1 つの応答（同じ `message.id`）が content ブロック（thinking・tool_use・text）ごとに別の行に分かれ、各行に同じ `message.usage` が重複して載る。行ごとに足すと過大になり、`message.id` で重複を除くと `-p` の `result.usage` と一致した（2.1.287、`claude -p`） | transcript からトークン数を合計するとき |
| サブエージェントの応答は本体の transcript に無く、同じディレクトリの `<session_id>/subagents/agent-*.jsonl`（と `.meta.json`）に別に書かれる（2.1.287、`claude -p`） | サブエージェントの分まで transcript から数えるとき |

## Mods（関数フック）

認証は Claude.ai。「隔離環境」とある行は、`CLAUDE_CONFIG_DIR` で隔離した未ログインの config での観測。

| 事実 | いつ効くか |
| --- | --- |
| `--plugin-dir` で読んだ mod は ID が `<name>@inline`、tier が `user` になり、本体が mod のディレクトリ直下に `tsconfig.json` と `.claude-plugin/types/`（型定義）を書く。マーケットプレイスから導入した mod は ID が `<plugin>@<marketplace>`、tier が `user` で、型定義も `tsconfig.json` も書かれない。mod の TypeScript は本体がそのまま実行し、ビルドも npm の依存も要らない（`claude-code` モジュールの import だけで動いた）（2.1.287） | mod を開発するとき。開発中の読み込みだけが作業ツリーにファイルを書く |
| 対話起動では、フォルダ信頼を承認するまで mod は読み込まれない（debug に `hooks modules not loaded until workspace trust is accepted`）（2.1.287） | 無人の対話起動で mod が動かないとき |
| 利用者が書ける設定（`--settings` で確認）の `disableAllHooks: true` で、組み込みの mod（`cc-plugin-agents-md@builtin`・`cc-plugin-telemetry@builtin` など、tier `builtin`）以外は読み込まれない。その mod のスラッシュコマンドも消え、入力はそのままモデルに渡る（2.1.287、`-p`） | 利用者が mod を止められる範囲を見積もるとき |
| `userConfig` の値は settings の `pluginConfigs["<キー>"].options` から読む。キーは `--plugin-dir` では `<name>` か `<name>@inline`、マーケットプレイス導入では `<plugin>@<marketplace>` で、導入した mod は `<name>` だけのキーを読まない。読むのは user・`--settings`・managed の settings で、project settings は読まない（debug の文言）（2.1.287） | 設定値を mod に渡すとき |
| 利用者の `settings.json` の `prependPlugins` に導入済みの ID を書くだけで、その mod は tier `prepend` で読み込まれる。組み込みのガード `cc-plugin-sec-default@builtin` は、そこに書いても managed settings が無く Team・Enterprise の組織でもなければ読み込まれない（2.1.287、隔離環境、managed settings 無し） | mod の優先順位を考えるとき。prepend は利用者が自分で書ける |
| `next.to(e, 'append')` を使う mod は、tier が prepend・append でなければ読み込み自体が失敗する（debug にだけ出る）。呼ぶと下の tier（user）の mod を飛ばして先へ進むが、同じ tier の後続の mod は飛ばさない（2.1.287、隔離環境） | 上の tier から下の mod を迂回させるとき。同じ tier の mod には効かない |
| `plugin.register` で他の mod の読み込みを `{ refuse }` で拒否できるのは、それより先に読み込まれた mod だけ（`prependPlugins` の並びで前にあるもの）。判定には本体が走査した `e.uses.events`（購読イベント）を使える。debug では、拒否の行より前に拒否される mod の `loaded` の行が出る（そのモジュールのコードが評価されるかは未検証）（2.1.287、隔離環境） | 他の mod を締め出すとき |
| tier `user` の mod が `classic.<Event>` に `next` を呼ばずに答えると、その dispatch では下の command hook（プラグイン・利用者の `settings.json`・`--settings` のすべて）が走らない。プラグインの command hook では SessionStart・UserPromptExpansion・UserPromptSubmit・PreToolUse・PostToolUse・PostToolUseFailure・Stop・PreCompact・SessionEnd で確認し、settings の hook では UserPromptSubmit・PostToolUse・Stop で確認した。画面・標準エラーには何も出ず、debug にだけ `answered classic.<Event> without next()` が残る。ツールの実行と compact 自体は止まらない。本体の型定義は、managed settings の hook が mod より上にあると書く（managed は未検証）（2.1.287、`-p`） | command hook の発火を前提にするとき。利用者の mod 1 つで無言に止まりうる |
| mod が本文（`prompt`・`tool_name`・`tool_response`・`last_assistant_message` など）を書き換えて `next` に渡すと、下の command hook の stdin にはその値が届く。エンベロープ（`session_id`）の書き換えは本体が拒否し、その mod の hook だけを飛ばして下を本物の入力で走らせる（2.1.287、`-p`） | command hook が受け取る本文を信頼するとき |
| hook が例外を投げると、その hook は飛ばされて下が代わりに走る（`classic.Stop`・`plugin.register` で確認）。`plugin.register` の判定中の例外は拒否にならず、相手の mod は読み込まれる。`.catch` か try/catch で答えを決めれば拒否側に倒せる。`claude plugin validate` は `.catch` の有無を見ない（2.1.287） | 拒否や判定を書くとき。例外は既定で通す側に倒れる |
| `$.http.fetch` は接続できないと例外を投げ、`ok: false` を返さない。例外の文言に URL が入る。捕まえないと hook が飛ばされ、`-p` では標準エラーに `<mod>: <event> hook skipped: threw …` が出る。`command.run` が飛ばされると応答は `registered /<cmd> but no command.run hook answered it` になる。送信の失敗は debug に error 行を残さない。`-p` では localhost と外部の https への fetch が許可確認なしで通った（2.1.287） | mod から送信するとき。失敗を捕まえないと標準エラーが汚れ、原因を取り違える文言が出る |
| `$.store` の保存先は `~/.claude/plugins/store/<plugin>_<source>-<hash>.json`（`<source>` は `inline` かマーケットプレイス名、`<hash>` は `sha256("<plugin>@<source>")` の先頭 12 桁と一致）で、利用者ごとに 1 ファイル（プロジェクト別・セッション別ではない）。値はプロセスを跨いで残る。2 つのプロセスが同じキーに get → set を並行させると、片方の更新がほぼすべて失われた。キーをプロセスごとに分けると両方残った（2.1.287、`-p`） | 並行セッションから同じキーに書くとき |
| `turn.complete` の `e.usage` は 1 ターン内の API 呼び出しの合計で、`-p` の `result.usage` と一致する。サブエージェントのターンでも `e.agentId` 付きで発火し、メインのターンの値にサブエージェントの分は入らない。`-p` の `result.usage` もサブエージェントの分を含まず、`modelUsage` は含む。バックグラウンドで起動したサブエージェントが終わると、その通知でメインのターンがもう 1 回走り、`turn.complete` が追加で発火する（2.1.287、`-p`） | mod でトークン数を数えるとき。サブエージェントのターンを除くと過少になる |
| `--plugin-dir` の mod はファイルの保存で読み直される。モジュール変数は初期化され、`$.state`・`$.store` は残る。読み直しのたびに `session.start` が再び発火し、旧版の `session.end` は呼ばれない。構文エラーなら前の版が動き続け、画面に失敗が出る。`hooks.json` の変更も読み直される（2.1.287、対話） | mod を開発するとき。集計をモジュール変数に置くと読み直しで消える |
| `-p` では `$.ui.toast`・`$.ui.status` は表示されず、`ui.render` は呼ばれない。対話では toast が画面右上に既定 4 秒（`timeoutMs`）出て、`$.ui.status` は mod が装飾を指定しなくても行頭に `⚠` が付き黄色で描かれる（2.1.287） | mod の画面表示を設計するとき |
| mod が答えたスラッシュコマンドは `prompt.submit` に数えられず、モデルも呼ばない（`-p` で `num_turns` 0・費用 0）。`tool.call` で mod が拒否すると、ツールの結果は `is_error` で返り、`-p` の `permission_denials` には数えられない（2.1.287） | 利用回数や拒否の件数を数えるとき |
