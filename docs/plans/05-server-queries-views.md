# [5] サーバ：集計と管理画面

**目的:** 保存済みの 3 テーブルから 4 枚の管理画面と健全性の 1 行を描き、重複行が入っても数字が動かないことを検証で固定する。
**設計書:** `../design.md` §7 / §9.2
**依存:** [1] 契約と基盤 / [4] サーバ：受信と保存
**ブランチ:** `feat/server-queries-views`

---

## 1. 作るもの

| ファイル | 責務 | 想定行数 |
| --- | --- | --- |
| `cc-governance-bmsd-server/queries_events.py` | `/` と `/assets` の集計 SQL + 健全性 | 110 |
| `cc-governance-bmsd-server/queries_policy.py` | `/policy` `/effect` の集計 SQL + イベントスタディの畳み込み | 95 |
| `cc-governance-bmsd-server/templates/base.html` | 共通の骨格・ナビゲーション・インライン CSS（表と CSS バー） | 40 |
| `cc-governance-bmsd-server/templates/policy.html` | `/policy` | 60 |
| `cc-governance-bmsd-server/templates/assets.html` | `/assets` | 45 |
| `cc-governance-bmsd-server/templates/overview.html` | `/` | 55 |
| `cc-governance-bmsd-server/templates/effect.html` | `/effect` | 40 |
| `cc-governance-bmsd-server/app.py`（既存へ追加） | 画面 4 ルート。基準日の算出・接続の取得と解放・テンプレート描画 | +40 |
| `tests/` 配下のテスト | 既知データによる集計の検証・重複耐性・画面の行数一致 | — |

テンプレート 5 枚の合計は 240 行（設計書 §12）。

---

## 2. この計画に固有の前提

共通の制約は `README.md` §5 に従う。この計画でだけ置く前提は次のとおり。

| 項目 | 置く前提 |
| --- | --- |
| 作業ディレクトリ | 本書のコマンドとパスはすべて `cc-governance-bmsd/`（開発リポジトリのルート）を基準とする |
| テストの置き場所 | `cc-governance-bmsd/tests/`。**サーバのディレクトリ配下には置かない**（§6 の grep の対象から外すため） |
| 基準日（today） | `queries_*.py` は現在時刻を読まない。**基準日を epoch 日の引数として受け取る。** 算出は `app.py` が行う。これによりテストが時刻に依存しない |
| 窓の長さ | `queries_*.py` の定数として持つ。`RECENT_DAYS = 7`（直近／前の比較、準拠率の分母、**「最後に観測した値」の窓**）、`STALE_DAYS = 14`（イベントが途絶えた閾値）、`STALE_SCAN_DAYS = 30`（途絶え検出の走査窓）、`EVENT_STUDY_SPAN = 14`（相対日の片側）、`CONTEXT_BIN = 20000`（コンテキスト分布のビン幅） |
| 途絶え端末の検出範囲 | 全期間を走査しない。**`STALE_SCAN_DAYS` の窓内**で端末ごとの最終 `day` を取り、基準日との差が `STALE_DAYS` 以上のものを並べる |
| ポリシー値の文字列表現 | 契約の `POLICY` から `shared` 経由で得る。`policy_state.value` / `prev_value` に端末が書く表現は契約の `coerce(value, "VARCHAR(255)")` の規則に従い、**真偽値は小文字の `true` / `false`** である。比較にはこの表現をそのまま使い、**画面側で別の変換規則を持たない** |
| `plugin_version` の分布 | 端末（`user_email` × `host`）ごとの**最新行**の版で数える。「最後に観測した値」と同じ window 関数を使う |
| 突合率 | **人数で測る。** 直近 `RECENT_DAYS` 日に `events` を送った `user_email` の異なり数を分母とし、そのうち同じ期間の `cost_daily` にも存在する `user_email` の異なり数を分子とする。**件数ではなく人数である** |
| `DISTINCT event_id` を通す範囲 | 設計書 §9.2 の「分子も分母も `DISTINCT event_id` を通す」は、**件数と NULL 率のクエリに掛かる規約**である。突合率は `user_email` の異なり数で測るため、この規約の対象ではない |
| 在籍（`/effect` の分母） | **`cost_daily` に取り込まれている `day` の全体範囲**に、その利用者の「準拠開始日 + 相対日」が収まるとき在籍とみなす。利用者ごとの行の有無では判定しない（それでは規約 1 の 0 埋めが無意味になる） |
| 効果測定の対象 provider | `queries_policy.py` の定数として持つ。値は **`aws-bedrock`**（他社は `openai` として別行に出る。README §5.1） |

---

## 3. タスク

### タスク 1: テストの土台（既知データと重複行の注入）

**ファイル:** `tests/conftest.py`（追加）

**依存:** 計画 [1]（`db.init()` で DDL が通ること）

**やること:**

