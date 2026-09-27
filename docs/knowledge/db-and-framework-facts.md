# DB とフレームワークの仕様

仕様として決まっている挙動と、観測で確かめた挙動（版を添える）。性能の数字はここに置かない。

## 整数型の幅

| 事実 | いつ効くか |
| --- | --- |
| MySQL の `INTEGER` は 32bit（`INT`）である。格納できる上限は `2147483647` であり、Unix 時刻として読むと **2038-01-19** にあたる | 秒単位の時刻を `INTEGER` と宣言した列を MySQL に置くとき |
| SQLite の `INTEGER` は 64bit である。同じ宣言でも 2038 年以降の値が素通りする | **SQLite だけの確認では、MySQL 側の上限は表に出ない** |

2038 年以降の値を MySQL の `INTEGER` 列に入れたときの挙動は未検証である。

## SQLite の統計情報

`PRAGMA analysis_limit` は **SQLite 3.32 以降にしか無い。**
未対応の版では**黙って無視される**（エラーにはならない）。
3.25〜3.31 では `ANALYZE` の収集量を絞れない。

## InnoDB のインデックスのキー長

上限は行フォーマットで決まる。

| 行フォーマット | キー長の上限 |
| --- | ---: |
| DYNAMIC（MySQL 8.0 の既定） | 3,072 バイト |
| COMPACT / REDUNDANT | 767 バイト |

utf8mb4 は 1 文字あたり 4 バイトで換算されるため、
`VARCHAR` を並べた複合インデックスは宣言長の 4 倍で上限に当たる。
接続先がどの行フォーマットかは、接続先の設定で決まる。
MySQL 8.4（公式イメージ `mysql:8.4`、2026-09-27 取得）の既定の設定のまま、utf8mb4 の表に
`VARCHAR(128)`・`VARCHAR(255)`・`VARCHAR(255)` の複合インデックス（換算 2,552 バイト）を作れた。
767 バイトを超えるので、既定は 3,072 バイトの側と読める（行フォーマットそのものは照会していない）。

## SQLite の型アフィニティ

| 事実 | いつ効くか |
| --- | --- |
| `INTEGER` と宣言した列に数字だけの文字列（`'123'`）を入れると、黙って整数で保存される。`typeof` は `integer` を返す | 記憶型の検査では、文字列で入った値を見分けられない |
| `VARCHAR` と宣言した列（TEXT アフィニティ）に整数を入れると text で保存され、整数リテラルとの比較も text の比較になる（`'189' > 1000` が真）。`max()` も文字列の順で選ぶ。`sum()` は数値として足す | 型を誤って足した列で、集計が無言で誤る |

`INTEGER` の行は Python 3.13.2 の `sqlite3`（SQLite 3.51.0）、`VARCHAR` の行は公式イメージ `python:3.9-slim`（Python 3.9.25・SQLite 3.46.1）で観測（2026-09）。

## Python の標準ライブラリ

| 事実 | いつ効くか |
| --- | --- |
| `json.loads(bytes)` は、CESU 形式のサロゲート（`\xed\xa0\xbd`）を `surrogatepass` で受け付け、先頭の UTF-8 BOM を読み飛ばす。文字列の中の生の制御文字と、4300 桁を超える整数リテラルは `ValueError`。`NaN`・`Infinity` は受け付ける。深い入れ子（10 万段）は `ValueError` ではなく `RecursionError` を投げる | `ValueError` だけを捕まえても、深い入れ子の入力は例外が抜ける |
| `sqlite3.connect` の busy timeout（`timeout`）は既定 5 秒。ロックを 5 秒以上待つと `OperationalError: database is locked` になる。ロールバックジャーナル（SQLite の既定）では、読み取りトランザクションが終わるのを待つ書き手が PENDING ロックを取ると、後から来た読み手も待たされて同じ例外になりうる。WAL では読み手と書き手は互いを止めない（SQLite の仕様） | 1 つの操作が 5 秒を超える処理（大きい DB の `ANALYZE` など）と同時に書くとき |
| `urllib.request` は `HTTPS_PROXY` などのプロキシ変数に従い、`CONNECT <host>:443` をプロキシへ送る。プロキシが CONNECT を拒む（トンネルの失敗）と `URLError`。名前解決の失敗も `URLError`（理由は `gaierror`。macOS で `.invalid` は約 0.02 秒で失敗） | 社内網のプロキシの下で送信するとき。失敗の種類は `URLError` の `reason` でしか分からない |
| サーバが本文を読まずに 413 を返して接続を閉じると、`urllib.request` には `HTTPError`（413）ではなく接続の切断として届く。本文の送信中の切断は `URLError` に包まれ、応答の読み取り中の切断は `URLError` でない `OSError` になる（切断として届くことはローカルのスタブで 12 MB・2 MB の本文で観測。送信中と読み取り中の区別は標準ライブラリのコードからの推定。実際のプロキシでの振る舞いは未確認） | 前段が大きすぎる本文を拒むとき、413 として判別できない |

`json` は Python 3.9.25、`sqlite3` の busy timeout は Python 3.9.25、`urllib` は Python 3.13.2 で観測（いずれも macOS または `python:3.9-slim`）。

## waitress と Jinja

| 事実 | いつ効くか |
| --- | --- |
| waitress 3.0.2 の既定は 4 スレッド・`connection_limit` 100。待ち行列が 1 以上になると `WARNING:waitress.queue:Task queue depth is N` をログに出す | 同時の要求が多いときの待ちの見積もり。ログの行が負荷の目安になる |
| Jinja 3.1.6 の自動エスケープは `<>&"'` だけを逃がし、NUL・ESC などの制御文字は HTML にそのまま出す | 利用者由来の文字列を画面に出すとき |

## Flask の `test_client()` とヘッダの符号化

`test_client()` はヘッダを**復号済みの文字列としてそのまま**アプリへ渡し、
**WSGI の latin-1 による線上の符号化を経由しない。**
このためヘッダの符号化に起因する欠陥は、`test_client()` では原理的に検出できない。

## Colima のバインドマウントと `docker cp`

Colima は既定（`mounts: []`）でホームディレクトリだけを VM にマウントする（設定ファイルの注記）。
ホームの外のパス（macOS の `TMPDIR` である `/var/folders/...` を含む）を `docker run -v` で指定すると、
**エラーにならず、VM 内の空のディレクトリがマウントされる。**ファイルが見えないだけで起動は成功する。
`docker cp` はマウントに依らず、作成済み・未起動のコンテナにも書き込める。
Colima 0.10.3（virtiofs）・Docker Engine 29.5.2 で観測。

コンテナの PID 1 を `sh` にし、子を `exec` せずに起動すると、`sh` が SIGTERM を受け流す。
`docker stop` は猶予（既定 10 秒）の後に SIGKILL で終わり、終了コードは 137 になる
（`python:3.9-slim`・Colima で観測。毎回約 10.3 秒）。
