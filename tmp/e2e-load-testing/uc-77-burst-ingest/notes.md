# UC77: 一斉起動時の受信の負荷（77）

## 目的

- 始業時に 140 端末が一斉に `/ingest` へ送ったとき、受信が詰まらないか（応答時間・5xx・タイムアウト・取りこぼし・重複）を実物のサーバ（Docker・entry.sh・waitress・SQLite）で測る
- 同時接続数を 20・70・140 と上げ、どこで劣化するか（waitress のスレッド・SQLite のロック）を見る
- その間に管理画面（`/`）の応答が圧迫されないかを見る
- 本物の送信コード（`plugin/hooks/_sender.py`）を 140 プロセス同時に動かす経路と、実セッション（`claude -p`）を並列で起動する経路を 1 回ずつ通す

## 仮説（どう壊れうるか）

コード（`server/entry.sh`・`server/ccgov/web/ingest_api.py`・`ingestion/ndjson.py`・`store/db.py`、`plugin/hooks/_sender.py`・`collect.py`）を読んで立てた。

- H1: `entry.sh` は `waitress-serve` をスレッド数の指定なしで起動する。waitress の既定は **4 スレッド**なので、同時に処理されるのは 4 件で、残りは waitress の中で待つ。140 同時でも 5xx にはならず、**待ち時間として p95・max が伸びる**
- H2: 1 リクエストは 1 トランザクション（`executemany` → `commit`）。SQLite の既定（rollback journal・`sqlite3.connect` の busy timeout 5 秒）で、書き込みは直列になる。4 スレッドなら 1 件の書き込みは数十 ms なので、**`database is locked` は出ない**。出るなら 500 になり、端末は「届いた」扱いで消さずに残す（2xx 以外はファイルを消さない。error 行が増える）
- H3: 画面（`/`）も同じ 4 スレッドを使うので、バースト中は **画面の応答が受信の待ち行列の後ろに並ぶ**。遅れは「待っている `/ingest` の数 × 1 件の処理時間 ÷ 4」程度
- H4: waitress の `connection_limit`（既定 100）を超えた接続は受け付けが遅れる（カーネルの backlog で待つ）が、落ちはしない
- H5: 取りこぼしは 0。重複は、応答がクライアントの時間切れ（送信の上限 60 秒）より遅れたときだけ起きる（UC46 の H3）
- H6: 実セッションの一斉起動では、SessionStart の送信（`send_if_due`）だけが走り、同じセッションの Stop は `sent_at` の間引き（10 分）で送らない。**同じセッションの後半の行は次の送信まで queue に残る**のが設計どおり

## 手順

一時スクリプトはこのフォルダ。Docker を使うものはすべて `CC_E2E_RUN=b-uc77`。`plugin/`・`server/` は書き換えない（比較用のスレッド数の変更は、`e2e/_server.py` の `build_context` が作るルート内のコピーの `entry.sh` だけを書き換える）。
ログは `.local/e2e-load-testing/uc-77-burst-ingest/`（git 管理外）。

- `_common.py`: 作業ディレクトリ（`$TMPDIR/cc-e2e-b-uc77-*`）、サーバの起動（`e2e/_server.py` の `DockerServer`）、端末の行の生成、突合、ログ
- `run_burst.py`: (1) 合成の HTTP 負荷（同時 20・70・140）と画面の測定、判定のゲートの確認、本物の `_sender.py` 140 プロセス
- `run_sessions.py`: (2) 実セッションの並列起動
- `run_lock.py`: (1) の補足。コンテナ内で DB のロックを N 秒握り、その間に同時 20 で送る（長い ANALYZE・重い画面のクエリの代わり。機構の確認）
- `time_hook.py`: (2) の補足。`session_start.py` 単体を 1 本ずつ・N 本同時に動かし、hook の上限 5 秒と比べる（claude は起動しない）

端末の行は、実採取の hook stdin（`tests/fixtures/hook_inputs/`、読むだけ）を本物の `collect.py` に通して作った行を型にし、
端末ごとに `user_email`・`host`・`session_id`・`event_id` を振り直して作る（1 端末 30〜300 行。種は固定）。

