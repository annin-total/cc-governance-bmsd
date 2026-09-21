# [4] サーバ：受信と保存

**目的:** 端末が送る NDJSON を `/ingest` で受け取り、契約から導いた検査を通して `events` / `policy_state` に保存し、「受け取ったかどうか」を応答コードで正しく表明する。
**設計書:** `../design.md` §4.1〜§4.4
**依存:** [1] 契約と基盤
**ブランチ:** `feat/server-ingest`

---

## 1. 作るもの

| ファイル | 責務 | 想定行数 |
| --- | --- | --- |
| `cc-governance-bmsd-server/ingest.py` | NDJSON のパース・契約由来の検査・`kind` による振り分け・`day` の再計算・`executemany` | 75 |
| `cc-governance-bmsd-server/app.py` | ルーティング層。**[8-A] が置いた最小の形に足す。** 本計画で書くのは `POST /ingest`・トークン検査・応答の組み立て | 110（うち本計画は約 40 行） |
| `tests/conftest.py`（変更） | テスト用の SQLite DB と Flask テストクライアントの fixture を足す。ファイル自体は [1] が作ってある | — |
| `tests/test_ingest_parse.py` | タスク 1 の検証 | — |
| `tests/test_ingest_store.py` | タスク 2 の検証 | — |
| `tests/test_api_ingest.py` | タスク 4 の検証 | — |
| `tests/test_roundtrip_ingest.py` | タスク 6 の検証 | — |

本計画で追加する Python ファイルは 2 つだけである。`queries_*.py`・`csv_import.py`・`templates/` には触れない。

---

## 2. この計画に固有の前提

README §5 の共通制約に加えて、本計画だけに効く前提を置く。

| 項目 | 前提 |
| --- | --- |
| 計画 [1] の完了 | `governance/hooks/contract.py`（5 定数 `HOOK_FIELDS` / `EXTRA_COLUMNS` / `POLICY` / `POLICY_COLUMNS` / `CSV_COLUMNS` と 4 関数 `dig` / `coerce` / `to_day` / `ddl`）、`cc-governance-bmsd-server/db.py`（`connect()` / `q(sql)` / `init()` / `analyze()`）、`cc-governance-bmsd-server/shared.py` が `main` にある |
| `events` の列順 | `EXTRA_COLUMNS` + `HOOK_FIELDS` から導く。INSERT 文の列順は `ddl()` が生成する DDL の列順と同一でなければならない |
| `policy_state` の列定義 | 契約の `POLICY_COLUMNS` から取る。本計画で列名を書き下さない |
| `day` の再計算 | 契約の `to_day(ts)` を呼ぶ。`ingest.py` の中に式を書かない |
| トークンのヘッダ名 | `X-Ingest-Token`。計画 [2] の送信側と同一の名前を使う |
| `INGEST_TOKEN` 未設定時 | サーバ側の環境変数が未設定・空文字なら、すべての `/ingest` を 401 で拒否する |
| テストの DB | SQLite のみ（`DB_DSN=sqlite:///<一時ファイル>`）。MySQL 接続は [8] で確かめる |
| `ingest.py` の入出力 | 生のバイト列（NDJSON）と DB 接続を受け取り、`{"stored": int, "dropped": int}` を返す。Flask を import しない（設計書 §4.2） |
| 応答ボディ | `ingest.py` が返す dict をそのまま JSON にして返す |
| 空行の扱い | 空白だけの行は無視し、`dropped` に数えない。末尾改行が毎回 1 件の破棄として計上されるのを避ける |
| `requirements.txt` | **本計画では作らない。** 本番依存の固定・`Dockerfile`・`start.sh` は [8-A] の担当（README §2） |

---

## 3. タスク

コマンドはすべて `cc-governance-bmsd/` をカレントディレクトリとして実行する。テストの件数は「表の 1 行 = 1 ケース」で数える。

### タスク 1: NDJSON の行パースと契約由来の検査

**ファイル:** 作成 `cc-governance-bmsd-server/ingest.py` / テスト `tests/test_ingest_parse.py`
**依存:** なし（計画 [1] の完了が前提）

**やること**

