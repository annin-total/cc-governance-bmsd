# governance プラグインの Mods 移行 実現性の対応表（下書き）

- 対象: Claude Code 2.1.288、macOS。検証日 2026-10-03。前段の `spikes/mods-probe/RESULTS.md` は 2.1.287
- 行の正本は `INVENTORY.md` の A〜I 節（番号も同じ）。判断（補完手段の選択・見え方の変更の受け入れ）は未決とし、選択肢を並べる
- 不変条件（`PROGRESS.md` の「前提」）: 契約は変えない。機能の後退は認めない。見え方が変わる箇所は機能ごとにユーザーへ確かめる

## 凡例

判定:

| 記号 | 意味 |
|---|---|
| ◎ | Mods で同等以上 |
| ○ | Mods で同等（条件付き。条件は「Mods での実現手段」か「後退」の列に書く） |
| △ | 補完が要る（Mods の API だけでは足りない。候補は「補完手段の候補」） |
| × | Mods ではできない |
| 未検証 | 手動検証へ回す（「未検証事項」） |

根拠の書き方:

- `g4c #2` は `reports/g4c.md` の判定表の 2 行目、`g4b §1` は `reports/g4b.md` の節 1。`reports/` は scratch の各 `REPORT.md` の写し（`g4b-ext` は `g4b/REPORT-ext.md`）
- 生ログ（例 `g4c/logs/reader-mix-big.txt`）は scratch に置いたままで、コミットしていない。scratch はセッションの終了で消えうる
- `docs` は監督が公式 docs（mods/reference.md・hooks.md）で確かめた事実（`PROGRESS.md` の「記録」と依頼文）
- `INV` は `INVENTORY.md`、`RES` は `spikes/mods-probe/RESULTS.md`

## 1. 機能ごとの対応表

### A. 起動と全体の規約

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| A1 | hook の登録 | hooks.json の command hook 7 イベント | hooks.json の `modules` に 1 モジュール。`classic.*` は settings hook が無くても発火する。1 プラグインに置けるモジュールは 1 つ | ○ | g4a「発火回数」、`g4a/logs/r1`〜`r8`、g3a §1（p7） | `-p` の 9 実行では件数が全イベントで一致。対話では Esc 中断で PostToolUseFailure が増える（B6） | python3 への依存が無くなる（RES） | Mods に対応していない古い本体の端末をどう扱うか（未検証） |
| A2 | 常に exit 0・標準エラーに出さない | 例外を握り潰す | 全 hook を try/catch。`$.http.fetch` は接続失敗で例外を投げ、捕まえないと `-p` で標準エラーに出る | ○ | RES「注意点と罠」、g4b §4 | – | – | – |
| A3 | import 中の SIGINT を無視 | `_signal` で SIG_IGN | 不要（Python 固有） | ◎ | INV A3 | – | – | – |
| A4 | 段ごとの例外の隔離 | 段ごとに try、出力は必ず 1 回 | 段ごとに try。`$.command.register` は名前の衝突で例外を投げ、捕まえないと session.start の残りが止まる | ○ | g4d §5（p1） | – | – | – |
| A5 | 無効化スイッチ `CC_GOVERNANCE_DISABLE` | 環境変数 | `$.env.get`。シェルの export と settings の env の両方を読めた | ◎ | g4a「列ごとの判定」、`g4a/logs/r3`・`r7` | – | – | – |

### B. 収集（イベント行）

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| B1 | 標準入力の読み取り | stdin の JSON | `classic.*` の `e`（stdin 全体） | ◎ | INV §3、g4a「列ごとの判定」 | – | – | – |
| B2 | 列の抽出 | `HOOK_FIELDS` のキーパス | 同じキーパスで `e` から引く。effort_level 以外は command hook と同じ値（3 節） | ○ | g4a「列ごとの判定」、`g4a/logs/<tag>/` | – | – | effort_level は未検証 |
| B3 | 型への寄せ（coerce） | Python の `coerce` | JS へ移す。切り詰め（コードポイントと UTF-16）・孤立サロゲート・int と float・int64・整数の文字列の規則を自前で合わせる | ○ | INV 2.6（言語の差）。JS 実装は未検証（g4a「未検証事項」） | – | – | – |
| B4 | context_tokens | transcript の末尾 256 KiB | `$.session.usage().context.tokens`。Stop・PreCompact の全件で transcript の値と一致 | ◎ | g4a「列ごとの判定」 | – | transcript の読み取り範囲による欠測が無くなる（推測） | – |
| B5 | claude_code_version | transcript の `version` | `$.session.version().version`。全件一致 | ◎ | g4a「列ごとの判定」 | – | 全イベントで取れる | 入れるイベントの範囲（論点 4） |
| B6 | 1 行の追記 | 7 イベントで 1 行 | `classic.*` の 7 イベントで 1 行 | ○ | g4a「見つけた差」1・3、`g4a/logs/i1`・`i2` | Esc でツールを中断すると、mod の PostToolUseFailure だけが発火する（command hook は発火しない）。`is_interrupt` は false。`/reapply` を mod のコマンドにすると、その呼び出しの UserPromptSubmit・UserPromptExpansion・Stop の行が出ない（推測を含む） | – | 中断の行を積むか（論点 3） |

