# governance プラグインの Mods 移行 実現性の対応表

- 設計の段取り: 同等のまま Mods へ移す → その後に改善する（ユーザーの方針）
- 対象: Claude Code 2.1.288、macOS。検証日 2026-10-03。前段の `spikes/mods-probe/RESULTS.md` は 2.1.287
- 行の正本は `INVENTORY.md` の A〜I 節（番号も同じ）。ユーザーが機能ごとに決めたことは「決定」、決まっていないことは「未決」と書く。決定の記録は `PROGRESS.md` の「記録」
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

判定は Mods で実現できるかを示す。決定で Python に残した機能も、判定はそのまま残す。

根拠の書き方:

- `g4c #2` は `reports/g4c.md` の判定表の 2 行目、`g4b §1` は `reports/g4b.md` の節 1。`reports/` は scratch の各 `REPORT.md` の写し（`g4b-ext` は `g4b/REPORT-ext.md`）
- 生ログ（例 `g4c/logs/reader-mix-big.txt`）は scratch に置いたままで、コミットしていない。scratch はセッションの終了で消えうる
- `docs` は監督が公式 docs（mods/reference.md・hooks.md）で確かめた事実（`PROGRESS.md` の「記録」）
- `INV` は `INVENTORY.md`、`RES` は `spikes/mods-probe/RESULTS.md`

## 1. 機能ごとの対応表

### A. 起動と全体の規約

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| A1 | hook の登録 | hooks.json の command hook 7 イベント | hooks.json の `modules` に 1 モジュール。`classic.*` は settings hook が無くても発火する。独自イベント（tool.call・turn.*・session.*・prompt.submit・command.run）でも件数を組み立てられる。1 プラグインに置けるモジュールは 1 つ | ○ | g4a「発火回数」、g4e「回数の比較」、g3a §1（p7） | `classic.*` は sec-default が座る端末では届かない（2 節） | – | 決定: 独自イベントを土台にする（論点 15）。Mods に対応していない古い本体の端末（未検証） |
| A2 | 常に exit 0・標準エラーに出さない | 例外を握り潰す | 全 hook を try/catch。`$.http.fetch` は接続失敗で例外を投げ、捕まえないと `-p` で標準エラーに出る | ○ | RES「注意点と罠」、g4b §4 | – | – | – |
| A3 | import 中の SIGINT を無視 | `_signal` で SIG_IGN | mod では不要（Python 固有）。Python に残す部分では今と同じ | ◎ | INV A3 | – | – | – |
| A4 | 段ごとの例外の隔離 | 段ごとに try、出力は必ず 1 回 | 段ごとに try。`$.command.register` は名前の衝突で例外を投げ、捕まえないと session.start の残りが止まる | ○ | g4d §5（p1） | – | – | – |
| A5 | 無効化スイッチ `CC_GOVERNANCE_DISABLE` | 環境変数 | `$.env.get`。シェルの export と settings の env の両方を読めた | ◎ | g4a「列ごとの判定」、`g4a/logs/r3`・`r7` | – | – | – |

### B. 収集（イベント行）

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| B1 | 標準入力の読み取り | stdin の JSON | `classic.*` の `e`（stdin 全体）。独自イベントでは列ごとに取り方が違う（3.1） | ◎ | INV §3、g4a、g4e | – | – | 決定: 独自イベントを土台にする（論点 15） |
| B2 | 列の抽出 | `HOOK_FIELDS` のキーパス | classic では同じキーパスで `e` から引く。独自イベントでは列ごとの組み立て（3.1） | ○ | g4a「列ごとの判定」、g4e「列ごとの判定」 | – | – | 決定: 独自イベントの取り方（3.1）。effort_level（論点 16）・command_source（論点 17）は未決 |
| B3 | 型への寄せ（coerce） | Python の `coerce` | JS へ移す。切り詰め（コードポイントと UTF-16）・孤立サロゲート・int と float・int64・整数の文字列の規則を自前で合わせる | ○ | INV 2.6（言語の差）。JS 実装は未検証 | – | – | – |
| B4 | context_tokens | transcript の末尾 256 KiB | `$.session.usage().context.tokens`。classic の Stop・PreCompact でも、独自イベントの `turn.complete`（agentId なし）・`session.compact` でも command hook の値と全件一致 | ◎ | g4a「列ごとの判定」、g4e「列ごとの判定」 | – | transcript の読み取り範囲による欠測が無くなる（推測） | – |
| B5 | claude_code_version | transcript の `version` | `$.session.version().version`。全件一致 | ◎ | g4a「列ごとの判定」 | 全イベントに入る（列は同じで、値が入る範囲が広がる） | – | 決定: 全イベントに入れる |
| B6 | 1 行の追記 | 7 イベントで 1 行 | 独自イベントで組み立てた 7 種で 1 行。UserPromptSubmit・PostToolUse などの行は、prompt_id と permission_mode を transcript から読むため、ターンの終わり（`turn.complete`）まで保留する | ○ | g4a「見つけた差」1・3、g4e「回数の比較」、`g4a/logs/i1`・`i2`、`g4e/logs/i1` | classic では、Esc でツールを中断すると mod の PostToolUseFailure だけが発火する（`is_interrupt` は false）。独自イベントでも、中断の文言で除かなければ同じく増える。`/governance-reapply` の呼び出しでは UserPromptSubmit・UserPromptExpansion・Stop の行が出ない（推測を含む） | – | 決定: 中断で増える PostToolUseFailure の行を受け入れる |

