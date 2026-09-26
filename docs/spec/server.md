# 集計サーバ 仕様書

## 概要

Claude Code 利用状況の集計サーバ。端末プラグインから NDJSON で届く利用イベント・ポリシー
適用結果・hook の失敗を受信・保存し、AI Gateway の日次 CSV と突き合わせて 4 枚の画面で可視化する。
単独でデプロイされる 1 プロセスの Flask アプリケーションであり、ソースは submodule
`server/` にある。全体の中での位置づけは `system.md`、
デプロイ手順は `../guide/deploy-aip.md`、画面のスタイルは `dashboard-style.md`、
コードを書くときの規約は `server/CLAUDE.md` にある。

## 契約の複製

`ccgov/vendor/` の各複製（`contract.py`・`policy.py`）は正本（`plugin/hooks/`）の複製であり、
直接編集しない（生成の仕組みは `system.md`）。起動時に `entry.sh` が、各複製の生成物ヘッダが
壊れていないことと、ヘッダを除いた残りのハッシュが対応する `.sha256` と一致することを確かめ、
どちらかが崩れていれば起動を中止する。複製の直接編集と同期忘れをここで検出する。

## 契約と実テーブルの突き合わせ

起動時に `db.init()` が実テーブルの列と契約を突き合わせ、**契約が要求する列が 1 つでも欠けていれば、
欠けた列名を出して起動を中止する。**列は自動で追加しない（列の足し方は `../guide/release.md`）。

## API

管理画面（4 画面・`/import`・CSS）は環境変数 `ADMIN_PATH` の下にだけ置き、`ADMIN_PASSWORD` との
Basic 認証で守る（ユーザー名は問わない）。`ADMIN_PATH` の外は `/ingest` を除いて 404 を返す。
`/ingest` は `ADMIN_PATH` の外にあり、`X-Ingest-Token` ヘッダと環境変数 `INGEST_TOKEN` の一致で守る。

### `/ingest` の受信

行ごとに検査し、壊れた行だけを捨てて残りを 1 トランザクションで保存する（リクエスト全体は
失敗させない。DB の失敗は 5xx になる）。

**応答の `dropped` は行単位の破棄だけを数える。**型が合わず列が NULL になったものは数えない
ため、`dropped: 0` は列の値がすべて正しく入ったことを保証しない。確かめるには DB の列を直接見る。

### CSV 取込

ボタンを押すたびに `CSV_DIR` の全 `*.csv` を取り直す。1 ファイルの取込は「そのファイルが含む
`day` の行を `DELETE` → `INSERT`」を 1 トランザクションで行う。**冪等キーはファイル名ではなく `day` である。**

## データモデル

テーブルは `events`（端末の利用ログ）・`policy_state`（適用した設定値の時系列）・
`errors`（hook の失敗）・`cost_daily`（AI Gateway CSV）の 4 つ。列は契約から、インデックスは `db.py` から決まる。
すべて append-only で、サロゲートキーも外部キーも持たず、行を個別に参照しない。

- 準拠の判定は `policy_state.prev_value`（セッションを開いた時点で既にあった値）で行う。
  準拠開始日は、`prev_value` が比較値（`constants.py` の `REFERENCE_VALUE`）に一致した最初の日である

window 関数（`ROW_NUMBER() OVER`）を使うため、DB は SQLite 3.25 以上・MySQL 8.0 以上を要する。

## 管理画面

画面は 4 つ。パスはいずれも `ADMIN_PATH` の下にある。集計期間などの日数は `constants.py` にある。

- **`/effect` 効果測定 — 「自動圧縮の閾値の強制はコストを下げたか」**。利用者ごとの準拠開始日を 0 日目とした
  イベントスタディと、`PreCompact` / `Stop` 時の `context_tokens` の分布を出す。比較は `constants.py` に
  1 つの実験として固定し、`policy.py` に追随しない
- **`/policy` 適用状況 — 「どの端末がポリシーに準拠しているか」**。端末の現在値は
  `prev_value` の最新 1 行とする。1 台でも未準拠ならその利用者は未準拠とし、率は利用者で数える。
  準拠率の分母は「直近に `cost_daily` にコストの記録がある `user_email`」であり、`cost_daily` に現れるが policy
  イベントが来ない利用者を未導入者として出す。policy イベントが途絶えた端末も出す
- **`/assets` 配布物の利用状況 — 「配ったものは使われているか」**。値の分類辞書は持たず、
  `command_source` の生値で並べる
- **`/` 概況 — 「全体でいくらかかり、誰が使っているか」**。健全性の表示の読み方は `system.md`

`cost_daily` を数える集計期間（準拠率の分母・未導入者）と突合率の集計期間（`events` 側も含む）は、今日と
取り込んだ CSV の最終日の早いほうで終わる。

## 改訂履歴

- 2026-09-25: 列の追加を `ALTER TABLE ... ADD COLUMN` にした。CSV の取込先の検査・メールの小文字化を加え、
  `/effect` の比較を定数の実験に固定し、処理トークンと前後差の読み方を書いた。`cost_daily` を数える集計期間を CSV の最終日に合わせた
- 2026-09-26: hook の失敗（error 行・`errors`・概況の失敗の表）を加えた
- 2026-09-26: 実装と食い違う記述を直し、実装・他の文書と重なる記述を削った。理由と限界は `../decisions/server.md`、列の足し方は `../guide/release.md`、失ったときの表は `../guide/deploy-aip.md` へ移した
