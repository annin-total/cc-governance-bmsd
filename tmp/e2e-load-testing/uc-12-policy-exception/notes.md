# UC 12: policy.py の例外（ユースケース集の 12）

## 目的

`policy.py` に例外を入れた版がリリースされた端末で、`session_start.py` の段ごとの保護が実物で効くか
（設定の適用だけが止まり、お知らせと収集は続き、error 行がサーバの概況まで届くか）を確かめる。
単体テスト（`test_order_settings_failure_still_shows_notice_and_collects` など）は `import policy` を差し替えて見ている。
ここでは配布物の `policy.py` そのものを壊した版を `plugin update` で入れ、Claude Code・hook・送信・サーバを通す。

## 確かめる仮説（どう壊れうるか）

- 例外がほかの段（お知らせ・収集・送信判定）へ波及する
- error 行が積まれない、または `send` 以外の段の error 行がサーバに届かない・概況に出ない
- 例外の途中で settings.json が半端に書かれる、または一時ファイルが残る
- UC 01 の「型違いの値でプラグインが `enabled: false` になり hook が無言で止まる」と同じ症状になる（区別する）
- 直した版を配れば追いつく（追いつかなければ UC 01 R4 と同じ詰み）
- `Exception` でない例外（`SystemExit`）は段の保護を素通りする

## 手順

一時スクリプト `run.py`（e2e の `_root`・`_flow`・`_market`・`_githttp`・`_server` を import）。
集計サーバを Docker で 1 つ起動し（ラベル `cc-e2e=a`）、ケースごとに隔離ルートを作って次を逐次に行う。

1. V1（正しい `policy.py`・見本のお知らせ・送信先はローカルのサーバ）を導入し、セッション s1
2. V2（例外を入れた `policy.py`）を publish → `plugin marketplace update` → `plugin update`。`sent_at` を消してセッション s2
   - 判定: error 行が `("apply_settings", 期待の例外名, V2)` の 1 行だけ／policy 行が無い／systemMessage にお知らせ／SessionStart の event 行が在る／
     settings.json がバイト単位で不変／`.settings-*.tmp` が残らない／`plugin list` で `enabled: true`／error 行と event 行の event_id がサーバの DB に入る
3. V3（直した版、値を 60→50）へ更新してセッション s3。判定: `AC 50 / prev 60 / applied`、error 行なし
4. 全ケースの後、管理画面の概況の `error-summary` 表に `apply_settings / 例外名` が在ること

セッションは未ログインの `claude -p ok --output-format stream-json`（SessionStart は発火する。認証・API 費用なし）。

| ケース | V2 の `policy.py` | 期待する error_type |
| --- | --- | --- |
| P0 | 正しい版（陰性対照。「SyntaxError が出る」を期待して判定が落ちることを確かめる） | （落ちること） |
| P1 | 構文エラー（`SET` の `{` を閉じない） | SyntaxError |
| P2 | import 時の例外（存在しないモジュールの import） | ModuleNotFoundError |
| P3 | 値の不正: `SET` のコロンをカンマと書き違えて set になる | AttributeError |
| P4 | 値の不正: list のつもりで set を書いた値（`permissions.deny: {"Bash(rm -rf:*)"}`）。JSON に書けない | TypeError |
| P5 | 境界: import 時の `raise SystemExit(0)`（`Exception` でない） | なし（全段が止まる想定） |

```
CC_E2E_RUN=a .venv/bin/python tmp/e2e-load-testing/uc-12-policy-exception/run.py [P0 P1 ...]
```

## 負荷の掛け方

ケースごとに隔離ルート 1 つ、`claude` は常に 1 つだけ（逐次）。セッションは 6 ケース × 3 回 = 18 回、`plugin list` 6 回。サーバは 1 つを共有。

## 結果（2026-09-27、macOS・claude 2.1.283・未ログインの `-p`・Docker の集計サーバ 1 つ）

