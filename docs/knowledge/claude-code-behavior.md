# Claude Code の挙動

拡張や検証のときに知っていると手戻りが減る、上流の振る舞い。
断りのない限り Claude Code 2.1.278 / macOS での実測。

## プラグインの配置と更新

| 事実 | いつ効くか |
| --- | --- |
| アンインストールすると `plugins/data/<plugin>-<marketplace>/` は配下ごと消えるが、**`plugins/cache/<marketplace>/<plugin>/<version>/` は残る**（`.in_use` / `.orphaned_at` マーカー付き）。状態の残骸という観点で保証があるのは `data/` の削除だけ | 端末の掃除手順を書くとき。再導入で古い版が残っていても異常ではない |
| `hooks.json` を読むのは **Claude Code 本体**であり、変更は**セッションを開き直すまで効かない**。一方、プラグインの hook が実行時に読むファイルは**次のツール実行から即時に効く** | プラグインの変更が端末に効くタイミングの見積もり。hook の追加・削除だけは利用者の再起動を待つ |
| `directory`（ローカルパス）ソースのマーケットプレイスでは、`CLAUDE_PLUGIN_ROOT` が **`cache/` の複製ではなく元のディレクトリ**を指す。cache 側を編集しても何も起きない | ローカル開発で「直したのに反映されない」と迷ったとき。git リモート由来では `cache/` 配下を指すと見られる（**推測・未検証**） |
| 初回導入は、`settings.json` に `extraKnownMarketplaces` / `enabledPlugins` を書いて起動を繰り返すだけでは完了しない場合がある（`temp_git_…_clone` が残って進まない状態を隔離環境で 2 例）。`claude plugin marketplace add` と `claude plugin install` の明示実行で完了した | 導入手順を書くとき。**導入が完了したことを確認する手段**を手順に含める必要がある |
| 自動更新でマーケットプレイスの clone が新版に進むまで、実環境で **15 分 23 秒**かかった（観測 1 回）。固定値か初回だけかは**未検証** | 展開の所要時間を見積もるとき |
| 隔離 HOME（未ログイン）では、35 分放置しても自動の更新チェックが 1 度も走らなかった（git サーバのアクセスログにフェッチ 0 件）。実環境（ログイン済み）では走った。**未ログインだと走らない**という説明は素直だが**未検証** | **隔離 HOME では背景ジョブに依存する検証ができない。** 自動更新まわりは実環境でしか確かめられない |
| `managed-settings.json`（管理者が配る層）の設定は、利用者の `settings.json` より優先される | 端末側の設定が上位の設定に負けて効かないことがある |
| `env.FORCE_AUTOUPDATE_PLUGINS` は hook プロセスまで値が届く。ただし**本体の入れ替えを起こす効果は観測できていない** | 本体の自動更新を抑止している端末で、プラグインの更新だけを生かせるかを考えるとき |
| 外部から `export CLAUDE_PLUGIN_DATA=...` しても **Claude Code は無視する**。実際のプラグインのデータ領域は、Claude Code が自前で計算する `$CLAUDE_CONFIG_DIR/plugins/data/<plugin>-<marketplace>/` に固定される | hook を手動実行するときと `claude` に実行させるときとで、状態ディレクトリが別物になりうる。検証手順は実際に使われるパスを毎回計算し直す |

## hook の実行環境

| 事実 | いつ効くか |
| --- | --- |
| `hooks.json` のコマンド文字列を展開しているのは **Claude Code ではなくシェル**。単引用符で囲んだ `${CLAUDE_PLUGIN_DATA}` はリテラルのまま届き、二重引用符の `${CLAUDE_PLUGIN_ROOT}` は展開された | コマンド文字列に変数を書くときは**二重引用符**で囲む。パスに空白が入りうる |
| **起動モードでキーの有無が変わる。** `claude -p` では `permission_mode` が `default`（`SessionStart` では `None`）、`effort_level` は `None`、`SessionStart` に `model` も `scratchpad_dir` も無い | 非対話での検証結果を対話セッションの結論にしない。どのキーも「必ずある」前提で設計しない |
| 子プロセスには **親の Claude Code セッションの環境変数が引き継がれる**（`CLAUDECODE` / `CLAUDE_CODE_SESSION_ID` / `settings.json` の `env` 由来の値など） | 検証するときは `env -u …` で外す。外さないと対照群が壊れる |
| **失敗したスキル呼出では `PreToolUse` / `PostToolUse` が発火しない**（存在しないスキル名で確認）。モデルにはツールエラーが返っている | 存在しないスキル名の呼出は、ツール系 hook の件数には現れない |
| `SessionStart` は秒単位でブロックしうる（実運用ログに 4 秒前後の記録が 2 件、セッションの終了と開始が重なった瞬間） | `SessionStart` で同期処理を足すときの上限の感覚 |
| macOS の `webbrowser.open` は osascript の完了を**同期的に待つ**ため約 1.4 秒ブロックする。`subprocess.Popen(["open", url])` なら 53 ms | hook からブラウザを開く機能を足すとき。デタッチ起動にすれば起動は遅れない（戻り値で成否は判定できなくなる） |
| 1 メッセージ内で 10 件のツールを並列実行しても、hook のプロセス同時数は**最大 4** にとどまった。ERROR・WARN・取りこぼしはゼロ | 並列実行が hook を詰まらせるかを心配するとき |
| `CLAUDE_CODE_ENTRYPOINT` は対話起動で `cli`、`claude -p` で `sdk-cli`（`--output-format stream-json` でも同じ）。親プロセスから `cli` を継承した状態で `claude -p` を起動しても `sdk-cli` に上書きされる。**未文書化**（`hooks` / `env-vars` の公式ページに記載が無い）。公式ドキュメント（monitoring-usage）の OTEL 属性 `app.entrypoint` の例には `cli` / `sdk-cli` / `sdk-ts` / `sdk-py` / `claude-vscode` などが挙がる（2.1.281 実測 + 公式ドキュメント） | 起動形態を hook 側で判定するとき。未文書化のため名前・値は上流の都合で変わりうる |
| `CLAUDE_CODE_SESSION_ATTENDED` は対話起動で `1`、`claude -p` で `0`。**未文書化**（2.1.281） | 対話判定の代替候補として検討するとき |
| `SessionStart` の標準入力には `-p` かどうかを示すキーが無く、`source` は対話・`-p` のどちらも `startup` になる。hook の標準入出力は対話起動でも端末に接続されていない（`isatty` では対話かどうかを判別できない）（2.1.281） | stdin の内容や `isatty` で対話起動を判定しようとしたとき。どちらも根拠にならない |

## transcript

| 事実 | いつ効くか |
| --- | --- |
| **巨大な 1 行が単独で読取窓を埋め尽くし、`message.usage` を窓の外へ押し出すことがある。** 窓を広げてもこの構造は消えない（行が伸びれば同じことが起きる） | 「窓を広げれば取れる」という対処には上限が無い |
| `message.usage` の 3 値がすべて 0 の行が実在する（`isApiErrorMessage: true` の `assistant` 行） | 合計 0 を値として扱うと、API エラー応答が文脈量に混ざる |
| 末尾から usage 行を取れない transcript には 2 系統ある。**usage 行の間隔が読取窓を超えるもの**と、**応答が 1 度も無かったもの**。取れなかったという結果からは、どちらが原因か区別できない | 取得できない割合を健全性の指標にするときのベースライン |
| transcript は append-only である。ファイルが差し替わる・退避されるという事象は、実データ 67 本で 1 件も確認できなかった | 読取位置を保存する機構の要否を判断するとき |