- バイト列を行に分割し、1 行ずつ JSON としてパースする関数を置く
- 行が dict としてパースできること、`kind` が `"event"` / `"policy"` のいずれかであること、`event_id` が空でないこと、`ts` が `None` でないことを検査する
- 通った行を、渡された列定義から**列ごとに名前と型を取り出して**値のタプルに変換する（設計書 §4.4 の `parse_line`）。値の変換は契約の `coerce` に委ね、`ingest.py` は型の解釈を持たない
- 列定義に無いキーは捨て、来ないキーは `None` にする
- `day` は行が持つ値を無視し、契約の `to_day(ts)` で再計算する。`ingest.py` の中に式を書かない
- 検査に落ちた行は捨てて続行し、破棄件数として数える
- 値の語彙は一切検査しない。許可リストを持たない

**根拠:** 設計書 §4.4「`/ingest` の受信処理」、§3.2（`coerce` の責務）、§6.2（`to_day` を契約に置く理由）、§4.3「過剰にしないための制約」1

**テスト**

| # | 入力行 | 期待 |
| --- | --- | --- |
| 1 | `{"kind":"event","event_id":"e1","ts":1758400000,"tool_name":"Bash"}` | 採用。`tool_name` = `"Bash"`、`day` = `20352` |
| 2 | `{"kind":"event","event_id":"e2","ts":1758380400}` | 採用。`day` = `20352`（JST 当日 0 時） |
| 3 | `{"kind":"event","event_id":"e3","ts":1758380399}` | 採用。`day` = `20351`（JST 前日 23:59:59） |
| 4 | `{"kind":"event","event_id":"e4","ts":1758400000,"day":1}` | 採用。`day` = `20352`（行の `day` を無視して再計算） |
| 5 | `{"kind":"event","event_id":"e5","ts":1758400000,"is_interrupt":true}` | 採用。`is_interrupt` = `1` |
| 6 | `{"kind":"event","event_id":"e6","ts":1758400000,"is_interrupt":"yes"}` | 採用。`is_interrupt` = `None` |
| 7 | `{"kind":"event","event_id":"e7","ts":1758400000,"prompt":"秘密","tool_response":"x"}` | 採用。`prompt` / `tool_response` はどの列にも現れない |
| 8 | `{"kind":"event","event_id":"e8","ts":1758400000}` | 採用。`tool_name` / `skill_name` / `context_tokens` はすべて `None` |
| 9 | `{"kind":"event","ts":1758400000}` | 破棄（`event_id` 欠落） |
| 10 | `{"kind":"event","event_id":"","ts":1758400000}` | 破棄（`event_id` 空文字） |
| 11 | `{"kind":"event","event_id":"e11"}` | 破棄（`ts` 欠落） |
| 12 | `{"kind":"event","event_id":"e12","ts":null}` | 破棄（`ts` が `null`） |
| 13 | `{"kind":"foo","event_id":"e13","ts":1758400000}` | 破棄（未知の `kind`） |
| 14 | `{"event_id":"e14","ts":1758400000}` | 破棄（`kind` 欠落） |
| 15 | `{"kind":"event","event_id":` | 破棄（JSON としてパースできない） |
| 16 | `[1,2,3]` | 破棄（dict ではない） |
| 17 | `` （空行）、`   `（空白のみ） | 無視。`dropped` に数えない |
| 18 | `{"kind":"policy","event_id":"p1","ts":1758400000,"key_name":"env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE","value":"60","prev_value":null,"apply_result":"applied"}` | 採用。`policy_state` の行として、`prev_value` = `None`、`apply_result` = `"applied"`、`day` = `20352` |

**完了の判定**

```
pytest tests/test_ingest_parse.py -q
```

期待出力（末尾行）:

```
18 passed
```

**コミット:** `feat(server): NDJSON の行パースと契約由来の検査を追加`

---

### タスク 2: 振り分けと保存

**ファイル:** 変更 `cc-governance-bmsd-server/ingest.py` / テスト `tests/test_ingest_store.py`、変更 `tests/conftest.py`
**依存:** タスク 1

**やること**

- バイト列と DB 接続を受け取り、`{"stored": int, "dropped": int}` を返す入口の関数を置く
- `kind` で `events` / `policy_state` に振り分け、テーブルごとに 1 回の `executemany` で INSERT する
- 2 テーブル分の INSERT を 1 トランザクションでまとめ、末尾で commit する
- INSERT 文の列リストは契約から毎回組み立てる。列名を `ingest.py` に書き下さない
- プレースホルダは `?` で書き、`db.q()` を通す
- DB 操作が失敗したら rollback し、例外をそのまま呼び出し元に送出する。ここで握り潰さない
- `conftest.py` に、契約の DDL で初期化した一時 SQLite DB を返す fixture を置く