- 一時ファイルの SQLite に `db.init()` を適用した接続を返す fixture を置く。
- 3 テーブルに行を投入するヘルパを置く。**未指定の列は NULL で埋める**（列を足すたびにテストを書き直さずに済む）。
- **同じ行をもう一度投入するヘルパ**を置く。`event_id` を含めて完全に同一の行を複製する。送信のリトライで起きる状態（設計書 §5.4）そのものである。
- 「ある集計関数の戻り値が、重複を注入する前後で完全に一致すること」を 1 回の呼び出しで確かめるヘルパを置く。以降の各画面のテストはこれを必ず通す。
- 下の 3 つの既知データを fixture として定義する。基準日は **20005**（epoch 日）とする。

**既知データ `events`**（空欄は NULL。`host` は `user_email` に 1 対 1 で対応させる）

| id | day | user_email | hook_event | session_id | tool_name | skill_name | command_name | command_source | agent_id | permission_mode | context_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| e1 | 20000 | u1 | PostToolUse | s1 | Read | | | | | default | |
| e2 | 20000 | u1 | PostToolUse | s1 | Edit | | | | | default | |
| e3 | 20000 | u1 | PostToolUse | s1 | Skill | pdf | | | | default | |
| e4 | 20000 | u1 | UserPromptExpansion | s1 | | | review | project | | default | |
| e5 | 20001 | u1 | PostToolUse | s2 | Skill | pdf | | | | plan | |
| e6 | 20002 | u2 | PostToolUse | s3 | Skill | pdf | | | | default | |
| e7 | 20003 | u2 | UserPromptExpansion | s3 | | | review | user | | default | |
| e8 | 20003 | u2 | PostToolUse | s3 | Skill | xlsx | | | | default | |
| e9 | 20004 | u1 | PostToolUse | s4 | Read | | | | ag1 | acceptEdits | |
| e10 | 20004 | u3 | PostToolUse | s5 | Grep | | | | ag2 | default | |
| e11 | 20004 | u3 | PreCompact | s5 | | | | | | default | 120000 |
| e12 | 20004 | u3 | Stop | s5 | | | | | | default | 150000 |
| e13 | 20002 | u8 | PostToolUse | s8 | Read | | | | | default | |
| e14 | 19995 | u1 | PostToolUse | s0 | Skill | pdf | | | | default | |
| e15 | 19996 | u3 | PostToolUse | s6 | Skill | xlsx | | | | default | |
| e16 | 19996 | u9 | PostToolUse | s7 | Read | | | | | default | |
| e17 | 19988 | u10 | PostToolUse | s9 | Read | | | | | default | |

**このシステムが生成しえない行を fixture に置かない。** 列の組み合わせは設計書 §3.2 の `HOOK_FIELDS` と §3.3 の登録 hook から一意に決まる。

- `hook_event` に入れてよいのは、設計書 §3.3 が登録する 7 種（`SessionStart` / `UserPromptSubmit` / `UserPromptExpansion` / `PostToolUse` / `PostToolUseFailure` / `PreCompact` / `Stop`）だけである
- `command_name` / `command_source` は `UserPromptExpansion` にしか届かない。他の hook の行に置かない
- **`tool_name` は `PostToolUse` と `PostToolUseFailure` にのみ届く。** これらの行では必ず非 NULL になり、それ以外の hook の行では必ず NULL になる
- **`skill_name` は `tool_input.skill` 由来であり、`tool_name` が `Skill` の行にのみ現れる。** `tool_name` が他の値の行に `skill_name` を置かない

直近 7 日は `day >= 19999`（e1〜e13 の 13 件）、前 7 日は `19992 <= day <= 19998`（e14〜e16 の 3 件）。**e17 はどちらの窓にも入らない。**途絶え端末の判定（`STALE_SCAN_DAYS = 30` の窓、基準日との差が `STALE_DAYS = 14` 以上）でだけ現れる 1 台である。

**既知データ `policy_state`**（`K` = `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`、ポリシー値 `60`。`A` = `extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate`、ポリシー値は真偽値であり、契約の `coerce` により小文字の `true` として記録される）

| id | ts | day | user_email | key_name | value | prev_value | plugin_version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| p1 | 1000 | 20000 | u1 | K | 60 | | 1.4.0 |
| p2 | 2000 | 20001 | u1 | K | 60 | 60 | 1.4.0 |
| p3 | 3000 | 20002 | u1 | K | 60 | 60 | 1.4.0 |
| p4 | 1500 | 20000 | u2 | K | 60 | 80 | 1.3.0 |
| p5 | 2500 | 20001 | u2 | K | 60 | 80 | 1.3.0 |
| p6 | 1200 | 20000 | u3 | K | 60 | | 1.4.0 |
| p7 | 4000 | 20003 | u3 | K | 60 | 60 | 1.4.0 |
| p8 | 5000 | 20004 | u5 | K | 60 | 80 | 1.4.0 |
| p9 | 1100 | 20000 | u5 | K | 60 | 60 | 1.4.0 |
| p10 | 3100 | 20002 | u1 | A | true | true | 1.4.0 |
| p11 | 1600 | 20000 | u2 | A | true | false | 1.3.0 |
| p12 | 900 | 19990 | u7 | K | 60 | 60 | 1.4.0 |

