# UC50: 本番らしい送信先を埋めた状態で E2E を流す

## 目的

リリース時に `plugin/config.json` の `ingest_url` へ本番の https URL を入れると、E2E がどう振る舞うかを実物で確かめる。
あわせて、E2E を流している間に**送信が外へ出ないこと**を確かめる。本物の本番 URL は使わず、解決されない `https://example.invalid/ingest` を使う。

## 仮説（どう壊れうるか）

- H1: `e2e/_market.py` の `_check_ingest_url` が、`config.json` を上書きしないモジュール（導入・設定・お知らせ・収集・陽性対照）で publish を拒み、落ちる（ユースケース集 No.50 のコードからの推定）
- H2: 送信先を上書きするモジュール（送信・非漏洩の本体）とサーバのモジュールは通る
- H3: 落ちるモジュールでは publish より前に止まるので、`claude` は起動せず、送信の試行も無い
- H4: 仮に検査が無ければ、hook の送信プロセスが `example.invalid` へ接続を試みる。名前解決の失敗は error 行に残らない（`_sender.py` は SSL の失敗だけを記録する）ため、送信先の誤りは端末でも管理画面でも無言になる

## 手順

1. `plugin/config.json` に `ingest_url=https://example.invalid/ingest`・`ingest_token=e2e-dummy-token` を入れる
2. `CC_E2E_RUN=b` と認証を付けて `pytest e2e` を全件流す（ログは `.local/e2e-load-testing/uc-50-prod-endpoint/`）
3. `config.json` を戻し、落ちたモジュールだけを流して比較する
4. 送信が外へ出ないことの確認: `probe_egress.py`（このフォルダ）で、検査を一時的に外した publish を行い、記録用のローカルプロキシ越しに未ログインのセッションを 1 回動かす。送信の試行が何処へ向かったかをプロキシの記録・spool・error 行で見る
5. 検査がゲートしていることの確認: 4 と同じスクリプトで、検査ありの publish が例外で止まることを見る

## 結果

測定条件: macOS（8 コア・8 GiB）、Docker は Colima（2 CPU・3 GiB）、`claude` 2.1.283、E2E 側 Python 3.13.2（`.venv`）、hook 側 `python3` 3.13.2。
2026-09-27 20:09〜20:29。**トラック C の負荷（`run_mixed.py`）と並行しており、load average は 18 前後**（8 コア）。時間の数字は相対値としてだけ見る。
ログは `.local/e2e-load-testing/uc-50-prod-endpoint/`（`run1-prod.log`・`run2-orig.log`・`run3-rerun.log`・`probe1.log`）。

### 1. 本番らしい送信先での全件（`run1-prod.log`）

**12 failed, 7 passed（118.6 秒）。H1・H2 のとおり。**

| モジュール | 結果 | 落ち方 |
| --- | --- | --- |
| `test_collect`（1・要認証） | 落ちる | publish で `RuntimeError: 組み立てた config.json の ingest_url がローカルでない` |
| `test_install`（5） | 全部落ちる | 同上 |
| `test_notices`（2） | 全部落ちる | 同上（`notices.json` だけを上書きするため） |
| `test_settings`（3） | 全部落ちる | 同上 |
| `test_leak` 陽性対照（1・要認証） | 落ちる | 同上（契約だけを上書きするため） |
| `test_leak` SENTINEL（1・要認証） | 通る | `ingest_config` が送信先を 127.0.0.1 に上書きする |
| `test_send`（2） | 通る | 同上 |
| `test_server`（4） | 通る | 配布物を使わない |

- 12 件の失敗はすべて `_market.py:77` の同じ例外（ログ中の出現 12 回）。call は 0.03〜0.15 秒で、`claude` を起動する前に止まる（H3）。要認証の 2 件も API を呼ぶ前に落ちたので、費用は SENTINEL の 1 件分だけ
- 本物の状態の監視（`_real_state_unchanged`）は失敗しなかった

