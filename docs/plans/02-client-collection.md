# [2] 端末：イベントの抽出・蓄積・送信

**目的:** hook 入力から契約が名指しする値だけを取り出し、ローカルキューに追記し、detach した独立プロセスでサーバへ送る。Claude Code の動作を一切妨げない。
**設計書:** `../design.md` §3.2〜§3.5 / §3.8 / §3.9
**依存:** [1] 契約と基盤
**ブランチ:** `feat/client-collection`

---

## 1. 作るもの

| ファイル | 責務 | 想定行数 |
| --- | --- | --- |
| `governance/hooks/collect.py` | 全 hook 共通の収集エントリ。無効化の判定・標準入力の読み取り・行の組み立て・追記・送信の起動 | 55 |
| `governance/hooks/_context.py` | transcript 末尾から `context_tokens` を取る | 25 |
| `governance/hooks/_queue.py` | `queue.jsonl` への追記・spool への退避・上限での破棄・送信条件の判定 | 45 |
| `governance/hooks/_sender.py` | detach して POST する独立プロセスと、その起動関数 | 60 |
| `governance/hooks/_identity.py` | `user_email` / `host` / `event_id` の解決とキャッシュ | 35 |
| `governance/hooks/hooks.json` | hook 登録（収集分の 6 種） | 30 |
| `governance/config.json` | 送信先 URL・受信トークン・送信条件 | 10 |
| `tests/conftest.py`（変更） | fixture の読み込みと `governance/hooks` の import 経路を足す。ファイル自体は [1] が作ってある | — |
| `tests/fixtures/hook_inputs/*.json` | 実サンプル 112 件を無害化したもの（タスク 1） | — |
| `tests/client/test_identity.py` | タスク 2 の検証 | — |
| `tests/client/test_collect_extract.py` | タスク 3 の検証 | — |
| `tests/client/test_collect_no_leak.py` | タスク 4 の検証 | — |
| `tests/client/test_context.py` | タスク 5 の検証 | — |
| `tests/client/test_queue.py` | タスク 6 の検証 | — |
| `tests/client/test_sender.py` | タスク 7 の検証 | — |
| `tests/client/test_collect_entry.py` | タスク 8・タスク 9 の検証 | — |

本計画で触る Python ファイルは 5 つだけである。`session_start.py` / `_settings.py` / `notices.json` / `plugin.json` には触れない。

---

## 2. この計画に固有の前提

README §5 の共通制約に加えて、本計画だけに効く前提を置く。

| 項目 | 前提 |
| --- | --- |
| 計画 [1] の完了 | `governance/hooks/contract.py` が `main` にあり、定数 `HOOK_FIELDS` / `EXTRA_COLUMNS` / `POLICY` / `POLICY_COLUMNS` / `CSV_COLUMNS` と関数 `dig(obj, path)` / `coerce(value, type)` / `to_day(ts)` / `ddl()` を持つ |
| `day` の算出 | 契約の `to_day(ts)` を呼ぶ。端末側で式を書かない |
| 端末の状態の置き場所 | `${CLAUDE_PLUGIN_DATA}`（プラグインの永続データ置き場。`~/.claude/plugins/data/<識別子>/` を指し、hook に環境変数として渡る）。この変数が渡らない経路では `~/.claude/cc-governance/` を使う。`identity.json` / `queue.jsonl` / `spool/` / `sent_at` はすべてここに置く。**解決規則は `_queue.py` の 1 か所に置き、`_identity.py` はそれを呼ぶ** |
| テストの隔離 | `CLAUDE_PLUGIN_DATA` を一時ディレクトリに向ける。代替の経路を検査するケースだけ、`CLAUDE_PLUGIN_DATA` を外したうえで `HOME` を差し替える |
| 端末の依存 | **標準ライブラリのみ。** 端末に追加インストールを要求しない。HTTP は `urllib.request` で行う |
| 端末の Python | サーバと同じく 3.9 で動く構文に留める。端末の `python3` の版を選べないため |
| 送信ヘッダ | 受信トークンは `X-Ingest-Token` に載せる。計画 [4] のサーバ側と同一の名前 |
| 行の形式 | 1 行 = 1 JSON オブジェクト。`kind` に `"event"` を必ず含める（計画 [4] の振り分けの材料） |
| 行の列 | `kind` + `EXTRA_COLUMNS` の 7 列 + `HOOK_FIELDS` の 12 列。**これ以外のキーを出力に含めない** |
| `hook_event` | hook 登録時にコマンド引数で渡された値をそのまま使う。標準入力の `hook_event_name` を見ない |
| `context_tokens` | `PreCompact` と `Stop` の 2 hook でのみ算出する |
| hook の入口 | `collect.py` と `session_start.py` の 2 つ。`_` 始まりのファイルは入口にしない |
| `SessionStart` の登録 | 本計画の `hooks.json` は **収集分の 6 種のみ**を登録する。`SessionStart` → `session_start.py` の行は計画 [3] が足す |
| `SessionStart` からの収集 | `session_start.py` が `collect.py` の関数を呼ぶ形とし、その呼び出し自体は計画 [3] で書く |
| `plugin_version` | `policy_state` の列であり、本計画の対象外。`_identity.py` への追加は計画 [3] |
| テストの置き場所 | 端末側のテストは `cc-governance-bmsd/tests/client/`、fixture は `cc-governance-bmsd/tests/fixtures/`（README §4）。**`governance/` の下にも `cc-governance-bmsd-server/` の下にも置かない** |
| テストの実行 | `cc-governance-bmsd/` をカレントディレクトリとして `pytest tests/client/...` を実行する |
| 実機確認の範囲 | `HOME` を差し替えた隔離環境（`local/` の下）の作業ディレクトリに置いた `.claude/settings.json` で行う。**利用者本人の `~/.claude/` には読み書きも削除もしない** |

---

## 3. タスク

コマンドはすべて `cc-governance-bmsd/` をカレントディレクトリとして実行する。テストの件数は「表の 1 行 = 1 ケース」で数える。

### タスク 1: fixture の用意

**ファイル:** 作成 `tests/fixtures/hook_inputs/*.json`、変更 `tests/conftest.py`
**依存:** なし

