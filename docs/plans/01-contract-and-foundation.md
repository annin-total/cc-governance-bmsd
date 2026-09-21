# [1] 契約と基盤

**目的:** 端末とサーバが共有する契約を正本 1 ファイルに置き、そこから DDL・INSERT 列・インデックス・起動時の突き合わせを導く DB 基盤を用意する。
**設計書:** `../design.md` §6 / §5 / §4.3
**依存:** [0] 実装前に確かめること
**ブランチ:** `feat/contract-and-foundation`

---

## 1. 作るもの

| ファイル | 責務 | 想定行数 |
| --- | --- | --- |
| `governance/hooks/contract.py` | **契約の正本。** 5 定数と 4 関数だけを持つ。import するものは標準ライブラリのみ | 110 |
| `cc-governance-bmsd-server/shared.py` | サーバ側から契約を import するためのシム。`__file__` 起点で `sys.path` を解決する | 5 |
| `cc-governance-bmsd-server/db.py` | `connect()` / `q(sql)` / `init()`。接続生成・プレースホルダ変換・DDL 適用・インデックスの存在確認・実テーブルとの突き合わせ | 90 |
| `requirements-dev.txt` | 開発依存。pytest と ruff の 2 行のみ | 2 |
| `tests/conftest.py` | `sys.path` の設定と、一時 SQLite の fixture | — |
| `tests/test_contract_constants.py` | タスク 2 の検証 | — |
| `tests/test_contract_dig.py` | タスク 3 の検証 | — |
| `tests/test_contract_coerce.py` | タスク 4 の検証 | — |
| `tests/test_contract_to_day.py` | タスク 5 の検証 | — |
| `tests/test_contract_ddl.py` | タスク 6 の検証 | — |
| `tests/test_shared_import.py` | タスク 7 の検証 | — |
| `tests/test_db_connect.py` | タスク 8 の検証 | — |
| `tests/test_db_init.py` | タスク 9 の検証 | — |
| `tests/test_db_columns.py` | タスク 10 の検証 | — |

本計画で作る Python ファイルは 3 つだけである。`app.py`・`ingest.py`・`queries_*.py`・`csv_import.py`・`templates/`・`governance/*.json`・端末側の hook スクリプトには一切触れない。

---

## 2. この計画に固有の前提

共通の制約は `README.md` §5 に従う。この計画でだけ置く前提は次のとおり。

