# governance プラグイン 機能棚卸し（Mods 移行の前段）

## 前提と範囲

- 対象: `work/wt-mods-feasibility/plugin/`（版 0.2.1）。型定義は `claude-code.d.ts`（2.1.288、20,198 行。以下「型 L<行>」）。前段の実機結果 `spikes/mods-probe/RESULTS.md` は 2.1.287
- ファイルの変更・git 操作・claude の起動はしていない。読んだだけ
- 表記: 「事実」はコードか型定義に書いてあること。「推測」は明記する。行番号は `plugin/` 起点の `ファイル:行`
- `CSV_COLUMNS`（contract.py:66-81）はサーバの CSV 取込だけが使い、端末は触らないので取得元表から外した

---

## 1. 機能の一覧

### A. 起動と全体の規約

| # | 機能 | 今の実装 | 入力・トリガ | 出力・副作用 | 規約上の制約 |
|---|---|---|---|---|---|
| A1 | hook の登録 | hooks/hooks.json:1-83 | 7 イベント: UserPromptSubmit・UserPromptExpansion・PostToolUse（matcher `*`）・PostToolUseFailure（`*`）・PreCompact・Stop は `collect.py <名前>`（timeout 10 秒）。SessionStart は `session_start.py`（timeout 60 秒）。SessionStart に matcher が無いので startup・resume・clear・compact の全部で走る | – | コマンドは `python3 "${CLAUDE_PLUGIN_ROOT}/hooks/<入口>.py" <hook名>` の 1 行。パイプ・`;`・`&&` は使わない。100 文字未満（spec/plugin.md:23-26）。PreToolUse・SessionEnd は登録していない（decisions/plugin.md:184-187） |
| A2 | 常に exit 0・標準エラーに出さない | collect.py:126-134、session_start.py:158-162、_sender.py:120-121 | – | 例外は error 行として積み、BaseException（KeyboardInterrupt を含む）も握り潰す | spec/plugin.md:18-19。標準出力に書くのは session_start.py の JSON 1 回だけ |
| A3 | import 中の SIGINT を無視 | collect.py:3-9、session_start.py:6-10 | スクリプトとして起動したとき | `_signal` で SIG_IGN | import 中にトレースバックが標準エラーに漏れるのを防ぐ。Python 固有 |
| A4 | 段ごとの例外の隔離（SessionStart） | session_start.py:118-155 | – | 次の順に走り、各段が個別に try する: identity → statusline → apply_settings → notices → 出力 → mark_seen → collect（イベント 1 行と送信判定） | 1 つの段が失敗しても残りは止めない。出力は上で何が失敗しても必ず 1 回（空の JSON でも出す）（:145-146） |
| A5 | 無効化スイッチ `CC_GOVERNANCE_DISABLE` | collect.py:24,113-115、session_start.py:120,111-115、_notices.py:110-111 | 環境変数が空でない | collect.py: 何もしない（Stop の送信判定もしない）。session_start.py: イベント 1 行・お知らせ（ブラウザ起動と既読の書き込みを含む）を止める。identity の再解決・statusline の同期・設定の適用・policy 行・送信判定は続ける | decisions/plugin.md:30,52-54。`collect.main()` に委ねない（委ねると無効化した端末の policy 行が消え、準拠率の分母から落ちる） |

### B. 収集（イベント行）

| # | 機能 | 今の実装 | 入力・トリガ | 出力・副作用 | 規約上の制約 |
|---|---|---|---|---|---|
| B1 | 標準入力の読み取り | collect.py:89-98 | hook の stdin | JSON を読めなければ None。dict でなければ hook 由来の列はすべて NULL で、端末側の列だけ入る（:29） | – |
| B2 | 列の抽出 | collect.py:27-52、contract.py:6-25,84-89 | stdin の dict | `HOOK_FIELDS` のキーパスだけを `dig` で引き、`coerce` で型に寄せる。hook の種類で分岐しない | 許すのはキーパスだけで、値の中身は検査しない（spec/plugin.md:30-35）。`tool_input` は `skill` だけを名指しで読み、`prompt`・`tool_response`・`message` には触れない（:20-21）。追加列は `raw_extra.get(name)` で引く（添字で引くと列を足したときに無言で全損する。decisions:59-60） |
| B3 | 型への寄せ（coerce） | contract.py:98-160 | 値と型の文字列 | VARCHAR: bool は `"true"`/`"false"`、str・int・float は `str()`、dict・list などは None。孤立サロゲートは `encode("utf-8","replace")` で `?` に置き換えてから宣言長で切り詰める（Python の str の切り詰めはコードポイント単位）。INTEGER/BIGINT: bool は int、int、整数の文字列。int64 の範囲外は None。DOUBLE: 数値と数値の文字列（bool は None）。未知の型は None | decisions/plugin.md:102-111（スカラ以外は None・int64 の範囲・置換を切り詰めの前に行う・例外を投げない） |
| B4 | context_tokens | _context.py:6-20,41-82、collect.py:22,82-86 | PreCompact・Stop の `transcript_path` | 末尾 256 KiB を読み、末尾から見て最初に `message.usage` の `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` が 0 でない行の合計を採る。取れなければ NULL。ほかのイベントでは NULL | 絶対値だけ（使用率にしない。decisions:27）。合計 0 の行（API エラー応答）は飛ばす（_context.py:17-19）。値は bool・数値に限り、深い入れ子による RecursionError も捕まえる |
| B5 | claude_code_version | _context.py:23-38 | PreCompact・Stop の transcript | 末尾 256 KiB で、最も末尾に近い行の文字列の `version` を採る。無ければ NULL | 末尾だけを読む（transcript の形は公式の契約ではない） |
| B6 | 1 行の追記 | collect.py:120 → _spool.append | 全 7 イベント | `{"kind":"event", ...}` を queue.jsonl に追記する | B7 を参照 |

### C. 蓄積と送信

