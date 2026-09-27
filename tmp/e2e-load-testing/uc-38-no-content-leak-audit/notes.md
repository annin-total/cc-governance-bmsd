# UC38: 本文を送らないことの監査

対応するユースケース: `.local/e2e-load-testing/e2e-usecases.md` の No.38。Claude Code 2.1.283、モデル haiku。

## 目的

情報セキュリティ部門の「プロンプトやコードが外に出ていないか」に、実物の送信経路で答える。
`e2e/test_leak.py`（プロンプトと Bash の入出力だけ・ASCII 完全一致だけ・サーバと Docker のログと送信の生バイトは見ない）
を、シナリオ・走査先・一致の形の 3 方向に広げる。

## 確かめる仮説（どう壊れうるか）

- 契約（`contract.py` の `HOOK_FIELDS`）は名指ししたキーだけを読むが、次の経路で本文が混ざりうる
  - ツールの入出力（Read した中身、Write/Edit の本文、長い出力、存在しないパスへのエラー文）が、
    `tool_input`・`tool_response`・`error` として hook に届く。キーパスの誤りで拾われうる
  - パス（cwd・transcript_path・ファイル名）。`CLAUDE_CONFIG_DIR` 自体に機微な名前が入りうる
  - サブエージェント・スキルとコマンドの引数（`UserPromptExpansion`）・`/compact` の指示（`PreCompact`）・
    Stop の `last_assistant_message`
  - error 行。例外の本文（パスや値を含む）を載せれば漏れる
  - policy 行の `prev_value`（利用者の settings.json の既存値）
- 送信プロセスや hook が、data 配下の外（TMPDIR・本物の config）に書き出す
- サーバが受信本文や例外をログに出す（docker logs）
- 走査そのものが効いていない（緑を鵜呑みにしない）

## 手順

一時スクリプト（このフォルダ）。`e2e/_root.py`・`_flow.py`・`_market.py`・`_githttp.py`・`_server.py` を import して再利用した。

```bash
set -a; . <.env.local>; set +a; CC_E2E_RUN=c UC38_WORKERS=5 .venv/bin/python tmp/e2e-load-testing/uc-38-no-content-leak-audit/audit.py
CC_E2E_RUN=c .venv/bin/python tmp/e2e-load-testing/uc-38-no-content-leak-audit/server_probe.py   # 認証不要
```

- `audit.py`: Docker サーバ 1 つ + 前段の受け口（`recorder.py`）を立て、12 シナリオをそれぞれ別の隔離ルートで動かし、全経路を走査する
- `recorder.py`: 送信の生バイトの受け口。`ingest_url` をここに向け、POST 本文を記録してから DockerServer へ中継する。
  s10 だけは最初の POST に 500 を返し、送信側の error 行を実物の経路で起こす
- `scenarios.py`: シナリオ。1 シナリオ = 1 隔離ルート、SENTINEL はラベルごとに別
- `runner.py`: 導入 → `claude -p`（haiku）→ flush 前の data 配下を控える → `sent_at` を消して未ログインの起動で flush
- `scan.py`: 一致の形と走査。`self_test()` が形ごとに当たり・外れを確かめる
- `server_probe.py`: サーバ側の合成 POST（壊れた行・契約外キー・重複 event_id・誤トークン・URL）で DB と docker logs を見る

| シナリオ | 仕込んだ場所 | 実際に通った hook（収集行） |
| --- | --- | --- |
| s01 prompt-bash | プロンプトと `echo` の入出力 | UserPromptSubmit・PostToolUse(Bash)・Stop |
| s02 file-read | ファイルの中身（プロンプトには無い）。応答にも出させる | PostToolUse(Read)・Stop |
| s03 file-write-edit | Write の本文と Edit の置換前後 | PostToolUse(Write)・PostToolUse(Edit) |
| s04 file-path | ディレクトリ名（プロンプトには無い。Glob で見つけさせる） | PostToolUse(Glob)・PostToolUse(Read) |
| s05 tool-error | 存在しないパスへの `ls` と Read | PostToolUseFailure(Bash)・PostToolUseFailure(Read) |
| s06 subagent | Agent に渡すプロンプト | PostToolUse(Agent)・子の PostToolUse(Bash, agent_id あり) |
| s07 long-output | 5000 行の出力（プロンプトには無い） | PostToolUse(Bash) |
| s08 cmd-skill-args | `/echoarg <S>` の引数、Skill の args | UserPromptExpansion(echoarg)・PostToolUse(Skill) |
| s09 compact-stop | 覚えさせた値、`/compact <指示>`、応答 | PreCompact(manual)・Stop・SessionStart(compact) |
| s10 config-path-error | `CLAUDE_CONFIG_DIR` のパス、settings.json の管理外キーと管理対象キー、送信 500 | error(send, HTTP 500)・policy |
| s11 synthetic-stdin | 合成の hook 入力（契約外キー・パス・transcript 本文・深い入れ子で RecursionError） | UserPromptSubmit・Stop(context_tokens=7)・error(collect, RecursionError) |
| pc leaky-contract | 陽性対照。組み立てコピーの契約に `prompt`・`tool_input.command`・`tool_response.stdout` を足す | UserPromptSubmit・PostToolUse(Bash) |