| 項目 | 置く前提 |
| --- | --- |
| コマンドのカレントディレクトリ | すべて `cc-governance-bmsd/`。本書のパスはこのディレクトリからの相対で書く |
| テストの置き場所 | `cc-governance-bmsd/tests/`。**`governance/` の下にも `cc-governance-bmsd-server/` の下にも置かない。** 配布物（プラグイン）にテストを混ぜないため、および「フレームワークの import は `app.py` だけ」を `grep` で検査する範囲から外すため |
| テストからの import | `tests/conftest.py` が `cc-governance-bmsd-server` と `governance/hooks` を `sys.path` に足す。テストは `import db` / `import shared` / `import contract` と書く |
| 契約の差し替え（テスト） | 契約の定数は import 時に束縛される。列を足す・重複させる検証では、`contract` と、それを再輸出している `shared` / `db` の**同名の名前をすべて差し替える**。差し替えはテストの中に閉じ、本番コードに差し替え用の入口を作らない |
| 契約が公開するもの | 定数 `HOOK_FIELDS` / `EXTRA_COLUMNS` / `POLICY` / `POLICY_COLUMNS` / `CSV_COLUMNS`、関数 `dig(obj, path)` / `coerce(value, type)` / `to_day(ts)` / `ddl()`。`shared.py` はこの 9 つをすべて再輸出する |
| 列型の語彙 | `VARCHAR(n)` / `INTEGER` / `BIGINT` / `DOUBLE` の 4 種。`coerce()` は型文字列の先頭トークンで判定する |
| `POLICY` の中身 | `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` = `"60"`、`extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate` = `True`、`env.FORCE_AUTOUPDATE_PLUGINS` = `"1"` の 3 項目。`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` は Claude Code の公式ドキュメントに記載された環境変数で、コンテキストの何 % で自動圧縮を始めるかを 1〜100 の整数で与える。低い値ほど早く圧縮し、既定より高い値は無視される |
| `POLICY` の値の文字列表現 | 契約の `coerce` の規則（設計書 §3.2 の型変換の表）を正本とする。端末が `policy_state.value` に書く表現も、画面が準拠判定に使う表現も、これと同一のものを使う |
| `CSV_COLUMNS` の形 | 要素は `(CSV ヘッダ名, DB 列名, 型)` の 3 つ組。`source_file` は CSV に対応するヘッダを持たないため、ヘッダ名を `None` として同じ列に並べる。これにより `cost_daily` の DDL も INSERT 列も `CSV_COLUMNS` 1 つから導ける |
| インデックスの定義 | `db.py` の定数として持つ。**契約には置かない。** 端末側はインデックスを知る必要がないため |
| 接続方言の判定 | `DB_DSN` のスキームで判定する。`connect()` と `q()` は同じ判定を共有し、`q()` は接続オブジェクトを引数に取らない |
| `DB_DSN` の書式 | `sqlite:///<パス>`（`sqlite:////mnt/data/governance.db` なら絶対パス `/mnt/data/governance.db`）、`mysql://<user>:<pass>@<host>[:<port>]/<db>` |
| テストの DB | SQLite のみ。MySQL は実接続を張らず、方言判定と `q()` の変換結果だけを確かめる |
| `requirements.txt` | **本計画では作らない。** 本番依存 3 つの固定は [8] の担当 |

### 進め方

**本計画のタスク 2〜10 はすべて TDD で進める。** 各タスクで、下表のケースをテストとして先に書き、落ちることを確認してから実装する。README §4 が挙げた「契約からの DDL / INSERT 列の生成」がこの計画の全域にあたる。

---

## 3. タスク

テストの件数は「表の 1 行 = 1 ケース」で数える。

### タスク 1: 開発依存とテスト実行の土台

**ファイル:** 作成 `requirements-dev.txt`、`tests/conftest.py`
**依存:** なし

**やること**

- `requirements-dev.txt` に pytest（テスト）と ruff（リントとフォーマッタ）の 2 行だけを置き、どちらも `==` で完全に固定する
- `tests/conftest.py` に、`cc-governance-bmsd-server` と `governance/hooks` を `sys.path` に足す処理を置く。パスは `conftest.py` の `__file__` 起点で解決する
- 一時ファイルの SQLite を指す `DB_DSN` を環境変数に設定し、テスト終了時に元へ戻す fixture を置く
- `governance/hooks/` と `cc-governance-bmsd-server/` のディレクトリを作る

**根拠:** README §4「テストの実行基盤は pytest。`requirements-dev.txt` に分離する」

**テスト:** なし（土台のみ）

**完了の判定**

```
pip install -r requirements-dev.txt && pytest -q tests
```

期待出力（末尾行）。この時点で `tests/` にはまだテストが 1 件も無い:

```
no tests ran
```

**コミット:** `chore: 開発依存とテストの土台を追加`

---

### タスク 2: 契約の定数

**ファイル:** 作成 `governance/hooks/contract.py` / テスト `tests/test_contract_constants.py`
**依存:** タスク 1

**やること**

- `HOOK_FIELDS` に、設計書 §3.2 の 12 項目を `(列名, キーパス, 型)` の 3 つ組で置く
- `EXTRA_COLUMNS` に、端末側で組み立てる 7 列を `(列名, 型)` で置く
- `POLICY_COLUMNS` に、`policy_state` の 10 列を `(列名, 型)` で、設計書 §5.2 の表の順に置く
- `POLICY` に 3 項目を置く。キーは `settings.json` 内の `.` 区切りパス
- `CSV_COLUMNS` に、AI Gateway CSV の 12 ヘッダと `source_file` を `(CSV ヘッダ名, DB 列名, 型)` で置く。`source_file` のヘッダ名は `None`
- 定数以外は何も置かない（関数は以降のタスクで足す）