| # | 機能 | 今の実装 | 入力・トリガ | 出力・副作用 | 規約上の制約 |
|---|---|---|---|---|---|
| C1 | 状態ディレクトリ | _spool.py:10-11,25-33 | `CLAUDE_PLUGIN_DATA`、無ければ `~/.claude/cc-governance/` | 毎回評価する | 定数にすると隔離の差し替えが効かない（:27-28）。本体が実際に使うのは `$CLAUDE_CONFIG_DIR/plugins/data/<plugin>-<marketplace>/`（knowledge）。アンインストールで消える（spec:12-14） |
| B7/C2 | キューへの追記 | _spool.py:48-60 | 1 行 | `queue.jsonl` へ `json.dumps(row, ensure_ascii=True)+"\n"` を 1 回の write で追記する。OSError は無視 | 1 回の write なのでキューは壊れない（decisions:156）。`ensure_ascii=True`（False だと孤立サロゲートで落ちる） |
| C3 | 送信判定 | collect.py:23,101-110,122-123、session_start.py:115、_spool.py:80-103 | SessionStart と Stop の末尾 | `queue.jsonl` があり、`sent_at` が無いか mtime から 600 秒以上経っているか、mtime が未来なら、先に `sent_at` を touch してから送信プロセスを起こす | 間隔は `DEFAULT_FLUSH_INTERVAL_SEC=600`（:18）。`sent_at` は成否を問わず更新する（decisions:50-51）。判定するのは queue.jsonl の有無だけで、spool の残りは見ない。`_sender` は判定が通ったときだけ import する（ssl の読み込みを避ける） |
| C4 | 送信プロセスの切り離し | _sender.py:124-135 | – | `sys.executable _sender.py` を stdin・stdout・stderr を DEVNULL にし、`start_new_session=True` で起動して待たない | hook の中では POST しない（decisions:25）。本体の終了後も走り続ける |
| C5 | 設定の読み込み | _sender.py:17-25,33-42、config.json | `plugin/config.json` | 読めない・dict でない → 何もせず終わる（退避も破棄もしないので queue.jsonl が上限なしに増える）。キーが無ければ既定値（ingest_url `""`・token `""`・timeout 60・spool_max_bytes 20 MiB・spool_max_days 14） | spec:67-68。開発ツリーに本番の送信先を置き、検証の側で差し替える（decisions:122-127） |
| C6 | 退避 | _spool.py:63-77 | 送信プロセスの開始 | queue.jsonl が在って空でなければ `spool/<epoch>-<uuid4hex>.jsonl` へ `os.rename` | 同じ秒の退避が先のファイルを上書きしないよう UUID を付ける |
| C7 | POST | _sender.py:53-76,79-104 | spool の `*.jsonl` をファイル名の昇順で | 1 ファイルを 1 リクエスト: `POST <ingest_url>`、本文はファイルのバイト列のまま、`Content-Type: application/x-ndjson`、`X-Ingest-Token: <token>`、timeout `timeout_sec`。2xx ならそのファイルを消す。読めないファイルは飛ばす | ingest_url が空なら POST しない（退避と破棄はする）（:114-115）。リトライ・バックオフ・ACK は持たない（spec:62）。URL のスキームは検査しない（decisions:158） |
| C8 | 打ち切り | _sender.py:27-30,89-103 | 各応答 | サーバに届かない（接続不可・タイムアウト・壊れた応答 `HTTPException`・OSError）→ その回を打ち切る。401・403・404 → 打ち切る。5xx が 2 回続く → 打ち切る（2xx とそれ以外の応答で数え直す）。ほかのエラー応答（400・413 など）→ 次のファイルへ | decisions:42-49。打ち切った回も、送れなかったファイルは消さない |
| C9 | 送信の error 行 | _sender.py:70-72,99-100,116-118,120-121 | 失敗 | 失敗した状態コードを初めて出た順に集め、1 回の送信につき状態コードごとに 1 行、`HTTP <code>` を積む。SSL の失敗は例外クラス名で積む。接続不可・タイムアウトは積まない。`run()` 全体の例外は stage `send` | error 行が送信回数の二乗で増えないため（decisions:42-44）。hook_event は None |
| C10 | 破棄 | _spool.py:106-143、_sender.py:119 | 送信の後 | spool の `.jsonl` のうち mtime が 14 日より古いものを消し、残りを古い順に消して合計を 20 MiB 以下にする | 破棄は送信の後に置く（単体で上限を超えるファイルも 1 回は送る。decisions:40-41）。取りこぼしは仕様として受け入れる（spec:74-75） |
| C11 | 二重送信の扱い | – | – | 再送で同じ行が二度届きうる。サーバが `event_id` で一意化して数える | 送信プロセスの多重起動は排他しない（decisions:211） |

### D. error 行

| # | 機能 | 今の実装 | 入力・トリガ | 出力・副作用 | 規約上の制約 |
|---|---|---|---|---|---|
| D1 | error 行の組み立て | collect.py:55-79 | 段の例外 | `{"kind":"error"}` に ERROR_COLUMNS を入れる。user_email の解決に失敗したら None。記録自体の失敗も握り潰す | 例外メッセージ・トレースバックは持たない。持つのは固定値の段名と、例外クラス名か `HTTP <code>` だけ（decisions:55-58） |
| D2 | stage の一覧 | – | – | `collect`（collect.py:131・session_start.py:155）・`identity`（:126）・`statusline`（:132）・`apply_settings`（:137）・`notices`（:143）・`mark_seen`（:150）・`send`（_sender.py:26） | 段の中で値を空にして続けた失敗は記録しない（spec:80-81） |

### E. 識別子

| # | 機能 | 今の実装 | 入力・トリガ | 出力・副作用 | 規約上の制約 |
|---|---|---|---|---|---|
| E1 | user_email | _identity.py:13,21-89 | 環境変数 `CC_GOVERNANCE_USER_EMAIL` → `identity.json` のキャッシュ → `git config --global user.email`（timeout 3 秒） | 小文字にする。解決できなかった結果（None）もキャッシュする。環境変数の値もキャッシュに書く。SessionStart では `refresh=True` でキャッシュを読まずに解決し直す（session_start.py:123-126） | git の出力が UTF-8 でない場合の UnicodeDecodeError も捕まえる（:59-61）。git の timeout は hook の timeout より短くする |
| E2 | host | _identity.py:92-93 | `platform.node()` | – | 送る値に含まれる（spec:46-48） |
| E3 | event_id | _identity.py:96-97 | `uuid.uuid4()` | 36 文字 | 一意性は保証しない |
| E4 | plugin_version | _identity.py:100-119 | `$CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json` の `version`（無ければこのファイルの 2 階層上） | 文字列でなければ None | policy 行と error 行に載る |

### F. 設定の自動適用

