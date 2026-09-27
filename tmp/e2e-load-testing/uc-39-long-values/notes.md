# UC39 長い値・特殊文字（No.39・No.33）

## 目的

`/ingest` に、長い値・絵文字・壊れた UTF-8・制御文字・型の違う値・巨大な値・XSS 的な文字列を含む行を送り、次を DB と HTTP 応答で確かめる。

1. その行がどう扱われるか（切り詰め・拒否・そのまま保存）
2. 同じリクエストのほかの正常な行を巻き込まないか
3. 応答コードとエラーの記録
4. 管理画面（HTML）が壊れないか・エスケープされるか

No.33 の観点で、契約にない項目・欠けた項目・改名された項目の扱いも 1 回ずつ見る。

## 仮説（実装を読んで立てたもの）

- VARCHAR は `contract.coerce` が**文字数**で切り詰める。書記素クラスタ（ZWJ 絵文字・結合文字）の途中で切れる
- 孤立サロゲート（`\ud83d`）は `?` に置換される。壊れた UTF-8 のバイト列は `json.loads` が `UnicodeDecodeError`（`ValueError`）を出し、その行だけ捨てる
- `event_id` の真偽判定は coerce 前に行う。`{"a":1}` のような値は検査を通り、coerce で NULL になり、**event_id が NULL の行が保存される**
- `event_id` は 36 文字で切り詰める。一意制約は無いので、先頭 36 文字が同じ別の ID は同じ ID として 2 行入る
- `json.loads` の `RecursionError`（深い入れ子）は `ValueError` ではないので捕まらず、**リクエスト全体が 500 になり正常な行も巻き込む**
- 4300 桁を超える整数リテラルは `ValueError` になり、その行だけ捨てる（Python 3.9 の上限が入っている版なら）
- 本文の大きさに上限（`MAX_CONTENT_LENGTH`）は無い。waitress の既定（1 GiB）まで受ける
- 管理画面は Jinja の自動エスケープで `<>&"'` を逃がす。NUL・ESC などの制御文字はそのまま HTML に出る
- 契約にない項目は黙って捨てられ、欠けた項目・改名前の名前で来た項目は黙って NULL になる（応答にも出ない）

## 手順

- `e2e/_server.py` の `DockerServer` で、本番に近い形（イメージ + entry.sh + BASE_PATH、SQLite）でサーバを 1 つ立てる
- 1 ケース = 1 リクエスト。本文は「正常行 A + 検査対象の行 + 正常行 B」の 3 行にする
- 応答（状態コード・`stored`・`dropped`）と、DB の全行（コンテナ内の python3 で JSON に書き出す）を突き合わせる
- 最後に 4 画面（概況・policy・effect・assets）を Basic 認証付きで取得し、XSS 文字列の生の出現とエスケープ後の出現を数える
- 判定のゲート確認: 判定関数に「わざと壊した期待値」を与え、食い違いを返すことを確かめる（`run.py` の `selftest()`。実行のたびに先に走る）

実行コマンド（worktree のルートで）:

```bash
CC_E2E_RUN=b-uc39 .venv/bin/python tmp/e2e-load-testing/uc-39-long-values/run.py    # SQLite（35 ケース + 画面用 4 行）
CC_E2E_RUN=b-uc39 .venv/bin/python tmp/e2e-load-testing/uc-39-long-values/mysql.py  # MySQL 8.4 × 文字コード 3 種
```

- `cases.py`: ケースの定義（検査対象の行のバイト列と期待）。`run.py`: SQLite での実行と判定。`mysql.py`: MySQL での補足
- MySQL の補足は、同じサーバイメージを `DB_DSN=mysql://...` で起動し、Docker ネットワーク上の `mysql:8.4` に繋いで行った。
  DB は `CREATE DATABASE ... CHARACTER SET <utf8mb4|utf8mb3|latin1>` で作り、テーブルはサーバの `db.init` に作らせた（DDL は CHARSET を指定しないので DB の既定を継ぐ）

`CC_E2E_RUN` は `b` ではなく `b-uc39` にした。同じトラックの UC50 が `CC_E2E_RUN=b` で pytest e2e を繰り返しており、
`e2e/conftest.py` の `docker_ok` はラベルの完全一致で「前回の片付け漏れ」を検査する。`b` のままだと、この UC のコンテナが
生きている間に UC50 が新しいセッションを始めると、UC50 が失敗する。

## 負荷の掛け方

重い負荷ではない（リクエストは SQLite で 39 本、MySQL で 18 本。最大の本文は約 10 MB が 1 本）。`heavy.lock` は取らない。