**根拠:** 設計書 §3.2、§3.6「ポリシーの定義」、§5.1、§5.2、§5.3、§6.2

**テスト**

| # | 検証すること | 期待値 |
| --- | --- | --- |
| 1 | `HOOK_FIELDS` と `EXTRA_COLUMNS` の列名集合の積 | 空集合 |
| 2 | `EXTRA_COLUMNS` + `HOOK_FIELDS` の列名の並び | `event_id, ts, day, user_email, host, hook_event, context_tokens, session_id, prompt_id, tool_name, source, compact_trigger, command_name, command_source, skill_name, effort_level, permission_mode, agent_id, is_interrupt`（19 列） |
| 3 | `POLICY_COLUMNS` の列名の並び | `event_id, ts, day, user_email, host, key_name, value, prev_value, apply_result, plugin_version`（10 列） |
| 4 | `CSV_COLUMNS` の DB 列名の並び | `day, user_email, provider, model, currency, cost, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cached_input_tokens, uncached_input_tokens, source_file`（13 列） |
| 5 | `CSV_COLUMNS` のうちヘッダ名が `None` の要素 | `source_file` の 1 つだけ |
| 6 | 5 定数に現れる型文字列の先頭トークンの集合 | `{"VARCHAR", "INTEGER", "BIGINT", "DOUBLE"}` の部分集合 |
| 7 | `POLICY` のキー | `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` / `extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate` / `env.FORCE_AUTOUPDATE_PLUGINS` の 3 つ |
| 8 | `contract.py` が import しているモジュール | 標準ライブラリのみ（サードパーティを import していない） |

**完了の判定**

```
pytest tests/test_contract_constants.py -q
```

期待出力（末尾行）:

```
8 passed
```

**コミット:** `feat(contract): 契約の 5 定数を追加`

---

### タスク 3: `dig(obj, path)`

**ファイル:** 変更 `governance/hooks/contract.py` / テスト `tests/test_contract_dig.py`
**依存:** タスク 2

**やること**

- キーパスを先頭から順にたどり、たどれなくなった時点で `None` を返す関数を置く
- 途中の値が dict でない場合も例外にせず `None` を返す
- 引数 `obj` 自体が dict でない場合も `None` を返す

**根拠:** 設計書 §3.2「キーパスの解決は契約が持つ 1 つの関数で行う」

**テスト**

入力は実サンプルに現れた形をそのまま使う。

| # | `obj` | `path` | 期待値 |
| --- | --- | --- | --- |
| 1 | `{"session_id": "7f678d60", "cwd": "/w"}` | `("session_id",)` | `"7f678d60"` |
| 2 | `{"tool_name": "Skill", "tool_input": {"skill": "pdf"}}` | `("tool_input", "skill")` | `"pdf"` |
| 3 | `{"effort": {"level": "high"}}` | `("effort", "level")` | `"high"` |
| 4 | `{"tool_name": "Bash", "tool_input": {"command": "ls", "description": "一覧"}}` | `("tool_input", "skill")` | `None`（末端が無い） |
| 5 | `{"session_id": "s1", "hook_event_name": "Stop"}` | `("tool_input", "skill")` | `None`（途中が無い） |
| 6 | `{"effort": "high"}` | `("effort", "level")` | `None`（途中が dict でない） |
| 7 | `None` | `("session_id",)` | `None`（対象が dict でない） |
| 8 | `[1, 2, 3]` | `("session_id",)` | `None`（対象が dict でない） |
| 9 | `{"agent_id": None}` | `("agent_id",)` | `None`（値が `None`） |