**投入順は p8 を p9 より先にする。** `ORDER BY ts DESC` が効いていない実装は u5 の現在値を取り違える。

**真偽値は小文字の `true` / `false` で入れる。** `A` の `value` / `prev_value` の表記はこれに従う（§2 の前提）。

**p12 は `RECENT_DAYS` の窓（`day >= 19999`）より前にしか行が無い端末である。** 「最後に観測した値」の一覧から外れることの検証に使う。

**既知データ `cost_daily`**

| day | user_email | provider | cost | input_tokens |
| --- | --- | --- | --- | --- |
| 20000 | u1 | aws-bedrock | 1.0 | 1000 |
| 20001 | u2 | aws-bedrock | 2.0 | 2000 |
| 20002 | u3 | aws-bedrock | 3.0 | 3000 |
| 20003 | u4 | aws-bedrock | 4.0 | 4000 |
| 20004 | u5 | aws-bedrock | 5.0 | 5000 |
| 20004 | u1 | openai | 0.5 | 100 |

`provider` は実データに現れる生値をそのまま入れる。効果測定の対象は `aws-bedrock`、他社分は `openai` である（README §5.1）。`openai` の行を混ぜておくことで、`WHERE provider = ?` の絞り込みが効いていることを検証できる。

**根拠:** 設計書 §5.4（重複は定常状態であること）

**テスト:** このタスク自体のテストは、土台が壊れていないことの確認 1 本にとどめる。

| 入力 | 期待値 |
| --- | --- |
| fixture の接続で `events` の全行を数える | 17 |
| 重複注入ヘルパを 1 回適用したあと同じ数え方をする | 34 |
| 重複注入後に `COUNT(DISTINCT event_id)` で数える | 17 |

**完了の判定:**

```
python -m pytest -q tests/test_fixtures.py
```

期待出力: 末尾に `3 passed`。失敗・エラー・警告による中断がないこと。

**コミット:** `test: 集計検証の土台と既知データを追加`

---

### タスク 2: `/policy` 適用状況

**ファイル:** `queries_policy.py`（新規）/ `templates/base.html`（新規）/ `templates/policy.html`（新規）/ `app.py`（ルート追加）

**依存:** タスク 1

**やること:**

`queries_policy.py` に、次の 5 つを返す関数を置く。いずれも接続と基準日、必要ならポリシー項目のキーを引数に取り、タプルのリストを返す。フレームワークを import しない。

| 画面の要素 | どのテーブルの何を、どの軸で | 完了をどう判定するか |
| --- | --- | --- |
| 最後に観測した値 | 直近 `RECENT_DAYS` 日に `day` で絞った `policy_state` の `prev_value` を、`user_email` × `host` で区切り `ts` の降順に採番した最新 1 行。**全期間に window 関数を走らせない**（設計書 §7.2） | 窓の中に行がある端末の数と同じ行数が返り、各行が最新の値であること。**窓より前にしか行が無い端末は一覧から外れる** |
| 準拠率（施策項目別） | 分母は直近 `RECENT_DAYS` 日に `cost_daily` に行がある `user_email` の異なり数。分子はそのうち最新の `prev_value` がポリシー値に一致する `user_email` の異なり数 | 項目ごとに 1 行返ること |
| 未準拠者の一覧 | 最新 1 行のうち `prev_value` がポリシー値と一致しないもの。`user_email` / `host` / 最後に観測した値 / 最終観測日 | 準拠率の分子に入らなかった端末がそのまま並ぶこと |
| 未導入者の一覧 | 直近 `RECENT_DAYS` 日の `cost_daily` に居て、同期間の `policy_state` に居ない `user_email` | `policy_state` が空の利用者だけが並ぶこと |
| イベントが途絶えた端末 | `STALE_SCAN_DAYS` の窓内で `events` の `user_email` × `host` ごとの最終 `day`。基準日との差が `STALE_DAYS` 以上のもの | 窓の外の端末が混ざらないこと |
| `plugin_version` の分布 | 最新 1 行の `plugin_version` を数える | 端末数の合計が最新 1 行の行数に一致すること |

`base.html` は、4 画面共通の骨格（見出し・4 画面へのリンク・表のスタイル・割合を表す CSS バー）だけを持つ。外部 CSS・JS・CDN を参照しない。

`app.py` に `/policy` のルートを足す。ルートがすることは、基準日の算出・接続の取得・`queries_policy.py` の関数の呼び出し・テンプレート描画・接続の解放だけである。SQL を書かない。