### C. 蓄積と送信

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| C1 | 状態ディレクトリ | `CLAUDE_PLUGIN_DATA` | mod には `CLAUDE_PLUGIN_DATA` が無い。`$.env.get('CLAUDE_CONFIG_DIR')` と、定数で持つ marketplace 名から組み立てる | ○ | g4b §8、g3b §6 | – | – | Windows のパス（`USERPROFILE`・区切り）は未検証 |
| B7/C2 | キューへの追記 | 1 回の write で追記 | `$.fs` に append が無い。セッション別ファイルを毎回全体で書き直す。並行 3 プロセス×300 回で欠落なし。1 ファイル 4 MiB まで | △ | g4b §5、`g4b/runs/e5-qfs-*.out`・`e5-qstore-*.out` | 書き直しの途中で落ちると直前のファイルが壊れうる（推測。再現していない） | – | キューの形（論点 12） |
| C3 | 送信判定 | `sent_at` の mtime と 600 秒 | `$.fs.list`・`stat` の `mtimeMs` か `$.store` で同じ判定ができる | ○ | g4b §5 | – | 対話中の `$.clock.every` による定期送信（g4b §7）は、段取りにより移行の後で検討する | 決定: 今と同じ一括送信（SessionStart と Stop の時点で 10 分以上たっていれば）。判定は mod（独自イベントでは session.start と `turn.complete` に置く） |
| C4 | 送信プロセスの切り離し | `start_new_session=True` の Python | `$.process.run(['sh','-c','nohup python3 … >/dev/null 2>&1 </dev/null &'])`。macOS では本体の終了後に子（ppid=1）が送った。標準出力を閉じないと run が戻らない。`$.process.run` は CLI 限定 | △ | g4b §3、`g4b/runs/e3-p-end-detach/sender.log`・`e3-i-end-detach/sender.log`・`e3-bgnoredir` | – | – | 決定: 送るのは切り離した Python、mod は判定と起動。Windows で生き残るかは未検証 |
| C5 | 設定の読み込み | `plugin/config.json` | 送信器（Python）は今と同じ。mod が読む場合は `$.fs.read($.plugin.root + '/config.json')`（git 型では root が cache の版ディレクトリ） | ○ | g3b §2。mod からの config.json の読み込みは未検証 | – | – | – |
| C6 | 退避 | `os.rename` で spool へ | `$.fs` に rename が無い（4.3） | △ | INV §3、g4b「補完手段の候補」 | – | – | 決定（送信の決定から）: Python の送信器に残す。キューの形との整合は論点 12 |
| C7 | POST | urllib、ファイルのバイト列 | `$.http.fetch` でもヘッダと UTF-8 のバイト列は一致したが、読めるのは 4 MiB までのファイル | ○ | g4b §6、g4b §5 | – | – | 決定（送信の決定から）: Python の送信器に残す |
| C8 | 打ち切り | 接続不可・timeout・401/403/404・5xx 2 回 | 本体の fetch に 30 秒の上限があり、HttpInit に timeout が無い。`$.clock.after`＋`Promise.race` で打ち切れるが、接続は裏で約 30 秒残る | △ | g4b §2、`g4b/runs/e2-*`、`g4b/runs/e2/recv-hang.jsonl` | – | – | 決定（送信の決定から）: Python の送信器に残す（`timeout_sec` が今と同じく効く） |
| C9 | 送信の error 行 | `HTTP <code>`・SSL の例外クラス名 | HTTP エラーは `ok:false`。例外は常に `HooksError` で、message の `failed: <CODE>:` から符号を抜く。message には URL が入る | △ | g4b §4 | – | – | 決定: stage `send` の error 行は Python が今と同じ名前で積む |
| C10 | 破棄 | 14 日・20 MiB で削除 | 判定は `$.fs.list` で足りる。削除は `$.fs` に無い（4.3） | △ | g4b §5 | – | – | 決定（送信の決定から）: Python の送信器に残す |
| C11 | 二重送信の扱い | サーバが `event_id` で一意化 | 同じ | ○ | g4b §1 | – | – | – |

### D. error 行

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| D1 | error 行の組み立て | 段名と例外クラス名か `HTTP <code>` | 同じ組み立て。例外クラスは JS の名前になる | ○ | g4b §4、INV 2.4 | error_type の語彙が変わる | – | 決定: mod が積む error 行は抜き出した符号と JS の例外名。stage `send`（Python）は今と同じ |
| D2 | stage の一覧 | 7 つの固定値 | 同じ固定値 | ○ | INV D2 | – | – | 決定: managed settings が無い端末では握り潰しの検知を足す。記録の形（新しい stage にするか）は論点 11 |

### E. 識別子

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| E1 | user_email | env → キャッシュ → `git config --global user.email` | `$.env.get`、キャッシュは `$.store`、git は `$.process.run`。シェルの値と同じ（許可確認なし） | ○ | g4a「列ごとの判定」 | – | – | 小文字化（Python の `lower` と JS の `toLowerCase`）の ASCII 以外での差は未検証。`$.process.run` が使えない面（Desktop）は未検証 |
| E2 | host | `platform.node()` | `$.process.run(['hostname'])` の stdout から末尾の改行を除く | ○ | g4a「列ごとの判定」 | – | – | Windows（大文字小文字・`COMPUTERNAME`）は未検証 |
| E3 | event_id | `uuid.uuid4()` | `crypto.randomUUID()` | ○ | INV 2.2。書式は未検証 | – | – | – |
| E4 | plugin_version | `plugin.json` の `version` | `$.plugin.root` の下の plugin.json。git 型では cache の版ディレクトリを指し、版の更新に追随した | ◎ | g3b §2・§4 | – | – | – |

### F. 設定の自動適用

決定: 適用は丸ごと同梱の Python が行う（4.1 の案 E）。Python は読み込み・SET/ADD/REMOVE/ONCE・バックアップ・原子的な書き込みまでを行い、結果を JSON で返す。mod は Python を `$.process.run` で起動し、結果から policy 行を組み立てる。理由: 利用者の settings.json の表記（`60.0` など）を変えない（変えるのは後退）、同じ規則を JS と Python の 2 か所に持たない、settings.json に触るのは Python だけにして責務を閉じる。