**やること**

- `local/fixtures/cc-fixtures-2026-09-21/` の 112 件を読み、**自由文が入りうる値をセンチネル文字列に置換した写し**を `tests/fixtures/hook_inputs/` に作る。ファイル名は元のままとする
- センチネルは `SENTINEL-<連番>` の形とし、全 112 件を通して一意にする。**キーの有無と構造は元のまま保つ**（置換するのは値だけ）
- 個人のパスを含む値は、ホームディレクトリ部分を固定の置換先に寄せる
- 生成結果を git にコミットする。`local/` の原本は git に入れない
- [1] が作った `tests/conftest.py` に、fixture を 1 件ずつ・hook 種別ごとに取り出す仕組みを足す（`governance/hooks` の import 経路は [1] が置いてある）

**置換の対象**

| キーパス | 置換後 |
| --- | --- |
| `prompt` / `tool_response` / `message` / `last_assistant_message` / `custom_instructions` / `error` / `command_args` | センチネル文字列（元が dict / list なら、その中の文字列をすべてセンチネルに置換する） |
| `tool_input.command` / `tool_input.description` / `tool_input.query` | センチネル文字列 |
| `cwd` / `transcript_path` / `scratchpad_dir` | ホームディレクトリ部分を `/home/u` に置換 |

**根拠:** README §4（hook 入力からの値の抽出は実サンプルを fixture に使う）、`CLAUDE.md`（生の収集データを git に入れない）

**完了の判定**

```
ls tests/fixtures/hook_inputs/*.json | wc -l
```

期待出力:

```
     112
```

```
jq -r .hook_event_name tests/fixtures/hook_inputs/*.json | sort | uniq -c | sort -rn
```

期待出力:

```
  60 PostToolUse
  16 UserPromptSubmit
  11 Stop
   9 SessionStart
   8 SessionEnd
   4 UserPromptExpansion
   3 PostToolUseFailure
   1 PreCompact
```

```
grep -rl 'SENTINEL-' tests/fixtures/hook_inputs/ | wc -l
```

期待出力（`prompt` / `tool_response` / `error` / `command_args` / `last_assistant_message` / `custom_instructions` / `tool_input` の自由文キーのいずれかを持つファイル数）:

```
      95
```

**コミット:** `test(client): hook 入力の fixture を無害化して追加`

---

### タスク 2: 識別子の解決

**ファイル:** 作成 `governance/hooks/_identity.py` / テスト `tests/client/test_identity.py`
**依存:** なし

**やること**

- `user_email` を、環境変数 `CC_GOVERNANCE_USER_EMAIL` → `git config --global user.email` → `None` の順に解決する。小文字化だけを行い、書式の検査はしない
- 解決結果を状態ディレクトリの `identity.json` にキャッシュし、**2 回目以降は subprocess を起動しない**
- 解決できなかった場合も、その結果をキャッシュする。毎回 `git` を呼びに行く状態を作らない
- `host` は `platform.node()` を返す
- `event_id` は呼び出しごとに `uuid.uuid4()` の文字列を返す
- `identity.json` が壊れている・読めない場合は、キャッシュが無いものとして解決し直す

**根拠:** 設計書 §3.8

**テスト**

| # | 状況 | 期待 |
| --- | --- | --- |
| 1 | `CC_GOVERNANCE_USER_EMAIL=Foo@Example.COM`、キャッシュ無し | `user_email` = `"foo@example.com"` |
| 2 | #1 の直後にもう一度呼ぶ | 同じ値。`identity.json` が存在し、その値を持つ |
| 3 | 環境変数なし、`git config` が `Bar@Example.com` を返す | `"bar@example.com"` |
| 4 | 環境変数なし、`git config` が空文字を返す | `None` |
| 5 | 環境変数なし、`git config` が非 0 で終了する | `None`（例外を投げない） |
| 6 | 環境変数なし、`git` が存在しない | `None`（例外を投げない） |
| 7 | キャッシュ済みの状態で `git config` を呼ぶと失敗する細工をする | キャッシュの値を返す（subprocess を起動しない） |
| 8 | キャッシュ済み、環境変数が別の値 | 環境変数の値を返す（環境変数が最優先） |
| 9 | `identity.json` が壊れた JSON | 例外なし。解決し直して上書きする |
| 10 | `identity.json` の親ディレクトリが無い | ディレクトリを作って書き込む |
| 11 | `host` | `platform.node()` と一致する |
| 12 | `event_id` を 1000 回 | すべて相異なる。長さ 36 |

**完了の判定**

```
pytest tests/client/test_identity.py -q
```

期待出力（末尾行）:

```
12 passed
```

**コミット:** `feat(client): user_email / host / event_id の解決とキャッシュを追加`

---

### タスク 3: hook 入力からの列の抽出

**ファイル:** 作成 `governance/hooks/collect.py` / テスト `tests/client/test_collect_extract.py`
**依存:** タスク 1、タスク 2

**やること**

- hook 入力の dict と `hook_event` の文字列を受け取り、送信する 1 行分の dict を返す関数を置く
- `HOOK_FIELDS` を先頭から回し、契約の `dig` でキーパスを解決し、契約の `coerce` で列の型に寄せる。**hook の種類で分岐しない**
- `EXTRA_COLUMNS` の 7 列を組み立てる。`event_id` / `host` / `user_email` は `_identity.py`、`ts` は `int(time.time())`、`day` は契約の `to_day(ts)`、`hook_event` は引数の値
- `context_tokens` は `hook_event` が `PreCompact` / `Stop` のときだけ `_context.py` で算出し、それ以外は `None` とする
- `kind` に `"event"` を入れる
- 入力が dict でない場合も例外にせず、`HOOK_FIELDS` 由来の列をすべて `None` にした行を返す
- 出力の値は分類も語彙の検査もしない。`None` は `None` のまま残す
- `tool_input` は `skill` キーのみを読む。dict 全体を保持する変数を作らない

**根拠:** 設計書 §3.2、§3.4（呼ぶのは 2 か所のみ）、§9.1（キーが増えても取らない）

**テスト**

`ts` / `event_id` を固定する差し替えを置いたうえで、fixture 112 件を流す。