### C. 蓄積と送信

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| C1 | 状態ディレクトリ | `CLAUDE_PLUGIN_DATA` | mod には `CLAUDE_PLUGIN_DATA` が無い。`$.env.get('CLAUDE_CONFIG_DIR')` と、定数で持つ marketplace 名から組み立てる。`$.store` も使える | ○ | g4b §8、g3b §6 | – | – | Windows のパス（`USERPROFILE`・区切り）は未検証 |
| B7/C2 | キューへの追記 | 1 回の write で追記 | `$.fs` に append が無い。セッション別ファイルを毎回全体で書き直す。並行 3 プロセス×300 回で欠落なし。1 ファイル 4 MiB まで | △ | g4b §5、`g4b/runs/e5-qfs-*.out`・`e5-qstore-*.out` | 書き直しの途中で落ちると直前のファイルが壊れうる（推測。再現していない） | – | 1 ファイルの切り替えの大きさ（論点 12） |
| C3 | 送信判定 | `sent_at` の mtime と 600 秒 | `$.fs.list`・`stat` の `mtimeMs` か `$.store` で同じ判定ができる | ○ | g4b §5 | – | 対話中は `$.clock.every` で定期送信できる。ホットリロードで二重にならない（g4b §7） | 同時に開いたセッションの一斉送信は未検証 |
| C4 | 送信プロセスの切り離し | `start_new_session=True` の Python | `$.process.run(['sh','-c','nohup python3 … >/dev/null 2>&1 </dev/null &'])`。macOS では本体の終了後に子（ppid=1）が送った。標準出力を閉じないと run が戻らない。`$.process.run` は CLI 限定 | △ | g4b §3、`g4b/runs/e3-p-end-detach/sender.log`・`e3-i-end-detach/sender.log`・`e3-bgnoredir` | Windows は未検証 | – | 本体終了後の送信の方式（論点 1） |
| C5 | 設定の読み込み | `plugin/config.json` | `$.fs.read($.plugin.root + '/config.json')`。git 型では root が cache の版ディレクトリ | ○ | g3b §2。config.json の読み込みそのものは未検証 | – | – | – |
| C6 | 退避 | `os.rename` で spool へ | `$.fs` に rename が無い。補完が要る（4 節「削除・退避」） | △ | INV §3、g4b「補完手段の候補」 | – | – | 論点 12 |
| C7 | POST | urllib、ファイルのバイト列 | `$.http.fetch`。`Content-Type`・`X-Ingest-Token` が届き、ASCII 以外を含む本文も UTF-8 のバイト列が一致。読めるのは 4 MiB までのファイル | ○ | g4b §6、g4b §5 | – | – | 4 MiB を超える旧版のファイル（論点 13） |
| C8 | 打ち切り | 接続不可・timeout・401/403/404・5xx 2 回 | 本体の fetch に 30 秒の上限があり、HttpInit に timeout が無い。`$.clock.after`＋`Promise.race` で打ち切れるが、接続は裏で約 30 秒残る | △ | g4b §2、`g4b/runs/e2-*`、`g4b/runs/e2/recv-hang.jsonl` | 対話で timeout を付けずに応答しない受信先へ送ると、ターンが最長 30 秒止まる（command.run の場合） | – | – |
| C9 | 送信の error 行 | `HTTP <code>`・SSL の例外クラス名 | HTTP エラーは `ok:false`。例外は常に `HooksError` で、message の `failed: <CODE>:` から符号を抜く。message には URL が入る | △ | g4b §4 | error_type の語彙が変わる（3 節） | – | 論点 6 |
| C10 | 破棄 | 14 日・20 MiB で削除 | 判定は `$.fs.list` で足りる。削除は `$.fs` に無く、`$.process.run(['rm','-f','--',p])` か `$.store.delete` | △ | g4b §5 | – | – | 4 節「削除・退避」 |
| C11 | 二重送信の扱い | サーバが `event_id` で一意化 | 同じ | ○ | g4b §1 | session.end の打ち切りでは、受信器は本文を全部受け取り、端末は失敗と見なす → 再送で二重になる（localhost の結果） | – | – |

### D. error 行

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| D1 | error 行の組み立て | 段名と例外クラス名か `HTTP <code>` | 同じ組み立て。例外クラスは JS の名前になる | ○ | g4b §4、INV 2.4 | error_type の語彙が変わる | – | 論点 6 |
| D2 | stage の一覧 | 7 つの固定値 | 同じ固定値 | ○ | INV D2 | – | 握り潰しの検知を新しい stage として積める（推測。stage の語彙が増える） | 検知を積むか（論点 11） |

### E. 識別子

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| E1 | user_email | env → キャッシュ → `git config --global user.email` | `$.env.get`、キャッシュは `$.store`、git は `$.process.run`。シェルの値と同じ（許可確認なし） | ○ | g4a「列ごとの判定」 | – | – | 小文字化（Python の `lower` と JS の `toLowerCase`）の ASCII 以外での差は未検証。`$.process.run` が使えない面（Desktop）は未検証 |
| E2 | host | `platform.node()` | `$.process.run(['hostname'])` の stdout から末尾の改行を除く | ○ | g4a「列ごとの判定」 | – | – | Windows（大文字小文字・`COMPUTERNAME`）は未検証 |
| E3 | event_id | `uuid.uuid4()` | `crypto.randomUUID()` | ○ | INV 2.2。書式は未検証 | – | – | – |
| E4 | plugin_version | `plugin.json` の `version` | `$.plugin.root` の下の plugin.json。git 型では cache の版ディレクトリを指し、版の更新に追随した | ◎ | g3b §2・§4 | – | – | – |

