# ローカル実機検証の手順

配布したプラグインが利用者の端末で実際に動き、サーバへ届き、画面に出ることを確かめる。
あわせて、**自由文と秘匿値が送信も永続化もされないこと**を確かめる。

テストは実装単体を検査する。この手順は「実際の導入経路で配置されたものが動くか」を見る。
テストが緑でもここが通るとは限らない。

使う道具の一覧と使い方は `verification/README.md` にある。この文書は確かめる順序と合格の条件だけを持つ。

## 原則

- **本人の `~/.claude` を書き換えない。**隔離は `CLAUDE_CONFIG_DIR` で行う。macOS で `HOME` を
  差し替えると認証が壊れる（`Login successful` の直後に `Not logged in` が出る）
- **生成物はすべて 1 つのルートに落とす。**片付けはそのルートを消すだけで済む形にする
- **送信先を本番の受信先に向けない**
- **緑は証拠にならない。**hook は常に `exit 0` で終わり、失敗しても何も出さない。着弾は必ず
  別経路（サーバの DB・`queue.jsonl` の行数）で確かめる。検査は、壊して落ちることを確かめて
  初めて効いていると言える（A7）

## 環境の作り方

```bash
export CC_VERIFY_ROOT=$(mktemp -d /tmp/cc-e2e-XXXXXX)
export CLAUDE_CONFIG_DIR="$CC_VERIFY_ROOT/config"
export CLAUDE_PLUGIN_DATA="$CLAUDE_CONFIG_DIR/plugins/data/governance-cc-marketplace-governance-bmsd"
mkdir -p "$CLAUDE_CONFIG_DIR" "$CLAUDE_PLUGIN_DATA" "$CC_VERIFY_ROOT"/{captured,csv,logs}
```

サーバは `server/` で `docker compose up`。ホスト側ポートは **15000**（5000 は macOS の
AirPlay レシーバーが握る）。送信先は `http://127.0.0.1:15000/ingest`。

**プラグインのデータ領域は `claude` からは外から指定できない。**`CLAUDE_PLUGIN_DATA` を export しても
`claude` 自身には無視され、`$CLAUDE_CONFIG_DIR/plugins/data/<plugin>-<marketplace>/` に固定される。
一方、hook を手で実行するとき（A3・A4・A5）は `python3` がこの環境変数をそのまま読むので、
上の export で `claude` が使う状態ディレクトリと揃う。export し忘れると本人の `~/.claude/cc-governance`
に書き込んでしまう。

**`directory` source のマーケットプレイスはソースツリーを直接参照する。**`CLAUDE_PLUGIN_ROOT` は
`plugins/cache/...` ではなく `settings.json` に書いたパスそのものになり、cache 側を書き換えても
反映されない。設定を変えて試すときは、マーケットプレイスごと `$CC_VERIFY_ROOT` にコピーして
そちらを指す。**開発ツリーを直接指さない。**hook がそこへ書き込みうる。

## フェーズ

| | 内容 | 認証 |
| --- | --- | --- |
| **A** | 導入・収集・適用・送信・受信・画面・機密検査・検証スクリプト | 不要 |
| **B** | Claude Code が実際に hook を呼ぶこと、stdin の実形状 | 要（API キー） |
| **C** | お知らせの画面での見え方 | 要・**対話必須** |

---

## フェーズ A

### A1. サーバが起動し、全画面が応答する

`server/` で `docker compose up -d --build` し、`dev.env` の `ADMIN_PATH` の下の `/` `/policy` `/effect` `/assets` を、
`ADMIN_PASSWORD` の Basic 認証を付けて `curl` で叩く。

**合格の条件** — 4 画面がいずれも `200`。データが 0 件でも `500` にならない。
`docker compose logs` に例外が出ていない。

### A2. 隔離環境へプラグインを導入する

配布リポジトリ（またはその隔離コピー）をローカルパスのマーケットプレイスとして登録する。
`claude plugin` 系はログイン不要である。

```bash
claude plugin marketplace add <配布リポジトリのパス>
claude plugin install governance@cc-marketplace-governance-bmsd
claude plugin list
```

**合格の条件** — `governance` が `enabled` で現れ、`installPath` の実体が存在する。
`git -C ~/.claude status` が空のまま。

### A3. hook が実配置から動く