| # | 入力 | 期待 |
| --- | --- | --- |
| 1 | 112 件すべて | 出力のキー集合が `{"kind"}` + `EXTRA_COLUMNS` の列名 + `HOOK_FIELDS` の列名と**完全に一致**する（過不足なし） |
| 2 | 112 件すべて | `kind` = `"event"`、`session_id` が非 `None`、`hook_event` が引数の値と一致 |
| 3 | 112 件すべて | `day` が契約の `to_day(ts)` の戻り値と一致 |
| 4 | 112 件すべて | `agent_id` = `None`（サンプルに 1 件も存在しない） |
| 5 | `PostToolUse` 60 件 | `tool_name` が入力の `tool_name` と一致する文字列 |
| 6 | `tool_input.skill` を持つ `PostToolUse` 1 件 | `skill_name` が入力の値と一致 |
| 7 | `tool_input` はあるが `skill` が無い `PostToolUse` 59 件 | `skill_name` = `None` |
| 8 | `tool_input` を持たない 49 件（`UserPromptSubmit` / `SessionStart` / `SessionEnd` / `UserPromptExpansion` / `Stop` / `PreCompact`） | `skill_name` = `None`。例外を投げない |
| 9 | `PostToolUseFailure` 3 件（`is_interrupt` が JSON の `false`） | `is_interrupt` = `0`（`int` 型。`False` でも `"false"` でもない） |
| 10 | `is_interrupt` を持たない 109 件 | `is_interrupt` = `None` |
| 11 | `permission_mode` を持つ 94 件 | `permission_mode` = `"auto"` |
| 12 | `permission_mode` を持たない 18 件 | `permission_mode` = `None` |
| 13 | `effort.level` を持つ 74 件 | `effort_level` が `"high"` / `"medium"` のいずれか |
| 14 | `effort` を持たない 38 件 | `effort_level` = `None` |
| 15 | `PreCompact` 1 件（`trigger` = `manual`） | `compact_trigger` = `"manual"` |
| 16 | `trigger` を持たない 111 件 | `compact_trigger` = `None` |
| 17 | `SessionStart` 9 件 | `source` が入力の `source` と一致 |
| 18 | `source` を持たない 103 件 | `source` = `None` |
| 19 | `UserPromptExpansion` 4 件 | `command_name` / `command_source` が入力の値と一致 |
| 20 | `UserPromptExpansion` 以外の 108 件 | `command_name` / `command_source` = `None` |
| 21 | `prompt_id` を持つ 103 件 | `prompt_id` が入力の値と一致 |
| 22 | `prompt_id` を持たない 9 件 | `prompt_id` = `None` |
| 23 | `hook_event` に `Stop` を与える | `context_tokens` の算出が 1 回呼ばれる |
| 24 | `hook_event` に `PreCompact` を与える | `context_tokens` の算出が 1 回呼ばれる |
| 25 | `hook_event` に `PostToolUse` を与える | `context_tokens` の算出が呼ばれない。値は `None` |
| 26 | 入力に `context_tokens` を持つ `SessionStart` 3 件、`hook_event` = `SessionStart` | `context_tokens` = `None`（入力の値を使わない） |
| 27 | `{}` | 例外なし。`HOOK_FIELDS` 由来の 12 列がすべて `None` |
| 28 | `[]` / `"x"` / `None` | 例外なし。`HOOK_FIELDS` 由来の 12 列がすべて `None` |
| 29 | 契約に無いキーだけを持つ入力 | 例外なし。出力のキー集合は #1 と同じ |
| 30 | `SessionEnd` 8 件（登録しない hook） | 例外なし。#1 と同じキー集合の行を返す |

**完了の判定**

```
pytest tests/client/test_collect_extract.py -q
```

期待出力（末尾行）:

```
30 passed
```

**コミット:** `feat(client): hook 入力から契約の列を抽出する処理を追加`

---

### タスク 4: 自由文が出力に現れないことの回帰テスト

**ファイル:** テスト `tests/client/test_collect_no_leak.py`
**依存:** タスク 3

**やること**

- タスク 3 の抽出関数に fixture を流し、**出力を JSON 文字列に直したときにセンチネルが 1 つも現れない**ことを検査する
- 出力の文字列値が、契約が名指しするキーパスの値そのものであることを検査する。「たまたま含まれていない」ではなく「名指ししたものしか入らない」を押さえる
- 自由文キーに巨大な値・特殊文字を入れた合成入力でも同じことを検査する

**根拠:** 設計書 §3.2（`prompt` / `tool_response` / `message` に一切触れない）、README §5（収集する値は契約に名指しされたキーパスのみ）

**テスト**

| # | 入力 | 期待 |
| --- | --- | --- |
| 1 | fixture 112 件 | 出力の JSON 文字列に `SENTINEL-` が現れない |
| 2 | fixture 112 件 | 出力の文字列値はいずれも、`HOOK_FIELDS` のキーパスを `dig` した値か `EXTRA_COLUMNS` の値と一致する |
| 3 | `prompt` にセンチネルを入れた合成入力 | 出力に現れない |
| 4 | `tool_response` にセンチネルを入れた合成入力 | 出力に現れない |
| 5 | `message` にセンチネルを入れた合成入力 | 出力に現れない |
| 6 | `tool_input.command` にセンチネルを入れた合成入力 | 出力に現れない。`skill_name` = `None` |
| 7 | `tool_input.description` にセンチネルを入れた合成入力 | 出力に現れない |
| 8 | `tool_input.query` にセンチネルを入れた合成入力 | 出力に現れない |
| 9 | `tool_input` の入れ子の奥（`tool_input.a.b.c`）にセンチネル | 出力に現れない |
| 10 | `tool_input.skill` とセンチネル入りの `command` を同時に持つ入力 | `skill_name` は入る。センチネルは現れない |
| 11 | 1MB のセンチネル文字列を `prompt` に入れた入力 | 出力に現れない。出力の JSON 長が 4KB 未満 |
| 12 | 自由文キーに改行・引用符・`\u0000` を含む入力 | 出力に現れない。例外を投げない |

**完了の判定**

```
pytest tests/client/test_collect_no_leak.py -q
```

期待出力（末尾行）:

```
12 passed
```

