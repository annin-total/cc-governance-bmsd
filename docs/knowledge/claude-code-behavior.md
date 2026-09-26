# Claude Code の挙動

拡張や検証のときに知っていると手戻りが減る、上流の振る舞い。
macOS での実測。確かめた版は各行に添える。版の無い行は記録が無い（観測は 2026-09、同時期の版は 2.1.278〜2.1.283）。

## プラグインの配置と更新

| 事実 | いつ効くか |
| --- | --- |
| アンインストールすると `plugins/data/<plugin>-<marketplace>/` は配下ごと消えるが、**`plugins/cache/<marketplace>/<plugin>/<version>/` は残る**（`.in_use` / `.orphaned_at` マーカー付き）。状態の残骸という観点で保証があるのは `data/` の削除だけ | 端末の掃除手順を書くとき。再導入で古い版が残っていても異常ではない |
| `hooks.json` を読むのは **Claude Code 本体**であり、変更は**セッションを開き直すまで効かない**。一方、プラグインの hook が実行時に読むファイルは**次のツール実行から即時に効く** | プラグインの変更が端末に効くタイミングの見積もり。hook の追加・削除だけは利用者の再起動を待つ |
| `directory`（ローカルパス）ソースのマーケットプレイスでは、`CLAUDE_PLUGIN_ROOT` が **`cache/` の複製ではなく元のディレクトリ**を指す。cache 側を編集しても何も起きない。このとき `claude plugin list` と `installed_plugins.json` の `installPath` は cache 配下を示したままで、実際に動く場所と一致しない（2.1.282）。git リモート（http で配信）ソースでは `plugins/cache/<marketplace>/<plugin>/<version>/` を指した（2.1.278） | ローカル開発で「直したのに反映されない」と迷ったとき |
| 初回導入は、`settings.json` に `extraKnownMarketplaces` / `enabledPlugins` を書いて起動を繰り返すだけでは完了しない場合がある（`temp_git_…_clone` が残って進まない状態を隔離環境で 2 例）。`claude plugin marketplace add` と `claude plugin install` の明示実行で完了した | 導入手順を書くとき。**導入が完了したことを確認する手段**を手順に含める必要がある |
| 自動更新でマーケットプレイスの clone が新版に進むまでの所要は一定しない。同じ条件に見える別の隔離環境（git source + 自前の HTTP サーバ）では、セッションを重ねても一度も進まなかった。固定値かどうか、条件差の原因は**未検証** | 展開の所要時間を見積もるとき |
| 隔離 HOME（未ログイン）では、35 分放置しても自動の更新チェックが 1 度も走らなかった（git サーバのアクセスログにフェッチ 0 件）。実環境（ログイン済み）では走った。**未ログインだと走らない**という説明は素直だが**未検証** | **隔離 HOME では背景ジョブに依存する検証ができない。** 自動更新まわりは実環境でしか確かめられない |
| `claude plugin marketplace add <url> --scope user` は利用者の `settings.json` に `extraKnownMarketplaces.<name>.source` を書き、`claude plugin install <id> --scope user` は `enabledPlugins.<id>: true` を書く（2.1.282・隔離環境で観測） | `extraKnownMarketplaces` の項目が在る前提で設定を書くとき |
| マーケットプレイスの `autoUpdate` は `settings.json` の `extraKnownMarketplaces.<name>.autoUpdate` が権威であり、セッション開始時に `plugins/known_marketplaces.json` へ上書き同期される。社外のマーケットプレイスは既定で無効（git リモートから導入した直後、どちらのファイルにもキーが無い）（2026-09 確認。2.1.282 の隔離環境では、`SessionStart` hook が `settings.json` に書いた値は、そのセッションの終了後の `known_marketplaces.json` には無く、次のセッション開始後に現れた） | 自動更新を有効にしたいとき。`known_marketplaces.json` を書き換えても次の起動で戻る |
| 手動更新は 2 段階である。`claude plugin marketplace update` はカタログだけを更新し、導入済みプラグインの版は `claude plugin update` で上がる。更新が降りても反映は次に起動したセッションから。`source` に到達できなくても端末の複製で動き続け、止まるのは更新だけ | 更新手順を書くとき。版が上がらないと迷ったとき |
| `env` ブロックも普通のキーとして設定の優先順位（managed > `--settings` > プロジェクトの local > プロジェクトの共有 > 利用者）に従う。シェルで export した値は settings の `env` に負ける。hook プロセスの環境変数には合成後の実効値が入る（2.1.282 実測 + 公式ドキュメント settings / env-vars） | 利用者の `settings.json` の値は実効値とは限らない。上位の層の上書きはその値に現れない |
| `env.FORCE_AUTOUPDATE_PLUGINS` は hook プロセスまで値が届く。ただし**本体の入れ替えを起こす効果は観測できていない** | 本体の自動更新を抑止している端末で、プラグインの更新だけを生かせるかを考えるとき |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` は公開された環境変数で、自動圧縮が走る点を auto-compact window に対する 1〜100 の割合で指定する。低いほど早く圧縮し、既定より高い値は無視される（閾値を上げる向きには使えない）。auto-compact window はモデルで異なるため、発火する絶対トークン数もモデルで異なる。効くのはコンテキストの上限に達する前に圧縮するセッションだけ（公式ドキュメント env-vars / model-config、2026-09 確認。実測ではない） | 自動圧縮を早める設定の効き目を見積もるとき |
| 外部から `export CLAUDE_PLUGIN_DATA=...` しても **Claude Code は無視する**。実際のプラグインのデータ領域は、Claude Code が自前で計算する `$CLAUDE_CONFIG_DIR/plugins/data/<plugin>-<marketplace>/` に固定される | hook を手動実行するときと `claude` に実行させるときとで、状態ディレクトリが別物になりうる。検証手順は実際に使われるパスを毎回計算し直す |
| macOS で `HOME` を差し替えて `claude` を起動すると、`Login successful` の直後に `Not logged in` が出て認証が壊れる。macOS の Security フレームワークが login Keychain を `$HOME/Library/Keychains/login.keychain-db` で解決するため、`HOME` を差し替えると認証情報が入った本来の Keychain に届かない | 隔離環境を作るとき |
| macOS で `CLAUDE_CONFIG_DIR` を設定してログインすると、キーチェーンに `Claude Code-credentials-<8 桁>` の項目ができる。8 桁は `CLAUDE_CONFIG_DIR` に渡した文字列そのものの SHA-256 の先頭 8 桁で、パスを正規化しない（`/var/...` と `/private/var/...` は別の項目になる）。config ディレクトリを消しても項目は残り、`security delete-generic-password -s` で消せる（Claude Code 2.1.283・macOS） | 隔離環境を片付けるとき |
| `claude plugin marketplace add` は bare リポジトリを直接指すと失敗するが、http(s) の git URL なら通る | ローカルの git リポジトリをマーケットプレイスとして登録するとき |
| マーケットプレイスを remove してから add し直すと `plugins/data/` が空になり、プラグインが置いた状態が消える | 登録をやり直す手順を書くとき。データを残したいなら remove を避ける |
| マーケットプレイスを `#<ref>` 付きで登録すると `settings.json` の `source.ref` に入り、`ref` を付けている間は 2 段階の更新（`claude plugin marketplace update` → `claude plugin update`）が `ref` の先端の版を入れる。既定ブランチの版は拾わない（2.1.282） | ref 付きで導入した環境の版の見積もりをするとき |
| `claude plugin update` は版が下がる向きにも入れ替える（2.1.282） | ref を外す・切り替えるときに、端末の版が意図せず下がりうることを見積もるとき |
| 無人の対話起動（pty 越し）は、初回起動時の対話 3 段（テーマ選択・フォルダ信頼・API キー確認）で止まる。`.claude.json` に `hasCompletedOnboarding` / `theme` / `projects["<cwd>"].hasTrustDialogAccepted`（`<cwd>` は realpath で書く。macOS の `/tmp` は `/private/tmp` に解決される）を事前投入すると前の 2 段は越えられるが、API キー確認の段は pty へのキー送信が要り、事前投入だけでは越えられない。`claude -p` は対話起動ではないため、この 3 段自体を踏まず事前投入なしで動く | 無人でセッションを起動する検証を組むとき。越えられる段と越えられない段を混同しない |