| # | 機能 | 今の実装 | 入力・トリガ | 出力・副作用 | 規約上の制約 |
|---|---|---|---|---|---|
| F1 | 対象パス | _govdir.py:11-36 | `CLAUDE_CONFIG_DIR`、無ければ `~/.claude` | `<config_dir>/settings.json`、`<config_dir>/governance/`（絶対パス） | 毎回評価する。利用者が施策を選ぶモードは無く、強制だけ（decisions:29） |
| F2 | 標準設定の定義 | hooks/policy.py:9-31 | – | 今の SET: `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE="60"`・`extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate=true`・`autoUpdatesChannel="latest"`・`env.DISABLE_AUTOUPDATER="0"`・`env.DISABLE_UPDATES="0"`・`env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE="1"`。ADD・REMOVE・ONCE は空 | policy は session_start の段の中で import する（失敗をほかの段に波及させない。session_start.py:60-65）。見本は policy_sample.py（hook は読まない） |
| F3 | 読み込み | _settings.py:15-35 | settings.json | 無い → `missing`（`{}` から始め、新しく作る）。UTF-8 で読めない・BOM 付き・JSON として壊れている・RecursionError・トップが dict でない・stat に失敗 → `parse_failed` | 本体は BOM 付き・Latin-1 を読むのにプラグインは読まない、という食い違いを受け入れている（spec:107-108、decisions:177）。壊れたファイルを直さない（decisions:28） |
| F4 | シンボリックリンクの解決 | _settings.py:38-46,98 | パス | 実体のパスに解決してから読む・書く | `os.replace` はリンクを普通のファイルに化けさせるため |
| F5 | 操作の適用 | _policy_ops.py:146-152 | dict・policy・ONCE の記録 | SET → ADD → REMOVE → ONCE の順。キーは `.` 区切り | 途中の名前に `.` を含められない（spec:90-91） |
| F6 | SET | _policy_ops.py:65-86 | パスと値 | 型まで含めて一致すれば `already_ok`。違えば深いコピーで上書きして `pending`。値 None はキーを消す（無ければ `already_ok`）。途中の dict は作るが、`extraKnownMarketplaces` の下には作らない（`skipped_missing`）。途中が dict でなければ `skipped_missing` | 型まで含めて比べる（`1 == True` を一致にしない。decisions:63-64）。比べるのは外側の型だけで、dict・list の中は Python の `==` で比べる（:39-41） |
| F7 | ADD・REMOVE | _policy_ops.py:89-115 | パスと要素 | ADD: 対象が list でなければ `skipped_missing`。無い要素だけ末尾に足す（要素の比較は F6 と同じ）。REMOVE: ある要素だけ消す。どちらも value は足した・消した要素の JSON 配列で、prev は NULL | – |
| F8 | ONCE | _policy_ops.py:9,118-143、_govdir.py:74-97 | `once.json` の記録 | (パス, 値) ごとに 1 回だけ SET と同じく書く。記録のキーは `json.dumps([path, value], sort_keys=True, ensure_ascii=False)`（置き換える前の値）。値の文字列の中の `${GOVERNANCE_HOME}` を `<config_dir>/governance` の `/` 区切りの絶対パスに置き換える | 記録と value は置き換える前の値で作る（個人のパスがサーバに載らない。decisions:71-72）。記録に残すのは `applied` か `already_ok` になった組だけで、記録が変わったときだけ書く（_settings.py:111-118）。記録は今配っている組だけを持つ |
| F9 | 書き込み | _settings.py:56-89,104-109 | pending が 1 件以上 | settings.json と同じディレクトリに一時ファイルを作り、`json.dumps(indent=2, ensure_ascii=False)+"\n"` を書く → mtime_ns が読んだときと違えば `skipped_conflict` → 元のファイルがあればバックアップ（失敗したら `write_failed`）→ `os.replace` で `applied`。OSError は `write_failed`。一時ファイルは必ず消す。pending の全項目に同じ結果を入れる | 差分が無ければ書かない。一時ファイルを同じディレクトリに置くのは、別のファイルシステムをまたぐ置き換えを避けるため（decisions:61-62）。戻せない書き込みをしない（decisions:75） |
| F10 | バックアップ | _govdir.py:13-17,39-71 | 書き込みの直前 | `<gov>/backups/settings-<%Y%m%d-%H%M%S-%f>-<NN>.json` を O_EXCL・モード 0600 で作る。最新の世代と同じ内容なら作らず成功を返す。連番 00〜09 を試す。名前順で新しい 10 世代だけ残す | 0600 にするのは env にトークンが入りうるから。アンインストールしても残る（spec:125-127） |
| F11 | policy 行 | session_start.py:34-73、contract.py:163-175 | 適用の結果 | キーごとに `{"kind":"policy"}` を 1 行。全行で ts が同じ（:69）。key_name は SET ならパスそのまま、ほかは `add:`・`remove:`・`once:` を前に付ける。value は配る値（dict・list は `json.dumps(sort_keys=True, ensure_ascii=False)`。区切りは `", "` と `": "`）。prev_value は SET・ONCE の書き込み前の値で、スカラ以外は NULL。apply_result は `applied`・`already_ok`・`skipped_missing`・`skipped_conflict`・`parse_failed`・`write_failed` のどれか。parse_failed のときは全項目を同じ結果で積む（_policy_ops.py:155-165） | サーバは SET の prev_value で準拠を判定する（spec:115）。prev_value のスカラ以外を NULL にするのは、env の dict を丸ごと送らないため（decisions:68-70） |
| F12 | 責務の範囲 | spec:122-123 | – | 利用者の settings.json に書き戻すところまで | プロジェクトの設定やセッション中の変更による上書きは追わない |

### G. お知らせ

| # | 機能 | 今の実装 | 入力・トリガ | 出力・副作用 | 規約上の制約 |
|---|---|---|---|---|---|
| G1 | お知らせの読み込み | _notices.py:17,24-39 | `plugin/notices.json` | list でなければ空。項目は dict で、`id` が str、`body` が str か無いものだけを残す（壊れた項目だけ飛ばす） | 純データ。サーバもポーリングも使わない（decisions:22） |
| G2 | 既読 | _notices.py:10,20,42-67 | 状態ディレクトリの `seen.json` | 読めなければ空集合として扱う。書けたかどうかを返す | 一時ファイルを経ずに上書きする（decisions:178） |
| G3 | 表示文字列 | _notices.py:95-119 | 未読 | 1 件を `title\nbody` にし（title が空なら body だけ）、有効な url があれば body の後ろに `\n詳細: <url>` を付ける。項目は空行で区切る。hook 出力の `systemMessage` 1 つにまとめる | 対話では `SessionStart:<source> says: ` の接頭辞が付き、長い文面はファイルへ退避される（knowledge）。`-p` では stream-json の hook_response にだけ出る |
| G4 | URL の検査 | _notices.py:11-16,70-92 | 項目の `url` | `https://` で始まる・2048 文字以下・ASCII・0x00〜0x20 と 0x7f と `"<>\^\`|{}` を含まない・ホストがある。不正なら url だけを無視する | – |
| G5 | 出力 | session_start.py:88-103,146 | – | 標準出力に JSON を 1 回だけ書く。失敗したら fd 1 を /dev/null に差し替える（終了時の flush で exit 120 になるのを防ぐ） | 標準出力に書くのはこの 1 回だけ |
| G6 | 既読にする | session_start.py:76-85,146-150、_browser.py:7-19 | 出力に成功し、未読がある | `CLAUDE_CODE_ENTRYPOINT` が `sdk-` で始まれば何もしない（表示はするが既読にしない）。それ以外は 既読 ∪ 未読 を書く | 判定は接頭辞一致（decisions:93-94）。VS Code 拡張などの値（未確認）は既読にする側 |
| G7 | ブラウザで開く | session_start.py:82-85、_notices.py:86-92、_browser.py:12-14,22-39 | 既読の書き込みに成功し、`CLAUDE_CODE_ENTRYPOINT == "cli"` | 有効な url を持つ未読の先頭 1 件だけを開く。macOS は `open <url>` を切り離して起動、Windows は `os.startfile`、ほかの OS では何もしない | 対話の判定は許可リスト（`cli` だけ。decisions:91-92）。書けない端末で毎回開かない。`webbrowser.open` を使わない（約 1.4 秒待つ）。Windows で `cmd /c start` を使わない（URL の `&` で分断される） |