走査先と分類:

- 送信されるもの・サーバに残るもの（ここで当たれば LEAK）: flush 前の data 配下（queue・spool）、flush 後の data 配下、
  受け口が記録した POST 本文（= 送信済みの生バイト）、サーバ DB（`copy_data`）、docker logs、配布物のキャッシュ
- 端末内だけのプラグインの生成物（LOCAL）: `<config>/governance/`（settings.json のバックアップ）、pycache
- 参考（info）: Claude Code 本体の transcript と保存物、仕込んだ project のファイル、各ルートの TMPDIR
- ルートの外: 実 TMPDIR と `/private/tmp`（開始以降に更新されたファイル）、本物の config（同）

一致の形: 完全一致、乱数部の前半 8・後半 8 文字、16 進の大文字、JSON の `\uXXXX` エスケープ、URL エンコード
（全バイト `%XX`）、UTF-16LE、base64（3 通りの位相）。ASCII の英数字と `-` は URL エンコードで変わらないため、
`url` の形は完全一致と同じバイト列になる（表に常に並ぶのはそのため）。

## 負荷の掛け方

- 同時 4 セッション（run1）・5 セッション（run2）。12 シナリオを ThreadPool で流し、同時に起動・送信させる
- 送信先は 1 つの Docker サーバ（共有 DB）。各実行で POST 26 件

## 結果（Claude Code 2.1.283、haiku、macOS）

- **run2（5 並行）: LEAK 0。** run1（4 並行）も送信経路では 0（run1 は後述の分類の誤りで LOCAL を LEAK と数えていた）
- 12 シナリオすべて完走。run1 は 93 秒、run2 は 75 秒（サーバのビルドを除く）。POST 26 件（200 が 25、仕込んだ 500 が 1）
- すべての非漏洩の SENTINEL が Claude Code の transcript（`config/projects/`）には在る = 本当に hook の手前まで届いている
- 陽性対照（どれも同じ走査で検出した）:
  - pc: 組み立てコピーの契約に自由文のキーパスを足すと、flush 前の queue と POST 本文で検出（exact・断片とも）。
    サーバ DB には入らない（サーバ側の契約の複製に無い列は黙って捨てられる。CLAUDE.md の「契約のドリフトは無言」どおり）
  - s10 の管理対象キー（`env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`）に入れた値は **policy 行の `prev_value` として
    queue・POST 本文・サーバ DB まで届く**（仕様どおりの経路。実物の未改変の経路で DB まで走査が効く証拠にもなる）
  - ルート外の TMPDIR に置いた canary を `tmp_outside` の走査が検出
  - `scan.self_test()` を壊すと落ちる（形を 1 つ抜く・断片を壊す、で AssertionError）
  - 分類の検査: `hits.json` を by_design の免除なしで数え直すと、pc と s10 の管理対象キーの計 5 件が LEAK になる
- error 行: 送信 500 の error 行は `stage=send, error_type="HTTP 500"`、深い入れ子の入力では `stage=collect, error_type=RecursionError`。
  どちらもパス・値・例外本文を含まない（`CLAUDE_CONFIG_DIR` が SENTINEL 入りのパスでも）
- 断片だけの一致（完全一致なしで断片だけ当たるもの）: 0 件
- 本物の config・実 TMPDIR・`/private/tmp` に SENTINEL なし
- docker logs: 1851 バイト。**起動時の pip の出力と waitress の待受の 1 行だけ。**waitress はアクセスログを出さず、
  受信処理は例外を出しても 500 のトレースバックしか残さない設計。server_probe の合成 POST
  （壊れた JSON 行・契約外キー `prompt`/`tool_input`・同じ event_id の 2 回送信・誤トークン・URL に SENTINEL）でも
  DB・docker logs・応答本文に SENTINEL は無く、トレースバックも出なかった（重複 event_id は 200 で両方保存される。
  集計は `COUNT(DISTINCT event_id)` で重複を除く設計）