## hook の実行環境

| 事実 | いつ効くか |
| --- | --- |
| 公式ドキュメント（plugins-reference、2026-09）は、hook の `command` の中の `${...}` を Claude Code がその場で置換し、同じ値を環境変数としても渡すと書く。2.1.278 では、単引用符で囲んだ `${CLAUDE_PLUGIN_DATA}` がリテラルのまま届き、二重引用符の `${CLAUDE_PLUGIN_ROOT}` は展開された | コマンド文字列の変数は**二重引用符**で囲む（公式も同じく推奨する）。パスに空白が入りうる |
| **起動モードでキーの有無が変わる。** `claude -p` では `permission_mode` が `default`（`SessionStart` では `None`） | 非対話での検証結果を対話セッションの結論にしない。どのキーも「必ずある」前提で設計しない |
| 子プロセスには **親の Claude Code セッションの環境変数が引き継がれる**（`CLAUDECODE` / `CLAUDE_CODE_SESSION_ID` / `settings.json` の `env` 由来の値など） | 検証するときは `env -u …` で外す。外さないと対照群が壊れる |
| **失敗したスキル呼出では `PreToolUse` / `PostToolUse` が発火しない**（存在しないスキル名で確認）。モデルにはツールエラーが返っている | 存在しないスキル名の呼出は、ツール系 hook の件数には現れない |
| macOS の `webbrowser.open` は osascript の完了を**同期的に待つ**ため、秒単位でブロックする。`subprocess.Popen(["open", url])` なら待たない | hook からブラウザを開く機能を足すとき。デタッチ起動にすれば起動は遅れない（戻り値で成否は判定できなくなる） |
| 1 メッセージ内で多数のツールを並列実行しても、hook のプロセスの同時数は数本にとどまり、取りこぼしは無かった | 並列実行が hook を詰まらせるかを心配するとき |
| `CLAUDE_CODE_ENTRYPOINT` は対話起動で `cli`、`claude -p` で `sdk-cli`（`--output-format stream-json` でも同じ）。親プロセスから `cli` を継承した状態で `claude -p` を起動しても `sdk-cli` に上書きされる。**未文書化**（`hooks` / `env-vars` の公式ページに記載が無い）。公式ドキュメント（monitoring-usage）の OTEL 属性 `app.entrypoint` の例には `cli` / `sdk-cli` / `sdk-ts` / `sdk-py` / `claude-vscode` などが挙がる（2.1.281 実測 + 公式ドキュメント） | 起動形態を hook 側で判定するとき。未文書化のため名前・値は上流の都合で変わりうる |
| `claude -p` では `SessionStart` の `systemMessage` が、プレーン出力にも `--output-format json` の標準出力にも現れない。`--output-format stream-json --verbose` では `type:"system"`・`subtype:"hook_response"` の `output` に入る（2.1.281、ログイン済みで実測。2.1.282 では未ログインでも同じく入る） | 非対話の出力を機械処理するスクリプトへの影響を見積もるとき。お知らせが毎回出ても、プレーンと `json` の出力は汚れない |
| 対話起動では `SessionStart` の `systemMessage` が `SessionStart:<source> says: ` の接頭辞つきで表示され、複数行でも接頭辞は 1 行目だけに付く。長い文面はファイルへ退避され、先頭のプレビューとパスだけが表示される。退避の境界は字種で異なる（隔離環境で文字数を変えて目視） | hook から人に見せる文面の長さを決めるとき |
| 未ログインでも `SessionStart` hook（プラグインの hook を含む）は発火し、その後に `Login expired` で終了する（2.1.281）。未ログインの `claude -p` では、`SessionStart` の後に `UserPromptSubmit` も発火する（2.1.282） | hook の挙動だけを確かめたいとき。ログインしなくても観測でき、発火するのは `SessionStart` だけとは限らない |
| hook stdin の `effort`（`effort.level`）は、モデルが effort に対応するときだけ届く。`claude -p --model sonnet` では既定で `high`、`--effort low` で `low`。`--model haiku`（実体は `claude-haiku-4-5-20251001`）では `--effort` を付けても無い（2.1.282、Anthropic API の認証で実測） | `effort` が届かないとき、上流の変更とモデルの違いを取り違えないため |
| `claude -p` でも、`--continue` と `/compact` で `PreCompact`（`trigger` は `manual`）が発火する。`--continue` の起動では `SessionStart` の `source` が `resume`、圧縮の後にもう一度 `compact` で発火する（2.1.282） | 非対話で圧縮系の hook を起こすとき |
| 許可されたディレクトリの外を触る Bash は権限で拒否され、`PostToolUseFailure` は発火しない。作業ディレクトリ内で失敗したコマンドは `PostToolUseFailure`（`is_interrupt` は `false`）になる（2.1.282、`claude -p`） | ツールの失敗を意図して起こすとき |
| `/login` は OAuth の認可 URL を、`PATH` 上の `open` で開く（2.1.281、macOS） | `PATH` に偽の `open` を置いて hook のブラウザ起動を数えるとき。ログインの分も記録されるので、URL で区別する |
| `SessionStart` の標準入力には `-p` かどうかを示すキーが無く、`source` は対話・`-p` のどちらも `startup` になる。hook の標準入出力は対話起動でも端末に接続されていない（`isatty` では対話かどうかを判別できない）（2.1.281） | stdin の内容や `isatty` で対話起動を判定しようとしたとき。どちらも根拠にならない |

## transcript

| 事実 | いつ効くか |
| --- | --- |
| 公式ドキュメント（hooks の Common input fields）は、transcript は非同期に書かれ、hook の発火時点では現在のターンの最新のメッセージを含まないことがある、と書く。`claude -p` の `Stop` では最新の応答まで書かれていた（実測） | 対話セッションで `Stop` の文脈量を読むとき。1 ターン遅れうる |
| `message.usage` の 3 値がすべて 0 の行が実在する（`isApiErrorMessage: true` の `assistant` 行） | 合計 0 を値として扱うと、API エラー応答が文脈量に混ざる |
| `claude -p` のプロンプトとツールの入出力は、config ディレクトリの中では `projects/<cwd を変換した名前>/` の transcript にだけ現れた（2.1.282、隔離した config で全ファイルを走査） | 本文が残る場所を調べるとき。transcript の置き場は本体の管理下にある |