有効な実行は run3（全 6 ケース・18 セッション・約 4 分。マシンの load average 13〜17、ほかのトラックと並行）。
行の記録は `.local/e2e-load-testing/uc-12-policy-exception/P*.json`・`run3.log`・`error_table.html`（run1 の記録は `run1/`）。
判定の結果は「FAILS: P4 s2 一時ファイルが残る」の 1 件だけ（仮説どおりの発見。下記）。

| ケース | s2（例外の版）の error 行 | policy 行 | お知らせ | SessionStart の event 行 | settings.json | `enabled` | サーバ到達 | s3（直した版） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 正しい版（陰性対照） | なし | AC 55 / 60 / applied | 出る | 在る | 変わる | true | 届く | 50 / 55 / applied |
| P1 構文エラー | `apply_settings / SyntaxError / 0.2.3` | なし | 出る | 在る | 不変 | true | 届く | 50 / 60 / applied |
| P2 import 時の例外 | `apply_settings / ModuleNotFoundError` | なし | 出る | 在る | 不変 | true | 届く | 50 / 60 / applied |
| P3 SET が set | `apply_settings / AttributeError` | なし | 出る | 在る | 不変 | true | 届く | 50 / 60 / applied |
| P4 値が set | `apply_settings / TypeError` | なし | 出る | 在る | 不変（ただし **0 バイトの `.settings-*.tmp` が config 直下に残る**） | true | 届く | 50 / 60 / applied |
| P5 `raise SystemExit(0)` | **なし** | なし | **出ない** | **無い** | 不変 | true | —（送るものが無い） | 50 / 60 / applied |

- 管理画面の概況の `error-summary` 表に `apply_settings` の 4 種（AttributeError・ModuleNotFoundError・SyntaxError・TypeError、各 1 件・1 端末・版 0.2.3）が出た
- P5 の hook 応答は `stdout: ""`・`stderr: ""`・`exit_code: 0`・`outcome: success`。Claude Code 側からも利用者からも何も見えない。
  後続の UserPromptSubmit の収集（`collect.py`）は動く
- UC 01 との区別: どのケースも `plugin list` は `enabled: true`、直した版の最初のセッションで追いつく。
  例外の版は settings.json に何も書かないので、UC 01 の「型違いの値で無効化されて戻れない」には入らない（P4 の set も JSON に書けず、書かれる前に止まる）
- 判定がゲートしていることの確認: P0（正しい版に「SyntaxError の error 行・policy 行なし」を期待）が run3 で 4 項目不一致になった。
  run1 では判定の読み方の誤り（下記）で P1〜P4 の error 行が「無い」と出て落ちており、判定が実際に落ちうることも見えた

## 想定外だったこと

1. **P4: JSON に書けない値で、`_settings._write` が一時ファイルを残す**（事実。実物と単体の再現の両方）。
   `plugin/hooks/_settings.py:68-69` で `mkstemp` の後に `json.dumps` が `TypeError` を投げ、`except OSError`（`:82`）が捕まえないため `os.remove(tmp_path)` に届かない。
   単体で `apply_settings` を 3 回呼ぶと 0 バイトの `.settings-*.tmp` が 3 つ残った。**例外の版が配られている間、全端末の `~/.claude/` にセッションごとに 1 つずつ溜まる**（実物で見たのは 1 セッションで 1 つ。累積は単体での再現からの推定）。直した版は掃除しない
2. **P5: `Exception` でない例外は段の保護を素通りし、SessionStart の全段（お知らせ・SessionStart の収集・送信判定・error 行）が無言で止まる**（事実）。
   `session_start.py` の段は `except Exception`（`:134-137` の設定の段など）、最外は `except BaseException: pass`。`policy.py` に `sys.exit()` を書く実害の見込みは低いが、`KeyboardInterrupt` 以外の `BaseException`（`SystemExit`・`GeneratorExit`）は同じ経路になる（推定）。サーバからは「SessionStart の event 行と policy 行が途絶えた端末」としか見えない