**根拠:** 設計書 §4.4（`executemany` で 1 トランザクション INSERT、壊れた行は捨てて続行）、§4.3「`db.py` が持つ抽象」、§5.4（`event_id` に制約を置かない）

**テスト**

| # | 入力（1 リクエスト分の NDJSON） | 期待 |
| --- | --- | --- |
| 1 | event 3 行 + policy 2 行（すべて正常） | 戻り値 `{"stored": 5, "dropped": 0}`。`events` 3 行、`policy_state` 2 行 |
| 2 | event 2 行 + 壊れた行 1 行 + 未知の `kind` 1 行 | 戻り値 `{"stored": 2, "dropped": 2}`。`events` 2 行、`policy_state` 0 行 |
| 3 | 同一 `event_id` を含む event 2 行 | 戻り値 `{"stored": 2, "dropped": 0}`。`SELECT COUNT(*) FROM events` = 2、`SELECT COUNT(DISTINCT event_id) FROM events` = 1 |
| 4 | すべて壊れた 3 行 | 戻り値 `{"stored": 0, "dropped": 3}`。`events` 0 行 |
| 5 | event 2 行 + policy 1 行。ただし事前に `events` テーブルを DROP しておく | 例外が送出される。`policy_state` は 0 行（部分保存が残らない） |

**完了の判定**

```
pytest tests/test_ingest_store.py -q
```

期待出力（末尾行）:

```
5 passed
```

**コミット:** `feat(server): kind による振り分けと executemany による保存を追加`

---

### タスク 3: ルーティング層と `POST /ingest`

**ファイル:** 変更 `cc-governance-bmsd-server/app.py`（[8-A] が最小の形で置いている）
**依存:** タスク 2

**やること**

- Flask アプリを 1 つ置き、`POST /ingest` を登録する
- リクエストボディを生のバイト列として取り出し、`ingest.py` に渡す。`app.py` は NDJSON の中身を解釈しない
- `X-Ingest-Token` ヘッダと環境変数 `INGEST_TOKEN` を突き合わせる。一致しなければ本文を読まずに 401 を返す
- DB 接続はエンドポイント関数の中で `db.connect()` で取得し、関数の中で閉じる
- `ingest.py` が返す dict を JSON にして 200 で返す
- `ingest.py` が例外を送出した場合は 5xx を返す
- `BASE_PATH` を `SCRIPT_NAME` として与える WSGI ラッパを 1 個だけ置く。ラッパは **`PATH_INFO` が `BASE_PATH` で始まっていればそれを剥がし、始まっていなければ何もしない**（設計書 §4.3）。前段がサブパスを剥がす場合と剥がさない場合のどちらでも同じコードが通るため、前段の挙動で分岐しない
- **末尾スラッシュだけが違う URL を作らない。** ルートの定義を統一し、片方から片方へのリダイレクトが起きる経路を作らない
- ブループリント・アプリケーションファクトリ・`before_request` / `after_request` ・Flask 拡張を使わない

**根拠:** 設計書 §4.2（受け取るもの・返すものの表）、§4.3「過剰にしないための制約」3〜5・「サブパスの扱い」、§4.4「認証」、README §5（サブパス）

**テスト:** なし。タスク 4 とタスク 6 が HTTP 越しに担保する。

**完了の判定**

```
DB_DSN=sqlite:///$(mktemp -d)/t.db INGEST_TOKEN=tok \
  python -c "import sys; sys.path.insert(0,'cc-governance-bmsd-server'); import app; print(sorted(str(r) for r in app.app.url_map.iter_rules()))"
```

期待出力:

```
["/", "/ingest", "/static/<path:filename>"]
```

サブパスのラッパが、前段の挙動のどちらでも通ることを確かめる。`BASE_PATH=/gov` を与え、**サブパスを含む要求と含まない要求の両方**で `/` を叩く。

```
BASE_PATH=/gov DB_DSN=sqlite:///$(mktemp -d)/t.db INGEST_TOKEN=tok \
  python -c "import sys; sys.path.insert(0,'cc-governance-bmsd-server'); import app; c=app.app.test_client(); print(c.get('/gov/').status_code, c.get('/').status_code)"
```