下の表の「Mods での実現手段」と判定は、Mods だけで行う場合の実現性を示す。

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| F1 | 対象パス | `CLAUDE_CONFIG_DIR` か `~/.claude` | `$.env.get('CLAUDE_CONFIG_DIR')` | ○ | g4c #4'、g4a「列ごとの判定」 | – | – | 決定: Python が解決する（今と同じ） |
| F2 | 標準設定の定義 | `policy.py` | TS の定数 | ◎ | INV F2 | – | – | – |
| F3 | 読み込み | UTF-8 で読めない・BOM・壊れた JSON は `parse_failed` | `$.fs.read({as:'bytes'})`＋`TextDecoder('utf-8',{fatal:true,ignoreBOM:true})`。テキストで読むと Latin-1・cp932 が U+FFFD で黙って読める。`$.settings.read` は壊れたファイルを `{}` で返し、sec-default が座る端末では利用者 tier に届かないので判定に使わない | ○ | g4c #4・#4'、`g4c/logs/X-decode.debug.log`・`SR-*.debug.log`、2 節 | – | – | 決定: Python が行う（今と同じ） |
| F4 | シンボリックリンクの解決 | 実体のパスへ | `stat({resolve:true}).realPath` が正しく返る。書き込みは Python（`os.replace` を実体のパスに対して行う。今と同じ） | ○ | g4c #2'・#3、`g4c/logs/L-write*.debug.log`・`X-pyrep.debug.log` | – | – | 決定: Python が行う（今と同じ） |
| F5 | 操作の適用 | SET→ADD→REMOVE→ONCE | 純粋な処理として移す | ○ | INV F5 | – | – | 決定: Python が行う（今と同じ） |
| F6 | SET | 型まで含めて比較 | 同じ比較。JS は int と float を区別しない | ○ | INV 2.6、g4c #6 | Mods で行うと `1` と `1.0` を同じ値と見なす（決定により起きない） | – | 決定: Python が行う（今と同じ） |
| F7 | ADD・REMOVE | list の要素 | 同じ | ○ | INV F7 | – | – | 決定: Python が行う（今と同じ） |
| F8 | ONCE | `once.json`、キーは `json.dumps(sort_keys=True)` | 同じ文字列を JS で作る（`JSON.stringify` はキーを並べず区切りに空白を入れない） | ○ | INV 2.3・F8。今の ONCE は空なので今は影響しない | – | – | 決定: Python が行う（今と同じ）。dict の値の扱いは 7 節 |
| F9 | 書き込み | 一時ファイル → mtime_ns の比較 → `os.replace` | `$.fs.write` は原子的でない（その場で上書き）。1 MB と 1 KB の交互の上書きで、読み手が途中の内容を 27 件見た。`fs.write(tmp)`→`mv` なら 0 件 | △ | docs、g4c #2・#3、`g4c/logs/reader-mix-big.txt`・`reader-mix-bigmv.txt` | – | – | 決定: Python が行う（案 E） |
| F10 | バックアップ | O_EXCL・0600、10 世代 | `$.fs.write` は権限を指定できず（umask 022 で 644）、`exists`→`write` は排他にならない | △ | g4c #7、`g4c/logs/X-perm*.debug.log`・`X-excl.debug.log` | – | – | 決定: Python が行う（案 E） |
| F11 | policy 行 | prev_value は Python の `str()` | Mods だけで組み立てると数値の文字列化が違う（`60.0`→`60` など） | ○ | g4c #6（`g4c/cfg/fmt/out-py.json`・`out-js.json`）、INV 2.3 | 決定により起きない（prev_value の表記は今と同じ） | – | 決定: Python の結果（JSON）から mod が policy 行を組み立てる |
| F12 | 責務の範囲 | 利用者の settings.json に書き戻すまで | 同じ。書いた約 1 秒後に ConfigChange で同じセッションに反映される（mod と command hook で差なし） | ◎ | g4c #5、`g4c/logs/I1.debug.log`・`I2.debug.log` | – | `$.settings.read` のマージ値で実効値を観測できる（契約の追加が要るので範囲外。INV §5） | 決定: settings.json に触るのは Python だけ |

### G. お知らせ

決定: AbovePrompt のバンドに出し、リンクと「既読にする」ボタンを付ける。既読はボタンを押したとき。ブラウザ起動は今のまま残す。`-p` では `$.ui.log` で出し、既読にはしない。

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| G1 | お知らせの読み込み | `notices.json` | `$.fs.read` | ◎ | INV G1 | – | – | – |
| G2 | 既読 | `seen.json`（一時ファイルを経ない上書き） | `$.store`。再起動後も出ないことを確認 | ◎ | g4d §1 (c)、`g4d/cap/i3-band-seen.txt` | `$.store` のファイル名は marketplace で決まる。入れ直し・アンインストールでの扱いは未検証 | – | – |
| G3 | 表示文字列 | SessionStart の `systemMessage` | `systemMessage` は mod の返り値に無い。バンドで改行を保って出せる | ◎ | INV §3、g4d §1 (c)・§6 | transcript に残る 1 行から、既読にするまでプロンプトの上に出続けるバンドに変わる | – | 決定: バンド |
| G4 | URL の検査 | `https://`・2048 文字・ASCII | 同じ検査。`Link` の制約（https・2048 文字以下・印字可能な ASCII）と整合する | ◎ | INV G4・§3 | – | – | – |
| G5 | 出力 | 標準出力に JSON 1 回 | 不要（mod は標準出力に書かない）。`-p` ではバンドが出ない（`ui.render` が発火しない）。stream-json で `hook_response` に当たるのは `ui_log`・`ui_toast` | ○ | g4d §2 | stream-json での形が `hook_response` から `ui_log` に変わる。text・json の出力には出ない（今と同じ） | – | 決定: `-p` では `$.ui.log` で出し、既読にはしない |
| G6 | 既読にする | 出力に成功したら（`sdk-` 接頭辞は除く） | バンドのボタンを押したとき。`-p` の判定は `isInteractive` と `CLAUDE_CODE_ENTRYPOINT` が一致 | ○ | g4d §1 (c)・§2 | 「表示したら既読」から「押したら既読」に変わる | – | 決定: ボタンを押したとき |
| G7 | ブラウザで開く | macOS `open`、Windows `os.startfile` | `$.process.run(['open', url])`。引数は分断されず、対話で 21〜30ms。既読の後は呼ばれない | ○ | g4d §3、`g4d/cap/i7-open.txt`・`i8-open-again.txt` | – | バンドに `Link`（OSC 8）を置く。押して開くかは未検証 | 決定: ブラウザ起動を残す。Windows でシェルを通さずに開く方法は未検証。起動の条件（今は「既読の書き込みに成功したら」）をボタン方式でどう置くかは論点 8 |

### H. ステータスライン

決定: settings の statusLine と statusline.js を残す。

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| H1 | statusline.js の同期 | 一時ファイル＋`os.replace` | 書き込みは F9 と同じく原子的でない。`fs.write(tmp)`→`mv`（CLI 限定）か、F と同じく同梱の Python | △ | g4c #3 | – | – | 同期の書き込みをどちらで行うか（論点 9） |
| H2 | 表示内容 | settings の `statusLine`（node の statusline.js） | `$.ui.status` は行頭に ⚠・黄色・プラグイン名が付き、表示名・effort・累計・edit が API に無い。settings の statusLine は mod と併存して描かれる | × | g4d §4、`g4d/cap/i6-status.txt` | statusLine を残すので後退なし | – | 決定: statusLine を残す |

### I. 再適用コマンド

| # | 機能 | 今の実装 | Mods での実現手段 | 判定 | 根拠 | 後退・見え方の変化 | 改善の候補 | 未決 |
|---|---|---|---|---|---|---|---|---|
| I1 | `/governance:reapply` | スキル（モデルが reapply.py を実行し表にする） | `$.command.register`。モデルを呼ばない（`num_turns=0`）。`Markdown` で罫線の表を描ける | ○ | g4d §5、`g4d/cap/i2-reapply-md.txt`、`g4d/logs/p1`〜`p10` | 名前が `/governance-reapply` に変わる（mod のコマンドには名前空間が付かない）。同じ名前のスキルがあると、別プラグインのものでも登録を拒否される。`-p` の stream-json では exitCode が効かない（text・json では効く） | 結果の表が決まった形になる | 決定: mod のコマンド `/governance-reapply`（モデルを呼ばず表で出す） |