開発ツリーの `plugin/` ではなく、**`installPath` 配下の `hooks/collect.py`** を、7 種の hook それぞれの
stdin で実行する。`INSTALL_PATH` は `claude plugin list --json` の `installPath` である。

```bash
CLAUDE_PLUGIN_DATA="$CLAUDE_CONFIG_DIR/plugins/data/governance-cc-marketplace-governance-bmsd" \
  python3 "$INSTALL_PATH/hooks/collect.py" SessionStart < fixture.json
```

fixture は `tests/fixtures/hook_inputs/` から使う。ファイル名では hook の種類が分からないので、
中身の `hook_event_name` で仕分ける。

**合格の条件** — 全 7 種が `exit 0`。`queue.jsonl` に行が増え、列が `contract.py` の
`HOOK_FIELDS` + `EXTRA_COLUMNS` と過不足なく一致する。破損 JSON・空入力・数十 MB の入力でも
`exit 0` で、queue の全行が有効な JSON Lines のまま。

### A4. 設定が自動適用される

隔離 `settings.json` に対して `session_start.py` を動かす。

**合格の条件**

- 1 回目: `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` が `"60"`、
  `extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate` が `true` になる（`applied`）
- `settings.json` が存在しないときは結果が割れる。`env` の方は `applied` で `settings.json` が
  作られ、`autoUpdate` の方は途中の階層が無いため `skipped_missing` になる
- 2 回目: `already_ok`。ファイルの mtime が変わらない
- 壊れた JSON を置いたときは `parse_failed` で、ファイルは無傷

### A5. お知らせが出て、既読になる

**合格の条件** — 1 回目の `systemMessage` に `notices.json` の内容が入り、2 回目は出ない
（`seen.json` に記録される）。`CC_GOVERNANCE_DISABLE` を立てると出ず、`seen.json` も作られない。
`seen.json` を削除すると再表示される。未読が複数件なら空行 1 つで連結される。

#### お知らせの URL

検証用コピーの `notices.json` に `url` を持つ項目を 2 件加える（例: `https://example.com/?from=cc-e2e&n=1`
と `...&n=2`）。引数をファイルに追記するだけの偽の `open` を置いたディレクトリを `PATH` の先頭にし、
**`env -i` で環境変数を空にしてから**起動する（親の `CLAUDE_CODE_ENTRYPOINT` を継承すると起動形態の
判定が汚れる）。

```bash
env -i HOME="$HOME" USER="$USER" TERM="$TERM" PATH="$CC_VERIFY_ROOT/fakebin:/usr/local/bin:/usr/bin:/bin" \
  CLAUDE_CONFIG_DIR="$CLAUDE_CONFIG_DIR" claude -p "Reply with exactly: OK" --model haiku < /dev/null
```

対話起動は専用ソケットの `tmux` の中で同じ環境変数を与えて起動し、`capture-pane` で画面を読む。

**合格の条件**

- `claude -p`: プレーン出力と `--output-format json` には本文が現れない。
  `--output-format stream-json --verbose`（`--verbose` が無いとエラー）の `hook_response` に
  `詳細: <url>` が入る。`seen.json` は作られず、偽の `open` は呼ばれない。2 回目でも同じお知らせが出る
- 対話起動: 偽の `open` が**先頭の URL 1 件だけ**を、`&` を含んだまま 1 つの引数として受け取る。
  `seen.json` に全件の id が入る。2 回目はお知らせも `open` の呼び出しも増えない

`/login` も偽の `open` を呼ぶ。呼び出しの数ではなく、記録された URL で判定する。

### A6. 端末からサーバへ届く

`config.json` の `ingest_url` を `http://127.0.0.1:15000/ingest`、`ingest_token` を `dev-token` にする。

**合格の条件**

- `/ingest` が `{"stored": N, "dropped": 0}` を返し、`events` + `policy_state` の件数が `stored` と一致する
- 送信後に `spool/` が空になる
- **トークンを間違えると `401` で、スプールが残る**（実際に試す）
- hook プロセスは 1 秒未満で終わり、送信は数秒後に別プロセス（`PPID` が `1`）として完了する

### A7. 秘匿値が送信も永続化もされない（**最重要**）

