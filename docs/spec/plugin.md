# cc-governance-bmsd 端末プラグイン仕様書

## 1. 概要

Claude Code の端末プラグイン。設定の自動適用・お知らせの表示・利用イベントの収集と送信を
行う。配布名は `governance`。開発リポジトリ内のフォルダ名は `plugin`。

## 2. 構成

```
plugin/
  .claude-plugin/plugin.json    # プラグイン定義（name / version / description）
  hooks/hooks.json              # hook 登録（どのイベントで何を呼ぶか）
  hooks/contract.py             # 契約の正本。端末もサーバもこれ 1 つを読む
  hooks/collect.py              # 全 hook 共通のイベント収集エントリ
  hooks/session_start.py        # 設定適用 + お知らせ表示 + collect
  hooks/_context.py             # transcript 末尾から context_tokens を取る
  hooks/_spool.py               # ローカルキューへの追記・spool への退避・上限での破棄
  hooks/_sender.py              # detach して POST する独立プロセス
  hooks/_identity.py            # user_email / host / event_id の解決とキャッシュ
  hooks/_settings.py            # settings.json の読み書き（原子的置換）
  hooks/_notices.py             # 未読お知らせの選定・出力文字列の組み立て
  hooks/_browser.py             # 起動形態の判定 + お知らせの URL を既定ブラウザで開く処理
  notices.json                  # お知らせ文面（ロジックを持たない純データ）
  config.json                   # 送信先 URL・受信トークン・送信条件
  skills/                       # 配布スキル
  commands/                     # 配布コマンド
```

`_` 始まりのファイルはプラグイン内部のモジュールであり、hook の入口にはならない。入口は
`collect.py` と `session_start.py` の 2 つだけである。

端末の状態は `${CLAUDE_PLUGIN_DATA}` 配下（無ければ `~/.claude/cc-governance/`）に置く。

```
${CLAUDE_PLUGIN_DATA}/          # 無ければ ~/.claude/cc-governance/
  identity.json     # user_email / host / インストール識別子のキャッシュ
  seen.json         # 既読のお知らせ ID 集合
  queue.jsonl       # 送信待ちイベント（追記のみ）
  spool/            # 送信中・送信失敗のファイル
  sent_at           # 最終送信時刻（空ファイルの mtime で表現する）
```

## 3. 規約

- 端末側は標準ライブラリだけで書く。配布先に `pip install` を求めない
- hook は常に `exit 0` する。標準エラーには何も出力しない。標準出力は `collect.py` が常に
  無出力、`session_start.py` は hook の JSON 出力（`systemMessage` など、§5.5）を 1 回だけ書く
- `tool_input` は `skill` キーのみを名指しで読む。`prompt` / `tool_response` / `message`
  には一切触れない
- ファイル名は標準ライブラリのモジュール名と衝突させない（`plugin/hooks/` は
  `sys.path` の先頭に来うる）

`hooks.json` の各エントリは次の形を守る。

- 登録するコマンドは `python3 "${CLAUDE_PLUGIN_ROOT}/hooks/collect.py" <hook名>` の形の
  1 行とする
- `${...}` は必ず二重引用符で囲む
- パイプ・`;`・`&&`・リダイレクトを含めない。条件分岐や後処理はすべて Python 側に置く
- 無効化スイッチの判定も Python 側で行う。コマンド文字列を条件付きにしない
- 1 行 100 文字未満に収める

## 4. 運用設計

### 4.1 登録する hook

登録は 7 種にとどめる。網羅登録はしない。

| hook | 取得する主なもの |
| --- | --- |
| `SessionStart` | 設定の適用・お知らせ表示・`source` の記録・送信のトリガ |
| `UserPromptSubmit` | `prompt_id` / `permission_mode` |
| `UserPromptExpansion` | `command_name` / `command_source` |
| `PostToolUse` | `tool_name` / `skill_name` / `agent_id` |
| `PostToolUseFailure` | `is_interrupt` / 失敗時の `tool_name` |
| `PreCompact` | `compact_trigger` + 圧縮直前の `context_tokens` |
| `Stop` | ターン終了時の `context_tokens` / 送信のトリガ |