## 2. 対応表の外の前提

- **sec-default の下での届き方**: managed settings がある端末、または Team・Enterprise でサインインした利用者の端末では、組み込みガード `cc-plugin-sec-default@builtin` が最も外側に座る。座ると、利用者 tier の mod には `classic.*`・`settings.read`・`skill.prompt` などが届かない（下の tier へ飛ばされる）。独自イベント（session.start・prompt.submit・turn.*・tool.call・session.compact・session.end・command.run）と `$` の API（`$.session.*`・`$.config.list`・`$.fs.*`・`$.process.run`・`$.env.get`・`$.http.fetch`）は届く
  - 根拠: g3a §3（m3・m4）、g4e「sec-default が座った状態で届くか」（m1〜m4、`g4e/logs/m1.debug.log` ほか）
  - 確かめたのは隠しフラグ `--managed-settings` で作った policy の下だけ。本物の managed（ファイル・MDM・server-managed）と、Team・Enterprise のサインインで同じ範囲になるかは未検証（g4e「事実と推測」）
  - `$.http.fetch` は sec-default が守らないので、利用者 tier の mod が偽れる（g3a m4）
- **会社 PC の事実**（ユーザーが 2026-10-02 に確かめた。Claude Code 2.1.287、macOS、Bedrock）: `--plugin-dir` の mod が `-p` でも対話でも読み込まれて動いた。managed settings は無く、sec-default は `not seated: no managed settings and not a Team or Enterprise organization` だった。`--safe-mode` と `--plugin-dir` を併用すると、mod は読み込まれない。他の利用者の端末も同じとは限らない
- **配布**: git 型マーケットプレイスでは cache から実行され、版を上げないと新しいコードは届かない。autoUpdate で約 4 分後にディスクに入り、開いているセッションは `/reload-plugins` か次の起動まで旧版（g3b 結論 2・4・5）。版の上げ忘れを検査する手順が要る（推測。g3b「推測」）
- **握り潰し**: 2.1.288 でも利用者 tier の mod 1 つで command hook が無言で止まる（g3a §4）。mod にしても、sec-default が座らない端末では利用者 tier の mod が governance の `$` 呼び出し（送信・書き込み・設定読み）を偽れる（g3a §1、p6b）。対策は 4.10

## 3. 契約の項目ごとの表

区分: 「同じ」＝同じ値で取れる（実機で一致）、「条件付き」＝処理を足せば同じ、「意味が変わる」＝値の意味や語彙が変わる、「未検証」。

### 3.1 HOOK_FIELDS

決定により、収集は独自イベントの取り方を使う（classic.* の列は比較のために残す）。`classic.*` は sec-default が座る端末では届かない（2 節）。独自イベントの件数は、Esc 中断（PostToolUseFailure の文言）と aborted のターン（Stop）、サブエージェントの `turn.complete` を除けば、command hook と全実行で一致した（g4e「回数の比較」）。

| 列 | classic.* での取り方 | 区分 | 独自イベントでの取り方 | 区分 | 根拠 |
|---|---|---|---|---|---|
| session_id | `e.session_id` | 同じ | `$.session.id()`、`session.end` では `e.sessionId`。`/clear` の後の新しい id は `command.run`（clear）の `next(e)` が返った後に変わる | 同じ | g4a、g4e |
| prompt_id | `e.prompt_id` | 同じ | 無い。`turn.complete` の時点で transcript の最後の user 行の `promptId` を読む（Stop との比較 11 件一致）。`turn.start` の時点では、新規の `-p` で transcript が無く、resume では前の id が出る。UserPromptSubmit・PostToolUse の行に付けるには、ターンの終わりまで行を保留する（tool.call ごとに読む方式は未検証）。`$.fs.read` は 4 MiB 超で reject、`tail` は Windows に無い | 条件付き | g4a、g4e |
| tool_name | `e.tool_name` | 同じ | `tool.call` の `e.tool`（MCP も同じ表記） | 同じ | g4a、g4e |
| （PostToolUse と PostToolUseFailure の区別） | イベント名 | 同じ | `tool.call` の `await next(e)` の結果の `isError` | 同じ | g4e |
| source | `e.source` | 同じ | 無い。組み立てる: `session.start` で `$.session.turns()`>0 か `messages()` が空でなければ resume、どちらも 0 なら startup。`session.compact` の `next(e)` が返ったら compact、`command.run`（clear）の後に clear。`--fork-session`・`--continue`・SDK の resume は未検証 | 条件付き | g4a、g4e |
| compact_trigger | `e.trigger` | 同じ（manual のみ確認） | `session.compact` の `e.trigger` | 同じ（manual・auto） | g4a、g4e（n6c） |
| command_name | `e.command_name` | 同じ | `command.run` の `e.command`（組み込みの compact・clear・exit でも発火するので `source==='builtin'` を除く） | 同じ | g4a、g4e |
| command_source | `e.command_source` | 同じ（`plugin` のみ確認） | `$.command.list()` の同名の `source`（型 CommandSource: builtin・plugin・user・mcp）。hook の語彙（project・mcp_prompt など）との対応は未確認 | 条件付き | g4a、g4e |
| skill_name | `e.tool_input.skill` | 同じ | `tool.call`（`e.tool==='Skill'`）の `e.skill`。`skill.prompt` は sec-default に飛ばされる | 同じ | g4a、g4e |
| effort_level | `e.effort.level` | 未検証 | `turn.step` の `e.effort` | 未検証 | haiku では両側とも無い（g4a、g4e） |
| permission_mode | `e.permission_mode` | 同じ | 無い。`$.config.list()` の `permissionMode` は設定値で実効値ではない。transcript の、利用者が打った user 行の `permissionMode` を `turn.complete` で読む（m1 acceptEdits・n6 系 default が一致）。スラッシュコマンドのターンでは user 行に無い（hook は default）。ターン途中の shift+tab は反映されない（推測） | 条件付き | g4a、g4e |
| agent_id | `e.agent_id` | 同じ | `tool.call` の `e.agentId` | 同じ | g4a、g4e |
| is_interrupt | `e.is_interrupt` | 意味が変わる（Esc 中断で mod の PostToolUseFailure だけが発火し、値は false。true は未観測） | 無い。`isError` と、結果の text の `[Request interrupted by user for tool use]` で中断を見分ける。見分けて除けば今と同じ件数（文言が変わらないことは推測） | 条件付き | g4a「見つけた差」1、g4e |