**根拠:** 設計書 §7.2 / §5.2

**テスト:**

「最後に観測した値」（項目 `K`。**u1 は 3 行・u2 は 2 行・u5 は 2 行を持つ。ポリシー値を一度変更した後の状態である**）

| user_email | host | 期待する値 | 期待する ts |
| --- | --- | --- | --- |
| u1 | h1 | 60 | 3000 |
| u2 | h2 | 80 | 2500 |
| u3 | h3 | 60 | 4000 |
| u5 | h5 | 80 | 5000 |

| 入力 | 期待値 |
| --- | --- |
| 項目 `K` の最新 1 行の行数 | 4 |
| 同じ fixture に重複行を注入したあとの行数と内容 | 注入前と完全に一致 |
| `GROUP BY user_email, host, prev_value` で実装した場合に起きること | u1 が 2 行（NULL と 60）になり行数が 5 になる。**この差がテストで落ちること** |
| u7（`day = 19990` の p12 だけを持つ端末）が一覧に現れるか | **現れない。**窓（`day >= 19999`）より前にしか行が無い |
| `day` の絞り込みを外した場合に起きること | u7 が加わり行数が 5 になる。**この差がテストで落ちること** |

準拠率・一覧（基準日 20005、`RECENT_DAYS = 7` → `day >= 19999`）

| 画面の数字 | 期待値 |
| --- | --- |
| 分母（直近 7 日に `cost_daily` に居る利用者数） | 5（u1 u2 u3 u4 u5） |
| 項目 `K` の準拠者数 | 2（u1 u3） |
| 項目 `K` の準拠率 | 40.0% |
| 項目 `A` の準拠者数 | 1（u1） |
| 項目 `A` の準拠率 | 20.0% |
| 未準拠者の一覧（項目 `K`） | 2 行。u2 / h2 / 80 / 20001、u5 / h5 / 80 / 20004 |
| 未導入者の一覧 | 1 行。u4（u7 は `cost_daily` に居ないため現れない） |
| イベントが途絶えた端末（`STALE_DAYS = 14`） | 1 行。u10 / h10 / 最終 19988（基準日との差 17）。**u9（差 9）は 14 日未満のため並ばない** |
| `plugin_version` の分布 | 1.4.0: 3、1.3.0: 1 |

重複耐性（**上のすべての数字について、重複行を注入して再実行する**）

| 入力 | 期待値 |
| --- | --- |
| `policy_state` と `cost_daily` の全行を複製して再実行 | 上表のすべての値が変化しない。特に準拠率が 40.0% / 20.0% のままで、100% を超えない |

画面の行数一致

| 入力 | 期待値 |
| --- | --- |
| テストクライアントで `/policy` を取得し、未準拠者の表の行数を数える | 2（クエリの戻り行数と一致） |
| 同じく未導入者の表の行数 | 1 |

**完了の判定:**

```
python -m pytest -q tests/test_queries_policy.py tests/test_views_policy.py
```

期待出力: 末尾に `passed` のみ。`failed` / `error` を含まない。

目視確認の手順:

1. 既知データを入れた SQLite を用意する（タスク 1 の fixture を書き出すスクリプトを `local/` に置く）。
2. `cd cc-governance-bmsd-server && DB_DSN=sqlite:///<そのファイル> python -m waitress --listen=127.0.0.1:5000 app:app` で起動する。
3. `http://127.0.0.1:5000/policy` を開く。
4. 見るもの: 準拠率が項目ごとに 2 行出ていること、未準拠者に u2 と u5 が名前と値付きで並ぶこと、未導入者に u4 が出ること、CSS バーが率に比例した幅で描かれていること。

**コミット:** `feat: /policy の集計と画面を追加`

---

### タスク 3: `/assets` 配布物の利用状況

**ファイル:** `queries_events.py`（新規）/ `templates/assets.html`（新規）/ `app.py`（ルート追加）

**依存:** タスク 2（`base.html` が要る）

**やること:**

`queries_events.py` に次の 3 つを返す関数を置く。いずれも直近 `RECENT_DAYS` 日と、その 1 つ前の `RECENT_DAYS` 日を 2 本並べて返す。

| 画面の要素 | どのテーブルの何を、どの軸で |
| --- | --- |
| スキル別 | `events` の `skill_name` が非 NULL の行を `skill_name` で束ね、呼出回数と利用者数を数える。呼出回数は `COUNT(DISTINCT event_id)`、利用者数は `COUNT(DISTINCT user_email)` |
| コマンド別 | `events` の `command_name` が非 NULL の行を `command_name` × `command_source` で束ねる。値の分類辞書を持たず、生値のまま並べる |
| サブエージェント利用の割合 | 直近 `RECENT_DAYS` 日のイベント全体に対する、`agent_id` が非 NULL のイベントの割合。**分子・分母とも `COUNT(DISTINCT event_id)`** |