**コミット:** `test(client): 自由文が送信行に現れないことの回帰テストを追加`

---

### タスク 5: `context_tokens` の取得

**ファイル:** 作成 `governance/hooks/_context.py` / テスト `tests/client/test_context.py`
**依存:** なし

**やること**

- transcript のパスを受け取り、**末尾 256KB だけ**をバイト列として読む。全文をパースしない
- 行を逆順に走査し、最初に見つかった `message.usage` の `input_tokens` / `cache_creation_input_tokens` / `cache_read_input_tokens` を足して返す。欠けている項は 0 として扱う
- `usage` が見つからない・読めない・パスが `None` の場合は `None` を返す
- 合算できない値（数値でない値）が混ざっていた場合も `None` を返す
- **どの入力でも例外を外に出さない。** 戻り値は `None` か数値のいずれか
- 率に変換しない。絶対値のまま返す

**根拠:** 設計書 §3.4、§9.1（`usage` 構造が変われば静かに欠測する）

**テスト**

各ケースは一時ディレクトリに JSONL を作って渡す。

| # | 入力ファイル | 期待 |
| --- | --- | --- |
| 1 | 末尾行が `input_tokens` 100 / `cache_creation_input_tokens` 20 / `cache_read_input_tokens` 3 | `123` |
| 2 | `usage` 行が 2 つ。後ろの行が合計 5、前の行が合計 999 | `5`（末尾に近い方を採る） |
| 3 | `usage` に `input_tokens` 100 のみ | `100`（欠けた項は 0） |
| 4 | `usage` が `{}` | 後続を探し、見つからなければ `None` |
| 5 | `message` はあるが `usage` が `null` | 更に前の行を探す。無ければ `None` |
| 6 | `message` を持たない行だけ 100 行 | `None` |
| 7 | 存在しないパス | `None` |
| 8 | パスが `None` | `None` |
| 9 | パスが空文字 | `None` |
| 10 | 0 バイトのファイル | `None` |
| 11 | ディレクトリのパス | `None` |
| 12 | 読み取り権限を外したファイル | `None` |
| 13 | 末尾 256KB の外にだけ `usage` がある（先頭に `usage` 行、その後 300KB のダミー行） | `None` |
| 14 | `usage` 行の後ろに壊れた JSON 行が 3 行混ざる | `usage` の合計値 |
| 15 | 256KB 境界で先頭行が途中から切れる | 切れた行を飛ばし、その後ろの `usage` の値 |
| 16 | 行全体が空（改行のみ）が多数混ざる | `usage` の合計値 |
| 17 | `usage` の値が文字列（`"100"`） | `None`（例外を投げない） |
| 18 | `usage` が list | `None`（例外を投げない） |
| 19 | JSON でないテキスト 1MB | `None` |
| 20 | 16MB のファイル。末尾に `usage`（合計 7） | `7`。かつ実行時間が 1 秒未満 |
| 21 | UTF-8 として不正なバイト列を含む行 | 例外なし。戻り値は `None` か数値 |

**完了の判定**

```
pytest tests/client/test_context.py -q
```

期待出力（末尾行）:

```
21 passed
```

**コミット:** `feat(client): transcript 末尾から context_tokens を取る処理を追加`

---

### タスク 6: ローカルキューの追記・退避・破棄

**ファイル:** 作成 `governance/hooks/_queue.py` / テスト `tests/client/test_queue.py`
**依存:** なし

**やること**

- 状態ディレクトリのパスを解決する。`${CLAUDE_PLUGIN_DATA}` があればその配下、無ければ `~/.claude/cc-governance/` 配下とする。親ディレクトリが無ければ作る
- 1 行分の dict を受け取り、`queue.jsonl` に追記する。**`open(..., "a")` で開き、`write` は 1 回**。ロックもインデックスも持たない。hook 内で行う同期 I/O はこれだけである
- **1 行は 4,096 バイト未満に収まる。** `O_APPEND` での 1 回の `write` が原子的であるのは `PIPE_BUF`（4,096 バイト）未満のときだけであり、複数のセッションが同時に追記しても行が混ざらない根拠がここにある（設計書 §3.5）。上限の担保は契約側にあり（計画 [1] タスク 2 ケース 9）、本計画はその行が実際にその大きさで書かれることを確かめる
- `queue.jsonl` を `spool/<epoch>-<uuid4hex>.jsonl` に `os.rename` する退避を置く。**ファイル名に UUID を含める**
- `queue.jsonl` が無い・0 バイトのときは退避を行わない
- 送信条件の判定を置く。**`sent_at` の mtime から閾値秒以上経過していれば真**。`sent_at` が無ければ真。`queue.jsonl` が無ければ偽（送るものが無い）。行数による条件を持たない
- `sent_at` の mtime を現在時刻に更新する処理を置く
- spool の破棄を置く。合計サイズが上限を超える、または mtime が保持日数より古いファイルを、**古い順に**削除する
- いずれの関数も、失敗を呼び出し元に伝える必要はない。例外を外に出さない

**根拠:** 設計書 §3.5

**テスト**

