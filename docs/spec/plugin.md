# cc-governance-bmsd 端末プラグイン仕様書

## 概要

Claude Code の端末プラグイン。設定の自動適用・お知らせの表示・利用イベントの収集と送信を
行う。配布名は `governance`、ソースは `plugin/`。全体像と契約（`plugin/hooks/contract.py`）
の位置づけは `system.md` にある。

hook の入口は `plugin/hooks/collect.py`（全 hook 共通の収集）と `session_start.py`
（設定適用 → お知らせ表示 → 収集）の 2 つだけであり、`_` 始まりのファイルは内部モジュール
である。端末の状態（識別子のキャッシュ・既読・送信待ち）は `${CLAUDE_PLUGIN_DATA}`
（無ければ `~/.claude/cc-governance/`）に置く。

## 規約

- 標準ライブラリだけで書く。配布先に `pip install` を求めない
- hook は常に `exit 0` し、標準エラーには何も出力しない。標準出力に書くのは
  `session_start.py` の hook JSON 出力 1 回だけである
- `tool_input` は `skill` キーだけを名指しで読む。`prompt` / `tool_response` / `message`
  には触れない
- ファイル名を標準ライブラリのモジュール名と衝突させない（`plugin/hooks/` は `sys.path` の
  先頭に来うる）

`hooks.json` に登録するコマンドは `python3 "${CLAUDE_PLUGIN_ROOT}/hooks/collect.py" <hook名>`
の形の 1 行とし、`${...}` を二重引用符で囲む。パイプ・`;`・`&&`・リダイレクトを含めず、
条件分岐・後処理・無効化スイッチの判定はすべて Python 側に置く。1 行 100 文字未満に収める。

登録する hook は `hooks.json` にある 7 種にとどめ、網羅登録はしない。

## 収集

`collect.py` は hook の種類で分岐せず、標準入力の JSON から契約の `HOOK_FIELDS` が名指しした
キーパスだけを引く。来ないキーは NULL になる。

**許可するのはキーパスだけで、値の中身は検査しない。**`skill_name`・`command_name`・
`command_source` は利用者が自由に命名できる文字列であり、255 文字までそのまま送信・永続化
される。

- `user_email` は突合キーである。環境変数 `CC_GOVERNANCE_USER_EMAIL` →
  `git config --global user.email` → NULL の順に解決してキャッシュし、小文字化だけ行う
- `event_id` はイベントごとの UUID であり、一意性は保証しない（重複の扱いは `server.md`）
- `context_tokens` は `PreCompact` と `Stop` のときだけ、transcript の末尾から取った絶対値を送る
- 列名が `compact_trigger` なのは、`trigger` が MySQL の予約語だからである

環境変数 `CC_GOVERNANCE_DISABLE` が空でないとき、**利用ログの収集とお知らせの表示**
（ブラウザの起動を含む）を止める。設定の適用・その policy イベントの記録・送信は止めない。

## 蓄積と送信

イベントは状態ディレクトリの `queue.jsonl` に 1 行ずつ追記する。`SessionStart` と `Stop` の
末尾で、前回送信から 10 分以上経っていれば送信プロセスを切り離して起動し、hook 自身は待たずに
終わる。送信プロセスはキューを `spool/` へ退避し、古い順に `POST /ingest`（タイムアウト
60 秒）し、2xx のものだけ消す。値は `plugin/config.json` にある。

- リトライループ・指数バックオフ・ACK は持たない。失敗分は次回まとめて再送される
- `spool/` が 5MB または 7 日を超えたら古いものから破棄する
- 再送で同じイベントが二重に届きうる。件数はサーバが `event_id` で一意化して数える
- **オフライン・spool 上限超過・hook 失敗による取りこぼしは仕様として受け入れる**
- 送信先 URL のスキームは検査しない。`http://` にすると受信トークン（共有秘密）・
  `user_email`・`host` が平文で流れるため、`ingest_url` には `https://` を設定する運用で防ぐ

## 設定の自動適用

`session_start.py` は、契約の `POLICY` に書かれた値を `settings.json`（`CLAUDE_CONFIG_DIR`、
無ければ `~/.claude`）へ強制的に適用する。利用者が施策を選ぶモードは無い。施策を変えるときは
`POLICY` を直してリリースする（手順と、キーを削除してはならない理由は `../guide/release.md`）。

- 差分が無ければ書かない。読んでから書くまでに mtime が変わっていたら今回は諦め、
  パースに失敗したら何もしない。書き込みは一時ファイル + `os.replace` で原子的に行う
- `POLICY` のキーは `.` 区切りのパスであり、途中の名前に `.` を含められない。入れ子の途中が
  無いとき、作ってよいのは `env` だけである
- 結果はキーごとに policy イベント（書き込み前の値 `prev_value` と適用結果）として記録する。
  サーバはこの `prev_value` で準拠を判定する

`~/.claude/settings.json` が権威である（同期の挙動は `../knowledge/claude-code-behavior.md`）。

`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` は公開された環境変数で、1〜100 の割合で指定し、低いほど
早く圧縮が走る。既定より高い値は無視され、発火する絶対トークン数はモデルによって異なる。
この施策が効くのは、上限に達する前に圧縮するセッションだけである。

## お知らせの配信

`plugin/notices.json`（ロジックを持たない純データ）のうち、既読集合に無いものを、hook の
JSON 出力の `systemMessage` 1 つにまとめて返す。サーバもポーリングも使わない。

- 各項目は任意で `url` を持てる。開いてよい形（`https://` のみ等）は `plugin/hooks/_notices.py`
  が判定し、不正な `url` は項目ではなく `url` だけを無視する。有効な `url` は本文末尾に
  `詳細: <url>` として付く
- 既定ブラウザで開くのは、有効な `url` を持つ未読の先頭 1 件だけであり、対話セッション
  （`CLAUDE_CODE_ENTRYPOINT` が `cli`）かつ既読の記録に成功したときに限る。
  対応 OS は macOS と Windows である
- `claude -p` や Agent SDK からの起動（`CLAUDE_CODE_ENTRYPOINT` が `sdk-` 始まり）では、
  表示はするが既読にしない

表示の接頭辞と長文の退避の挙動は `../knowledge/claude-code-behavior.md` にある。
**お知らせ 1 件は日本語で 600 字程度までに収める。**
