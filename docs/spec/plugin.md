# cc-governance-bmsd 端末プラグイン仕様書

## 概要

Claude Code の端末プラグイン。設定の自動適用・お知らせの表示・利用イベントの収集と送信を
行う。配布名は `governance`、ソースは `plugin/`。全体像と契約（`plugin/hooks/contract.py`）
の位置づけは `system.md` にある。

hook の入口は `plugin/hooks/collect.py`（全 hook 共通の収集）と `session_start.py`
（`SessionStart`）の 2 つだけであり、`_` 始まりの
ファイルは内部モジュールである。ほかに利用者が呼ぶ `/governance:reapply`（入口は
`reapply.py`）がある。端末の状態（識別子のキャッシュ・既読・送信待ち・前回動いた版）は `${CLAUDE_PLUGIN_DATA}`
（無ければ `~/.claude/cc-governance/`）に置く。アンインストールすると `${CLAUDE_PLUGIN_DATA}` は消え、既読と
未送信分（`queue.jsonl`・`spool/`）も失われる（上流の挙動は `../knowledge/claude-code-behavior.md`）。

## 規約

- hook は常に `exit 0` し、標準エラーには何も出力しない。標準出力に書くのは
  `session_start.py` の hook JSON 出力 1 回だけである
- `tool_input` は `skill` キーだけを名指しで読む。`prompt` / `tool_response` / `message`
  には触れない

`hooks.json` に登録するコマンドは `python3 "${CLAUDE_PLUGIN_ROOT}/hooks/<入口>.py" <hook名>`
（入口は `collect.py` か `session_start.py`）の形の 1 行とし、`${...}` を二重引用符で囲む。
パイプ・`;`・`&&`・リダイレクトを含めず、条件分岐・後処理・無効化スイッチの判定はすべて Python 側に
置く。1 行 100 文字未満に収める。

## 収集

`collect.py` は列の抽出を hook の種類で分岐させず、標準入力の JSON から契約の `HOOK_FIELDS` が名指しした
キーパスだけを引く。来ないキーは NULL になる。

**許可するのはキーパスだけで、値の中身は検査しない。**`skill_name`・`command_name`・
`command_source`・MCP の `tool_name` は利用者が自由に命名できる文字列であり、255 文字までそのまま送信・永続化
される。

- `user_email` は突合キーである。環境変数 `CC_GOVERNANCE_USER_EMAIL` があればそれを使い、無ければ
  キャッシュ → `git config --global user.email` → NULL の順に解決してキャッシュする。小文字化だけ行う。
  `SessionStart` ではキャッシュを読まずに解決し直すので、git や環境変数を直せば次のセッションから
  反映される。ほかの hook はキャッシュを読む
- `event_id` はイベントごとの UUID であり、一意性は保証しない（重複の扱いは `../decisions/server.md`）
- `context_tokens` は `PreCompact` と `Stop` のときだけ、transcript の末尾から取った絶対値を送る
- `claude_code_version`（Claude Code 本体の版）も `PreCompact` と `Stop` のときだけ、transcript の末尾側で
  最も新しい文字列の `version` を送る。取れなければ NULL

**本文（プロンプト・応答・メッセージ）は送らない。**利用者に由来する値で送るのは、`SET` / `ONCE` の
書き込み前の値（`prev_value`。スカラだけ。「設定の自動適用」）、スキル名とコマンド名（`skill_name`・
`command_name`・`command_source`）、`tool_name`（MCP のツールはサーバ名を含む）、端末のホスト名（`host`）、`user_email` だけである。

環境変数 `CC_GOVERNANCE_DISABLE` が空でないとき、**利用ログの収集とお知らせの表示**を
止める。設定の適用と policy イベントの記録・送信（`SessionStart` での送信判定）は続ける。`Stop` では送信しない。

## 蓄積と送信

イベントは状態ディレクトリの `queue.jsonl` に 1 行ずつ追記する。`SessionStart` と `Stop` の
末尾で、`queue.jsonl` があり、前回送信から一定の間隔が経っていれば送信プロセスを切り離して起動し、
hook 自身は待たずに終わる。送信プロセスはキューを `spool/` へ退避し、古い順に `POST /ingest` し、
2xx のものだけ消し、最後に上限を超えた分を破棄する。値は `plugin/config.json`（タイムアウト・上限）と
`_spool.py` の定数（間隔）にある。

- リトライループ・指数バックオフ・ACK は持たない。失敗分は次回まとめて再送される
- サーバに届かなかったら（接続・タイムアウト・壊れた応答）、残りのファイルは送らずにその回を
  打ち切る。HTTP のエラー応答が `_sender.py` の `_HALT_STATUSES` のとき、または 5xx が
  `_MAX_CONSECUTIVE_5XX` 回続いたときも打ち切る。それ以外のエラー応答なら次のファイルへ進む。
  打ち切った回も、送れなかったファイルは消さずに残す