```bash
# heavy.lock を取ってから（trap で rmdir）。すべて .venv の python
CC_E2E_RUN=b-uc77 python run_burst.py --tag t4 --rounds 2            # 既定（waitress 4 スレッド）+ 本物の _sender.py 140 プロセス
CC_E2E_RUN=b-uc77 python run_burst.py --tag t16 --threads 16 --rounds 2 --no-sender
CC_E2E_RUN=b-uc77 python run_lock.py
set -a; . <.env.local>; set +a; CC_E2E_RUN=b-uc77 python run_sessions.py 20   # 10・2 でも実行
python time_hook.py
```

## 結果

測定条件: macOS（8 コア・8 GiB）、Docker は Colima（2 CPU・3 GiB）、サーバは `python:3.9-slim` + entry.sh + waitress + BASE_PATH + SQLite（`e2e/_server.py` と同じ形）、
負荷の送り手はホストの Python 3.13（スレッド + urllib、上限 60 秒）で Colima のポート転送を通る。2026-09-27 21:49〜22:09。
**ほかのトラックと並行しており、load average は 5.4〜21（8 コア）、Docker の稼働コンテナは自分を含め 0〜2。**数字は相対比較と壊れ方の確認にだけ使う（AIP の性能を代表しない）。

### (1) 140 端末分の /ingest（1 ラウンド = 140 リクエスト・約 2.3〜2.5 万行・約 13 MB）

各段 2 ラウンド、ラウンドごとに新しい event_id。応答時間は 200 の応答だけ（秒）。「画面」は同じ時間に `/` を 0.1 秒おきに叩いた応答時間。

| waitress | 同時 | 全体の所要 | /ingest p50 / p95 / max | 5xx・時間切れ | 取りこぼし・重複 | 画面 p50 / max（アイドル時 0.005） |
| --- | --- | --- | --- | --- | --- | --- |
| 既定（4） | 20 | 1.4〜2.3 | 0.16〜0.25 / 0.33〜0.59 / 0.75〜1.6 | 0 | 0・0 | 0.15〜0.42 / 0.38〜0.66 |
| 既定（4） | 70 | 2.3〜4.0 | 0.86〜1.18 / 1.1〜2.1 / 2.1〜3.7 | 0 | 0・0 | 0.50〜0.88 / 1.3〜2.6 |
| 既定（4） | 140 | 2.5〜4.4 | 1.3〜2.4 / 1.9〜3.5 / 2.5〜4.4 | 0 | 0・0 | 0.81〜1.33 / 1.4〜3.0 |
| 16 | 20 | 1.8〜3.8 | 0.09〜0.17 / 1.0〜1.8 / 1.6〜3.8 | 0 | 0・0 | 0.12〜0.43 / 0.20〜0.79 |
| 16 | 70 | 3.4〜5.2 | 0.82〜1.41 / 2.5〜3.8 / 3.2〜5.2 | 0 | 0・0 | 0.43〜0.66 / 1.1〜1.9 |
| 16 | 140 | 5.4〜6.5 | 2.2〜2.4 / 4.0〜4.9 / 5.4〜6.2 | 0 | 0・0 | 1.36〜1.39 / 2.7〜3.6 |

（既定の行は 2 回の実行 t4・t4b、計 4 ラウンドの範囲）