### 2. 元の `config.json`（送信先が空）での比較（`run2-orig.log`・`run3-rerun.log`）

落ちた 5 モジュール（13 件）を流した: **11 passed, 2 failed（356 秒）**。落ちた 2 件は送信先と無関係で、1 回だけ流し直すと両方通った（26.8 秒）。**不安定**と判定する。

- `test_notices::test_無効化スイッチで出ない`: SessionStart の `hook_response` の `output` が空文字で `json.loads` が落ちた
- `test_settings::test_2回目は適用済みで本体に取り込まれる`: 2 回目のセッションの policy 行が 0 件
- どちらも未ログインのセッションで、負荷の高い時間帯（load 18）だった。hook の時間切れが疑わしいが、未確認（UC50 の範囲外。「課題と改善案」に回す）

### 3. 送信が外へ出ないこと（`probe_egress.py` → `probe1.log`）

| 条件 | 見たもの | 結果 |
| --- | --- | --- |
| 検査あり（E2E のまま） | `publish` | 例外で止まる。導入も起動も無い → **E2E では `example.invalid` へ送信の試行は起きない** |
| 検査を外す＋記録用プロキシ（`HTTPS_PROXY`） | プロキシが受けた CONNECT | `example.invalid:443` と `api.anthropic.com:443`（未ログインの `claude` 本体）の 2 つだけ。どちらも 502 を返し、外へは出していない |
| 同上 | 端末の状態 | spool 1 ファイル・4 行が残る。**error 行は 0**。`sent_at` はできる |
| 検査を外す＋プロキシなし。導入先の `_sender.py` を監査フック付きで直接実行 | `socket.getaddrinfo`・`socket.connect` | `getaddrinfo('example.invalid', 443)` だけ。connect は起きない（名前解決で失敗） |
| 同上 | 端末の状態 | spool が 2 ファイルに増える（退避だけ進む）。**error 行は 0** |

- この Mac で `getaddrinfo('example.invalid')` は 0.021 秒で `gaierror`（`[Errno 8]`）。問い合わせがリゾルバの先（上流 DNS）まで出たかは**未確認**（パケットは見ていない）
- **H4 は成立した。**送信先のホスト名が誤っていると、端末は黙って spool に溜め続け、上限で捨てる。error 行が作られないので、管理画面の「hook の失敗」の表にも出ない。`_sender.py` が接続不可を記録しないのは意図した設計（オフラインは平常）なので、端末の側では検出できない

### ゲートの確認（緑を鵜呑みにしない）

- 検査は本物の URL でゲートしている: 検査ありでは publish が止まり、外すと導入から送信の試行まで進む（上の表）
- 逆向きの死角: **送信先が空のままなら E2E は全件通る**（run2 の 11 件＋run1 の 7 件）。`test_send`・`test_leak` は送信先を上書きするので、配る `config.json` の値は一度も通らない。E2E は「リリースで空のまま配る」誤りを検出しない

## 想定外だったこと

- 送信先の誤り（解決できないホスト）が端末でもサーバでも完全に無言になる。H4 として推定していたが、error 行が 0 のまま spool が増えることを実物で確かめた
- 元の `config.json` でも 2 件が不安定に落ちた（高負荷の並行実行中）
- 待機に使った `pgrep -f "pytest e2e"` が自分自身のシェルのコマンド行に一致し、止まらなかった（作業上の罠。手で止めた）

## 課題と改善案

### `e2e/` の追加・修正

1. **開始時に 1 回だけ判定して止める（推奨）**: `conftest.py` のセッション開始で `plugin/config.json` の `ingest_url` を `_market._check_ingest_url` と同じ規則で見て、ローカルでなければ `pytest.exit`（理由: 「配布用の送信先が入っている。E2E は送信先が空の開発ツリーで流す」）。
   いまは 12 件が個別に同じ例外で落ち、7 件は緑になるので、「一部が壊れた」と誤読しうる。止まる時点では `claude` も Docker も動いていない