- 送信先が空でも、退避と破棄は行う。`config.json` が無い・読めないときだけは送信プロセスが何もせず、
  `queue.jsonl` が上限なしに増える
- spool は送信先を持たず、送信の時点の送信先へ全部送る。送信先を切り替えると、切替前に溜まった分も新しい送信先へ届き、
  旧い送信先には届かない
- 上限（`spool/` 全体の容量と日数）を超えたら古いものから破棄する。送信先に届き打ち切らない回なら、
  単体で上限を超えるファイルも破棄の前に 1 回は送られる
- 再送で同じイベントが二重に届きうる。件数はサーバが `event_id` で一意化して数える
- **オフライン・spool 上限超過・hook 失敗による取りこぼしは仕様として受け入れる。**hook 失敗は
  error 行で気づけるが、失ったイベントは戻らない
- `session_start.py` の各段・`collect.py` の入口・送信プロセスの失敗は、`kind: "error"` の行
  （契約の `ERROR_COLUMNS`）としてキューに積み、イベントと同じ経路で送る。持つのは固定値の段名
  `stage` と例外クラス名 `error_type`（送信の HTTP エラー応答は `HTTP 401` の形で、1 回の送信につき
  状態コードごとに 1 行）だけで、
  例外メッセージは持たない。送信の接続不可・タイムアウトと、段の内部で値を空にして続行した失敗は
  記録しない（SSL の失敗は記録する）。送信の失敗の行は、送信が回復するまでサーバに届かない

## 設定の自動適用

`session_start.py` は、`plugin/hooks/policy.py` の標準設定を `<config_dir>/settings.json`
（config_dir は `CLAUDE_CONFIG_DIR`、無ければ `~/.claude`）へ強制的に適用する。利用者が施策を
選ぶモードは無い。施策を変えるときは `policy.py` を直してリリースする（手順は `../guide/release.md`）。
書き方の見本は `plugin/hooks/policy_sample.py` にある（hook は読まない）。

`policy.py` は 4 つの表を持ち、この順に当てる。キーは `.` 区切りのパスで、途中の名前に `.` を
含められない。

| 表 | 動作 |
| --- | --- |
| `SET` | 値で上書きする。dict・list も丸ごと置き換える。値 `None` はキーを消す |
| `ADD` | 配列に無い要素だけ末尾に足す。要素は型まで含めて等値で比べる（dict も可） |
| `REMOVE` | 配列にある要素だけ消す |
| `ONCE` | (パス, 値) の組ごとに 1 回だけ `SET` と同じく書く。以後は利用者が変えても戻さない。値を変えて配れば再度 1 回書く。記録は今配っている組だけを持つので、前の値へ戻して配っても再び 1 回書く。値の文字列中の `${GOVERNANCE_HOME}` は書き込み時に `<config_dir>/governance` の絶対パス（`/` 区切り）になる |

- 途中の dict は無ければ作る。ただし `extraKnownMarketplaces` の下には作らず、利用者が登録済みの
  項目にだけ書く。途中が dict でないとき、対象が配列でないとき（`ADD` / `REMOVE`）は書かない
- 差分が無ければ書かない。読んでから書くまでに mtime が変わっていたら今回は諦め、
  パースに失敗したら何もしない。書き込みは一時ファイル + `os.replace` で原子的に行う
- **本体が `settings.json` をファイルごと無視すると、プラグインが起動しない。**`enabledPlugins` も効かないので
  hook が 1 本も動かず、適用も policy・error 行の記録も起きない（無視される条件は
  `../knowledge/claude-code-behavior.md` の「settings.json の読み込み」、気づき方と復旧の順は `../guide/release.md`）。
  本体が読めてプラグインが読めないとき（BOM 付き・非 UTF-8 など）は hook が動き、適用を飛ばして全項目を
  `parse_failed` として記録する
- 書き換える直前に、元のファイルを丸ごと `<config_dir>/settings-backups/<YYYY_MMDD_HHMM>/`（ローカル時刻。
  同じ名前があれば `-2`, `-3`…）に保存する。`statusLine` を書き換えるときだけ、書き換え前の `statusLine.command` に
  書かれたパスのうち、`~` と環境変数を展開した後の絶対パスで実在する通常ファイルも写す（フォルダ・読めないファイル・
  `plugin/hooks/_backup.py` の `MAX_STATUSLINE_FILE_BYTES` を超えるファイルは写さない）。
  直前のフォルダ（連番は数値で並べる）と内容が同じなら作らない。`settings.json` を保存できなければ書かない。自動では消さない
- 導入・更新の後の最初の `SessionStart` でも、適用より前の `settings.json` を同じ形で保存する。
  前回動いた版を `${CLAUDE_PLUGIN_DATA}` に記録して今の版と比べ（記録が無いときも保存する）、
  保存できなかったときは記録を更新せず次のセッションでまた試す