- **140 同時でも 5xx・時間切れ・取りこぼし・重複は 0。**劣化は「待ち時間が同時数にほぼ比例して伸びる」形だけで、壊れはしない。処理量は 1 秒あたり約 5,500〜17,000 行（揺れが大きい）
- 劣化の場所は waitress の待ち行列: サーバのログに `WARNING:waitress.queue:Task queue depth is N` が 1 回の実行で 760〜920 行出て、最大は **95**（140 同時・4 スレッド）。4 スレッド + 待ち 95 ≒ waitress の `connection_limit` 既定 100 で、残りの接続はカーネルの backlog で待っていた（推定。backlog の中は見ていない）
- **スレッドを 16 に増やしても良くならない**（140 同時の p95 は 4 スレッドで 1.9〜3.5、16 で 4.0〜4.9）。2 CPU・GIL・SQLite の書き込みの直列化の下では、スレッドを足しても待ちの場所が移るだけ
- **画面は受信の待ち行列の後ろに並ぶ**（H3 のとおり）。アイドル時 0.005 秒の `/` が、140 同時のバースト中は最大 3 秒。バースト（数秒）が終われば戻る
- `database is locked`・Traceback は 0（H2 のとおり）
- 再起動後の初回の /ingest（ANALYZE を含む）は 0.06〜0.08 秒（DB が空に近いため。大きい DB では UC76 の 3.34 秒）
- 判定のゲート: 突合（`account`）は、(a) 1 端末の最後の 1 行を落として送ると missing 1、(b) 1 端末を 2 回送ると dup 238（その端末の行数）、(c) 送っていない id を 1 つ混ぜると missing 1 で、いずれも ok が偽になった。正しい入力では ok が真。3 回の実行すべてで同じ

#### 本物の送信コード（`_sender.py`）を 140 プロセス同時に（t4 の実行）

端末ごとに別の `CLAUDE_PLUGIN_DATA` と spool 1〜5 ファイル（計 30〜300 行）を置き、`python3 _sender.py` を一斉に起動した（config は配布の既定と同じ `timeout_sec` 60）。

- 140 端末・21,713 行: **全部届き、取りこぼし 0・重複 0。**spool の残り 0、error 行（queue.jsonl）0、標準エラー 0
- 全体 19.5 秒、1 プロセスの所要 p50 10.6 / p95 13.3 / max 13.4 秒。このとき load average が 30 まで上がった（ホストで 140 個の Python を同時に起動したため）。時間の大半はホスト側の起動の競合で、サーバの応答（上表）ではない（推定）

#### DB の 1 操作が 5 秒を超えたとき（`run_lock.py`、既定 4 スレッド・同時 20・140 端末）

| コンテナ内で握ったロック | 結果 |
| --- | --- |
| 書き込み（`BEGIN IMMEDIATE`）を 7 秒 | **500 が 4 件**（端末 4 台分・340 行が入らない）。ログに `database is locked` |
| 読み取りトランザクション（`BEGIN` + SELECT）を 7 秒 | **500 が 2 件**（482 行）+ **画面 `/` も 500 が 1 回** |
| 書き込みを 3 秒（対照） | 500 は 0。p95 3.2 秒・max 5.5 秒に伸びるだけ |

- `db.connect()` は `sqlite3.connect(path)` で、busy timeout は既定の 5 秒。**ロックが 5 秒を超えると、その間に書こうとしたリクエストはちょうど 5 秒待って 500 になる。**500 になるのは同時にロックを待てるスレッド数（4）ずつ
- 1 リクエストは 1 トランザクションなので、500 のリクエストは 1 行も入らない（半端に入らない）。端末側は 2xx 以外ではファイルを消さず、error 行（`HTTP 500`）を積んで、次の送信（10 分後以降）で再送する（コード上。この経路の再送は UC46 で確かめた 401 と同じ分岐）
- 現実にロックを 5 秒以上握りうる操作は、(a) 再起動後の初回の /ingest の ANALYZE（1.49 GB で 3.34 秒: UC76）、(b) 画面の重いクエリ（読み取りは文ごとなので 1 文が 5 秒を超えたとき）。どちらも今の規模では 5 秒未満（推定を含む。大きい DB で ANALYZE が 5 秒を超えるかは未確認）

### (2) 実セッションの並列起動（`claude -p`・haiku・"Reply with the single word ok."）

各セッションは別の隔離ルート（`CLAUDE_CONFIG_DIR`）で、E2E と同じ git 配信のマーケットプレイスから導入し、`timeout_sec` は 60。起動前に spool へ 30〜300 行を置いた。
費用は 1 セッション約 0.01 USD（20 並列 2 回・10 並列 1 回・2 並列 2 回で計約 0.54 USD）。