### F. 設定の自動適用

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| F1 | 対象パス | `CLAUDE_CONFIG_DIR` か `~/.claude` | `$.env.get('CLAUDE_CONFIG_DIR')`。`$.settings.read({source:'user'})` も `CLAUDE_CONFIG_DIR` に従う | ○ | g4c #4'、g4a「列ごとの判定」 | – | – | Windows のパスは未検証 |
| F2 | 標準設定の定義 | `policy.py` | TS の定数 | ◎ | INV F2 | – | – | – |
| F3 | 読み込み | UTF-8 で読めない・BOM・壊れた JSON は `parse_failed` | `$.fs.read({as:'bytes'})`＋`TextDecoder('utf-8',{fatal:true,ignoreBOM:true})`。テキストで読むと Latin-1・cp932 が U+FFFD で黙って読める。`$.settings.read` は壊れたファイルを `{}` で返すので判定に使えない | ○ | g4c #4・#4'、`g4c/logs/X-decode.debug.log`・`SR-*.debug.log` | – | – | – |
| F4 | シンボリックリンクの解決 | 実体のパスへ | `$.fs.write` はリンクを保つ。`stat({resolve:true}).realPath` も正しい。`mv` で置き換える場合は realPath に対して行う | ○ | g4c #2'・#3、`g4c/logs/L-write*.debug.log` | – | – | – |
| F5 | 操作の適用 | SET→ADD→REMOVE→ONCE | 純粋な処理として移す | ○ | INV F5 | – | – | – |
| F6 | SET | 型まで含めて比較 | 同じ比較。JS は int と float を区別しない | ○ | INV 2.6、g4c #6 | `1` と `1.0` を同じ値と見なす | – | – |
| F7 | ADD・REMOVE | list の要素 | 同じ | ○ | INV F7 | – | – | – |
| F8 | ONCE | `once.json`、キーは `json.dumps(sort_keys=True)` | 同じ文字列を JS で作る（`JSON.stringify` はキーを並べず区切りに空白を入れない） | ○ | INV 2.3・F8。今の ONCE は空なので今は影響しない | – | – | – |
| F9 | 書き込み | 一時ファイル → mtime_ns の比較 → `os.replace` | `$.fs.write` は原子的でない（その場で上書き）。1 MB と 1 KB の交互の上書きで、読み手が途中の内容を 27 件見た。`fs.write(tmp)`→`mv` なら 0 件。mtime は `mtimeMs`（小数付き、788ns の差を区別できた） | △ | docs、g4c #2・#3・#8、`g4c/logs/reader-mix-big.txt`・`reader-mix-bigmv.txt`・`X-mtime.debug.log` | 直接上書き（案 A）は後退（読み込み中に壊れた内容が見えうる。本体は壊れた settings.json をファイルごと無視する） | – | 書き込みの方式（論点 2） |
| F10 | バックアップ | O_EXCL・0600、10 世代 | `$.fs.write` は権限を指定できず（umask 022 で 644）、`exists`→`write` は排他にならない。`sh -c 'umask 077; set -C; cat > "$1"'` で O_EXCL・0600 になる。古い世代の削除は `rm` | △ | g4c #7、`g4c/logs/X-perm*.debug.log`・`X-excl.debug.log` | – | – | 論点 2 |
| F11 | policy 行 | prev_value は Python の `str()` | 同じ組み立て。数値の文字列化が違う（`60.0`→`60` など） | ○ | g4c #6（`g4c/cfg/fmt/out-py.json`・`out-js.json`）、INV 2.3 | prev_value の意味が変わりうる（3 節） | – | 論点 5 |
| F12 | 責務の範囲 | 利用者の settings.json に書き戻すまで | 同じ。書いた約 1 秒後に ConfigChange で同じセッションに反映される（mod と command hook で差なし） | ◎ | g4c #5、`g4c/logs/I1.debug.log`・`I2.debug.log` | – | `$.settings.read` のマージ値で実効値を観測できる（契約の追加が要るので範囲外。INV §5） | – |