### H. ステータスライン

| # | 機能 | 今の実装 | 入力・トリガ | 出力・副作用 | 規約上の制約 |
|---|---|---|---|---|---|
| H1 | statusline.js の同期 | _govdir.py:19-21,100-115、session_start.py:128-132 | 毎回の SessionStart（設定の適用より前） | 同梱の `statusline/statusline.js` と内容が違うときだけ `<gov>/statusline.js` へ、一時ファイル `.statusline.js.tmp` を経て `os.replace` | 書きかけを実行させない。失敗はほかの段に波及させない。今の policy には statusLine の項目が無い（ONCE が空）ので、同期はするが settings からは参照されていない（見本は policy_sample.py:39-45） |
| H2 | 表示内容 | statusline/statusline.js:1-161 | 本体が statusLine のコマンドに渡す stdin の JSON | 1 行目: `<model.display_name に effort.level を反映>` \| `<cwd の basename>` \| `ctx <used_percentage>% (<used>/<window>)` · `session <total_input_tokens+total_output_tokens>` · `edit (+<total_lines_added>, -<total_lines_removed>)`。used は current_usage の 3 値の合計、表記は `138k`・`1M`。effort は名前に `1M context` があれば `1M - <level>`、無ければ `<name> (<level>)`。2 行目: git の管理下なら `<branch か短い HEAD> [<worktree.name>] (+a, -r)`（`git diff --shortstat HEAD`、各 git の timeout は 500 ms） | 入力が壊れていても必ず exit 0（:147-161）。node で動く |

### I. 再適用コマンド

| # | 機能 | 今の実装 | 入力・トリガ | 出力・副作用 | 規約上の制約 |
|---|---|---|---|---|---|
| I1 | `/governance:reapply` | skills/reapply/SKILL.md:1-32、hooks/reapply.py:13-20 | 利用者のスラッシュコマンド（`disable-model-invocation: true`） | モデルが `python3 reapply.py` を 1 回実行する: statusline の同期 → `once.json` を消す → 適用し直す → `<結果>\t<項目>` を 1 行ずつ出す。モデルが結果を表にし、バックアップの在り処と「再起動が要る場合がある」を添える | hook ではないので例外を隠さない。policy 行は積まない（次の SessionStart がその時点の状態を記録する）。結果の説明は SKILL.md:18-25 の表 |

---

## 2. 契約の項目ごとの取得元表

Mods の列は型 L の行番号。「classic」は `on('classic.<Event>', ...)` の `e` を指す。型 L1071-1072 によると、その `e` は hook の stdin の入力全体（`transcript_path`・`cwd` を含む）。

### 2.1 HOOK_FIELDS（contract.py:6-25）

| 列 | 今の取得元 | Mods の候補 | 実機で確かめること |
|---|---|---|---|
| session_id | stdin `session_id`（全 hook） | classic `e.session_id`（BaseHookInput 型 L675-677）。ほかに `$.session.id()`（L2592） | classic の値が command hook と一致するか。`/clear` の後の値 |
| prompt_id | stdin `prompt_id` | classic `e.prompt_id`（L680-682。最初の入力までは無い） | 独自イベント（`prompt.submit` など）には無い。classic で取るしかない |
| tool_name | PostToolUse・PostToolUseFailure の `tool_name` | classic `e.tool_name`（L7392, L7406） | `tool.call` の `e.tool` は表記が違いうる（MCP の封筒は L5658）。classic を使うべき |
| source | SessionStart の `source`（L10956） | classic `e.source` | **型 L13693 によると UserPromptSubmit にも `source?: 'user'|'sdk'|...` がある**。今の実装も UserPromptSubmit の行の `source` 列に値を入れている可能性がある（contract.py:11 の註記は SessionStart だけ）。現行のデータと Mods の両方で確かめる |
| compact_trigger | PreCompact の `trigger` | classic `e.trigger`（L7419） | classic.PreCompact が mod で発火するか（未検証） |
| command_name / command_source | UserPromptExpansion | classic `e.command_name`・`e.command_source`（L13680-13683） | classic.UserPromptExpansion が発火するか（未検証）。mod が答えるコマンド（`/reapply` を mod にした場合）で発火するか |
| skill_name | PostToolUse の `tool_input.skill` | classic `e.tool_input.skill`（`tool_input: unknown` L7407） | Skill ツールの PostToolUse で同じキーに入るか |
| effort_level | `effort.level` | classic `e.effort.level`（L690-698） | – |
| permission_mode | `permission_mode` | classic `e.permission_mode`（L683） | – |
| agent_id | `agent_id` | classic `e.agent_id`（L684-687） | サブエージェントのツール呼び出しで付くか |
| is_interrupt | PostToolUseFailure の `is_interrupt` | classic `e.is_interrupt`（L7396、boolean） | 寄せ方（bool → 0/1）を同じにする |

### 2.2 EXTRA_COLUMNS（contract.py:27-37）