| # | 操作 | 期待 |
| --- | --- | --- |
| 1 | 空の状態で追記を 1 回 | `queue.jsonl` が 1 行。JSON として読め、末尾が改行 |
| 2 | 追記を 3 回 | 3 行。順序は追記順 |
| 3 | 追記 1 回の間の `write` 呼び出し回数 | **1 回** |
| 4 | 値に改行を含む行を追記 | 1 行に収まる（行数が 1） |
| 5 | 値に非 ASCII を含む行を追記 | 読み戻した値が元と一致 |
| 6 | 親ディレクトリが無い状態で追記 | ディレクトリを作って成功する |
| 7 | 契約の全列を型が宣言する最大長の ASCII 文字で埋めた行を追記 | 書き込まれた 1 行が、改行を含めて **4,096 バイト未満** |
| 8 | 3 行入った状態で退避 | `queue.jsonl` が消え、`spool/` に 1 ファイル。行数 3、内容一致 |
| 9 | 退避後のファイル名 | `<10 桁以上の数字>-<32 桁の 16 進>.jsonl` に一致 |
| 10 | 時刻を固定したまま退避を 2 回（間に `queue.jsonl` を作り直す） | `spool/` に **2 ファイル**。合計行数が保存される |
| 11 | `queue.jsonl` が無い状態で退避 | 例外なし。`spool/` にファイルを作らない |
| 12 | `queue.jsonl` が 0 バイトの状態で退避 | 例外なし。`spool/` にファイルを作らない |
| 13 | 送信条件: `sent_at` が 9 分 59 秒前 | 偽 |
| 14 | 送信条件: `sent_at` が 10 分 1 秒前 | 真 |
| 15 | 送信条件: `sent_at` が無い | 真 |
| 16 | 送信条件: `queue.jsonl` が無い | 偽（送るものが無い） |
| 17 | `sent_at` の更新を呼ぶ | ファイルが作られ、mtime が現在時刻に近い |
| 18 | 破棄: spool 合計 4.9MB、いずれも 1 日前 | 1 件も削除しない |
| 19 | 破棄: 1MB × 6 件（mtime が 1 分ずつ古い） | 合計 5MB 以下になるまで**古い順に**削除。残るのは新しい 5 件 |
| 20 | 破棄: mtime が 7 日 1 秒前の 1 件、合計 1KB | 削除する |
| 21 | 破棄: mtime が 6 日前の 1 件 | 残す |
| 22 | 破棄: `spool/` が無い | 例外なし |
| 23 | 破棄: `spool/` に `.jsonl` 以外のファイル | 対象にしない。例外なし |

ケース 13〜16 が送信条件のすべてである。**行数による条件を持たない**（設計書 §3.5）。hook が同期的に行うのは 1 回の追記と、この判定のための `stat` だけになる。

**完了の判定**

```
pytest tests/client/test_queue.py -q
```

期待出力（末尾行）:

```
23 passed
```

**コミット:** `feat(client): ローカルキューの追記・退避・上限での破棄を追加`

---

### タスク 7: 送信プロセス

**ファイル:** 作成 `governance/hooks/_sender.py`、作成 `governance/config.json` / テスト `tests/client/test_sender.py`
**依存:** タスク 6

**やること**

- `config.json` を読む。読めない・壊れている場合は何もせず終了する
- 独立プロセスとして起動されたときの処理を、この順に行う
  1. `queue.jsonl` を spool に退避する
  2. spool の破棄を行う
  3. spool のファイルを**古い順**に `POST` する
- POST は `urllib.request` で行う。`Content-Type: application/x-ndjson`、`X-Ingest-Token` に受信トークン、タイムアウトは設定値（既定 60 秒）
- **2xx なら `os.remove`、それ以外は残す。** リトライループも指数バックオフも ACK も持たない
- 1 ファイルの失敗で後続のファイルを止めない
- 送信先 URL が空なら何もせず終了する
- 起動関数を置く。`subprocess.Popen` で `_sender.py` を起動し、`stdin` / `stdout` / `stderr` を `DEVNULL`、`start_new_session=True` とする。**待たない**
- どの経路でも終了コードは 0 とし、標準エラーに出さない

**`config.json` のキー**

| キー | 既定値 | 意味 |
| --- | --- | --- |
| `ingest_url` | 空文字 | `/ingest` の完全な URL。サブパスを含む |
| `ingest_token` | 空文字 | `X-Ingest-Token` に載せる値 |
| `flush_interval_sec` | `600` | 前回送信からこの秒数以上で送信する |
| `timeout_sec` | `60` | POST のタイムアウト |
| `spool_max_bytes` | `5242880` | spool 合計の上限 |
| `spool_max_days` | `7` | spool の保持日数 |

**根拠:** 設計書 §3.5（起動方法・タイムアウトを短く取らない理由・失敗時の扱い）、§4.4（応答コードの規則と端末側の振る舞い）、§4.4「認証」（トークンを平文で配布物に置く）

**テスト**

POST の検査は、テスト内に立てた HTTP サーバで行う。

| # | 状況 | 期待 |
| --- | --- | --- |
| 1 | spool に 1 ファイル、サーバが 200 | ファイルが削除される |
| 2 | 同上 | サーバが受け取ったボディが spool の内容と**バイト単位で一致** |
| 3 | 同上 | `Content-Type` が `application/x-ndjson` |
| 4 | 同上 | `X-Ingest-Token` が `config.json` の値と一致 |
| 5 | サーバが 201 | ファイルが削除される（2xx はすべて成功） |
| 6 | サーバが 401 | ファイルが**残る** |
| 7 | サーバが 500 | ファイルが**残る** |
| 8 | サーバが 404 | ファイルが**残る** |
| 9 | 接続できないポート | 例外なし。ファイルが残る。終了コード 0 |
| 10 | 応答しないサーバ、`timeout_sec` = 1 | 例外なし。ファイルが残る。実行時間が 5 秒未満 |
| 11 | spool に 3 ファイル、サーバが 200 | ファイル名の epoch 昇順に POST される |
| 12 | spool に 3 ファイル、2 番目だけ 500 | 1 番目と 3 番目は削除、2 番目は残る |
| 13 | 実行前に `queue.jsonl` が 2 行ある | 退避されてから POST される。POST 後に `queue.jsonl` が無い |
| 14 | spool が空、`queue.jsonl` も無い | POST を行わない。終了コード 0 |
| 15 | spool 合計が 6MB（1MB × 6） | POST の前に破棄が走り、送られるのは 5 ファイル |
| 16 | `ingest_url` が空文字 | POST を行わない。終了コード 0。spool は残る |
| 17 | `config.json` が無い | 例外なし。終了コード 0 |
| 18 | `config.json` が壊れた JSON | 例外なし。終了コード 0 |
| 19 | 起動関数を呼ぶ | `Popen` に `start_new_session=True` と 3 つの `DEVNULL` が渡る |
| 20 | 3 秒かかるサーバに対して起動関数を呼ぶ | 起動関数の戻りが 1 秒未満（待たない） |

**完了の判定**

```
pytest tests/client/test_sender.py -q
```

期待出力（末尾行）:

```
20 passed
```

**コミット:** `feat(client): detach して POST する送信プロセスと config.json を追加`

---

### タスク 8: 収集エントリの組み立てと無効化スイッチ