## 結果

測定条件: macOS・Colima（2 CPU・3 GiB）。サーバは `e2e/_server.py` と同じ形（`python:3.9-slim`（3.9.25）+ entry.sh + waitress + BASE_PATH）。
SQLite は `DB_DSN=sqlite:///...`。MySQL は公式イメージ `mysql:8.4`（2026-09-27 に取得）と pymysql 1.2.3。
1 リクエスト = 正常行 A + 検査対象の行 + 正常行 B。時間は 1 回の測定で、相対値としてだけ使う。

**判定: SQLite 39 ケースすべて期待（下の表）と一致。MySQL では、DB が utf8mb4 以外だとリクエスト全体が 500 になり、正常な行も巻き込む。**

### 巻き込み（同じリクエストの正常行）

| 対象行 | DB | 応答 | 正常行の保存 |
| --- | --- | --- | --- |
| 下の表の 34 ケースと画面用 4 行 | SQLite | 200 | **2/2** |
| 10 万段の入れ子 `[[[...]]]` を値に持つ行 | SQLite | **500**（Flask の HTML。ログに `RecursionError`） | **0/2** |
| 絵文字 `🧪` を含む行 | MySQL utf8mb3 | **500**（`pymysql.err.DataError 1366 Incorrect string value`） | **0/2** |
| 絵文字、または `あ` を含む行 | MySQL latin1 | **500**（同上） | **0/2** |
| 255 文字の ASCII・255 文字のかな・孤立サロゲート・制御文字・XSS 文字列 | MySQL utf8mb4 / utf8mb3 / latin1（かなは utf8mb4・utf8mb3） | 200 | 2/2 |

### 対象行の扱い（SQLite。`stored`・`dropped` は 3 行の合計）

| 入力 | 扱い |
| --- | --- |
| `skill_name` に 300 文字（ASCII・かな・非 BMP の絵文字） | 保存。**コードポイント単位で** 255 文字に切り詰め |
| 253 文字 + ZWJ 絵文字 `👨‍👩‍👧` | 保存。`…👨\u200d` で切れる（書記素の途中） |
| 254 文字 + `e\u0301`（結合文字） | 保存。`e` だけ残り、結合記号が落ちる |
| JSON エスケープのサロゲートペア `\ud83d\ude00` | 保存。`😀` に正しく復号 |
| 孤立サロゲート `\ud83d`（エスケープ） | 保存。`x?y` に置換 |
| 本文のバイト列が壊れた UTF-8（`\xff\xfe\xc3`・過長形式 `\xc0\xaf`） | その行だけ破棄（`dropped=1`） |
| 本文のバイト列が CESU 形式のサロゲート（`\xed\xa0\xbd`） | **保存**。`json.loads(bytes)` が `surrogatepass` で復号し、`coerce` が `?` に置換 |
| 行頭に UTF-8 BOM | 保存（`json.loads(bytes)` が BOM を読み飛ばす） |
| JSON エスケープの NUL・改行・CR・TAB・ESC・DEL・U+2028 | **そのまま保存**（SQLite・MySQL とも） |
| 文字列内の生の制御文字（`\x01`） | その行だけ破棄 |
| 行末の CR（CRLF の本文） | 保存 |
| `skill_name` に 123 / true / `{"a":1}` / `NaN` | `"123"` / `"true"` / NULL / `"nan"` |
| `context_tokens` に `"12"` / 1.5 / 2**64 | 12 / NULL / NULL |
| `context_tokens` に 5000 桁の整数リテラル | その行だけ破棄（Python の整数変換の桁上限 4300 による `ValueError`） |
| `event_id` に `{"a":1}` | **保存。event_id が NULL の行になる**（真偽の検査が coerce の前） |
| `event_id` に 0 | 破棄 |
| `event_id` に 100 文字 | 保存。36 文字に切り詰め（一意制約は無い） |
| `ts` に true | **保存。`ts=1`・`day=0`（1970 年）になる** |
| `ts` に float / 数字文字列 | 破棄 / 保存 |
| `kind` が `Event` / 行が JSON 配列 | 破棄 |
| 10 MB の値 1 つ（本文 10,000,448 バイト） | 保存。255 文字に切り詰め。応答 0.11 秒（1 回目）・0.85 秒（2 回目） |

### No.33（契約にない項目・欠けた項目・改名）