| 列 | 今の取得元 | Mods の候補 | 実機で確かめること |
|---|---|---|---|
| event_id | `uuid.uuid4()` | `crypto.randomUUID()`（型 L13893） | 書式（v4・小文字・36 文字） |
| ts / day | `int(time.time())`、`to_day` | `$.clock.now()`（L3225、ミリ秒）を 1000 で割って切り捨てる。to_day は同じ式（contract.py:182-184） | テストでは mock の時計になる |
| user_email | 環境変数 → `identity.json` → `git config --global user.email`（3 秒） | `$.env.get('CC_GOVERNANCE_USER_EMAIL')`（L3390。名前は文字列リテラルでなければならない）、キャッシュは `$.store`（L3143-3167）か `$.fs`、git は `$.process.run(['git','config','--global','user.email'], {timeoutMs:3000})`（L3307, L7538-7556） | `$.env` が settings の env とシェルの export のどちらを反映するか。git の PATH の解決と Windows。出力が UTF-8 でないとき。小文字化（Python の `lower` と JS の `toLowerCase` は ASCII 以外で違いうる） |
| host | `platform.node()` | **型定義にホスト名の API は無い**（`hostname` は URL の型 L13865 にしか出てこない）。候補は `$.process.run(['hostname'])`、Windows なら `$.env.get('COMPUTERNAME')` | 今の値とバイト単位で一致するか（macOS の `.local`、Windows の大文字小文字）。一致しないとサーバ上で別の端末に見える |
| hook_event | argv[1]（hooks.json の固定の文字列） | 登録した classic のイベント名、または `e.hook_event_name` | – |
| context_tokens | PreCompact・Stop で transcript の末尾 256 KiB から（B4） | `$.session.usage().context.tokens`（L2622-2642、型 L10265-10270: 「最後の応答が答えた入力トークン数。キャッシュなし・書き込み・読み出しの合計」、つまり今と同じ 3 値の和）。**transcript を読み続ける案は成り立たない**: `$.fs.read` には位置指定が無く、4 MiB を超えると reject する（L3018-3020）。`turn.complete` の `e.usage` はターン内の全 API 呼び出しの合計（RESULTS:112）なので、この列の定義と違う | classic.Stop・classic.PreCompact の時点の値が transcript から取った値と一致するか、1 ターン先を行くか（公式は transcript が遅れうると書く）。API エラーのとき（型 L11009-11011 は「無い値は 0 にせず省く」）。圧縮の直後・再開の直後。サブエージェントの影響。型 L10267 が括弧書きで「the status line's `total_input_tokens`」と書いており、statusline.js が扱う累計（:63）と名前がぶつかる。どちらの意味か確かめる |
| claude_code_version | PreCompact・Stop で transcript の `version` | `$.session.version().version`（L2659, L11075-）。ほかのイベントでも取れる | transcript の `version` と同じ文字列か（開発版の表記を含む）。PreCompact・Stop だけに入れて今と揃えるか、全イベントに入れるか（契約は同じ列のままだが、データの意味が変わる）は決める必要がある |

### 2.3 POLICY_COLUMNS（contract.py:39-51）

| 列 | 今の取得元 | Mods の候補 | 実機で確かめること |
|---|---|---|---|
| event_id・ts・day・user_email・host | 2.2 と同じ（全行で ts が同じ） | 2.2 と同じ | – |
| key_name | `policy_key_name(op, path)` | 純粋な関数として移す | – |
| value | `policy_text`: dict・list は `json.dumps(sort_keys=True, ensure_ascii=False)`（区切りは `", "` と `": "`）にしてから VARCHAR(255) | JS で同じ文字列を作る（`JSON.stringify` はキーを並べ替えず、区切りに空白を入れないので、そのまま使うと違う文字列になる） | 今の SET の値はすべてスカラなので、今は影響しない。ADD・REMOVE・dict の値を配ったときに一致するか |
| prev_value | 書き込み前の値を `coerce`（VARCHAR） | 同じ | **float の文字列化が違う**（Python は `60.0` を `"60.0"`、JS は `"60"`）。サーバは SET の prev_value で準拠を判定する |
| apply_result | 6 つの値（F11） | 同じ語彙 | – |
| plugin_version | `plugin.json` の `version` | `$.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)`（`$.plugin.root` L2141-2144）。`PluginRegisterInput.version` は他の mod を判定する側にしか渡らない | ディレクトリ型のマーケットプレイスでは root が元のディレクトリになる（RESULTS:61-62） |

### 2.4 ERROR_COLUMNS（contract.py:53-64）

| 列 | 今の取得元 | Mods の候補 | 実機で確かめること |
|---|---|---|---|
| event_id・ts・day・user_email（失敗したら None）・host | 2.2 と同じ | 同じ | – |
| hook_event | 呼び出し元のイベント名。送信では None | 同じ | – |
| plugin_version | 2.3 と同じ | 同じ | – |
| stage | 7 つの固定値（D2） | 同じ固定値 | 段の構成が変わると対応が崩れる |
| error_type | Python の例外クラス名か `HTTP <code>` | JS の `error.name`（`TypeError`・`Error` など）か `HTTP <code>` | **値の語彙が変わる**（列は同じ）。`$.http.fetch` の例外の文言には URL が入る（RESULTS:102-106）ので、message を送ってはならない。SSL の失敗と接続不可を区別できるか |

### 2.5 行の外側（送信の形）

| 項目 | 今 | Mods の候補 | 実機で確かめること |
|---|---|---|---|
| 行の種別 | `kind`: `event`・`policy`・`error` | 同じ | – |
| 行の書式 | `json.dumps(ensure_ascii=True)` の NDJSON | `JSON.stringify` と、ASCII 以外を `\uXXXX` にする処理 | サーバは JSON として読むので、書式の違いは意味に効かないはず（推測） |
| 送信先・トークン | `plugin/config.json` の `ingest_url`・`ingest_token` | `$.fs.read($.plugin.root + '/config.json')`（今と同じく同梱）。userConfig（型 L7185-7197）は利用者の settings の `pluginConfigs` に値を置く方式なので、配り方が変わる | – |
| リクエスト | POST・`Content-Type: application/x-ndjson`・`X-Ingest-Token`・timeout 60 秒 | `$.http.fetch(url, {method, headers, body})`（L3261-3283、HttpInit L4898-4932） | **HttpInit に timeout も AbortSignal も無い**。応答しないサーバを `timeout_sec` で打ち切れるか。本文は string だけ（今はファイルのバイト列。UTF-8 の文字列として読めば同じはず。推測） |

### 2.6 coerce を JS に移すときの差（型定義ではなく言語の差。事実）

- 切り詰め: Python の str の切り詰めはコードポイント単位で、JS の `slice` は UTF-16 の単位。絵文字などで長さが変わり、サロゲートの対が割れる
- 孤立サロゲート: Python は `encode('utf-8','replace')` で `?` に置き換える。JS では自前で置き換える必要がある（`$.ui.toast` は U+FFFD で描く。型 L2257-2258）
- 数値: Python は int と float を区別し、JS は区別しない（F6 の型まで含めた比較で、`1` と `1.0` の扱いが変わる）。int64 の範囲を超える値は JS の number では精度が落ちる
- 整数の文字列: Python の `int()` は前後の空白と `1_000` を受け付け、JS の `Number()`・`parseInt` は別の規則で読む

---

## 3. Mods 側の候補 API の要点（型 2.1.288）

### classic.*