LOCAL（送られないが、端末に残るもの）:

- `<config>/governance/backups/settings-*.json`: 標準設定を適用する前の settings.json の丸ごとのバックアップ
  （管理外キーの値も含む）。権限 0600、直近 10 世代。仕様どおり
- pycache の `.pyc`: ソースパス（`CLAUDE_CONFIG_DIR` 配下のインストール先）を `co_filename` として埋め込む。
  E2E は `PYTHONPYCACHEPREFIX` をルート内に向けているため見えた。本番では配布物のキャッシュ内の `__pycache__` に書かれる

## 想定外だったこと

- 管理対象キーの `prev_value` は、利用者が settings.json に書いた値を 255 文字まで送る。本文ではないが、
  「利用者の値は送らない」とは言えない。監査の説明には、`policy.py` が名指ししたキーの以前の値は送る、と明記する必要がある
- `-k leak` の既存テストは flush 後の data 配下を走査しない（flush 前だけ）。送信済みファイルは 2xx で消えるので、
  送信済みの生バイトは受け口を置かない限り見られない（今回は `recorder.py` で見た）
- docker logs はアクセスログを持たないため、「ログに出ない」の証拠としては弱い（そもそも本文を書く口が無い）

## 課題と改善案

- `e2e/`: `test_leak.py` を広げる
  - シナリオを足す: ファイルの中身（Read）、パス（Glob で見つけさせる）、ツールのエラー（PostToolUseFailure）、
    `/cmd` の引数（UserPromptExpansion）、`/compact <指示>`（PreCompact）。どれも haiku 1 回で済み、費用は小さい
  - 送信の生バイトを見る: `DockerServer` の前段に記録する受け口（`recorder.py` 相当、約 60 行）を置くか、
    `_flow.ingest_config` の URL を差し替える口を作る
  - 一致の形: 完全一致に加え、乱数部の断片と base64 を見る（`scan.forms` 相当）
  - docker logs を走査に足す（`server.logs()` を 1 行足すだけ）
  - 陽性対照に「管理対象キーの prev_value は届く」を入れる（改変なしの経路で DB まで走査が効く証拠になる）
- `docs/guide/e2e.md`: 監査への説明として「送らないもの／送るもの（prev_value を含む）／端末に残るもの（バックアップ・pyc）」を
  区別して書く
- e2e スキル: UC38 のプロンプトには、「送信経路には無い」と「端末には残る（settings のバックアップ）」を分けて答えるよう示す
- `docs/knowledge/` 候補（Claude Code 2.1.283 で観測）:
  - PostToolUseFailure は Bash の非 0 終了と Read の不在ファイルの両方で発火する
  - `/compact <指示>` で PreCompact（trigger=manual）が発火し、続く SessionStart の source は compact
  - サブエージェント内の Bash の PostToolUse には `agent_id` が付き、Agent ツール自体の PostToolUse には付かない
- 仕様の確認（範囲外。直していない）: 重複 event_id が DB に 2 行入る（集計側で除く設計）。再送の多い端末で DB が膨らむかは未確認

## コードの変更

- 本物のコード（`plugin/`・`e2e/`・`server/`）は変えていない。陽性対照の契約の改変は publish 時の組み立てコピーだけ
- 一時スクリプト: このフォルダの `audit.py`・`recorder.py`・`runner.py`・`scan.py`・`scenarios.py`・`server_probe.py`
  （`e2e/` へ取り込むなら上の改善案の形で）

## 生データ（git 管理外）

`product/cc-governance-bmsd/.local/e2e-load-testing/uc-38-no-content-leak-audit/`
（`sentinels.json`・`hits.json`・`posts/`（送信の生バイト）・`rows-*.jsonl`・`docker.log`・`run2.log`、`run1/` は 1 回目）

## 片付けたもの・残したもの

- 各隔離ルート・サーバ用ルート・Docker のコンテナとイメージ（`cc-e2e=c`）は各実行の finally で削除。削除後に
  `docker ps -a` / `docker images` の `label=cc-e2e=c` が空、`$TMPDIR` に自分の `cc-e2e-*` が無いこと、canary の削除、
  残存プロセスが無いことを確認した
- heavy.lock は監督の管理（触っていない）
- 費用: haiku の `claude -p` を試走 2 回 + 本走 2 回 × 14 回で約 30 回。推定 0.3〜0.6 USD（実測していない）