### G. お知らせ

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| G1 | お知らせの読み込み | `notices.json` | `$.fs.read` | ◎ | INV G1 | – | – | – |
| G2 | 既読 | `seen.json`（一時ファイルを経ない上書き） | `$.store`。再起動後も出ないことを確認 | ◎ | g4d §1 (c)、`g4d/cap/i3-band-seen.txt` | `$.store` のファイル名は marketplace で決まる。入れ直し・アンインストールでの扱いは未検証 | – | – |
| G3 | 表示文字列 | SessionStart の `systemMessage` | `systemMessage` は mod の返り値に無い。候補はバンド・トースト・`$.ui.log`・ペイン・PromptHint | △ | INV §3、g4d §1 | 方式によって後退する（4 節「お知らせの表示方式」） | バンド＋Link＋既読ボタン | 表示方式（論点 7） |
| G4 | URL の検査 | `https://`・2048 文字・ASCII | 同じ検査。`Link` の制約（https・2048 文字以下・印字可能な ASCII）と整合する | ◎ | INV G4・§3 | – | – | – |
| G5 | 出力 | 標準出力に JSON 1 回 | 不要（mod は標準出力に書かない）。`-p` の stream-json では `ui_log`・`ui_toast` が `hook_response` の代わりになる。text・json の出力には出ない（今と同じ） | ○ | g4d §2 | stream-json での形が変わる | – | – |
| G6 | 既読にする | 出力に成功したら（`sdk-` 接頭辞は除く） | トーストは成功を返さない。バンドならボタンを押したとき。`-p` の判定は `isInteractive` と `CLAUDE_CODE_ENTRYPOINT` が一致 | ○ | g4d §1 (c)・§2 | 「表示したら既読」から「押したら既読」に変わる（バンドの場合） | – | 既読の条件（論点 8） |
| G7 | ブラウザで開く | macOS `open`、Windows `os.startfile` | `$.process.run(['open', url])`。引数は分断されず、対話で 21〜30ms。既読の後は呼ばれない | ○ | g4d §3、`g4d/cap/i7-open.txt`・`i8-open-again.txt` | – | 勝手に開かず `Link`（OSC 8）を置く。押して開くかは未検証 | 開き続けるか（論点 7）。Windows は未検証 |

### H. ステータスライン

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| H1 | statusline.js の同期 | 一時ファイル＋`os.replace` | 書き込みは F9 と同じく原子的でない。`fs.write(tmp)`→`mv` で補える（CLI 限定） | △ | g4c #3 | – | – | 同期を残すか（今の policy は statusLine を参照していない。論点 9） |
| H2 | 表示内容 | settings の `statusLine`（node の statusline.js） | `$.ui.status` は行頭に ⚠・黄色・プラグイン名が付き、表示名・effort・累計・edit が API に無い。settings の statusLine は mod と併存して描かれる | × | g4d §4、`g4d/cap/i6-status.txt` | mod だけにすると後退。settings の statusLine を残せば後退なし | – | 論点 9 |

### I. 再適用コマンド

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| I1 | `/governance:reapply` | スキル（モデルが reapply.py を実行し表にする） | `$.command.register`。モデルを呼ばない（`num_turns=0`）。`Markdown` で罫線の表を描ける | ○ | g4d §5、`g4d/cap/i2-reapply-md.txt`、`g4d/logs/p1`〜`p10` | 名前空間が付かず `/reapply` になる（`/governance:reapply` は Unknown command）。同じ名前のスキルがあると、別プラグインのものでも登録を拒否される。`-p` の stream-json では exitCode が効かない（text・json では効く） | 結果の表が決まった形になる | 名前（論点 10） |

## 2. 対応表の外の前提

- 配布: git 型マーケットプレイスでは cache から実行され、版を上げないと新しいコードは届かない。autoUpdate で約 4 分後にディスクに入り、開いているセッションは `/reload-plugins` か次の起動まで旧版（g3b 結論 2・4・5）。版の上げ忘れを検査する手順が要る（推測。g3b「推測」）
- 握り潰し: 2.1.288 でも利用者 tier の mod 1 つで command hook が無言で止まる（g3a §4）。mod にしても利用者 tier の mod は governance の `$` 呼び出し（送信・書き込み・設定読み）を偽れる（g3a §1、p6b）。対策は 4 節

## 3. 契約の項目ごとの表

区分: 「同じ」＝同じ値で取れる（実機で一致）、「条件付き」＝処理を足せば同じ、「意味が変わる」＝値の意味や語彙が変わる、「未検証」。

### 3.1 HOOK_FIELDS

| 列 | 区分 | 根拠 |
|---|---|---|
| session_id | 同じ | 全実行・全イベントで一致。`/clear` 後の新しい id も一致（g4a、r8） |
| prompt_id | 同じ | g4a |
| tool_name | 同じ | `Bash`・`Skill`・`Agent`（g4a） |
| source | 同じ | SessionStart の startup・resume・compact・clear が一致。UserPromptSubmit には両側とも `source` キーが無い（g4a） |
| compact_trigger | 同じ（manual のみ） | `auto` は未検証（g4a） |
| command_name / command_source | 同じ（`plugin` のみ） | user・project・mcp_prompt は未検証（g4a） |
| skill_name | 同じ | g4a（r1・r2） |
| effort_level | 未検証 | haiku では両側とも `effort` が無い（g4a） |
| permission_mode | 同じ | g4a |
| agent_id | 同じ | サブエージェント内の Bash で一致（g4a、r4） |
| is_interrupt | 意味が変わる | `false` は一致。Esc 中断で mod の PostToolUseFailure だけが発火し、`is_interrupt` は false。true は一度も観測していない（g4a「見つけた差」1） |

### 3.2 EXTRA_COLUMNS