### 4.2 無効化スイッチ

環境変数 `CC_GOVERNANCE_DISABLE` が空でない値のとき、プラグインは**利用ログの収集と
お知らせの表示**を止める（お知らせに伴うブラウザの起動も含む）。設定の適用・その policy
イベントの記録・送信は止まらない。

### 4.3 識別子

| 識別子 | 解決方法 |
| --- | --- |
| `user_email` | 環境変数 `CC_GOVERNANCE_USER_EMAIL` → `git config --global user.email` → NULL の順に初回のみ解決してキャッシュする。小文字化のみ行う |
| `host` | `platform.node()` |
| `event_id` | イベントごとに `uuid.uuid4()` を生成する。主キーにも UNIQUE 制約にもしない |

### 4.4 リリース

プラグインの `version` を上げる操作と、マーケットプレイスへの差し込み手順は
[`release.md`](../guide/release.md) にある。上流仕様の変化に人手で追随する箇所は本書 §5.4 に
まとめる。

## 5. 仕様一覧

### 5.1 収集する項目と取得元

`collect.py` は hook の種類で分岐しない。標準入力の JSON に対して、契約に定義された
キーパスを `dict.get` で順に引くだけである。来ないキーは `None` になる。

```python
# contract.py（抜粋・正本）
HOOK_FIELDS = (
    # (列名, キーパス, 型) の 3 つ組。行末の註記は届く hook であって要素ではない
    ("session_id",      ("session_id",),          "VARCHAR(255)"),  # 全 hook
    ("prompt_id",       ("prompt_id",),           "VARCHAR(255)"),  # 広範
    ("tool_name",       ("tool_name",),           "VARCHAR(255)"),  # PostToolUse / PostToolUseFailure
    ("source",          ("source",),              "VARCHAR(255)"),  # SessionStart
    ("compact_trigger", ("trigger",),             "VARCHAR(255)"),  # PreCompact
    ("command_name",    ("command_name",),        "VARCHAR(255)"),  # UserPromptExpansion
    ("command_source",  ("command_source",),      "VARCHAR(255)"),  # UserPromptExpansion
    ("skill_name",      ("tool_input", "skill"),  "VARCHAR(255)"),  # PostToolUse
    ("effort_level",    ("effort", "level"),      "VARCHAR(255)"),  # PostToolUse / Stop / PostToolUseFailure
    ("permission_mode", ("permission_mode",),     "VARCHAR(255)"),  # 複数 hook
    ("agent_id",        ("agent_id",),            "VARCHAR(255)"),  # サブエージェントのツール呼出
    ("is_interrupt",    ("is_interrupt",),        "INTEGER"),       # PostToolUseFailure
)
```

`compact_trigger` の列名が `trigger` でないのは、`trigger` が MySQL の予約語であるため
である。キーパスの解決は契約の `dig(obj, path)` が行い、途中のキーが無い場合でも例外に
せず `None` を返す。

値の型変換は契約の `coerce(value, type)` に閉じる。

| 列の型 | 変換 |
| --- | --- |
| `VARCHAR(n)` | `str()`。ただし真偽値は小文字の `true` / `false` にする。宣言長 `n` で切り詰める |
| `INTEGER` / `BIGINT` | 真偽値・整数・整数文字列を `int` に寄せる |
| `DOUBLE` | 数値と数値文字列を `float` に寄せる |

いずれも解釈できない値は `None` にする。`None` は `None` のまま通す。

許可リストに載っている列でも、値そのものの中身は検査しない。`skill_name`（`tool_input.skill`）・
`command_name`・`command_source` は利用者が自由に命名できる文字列であり、255 文字までそのまま
送信・永続化される。収集を止めているのはキーパスの許可リストだけであり、値の語彙は絞っていない。

端末側で組み立てる列。