2. 代案: `publish` が `config.json` の上書きを受け取らないときは、`ingest_url`・`ingest_token` を空にしてから組み立てる。本番の URL を入れたままでも E2E が通るが、**配る物と試す物がずれる**うえ、送信先の誤りの検出には役立たない。推奨しない
3. どちらを採っても、「送信先の値そのもの」は E2E の範囲外に置き、下の検査スクリプトで見る

### リリースの確認（`scripts/` と `docs/guide/release.md`）

- 配る `config.json` の検査を機械にする: `ingest_url` が空でない・`https://` で始まる・ホストが localhost/127.0.0.1 でない・`ingest_token` が空でない。配布用マーケットプレイスの作業ブランチに対して流す。
  端末は送信先の誤りを記録しない（上の結果）ので、**リリース前の検査が唯一の防波堤**になる
- 実到達は staging で見る（No.51）。サーバ側で「端末から最後に届いた時刻」を見られれば、配布後の無言の停止に気づける（サーバの機能追加。要検討）

### `docs/guide/e2e.md` の修正

- 前提に「`plugin/config.json` の送信先が空（またはローカル）の開発ツリーで流す。本番の送信先を入れた状態では、送信先を上書きしないモジュール（導入・設定・お知らせ・収集・非漏洩の陽性対照）が publish で落ちる」を足す
- 「E2E は配る `config.json` の送信先を一度も通らない」を、確かめないことの一覧に足す

### e2e スキルの拡張

- 「5. staging を確かめる」の手前（リリース前の全件）で、`config.json` の送信先を見る手順を明示する: 開発ツリーでは空であること（空でなければ E2E が落ちる理由を先に伝える）、配布リポジトリの側では https の本番値であること
- 待機に `pgrep -f` を使うときは自分のシェルに一致しないパターンにする（例: `pgrep -f "[p]ytest e2e"`）

### `docs/knowledge/` に足す外界の事実（`claude` 2.1.283・macOS）

- hook の送信プロセス（`urllib`）は `HTTPS_PROXY` に従い、`CONNECT <host>:443` をプロキシへ送る。E2E の許可リストはプロキシ変数を通すので、社内網では隔離環境の送信もプロキシを通る
- 未ログインの `claude -p` も起動時に `api.anthropic.com:443` へ接続する
- macOS で `.invalid` の名前解決は即座に `gaierror`（約 0.02 秒）。`_sender.py` は `URLError(gaierror)` を記録しないので、ホスト名の誤りは error 行にならない

### 範囲外で見つけた課題（移し先の提案）

- 高負荷時に `test_notices::test_無効化スイッチで出ない`・`test_settings::test_2回目は適用済みで本体に取り込まれる` が不安定（上の 2.）。hook の時間切れかを UC43（hook の処理時間）か別の作業で切り分けるのがよい。`test_notices` は `output` が空文字のとき `JSONDecodeError` で落ちるので、落ち方が原因を示さない（空なら「hook が出力しなかった」と読める assert にする案）

## コードの変更

- なし（`plugin/config.json` は検証中だけ書き換え、元に戻した。`git diff` は空）
- 追加したのは `probe_egress.py`（このフォルダ。秘密を含まない）だけ

## 片付けたもの・残したもの

- 片付けた: `plugin/config.json`（元に戻した）、流し直しで残した隔離ルート 2 つ、`probe_egress.py` が作った隔離ルートと記録用プロキシ（スクリプト内で片付け）、止まらなかった待機ループ 2 つ
- Docker のラベル `cc-e2e=b` のコンテナ・イメージ: 無し（確認済み）
- `$TMPDIR/cc-e2e-*` に残っているもの: 作成時刻とプロセスから、トラック A（`cc-e2e-a-*`）とトラック C の `run_mixed.py`（20:28 起動）のもの。UC50 のものは無い
- 残した: `.local/e2e-load-testing/uc-50-prod-endpoint/` のログ（`run1-prod.log`・`run2-orig.log`・`run3-rerun.log`・`probe1.log`・`config.orig.json`）