### 3.2 EXTRA_COLUMNS

| 列 | 区分 | 根拠 |
|---|---|---|
| event_id | 未検証 | `crypto.randomUUID()` の書式は確かめていない（INV 2.2） |
| ts / day | 未検証 | `$.clock.now()` をミリ秒から秒へ切り捨てる式（INV 2.2）。実機の比較はしていない |
| user_email | 同じ | git の値がシェルと同じ（g4a）。小文字化の ASCII 以外での差は未検証 |
| host | 条件付き | `hostname` の末尾の改行を除く（g4a）。Windows は未検証 |
| hook_event | 同じ | 登録したイベント名、または独自イベントからの対応（INV 2.2、g4e「回数の比較」） |
| context_tokens | 同じ | classic の Stop・PreCompact（g4a）、独自イベントの `turn.complete`・`session.compact`（g4e）とも全件一致。API エラーのターンは未検証 |
| claude_code_version | 意味が変わる（範囲） | 値は全件一致（g4a）。決定により全イベントに入れるので、PreCompact・Stop 以外の行にも値が入る |

### 3.3 POLICY_COLUMNS

| 列 | 区分 | 根拠 |
|---|---|---|
| event_id・ts・day・user_email・host | 3.2 と同じ | – |
| key_name | 同じ | Python の結果から組み立てる（INV 2.3） |
| value | 同じ | 文字列は Python が今と同じ規則で作れば同じ。mod が作る場合は dict・list を `json.dumps(sort_keys=True)` と同じ区切りにする必要がある（INV 2.3）。どちらで作るかは設計で決める |
| prev_value | 同じ | 決定により適用は Python が行うので、表記は今と同じ。Mods だけで作ると `60.0` と `60` を区別できない（g4c #6、INV 2.3） |
| apply_result | 同じ | Python が今と同じ判定（`st_mtime_ns` を含む）で返す（INV 2.3） |
| plugin_version | 同じ | git 型で cache の版を指す（g3b） |

### 3.4 ERROR_COLUMNS

| 列 | 区分 | 根拠 |
|---|---|---|
| event_id・ts・day・user_email・host | 3.2 と同じ | – |
| hook_event | 同じ | INV 2.4 |
| plugin_version | 同じ | 3.3 と同じ |
| stage | 同じ | 固定値（INV 2.4）。握り潰しの検知を新しい stage にするなら語彙が増える（論点 11） |
| error_type | 意味が変わる（mod が積む行だけ） | mod の例外は常に `HooksError`。決定により、mod が積む行は符号（`ECONNREFUSED`・`ENOTFOUND`・`DEPTH_ZERO_SELF_SIGNED_CERT`・`EPROTO` など）と JS の例外名にする。stage `send` は Python が今と同じ名前で積む（g4b §4） |

### 3.5 行の外側

| 項目 | 区分 | 根拠 |
|---|---|---|
| kind | 同じ | INV 2.5 |
| 行の書式 | 条件付き | `ensure_ascii=True` に合わせるなら ASCII 以外を `\uXXXX` にする処理を足す。サーバは JSON として読むので意味に効かない（推測。INV 2.5） |
| 送信先・トークン・ヘッダ・本文・timeout | 同じ | 送信は Python の送信器に残す（決定）。mod の `$.http.fetch` でもヘッダと本文は一致した（g4b §6） |

## 4. 補完手段の候補

### 4.1 settings.json の原子的な置き換え（F 全体・H1）

**採用: 案 E**（ユーザーの決定）。理由は F 節の冒頭。

| 案 | 内容 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|---|
| A | `$.fs.write` で直接上書き | 依存なし、`$.process.run` が要らない | 原子的でない。読み手が途中の内容を見た（27 件／約 25 万回）。書き込み中に落ちると欠けたファイルが残りうる（推測） | docs、g4c #2・案 A、`g4c/logs/reader-mix-big.txt` | 未検証 |
| B | 同じディレクトリの tmp に `fs.write` → `$.process.run(['mv','-f',tmp,dst])`（dst は realPath） | Python 不要。途中の内容 0 件 | CLI 限定。モードが umask 由来（今は 0600）。mv の失敗時に tmp の後始末が要る | g4c #3・案 B、`reader-mix-bigmv.txt`、`L-writemv*.debug.log` | 未検証。候補は `cmd /c move /y`・PowerShell の `[System.IO.File]::Replace`・`python -c os.replace`（すべて推測） |
| C | 判定と JSON 生成は mod、書き込み・置き換え・バックアップだけ同梱の Python（`$.process.run(['python3', script, path], {stdin})`） | 今の意味論（mkstemp 0600・`os.replace`・O_EXCL・`st_mtime_ns`）を保てる。リンク維持・UTF-8 を確認 | Python 依存が残る。起動に約 0.4 秒（この Mac）。CLI 限定 | g4c 案 C、`g4c/logs/X-pyrep.debug.log` | 未検証（Windows の `python3.exe` の問題は今と同じ） |
| **E（採用）** | 適用は丸ごと同梱の Python（読み込み・SET/ADD/REMOVE/ONCE・バックアップ・原子的な書き込み）。結果を JSON で返し、mod が `$.process.run` で起動して policy 行を組み立てる | 利用者の settings.json の表記を変えない。規則を 1 か所に持つ。settings.json に触るのは Python だけ。今の意味論をそのまま保てる | Python 依存が残る。CLI 限定。起動の時間（案 C と同じ約 0.4 秒と見込む。推測） | 案 C の検証（`X-pyrep`）からの類推。案 E そのものは未検証 | 未検証（Windows の `python3.exe` の問題は今と同じ） |
| D | F 全体を今の command hook のまま残す | 変更なし | 実行環境が 2 つになる。sec-default が座る端末では classic の連鎖の下で動く | g4c 案 D | 今と同じ |

### 4.2 バックアップの 0600・O_EXCL（F10）

**採用: 同梱の Python**（4.1 の案 E に含まれる）。

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| `sh -c 'umask 077; set -C; cat > "$1"'` に stdin で渡す | 2 回目は exitCode 1 で失敗し、0600 になる | CLI 限定。シェル依存 | g4c #7、`X-excl.debug.log` | 不可（sh が前提） |
| **同梱の Python（採用）** | 今と同じ | Python 依存 | g4c 案 C・4.1 の案 E | 未検証 |
| `$.fs.write` だけ | 依存なし | 644 になる（env にトークンが入りうる）。排他にならない | g4c #7、`X-perm*.debug.log` | 未検証 |

### 4.3 削除・退避（C6・C10・F10 の世代削除）