- イベントの一覧は HookInput の union（型 L4863）: PreToolUse・PostToolUse・PostToolUseFailure・PostToolBatch・PermissionDenied・Notification・UserPromptSubmit・**UserPromptExpansion**・SessionStart・**SessionEnd**・Stop・StopFailure・SubagentStart・SubagentStop・**PreCompact**・PostCompact・Pre/PostModelSwitch・PermissionRequest・Setup・TeammateIdle・TaskCreated・TaskCompleted・Elicitation・ElicitationResult・ConfigChange・InstructionsLoaded・WorktreeCreate・WorktreeRemove・CwdChanged・FileChanged・DirectoryAdded・MessageDisplay。今の 7 イベントはすべて含まれる
- **command hook が無くても発火する**: 型 L1064-1066「Each fires wherever the engine runs the classic hook, whether or not any settings hook is configured」
- 連鎖の順は「managed settings の hook → hooks module 群 → その他の settings hook（core として）」（型 L1074-1075）
- `e` は stdin 全体。PreToolUse だけは ToolCallEnvelope（型 L1071-1079）。入力の型: BaseHookInput（L675-700）、PostToolUseFailure（L7390）、PostToolUse（L7404）、PreCompact（L7417）、SessionEnd（L10351）、SessionStart（L10954-10977。resume のときは `context_tokens`・`seconds_since_last_response` なども付く）、Stop（L11423）、UserPromptExpansion（L13678）、UserPromptSubmit（L13687-13695）
- **返り値の ClassicResult に `systemMessage` が無い**（L1096-1180）。SessionStart が返せるのは additionalContext・initialUserMessage・sessionTitle・watchPaths・reloadSkills（L1192）だけ。今の `systemMessage` によるお知らせは、mod の返り値では出せない
- 形の違うフィールドを返すと、その hook は失敗して飛ばされる（L1100-1101）

### ターンと使用量

- `turn.complete`（L4182-4190）、TurnCompleteFields（L12478-12512）: `answer`・`durationMs`・`isAborted`・`turnId`・`agentId?`・`usage?`（中断・API エラーでは無い）。TurnUsage（L12805）は ModelUsage（L6006-6027。input・output・cache_read・cache_creation の 4 値）に `model` を足したもの
- `$.session.usage()`（L2622-2642）→ SessionUsage（L11015-11042）: `startedAt`・`context`（SessionContextUsage L10265-10290: `tokens?`・`window`・`percent?`・`breakdown?`）・`rateLimits`・`cost?`。引数なしの呼び出しはタダ。`session.measure`（L4135-4143, L10410-）は同じ値を押し出しで届ける
- `$.session.version()`（L2659, L11075-）: `version`・`base`・`builtAt`
- `session.start` の入力（L10982-10997）: `cwd`・`surface`（`-p` では null）・`isInteractive`（REPL では true、`-p` と SDK では false）

### 終了と時間の上限

- `session.end`（L4144-4155, L10360-10383）: 全 hook と `$` の待ちと core をまとめて**既定 1.5 秒**の壁時計の上限で縛る。「only a process a command let go of outlives it」（L10362）。reason（L10385-10392）は `prompt_input_exit`・`clear`・`resume`・`logout`・`other`（`-p` の終了やシグナル）
- hook の予算は 1 回の dispatch あたり 10 秒（HookBudget L4803-4813。`next` や `$` を待つ間は時計が止まる）。`.catch` の猶予は 1 秒（L4814-4820）。`.catch` の登録は Registration（L8680-8690）。NextBudget（L6205-6222）

### ファイル・ストア・時計

- `$.fs`（L3007-3135）: read（UTF-8 のテキストか bytes、4 MiB で reject）・write（「creating it and its directories as needed」。原子性・権限については書いていない）・list・exists・stat（`mtimeMs`、`{resolve:true}` で `realPath`）・ancestors。**delete・rename・append・mkdir・chmod は無い**。絶対パスはそのまま使い、行き先を決めるのは `fs.*` の hook（L3011-3013）。つまり他の mod が書き込みを拒否しうる。二次資料は「write はアトミックでない」と書く（型定義には記述が無い）
- `TextDecoder` はラベルしか取らない（L13843-13847）。型の上では `fatal` 指定で UTF-8 として読めないことを検出する手段が無い
- `$.store`（L3137-3167）: 利用者の config ディレクトリの下にあるプラグイン専用の JSON ファイル。セッションとホットリロードをまたいで残る。**合計 4 MiB で reject**（L3155-3157）。並行書き込みについての記述は無い（RESULTS:43 の実測では、同じキーへの更新が消える）
- `$.state`（L3168-3208）: セッション中だけの値で、ホットリロードをまたぐ。永続化は `$.store` で行う
- `$.clock`（L3210-3258）: now・sleep・after・every。ホットリロードで保留中の待ちは取り消される

### 外部とのやり取り

- `$.http.fetch`（L3261-3283）: http・https。組織の web-fetch ポリシーが拒否しうる。`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` は組み込みの mod の要求と、`auth` を付けた要求を拒否する。HttpInit（L4898-4932）は method・headers・body（string）・auth・socketPath だけで、timeout は無い。HttpResponse（L4934-）は status・ok・headers・text
- `$.process.run`（L3290-3307）: **CLI でだけ使える**。シェルを通さない。終了コードにかかわらず resolve し、起動できないとき・timeout（既定 30 秒、最長 10 分）のときは reject。git はリポジトリの hook を切って走る。ProcessRunInit（L7538-7556）は cwd・env・stdin・timeoutMs
- `$.process.spawn`（L3308-3345）: ループを抜ける・`return()`・`next.signal` の中断・モジュールの解放で子を殺す。今の `_sender` のように切り離した送信プロセスの代わりにはならない
- `$.settings.read`（L3355-3370）: **読むだけ**。マージ後の値か、source ごとの値（user・project・local・flag・policy。L11119-11127。user は `~/.claude/settings.json` と書いてある）。返るのはスナップショットで、書き換えても本体の読む値は変わらない（L11100-11105）。**settings.json に書く API は無い**
- `$.config.list/set`（L2893-2918）、ConfigRow（L1810-1846）: `/config` メニューの行だけを扱う（本体の行か、プラグインの userConfig）。`isLocked` は managed が値を握っているかを示す。任意の settings キー（env・extraKnownMarketplaces）は書けない
- `$.env.get/set`（L3380-3402）: このプロセスの環境変数。名前は文字列リテラルでなければならず、validate が一覧にする

### 画面とコマンド