期待出力（**どちらも 200**。前段が剥がしても剥がさなくても同じコードが通る）:

```
200 200
```

**コミット:** `feat(server): /ingest のルーティング層とトークン検査を追加`

---

### タスク 4: 応答コードの規則を 4 通り検証する

**ファイル:** テスト `tests/test_api_ingest.py`、必要なら変更 `cc-governance-bmsd-server/app.py`
**依存:** タスク 3

**やること**

- Flask のテストクライアントで `/ingest` を叩く fixture を `conftest.py` に足す
- 設計書 §4.4「応答コードの規則」の 4 行を、それぞれ独立したケースとして検証する
- 401 と 5xx については、応答コードだけでなく**DB に行が残っていないこと**まで確かめる。端末が控えを消してよいかどうかの判断がここに掛かっている

**根拠:** 設計書 §4.4「応答コードの規則」、§3.5（端末は 2xx なら spool を削除する）

**テスト**

| # | 要求 | 期待するコード | 期待する DB の状態 |
| --- | --- | --- | --- |
| 1 | 正しいトークン + 正常な event 2 行 | 200、本文 `{"stored": 2, "dropped": 0}` | `events` 2 行 |
| 2 | 正しいトークン + 正常 1 行 + 壊れた 1 行 | 200、本文 `{"stored": 1, "dropped": 1}` | `events` 1 行 |
| 3 | 正しいトークン + 壊れた 2 行 | 200、本文 `{"stored": 0, "dropped": 2}` | `events` 0 行 |
| 4 | 正しいトークン + 空ボディ | 200、本文 `{"stored": 0, "dropped": 0}` | `events` 0 行 |
| 5 | `X-Ingest-Token` ヘッダ無し + 正常な 2 行 | 401 | `events` 0 行 |
| 6 | `X-Ingest-Token: wrong` + 正常な 2 行 | 401 | `events` 0 行 |
| 7 | サーバの `INGEST_TOKEN` が未設定 + 正しそうなトークン + 正常な 2 行 | 401 | `events` 0 行 |
| 8 | 正しいトークン + 正常な event 2 行 + policy 1 行。ただし事前に `events` テーブルを DROP しておく | 500 以上 | `policy_state` 0 行 |

**完了の判定**

```
pytest tests/test_api_ingest.py -q
```

期待出力（末尾行）:

```
8 passed
```

**コミット:** `feat(server): /ingest の応答コードの規則を確定`

---

### タスク 5: フレームワークの import が `app.py` に閉じていることを確かめる

**ファイル:** 変更なし（検査のみ）
**依存:** タスク 4

**やること**

- `cc-governance-bmsd-server/` 配下の `.py` から、`flask` / `werkzeug` / `jinja2` / `waitress` の import を探す
- `app.py` 以外に 1 件も現れないことを確かめる
- 現れた場合は、その責務を素の値の受け渡しに書き換えて `app.py` へ寄せる

**根拠:** 設計書 §4.2（「守られているかは `grep` 1 回で確かめられる」）、README §5

**テスト:** なし。下記の `grep` がそのまま検査である。

**完了の判定**

```
grep -rnE '^[[:space:]]*(from|import)[[:space:]]+(flask|werkzeug|jinja2|waitress)' \
  cc-governance-bmsd-server --include='*.py' | grep -v '^cc-governance-bmsd-server/app\.py:'
```

期待出力: 標準出力に何も出ず、終了コードが `1`（該当なし）。

```
echo $?
```

```
1
```

**コミット:** `chore(server): フレームワーク import の局在を検査`

---

### タスク 6: 受信から保存までの往復テスト

**ファイル:** テスト `tests/test_roundtrip_ingest.py`
**依存:** タスク 5

**やること**

- 端末が送るのと同じ形の NDJSON を 1 本組み立て、HTTP で `POST /ingest` する
- 応答ではなく**テーブルの中身**を直接読み、値・`day` の再計算・重複の入り方を突き合わせる
- 同じボディを 2 回 POST し、行は増えるが `COUNT(DISTINCT event_id)` は増えないことを確かめる

**根拠:** 設計書 §4.4、§5.1、§5.2、§5.4、README §4「受信から集計まで」

**テスト**

送るボディ（3 行）は次のとおりとする。