| 並列 | claude の所要 p50 | SessionStart hook | 送信の契機 | 置いた spool | そのセッションの行 |
| --- | --- | --- | --- | --- | --- |
| 2（2 回） | 5.3〜5.9 秒 | 全部 success | SessionStart | 全部届く | SessionStart が届き、UserPromptSubmit・Stop は queue に残る（H6 のとおり） |
| 10 | 8.9 秒 | **10/10 success** | SessionStart | 1,382 行 全部届く | 同上 |
| 20（診断つき） | 19.4 秒 | **20/20 cancelled**（stream-json の `hook_response` が `outcome: cancelled`・`exit_code: 1`） | **Stop** | 3,350 行 全部届く | **SessionStart の行が 1 つも無い**。UserPromptSubmit・Stop が Stop の送信で届く |
| 20（診断なし・1 回目） | 19.4 秒 | （未記録。同じと推定） | Stop（12 セッション）・送らず（8） | **1,126 行が起動後も届かず** | SessionStart 0。12 セッションで UserPromptSubmit・Stop が届く |

- **20 並列では SessionStart hook（`session_start.py`）が 5 秒の上限（`hooks.json` の `timeout: 5`）で全部打ち切られた。**打ち切りは `_collect_step`（SessionStart の行の追記と送信判定）より前に起きるので、**SessionStart の行は失われ、error 行も残らない（無言）。**同じ hook の設定の適用・お知らせも途中で止まりうる
- 送信は Stop の `send_if_due` が拾う（`sent_at` が更新されていないため）ので、置いた spool は届いた。1 回目の 8 セッションは起動後に何も送らなかったが（Stop の hook も打ち切られたか、送信プロセスが起動しなかったと推定。診断を取っていない）、後で `_sender.py` を直接動かすと全部届いた（取りこぼしは SessionStart の行だけ）
- `session_start.py` 単体（`time_hook.py`、claude なし）: 1 本ずつ p50 0.46〜0.49 秒、同時 10 で 1.0〜1.2 秒、同時 20 で 2.4〜2.8 秒、**同時 40 で 5.7〜6.8 秒（40 本中 39〜40 本が 5 秒超）。**hook 自体は普段 0.5 秒で、CPU が詰まると 5 秒を超える
- この閾値は**同じ Mac で多数の claude を同時に起動した試験の人工物**である。実際の 140 人はそれぞれ自分の端末で起動するので、サーバ側の「一斉」は端末の CPU を奪い合わない。ただし「遅い端末・高負荷の端末では SessionStart の行が無言で欠ける」ことは現実にも起こりうる（Windows・ウイルス対策・同時に複数セッションを開く利用者。未確認）

## 想定外だったこと

- 20 並列の実セッションで、SessionStart hook が**全部**打ち切られた。10 並列では 1 つも打ち切られない。閾値が鋭い
- stream-json には SessionStart の `hook_started`/`hook_response` だけが出て、Stop・UserPromptSubmit などの hook の結果は出なかった（claude 2.1.283）
- スレッドを 16 に増やすと、むしろ p95・max が悪化した
- 読み取りトランザクションが 5 秒を超えると、書き込み側だけでなく**画面の読み取りまで 500 になった**（書き手が PENDING を取った後の新しい読み手が busy になるため。推定）
- 作業中にホストのディスクの空きが 5.8 → 5.2 GiB に減った。Docker のビルドキャッシュ（全体で 1.2 GB、うち解放可能 0.99 GB）と Colima の仮想ディスクの伸びが主と推定（他トラックのビルドを含むため、消していない）

## 課題と改善案

1. **`plugin/hooks/session_start.py` の順序**（コード修正案・要判断）: `_collect_step` の「行の追記」を main の先頭（identity の直後）に移し、送信判定（`send_if_due`）だけを最後に残す。打ち切られても SessionStart の行が残る。
   あわせて `hooks.json` の SessionStart の `timeout` を 5 → 15〜30 秒にするかを検討する（SessionStart hook の時間が起動を遅らせるかは未確認。上限は打ち切りの閾値で、普段の所要 0.5 秒は変わらない）。
   テスト: `tests/` で hook の所要を人工的に延ばす（例: `apply_settings` を遅くする）と SessionStart の行が残ることを確かめ、順序を戻すと落ちることも確かめる