`assets.html` は、スキル別とコマンド別を直近／前の 2 列で並べた表 1 枚ずつと、割合の 1 行で描く。

**根拠:** 設計書 §7.3 / §5.4

**テスト:**

スキル別（直近 7 日 = `day >= 19999`、前 7 日 = `19992..19998`）

| skill_name | 直近 呼出 | 直近 利用者 | 前 呼出 | 前 利用者 |
| --- | --- | --- | --- | --- |
| pdf | 3 | 2 | 1 | 1 |
| xlsx | 1 | 1 | 1 | 1 |

| 入力 | 期待値 |
| --- | --- |
| 戻り行数 | 2 |
| 並び順 | 直近の呼出回数の降順（pdf が先） |

コマンド別（直近 7 日）

| command_name | command_source | 呼出 | 利用者 |
| --- | --- | --- | --- |
| review | project | 1 | 1 |
| review | user | 1 | 1 |

`command_name` / `command_source` を持つのは `UserPromptExpansion` の e4（u1 / project）と e7（u2 / user）の 2 行だけである。

サブエージェント利用の割合（直近 7 日）

| 入力 | 期待値 |
| --- | --- |
| 分母（直近 7 日の全イベント） | 13 |
| 分子（`agent_id` が非 NULL） | 2 |
| 割合 | 15.4%（小数第 1 位まで） |

重複耐性

| 入力 | 期待値 |
| --- | --- |
| `events` の全行を複製して再実行 | 上の 3 つの表のすべての値が変化しない。特に pdf の呼出が 3 のまま、割合が 15.4% のままであること |
| `COUNT(*)` で実装した場合に起きること | pdf の呼出が 6、分母が 26 になる。**この差がテストで落ちること** |

画面の行数一致

| 入力 | 期待値 |
| --- | --- |
| `/assets` のスキル表の行数 | 2 |
| `/assets` のコマンド表の行数 | 2 |

**完了の判定:**

```
python -m pytest -q tests/test_queries_events.py tests/test_views_assets.py
```

期待出力: 末尾に `passed` のみ。

目視確認: タスク 2 と同じ起動手順で `http://127.0.0.1:5000/assets` を開く。見るもの: pdf と xlsx が直近／前の 2 列で並ぶこと、`review` が `project` と `user` の 2 行に分かれていること、割合が 1 行で出ていること。

**コミット:** `feat: /assets の集計と画面を追加`

---

### タスク 4: `/` 概況と健全性の 1 行

**ファイル:** `queries_events.py`（追記）/ `templates/overview.html`（新規）/ `app.py`（ルート追加）

**依存:** タスク 3

**やること:**

`queries_events.py` に次を足す。

| 画面の要素 | どのテーブルの何を、どの軸で |
| --- | --- |
| 日次コスト推移 | `cost_daily` を `day` × `provider` で束ね、`cost` を合計する。`provider` は生値のまま行として並べ、分類しない |
| 利用者数・セッション数の推移 | `events` を `day` で束ね、`COUNT(DISTINCT user_email)` と `COUNT(DISTINCT session_id)` |
| 分布 | `events` を `permission_mode` / `effort_level` / `source` それぞれで束ね、`COUNT(DISTINCT event_id)`。生値のまま |
| 健全性（SQL 1 本目） | 直近 `RECENT_DAYS` 日と前 `RECENT_DAYS` 日それぞれの、イベント件数（`COUNT(DISTINCT event_id)`）・送信端末数（`COUNT(DISTINCT user_email)`）・列ごとの NULL 率。**NULL 率の分子は `event_id` の異なり数で数える** |
| 健全性（SQL 2 本目） | 突合率（直近 `RECENT_DAYS` 日に `events` を送った `user_email` のうち、同期間の `cost_daily` に居る割合）と、`plugin_version` の分布（タスク 2 の最新 1 行を再利用する） |

**すべての集計を `day` で絞る。** 全期間を走査する集計を画面に置かない。

突合率は**人数で測る**（§2 の前提）。設計書 §9.2 の「分子も分母も `DISTINCT event_id` を通す」は件数と NULL 率のクエリに掛かる規約であり、突合率には掛からない。

`overview.html` は、健全性の 1 行を画面の隅に置き、その下に推移の表と分布の表を並べる。

**根拠:** 設計書 §7.4 / §9.2 / §5.4

**テスト:**

利用者数・セッション数の推移（`events`。直近と前の 2 窓、`day >= 19992`）

| day | 利用者数 | セッション数 |
| --- | --- | --- |
| 19995 | 1 | 1 |
| 19996 | 2 | 2 |
| 20000 | 1 | 1 |
| 20001 | 1 | 1 |
| 20002 | 2 | 2 |
| 20003 | 1 | 1 |
| 20004 | 2 | 2 |

日次コスト推移（`cost_daily`）