| 列 | 取得元 |
| --- | --- |
| `event_id` | 端末で `uuid.uuid4()` を 1 イベントにつき 1 つ生成 |
| `ts` | `int(time.time())` |
| `day` | 契約の `to_day(ts)`。`ts` を JST に寄せた epoch 日（`(ts + 9*3600) // 86400`） |
| `user_email` | `_identity.py` |
| `host` | `platform.node()` |
| `hook_event` | hook 登録時にコマンド引数で渡す hook 名 |
| `context_tokens` | transcript 末尾から算出（§5.2） |

### 5.2 コンテキスト使用量の取得

hook 入力の `transcript_path` を使い、末尾 256KB だけを読む。行を逆順に走査して最初に
見つかった `message.usage` の 3 値を足す。3 値の合計が 0 の行は採らず、さらに遡る。

```python
def context_tokens(path, tail=256 * 1024):
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - tail))
            chunk = f.read()
    except OSError:
        return None
    for line in reversed(chunk.split(b"\n")):
        try:
            u = json.loads(line).get("message", {}).get("usage") or {}
        except Exception:
            continue
        n = (u.get("input_tokens", 0)
             + u.get("cache_creation_input_tokens", 0)
             + u.get("cache_read_input_tokens", 0))
        if n:
            return n
    return None
```

呼ぶのは `PreCompact` と `Stop` の 2 か所のみ。率には変換せず、絶対値のまま送る。

### 5.3 蓄積と送信

蓄積 — 状態ディレクトリの `queue.jsonl` に 1 行 1 イベントを追記する
（`open(..., "a")` + 1 回の `write`）。ロックもインデックスも持たない。

送信の起動条件 — `SessionStart` と `Stop` の末尾で、前回送信から 10 分以上経過している
（`sent_at` の mtime で判定する）ときだけ送信プロセスを起動する。

起動方法 — `subprocess.Popen` による detach（`stdin/stdout/stderr` を `DEVNULL`、
`start_new_session=True`）。hook 自身は待たずに即座に `exit 0` する。

送信プロセスの動作。

1. `queue.jsonl` を `spool/<epoch>-<uuid4hex>.jsonl` に `os.rename` する（アトミック）
2. `spool/` 内のファイルを古い順に `POST /ingest` する
   （`Content-Type: application/x-ndjson`、タイムアウト 60 秒、トークンをヘッダに付与）
3. 2xx なら削除。それ以外は残す（次回まとめて再送される）

送信元は `config.json` の `ingest_url` のスキームを検査しない。`http://` を設定すると、
`X-Ingest-Token`（共有秘密）・`user_email`・`host` が平文で送信される。イベント本文に自由文は
無いが、共有秘密が平文で流れる経路になる。`ingest_url` には `https://` を設定する運用で防ぐ。

送信失敗時 — リトライループも指数バックオフも ACK も持たない。`spool/` の合計が
5MB または 7 日を超えたら、古いものから破棄する。

重複と取りこぼし — 再送で同じイベントが二重に登録されうるが、`event_id` があるため
集計側の `COUNT(DISTINCT event_id)` で件数は正確になる。オフライン・spool 上限超過・
hook 失敗による取りこぼしは仕様として受け入れる。

### 5.4 設定の自動適用

`session_start.py` は、設定の適用 → お知らせの表示 → イベントの収集の順に実行する。

設定の適用は `~/.claude/settings.json` に対して次の手順で行う。

1. ファイルを読み、同時に mtime を控える
2. ポリシー値と現在値を比較する。差分がなければ書かない
3. 書き込み直前に mtime を読み直し、1 で控えた値と異なっていたら今回は書かずに諦める
4. 書き込みは一時ファイル + `os.replace` で原子的に行う
5. パース失敗時は何もしない
6. 結果を policy イベントとしてキューに積む

policy イベントが持つもの。

| 項目 | 内容 |
| --- | --- |
| `key_name` | ポリシー項目のキー（`settings.json` 内のパス） |
| `value` | 適用後の値 |
| `prev_value` | 書き込み前に `settings.json` にあった値（キーが無ければ NULL） |
| `apply_result` | `already_ok` / `applied` / `skipped_conflict` / `skipped_missing` / `parse_failed` / `write_failed` のいずれか |
| `plugin_version` | 端末で動いているプラグインの版。`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` の `version` |