| 入力 | 扱い | 応答 |
| --- | --- | --- |
| 契約にないキー `new_column` を足した行 | キーだけ黙って捨て、行は保存 | `stored=3, dropped=0`（区別できない） |
| `kind`・`event_id`・`ts` だけの行 | 保存。ほかの列はすべて NULL（`hook_event`・`session_id` を含む） | `stored=3` |
| 列名 `compact_trigger` ではなく hook の元の名前 `trigger` で送った行 | 行は保存、`compact_trigger` は NULL | `stored=3` |

破棄した行の理由は、応答にもサーバのログにも出ない（`dropped` の件数だけ）。

### 管理画面

XSS 文字列（`<script>alert(1)</script>` と `"><img src=x onerror=alert(2)>`）を `skill_name`・`command_name`・`command_source`・`permission_mode`・`effort_level`・`source`・
errors の `stage`・`error_type`・`plugin_version`・policy_state の `user_email`・`host`・`prev_value`・`plugin_version` に入れた。

| 画面 | 応答 | 生の出現 | エスケープ後の出現 | NUL | ESC |
| --- | --- | --- | --- | --- | --- |
| 概況 `/` | 200 | 0 | 7 | 0 | 0 |
| `/policy` | 200 | 0 | 7 | 2 | 0 |
| `/effect` | 200 | 0 | 0（文字列の列を出さない） | 0 | 0 |
| `/assets` | 200 | 0 | 3 | 2 | 2 |

Jinja の自動エスケープは効いている。制御文字（NUL・ESC）は**エスケープされずに HTML にそのまま出る。**
ブラウザでの見え方（NUL の置換や表の崩れ、255 文字の絵文字の折り返し）は確かめていない（ブラウザを使っていない）。

### 判定がゲートしていることの確認

- `run.py` の `selftest()` が、正しい期待では空、壊した期待（長さ 254・`stored=2`・正常行の ID を差し替え・状態 500）では食い違いを返すことを確かめる（実行のたびに先に走る）
- 巻き込みの判定は、同じ判定関数が 34 ケースで 2/2、入れ子のケースで 0/2 を返した。どちらの向きにも動くことを実データで確かめた
- 1 回目の実行では、期待を誤った 2 ケース（CESU・欠けた項目の行の探し方）が NG になった。実物に合わせて期待と探し方を直し、再実行した

## 想定外だったこと

- **MySQL で DB の文字コードが utf8mb4 でないと、絵文字 1 文字でバッチ全体が落ちる。**契約の DDL は CHARSET を指定せず、DB の既定に従う。
  既存の実測（`docs/knowledge/measurements.md`）は `mysql` CLI での桁超過だけを見ており、文字コードと pymysql の `executemany` は範囲外だった
- 端末の `_sender.py` は、応答が 2xx でなければ spool のファイルを消さずに次の送信で送り直す（コードを読んで確認。実物では流していない）。
  このため**同じファイルが毎回 500 になり、`spool_max_days`（7 日）か `spool_max_bytes`（5 MB）で破棄されるまで、そのファイルの全行が届かない。**
  送るたびに `stage=send`・`error_type=HTTP 500` の error 行が増える（error 行は別のファイルに入るので届く。ただし 500 の原因は分からない）
- CESU 形式のサロゲートのバイト列は、壊れた UTF-8 なのに破棄されず `?` で保存される
- `event_id` が NULL の行、`ts=1`（1970 年）の行が検査を通る
- `CC_E2E_RUN=b` は同じトラックの UC 同士でも衝突する（「手順」の節）

## 課題と改善案

### サーバ側の修正案（本物に入れるべき。優先度順）

1. **MySQL の文字コードを固定する（P1。リリース前に要る）**: `db.py` の MySQL 方言で、`CREATE TABLE` に `DEFAULT CHARSET=utf8mb4` を付ける。
   加えて起動時に `information_schema.COLUMNS` で VARCHAR 列の `CHARACTER_SET_NAME` を確かめ、utf8mb4 以外なら `_check_contract_columns` と同じく起動を止める（既存のテーブルは `CREATE TABLE IF NOT EXISTS` では直らないため）。
   `server/tests` に、utf8mb3 の表を与えると起動が止まるテストを足し、検査を外すと落ちることを確かめる
2. **1 行の失敗でバッチ全体を落とさない**: `ndjson.parse_line` で `RecursionError` も捕まえて破棄に数える。
   `ingest` は `executemany` が `DataError` などで失敗したら、1 行ずつ入れ直して失敗した行だけを破棄に数える（件数は応答の `dropped` か別のキーで返す）