| 列 | 区分 | 根拠 |
|---|---|---|
| event_id | 未検証 | `crypto.randomUUID()` の書式は確かめていない（INV 2.2） |
| ts / day | 未検証 | `$.clock.now()` をミリ秒から秒へ切り捨てる式（INV 2.2）。実機の比較はしていない |
| user_email | 同じ | git の値がシェルと同じ（g4a）。小文字化の ASCII 以外での差は未検証 |
| host | 条件付き | `hostname` の末尾の改行を除く（g4a）。Windows は未検証 |
| hook_event | 同じ | 登録したイベント名（INV 2.2） |
| context_tokens | 同じ | Stop・PreCompact の全件で一致（g4a）。API エラー・`auto` の圧縮は未検証 |
| claude_code_version | 同じ | 全件一致（g4a）。入れるイベントを広げると意味が変わる（論点 4） |

### 3.3 POLICY_COLUMNS

| 列 | 区分 | 根拠 |
|---|---|---|
| event_id・ts・day・user_email・host | 3.2 と同じ | – |
| key_name | 同じ | 純粋な関数（INV 2.3） |
| value | 条件付き | dict・list は `json.dumps(sort_keys=True)` と同じ区切りの文字列を自前で作る。今の SET の値はスカラだけなので今は影響しない（INV 2.3） |
| prev_value | 意味が変わる | 数値の文字列化が違う。`JSON.parse` の後では `60.0` と `60` を区別できない（g4c #6、INV 2.3） |
| apply_result | 同じ | 6 つの語彙をそのまま使える（INV 2.3）。`skipped_conflict` の判定は `mtimeMs` で足りる見込み（g4c #8。分解能の十分さは推測） |
| plugin_version | 同じ | git 型で cache の版を指す（g3b） |

### 3.4 ERROR_COLUMNS

| 列 | 区分 | 根拠 |
|---|---|---|
| event_id・ts・day・user_email・host | 3.2 と同じ | – |
| hook_event | 同じ | INV 2.4 |
| plugin_version | 同じ | 3.3 と同じ |
| stage | 同じ | 固定値（INV 2.4） |
| error_type | 意味が変わる | 例外は常に `HooksError`。符号（`ECONNREFUSED`・`ENOTFOUND`・`DEPTH_ZERO_SELF_SIGNED_CERT`・`EPROTO` など）は message から抜く。`HTTP <code>` は同じ形で作れる（g4b §4） |

### 3.5 行の外側

| 項目 | 区分 | 根拠 |
|---|---|---|
| kind | 同じ | INV 2.5 |
| 行の書式 | 条件付き | `ensure_ascii=True` に合わせるなら ASCII 以外を `\uXXXX` にする処理を足す。サーバは JSON として読むので意味に効かない（推測。INV 2.5） |
| 送信先・トークン | 同じ | 同梱の config.json を読む（C5） |
| ヘッダ・本文 | 同じ | g4b §6 |
| timeout | 条件付き | HttpInit に timeout が無い。本体の上限 30 秒と、自前の `Promise.race`（g4b §2） |

## 4. 補完手段の候補

### 4.1 settings.json の原子的な置き換え（F9・H1）

| 案 | 内容 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|---|
| A | `$.fs.write` で直接上書き | 依存なし、`$.process.run` が要らない | 原子的でない。読み手が途中の内容を見た（27 件／約 25 万回）。書き込み中に落ちると欠けたファイルが残りうる（推測） | docs、g4c #2・案 A、`g4c/logs/reader-mix-big.txt` | 未検証 |
| B | 同じディレクトリの tmp に `fs.write` → `$.process.run(['mv','-f',tmp,dst])`（dst は realPath） | Python 不要。途中の内容 0 件 | CLI 限定。モードが umask 由来（今は 0600）。mv の失敗時に tmp の後始末が要る | g4c #3・案 B、`reader-mix-bigmv.txt`、`L-writemv*.debug.log` | 未検証。候補は `cmd /c move /y`・PowerShell の `[System.IO.File]::Replace`・`python -c os.replace`（すべて推測。本体がファイルを開いていると共有違反になりうる） |
| C | 判定と JSON 生成は mod、書き込み・置き換え・バックアップだけ同梱の Python | 今の意味論（mkstemp 0600・`os.replace`・O_EXCL・`st_mtime_ns`）を保てる。リンク維持・UTF-8 を確認 | Python 依存が残る。起動に約 0.4 秒。CLI 限定 | g4c 案 C、`g4c/logs/X-pyrep.debug.log` | 未検証（Windows の `python3.exe` の問題は今と同じ） |
| D | F 全体を今の command hook のまま残す | 変更なし | 実行環境が 2 つになる | g4c 案 D | 今と同じ |

### 4.2 バックアップの 0600・O_EXCL（F10）

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| `sh -c 'umask 077; set -C; cat > "$1"'` に stdin で渡す | 2 回目は exitCode 1 で失敗し、0600 になる | CLI 限定。シェル依存 | g4c #7、`X-excl.debug.log` | 不可（sh が前提）。代わりは未検証 |
| 同梱の Python（4.1 の C） | 今と同じ | Python 依存 | g4c 案 C | 未検証 |
| `$.fs.write` だけ | 依存なし | 644 になる（env にトークンが入りうる）。排他にならない | g4c #7、`X-perm*.debug.log` | 未検証 |