ポリシーの定義は契約の `POLICY` 1 か所に置く。

```python
POLICY = {
    # キーは settings.json 内のパス。`.` で入れ子をたどる
    "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60",  # 自動圧縮の窓の 60% で圧縮する
    "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": True,  # 配布経路の自動更新
}
```

キーの途中に現れる名前に `.` を含められない（マーケットプレイス名を含むキーがあるため）。
入れ子の途中のキーが存在しないとき、`env` セクションは作ってよいが、それ以外は作らない。

自動圧縮は割合で指定する。この環境変数は公開された仕様であり、値は 1〜100 の割合で、
低い値ほど早く圧縮が走る。既定より高い値は無視される。発火する絶対トークン数はモデルに
よって異なる。この施策は、コンテキストの上限に達する前に圧縮するセッションにのみ効く。

`~/.claude/settings.json` が権威である。Claude Code はセッション開始時に、
`settings.json` の `extraKnownMarketplaces` を内部の一覧
（`~/.claude/plugins/known_marketplaces.json`）へ上書き同期する。

適用モードは強制のみである。利用者が施策を選択的に適用するモードは設けない。

施策を変えるときは `POLICY` を直して git push する。JSON カタログ化はしない。

### 5.5 お知らせの配信

`notices.json` はロジックを持たない純データである。

```json
[
  {"id": "2026-09-01-a", "title": "...", "body": "...", "url": "https://..."}
]
```

`session_start.py` が、ローカルの既読 ID 集合（`seen.json`）に無い項目を、hook の
JSON 出力の `systemMessage` として返す。サーバもポーリング API も不要である。

未読が複数あるときは、空行 1 つで区切って 1 つの `systemMessage` にまとめる。接頭辞が
付くのは全体の 1 行目だけである。既読に加えるのは出力が成功した後である。

各項目には任意で `url` を持たせられる。開いてよい形は次のすべてを満たすものである。

- `https://` で始まる（小文字）
- 長さが 2048 字以下
- ASCII のみ
- 空白・制御文字・二重引用符・`<` `>` `\` `^` `` ` `` `|` `{` `}` を含まない
- ホスト部が空でない

不正な `url` は、項目そのものではなく `url` だけを無視する（`title` / `body` は表示する）。
有効な `url` は、その項目の本文の末尾に `詳細: <url>` として追記される。

未読のうち、有効な `url` を持つ先頭 1 件に限り、既定ブラウザで開く。開くのは次の両方を
満たすときだけである。

- 起動形態が対話セッションである（環境変数 `CLAUDE_CODE_ENTRYPOINT` が `cli`）
- 既読の記録（`seen.json` への書き込み）に成功している

`CLAUDE_CODE_ENTRYPOINT` が `sdk-` で始まる値（`claude -p`・Agent SDK からの起動）のときは、
テキストの出力は行うが既読には加えない。それ以外（値が無い・未知の値）では、既読には
加えるが、ブラウザは開かない。

開き方は OS ごとに異なる。macOS は `open` を detach 起動（`stdin`/`stdout`/`stderr` を
`DEVNULL`、`start_new_session=True`）、Windows は `os.startfile`（ShellExecute）で開く。
それ以外の OS では何もしない。

表示には `SessionStart:<source> says: ` の接頭辞が付く。`source` は
`startup` / `resume` / `clear` / `compact` のいずれかである。長い文面は Claude Code が
ファイルへ退避し、先頭のプレビューとパスだけが表示される（日本語で約 680 字、ASCII で
約 2,000 字を境に退避が始まる）。お知らせ 1 件は日本語で 600 字程度までに収める。

### 5.6 契約（端末とサーバで共有する定義）

正本は `plugin/hooks/contract.py` ただ 1 ファイルである。

- 端末 — プラグインの一部としてそのまま配布される
- サーバ — `cc-governance-monitor` リポジトリの `contract.py` が、正本のバイト列に生成物
  ヘッダを付けた複製である。複製とハッシュ記録（`contract.sha256`）は、このリポジトリの
  `scripts/sync_contract.py` が正本から生成する