**ファイル:** 変更 `governance/hooks/collect.py` / テスト `tests/client/test_collect_entry.py`
**依存:** タスク 3、タスク 5、タスク 6、タスク 7

**やること**

- `collect.py` を単体で実行できる入口にする。第 1 引数を `hook_event` として受け取る
- **冒頭で `CC_GOVERNANCE_DISABLE` を判定する。** 空でない値が設定されていれば、標準入力を読む前に `exit 0` する
- 標準入力を読んで JSON としてパースし、タスク 3 の抽出を通して 1 行を作り、キューに追記する
- `hook_event` が `SessionStart` / `Stop` のときだけ、送信条件を判定する。真なら `sent_at` を更新してから送信プロセスを起動する。**`sent_at` の更新を起動より先に行う**ことで、同時に開いたセッションが一斉に送信プロセスを起こす状態を避ける
- 送信条件が偽なら何もしない
- 標準出力に何も書かない

**無効化スイッチが止めるのは利用ログの収集とお知らせの表示だけである**（設計書 §3.9）。`collect.py` は標準入力を読む前に降りるため送信も起こさないが、**送信そのものが止まるわけではない。** 設定の適用・その記録・送信は `session_start.py` が行い、無効化された端末でも動く（計画 [3] タスク 11）。止めると、無効化した端末が準拠率の分母から静かに消える。

**根拠:** 設計書 §3.9（冒頭 2 行で判定し即 `exit 0`・止めるのは収集と表示だけ）、§3.5（送信の起動条件と起動方法）

**テスト**

`collect.py` を subprocess として起動し、標準入力に JSON を与える。

| # | 状況 | 期待 |
| --- | --- | --- |
| 1 | `CC_GOVERNANCE_DISABLE=1` | 終了コード 0。`queue.jsonl` が作られない |
| 2 | `CC_GOVERNANCE_DISABLE=0` | 終了コード 0。`queue.jsonl` が作られない（空でない値はすべて無効化） |
| 3 | `CC_GOVERNANCE_DISABLE=false` | 終了コード 0。`queue.jsonl` が作られない |
| 4 | `CC_GOVERNANCE_DISABLE=""` | 収集する。`queue.jsonl` が 1 行 |
| 5 | `CC_GOVERNANCE_DISABLE` 未設定 | 収集する。`queue.jsonl` が 1 行 |
| 6 | `CC_GOVERNANCE_DISABLE=1` で送信条件を満たす状態 | 送信プロセスを起動しない |
| 7 | 引数に `PostToolUse` を渡す | 行の `hook_event` = `"PostToolUse"` |
| 8 | 引数を渡さない | 終了コード 0。例外を出さない |
| 9 | 2 回続けて実行 | `queue.jsonl` が 2 行。`event_id` が相異なる |
| 10 | 送信条件が偽、引数 `Stop` | 送信プロセスを起動しない |
| 11 | 送信条件が真、引数 `Stop` | 送信プロセスを 1 回起動する。`sent_at` の mtime が更新される |
| 12 | 送信条件が真、引数 `SessionStart` | 送信プロセスを 1 回起動する |
| 13 | 送信条件が真、引数 `PostToolUse` | **起動しない**（起動は 2 hook のみ） |
| 14 | 送信条件が真、引数 `PreCompact` | 起動しない |
| 15 | 正常な入力 | 標準出力が空 |

**完了の判定**

```
pytest tests/client/test_collect_entry.py -q
```

期待出力（末尾行）:

```
15 passed
```

**コミット:** `feat(client): 収集エントリと無効化スイッチを追加`

---

### タスク 9: 例外を握り潰して常に `exit 0` すること

**ファイル:** テスト `tests/client/test_collect_exit_code.py`
**依存:** タスク 8

**やること**

- `collect.py` を subprocess として起動し、**故意に壊した入力・環境**を与えて、終了コードが 0 であり標準出力・標準エラーが空であることを検査する
- ここが破れると利用者の画面が汚れ、Claude Code の動作を妨げる。このテストは実装の都合で緩めない

**根拠:** 設計書 §3.3（例外を握り潰し、常に `exit 0`。標準エラーにも出さない）、§9.1（どの変化でも Claude Code の動作は妨げられない）

**テスト**

すべてのケースで期待は「終了コード 0・標準出力が空・標準エラーが空」である。

| # | 与える壊れ方 |
| --- | --- |
| 1 | 標準入力が空 |
| 2 | 標準入力が `not json` |
| 3 | 標準入力が `[]` |
| 4 | 標準入力が `null` |
| 5 | 標準入力が `{` で終わる途中の JSON |
| 6 | 標準入力が UTF-8 として不正なバイト列 |
| 7 | 標準入力が 10MB の JSON 1 行 |
| 8 | 標準入力を閉じたまま起動 |
| 9 | `transcript_path` が存在しないパス、引数 `Stop` |
| 10 | `transcript_path` がディレクトリ、引数 `PreCompact` |
| 11 | `transcript_path` が数値 |
| 12 | `config.json` を壊した状態 |
| 13 | `config.json` を削除した状態 |
| 14 | 状態ディレクトリを読み取り専用にした状態 |
| 15 | `queue.jsonl` をディレクトリに置き換えた状態 |
| 16 | `identity.json` を壊した状態 |
| 17 | `CLAUDE_PLUGIN_DATA` と `HOME` の両方を存在しないパスに設定した状態 |
| 18 | `ingest_url` を解決できないホストにした状態で送信条件を満たす |
| 19 | 引数に空文字を渡す |
| 20 | 引数を 5 つ渡す |

**完了の判定**

```
pytest tests/client/test_collect_exit_code.py -q
```

期待出力（末尾行）:

```
20 passed
```

本計画のテストをまとめて通す。

```
pytest -q tests/client/
```

期待出力（末尾行）:

```
153 passed
```

**コミット:** `test(client): 壊れた入力でも exit 0 することを検証`

---

### タスク 10: hook の登録

**ファイル:** 作成 `governance/hooks/hooks.json`
**依存:** タスク 8

**やること**

- 収集分の 6 種を登録する。`SessionStart` は計画 [3] が足す