- 結果はキーごとに policy イベントとして記録する。`key_name` は `SET` ならパスそのまま、ほかは
  `add:` / `remove:` / `once:` を前に付ける。`value` は `SET` / `ONCE` なら配る値（dict・list は
  JSON 文字列）、`ADD` / `REMOVE` なら今回足した・消した要素の JSON 配列（無ければ NULL）。
  `prev_value` は `SET` / `ONCE` の書き込み前の値で（`ADD` / `REMOVE` は NULL）、スカラ以外は NULL に
  する。サーバは `SET` の `prev_value` で準拠を判定する
- `/governance:reapply` は `ONCE` の記録を消して全体を今すぐ適用し直し、結果を利用者に見せる。
  policy イベントは積まない

標準設定には、Claude Code 本体の自動更新を強制する項目（`autoUpdatesChannel` と更新系の `env`）を含む。
理由は `../decisions/plugin.md`。

**責務は標準設定を利用者の `settings.json` に書き戻すところまでである。**プロジェクトの設定や
セッション中の変更による上書きは追わない。

`<config_dir>/governance/` には、`ONCE` の記録（`once.json`）と `statusline.js` だけを置く。
`statusline.js` は同梱の `plugin/statusline/statusline.js` を毎セッション、内容が違うときだけ複製する。
この同期の失敗はほかの工程に波及させない。**このディレクトリと `settings-backups/` はアンインストールしても残る。**

## お知らせの配信

`plugin/notices.json`（ロジックを持たない純データ）のうち既読集合に無いものから、配列の順で先頭の
1 件だけを hook の JSON 出力の `systemMessage` として返す。サーバもポーリングも使わない。

- 出すのは `SessionStart` の `source` が `startup` か `clear` のときだけである。`resume`・`compact`・
  値が無い・未知の値のとき（標準入力が読めないときを含む）は出さず、既読にもしない
- 既読にするのは出した 1 件だけで、残りの未読は次の `startup`・`clear` から 1 件ずつ出る。
  標準出力への書き出しか既読の記録に失敗したときは既読にならず、次回また同じ 1 件が出る
- `systemMessage` は `title` と `body` を改行でつないだもの（`title` が無ければ `body` だけ）である。各項目は任意で `url` を持てる。
  表示してよい形（`https://` のみ等）は `plugin/hooks/_notices.py` が判定し、不正な `url` は項目ではなく
  `url` だけを無視する。有効な `url` は本文末尾に `詳細: <url>` として付く
- `claude -p` や Agent SDK からの起動（`CLAUDE_CODE_ENTRYPOINT` が `sdk-` 始まり）では、
  表示はするが既読にしない

1 件ずつ出す理由と、`resume`・`compact` で出さない理由は `../decisions/plugin.md` にある。
表示の接頭辞と長文の退避の挙動は `../knowledge/claude-code-behavior.md` にある。

## 改訂履歴

- 2026-09-25: 設定の定義を `policy.py` に分け、`SET` / `ADD` / `REMOVE` / `ONCE`・バックアップ・
  statusline.js の同期・`/governance:reapply` を加えた。途中の dict を作れるのを `env` だけに
  限っていた規則を、`extraKnownMarketplaces` の下だけ作らない規則にした
- 2026-09-25: `user_email` を `SessionStart` ごとに解決し直すようにし、送信の打ち切りと送信先が空のときの退避・破棄を書いた
- 2026-09-26: hook の失敗（error 行）を加えた
- 2026-09-26: 無効化スイッチの範囲と送信の条件を実装にそろえ、理由・上流の仕様・運用の値を `decisions/`・`knowledge/`・`guide/` へ移した
- 2026-09-26: 重複の扱いの参照先を `decisions/server.md` にした
- 2026-09-28: Claude Code 本体の版（`claude_code_version`）の収集と、本体の自動更新を強制する設定を加えた
- 2026-09-28: HTTP のエラー応答での送信の打ち切りと、error 行の状態コードごとの集約を書いた
- 2026-09-28: 本体が読めない settings.json・アンインストールで消える状態・ONCE の記録の範囲・送る値・同じ内容のバックアップを取らないことを書いた。送る値に MCP の `tool_name` を含め、収集の分岐の範囲を実装にそろえた
- 2026-09-28: `config.json` が無いときに退避も破棄もしないことと、spool が送信先を持たないことを書いた
- 2026-10-09: お知らせを `startup` と `clear` のときに未読の先頭から 1 件ずつ出すことを書いた
- 2026-10-09: バックアップの置き場を `settings-backups/` の日時のフォルダにし、自動では消さないこと・`statusLine` の指すファイルを写すこと・導入・更新の後にも保存することを書いた