**採用: Python の送信器と、設定の書き込みの Python に任せる**（送信と設定の自動適用の決定から）。

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| `$.process.run(['rm','-f','--',p])` | 確実に消える | CLI 限定、OS で分岐 | g4b §5、g4c #7 | `cmd /c del` が候補（未検証） |
| キューを `$.store` に置き `$.store.delete` | API だけで消せる | 合計 4 MiB で全キーが書けなくなる。大きい値の set は遅い | g4b §5 | 未検証 |
| 退避（rename）をやめ、閉じたセッション別ファイルをそのまま送信単位にする／送信済みの一覧を `$.store` に持つ | rename が要らない | 削除は別途要る。一覧の整合を自前で持つ | g4b「補完手段の候補」（推測） | 未検証 |
| **Python に任せる（採用）** | 今の意味論のまま | Python と OS 依存が残る | g4b §3 | 4.4 の切り離しに従う |

### 4.4 本体終了後の送信（C4・C7）

**採用: 切り離した Python**（ユーザーの決定。今と同じ一括送信で、mod は判定と起動を受け持つ）。Windows で生き残るかは未検証で、採用の前提に残る。

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| **切り離した Python（採用）**（`sh -c 'nohup … &'`、出力をすべてリダイレクト） | 今と同じ設計。終了を遅らせない（run は 44〜61ms） | Python と OS 依存が残る。CLI 限定 | g4b §3 | 未検証。Bun のジョブオブジェクトで本体と一緒に殺される可能性（推測、二次資料）。候補は WMI・schtasks（推測） |
| settings の SessionEnd hook に長い `timeout` を書いて予算を上げる（利用者の settings か managed で配る） | 公式 docs に書かれた手段。最大 60 秒 | 上げるのは settings に書いた hook だけで、プラグインの hooks.json では上がらない。確かめたのは `--settings` だけ（user・project・managed は未検証）。受信先が応答しないと毎回の終了がその分遅れる | docs、g4b-ext「結論」、`g4b/runs/x1-*`〜`x5-*` | 未検証 |
| session.start と `$.clock.every` で送り、終了時は既定の 1.5 秒で試みるだけにする | OS 差なし、外部プロセスなし | `-p` だけの利用者は次の起動まで遅れる。`$.clock.every` は対話だけ。1.5 秒は端末が重いと遅延のない受信先でも超えた | g4b §1・§7、g4b 案 D | OS 差なし（推測） |
| 参考: 環境変数 `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` を session.start で `$.env.set` | `-p`・対話とも効いた | 公式 docs に無く、版で消えうるので手段に置かない | docs、g4b §1、`g4b/runs/e1-p-d3-selfext/` | 未検証 |

session.end の上限について（g4b-ext）: `next.budget.ms` が示すのは「session.end の上限」と「hook 1 回の予算 10 秒」の小さい方で、上限そのものではない。`--settings` の `timeout: 30` では表示は 10000 で、実際の打ち切りは 31.48 秒だった。`timeout: 120` では 60 秒で打ち切られた。

### 4.5 応答しない受信先への timeout（C8）

**採用: Python の送信器の `timeout_sec`**（送信の決定から。今と同じ）。mod が `$.http.fetch` で送る場合の候補は次のとおり。

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| `$.clock.after`＋`Promise.race`、送信中は次を投げない排他（`$.state` か fs の印） | ターンを止めない。-p・対話とも 3 秒で打ち切れた | 本体の fetch は裏で最長約 30 秒残る。中断できない（HttpInit が signal を取らない） | g4b §2、`g4b/runs/e2-p-cmd-hang-race`・`e2-i-race` | 未検証 |
| 本体の 30 秒上限に任せる | 何も書かない | 型定義に無い挙動。対話の command.run ではターンが止まる | g4b §2 | 未検証 |

### 4.6 失敗の区別（C9・D1）

**採用: message から符号を抜く**（ユーザーの決定。mod が積む error 行だけ。stage `send` は Python が今と同じ名前で積み、`HTTP <code>` は今のまま）。

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| **message から `/failed: ([A-Z_]+):/` で符号を抜き、TLS 系と接続系の一覧を自前で持つ（採用）** | 区別できる。URL を送らない | message の書式は型定義に無く、版で変わりうる（推測） | g4b §4 | 未検証 |
| HTTP エラーは `ok:false` の `status` から `HTTP <code>` | 今と同じ形 | – | g4b §4 | 未検証 |

### 4.7 お知らせの表示方式（G3・G5・G6・G7）

**採用: AbovePrompt のバンド＋Link＋既読ボタン、ブラウザ起動は残す。`-p` では `$.ui.log`（既読にしない）**（ユーザーの決定）。

| 方式 | 見え方 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|---|
| **AbovePrompt のバンド＋Link＋既読ボタン（採用）** | プロンプトの上に、既読にするまで出続ける。改行を保ち 80 列でも読める | 同等以上 | 既読はボタン操作になる。`-p` では出ない（`ui.render` が発火しない）。Link を押して開くかは未検証 | g4d §1 (c)・§6、`g4d/cap/i2-start.txt`・`i9b-80.txt` | 未検証 |
| `$.ui.toast` | 右上の約 42 列の箱に 3 行、約 4 秒 | 起動直後から出る | 本文が切れ、改行が U+FFFD。transcript に残らない | g4d §1 (a)、`i1-toast-2.txt` | 未検証 |
| `$.ui.log` | transcript に淡い 1 行 | 全文が残る。`-p` の stream-json で `ui_log` | 改行が U+FFFD、URL が折り返しで分断 | g4d §1 (b)・§2 | 未検証 |
| ペイン | 右側にドッキング | 見出し・Link・ボタン | 頼まれずに開くのは 144 列から（一度開いた後は 110 列）。80 列では無言で出ない | docs、g4d §1 (d)、`i5b-pane80.txt` | 未検証 |
| PromptHint | プロンプト下に「お知らせ未読 N 件」 | 合図に使える | 狭いと切れる | g4d §1 (e) | 未検証 |
| `$.session.append` | 画面に出ない | – | 使えない | g4d §1 (e)、`i10-append.txt` | – |

### 4.8 状態行（H1・H2）

**採用: settings の statusLine と statusline.js を残す**（ユーザーの決定）。

| 候補 | 長所 | 短所 | 根拠 | Windows |
|---|---|---|---|---|
| **settings の statusLine（node の statusline.js）を残す（採用）** | 後退なし。mod と併存して描かれる | node 依存と statusline.js の同期（H1）が残る | g4d §4 | 今と同じ |
| `$.ui.status` | mod だけで済む | ⚠・黄・接頭辞。表示名・effort・累計・edit が取れない | g4d §4、RES | – |

### 4.9 /reapply の名前（I1）