| hook | 渡す引数 |
| --- | --- |
| `UserPromptSubmit` | `UserPromptSubmit` |
| `UserPromptExpansion` | `UserPromptExpansion` |
| `PostToolUse` | `PostToolUse` |
| `PostToolUseFailure` | `PostToolUseFailure` |
| `PreCompact` | `PreCompact` |
| `Stop` | `Stop` |

- コマンドは **`python3 "${CLAUDE_PLUGIN_ROOT}/hooks/collect.py" <hook名>` の形の 1 行**とする
- `PostToolUse` / `PostToolUseFailure` の `matcher` はすべてのツールに一致させる
- 各 hook に `timeout` を置き、5 秒を超えないようにする
- **`SessionEnd` を登録しない。** サンプルに 8 件あるが、設計書 §3.3 の 7 種に含まれない

**コマンド文字列は設計事項である。** hook の実行は、登録したコマンド文字列とともに利用者の画面に表示されうる。hook 自身が何も出力しなくても、この表示は止められない（設計書 §3.3）。次を守る。

- パイプ・`;`・`&&`・リダイレクトを含めない。**条件分岐も後処理も Python 側に置く**
- 無効化スイッチの判定も Python 側で行う。コマンド文字列を条件付きにしない
- **1 行 100 文字未満**に収める。最長の `UserPromptExpansion` で 68 文字であり、余裕がある。この検査はリリース時にも行う（計画 [7]）

長いワンライナーを登録すると、ツールを実行するたびにその全文が画面に流れる。「得体の知れないものが動いている」という印象は、施策の推進そのものの妨げになる。

**根拠:** 設計書 §3.3（登録は 7 種にとどめ、網羅登録はしない。コマンド文字列は利用者から見える設計物である）

**完了の判定**

```
jq -r '.hooks | keys[]' governance/hooks/hooks.json | sort
```

期待出力:

```
PostToolUse
PostToolUseFailure
PreCompact
Stop
UserPromptExpansion
UserPromptSubmit
```

```
jq -r '[.hooks[][].hooks[].command] | length' governance/hooks/hooks.json
```

期待出力:

```
6
```

コマンド文字列が制約を満たすことを確かめる。

```
jq -r '.hooks[][].hooks[].command | "\(length)\t\(.)"' governance/hooks/hooks.json | sort -rn | head -1
```

期待出力（1 行目の数が 100 未満であること）:

```
68	python3 "${CLAUDE_PLUGIN_ROOT}/hooks/collect.py" UserPromptExpansion
```

```
jq -r '.hooks[][].hooks[].command' governance/hooks/hooks.json | grep -c '[|;&>]'
```

期待出力:

```
0
```

**コミット:** `feat(client): 収集分の hook 登録を追加`

---

### タスク 11: 実機での発火確認

**ファイル:** なし（検証のみ）
**依存:** タスク 10

**やること**

利用者本人の `~/.claude/` に触れずに確認する。**`HOME` を差し替え、`CLAUDE_PLUGIN_DATA` を隔離側へ向けた環境**を作り、その中の作業ディレクトリの `.claude/settings.json` に hook を登録して `claude -p` を走らせる。状態ディレクトリの解決は `${CLAUDE_PLUGIN_DATA}` を先に見るため、この 2 つを差し替えれば、どちらの経路で解決されても隔離側に落ちる。

**手順**

1. 隔離環境を作り、隔離が効いていることを確かめる

カレントディレクトリは `cc-governance-bmsd/`。開発機の絶対パスを書かない。

```bash
export REPO="$(pwd)"
export PLUGIN="$REPO/governance"
export VERIFY="$REPO/local/verify-hooks"          # local/ は git 管理外
export ISOLATED_HOME="$VERIFY/home"
export CC_STATE="$VERIFY/state"
mkdir -p "$ISOLATED_HOME/.claude" "$VERIFY/work/.claude" "$CC_STATE"
HOME="$ISOLATED_HOME" CLAUDE_PLUGIN_DATA="$CC_STATE" python3 -c \
  'import os; print(os.environ.get("CLAUDE_PLUGIN_DATA") or os.path.expanduser("~/.claude/cc-governance"))'
```

期待出力: `$CC_STATE` と一致する 1 行。

**この出力が `$VERIFY` の外を指したら、ここで止める。** 隔離が効いていないまま先へ進むと、以降の手順が利用者本人の状態ディレクトリを読み書きしてしまう。

続けて、本人の状態ディレクトリの指紋を控える。手順 9 で一致を確かめる。

```bash
ls -aR "$HOME/.claude/plugins/data" "$HOME/.claude/cc-governance" 2>&1 | shasum -a 256
```

2. 検証用ディレクトリにだけ hook を登録する

```bash
cat > "$VERIFY/work/.claude/settings.json" <<EOF
{
  "hooks": {
    "UserPromptSubmit": [{"hooks": [{"type": "command", "timeout": 5, "command": "python3 \"$PLUGIN/hooks/collect.py\" UserPromptSubmit"}]}],
    "UserPromptExpansion": [{"hooks": [{"type": "command", "timeout": 5, "command": "python3 \"$PLUGIN/hooks/collect.py\" UserPromptExpansion"}]}],
    "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "timeout": 5, "command": "python3 \"$PLUGIN/hooks/collect.py\" PostToolUse"}]}],
    "PostToolUseFailure": [{"matcher": "*", "hooks": [{"type": "command", "timeout": 5, "command": "python3 \"$PLUGIN/hooks/collect.py\" PostToolUseFailure"}]}],
    "PreCompact": [{"hooks": [{"type": "command", "timeout": 5, "command": "python3 \"$PLUGIN/hooks/collect.py\" PreCompact"}]}],
    "Stop": [{"hooks": [{"type": "command", "timeout": 5, "command": "python3 \"$PLUGIN/hooks/collect.py\" Stop"}]}]
  }
}
EOF
jq . "$VERIFY/work/.claude/settings.json" > /dev/null && echo settings-ok
```

期待出力:

```
settings-ok
```

3. 非対話で 1 往復させる

```bash
cd "$VERIFY/work" && HOME="$ISOLATED_HOME" CLAUDE_PLUGIN_DATA="$CC_STATE" \
  claude -p "ls を実行して、結果の行数だけを答えて"
```