| day | provider | 合計コスト |
| --- | --- | --- |
| 20000 | aws-bedrock | 1.0 |
| 20001 | aws-bedrock | 2.0 |
| 20002 | aws-bedrock | 3.0 |
| 20003 | aws-bedrock | 4.0 |
| 20004 | aws-bedrock | 5.0 |
| 20004 | openai | 0.5 |

分布（直近 7 日、`permission_mode`）

| 値 | 件数 |
| --- | --- |
| default | 11 |
| plan | 1 |
| acceptEdits | 1 |

健全性の 1 行

| 項目 | 直近 7 日 | 前 7 日 |
| --- | --- | --- |
| イベント件数 | 13 | 3 |
| 送信端末数 | 4（u1 u2 u3 u8） | 3（u1 u3 u9） |
| `tool_name` の NULL 率 | 30.8% | 0.0% |
| `skill_name` の NULL 率 | 69.2% | 33.3% |
| `context_tokens` の NULL 率 | 84.6% | 100.0% |
| `command_source` の NULL 率 | 84.6% | 100.0% |
| 突合率 | 75.0%（直近 7 日に `events` を送った 4 人のうち、u1 u2 u3 が `cost_daily` に居て u8 が居ない） | — |
| `plugin_version` の分布 | 1.4.0: 3、1.3.0: 1 | — |

重複耐性

| 入力 | 期待値 |
| --- | --- |
| `events` と `cost_daily` の全行を複製して再実行 | 上表のすべての値が変化しない |
| **NULL 率の分子だけ `COUNT(*)` にした場合に起きること** | 重複注入後に `skill_name` の NULL 率が 138.5% になる。**率が 100% を超えたら落ちること**をテストで明示する。`tool_name` は NULL の行が半数に満たないため 100% を超えず、この誤りを捕まえられない。**検証にはこの列を使う** |
| 日次コスト推移 | `cost_daily` の複製で合計が 2 倍になる。**ここは `event_id` を持たないテーブルであり、重複排除の対象ではない。**取込の冪等化は計画 [6] が担保する。このテストは「複製すると 2 倍になる」ことを期待値として書き、重複排除を画面側に足さない |

画面の行数一致

| 入力 | 期待値 |
| --- | --- |
| `/` のコスト推移の表の行数 | 6 |
| `/` の `permission_mode` 分布の行数 | 3 |

**完了の判定:**

```
python -m pytest -q tests/test_queries_events.py tests/test_health.py tests/test_views_overview.py
```

期待出力: 末尾に `passed` のみ。

目視確認: `http://127.0.0.1:5000/` を開く。見るもの: 健全性の 1 行が `イベント 13 / 3 ・ 送信端末 4 / 3` の形で読めること、NULL 率が 4 列とも出ていること、突合率と版の分布が出ていること、コスト推移に `aws-bedrock` と `openai` が別行としてそのまま並んでいること。

**コミット:** `feat: / の概況と健全性の1行を追加`

---

### タスク 5: `/effect` 効果測定

**ファイル:** `queries_policy.py`（追記）/ `templates/effect.html`（新規）/ `app.py`（ルート追加）

**依存:** タスク 4

**やること:**

この画面だけ、SQL の結果を Python で畳み込む。畳み込みも `queries_policy.py` に置く。

| 画面の要素 | どのテーブルの何を、どの軸で |
| --- | --- |
| 準拠開始日 | `policy_state` の、`key_name` がポリシー項目で `prev_value` がポリシー値に一致する行の `MIN(day)` を `user_email` で束ねる |
| 日次コスト | `cost_daily` の、対象 provider の行を `user_email` × `day` で束ね、`cost` と `input_tokens` を合計する |
| イベントスタディ | 上の 2 つを Python で突き合わせ、相対日 `-EVENT_STUDY_SPAN`〜`+EVENT_STUDY_SPAN` に畳む。各相対日の「1 人あたり日次コスト」「1 人あたり日次入力トークン」と、**分母の人数**を同じ行に出す |
| コンテキスト分布 | `events` の `hook_event` が `PreCompact` の行と `Stop` の行それぞれについて、`context_tokens` を `CONTEXT_BIN` 刻みのビンに落とし、`COUNT(DISTINCT event_id)` で数える。**利用者の準拠開始日より前／以後で 2 本に分ける** |
| 準拠者数の推移 | イベントスタディの各相対日の分母人数をそのまま表の列として出す |

集計の規約 3 つを、それぞれ独立した実装上の分岐として持つ。

1. **利用の無い日は 0 で埋める。** 相対日ごとの合計を、その相対日に在籍している準拠者数で割る。在籍の判定は §2 の前提に従う。
2. **相対日 0 を出力に含めない。** 畳み込みの段階で除く。表示側で隠すのではなく、値そのものを作らない。
3. **準拠前のコンテキスト分布は行が無ければ描かない。** 「0 件」を 0 の度数として描かず、データが無いことを画面に明示する。