**採用: mod のコマンド `/governance-reapply`**（ユーザーの決定）。

| 候補 | 長所 | 短所 | 根拠 |
|---|---|---|---|
| mod のコマンド `/reapply` | 短い | 他プラグインの同名スキルがあると登録を拒否され、`/reapply` がそのスキルに行く | g4d §5 |
| **mod のコマンド `/governance-reapply`（採用）** | 衝突しにくい（推測）。モデルを呼ばない | 名前が今と変わる | g4d §7 |
| 今のスキルのまま（`/governance:reapply`） | 名前が変わらない | モデルを呼ぶ。スキルと同じ名前の mod コマンドは置けない | g4d §5、INV I1 |

Windows・Desktop での登録と描画は未検証。

### 4.10 握り潰しの対策

**採用**: managed settings が無い端末では A＋B＋C（prependPlugins に governance を置き、守りの mod と検知を足す）。managed settings がある端末では D（sec-default に任せる）。会社 PC では managed settings が無いので A＋B＋C が当てはまる（2.1.287 での事実。2 節）。他の利用者の端末も同じとは限らない。

| 案 | 防げるもの | 防げないもの | 外され方 | 根拠 | Windows |
|---|---|---|---|---|---|
| A. governance を mod にして利用者 settings の `prependPlugins` に置く | 利用者 tier の mod による classic の握り潰し・書き換え（mod 自身は本物を受け取る） | governance の `$` 呼び出しの偽装。prompt.submit の書き換え後に発火する classic.UserPromptSubmit の本文。prepend の先頭を取る mod | prependPlugins から外す・無効化・`disableAllHooks` | g3a §1・案 A | 未検証 |
| B. A＋守りの mod（別プラグイン、自分の `$` 呼び出しを `next.to(e,'append')`） | A に加えて送信・書き込み・設定読みの偽装 | prepend の先頭を取る mod、プラグインの無効化 | prependPlugins から外すと守りの mod は読み込みに失敗する（標準エラーなし） | g3a §1（p8・p9）・案 B | 未検証 |
| C. 検知（自分の tier・`next.trace` を送る） | 外されたこと・下で誰が答えたかを知る | 送信路の偽装（守りが要る）、プラグインごとの無効化 | 送信の偽装 | g3a §2・案 C | 未検証 |
| D. managed settings（prependPlugins＋sec-default＋allowManagedModsOnly） | 利用者は tier を変えられない。sec-default が classic を守る（m3 からの推測を含む） | sec-default は http.fetch・prompt.submit を守らない（m4・m5）。利用者 tier の mod には classic.* が届かない（収集は独自イベントなので影響しない。決定 15） | 管理者権限が無い限り外せない（推測） | g3a §3・案 D、g4e | 未検証（この Mac では本物の managed を試せない） |

利用者 settings の `prependPlugins` が効くのは、managed settings が無く、Team・Enterprise でサインインしていない端末だけ（docs）。この条件のうち実機で確かめたのは未ログインの端末だけで（g3a・RES）、ログインした個人プランの端末や、Team・Enterprise でサインインした端末での扱いは未検証。

## 5. 判断が要る論点の一覧

推奨は根拠から導けるものだけに付ける。推測を含むものはそう書く。

### 5.1 決定した論点

| # | 機能 | 論点 | 決定 | 残る未決 |
|---|---|---|---|---|
| 1 | C3・C4・C7 | 本体終了後の送信の方式 | 今と同じ一括送信（SessionStart と Stop の時点で 10 分以上たっていれば）。送るのは切り離した Python、mod は判定と起動 | Windows で切り離した Python が本体の終了後に生き残るか（未検証） |
| 2 | F 全体 | 設定の自動適用の分担 | 適用は丸ごと同梱の Python（読み込み・SET/ADD/REMOVE/ONCE・バックアップ・原子的な書き込み）。結果を JSON で返し、mod は `$.process.run` で起動して policy 行を組み立てる（4.1 の案 E）。理由は F 節の冒頭 | Windows で `$.process.run` から Python を起動できるか（未検証）。結果の JSON の形と、value の文字列を Python と mod のどちらで作るか（設計で決める） |
| 3 | B6 | Esc 中断で増える PostToolUseFailure の行 | 受け入れる | 独自イベントでは、中断の文言で除けば今と同じ件数にもできる。除くか |
| 4 | B5 | claude_code_version を入れるイベント | 全イベントに入れる | – |
| 5 | F11 | prev_value の数値の文字列化 | 解消（Python が書くので今と同じ） | – |
| 6 | C9・D1 | error_type の語彙 | stage `send` の error 行は Python が今と同じ名前で積む。mod が積む error 行だけ、抜き出した符号（`ECONNREFUSED` など）と JS の例外名にする。`HTTP <code>` は今のまま | – |
| 7 | G3・G5・G7 | お知らせの表示方式とブラウザ起動 | AbovePrompt のバンドにリンクと「既読にする」ボタンを付ける。ブラウザ起動は今のまま残す。`-p` では `$.ui.log` で出し（stream-json の `ui_log`）、既読にはしない | – |
| 8 | G6 | 既読の条件 | ボタンを押したとき | ブラウザ起動の条件（今は「既読の書き込みに成功し、`cli` のとき」）を、ボタン方式の下でいつ開くか |
| 9 | H1・H2 | 状態行 | settings の statusLine と statusline.js を残す | statusline.js の同期の書き込みを mod（`fs.write`＋`mv`）と同梱の Python のどちらで行うか |
| 10 | I1 | `/reapply` の名前 | mod のコマンド `/governance-reapply`（モデルを呼ばず表で出す） | – |
| 11 | 握り潰し・D2 | 対策の組み合わせ | managed settings が無い端末では prependPlugins に governance を置き、守りの mod と検知を足す。ある端末では sec-default に任せる。会社 PC では managed settings が無いので A＋B＋C が当てはまる（2.1.287 での事実。2 節） | 他の利用者の端末も同じとは限らない。会社 PC での Team・Enterprise のサインインの有無は sec-default の表示（`not a Team or Enterprise organization`）から読めるが、2.1.288 で再確認する。検知の記録の形（新しい stage にするか） |
| 15 | A1・B1・B2・B6 | 収集の土台 | 独自イベント（tool.call・turn.*・session.*・prompt.submit・command.run）を前提にする。prompt_id と permission_mode は transcript から読み、行はターンの終わりまで保留する | 設計の未決として残す: transcript が 4 MiB を超えたとき（`$.fs.read` が reject する）の読み方と、Windows（`tail` が無い）での読み方 |

### 5.2 未決の論点