2. **`e2e/_flow.py` の `session()`**: stream-json の `hook_response`（`hook_event == "SessionStart"`）の `outcome` が `success` であることを判定に足す。打ち切り（`cancelled`）は今の E2E では無言で通る。
   20 並列で `cancelled` になることは確かめ済みなので、この判定は実際に落ちる（ゲートする）
3. **`server/ccgov/store/db.py` の `connect()`**（コード修正案・サーバ側）: SQLite の `timeout` を 5 秒（既定）から明示の 30 秒程度に上げる。ロックを握る操作（ANALYZE・重い画面）が 5 秒を超えても /ingest が 500 にならず待つ（端末の上限 60 秒より短く）。
   WAL（読み手と書き手が互いを止めない）も効くが、AIP のファイルシステムでの可否が未確認なので設計判断として別に扱う。テスト: `server/tests` で別接続がロックを 6 秒握る間の ingest が 200 になることを確かめ、`timeout` を戻すと 500 になることも確かめる
4. **waitress のスレッド数は既定（4）のままでよい**（2 CPU では増やしても改善しない）。`docs/knowledge/` の測定に「140 同時で p95 約 2〜3.5 秒、5xx 0」を足す。本番（AIP）の CPU 数が違えば測り直す
5. **`docs/knowledge/`（外界の事実）に足す**:
   - Claude Code の hook が `timeout` を超えると打ち切られ、stream-json に `hook_response` の `outcome: "cancelled"`・`exit_code: 1` が出る。stream-json に出るのは SessionStart の hook だけ（2.1.283）
   - waitress の既定は 4 スレッド・`connection_limit` 100。待ち行列が 1 以上になると `WARNING:waitress.queue:Task queue depth is N` をログに出す（負荷の目安になる）
   - Python の `sqlite3.connect` の busy timeout は既定 5 秒。超えると `OperationalError: database is locked`。読み取りトランザクションが長いと、後から来た読み手も busy になりうる
6. **`docs/guide/e2e.md` と e2e スキル**:
   - 「同じ Mac で `claude` を 10 を超えて同時に起動すると、SessionStart hook が 5 秒で打ち切られ、結果が偽になる」を注意書きに足す（今の e2e は 1 つずつなので影響なし）
   - 負荷の枝（references）に、この UC の型を雛形として置く: 「collect.py を通した実行の行を型に端末の行を作る」「突合（missing・dup）と、壊した入力（1 行落とし・二重送信・存在しない id）でのゲートの確認」「画面を同時に叩く」「ロックを握る機構の確認」「本物の `_sender.py` を端末ごとの `CLAUDE_PLUGIN_DATA` で一斉起動」
   - pytest e2e には昇格させない（重く、無言で壊れる種類ではない）。昇格させるのは 2. の判定だけ
7. `server/entry.sh` の `exec`（UC46 の改善案）と合わせて、`waitress-serve` の引数（スレッド・`connection_limit`）を環境変数で変えられるようにするかは、本番の CPU 数が分かってから決める（今は不要）

## 片付けたもの・残したもの

- 追加したのはこのフォルダの一時スクリプト 5 本（`_common.py`・`run_burst.py`・`run_lock.py`・`run_sessions.py`・`time_hook.py`。秘密を含まない）と、この `notes.md`。`plugin/`・`server/` は変えていない（16 スレッドはビルド用コピーの `entry.sh` だけを書き換えた）
- ログは `.local/e2e-load-testing/uc-77-burst-ingest/`（git 管理外。サーバログ 3 本・計測の jsonl 8 本。API キーは含まない）
- 片付けた: ラベル `cc-e2e=b-uc77` のコンテナとイメージ（各スクリプトの `finally` で削除し、`docker ps -a`・`docker images` で 0 件を確認）、`$TMPDIR/cc-e2e-b-uc77-*` と E2E ルート（0 件を確認。`time_hook.py` の初回は送信プロセスの書き込みと競合して消し損ね、手で消した上で静止待ちを足した）、起動した送信プロセス・claude（`pgrep` で 0 件）
- `heavy.lock` は各実行の `trap` で `rmdir` した（無いことを確認）
- 残したもの: Docker のビルドキャッシュ（ラベルが無く他トラックと共有のため消していない）
