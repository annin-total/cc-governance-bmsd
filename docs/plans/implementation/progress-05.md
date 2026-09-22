# 計画 [5] サーバ：集計と管理画面 — 進捗と裁定

ブランチ: `feat/server-queries-views`（`feat/csv-import` から分岐）／ 作業ツリー: サーバトラック用の worktree

---

## 事前スキャン

| # | 対象 | 突き合わせたこと | 結果 |
| --- | --- | --- | --- |
| 1 | 計画 [5] の「作るもの」に `templates/overview.html`（新規・55 行） | **計画 [6] が既に作っている**（取込ボタンと結果の表示） | **衝突 → 裁定 R-40** |
| 2 | 計画 [5] の「画面 4 ルート」を `app.py` に追加 | `GET /` は計画 [6] が既に置いている | 足すのは `/policy` / `/effect` / `/assets` の 3 つ。`/` は育てる |
| 3 | 既存のテスト（`test_app_base_path.py` 7 + `test_api_ingest.py` 10 + CSV 取込 47） | `app.py` と `overview.html` を育てて壊さないか | **壊さないこと。裁定 R-41** |
| 4 | タスク 6 の規律検査「SQL は 5 ファイルにのみ」 | 既存の `ingest.py` / `csv_import.py` / `db.py` | 矛盾しない |
| 5 | 計画 [5] にはテスト件数の指定が無い | 完了条件は「`failed` / `error` を含まない」のみ | 件数の縛りは無い |

## 裁定

- **R-40: `templates/overview.html` は新規作成ではなく、計画 [6] が置いたものを育てる。取込ボタンと取込結果の表示を消さないこと。**
  理由 — 計画索引 §3 は [5] と [6] を同じ波に置いており、どちらが先に `overview.html` を作るかを決めていない。
  実際の着手順は [4] → [6] → [5] とした（[6] が `app.py` に `POST /import` を足す都合）。
  **取込ボタンは設計書 §4.5 が定める唯一の起動手段であり、消すと CSV が取り込めなくなる。**
  外れたときの損 — `overview.html` が 55 行を超える。200 行以内であれば許容する。
- **R-41: 既存のテスト（`test_app_base_path.py` / `test_api_ingest.py` / CSV 取込のテスト）を 1 件も壊さない。**
  サブパスの WSGI ラッパは**1 個のまま**にする。
  外れたときの損 — 前段の挙動に依存する分岐が生まれる。

---

## タスクの記録

## タスク 1〜3 の結果

**227 passed**（既存 188 + 39）。既存の 17 件（`test_app_base_path.py` / `test_api_ingest.py`）も無傷。

### 制御側の独立検証

**規律（タスク 6 の検査を前倒しで実行）**

```
SQL の所在            : queries_events / queries_policy / ingest / csv_import / db 以外にヒット無し
フレームワークの import : app.py 以外にヒット無し
行数                  : **サーバ側の**全ファイルが 200 行以内（最大 db.py 157）
                        ※ テストファイルは対象外。実際には test_csv_import.py 718 行 / test_fixtures.py 689 行がある
```

**重複耐性（この計画の最重要の不変条件）**

`events` と `policy_state` の全行を重複させて 8 つの集計を前後で比較した。

```
compliance / non_compliant / latest / stale / version / skill / command / subagent
  → すべて不変
```

**準拠率の畳み込み**

u1（1 台・準拠）、u2（2 台持ちで片方が未準拠）、u3（`cost_daily` に居るが policy 無し）を仕込んだ結果:

```
分子=1 分母=3 率=33.3%      ← u2 は 1 台が未準拠なので分子に入らない
非準拠の一覧（端末が行）: [('u2@x', 'h3', None, 20699)]
未導入者               : [('u3@x',)]
重複を注入しても        : 分子=1 分母=3 率=33.3%（不変）
```

**設計書 §7.2 の「1 台でも未準拠なら、その利用者は未準拠とする」「一覧には端末を行として出し、率は利用者で数える」が成立している。**

### 実装者が置いた判断（制御側が追認）