4. 収集された行を確認する

```bash
wc -l < "$CC_STATE/queue.jsonl"
jq -r .hook_event "$CC_STATE/queue.jsonl" | sort | uniq -c | sort -rn
```

**期待:** `UserPromptSubmit` / `PostToolUse` / `Stop` の 3 種が 1 件以上ずつ現れる。`PostToolUse` は実行したツールの回数だけ現れる。

5. 列が埋まっていることを確認する

```bash
jq -r '[.kind, .hook_event, .session_id, .user_email, .host, (.tool_name // "-"), (.context_tokens // "-")] | @tsv' "$CC_STATE/queue.jsonl"
```

**期待:** `kind` が全行 `event`、`session_id` / `host` が全行非空、`Stop` の行の `context_tokens` が数値。

6. 自由文が入っていないことを確認する

```bash
jq -r 'keys[]' "$CC_STATE/queue.jsonl" | sort -u
```

**期待:** `kind` + `EXTRA_COLUMNS` の 7 列 + `HOOK_FIELDS` の 12 列だけが並ぶ。`prompt` / `tool_response` / `message` / `tool_input` は現れない。

7. 無効化スイッチを確認する

```bash
rm -f "$CC_STATE/queue.jsonl"
cd "$VERIFY/work" && HOME="$ISOLATED_HOME" CLAUDE_PLUGIN_DATA="$CC_STATE" \
  CC_GOVERNANCE_DISABLE=1 claude -p "1 + 1 は"
ls "$CC_STATE/queue.jsonl" 2>&1
```

期待出力（末尾）:

```
No such file or directory
```

8. 画面が汚れていないことを確認する

3 と 7 の `claude -p` の出力に、Python のトレースバック・`Traceback` の語・hook 由来の文字列が一切現れないことを目視で確認する。

9. 後片付け

**消すのは隔離環境だけである。** 削除の前に、対象が `local/` の下にあることを確かめる。

```bash
case "$VERIFY" in
  "$REPO/local/"*) rm -rf "$VERIFY" ;;
  *) echo "VERIFY が local/ の外を指している。削除しない" ;;
esac
ls -aR "$HOME/.claude/plugins/data" "$HOME/.claude/cc-governance" 2>&1 | shasum -a 256
```

**期待:** 最後の指紋が手順 1 で控えたものと一致する。一致しなければ、隔離が効かないまま本人の状態ディレクトリを触っている。

**注意**

- `claude -p`（非対話）でも hook は発火するが、**起動モードによって届くキーが変わる。** 3 で `UserPromptExpansion` / `PreCompact` が観測されなくても、それは登録の失敗を意味しない
- 差し替えた `HOME` では Claude Code 自身の設定も隔離側を見るため、初回に認証やディレクトリの信頼の確認を求められることがある。その場合は隔離環境のまま 1 度対話で起動して済ませてから 3 に戻る。**本人の `HOME` に戻して確認を続けない**

**根拠:** 設計書 §3.3（hook の登録と発火）、README §4（hook の登録と発火は実機で確認する）

**コミット:** なし（検証のみ。観測できた hook 種別と件数を作業ログに残す）

---

## 4. この計画の完了条件

| # | 条件 | 確かめ方 |
| --- | --- | --- |
| 1 | `governance/hooks/` に `collect.py` / `_context.py` / `_queue.py` / `_sender.py` / `_identity.py` / `hooks.json` があり、`governance/config.json` がある | `ls` |
| 2 | 本計画のテストが通る | `pytest -q tests/client/` が `153 passed` |
| 3 | どの Python ファイルも 200 行以内 | `wc -l governance/hooks/*.py` |
| 4 | 端末側が標準ライブラリしか使っていない | `grep -n '^import\|^from' governance/hooks/*.py` の結果に第三者パッケージが無い |
| 5 | 契約の複製が無い | `grep -rn 'HOOK_FIELDS = \|EXTRA_COLUMNS = ' governance/` が `contract.py` の 2 行だけを返す |
| 6 | `prompt` / `tool_response` / `message` に触れるコードが無い | `grep -n 'tool_response\|"prompt"\|"message"' governance/hooks/*.py` が 0 件 |
| 7 | 自由文が送信行に現れない | `pytest tests/client/test_collect_no_leak.py -q` が `12 passed` |
| 8 | 壊れた入力でも `exit 0` する | `pytest tests/client/test_collect_exit_code.py -q` が `20 passed` |
| 9 | 実機で 3 種以上の hook が発火し、`queue.jsonl` に行が積まれる | タスク 11 の手順 4 |
| 10 | 実機で `CC_GOVERNANCE_DISABLE` が効く | タスク 11 の手順 7 |
| 11 | 実機で利用者の画面が汚れない | タスク 11 の手順 8 |
| 12 | `local/` 配下と生の収集データが git に入っていない | `git status --porcelain` に `local/` が現れない |

---

## 5. この計画で確かめないこと

| 事項 | 扱い |
| --- | --- |
| サーバが実際に受け取って保存すること | 計画 [4]。本計画の送信テストはテスト内に立てた HTTP サーバまで |
| `SessionStart` の登録と、そこからの収集・送信の起動 | 計画 [3]。本計画は `collect.py` 側の起動条件だけを持つ |
| `settings.json` の読み書き・お知らせ・`policy_state` の行 | 計画 [3] |
| `plugin_version` の解決 | 計画 [3] |
| `agent_id` が実際に届くか | **未確認のまま残す。** サンプル 112 件に 1 件も無く、サブエージェント経由のツール呼出を含む記録が手元に無い。列が恒久的に NULL になった場合は §9.2 の健全性行で観測する |
| `PreCompact` の `trigger` が `auto` を取りうるか | 未観測。値の語彙を検査しないため、実装上の影響は無い |
| プラグインとして配布した状態での `${CLAUDE_PLUGIN_ROOT}` の解決 | 計画 [7]。本計画の実機確認は絶対パスで行う |
| 実行基盤への到達・デプロイ | 計画 [8] |
| オフライン期間が長引いたときの spool の実挙動 | 上限での破棄はテストで確かめる。長期運用時の実分布は観測しない |