`prompt` / `tool_response` / `message` / `tool_input.command` / `tool_input.description` に
`SENTINEL-<乱数>` と API キー風の文字列（例: `sk-` に続く英数字）を仕込んだ stdin を A3 の手順で流す。

**走査する 6 対象**

1. `queue.jsonl`
2. 送信の生バイト（`/ingest` の手前でキャプチャするか、サーバのアクセスログで見る）
3. DB の全列（`events` / `policy_state` を `SELECT *`）
4. DB ファイルのバイト列
5. `$CC_VERIFY_ROOT` 全体（`grep -r`）
6. 本人の `~/.claude`

**合格の条件** — 仕込んだ値が 6 対象のいずれからも出てこない。

**「漏れなかった」で終わらせない。**契約のコピーに `prompt` など危険なキーパスを 2〜3 本足した版で
同じ手順を流し、**実際に漏れることを確認する。**このコピーは検証専用であり、実装には反映しない。

あわせて、`_sender.py` が `ingest_url` のスキームを検査しないため、`http://` では
`X-Ingest-Token`・`user_email`・`host` が平文で流れることを生のリクエストで確認し、事実として記録する
（`../spec/plugin.md`）。コードは直さない。

### A8. CSV が取り込まれる

**環境の落とし穴**

- `CSV_DIR` は named volume の中にあり、ホストに置いても拾われない。`docker cp <csv> server-server-1:/app/data/csv/` で入れる
- `docker exec` は `entry.sh` が読み込んだ環境変数を引き継がない。実際の値は `waitress-serve` プロセスの `/proc/<pid>/environ` で見る
- コンテナに `sqlite3` CLI は無い。DB は `docker exec ... python3 -c "import sqlite3; ..."` で見る

取り込みは `curl -X POST http://127.0.0.1:15000/import`。

**合格の条件** — `cost_daily` に行が入る。同じファイルを 2 回取り込んでも件数が増えない。
`Date` 列の `YYYY-MM-DD` と `YYYY/M/D`、UTF-8 BOM 付き・CRLF を受理する。壊れた行は破棄され、
破棄件数が結果に出る。必須列が欠けたファイルはそのファイルだけ失敗し、他は続行する。
取込後も 4 画面が `200` のまま。

### A9. 画面にデータが出る

A6・A8 でデータを入れた状態で 4 画面を見る。先に次の 2 点を押さえる。

- **準拠は `prev_value` で判定する**（セッションを開いた時点で既にポリシー値と一致していたこと）。
  初回適用は必ず未準拠になる。**同じ端末を 2 回以上動かし、2 回目で準拠に転じることを確認する**
- **準拠率の分母は AI Gateway の CSV である。**CSV の `User Email` と端末の `user_email` が一致しないと
  突合率ごと 0% に見える。**突合率を先に見る。**端末側は `CC_GOVERNANCE_USER_EMAIL` で上書きできる

**合格の条件** — 投入したデータが 4 画面に反映される。**スクリーンショットだけで判定しない。**
1280px 幅で、コンソールの error/warning・ネットワーク失敗・`scrollWidth > clientWidth` の表・
切れたセルがいずれも 0 件であることを機械検査で確かめる。768px 以下で `/policy` の表が数 px
はみ出すのは不合格としない。

### A10. verification のスクリプトが動く

`verification/` の各スクリプトを `verification/README.md` のとおりに動かす。

**合格の条件** — 書かれたとおりに動く。動かないもの・前提が書かれていないものは README に反映する。

---

## フェーズ B（API キーが要る）

モデルは haiku、隔離環境で `claude -p` を使う。

### B0. 契約列を埋めるための起動方法

`claude -p` だけで契約列のほぼ全てに実データを入れられる。