```
python scripts/sync_contract.py          複製とハッシュを正本から書き出す
python scripts/sync_contract.py --check  書き込まず、正本・複製・ハッシュの一致だけを検証する
```

契約が持つのは次の 5 つの定数と、4 つの小さな関数だけである。

| 定数 | 導出されるもの |
| --- | --- |
| `HOOK_FIELDS` | ① 端末の抽出処理 ② `events` の DDL 列と型 ③ INSERT 文の列順 ④ 受信 API の検査 ⑤ 起動時の列の突き合わせ |
| `EXTRA_COLUMNS` | `event_id` `ts` `day` `user_email` `host` `hook_event` `context_tokens` の型定義 |
| `POLICY` | ① 端末が適用する設定値 ② `policy_state` に記録する `key_name` / `value` ③ 画面の準拠判定 |
| `POLICY_COLUMNS` | ① `policy_state` の DDL 列と型 ② INSERT 文の列順 ③ 受信 API の検査 ④ 起動時の列の突き合わせ |
| `CSV_COLUMNS` | ① CSV ヘッダ → 列名の対応 ② `cost_daily` の DDL ③ INSERT 文 ④ 起動時の列の突き合わせ |

`CSV_COLUMNS` の要素は `(CSV ヘッダ名, 列名, 型)` の 3 つ組である。`source_file` は
CSV に対応するヘッダを持たないため、ヘッダ名を `None` として同じ表に並べる。

| 関数 | 責務 |
| --- | --- |
| `dig(obj, path)` | キーパスの安全な解決 |
| `coerce(value, type)` | 列の型に合わせた値の変換 |
| `to_day(ts)` | epoch 秒から JST 基準の epoch 日を求める。端末とサーバの両方が呼ぶ |
| `ddl()` | 定数から `CREATE TABLE` 文を組み立てる |

`HOOK_FIELDS` と `EXTRA_COLUMNS` の列名集合は互いに素である。これは契約の不変条件であり、
`ddl()` の先頭で重複を検出して例外を投げる。`is_interrupt` は hook 入力から取る値である
ため `HOOK_FIELDS` に属する。`EXTRA_COLUMNS` が持つのは、端末側で組み立てる列だけである。

`HOOK_FIELDS` は挙動を切り替える設定ファイルではない。「どのキーパスがどの列になるか」
という単一の事実であり、これを読み込んで動作を分岐させるコードは存在しない。

## 6. 上流仕様の変化への備え

| 上流の変化 | 起きること |
| --- | --- |
| hook 入力にキーが増える | 何も起きない（取らない） |
| キーが改名・消滅する | その列が以後 NULL になる |
| hook の種類が増える | 登録していないので来ない |
| hook の入力形式が変わる | 収集処理が例外 → 握り潰し → イベントが止まる |
| transcript の `usage` 構造が変わる | `context_tokens` が NULL になる |
| ポリシーのキー名・環境変数名が変わる | 書き込みは成功するが、次のセッションで `prev_value` に現れない |
| プラグインの更新が端末に届かなくなる | 古い版のまま施策が固定される |
| CSV に列が増える | 知らない列を捨てる |

どの変化でも Claude Code の動作は妨げられない（hook は常に `exit 0`）。問題はすべて
「静かに欠測する」形で現れる。

サーバの概況画面の隅に「健全性」の 1 行を出す（`server.md` §5.2）。読み方は
次の 5 つである。

- イベント件数の急落 → hook 入力形式の変化・収集の停止
- 特定列の NULL 率が急に 100% に跳ねる → キーの改名・消滅
- 準拠率の急落（`/policy`）→ 設定キー名の変化・適用の空振り・上位設定による上書き
- 突合率の低下 → `user_email` が `cost_daily` と噛み合っていない
- 古い `plugin_version` が残り続ける → 配布が届いていない端末

人手で追随する箇所は 3 か所だけであり、いずれも `contract.py` の中にある。

1. `HOOK_FIELDS` — hook 入力のキーパスの改名時
2. `POLICY` — 設定キー名・環境変数名の変更時、施策の変更時
3. `CSV_COLUMNS` — CSV のヘッダ名の変更時