| # | 判断 | 追認の理由 |
| --- | --- | --- |
| 1 | `tests/conftest.py` に触れず、`tests/test_fixtures.py` に fixture を置いて他のテストから import する | 並列トラックとの衝突を避ける制御側の指示に従ったもの。`tests/` に `__init__.py` が無く pytest の import mode で解決できることを確認済み |
| 2 | 計画書は「次の 5 つの関数」と書くが表は 6 行あるため、`latest_values()` を独立関数として 6 関数構成にした | 表が正。`latest_values` は `compliance_rate` と `non_compliant` の両方が使うため、独立させるのが自然 |
| 3 | `base.html` のナビゲーションが現時点で 3 リンク（`/effect` はタスク 4 の担当） | タスク 4 で 1 行足す。**申し送り済み** |

### 申し送り

**タスク 4 着手時に `base.html` のナビゲーションへ `/effect` のリンクを 1 行足すこと。**
完了条件は「画面間のリンクが `base.html` のナビゲーションから辿れること」である。

### タスク 1〜3 のレビュー結果

**Spec ❌。Critical なし、Important 3 件。**

レビュアは外部から独立に検証し、クエリの正しさ（`ts` 順の最新 1 行・`policy_state` 基準の途絶え判定・
利用者単位の畳み込み・窓の切り方・`COUNT(DISTINCT event_id)`）はいずれも**正しい**と確認した。
重複耐性のヘルパも、`skill_usage` を `COUNT(*)` 版に差し替えると実際に落ちることを確かめている。

#### Important

- **I-1: `/policy` に「最後に観測した値」の表が無い。**
  `latest_values()` は実装されているが `compliance_rate` / `non_compliant` の内部でしか使われず、
  **7 端末の現在値を管理者が見る手段が画面に無い。**
  計画書のタスク 2 の「画面の要素」表の第 1 行が要求している要素である。
- **I-2: `ORDER BY ts DESC` をテストが固定できていない。**
  **制御側の実測:** `ORDER BY ts DESC` を `ORDER BY day DESC` に差し替えても **22 件すべて通る。**
  設計書 §5.2 が警告する「同じ `day` に複数行が来る経路」がまさに未固定である。
  実装は正しい（レビュアが `ts` と `day` の順序が食い違う 3 行で確認済み）が、**回帰の網が無い。**
- **I-3: 制御側の台帳の記録が誤っていた。**
  「行数: 全ファイル 200 行以内」と書いたが、実際に検査したのは `cc-governance-bmsd-server/` 配下だけで、
  テストファイルは `test_csv_import.py` 718 行 / `test_fixtures.py` 689 行ある。**上の記録を訂正した。**
  タスク 6 の検査がこの記録を前提にすると範囲を取り違える。

#### 先送りした Minor

| # | 指摘 |
| --- | --- |
| M-1 | `plugin_version_distribution` が `REFERENCE_KEY` で絞っており、その項目の行しか持たない端末が版分布から落ちる。実運用では 2 項目が同時に記録されるため現状は無害。**`ORDER BY` が無く MySQL では表示順が不定**になる点は別途 |
| M-2 | `app.py` が項目ごとに `compliance_rate` と `non_compliant` を呼び、window クエリが 1 画面で 4 回走る |
| M-3 | `test_views_assets.py` の `assert "project" in html` が表の中身を特定していない |
| M-4 | `ROW_NUMBER() OVER (... ORDER BY ts DESC)` が同一 `ts` でのタイブレーク未定義。`ORDER BY ts DESC, event_id DESC` で決定的になる |
| M-5 | タスク 2 の RED 証跡のうちビュー側だけ逐語でない |

## レビュー指摘の修正（最終レビュー対応）

**Important 3 件を修正、Minor 1 件（`plugin_version_distribution` の `ORDER BY ts DESC` 未固定）を追加テストで固定した。265 passed（既存 261 + 4）。**