**根拠:** 設計書 §7.1

**テスト:** この画面は専用の既知データを使う。共通 fixture では相対日が足りない。

**専用データ `policy_state`**（項目 `K`、ポリシー値 60）

| id | day | user_email | prev_value |
| --- | --- | --- | --- |
| q1 | 20010 | u1 | 60 |
| q2 | 20012 | u1 | 60 |
| q3 | 20020 | u2 | 60 |
| q4 | 20015 | u3 | 80 |

→ 準拠開始日: u1 = 20010、u2 = 20020。u3 は準拠者でない。

**専用データ `cost_daily`**（`input_tokens` は `cost` の 1000 倍）

| day | user_email | provider | cost |
| --- | --- | --- | --- |
| 20007 | u1 | aws-bedrock | 6.0 |
| 20009 | u1 | aws-bedrock | 3.0 |
| 20010 | u1 | aws-bedrock | 9.0 |
| 20011 | u1 | aws-bedrock | 1.0 |
| 20019 | u2 | aws-bedrock | 5.0 |
| 20020 | u2 | aws-bedrock | 8.0 |
| 20021 | u2 | aws-bedrock | 2.0 |
| 20014 | u3 | aws-bedrock | 7.0 |
| 20016 | u3 | aws-bedrock | 7.0 |
| 20011 | u1 | openai | 99.0 |

→ 取り込まれている `day` の全体範囲は 20007〜20021。在籍する相対日は u1 が `-3`〜`+11`、u2 が `-13`〜`+1`。

最後の 1 行は他社分（`openai`）であり、`WHERE provider = ?` が効いていれば集計に入らない。

イベントスタディの期待値

| 相対日 | 分母人数 | 1 人あたりコスト | 1 人あたり入力トークン |
| --- | --- | --- | --- |
| -14 | 0 | 行を出さない | 行を出さない |
| -13 | 1 | 0.0 | 0 |
| -4 | 1 | 0.0 | 0 |
| -3 | 2 | 3.0 | 3000 |
| -2 | 2 | 0.0 | 0 |
| -1 | 2 | 4.0 | 4000 |
| 0 | — | **行を出さない** | **行を出さない** |
| +1 | 2 | 1.5 | 1500 |
| +2 | 1 | 0.0 | 0 |
| +11 | 1 | 0.0 | 0 |
| +12 | 0 | 行を出さない | 行を出さない |

規約を 1 つずつ独立に落とすテストケース

| 規約 | 見るところ | 0 埋め等が無い場合の値 | 期待値 |
| --- | --- | --- | --- |
| 1（利用の無い日を 0 で埋める） | 相対日 `-3`。u1 に 6.0 の行があり、u2 には行が無い | 6.0（行がある人だけで平均） | **3.0** |
| 1（同） | 相対日 `-2`。両者とも行が無い | 行が出ない、または分母 0 で失敗 | **分母 2、値 0.0 の行が出る** |
| 2（相対日 0 を除く） | 出力の相対日の集合 | 0 が含まれ、値 8.5 の山が立つ | **0 が含まれない。8.5 という値がどの行にも現れない** |
| 3（準拠前の分布） | 下の 2 つの fixture | — | 下表のとおり |
| u3 が集計に入らないこと | 相対日の値に 7.0 由来の寄与が無いこと | u3 の 7.0 が混じる | **混じらない** |
| 対象 provider の絞り込み | 相対日 `+1`。u1 の `day = 20011` に `openai` の 99.0 がある | 99.0 が混じり 50.25 になる | **1.5 のまま** |

規約 3（コンテキスト分布）の 2 つの fixture。いずれも u1 の準拠開始日は 20010、`CONTEXT_BIN = 20000`。

| fixture | `events` の `PreCompact` 行 | 期待する「準拠前」 | 期待する「準拠後」 |
| --- | --- | --- | --- |
| 初回展開 | day 20011 に 120000、day 20012 に 130000 | **行が無い。「データなし」として描く。度数 0 のビンを並べない** | 120000 台のビンに 2 件 |
| 2 回目以降 | day 20008 に 90000、day 20011 に 120000 | 80000 台のビンに 1 件 | 120000 台のビンに 1 件 |

重複耐性

| 入力 | 期待値 |
| --- | --- |
| `policy_state` と `events` の全行を複製して再実行 | 準拠開始日・分母人数・コンテキスト分布の度数がすべて変化しない |
| `events` を複製したうえでコンテキスト分布を `COUNT(*)` で数えた場合 | 度数が 2 倍になる。**この差がテストで落ちること** |

画面の行数一致

| 入力 | 期待値 |
| --- | --- |
| `/effect` のイベントスタディの表の行数 | クエリの戻り行数と一致（相対日 0 と分母 0 の相対日を除いた数） |
| `/effect` の「準拠前」コンテキスト分布（初回展開の fixture） | 表そのものが出ず、データが無い旨の 1 行が出る |