ケース 4 は実サンプルの PostToolUse 60 件のうち 59 件が該当する形、ケース 2 は残る 1 件の形である。

**完了の判定**

```
pytest tests/test_contract_dig.py -q
```

期待出力（末尾行）:

```
9 passed
```

**コミット:** `feat(contract): dig によるキーパスの解決を追加`

---

### タスク 4: `coerce(value, type)`

**ファイル:** 変更 `governance/hooks/contract.py` / テスト `tests/test_contract_coerce.py`
**依存:** タスク 2

**やること**

- 型文字列の先頭トークン（`VARCHAR` / `INTEGER` / `BIGINT` / `DOUBLE`）で分岐する
- `None` はどの型でも `None` のまま返す
- `VARCHAR` は `str()` に通す。**ただし真偽値は小文字の `true` / `false` にする**
- `INTEGER` / `BIGINT` は、真偽値・整数・整数文字列を `int` に寄せる。それ以外は `None` にする
- `DOUBLE` は、数値・数値文字列を `float` に寄せる。それ以外は `None` にする
- 値の語彙は検査しない。許可リストを持たない

**根拠:** 設計書 §3.2「値の型変換も契約の 1 関数に閉じる」と同節の型変換の表、§5.5「真偽値 INTEGER 0 / 1」

**テスト**

| # | `value` | `type` | 期待値 |
| --- | --- | --- | --- |
| 1 | `"auto"` | `VARCHAR(255)` | `"auto"` |
| 2 | `60` | `VARCHAR(255)` | `"60"` |
| 3 | `True` | `VARCHAR(255)` | `"true"` |
| 4 | `None` | `VARCHAR(255)` | `None` |
| 5 | `False` | `INTEGER` | `0` |
| 6 | `True` | `INTEGER` | `1` |
| 7 | `120000` | `INTEGER` | `120000` |
| 8 | `"120000"` | `INTEGER` | `120000` |
| 9 | `"yes"` | `INTEGER` | `None` |
| 10 | `""` | `INTEGER` | `None` |
| 11 | `3.7` | `INTEGER` | `None` |
| 12 | `None` | `INTEGER` | `None` |
| 13 | `4178` | `BIGINT` | `4178` |
| 14 | `"4178"` | `BIGINT` | `4178` |
| 15 | `"-"` | `BIGINT` | `None` |
| 16 | `"6.382454"` | `DOUBLE` | `6.382454` |
| 17 | `"4.60E-05"` | `DOUBLE` | `4.6e-05` |
| 18 | `0` | `DOUBLE` | `0.0` |
| 19 | `"不明"` | `DOUBLE` | `None` |
| 20 | `None` | `DOUBLE` | `None` |

ケース 5 は実サンプルの `is_interrupt` がそのまま入る形である（3 件すべてが JSON の真偽値 `false`）。ケース 16・17 は実 CSV の `Cost` 列に現れる 2 つの書式である。

**完了の判定**

```
pytest tests/test_contract_coerce.py -q
```

期待出力（末尾行）:

```
20 passed
```

**コミット:** `feat(contract): coerce による列型への変換を追加`

---

### タスク 5: `to_day(ts)`

**ファイル:** 変更 `governance/hooks/contract.py` / テスト `tests/test_contract_to_day.py`
**依存:** タスク 2

**やること**

- epoch 秒を JST 基準の epoch 日に変換する関数を置く
- 現在時刻を読まない。引数だけから決まる

**根拠:** 設計書 §3.2（`day` の取得元）、§4.4（サーバ側で `ts` から再計算する）

**テスト**

| # | `ts` | JST での時刻 | 期待値 |
| --- | --- | --- | --- |
| 1 | `1758380399` | 2025-09-20 23:59:59 | `20351` |
| 2 | `1758380400` | 2025-09-21 00:00:00 | `20352` |
| 3 | `1758400000` | 2025-09-21 05:26:40 | `20352` |
| 4 | `1758466799` | 2025-09-21 23:59:59 | `20352` |
| 5 | `1758466800` | 2025-09-22 00:00:00 | `20353` |