- `{"kind":"event","event_id":"e1","ts":1758400000,"hook_event":"PostToolUse","user_email":"a@example.com","host":"h1","tool_name":"Bash","skill_name":"pdf"}`
- `{"kind":"event","event_id":"e2","ts":1758380399,"hook_event":"Stop","user_email":"a@example.com","host":"h1","context_tokens":120000}`
- `{"kind":"policy","event_id":"p1","ts":1758400000,"user_email":"a@example.com","host":"h1","key_name":"env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE","value":"60","prev_value":"80","apply_result":"applied","plugin_version":"0.1.0"}`

| # | 操作 | 確認する SQL | 期待値 |
| --- | --- | --- | --- |
| 1 | 1 回 POST | `SELECT COUNT(*) FROM events` | `2` |
| 1 | 〃 | `SELECT COUNT(*) FROM policy_state` | `1` |
| 1 | 〃 | `SELECT day, tool_name, skill_name, context_tokens FROM events WHERE event_id='e1'` | `(20352, 'Bash', 'pdf', None)` |
| 1 | 〃 | `SELECT day, hook_event, context_tokens, tool_name FROM events WHERE event_id='e2'` | `(20351, 'Stop', 120000, None)` |
| 1 | 〃 | `SELECT day, key_name, value, prev_value, apply_result, plugin_version FROM policy_state WHERE event_id='p1'` | `(20352, 'env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE', '60', '80', 'applied', '0.1.0')` |
| 2 | 同じボディをもう 1 回 POST | `SELECT COUNT(*) FROM events` | `4` |
| 2 | 〃 | `SELECT COUNT(DISTINCT event_id) FROM events` | `2` |
| 2 | 〃 | `SELECT COUNT(DISTINCT event_id) FROM policy_state` | `1` |

ケース数は 2（1 回 POST / 2 回 POST）とし、各ケースの中で上表の確認をすべて行う。

**完了の判定**

```
pytest tests/test_roundtrip_ingest.py -q
```

期待出力（末尾行）:

```
2 passed
```

**コミット:** `test(server): 受信から保存までの往復テストを追加`

---

## 4. この計画の完了条件

- [ ] `cc-governance-bmsd-server/ingest.py` と `cc-governance-bmsd-server/app.py` が存在し、どちらも 200 行以内である
- [ ] `ingest.py` は Flask を import せず、バイト列と DB 接続だけを受け取る
- [ ] `ingest.py` にも `app.py` にも、`events` / `policy_state` の列名が直接書かれていない（契約から組み立てている）
- [ ] 設計書 §4.4 の応答コードの規則 4 行が、それぞれ独立したテストケースで検証されている
- [ ] 401 と 5xx のケースで、DB に行が残っていないことまで確認されている
- [ ] `app.py` 以外のファイルにフレームワークの import が無いことが `grep` で確認されている
- [ ] 下記が通る（`tests/` には他の計画のテストも溜まるため、本計画が足したファイルに絞って実行する）

```
pytest -q tests/test_ingest_parse.py tests/test_ingest_store.py tests/test_api_ingest.py tests/test_roundtrip_ingest.py
```

期待出力（末尾行）:

```
33 passed
```

- [ ] `feat/server-ingest` を `main` にマージしている

---

## 5. この計画で確かめないこと

| 事項 | 回す先 |
| --- | --- |
| 集計クエリ（`queries_events.py` / `queries_policy.py`）と、`COUNT(DISTINCT event_id)` を通した重複込みの集計結果 | [5] |
| `/` `/policy` `/effect` `/assets` の 4 エンドポイントとテンプレート描画 | [5] |
| `POST /import` と CSV 取込 | [6] |
| 起動時の契約と実テーブルの突き合わせ（`init()` が不足列で例外を投げること） | [1] |
| MySQL 接続での INSERT の実挙動と `db.q()` のプレースホルダ変換 | [8] |
| `waitress` での待受、`BASE_PATH` をサブパスとして与えたときの実際の到達 | [8] |
| 端末側の送信（spool の退避・再送・タイムアウト・上限での破棄） | [2] |
| `X-Ingest-Token` を端末が実際に付けて送ること | [2] |
| 画面の認証と到達制御（Ingress / VPN） | 本設計の範囲外（設計書 §4.4） |

往復テストが見るのは「POST したものが `events` / `policy_state` に期待どおり入っていること」までである。**そこから先の集計は [5] の担当であり、本計画では画面の数字を一切確認しない。**