**完了の判定:**

```
python -m pytest -q tests/test_queries_effect.py tests/test_views_effect.py
```

期待出力: 末尾に `passed` のみ。

目視確認: `http://127.0.0.1:5000/effect` を開く。見るもの: 相対日の折れ線（表 + CSS バー）に 0 日目の行が無いこと、各行に分母人数が並記されていること、コンテキスト分布が `PreCompact` と `Stop` の 2 枚出ていること、準拠前のデータが無い側に「データなし」と出ていること。

**コミット:** `feat: /effect の集計と画面を追加`

---

### タスク 6: 規律の検査と全画面の目視確認

**ファイル:** なし（検査のみ。違反があれば該当ファイルを直す）

**依存:** タスク 5

**やること:** 設計書 §4.1〜§4.2 の 2 つの規律と、行数の上限を機械的に確かめる。

**根拠:** 設計書 §4.1 / §4.2 / §12

**テスト:** 下の 3 つのコマンドをそのままテストとして扱う（pytest 化はしない）。

**完了の判定:**

1. フレームワークの import が `app.py` にしか無いこと。

```
grep -rnE '^[[:space:]]*(from|import)[[:space:]]+(flask|jinja2|werkzeug|waitress)' \
  cc-governance-bmsd-server --include='*.py' | grep -v 'cc-governance-bmsd-server/app.py:'
```

期待出力: **何も出力されない**（`grep` の終了コードは 1）。

2. SQL が `queries_events.py` / `queries_policy.py` / `ingest.py` / `csv_import.py` / `db.py` にしか無いこと。

```
grep -rniE '\b(SELECT|INSERT INTO|UPDATE |DELETE FROM|CREATE TABLE|CREATE INDEX)\b' \
  cc-governance-bmsd-server --include='*.py' \
  | grep -vE '/(queries_events|queries_policy|ingest|csv_import|db)\.py:'
```

期待出力: **何も出力されない**。

3. 1 ファイルが 200 行以内であること。

```
wc -l cc-governance-bmsd-server/*.py cc-governance-bmsd-server/templates/*.html
```

期待出力: `total` を除くすべての行で行数が 200 以下。

4. 4 画面すべての目視確認を通す。各タスクの目視確認の手順を、同じ起動 1 回で 4 画面続けて行う。**画面間のリンクが `base.html` のナビゲーションから辿れること**（サブパス配下でもリンクが壊れないよう、テンプレートは相対パスを直書きせず Flask のリンク生成を使う）を合わせて確かめる。

5. **この計画の範囲のテストをまとめて通す。** `tests/` には先行する計画のテストも溜まるため、範囲を絞って実行する。

```
python -m pytest -q tests/test_fixtures.py tests/test_queries_*.py \
  tests/test_health.py tests/test_views_*.py
```

期待出力: 末尾に `passed` のみ。`failed` / `error` を含まない。

**コミット:** `chore: 集計と画面の規律を検査`

---

## 4. この計画の完了条件

- `/` `/policy` `/effect` `/assets` の 4 画面が、既知データに対して §3 の表の値をそのまま表示する。
- **4 画面すべての集計について、重複行を注入しても数字が 1 つも変わらない。**率が 100% を超える経路が無いことをテストで固定している。
- `/effect` の集計の規約 3 つが、それぞれ独立したテストケースで落とせる状態にある。
- `/policy` の「最後に観測した値」が、1 端末が 2 行以上を持つデータで正しい行を返し、`day` で絞った窓より前にしか行が無い端末を一覧から外す。
- SQL が `queries_events.py` / `queries_policy.py` / `ingest.py` / `csv_import.py` / `db.py` の 5 ファイルにのみ存在し、フレームワークの import が `app.py` にのみ存在することを `grep` で確認済みである（設計書 §4.1）。
- サーバの全ファイルとテンプレートが 200 行以内である。
- タスク 6 の 5 の pytest コマンドが通る。

## 5. この計画で確かめないこと

- **実データ規模での実行時間。** 被覆インデックスによる完結（設計書 §5.1）は既知データでは検証できない。実データでの確認は計画 [8] のデプロイ後に回す。
- **MySQL 接続での動作。** ここでの検証は SQLite で行う。両 DB での初期化と集計は計画 [8] の実機確認で通す（設計書 §11.3）。
- **効果測定の因果的な妥当性。** この計画が確かめるのは畳み込みの算術が規約どおりであることだけである。識別の前提と残る交絡は設計書 §7.1 / §11.1 のとおりで、画面側で扱わない。
- **`cost_daily` の中身の正しさ。** 取込の冪等化は計画 [6] が担保する。この計画は入っている行をそのまま読む。
- **画面の認証。** Ingress に委ねる（設計書 §11.2）。
- **ブラウザ間の表示差。** 素の HTML とインライン CSS のみを使い、1 つのブラウザでの目視にとどめる。