| # | 機能 | 論点 | 選択肢 | 推奨と理由 |
|---|---|---|---|---|
| 12 | B7/C2・C6 | キューの形と送信器の読み方 | mod がセッション別ファイル（`$.fs`）に書き、Python の送信器が複数ファイルを退避・送信する／`$.store` に置く | セッション別ファイル（g4b §5: 並行で欠落なし、`$.store` は合計 4 MiB で全体が止まる）。今の送信器は `queue.jsonl` 1 つを退避するので、送信器側の変更が要る。1 ファイルの大きさは未決 |
| 13 | C7 | 4 MiB を超える旧版の queue.jsonl・spool | – | 送信を Python に残す決定（1）により、送信器は 4 MiB の上限を受けない。mod が旧ファイルを読まない設計なら論点として消える |
| 14 | 配布 | 版の上げ忘れ | リリース手順で版の上げを検査する／しない | 検査する（g3b 結論 4: 版を上げないと届かない。推測を含む） |
| 16 | B2 | effort_level の確認 | effort 対応モデルで `turn.step` の `e.effort` を確かめる（比較に classic の `e.effort.level`） | 確かめる（haiku では両側とも値が無く、まだ一致を確かめられていない。g4a・g4e） |
| 17 | B2 | command_source の語彙の対応 | `$.command.list()` の source（builtin・plugin・user・mcp）と、hook の `command_source`（project・mcp_prompt などを含みうる）の対応表を作る | 推奨なし。対応は `plugin` しか確かめていない（g4e）。決定 15 で独自イベントを土台にしたので、対応表が要る |

## 6. 未検証事項

手動検証の手順書の元にする。手動検証の資材は GitHub のこのブランチから会社 PC で取得する（決定）。

### 会社 PC（Bedrock）

- mod の読み込み: 確認済み（2.1.287。`--plugin-dir` の mod が `-p` でも対話でも動いた）。2.1.288 で再確認する
- 独自イベント・`$.session.usage().context.tokens`・`$.session.version()`・transcript の `promptId`・`permissionMode` が command hook と同じ値を返すか（Bedrock 認証の下での値は未検証）
- 社内プロキシ・社内 CA の下で、切り離した Python の送信が届くか（今と同じ経路）
- sec-default の着座: 確認済み（2.1.287。`not seated: no managed settings and not a Team or Enterprise organization`）。2.1.288 で再確認する
- 利用者 settings の `prependPlugins` に governance を置いて `tier prepend` で読み込まれるか（決定 11 の A＋B＋C の前提）
- effort 対応モデルでの `effort.level`（論点 16）

### Windows

- 切り離した送信が本体の終了後に生き残るか（`cmd /c start`・`Start-Process`・WMI・schtasks。g4b §3）。今の Python 版の送信プロセスも本体と一緒に殺されていないか（推測。g4b §3）
- mod から同梱の Python（設定の自動適用）を `$.process.run` で起動できるか、`python3.exe` の有無（4.1 の案 E）
- transcript を末尾から読む方法（`tail` が無い。決定 15）と、transcript のパスの組み立て
- `hostname` と `platform.node()` の一致（大文字小文字・`COMPUTERNAME`）
- `CLAUDE_CONFIG_DIR` が無いときのパス・区切り・`USERPROFILE`
- ブラウザ起動（シェルを通さない方法）、`$.store` の保存先、cache のパス

### 社内 Bitbucket

- 認証付き https URL での `marketplace add`・shallow clone・資格情報（g3b「会社 PC で確かめるべき残り」）
- 既定の端末（`FORCE_AUTOUPDATE_PLUGINS` 無し）で `autoUpdate: true` が走るか、所要時間
- Bitbucket に届かないときの起動と自動更新、clone 先が消えたとき

### managed settings

- 会社 PC に managed settings があるか: 確認済み（2.1.287。無い）。2.1.288 で再確認する。他の利用者の端末も同じとは限らない
- 以下は managed settings のある端末で確かめる（会社 PC では試せない）
  - managed の `prependPlugins` で governance が `tier prepend` になり、利用者の `prependPlugins` が無視されるか（g3a §3 の手順の材料）
  - 本物の managed の下で sec-default が座り、`--managed-settings` のときと同じ範囲（classic.*・settings.read・skill.prompt は届かず、独自イベントと `$` は届く）になるか（g3a・g4e）
  - 利用者の swallow・adv-ops の下でも governance が本物を受け取り送信が届くか
  - `allowManagedModsOnly`・`allowManagedHooksOnly`・`disableSideloadFlags` の効き方
  - managed の hook が利用者の mod に止められないか
  - 組み込みガードや他の mod の `fs.*` hook が利用者の settings.json への書き込みを拒否しないか（g4c #9）

### Desktop・VS Code

- バンドの描画と既読ボタン、`isInteractive`・`CLAUDE_CODE_ENTRYPOINT` の値（g4d §9）
- `$.process.run` が使えない面での user_email・host・設定の自動適用（Python）・送信の切り離し（型定義で CLI 限定。g4c #3）
- Link を押したときにブラウザが開くか

### この Mac で確かめられるが未実施

- キューの `$.fs.write` の途中でのプロセス中断による壊れ方（g4b §5）
- JS の coerce（切り詰め・サロゲート・int64）、`crypto.randomUUID()` の書式、ts の切り捨て
- API エラーのターンの context_tokens、`command_source` の `plugin` 以外（g4a・g4e）
- 独自イベントの読み方: tool.call ごとに transcript を読む方式、4 MiB を超える transcript、ターン途中の shift+tab と plan・bypassPermissions・auto モード、`--fork-session`・`--continue`・SDK の resume、自動圧縮が成功した場合の compact（g4e「未検証事項」）
- ホットリロードでの二重計上・ブラウザ起動の繰り返し、`disableAllHooks` で止まる範囲（g4a・g4d）
- `--safe-mode`: `--plugin-dir` との併用で mod が読み込まれないことは確認済み（会社 PC、2.1.287）。2.1.288 で再確認する。マーケットプレイスから入れた mod が止まるかは未検証

## 7. 設計への引き継ぎ

移行と独立した、今の機能の既知の問題。移行の設計で扱いを決める。

- **ONCE で配る dict の値**（例 statusLine）は、利用者の元の値を丸ごと置き換え、アンインストールしても戻らない。会社 PC で実害を確認した（ユーザーの確認）
- **resume で お知らせが出ない**: 2.1.285 では、対話のセッションを resume すると SessionStart の systemMessage が表示されなかった（ユーザーの確認）。バンドならこの問題は起きない見込み（推測。手動検証で確かめる）
- **notices.json の id の重複**: 同じ id が重複すると、まとめて既読になる