ケース 1・2 が日境界の直前と直後、ケース 4・5 が次の日境界の直前と直後である。

**完了の判定**

```
pytest tests/test_contract_to_day.py -q
```

期待出力（末尾行）:

```
5 passed
```

**コミット:** `feat(contract): to_day による JST 日付の算出を追加`

---

### タスク 6: `ddl()`

**ファイル:** 変更 `governance/hooks/contract.py` / テスト `tests/test_contract_ddl.py`
**依存:** タスク 2

**やること**

- `events` / `policy_state` / `cost_daily` の `CREATE TABLE IF NOT EXISTS` 文を組み立てて返す
- `events` の列は `EXTRA_COLUMNS` の順 → `HOOK_FIELDS` の順
- `policy_state` の列は `POLICY_COLUMNS` の順
- `cost_daily` の列は `CSV_COLUMNS` の順
- 主キー・外部キー・NOT NULL・DEFAULT を一切付けない
- **先頭で `HOOK_FIELDS` と `EXTRA_COLUMNS` の列名の重複を検出し、重複があれば例外を投げる。** 例外のメッセージに重複した列名を含める
- インデックスは組み立てない（`db.py` の担当）

**根拠:** 設計書 §6.2（`ddl()` の責務と不変条件）、§5.1〜§5.3、§5.5

**テスト**

| # | 検証すること | 期待値 |
| --- | --- | --- |
| 1 | 返る文の数と対象テーブル | 3 文。`events` / `policy_state` / `cost_daily` |
| 2 | 3 文の書き出し | いずれも `CREATE TABLE IF NOT EXISTS` で始まる |
| 3 | 3 文に現れない語 | `PRIMARY KEY` / `UNIQUE` / `FOREIGN KEY` / `AUTOINCREMENT` / `AUTO_INCREMENT` / `NOT NULL` / `DEFAULT` |
| 4 | 空の SQLite で 3 文を実行し `PRAGMA table_info(events)` | 列名が タスク 2 ケース 2 の 19 列と、順序を含めて一致 |
| 5 | 同じく `PRAGMA table_info(policy_state)` | 列名が タスク 2 ケース 3 の 10 列と、順序を含めて一致 |
| 6 | 同じく `PRAGMA table_info(cost_daily)` | 列名が タスク 2 ケース 4 の 13 列と、順序を含めて一致 |
| 7 | `EXTRA_COLUMNS` に `("tool_name", "VARCHAR(255)")` を足して `ddl()` を呼ぶ | 例外。メッセージに `tool_name` を含む |
| 8 | ケース 7 と同じ状態で、3 文が 1 つも返らない | `CREATE TABLE` が 1 文も実行されない（例外は文の組み立て前に出る） |

**完了の判定**

```
pytest tests/test_contract_ddl.py -q
```

期待出力（末尾行）:

```
8 passed
```

**コミット:** `feat(contract): 契約から 3 テーブルの DDL を組み立てる`

---

### タスク 7: 契約 import のシム

**ファイル:** 作成 `cc-governance-bmsd-server/shared.py` / テスト `tests/test_shared_import.py`
**依存:** タスク 6

**やること**

- `__file__` の絶対パスを起点に `governance/hooks` を `sys.path` に足し、契約の 9 つの名前を再輸出する
- 作業ディレクトリからの相対パスを一切使わない
- ここに処理を書かない。パスの解決と再輸出だけに限る

**根拠:** 設計書 §6.1「パスは `__file__` 起点で解決する」

**テスト**

`conftest.py` が `sys.path` を設定済みであるとシムの検証にならないため、**このタスクのテストだけは別プロセスを起動して確かめる。** 起動時に `PYTHONPATH` として `cc-governance-bmsd-server` の絶対パスだけを与え、カレントディレクトリを変えて `import shared` を実行する。