### 4.3 削除・退避（C6・C10・F10 の世代削除）

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| `$.process.run(['rm','-f','--',p])` | 確実に消える | CLI 限定、OS で分岐 | g4b §5、g4c #7 | `cmd /c del` が候補（未検証） |
| キューを `$.store` に置き `$.store.delete` | API だけで消せる | 合計 4 MiB で全キーが書けなくなる。大きい値の set は遅い | g4b §5 | 未検証 |
| 退避（rename）をやめ、閉じたセッション別ファイルをそのまま送信単位にする／送信済みの一覧を `$.store` に持つ | rename が要らない | 削除は別途要る。一覧の整合を自前で持つ | g4b「補完手段の候補」（推測） | 未検証 |
| 削除と破棄は切り離した Python 送信器に任せる（今と同じ） | 今の意味論のまま | Python と OS 依存が残る | g4b §3 | 4.4 の切り離しに従う |

### 4.4 本体終了後の送信（C4・C7）

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| 切り離した Python（`sh -c 'nohup … &'`、出力をすべてリダイレクト） | 今と同じ設計。終了を遅らせない（run は 44〜61ms） | Python と OS 依存が残る。CLI 限定 | g4b §3 | 未検証。Bun のジョブオブジェクトで本体と一緒に殺される可能性（推測、二次資料）。候補は WMI・schtasks（推測） |
| settings の SessionEnd hook に長い `timeout` を書いて予算を上げる（policy で利用者の settings に配る、または managed） | 文書化された手段。最大 60 秒 | 上げるのは settings に書いた hook だけで、プラグインの hooks.json では上がらない。受信先が応答しないと毎回の終了がその分遅れる。確かめたのは `--settings` だけ（user・managed は未検証） | docs、g4b-ext「結論」、`g4b/runs/x1-*`〜`x5-*` | 未検証 |
| 環境変数 `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` を session.start で `$.env.set` | mod だけで済む。`-p`・対話とも効いた | 公式 docs に無い（版で消えうる）。他の SessionEnd hook の待ちも延びる | docs、g4b §1、`g4b/runs/e1-p-d3-selfext/` | 未検証 |
| 終了時は既定の 1.5 秒で試みるだけにし、session.start と `$.clock.every` で送る | OS 差なし、外部プロセスなし | `-p` だけの利用者は次の起動まで遅れる。`$.clock.every` は対話だけ。1.5 秒は端末が重いと遅延のない受信先でも超えた | g4b §1・§7、g4b 案 D | OS 差なし（推測） |

### 4.5 応答しない受信先への timeout（C8）

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| `$.clock.after`＋`Promise.race`、送信中は次を投げない排他（`$.state` か fs の印） | ターンを止めない。-p・対話とも 3 秒で打ち切れた | 本体の fetch は裏で最長約 30 秒残る。中断できない（HttpInit が signal を取らない） | g4b §2、`g4b/runs/e2-p-cmd-hang-race`・`e2-i-race` | 未検証 |
| 本体の 30 秒上限に任せる | 何も書かない | 型定義に無い挙動。対話の command.run ではターンが止まる | g4b §2 | 未検証 |

### 4.6 失敗の区別（C8・C9）

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| message から `/failed: ([A-Z_]+):/` で符号を抜き、TLS 系と接続系の一覧を自前で持つ | 区別できる。URL を送らない | message の書式は型定義に無く、版で変わりうる（推測） | g4b §4 | 未検証 |
| HTTP エラーは `ok:false` の `status` から `HTTP <code>` | 今と同じ形 | – | g4b §4 | 未検証 |

### 4.7 お知らせの表示方式（G3・G5・G6・G7）

| 方式 | 見え方 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|---|
| AbovePrompt のバンド＋Link＋既読ボタン | プロンプトの上に、既読にするまで出続ける。改行を保ち 80 列でも読める | 同等以上。ブラウザを勝手に開かずに済む | 既読はボタン操作になる。`-p` では出ない（`ui.render` が発火しない）。Link を押して開くかは未検証 | g4d §1 (c)・§6、`g4d/cap/i2-start.txt`・`i9b-80.txt` | 未検証 |
| `$.ui.toast` | 右上の約 42 列の箱に 3 行、約 4 秒 | 起動直後から出る | 本文が切れ、改行が U+FFFD。transcript に残らない | g4d §1 (a)、`i1-toast-2.txt` | 未検証 |
| `$.ui.log` | transcript に淡い 1 行 | 全文が残る。`-p` の stream-json で `ui_log` | 改行が U+FFFD、URL が折り返しで分断 | g4d §1 (b)・§2 | 未検証 |
| ペイン | 右側にドッキング | 見出し・Link・ボタン | 頼まれずに開くのは 144 列から（一度開いた後は 110 列）。80 列では無言で出ない | docs、g4d §1 (d)、`i5b-pane80.txt` | 未検証 |
| PromptHint | プロンプト下に「お知らせ未読 N 件」 | 合図に使える | 狭いと切れる | g4d §1 (e) | 未検証 |
| `$.session.append` | 画面に出ない | – | 使えない | g4d §1 (e)、`i10-append.txt` | – |