- **Imp-1**: `queries_policy.event_study` / `queries_events.daily_cost` の `SUM(cost)` / `SUM(input_tokens)` に `COALESCE(..., 0)` を適用。`cost_daily.cost` が NULL（AI Gateway CSV の Cost 欄が空）の行がある状態で `/effect` が 500 になっていた。回帰テスト 2 本を追加し、実サーバ（`waitress-serve`）でも `/effect` が 200 を返すことを確認した。
- **Imp-2**: `queries_events._usage_with_trend` を CTE + LEFT JOIN 3 本から条件付き集約 1 本に置き換えた。`command_source` が NULL の `command_usage` 行が `NULL = NULL` の結合失敗で「0 回・0 人」になっていた（`skill_usage` は結合列と絞り込み列が同一のため無傷）。回帰テストを追加し、実装を元に戻すと落ちることを確認した。副産物として `queries_events.py` が 4 行縮んだ。
- **Imp-3**: `tests/test_fixtures.py` の `_COST_ROWS` に窓外（day=19970）の利用者 `u20` を追加し、準拠率の分母の 30 日窓が広がる変異が生存しないことを固定した（`test_daily_cost_by_provider` / `test_daily_cost_table_row_count` の期待値をこの 1 行分だけ更新）。
- **Minor-1**: `plugin_version_distribution` に `ts` の降順で最新 1 行を選ぶことを検証するテストを追加した（実装は変更なし。既に正しかったが網が無かった）。
- **Minor-5**: `queries_policy.py` の 130 字超の docstring 9 箇所を意味を変えずに複数行へ折り返した。ファイルは 198 → 216 行になった（**行数は正しさ・可読性より優先しない**という本タスクの方針に従い、分割はしていない）。

**未対応として残したもの（範囲外）**:
- `context_distribution` が準拠者 1 人につき 1 クエリを発行する件（設計書は「2 本」と書いている）。設計との突き合わせが要るため今回は対応しない。
- Minor-2（準拠前後の境界 `day < start_day` 未固定）、Minor-3（`not_introduced` の 30 日絞り未固定）、Minor-4（`STALE_DAYS` の境界未固定）は、いずれも fixture へ境界データを追加すれば塞がるが、今回のスコープでは未対応。
- Minor-4 台帳の M-4（同一 `ts` のタイブレーク未定義）も未対応のまま。

### 監督役による再検証と追加修正（2026-09-22）

レビュー指摘 Imp-1 / Imp-2 は、修正を受け取る前に監督役が独立に実測で再現した。

| 記号 | 再現した故障 |
| --- | --- |
| Imp-1 | `cost` が NULL の `cost_daily` 行があると、実サーバで `/effect` が **HTTP 500**（`TypeError: unsupported operand type(s) for +=: 'float' and 'NoneType'`）。AI Gateway の CSV の `Cost` 欄が 1 セル空なだけで画面全体が開けない |
| Imp-2 | `command_source` が NULL の `/review` を 2 人が 2 回ずつ使った状態で、`command_usage` が `('/review', None, 0, 0, 0, 0)` を返す。**「使われていない」と積極的に嘘をつく** |

修正後、実サーバ（waitress + curl）で 4 画面すべてが 200 を返し、`command_usage` が `('/review', None, 4, 2, 0, 0)` を返すことを確認した。

#### 画面に `None` がそのまま出ていた件

再検証の過程で、`/policy` の `prev_value` と `/assets` の `command_source` が、NULL のとき文字列 `None` として描画されることを実測した。
**`prev_value` が NULL になるのはキーが無い端末であり、初回適用時は全端末がこれに当たる。** 運用開始直後の `/policy` がほぼ全行 `None` で埋まる。
`prev_value` を「未設定」、`command_source` を「—」と表示するよう直した。

**この 2 つのテストは、最初に書いたとき両方とも空振りしていた。** 共有フィクスチャに `prev_value` が NULL の行も
`command_source` が NULL の行も 1 つも無く、`assert "<td>None</td>" not in html` が真になるだけだった。
**つまり、初回適用という最も普通の状態を、どのテストも覆っていなかった。** 各テストが自前でその行を足す形に直し、
テンプレートを元に戻すとそれぞれ 1 件ずつ落ちることを変異検査で確かめた。