| # | カレントディレクトリ | 実行すること | 期待値 |
| --- | --- | --- | --- |
| 1 | `/` | `import shared; print(len(shared.HOOK_FIELDS))` | 終了コード 0、出力 `12` |
| 2 | `cc-governance-bmsd/` | 同上 | 終了コード 0、出力 `12` |
| 3 | `cc-governance-bmsd-server/` | 同上 | 終了コード 0、出力 `12` |
| 4 | `/` | `import shared; print(sorted(n for n in ("HOOK_FIELDS","EXTRA_COLUMNS","POLICY","POLICY_COLUMNS","CSV_COLUMNS","dig","coerce","to_day","ddl") if hasattr(shared, n)))` | 9 つすべてが出力に現れる |

**完了の判定**

```
pytest tests/test_shared_import.py -q
```

期待出力（末尾行）:

```
4 passed
```

**コミット:** `feat(server): 契約 import のシムを追加`

---

### タスク 8: `connect()` と `q(sql)`

**ファイル:** 作成 `cc-governance-bmsd-server/db.py` / テスト `tests/test_db_connect.py`
**依存:** タスク 7

**やること**

- `DB_DSN` のスキームから方言（`sqlite` / `mysql`）を決める関数を置く。未設定・未知スキームは例外にする
- `connect()` は方言に応じて `sqlite3` または `PyMySQL` の接続を返す
- `q(sql)` は、方言が `mysql` のときだけ `?` を `%s` に置き換えて返す
- SQL 文字列はこのファイルの外では常に `?` で書かれる前提に立つ
- フレームワークを import しない

**根拠:** 設計書 §4.3「`db.py` が持つ抽象は次の 3 つだけ」、§5.5「プレースホルダ」

**テスト**

| # | `DB_DSN` | 検証すること | 期待値 |
| --- | --- | --- | --- |
| 1 | `sqlite:////tmp/a.db` | 方言と解決されたパス | `sqlite` / `/tmp/a.db` |
| 2 | `mysql://u:p@h:3306/gov` | 方言 | `mysql` |
| 3 | （未設定） | `connect()` の呼び出し | 例外 |
| 4 | `postgres://u:p@h/gov` | `connect()` の呼び出し | 例外 |
| 5 | `sqlite:///<一時ファイル>` | `connect()` で得た接続で `SELECT 1` | `1` |
| 6 | `sqlite:///<一時ファイル>` | `q("SELECT * FROM events WHERE day=? AND user_email=?")` | 入力と同一の文字列 |
| 7 | `mysql://u:p@h/gov` | 同じ SQL を `q()` に通す | `%s` が 2 個、`?` が 0 個 |
| 8 | `mysql://u:p@h/gov` | `q("SELECT COUNT(DISTINCT event_id) FROM events")` | 入力と同一の文字列 |

ケース 2・7・8 は MySQL への実接続を張らない。方言判定と文字列変換だけを確かめる。

**完了の判定**

```
pytest tests/test_db_connect.py -q
```

期待出力（末尾行）:

```
8 passed
```

**コミット:** `feat(server): DB 接続の生成とプレースホルダ変換を追加`

---

### タスク 9: `init()` — DDL の適用とインデックス

**ファイル:** 変更 `cc-governance-bmsd-server/db.py` / テスト `tests/test_db_init.py`
**依存:** タスク 8

**やること**

- `ddl()` が返す 3 文を実行する
- インデックスの定義を `db.py` の定数として持つ。内訳は設計書 §5.1 の 4 本・§5.2 の 2 本・§5.3 の 1 本の計 7 本
- `CREATE INDEX IF NOT EXISTS` を使わず、**既存のインデックス名を取得してから、無いものだけを作る**（SQLite は `PRAGMA index_list(<t>)`、MySQL は `SHOW INDEX FROM <t>`）
- 何度呼んでも同じ結果になること（冪等）を満たす