| 列 | 埋め方 |
| --- | --- |
| `tool_name` | ツールを使わせるプロンプト。MCP 経由は `mcp__<server>__<tool>` の形で入る |
| `skill_name` | 検証用の自作スキルを呼ばせる |
| `agent_id` | サブエージェントを起動させる。値が付くのはサブエージェント自身のツール呼出だけ |
| `source` | `startup`: 通常起動 / `resume`: `--resume` か `-c` / `clear`: `/clear` / `compact`: 圧縮時 |
| `compact_trigger` | `manual`: `/compact` / `auto`: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` を数 % に下げて起動 |
| `command_source` | `userSettings`: `$CLAUDE_CONFIG_DIR/commands/` / `projectSettings`: `.claude/commands/` / `plugin`: プラグインのコマンド |
| `prompt_id` / `permission_mode` | `UserPromptSubmit` 以降で自然に埋まる。`SessionStart` の stdin には無い |
| `is_interrupt` | `false` は `PostToolUseFailure` で埋まる。`true` は非対話では踏めない（未検証） |
| `effort_level` | effort に対応するモデル（`sonnet` など）で起動する。`haiku` では埋まらない（`../knowledge/claude-code-behavior.md`） |

MCP は `claude mcp add --transport http deepwiki https://mcp.deepwiki.com/mcp` で足せる（無認証で動く）。
非対話で使わせるには `settings.json` に `"enableAllProjectMcpServers": true` が要る。

秘匿値検査は、Bash に実際に `echo 'SENTINEL-<乱数>'` を実行させ、本物の `tool_input.command` に対しても
A7 の 6 対象で行う。

### B1. Claude Code が実際に hook を呼ぶ

**合格の条件** — `queue.jsonl` に、A3 と同じ形の行が増える。その実行で発生する hook が実際に
発火している。`claude -p` では `permission_mode` が `default` になる。

### B2. stdin の実形状が契約と合う

`verification/hook-behavior/capture_hook_stdin.py` で生の stdin を採取し、`contract.py` のキーパスと
突き合わせる。

**合格の条件** — `HOOK_FIELDS` のキーパスが実際の stdin に存在する。存在しないものは契約の誤りと
して記録する（コードは直さない）。発火しなかった hook は、B0 の方法で発火条件を踏んで再採取する。
契約が名指ししないキー（`last_assistant_message`・`agent_type`・`duration_ms`・`tool_use_id`・
`error` など）が stdin にあっても、収集されないのが正しい。

### B3. detach した送信が完走する

**合格の条件** — `claude -p` の終了後、数秒でサーバの `events` が同じ `session_id` で増える。
本人の `~/.claude` と開発ツリーが無変更のまま。

---

## フェーズ C（対話が要る）

対話が要るのは、画面としての見え方だけである。それ以外はフェーズ B で確かめられる。
自動更新の反映はこの手順で扱わない。背景の更新チェックに依存するため隔離 HOME では確かめられず、
実環境でしか確かめられない（`../knowledge/claude-code-behavior.md`）。

### C1. お知らせの見え方

1. `seen.json` を削除し、未読のお知らせがある状態にする
2. `notices.json` に日本語 600 字を超える項目を一時的に加える（検証後に戻す）
3. `claude` で対話セッションを開始し、表示を目視する

**確認すること** — 先頭に `SessionStart:<source> says: ` が付く。日本語 600 字程度が読める形で出る。
Claude Code がファイルへ退避する境界（日本語で約 680 字、ASCII で約 2,000 字）をまたぐ文面でも、
プレビューが実用的な長さで見える。複数件は空行 1 つで連結されて見える。

---

## 検証を難しくする Claude Code の挙動

- **プラグインの `hooks.json` の変更は cache を消さないと反映されない**（`directory` source でも）。
  `claude plugin uninstall` → cache 削除 → `claude plugin install` が要る
- **マーケットプレイスの remove → add で `plugins/data/` が空になる。**`queue.jsonl` などの状態が消える
- **`claude plugin marketplace add` は bare リポジトリを直接指せない。**http(s) の git URL が要る
  （`verification/autoupdate/githttpd.py`）
- **無人実行は初回起動の対話 3 段（テーマ選択・フォルダ信頼・API キー確認）で止まる。**
  `.claude.json` に `hasCompletedOnboarding` / `theme` / `projects["<cwd>"].hasTrustDialogAccepted`
  を事前投入すれば前の 2 段は越えられる。`<cwd>` は `realpath` で書く（macOS の `/tmp` は
  `/private/tmp` に解決される）。**API キー確認だけは pty へのキー送信が要る**

## 片付け

```bash
docker compose down          # server/ で
rm -rf "$CC_VERIFY_ROOT"
```

最後に `git -C ~/.claude status` が空のままであることを確認する。

採取した hook stdin には**プロンプト本文が入る。**git に入れず、社外に出さない。