3. **run1 の判定の読み方の誤り**: 送信先を生きたサーバにすると、送れた行は spool ごと端末から消える。端末の queue/spool だけ読んだ run1 では、送信済みのセッションの行が「無い」ように見えた。
   run3 ではサーバの DB を ts の窓で読み、端末の残りと合わせた。E2E の `hook_rows` の docstring（送信先が空の前提）どおりだが、送信先を埋めた検証では罠になる
4. **run1 の P3 s1（正しい V1）で SessionStart の出力が空・行なし**が 1 回だけ起きた（18 セッション中 1）。run3 では再現せず、hook の `exit_code`・`outcome` を記録していなかったので原因は不明。
   推測: 高負荷（load average 15〜17）で SessionStart の `timeout: 5` 秒に掛かった可能性。未検証

## 課題と改善案

- **バグ（`plugin/`）**: `_settings._write`（`plugin/hooks/_settings.py:56-87`）の一時ファイルの後始末を、例外の種類によらず行う（`except OSError` の外で `finally` など）。
  あわせて `tests/` に「JSON に書けない値で一時ファイルが残らない」テストを足す。今の `tests/` には該当が無い（`grep` で確認）
- **`tests/`（予防）**: `policy.py` の SET・ONCE の値が JSON に直列化できること（set・tuple 以外の型の混入）を検査するテスト。UC 01 の「上流の型表での検査」と同じ場所に置ける
- **判断が要るもの（`plugin/`）**: `session_start.py` の `_apply_settings_step` の保護を `BaseException`（`KeyboardInterrupt` を除く）に広げるか。`policy.py` は管理者が書く Python なので、`SystemExit` の混入は構文エラーより稀。直すなら 1 行
- **`e2e/`**: 例外の版で「お知らせと収集が続き error 行がサーバの概況に届く」を見る E2E は、`test_send.py` の 401 の経路と同じ形で 1 本足せる（P1 を縮めたもの）。
  ただし `tests/` の `test_order_settings_failure_still_shows_notice_and_collects`・`test_stage_failure_queues_one_error_row` で波及しないことは見えており、実物で新しく分かったのは上の 2 件だけ。**昇格は不要**と考える（「無言で壊れる」の本体は tests/ で塞げる）
- **`e2e/_root.py`**: `hook_rows` の docstring に「送信に成功した行は端末から消える。送信先を埋めたら DB 側を読む」と一言足すか、`_server.DockerServer` に ts の窓で行を返す補助（`run.py` の `server_rows`）を足す
- **`e2e/_flow.session`**: stream-json の `hook_response` の `exit_code`・`outcome` を返すか記録する。空出力の原因（P5 の BaseException・タイムアウト）を後から区別できない
- **`docs/knowledge/`**: 「SessionStart hook が何も出力せず exit 0 で終わると、stream-json の `hook_response` は `stdout: ""`・`outcome: success` になり、利用者には何も見えない」（claude 2.1.283 で確認）
- **`docs/guide/e2e.md`**: ユースケース集 12 の「手順を組まないと見られない」は、`ingest_config` を overrides に入れ `sent_at` を消すだけで見られる（run.py の手順）。手動確認の例として載せられる

## 片付けたもの・残したもの

- 片付けた: 集計サーバのコンテナとイメージ（ラベル `cc-e2e=a` の資源が 0 件であることを確認）、各ケースの隔離ルートと git 配信サーバ（`$TMPDIR/cc-e2e-a-12-*` が無いことを確認）、単体の再現に使った一時ディレクトリ、監視用の tail
- 残した: `run.py`・この `notes.md`。記録は `.local/e2e-load-testing/uc-12-policy-exception/`（run3 の `P*.json`・`run3.log`・`error_table.html`、run1 の記録と `run1-local-rows-only.log`）
- コードの変更: なし（`plugin/`・`e2e/` は触っていない）