### 4.8 状態行（H1・H2）

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| settings の statusLine（node の statusline.js）を残す | 後退なし。mod と併存して描かれる | node 依存と statusline.js の同期（H1）が残る | g4d §4 | 今と同じ |
| `$.ui.status` | mod だけで済む | ⚠・黄・接頭辞。表示名・effort・累計・edit が取れない | g4d §4、RES | – |

### 4.9 /reapply の名前（I1）

| 候補 | 長所 | 短所 | 根拠 |
|---|---|---|---|
| mod のコマンド `/reapply` | 短い | 他プラグインの同名スキルがあると登録を拒否され、`/reapply` がそのスキルに行く | g4d §5 |
| mod のコマンドで衝突しにくい名前（例 `governance-reapply`） | 衝突しにくい | 名前が今と変わる | g4d §7（推測） |
| 今のスキルのまま（`/governance:reapply`） | 名前が変わらない | モデルを呼ぶ。スキルと同じ名前の mod コマンドは置けない | g4d §5、INV I1 |

Windows・Desktop での登録と描画は未検証。

### 4.10 握り潰しの対策

| 案 | 防げるもの | 防げないもの | 外され方 | 根拠 | Windows |
|---|---|---|---|---|---|
| A. governance を mod にして利用者 settings の `prependPlugins` に置く | 利用者 tier の mod による classic の握り潰し・書き換え（mod 自身は本物を受け取る） | governance の `$` 呼び出しの偽装。prompt.submit の書き換え後に発火する classic.UserPromptSubmit の本文。prepend の先頭を取る mod | prependPlugins から外す・無効化・`disableAllHooks`。利用者 settings の prependPlugins は、managed settings が無く Team・Enterprise でサインインしていない端末でだけ効く | g3a §1・案 A、docs | 未検証 |
| B. A＋守りの mod（別プラグイン、自分の `$` 呼び出しを `next.to(e,'append')`） | A に加えて送信・書き込み・設定読みの偽装 | prepend の先頭を取る mod、プラグインの無効化 | prependPlugins から外すと守りの mod は読み込みに失敗する（標準エラーなし） | g3a §1（p8・p9）・案 B | 未検証 |
| C. 検知（自分の tier・`next.trace` を送る） | 外されたこと・下で誰が答えたかを知る | 送信路の偽装（守りが要る）、プラグインごとの無効化 | 送信の偽装 | g3a §2・案 C | 未検証 |
| D. managed settings（prependPlugins＋sec-default＋allowManagedModsOnly） | 利用者は tier を変えられない。sec-default が classic を守る（m3 からの推測を含む） | sec-default は http.fetch・prompt.submit を守らない（m4・m5） | 管理者権限が無い限り外せない（推測） | g3a §3・案 D | 未検証（この Mac では本物の managed を試せない） |

## 5. 判断が要る論点の一覧

推奨は根拠から導けるものだけに付ける。推測を含むものはそう書く。

| # | 機能 | 論点 | 選択肢 | 推奨と理由 |
|---|---|---|---|---|
| 1 | C4・C7 | 本体終了後の送信の方式 | 切り離した Python／settings の SessionEnd timeout を配る／文書に無い環境変数／session.start と `$.clock.every`（4.4）。組み合わせも可 | 推奨なし（Windows の切り離しの結果待ち）。文書に無い環境変数は、版で消えうるので単独の手段にしない（docs） |
| 2 | F9・F10・H1 | settings.json の書き込み方式 | 4.1 の A〜D と 4.2 | A は外す（後退。g4c #2）。B・C・D の間は推奨なし（B は Windows の置き換えの結果待ち。C・D はどちらも Python 依存が残る） |
| 3 | B6 | Esc 中断で増える PostToolUseFailure の行 | 積む（実態に近いが件数が今と変わる）／積まない | 推奨なし。`is_interrupt` が false なので、積まない場合の判別手段は未検証 |
| 4 | B5 | claude_code_version を入れるイベント | PreCompact・Stop だけ（今と同じ）／全イベント | 今と同じ。不変条件「契約（サーバが受け取る内容）は変えない」による |
| 5 | F11 | prev_value の数値の文字列化 | 受け入れる／数値の元の表記を保つ JSON の読み方を自前で書く／読み取りも Python に任せる | 推奨なし。prev_value に影響が出るのは、配る項目の今の値が数値で書かれている場合だけ（推測）。別に、書き戻すとファイル全体の数値の表記が変わる（`60.0`→`60`。g4c「補完手段の候補」の共通の補完） |
| 6 | C9・D1 | error_type の語彙 | 新しい符号（`ECONNREFUSED` など）を送る／今の Python の例外クラス名に写す | 推奨なし。サーバの集計が error_type の値に依存するかを確かめてから決める（未確認） |
| 7 | G3・G7 | お知らせの表示方式とブラウザ起動 | 4.7 の方式。ブラウザは開き続ける／Link だけにする | 表示はバンドが同等以上（g4d §6）。ブラウザ起動を残すかは見え方の変更なのでユーザーに確かめる |
| 8 | G6 | 既読の条件 | 表示したら既読（今と同じ。トーストやログなら）／ボタンで既読（バンド） | 推奨なし。見え方の変更なのでユーザーに確かめる |
| 9 | H1・H2 | 状態行 | settings の statusLine を残す／`$.ui.status`。statusline.js の同期を残すか | statusLine を残す（g4d §4）。同期を残すかは推奨なし（今の policy は参照していない。INV §6） |
| 10 | I1 | `/reapply` の名前 | 4.9 | 衝突しにくい名前（g4d §7。推測を含む）。名前の変更はユーザーに確かめる |
| 11 | 握り潰し・D2 | 対策の組み合わせと検知の記録 | 4.10 の A〜D。検知を新しい stage で積むか | 推奨なし（会社 PC の managed settings の有無と、Team・Enterprise でのサインインの有無で A・B が効くかが決まる。docs） |
| 12 | B7/C2・C6 | キューの置き場と退避 | セッション別ファイル（`$.fs`）／`$.store`。退避の代わり（4.3） | キューはセッション別ファイル（g4b §5: 並行で欠落なし、`$.store` は合計 4 MiB で全体が止まる）。1 ファイルの大きさは未決 |
| 13 | C7 | 4 MiB を超える旧版の queue.jsonl・spool | 切り離した Python に任せる／捨てる | 推奨なし（g4b §8） |
| 14 | 配布 | 版の上げ忘れ | リリース手順で版の上げを検査する／しない | 検査する（g3b 結論 4: 版を上げないと届かない。推測を含む） |