**根拠:** 設計書 §5.1〜§5.3（インデックスの定義）、§5.5「MySQL 8.0 に `CREATE INDEX IF NOT EXISTS` が無いため、`SHOW INDEX` で存在確認してから作る」、§4.3

インデックスの一覧は次のとおり。

| テーブル | 列の並び |
| --- | --- |
| `events` | `(day, user_email, event_id)` |
| `events` | `(skill_name, day, user_email, event_id)` |
| `events` | `(tool_name, day, user_email, event_id)` |
| `events` | `(day, hook_event, context_tokens)` |
| `policy_state` | `(key_name, prev_value, user_email)` |
| `policy_state` | `(user_email, ts)` |
| `cost_daily` | `(day, user_email)` |

**テスト**

| # | 前の状態 | 操作 | 期待値 |
| --- | --- | --- | --- |
| 1 | 空の SQLite | `init()` を 1 回 | テーブルが `events` / `policy_state` / `cost_daily` の 3 つ |
| 2 | 空の SQLite | `init()` を 1 回 | インデックスが 7 本。列の並びが上表と一致 |
| 3 | `init()` 済み | `init()` をもう 1 回 | 例外が出ない |
| 4 | `init()` 済み | `init()` をもう 1 回 | インデックスは 7 本のまま（重複して作られない） |
| 5 | `init()` 済み、インデックスを 1 本 `DROP INDEX` した状態 | `init()` | 7 本に戻る |
| 6 | `init()` 済み、`events` に 1 行 INSERT した状態 | `init()` | 行が消えていない（`CREATE TABLE IF NOT EXISTS` が既存テーブルに触らない） |

**完了の判定**

```
pytest tests/test_db_init.py -q
```

期待出力（末尾行）:

```
6 passed
```

**コミット:** `feat(server): DDL とインデックスの適用を追加`

---

### タスク 10: `init()` — 契約と実テーブルの突き合わせ

**ファイル:** 変更 `cc-governance-bmsd-server/db.py` / テスト `tests/test_db_columns.py`
**依存:** タスク 9

**やること**

- DDL 実行のあとに、3 テーブルそれぞれの実列名の集合を取得する（SQLite は `PRAGMA table_info(<t>)`、MySQL は `SHOW COLUMNS FROM <t>`）。方言分岐はタスク 9 のインデックス確認と同じ場所にまとめる
- 契約が要求する列のうち実テーブルに無いものを、3 テーブル分すべて集める
- **1 つでもあれば、テーブル名と不足列名をすべて出力して例外を投げる。** 最初の 1 つで打ち切らない
- **`ALTER TABLE` を発行しない。** 列を自動で追加しない
- 実テーブルに契約が知らない列があっても、それは例外にしない

**根拠:** 設計書 §4.3「契約と実テーブルの突き合わせ」

**テスト**

いずれも、先に `init()` を通した SQLite に対して契約を差し替えてから `init()` を呼び直す。

| # | 契約への操作 | 期待値 |
| --- | --- | --- |
| 1 | `HOOK_FIELDS` に `("mcp_server", ("mcp_server",), "VARCHAR(255)")` を足す | 例外。メッセージに `events` と `mcp_server` を含む |
| 2 | ケース 1 と同じ状態 | `PRAGMA table_info(events)` の列数が 19 のまま（`ALTER TABLE` が発行されていない） |
| 3 | `POLICY_COLUMNS` に `("policy_version", "VARCHAR(32)")` を足す | 例外。メッセージに `policy_state` と `policy_version` を含む |
| 4 | `CSV_COLUMNS` に `("Region", "region", "VARCHAR(255)")` を足す | 例外。メッセージに `cost_daily` と `region` を含む |
| 5 | `HOOK_FIELDS` と `CSV_COLUMNS` に 1 列ずつ足す | 例外。メッセージに 2 つの列名と 2 つのテーブル名がすべて現れる |
| 6 | 契約を変えず、実テーブルに `ALTER TABLE events ADD COLUMN legacy_note VARCHAR(255)` を手で当てる | 例外が出ない（契約に無い余分な列は許容する） |
| 7 | 契約を変えない | 例外が出ない |