- `$.ui.toast`（L2247-2261）: プラグイン名の下に数秒（既定 4000 ms、ToastOptions L11928）。スクロールバック型の画面では通知バーの 1 行になる
- `$.ui.status`（L2263-2273）: プロンプトの下に置くプラグインごとの 1 行
- `$.ui.log`（L2216-2230、UiLogSink L13071-13085）: `transcript`（それだけの淡い行）か `debug`
- `$.ui.open`（L2275-2296、PaneOpenArgs L6933）: ペイン。頼まれずに開くときは 144 列以上で配置し、狭ければ配置されないまま待つ。`-p` ではすべて配置する。ほかに close・panes
- `$.ui.ask`（L2232-2246）: 本体の AskUserQuestion のダイアログ。`-p` では reject
- 描ける部品（RenderComponent L8712）: AbovePrompt・Pane・InfoNotice・PromptHint ほか。**ステータスラインの部品は無い**
- `Link`（LinkProps L5322-5344）: 端末では OSC 8 のハイパーリンク。https（か `http://localhost`）・2048 文字以下・印字可能な ASCII
- **URL をブラウザで開く API は無い**。代わりに使えるのは `$.process.run(['open', url])`（macOS）くらい
- `$.command.register`（L2874-2887）・`command.run`（L1610-1700）: `{text, context?, exitCode?}` を返す。exitCode は `-p` で効く

### 読み込みと tier

- `plugin.register`（L4157-4167）、PluginRegisterInput（`name`・`tier`・`root`・`version?`・`provenance`・`uses`）、PluginRegisterUses（L7262-）
- Tier（L11889-11907）: `prepend`・`user`・`append`・`builtin`・`core`。prepend と append は「管理者が並べる managed のプラグイン」と書いてある。`next.to` が飛び先にできる TargetTier（L11617-11620）は prepend と user 以外
- userConfig・PluginOptions（L7185-7197）: settings.json の `pluginConfigs[<plugin>].options` に入る。sensitive な値は secure storage に入る。required の値が無いと読み込みに失敗する
- managed: 型定義に出てくるのは classic の連鎖（L1074）・ConfigRow.isLocked（L1842）・settings の source `policy`（L11124）・tier の説明だけ。`allowManagedModsOnly` などのキーは型定義に出てこない（二次資料にはある）
- `$.plugin.name/root`（L2136-2145）。プラグインのデータディレクトリ（`CLAUDE_PLUGIN_DATA` に当たるもの）を返す API は無い

---

## 4. 実機で確かめるべき点

### 収集

1. classic.UserPromptSubmit・UserPromptExpansion・PostToolUse・PostToolUseFailure・PreCompact・SessionStart が mod で発火するか。前段で確かめたのは classic.Stop だけ（RESULTS:21）。`-p` と対話の両方、command hook が無い状態で
2. classic の `e` に、今使っているキー（`tool_input.skill`・`effort.level`・`is_interrupt`・`command_source`・`trigger`・`agent_id`・`prompt_id`）が command hook の stdin と同じ値で入るか
3. 発火回数が command hook と一致するか（PostToolUse の matcher `*`、サブエージェントのツール呼び出し、SessionStart の各 source）
4. UserPromptSubmit の `source` が今のデータの `source` 列に入っているか（型 L13693）
5. context_tokens: `$.session.usage().context.tokens` と transcript から取った値の一致（Stop・PreCompact・API エラー・圧縮の直後・再開）
6. claude_code_version: `$.session.version().version` と transcript の `version` の一致
7. `CC_GOVERNANCE_DISABLE` を `$.env.get` で読めるか（シェルの export と settings の env の両方）
8. フォルダ信頼を承認する前の SessionStart を mod が取りこぼさないか（mod は承認まで読み込まれない。RESULTS:116）。command hook との差
9. ホットリロードで session.start がもう一度発火しても、二重に数えないか（classic.SessionStart を使えば避けられるはず。推測）
10. mod が答えるスラッシュコマンドは prompt.submit に数えない（RESULTS:113）。`/reapply` を mod にすると、UserPromptSubmit・UserPromptExpansion の件数が今と変わるか
11. `--safe-mode`・`disableAllHooks`・`/plugin` で止まる範囲が、今の command hook と同じか（二次資料は、`--safe-mode` はインストール済みの mod を止めると書く）
12. 同じ user tier にいる他の mod との順序（握り潰しへの弱さは今と同じ。RESULTS:142）

### 蓄積と送信