## 6. 未検証事項

手動検証の手順書の元にする。

### 会社 PC（Bedrock）

- mod が読み込まれ、`classic.*`・`$.session.usage().context.tokens`・`$.session.version()` が同じ値を返すか
- 社内プロキシ・社内 CA の下で `$.http.fetch` が届くか（`NODE_EXTRA_CA_CERTS` は localhost で効いた。`HTTPS_PROXY`・キーチェーンは未確認。g4b §4）
- 対話で localhost 以外へ fetch したときに許可確認が出るか（g4b「未検証事項」）
- Team・Enterprise のサインインの有無と、それによる sec-default の着座・利用者 `prependPlugins` の扱い（docs、g3a §3）
- effort 対応モデルでの `effort.level`（g4a）

### Windows

- 切り離した送信が本体の終了後に生き残るか（`cmd /c start`・`Start-Process`・WMI・schtasks。g4b §3）。今の Python 版の送信プロセスも本体と一緒に殺されていないか（推測。g4b §3）
- settings.json の原子的な置き換え（`move /y`・`File.Replace`・`os.replace`）と共有違反（g4c）
- `rm` の代わり（`cmd /c del`）、O_EXCL・権限の代わり
- `hostname` と `platform.node()` の一致（大文字小文字・`COMPUTERNAME`）
- `CLAUDE_CONFIG_DIR` が無いときのパス・区切り・`USERPROFILE`
- ブラウザ起動（シェルを通さない方法）、`$.store` の保存先、cache のパス

### 社内 Bitbucket

- 認証付き https URL での `marketplace add`・shallow clone・資格情報（g3b「会社 PC で確かめるべき残り」）
- 既定の端末（`FORCE_AUTOUPDATE_PLUGINS` 無し）で `autoUpdate: true` が走るか、所要時間
- Bitbucket に届かないときの起動と自動更新、clone 先が消えたとき

### managed settings

- managed の `prependPlugins` で governance が `tier prepend` になり、利用者の `prependPlugins` が無視されるか（g3a §3 の手順の材料）
- 利用者の swallow・adv-ops の下でも governance が本物を受け取り送信が届くか
- `allowManagedModsOnly`・`allowManagedHooksOnly`・`disableSideloadFlags` の効き方
- managed の hook が利用者の mod に止められないか
- managed settings に書いた SessionEnd hook の `timeout` で session.end の予算が上がるか（g4b-ext）
- 組み込みガードや他の mod の `fs.*` hook が利用者の settings.json への書き込みを拒否しないか（g4c #9）

### Desktop・VS Code

- バンド・ペイン・status・toast の描画、`isInteractive`・`CLAUDE_CODE_ENTRYPOINT` の値（g4d §9）
- `$.process.run` が使えない面での user_email・host・置き換え・切り離し（型定義で CLI 限定。g4c #3）
- Link を押したときにブラウザが開くか

### この Mac で確かめられるが未実施

- `$.fs.write` の途中でのプロセス中断による壊れ方（g4b・g4c）
- JS の coerce（切り詰め・サロゲート・int64）、`crypto.randomUUID()` の書式、ts の切り捨て
- PreCompact の `auto`、API エラーのターンの context_tokens、`is_interrupt` が true になる条件、`command_source` の `plugin` 以外（g4a）
- スキルのスラッシュ呼び出し（`/governance:reapply` の形）での UserPromptExpansion（g4a「見つけた差」3）
- ホットリロードでの二重計上・toast と open の繰り返し、`--safe-mode`・`disableAllHooks` で止まる範囲（g4a・g4d）
- user の settings.json に書いた SessionEnd hook の `timeout` で予算が上がるか（本人の settings を書き換えないので隔離 config で）
- 同時に開いたセッションの一斉送信、`$.clock.every` の長時間運用