3. **`event_id`・`ts` の検査を coerce の後で行う**: coerce 後の `event_id` が None なら破棄する。`ts` の真偽値は拒否する（`_coerce_int_like` は bool を int にするため、`ts` だけ別に見る）
4. **破棄の理由を数えてログに出す**: 本文は出さず、理由ごとの件数だけを出す（JSON 不正・kind 不正・event_id 欠落・ts 不正・DB の拒否）。No.33 の「無言のドリフト」を見つける手がかりになる。
   未知キーの件数も出すかは設計判断（利用者の情報を増やさない範囲で）
5. `MAX_CONTENT_LENGTH` を設ける（例: 端末の spool 上限 5 MB を根拠に 16 MB）。今は waitress の上限まで受ける（waitress の既定値は確かめていない）

### 端末側（設計判断として提案）

- 5xx が同じ spool ファイルで続くとき、ファイルを行ごとに分けて送り直すか、隔離して先へ進むかを決める。今は 1 行の毒でファイル全体が最大 7 日止まる

### `e2e/` の追加・修正

- `e2e/test_server.py` に「不正な 1 行が同じリクエストの正常行を巻き込まない」を 1 本足す（共有の `server` fixture を使い、数秒で終わる）。
  入れる行は代表だけにする: 壊れた UTF-8・生の制御文字・JSON 配列・10 万段の入れ子（サーバ修正 2 の後）。網羅は `server/tests` に置く
- 同じテストで `/assets` を取得し、XSS 文字列が生で出ないことを見る（`skill_name` に入れるだけで足りる）
- MySQL の文字コードは E2E（SQLite）では見えない。E2E に MySQL を足すより、サーバ修正 1 の起動時検査と `server/tests` で守るほうが安い

### `docs/guide/e2e.md` の修正

- サーバ章の「実物でも確かめられない限界」に書く: E2E は SQLite で動くので、DB の文字コード・strict モード・pymysql の `executemany` の失敗の粒度は見ない。MySQL で見る手順は、このフォルダの `mysql.py` の形（サーバイメージを Docker ネットワークで `mysql:8.4` に繋ぐ）
- 「並行」の注意として書く: `CC_E2E_RUN` は**同時に動く実行ごとに**一意にする（トラック単位では足りない。`docker_ok` はラベルの完全一致で片付け漏れを見るため）

### e2e スキルの拡張

- 「受信の堅牢性」の枝を `references/` に置き、雛形として「正常行 2 つで挟んだ 1 リクエスト」「DB の全行を JSON で書き出して突き合わせる」「判定の自己検査を先に走らせる」を示す（このフォルダの `run.py`）
- 一時スクリプトの `CC_E2E_RUN` は `<トラック>-<作業名>` にするよう明記する

### `docs/knowledge/` に足す外界の事実（実測）

- `measurements.md` の MySQL の節に足す: MySQL 8.4 + pymysql 1.2.3 の `executemany` で、utf8mb3 の表に 4 バイト文字、latin1 の表にかなを入れると `DataError 1366` になり、**そのステートメントの全行が入らない**。utf8mb4 なら絵文字・NUL・ESC はそのまま入る
- Python 3.9 の `json.loads(bytes)` の性質: 復号は `surrogatepass`（CESU 形式のサロゲートを受理する）／UTF-8 BOM を読み飛ばす／文字列内の生の制御文字は拒否／`NaN`・`Infinity` を受理／4300 桁を超える整数は `ValueError`／深い入れ子は `ValueError` ではなく `RecursionError`
- Jinja の自動エスケープは `<>&"'` だけを逃がし、NUL・ESC などの制御文字は HTML にそのまま出す

## 片付けたもの・残したもの

- 片付けた: ラベル `cc-e2e=b-uc39` のコンテナ・イメージ・ネットワーク（各スクリプトの `finally` で削除し、`docker ps -a` / `docker images` / `docker network ls` で 0 件を確認）、
  隔離ルート（`E2ERoot.cleanup`）、取得した `mysql:8.4` イメージ（開始時には無かった。使うコンテナが無いことを確かめてから削除）、`__pycache__`
- 残した: このフォルダの `notes.md`・`cases.py`・`run.py`・`mysql.py`（コミットは監督が行う）。
  `.local/e2e-load-testing/uc-39-long-values/` の `report.json`・`db.json`・`page_*.html`・`logs.txt`・`mysql-*.json/txt`（git 管理外。MySQL のログのパスワードは伏せた）
- 触れていない: `$TMPDIR` の `cc-e2e-*`（4 つ。中身と時刻から他の実行のもの）
- コードの変更: なし（`plugin/`・`server/`・`e2e/` は変えていない）