1. `$.fs` に append が無いので、並行セッションのキューの書き込みで行が消えないか（`$.store` は同じキーで更新が消えることを実測済み。RESULTS:43）。案は、プロセスかセッションごとのファイルに分けること
2. `$.fs.write` の原子性と、書いている途中で落ちたときの壊れ方
3. 4 MiB の上限: 長くオフラインだった端末の queue・spool は 1 ファイルで 4 MiB を超えうる（今は分割送信をしない）。`$.fs.read` が reject すると、そのファイルは永久に送れない
4. delete・rename が無い: 2xx の後の削除・退避・破棄・古いバックアップの削除をどうするか（`$.process.run(['rm',…])` は Windows で動かない）
5. 本体の終了後まで送信を続けられるか: session.end は 1.5 秒しかない。`-p` はすぐ終わる。`$.clock.every` は対話の間しか回らない。`$.process.run` で自分を切り離すコマンドを起こしたとき、それが生き残るか（L10362）
6. timeout: HttpInit に timeout が無い。応答しないサーバに対して hook が止まり続けないか（`$` を待つ間は予算の時計が止まる。L4805-4812）
7. 失敗の分類: 接続不可・SSL・HTTP を例外から区別できるか。例外の message（URL を含む）を送らないこと
8. 対話セッションで外部 URL へ fetch したときに許可を求められるか（未検証。RESULTS:162）。組織の web-fetch ポリシー。`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
9. 会社 PC（Bedrock・社内プロキシ・社内 CA）で `$.http.fetch` が届くか。証明書とプロキシの扱いは Python の urllib と違いうる（urllib はキーチェーンを見ない。memory）
10. `sent_at` の置き場（`$.store` か fs）と、同時に開いたセッションの一斉送信を防げるか
11. 既存の `CLAUDE_PLUGIN_DATA` にある queue.jsonl・spool を失わずに引き継げるか（パスは `$CLAUDE_CONFIG_DIR/plugins/data/<plugin>-<marketplace>/` を自分で組み立てる必要がある。marketplace 名を取る API は無い）

### 設定の自動適用

1. `$.fs.read` が UTF-8 でない・BOM 付きの settings.json をどう読むか。置換文字で黙って読めてしまうと、書き戻したときに利用者の設定を壊す（今は `parse_failed` で何もしない）
2. 原子的な置き換えができない: 書いている途中の settings.json を本体が読むと、ファイルごと無視されてプラグインまで止まる（knowledge「settings.json の読み込み」）。代わりの手段（`$.process.run` の mv、Windows では？）
3. シンボリックリンク: `stat({resolve:true}).realPath` に書けば、今と同じくリンクを保てるか
4. mtime の比較が `mtimeMs`（ミリ秒）でも衝突を検出できるか
5. バックアップ: O_EXCL と 0600 の代わりがあるか（`$.fs.write` は権限を指定できない）。古い世代を消せるか
6. 書き出す JSON の書式が Python の `json.dumps(indent=2, ensure_ascii=False)` と同じになるか（違うと、初回に余計な書き換えとバックアップが出る）
7. `CLAUDE_CONFIG_DIR` の解決（`$.env.get`）。`$.settings.read({source:'user'})` が `CLAUDE_CONFIG_DIR` に従うか（型の説明は `~/.claude/settings.json` と書く）
8. classic.SessionStart の中で書いた値が反映される時機が今と同じか（今は次のセッションから効く。autoUpdate は次のセッションで known_marketplaces に現れる）
9. 他の mod の `fs.*` hook や組み込みのガードが settings.json への書き込みを拒否しないか（会社の環境で）
10. value・prev_value の文字列が Python と一致するか（2.6 の差、JSON の区切りと sort_keys）
11. ONCE の記録のキーを今の `once.json` と同じ文字列で作れるか（違うと 1 回分を書き直す。今の ONCE は空なので、今は影響しない）

### UI（お知らせ・状態行・/reapply）

1. お知らせの出し方: systemMessage は使えない。toast（4 秒、改行と長文の扱いは不明）・`$.ui.log` の transcript 行・Pane・AbovePrompt のどれが今の「1 回だけ確実に見せる」に当たるか
2. `-p` での扱い: 今は stream-json の hook_response にお知らせが出る。toast・status は `-p` では出ない（RESULTS:16,23）
3. classic.SessionStart・session.start の時点で toast が画面に出るか（画面ができる前に呼んでも消えないか）
4. 既読にする条件: 今は「出力に成功したら」既読にする。`$.ui.toast` は void で、成功を返さない。条件をどう置き換えるか
5. 対話の判定: `CLAUDE_CODE_ENTRYPOINT`（`$.env.get` で読めることは確認済み。RESULTS:11）と `e.isInteractive` が VS Code・desktop で一致するか
6. ブラウザ起動: `$.process.run(['open', url])` が待たずに戻るか。Windows でシェルを通さずに開く方法（未確認）
7. statusline.js の同期を原子的にできるか（同上）。`$.ui.status` は行頭に `⚠` が付き黄色で描かれ、置き場所も違う（RESULTS:111）ので、statusLine の代わりにはならない
8. `/reapply` を mod のコマンドにした場合の名前（`/governance:reapply` のままにできるか、スキルと衝突しないか）。モデルが作っていた表を mod が自分で作ること。`-p` での exitCode
9. `$.command.register` は session.start で毎回登録する必要がある（前段の実装）。登録より前にコマンドが打たれた場合

### 識別子・基盤

1. host の一致（2.2）
2. plugin_version: ディレクトリ型と git のマーケットプレイスで、`$.plugin.root` の下の plugin.json が正しい版を指すか
3. `$.store` のファイル名がマーケットプレイスで決まる（RESULTS:65）。入れ直したときやアンインストールしたときに識別子のキャッシュと既読がどうなるか（今はアンインストールで消える）
4. Mods に対応していない古い本体の端末: hooks.json が `modules` だけになると、何も動かなくなるか（command hook と併記できることは二次資料にある。型定義には記述が無い）
5. Bedrock 認証・Windows での動作（RESULTS:156-157 で未検証）
6. 2.1.287（前段の実機）と 2.1.288（型定義）の差

---

## 5. Mods で可能になる改善候補

- **python3 への依存が無くなる**（事実: mod の TypeScript は本体がそのまま実行する。RESULTS:96）。Windows の python.org 版に `python3.exe` が無い問題（decisions:86-89）と、pyenv のシムによる起動の遅れ（knowledge）が消える
- **お知らせを Pane や AbovePrompt のバンドで出す**（推測）: `Link`（OSC 8）と「既読にする」ボタンを置けば、ブラウザを勝手に開かず、利用者が押したら既読にできる。接頭辞や長文の退避（knowledge）も避けられる
- **`/reapply` がモデルを呼ばなくなる**（事実: mod が答えるコマンドは `num_turns=0`・費用 0。RESULTS:17）。結果の表も決まった形になる
- **context_tokens が transcript の遅れと形の変化に左右されにくくなる**（推測）: `$.session.usage()` は型で定義された値。読み取り範囲（256 KiB）による欠測のベースライン（decisions:207）も無くなる見込み
- **claude_code_version を全イベントで取れる**（事実: `$.session.version()`）。契約の列は同じで、入れる範囲を変えるかどうかを決める
- **実際に効いている設定値を観測できる**（事実: `$.settings.read()` のマージ値と `{source:'policy'|'project'}`）。今の system.md:102-105 は、上位の設定による上書きは画面から気づけないと書いている。記録するには契約の追加が要るので、今回の範囲（契約は同じ）の外
- **managed の握りを検出できる**（事実: ConfigRow.isLocked）。上と同じく、記録するなら契約の追加
- **他の mod が classic.* を購読していることを検出できる**（事実: `plugin.register` の `e.uses.events`。ただし判定できるのは自分より後に読み込まれる mod だけ。RESULTS:73-74）。error 行の新しい stage として積めば列は増えない（推測。stage の語彙が増える）
- **対話の間に定期送信できる**（事実: `$.clock.every` が予定どおり発火した。RESULTS:22）。今の「SessionStart と Stop の時点で 600 秒経っていれば」より早く届く
- **サブエージェントを含むトークン数**（事実: `turn.complete` の `e.agentId` と `e.usage`。RESULTS:38）。契約の追加が要るので今回の範囲の外
- **コンテキストの閾値を押し出しで受け取れる**（事実: `session.measure`）。施策の可視化（例: 状態行での警告）に使える（推測）

---

## 6. 読んでいて気づいた食い違い（参考）

- RESULTS.md:52-53・142 は「governance が使う 9 イベント」に PreToolUse と SessionEnd を含めているが、hooks.json が登録しているのは 7 イベントで、PreToolUse は採らないと決めている（decisions:184）。9 つは敵対的 mod の検証で観測したイベントの数を指していると読める
- contract.py:11 は `source` に「SessionStart」とだけ註記しているが、型 2.1.288 では UserPromptSubmit にも `source` がある（L13693）
- 今の policy には statusLine の項目が無いのに、statusline.js は毎回同期している（H1）。Mods に移すときに、同期を残すかどうかを決める必要がある
- 送信判定は queue.jsonl の有無しか見ないので、spool にだけ残りがあっても送信は起きない（_spool.py:85-87）。実際には SessionStart の行が毎回積まれるので、問題にはならないはず（推測）