**完了の判定**

```
pytest tests/test_db_columns.py -q
```

期待出力（末尾行）:

```
7 passed
```

**コミット:** `feat(server): 契約と実テーブルの突き合わせを起動時に行う`

---

## 4. この計画の完了条件

- [ ] `governance/hooks/contract.py` が存在し、定数 5 つ・関数 4 つだけを公開している。200 行以内である
- [ ] `contract.py` が標準ライブラリ以外を import していない
- [ ] `cc-governance-bmsd-server/shared.py` が `__file__` 起点でパスを解決し、契約の 9 つの名前を再輸出している
- [ ] `cc-governance-bmsd-server/db.py` が `connect()` / `q(sql)` / `init()` の 3 つだけを外に出し、200 行以内である
- [ ] `db.py` がフレームワークを import していない
- [ ] `events` / `policy_state` / `cost_daily` の列名が `db.py` にも `shared.py` にも直接書かれていない（すべて契約から導いている）
- [ ] 契約に列を 1 つ足すと `init()` が例外で止まることが、3 テーブルそれぞれについて検証されている
- [ ] インデックス 7 本が作られ、2 回目の `init()` で重複しないことが検証されている
- [ ] `requirements-dev.txt` が pytest と ruff の 2 行だけで、どちらも `==` で固定されている。`requirements.txt` はまだ存在しない
- [ ] `tests/` が `governance/` の下にも `cc-governance-bmsd-server/` の下にも無い
- [ ] 下記が通る（`tests/` には後続の計画のテストも溜まるため、本計画が足したファイルに絞って実行する）

```
pytest -q tests/test_contract_*.py tests/test_shared_import.py tests/test_db_*.py
```

期待出力（末尾行）:

```
76 passed
```

- [ ] 下記が何も出力しない（契約の正本が 1 つだけであること）

```
grep -rln "HOOK_FIELDS = " --include=*.py . | grep -v "^./governance/hooks/contract.py$"
```

- [ ] `feat/contract-and-foundation` を `main` にマージしている

---

## 5. この計画で確かめないこと

| 事項 | 回す先 |
| --- | --- |
| hook の標準入力から実際に値を抜くこと、`collect.py` の挙動 | [2] |
| `settings.json` への書き込みと `POLICY` の実適用、`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` が端末で効くこと | [0] [3] |
| `POLICY` の値を `policy_state.value` にどう書くか（端末側の組み立て） | [3] |
| `/ingest` の受信・検査・`executemany`・応答コード | [4] |
| 集計 SQL と画面 | [5] |
| CSV の走査・`Date` の書式解釈・`day` 単位の冪等化 | [6] |
| **MySQL への実接続**。DDL の適用、インデックスの存在確認、列の突き合わせが MySQL で動くこと | [8] |
| 接続先 MySQL の `sql_require_primary_key` が主キーなしテーブルを拒否しないこと | [8] |
| `waitress` での待受、`BASE_PATH` のサブパス適用、`requirements.txt` の本番依存 3 つの固定 | [8] |
| SQL の文字列リテラルの中に `?` が現れた場合の `q()` の挙動 | 確かめない。集計 SQL に `?` を含む文字列リテラルを書かない前提に立つ |
| 年間規模での `COUNT(DISTINCT event_id)` の実行時間 | 本計画の範囲外（設計書 §11.3） |

本計画が保証するのは、**契約 1 ファイルから 3 テーブルの DDL・インデックス・列の突き合わせが導けること**、および**契約に列を足したときサーバが無言で通らないこと**の 2 点までである。
