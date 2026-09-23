# ローカル実機検証の手順

配布したプラグインが利用者の端末で実際に動き、サーバへ届き、画面に出ることを確かめる。
あわせて、**自由文と秘匿値が送信も永続化もされないこと**を確かめる。

テストは実装単体を検査する。**この手順は「実際の導入経路で配置されたものが動くか」を見る。**
両者は別物で、テストが緑でもここが通るとは限らない。

## 原則

**本人の `~/.claude` を書き換えない。**隔離は `CLAUDE_CONFIG_DIR` で行う。
macOS で `HOME` を差し替えると Keychain の解決先が変わり、**認証が壊れる**（`Login successful` の
直後に `Not logged in` が出る）。`HOME` 差し替えを指示する手順書はこの OS では成立しない。

**生成物はすべて 1 つのルートに落とす。**片付けはそのルートを消すだけで済む形にする。
`$TMPDIR` に散らすと残骸が溜まり、次の検証の邪魔になる。

**緑は証拠にならない。**検査は、壊して落ちることを確かめて初めて効いていると言える。
「漏れなかった」で終わらせず、契約に危険なキーパスを足したコピーで実際に漏れることまで確かめる
（A7 参照）。hook は常に `exit 0` で終わり、失敗しても標準エラーに何も出さない。**着弾は
必ず別経路（サーバの DB・queue.jsonl の行数）で確かめ、hook の終了コードだけで判定しない。**

## 環境の作り方

```
CC_VERIFY_ROOT=<任意の作業ルート>          既定: $(mktemp -d /tmp/cc-e2e-XXXXXX)
  config/          ← CLAUDE_CONFIG_DIR。隔離された settings.json とプラグイン登録
  captured/        ← hook stdin の採取先
  csv/             ← CSV 取込の入力
  logs/            ← 実行ログ
```

```bash
export CC_VERIFY_ROOT=$(mktemp -d /tmp/cc-e2e-XXXXXX)
export CLAUDE_CONFIG_DIR="$CC_VERIFY_ROOT/config"
mkdir -p "$CLAUDE_CONFIG_DIR" "$CC_VERIFY_ROOT"/{captured,csv,logs}
```

`HOME` には触れない。`CLAUDE_CONFIG_DIR` だけで `settings.json` とプラグイン登録が隔離される。

サーバは `server/` で `docker compose up`。ホスト側ポートは **15000**（5000 は macOS の
AirPlay レシーバーが握る）。送信先は `http://127.0.0.1:15000/ingest`。
**本番の受信先に向けない。**

### プラグインのデータ領域は `CLAUDE_PLUGIN_DATA` を外から指定できない

外側で `export CLAUDE_PLUGIN_DATA=...` しても Claude Code は無視する。実際にプラグインが使う
データ領域は、Claude Code が自前で計算する

```
$CLAUDE_CONFIG_DIR/plugins/data/<plugin>-<marketplace>/
```

に固定される（例: `$CC_VERIFY_ROOT/config/plugins/data/governance-cc-marketplace-governance-bmsd/`）。
hook を手で実行するとき（A3）と `claude` に呼ばせるとき（フェーズ B）とで、**参照する状態
ディレクトリが別物になる。**都度このパスを計算し直す。

### `directory` source のマーケットプレイスはソースツリーを直接参照する

`extraKnownMarketplaces` の `source` を `"directory"` にすると、`CLAUDE_PLUGIN_ROOT` は
`plugins/cache/...` の複製ではなく、**`settings.json` に書いたディレクトリパスそのもの**を指す。
`plugins/cache/` 側を書き換えても hook の挙動には反映されない。

設定を変えて検証したいときは、**マーケットプレイスごと `$CC_VERIFY_ROOT` にコピー**してから
`settings.json` の `extraKnownMarketplaces` の path をそのコピー先に向ける。**開発リポジトリ
本体（`product/cc-governance-bmsd/` 直下）を直接指さない。**hook がそこへ書き込みうる。

git source（配布経路の実運用形態）での `CLAUDE_PLUGIN_ROOT` の解決先は本手順では確認していない。
**未検証**（`../docs/remaining/unverified.md` §6）。

## フェーズ

| | 内容 | 認証 |
| --- | --- | --- |
| **A** | 導入・収集・適用・送信・受信・画面・機密検査・検証スクリプト | 不要 |
| **B** | Claude Code が実際に hook を呼ぶこと、stdin の実形状 | 要（API キー） |
| **C** | お知らせの画面での見え方、自動更新の反映 | 要・**対話必須** |

---

## フェーズ A

### A1. サーバが起動し、全画面が応答する

```bash
cd server && docker compose up -d --build
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:15000/
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:15000/policy
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:15000/effect
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:15000/assets
docker compose logs
```

**合格の条件** — `/` `/policy` `/effect` `/assets` がいずれも `200`。データが 0 件の状態でも
`500` にならない。`docker compose logs` に例外が出ていない。

### A2. 隔離環境へプラグインを導入する

`CLAUDE_CONFIG_DIR` を隔離ルートに向けた状態で、配布リポジトリ（`product/
cc-marketplace-governance-bmsd/`、またはその隔離コピー）をローカルパスのマーケットプレイス
として登録し、`claude plugin install` で導入する。**`claude plugin` 系はログイン不要**であり、
API キーを要さない。

```bash
claude plugin marketplace add <配布リポジトリのパス>
claude plugin install governance@cc-marketplace-governance-bmsd
claude plugin list
```

**合格の条件** — `claude plugin list` に `governance` が `enabled` で現れ、`installPath` の実体が
存在する。本人の `~/.claude` に痕跡が 1 件も増えていない（`git -C ~/.claude status` が空のまま）。

### A3. hook が実配置から動く

**導入されたパス**（`installPath` 配下）の `hooks/collect.py` を、7 種の hook それぞれの stdin で
実行する。開発ツリーの `plugin/` ではなく**配布された実体**を使う。

```bash
INSTALL_PATH=$(claude plugin list --json | python3 -c '...')  # installPath を取り出す
CLAUDE_PLUGIN_DATA="$CLAUDE_CONFIG_DIR/plugins/data/governance-cc-marketplace-governance-bmsd" \
  python3 "$INSTALL_PATH/hooks/collect.py" SessionStart < fixture.json
```

fixture は `tests/fixtures/hook_inputs/` から使う。**ファイル名（`<epoch>-ev.json`）だけでは
hook の種類が分からない。**中身の `hook_event_name` で仕分ける。

**合格の条件** — 全 7 種が `exit 0`。`queue.jsonl` に行が増える。列が `contract.py` の
`HOOK_FIELDS` + `EXTRA_COLUMNS` と過不足なく一致する。破損 JSON・空入力・巨大入力（数十 MB）の
いずれでも `exit 0` で、`prompt` は収集対象外のため queue に混入しない。queue の全行が有効な
JSON Lines である。

### A4. 設定が自動適用される

隔離 `settings.json` に対して `session_start.py` を動かす。

**合格の条件**

- 1 回目: `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` が `"60"` に、
  `extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate` が `true` になる
  （`apply_result = applied`）
- **`settings.json` がそもそも存在しないときは、キーごとに結果が割れる。**
  `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` は `applied` になり `settings.json` が新規作成される
  （`env` の 1 段だけは無くても作ってよいという仕様どおり）。`extraKnownMarketplaces.*.autoUpdate`
  は入れ子の途中（`extraKnownMarketplaces.cc-marketplace-governance-bmsd`）が無いため
  `skipped_missing` になる。**両方が `applied` になるとは限らない**ことを合格条件に含める
- 2 回目: 前回と同じ値なら `already_ok`（ファイルの mtime が変わらない）
- 書き込み直前に他者が `settings.json` を書き換えた場合（`_write` を monkeypatch して
  mtime をずらす方法で再現できる）は `skipped_conflict` になり、ファイルは無傷
- 壊れた JSON を置いたときは `parse_failed` になり、ファイルは無傷

### A5. お知らせが出て、既読になる

**合格の条件** — 1 回目の `systemMessage` に `notices.json` の内容が入る。2 回目は出ない
（`seen.json` に記録される）。`CC_GOVERNANCE_DISABLE` を立てると出ず、**`seen.json` も
作られない**。`seen.json` を削除すると再表示される。未読が複数件のときは空行 1 つで連結される。

### A6. 端末からサーバへ届く

`config.json` の `ingest_url` を `http://127.0.0.1:15000/ingest`、`ingest_token` を `dev-token`
にする。

**合格の条件** — `/ingest` が `{"stored": N, "dropped": 0}` を返し、DB の `events` と
`policy_state` に行が入る（`events` + `policy_state` の件数が `stored` と一致する）。送信後に
`spool/` が空になる。**トークンを間違えると `401` で、スプールが残る**（データを失わない。実際に
試す）。送信先の URL が空のときは `rotate()` にすら到達せず即座に return し、キューの退避も
起きない。

detach を確かめる — hook プロセスの `PPID` が `1` になっていること、hook 自体は 1 秒未満で
終了し、送信は数秒後に別プロセスとして完了することを、プロセス監視かログのタイムスタンプ差分で
確認する。

### A7. 秘匿値が送信も永続化もされない（**最重要**）

`prompt` / `tool_response` / `message` / `tool_input.command` / `tool_input.description` に
`SENTINEL-<乱数>` と、API キー風の文字列（例: `sk-` に続く英数字）を仕込んだ stdin を A3 の
手順で流す。

**走査する 6 対象**

1. `queue.jsonl`（隔離ルート内）
2. 送信の生バイト（`_sender.py` が実際に POST するペイロード。`/ingest` の手前でキャプチャする
   か、サーバ側のアクセスログで見る）
3. DB の全列（`events` / `policy_state` の全カラムを `SELECT *` で舐める）
4. DB のバイト列（テキストとしてではなく `sqlite3` のファイルをバイト列としてスキャンする。
   コンテナに `sqlite3` CLI は無いため `docker exec ... python3 -c "import sqlite3; ..."` で確認する）
5. `$CC_VERIFY_ROOT` 全体（`grep -r` で SENTINEL 文字列を検索する）
6. `~/.claude`（本人の環境。無傷であることの確認を兼ねる）

**合格の条件** — 仕込んだ値が上記 6 対象のいずれからも 1 件も出てこない。

**「漏れなかった」で終わらせない。**契約のキーパスのコピーに、`prompt` など危険なキーパスを
2〜3 本追加した版を用意し、同じ手順で**実際に漏れることを確認する。**これにより、許可リストが
単なる気休めではなく実効的なゲートであることを示す。このコピーは検証専用であり、実装
（`plugin/hooks/contract.py`）には反映しない。

**あわせて確認する留保点** — `_sender.py` は `ingest_url` のスキームを検査しない。`http://` を
設定すると `X-Ingest-Token`・`user_email`・`host` が平文で流れることを、生のリクエストで確認
できる。事実として記録する（`../docs/SPEC-plugin.md` §5.3）。**コードは直さない。**

### A8. CSV が取り込まれる

**環境の落とし穴**

- **`CSV_DIR` はホストから直接触れない。**`compose.yaml` は named volume（`dev_data`）を
  `/app/data` にマウントしており、bind mount ではない。ホストに CSV を置いても `/import` は
  拾わない。`docker cp <csv> server-server-1:/app/data/csv/` で入れる
- **`docker exec` は `entry.sh` がロードした環境変数を引き継がない。**`set -a; . $SECRET_FILE`
  は PID 1 の中だけで効く。`CSV_DIR` の実際の値を確認したいときは、実際に動いている
  `waitress-serve` プロセスの `/proc/<pid>/environ` を見る
- **コンテナに `sqlite3` CLI が無い。**DB の確認は `docker exec ... python3 -c "import sqlite3; ..."`
  で行う

```bash
docker cp sample.csv server-server-1:/app/data/csv/
curl -X POST http://127.0.0.1:15000/import
```

**合格の条件** — `cost_daily` に行が入る。同じファイルを 2 回取り込んでも件数が増えない
（`day` 単位で DELETE→INSERT）。`Date` 列は `YYYY-MM-DD` と `YYYY/M/D` の両方を受理する。壊れた
行は破棄され、破棄件数が結果に出る。必須列が欠けたファイルは**そのファイルだけ失敗し、他の
ファイルは取り込みを続行する**。未知の列は無視される。UTF-8 BOM 付き・CRLF のファイルを受理
する。取込後も 4 画面が `200` のままであること（中途半端なデータでも 500 にならない）。

### A9. 画面にデータが出る

A6・A8 でデータを入れた状態で 4 画面を見る。**準拠率と突合率は、この時点ではまだ正しく読めない
ことがある。**A9 を単独で見る前に、下記の「準拠と突合の読み方」を先に確認する。

**準拠の判定は `prev_value` で行う。**「セッションを開いた時点で、既にポリシー値と一致して
いたこと」が準拠の定義である。初回適用時は `prev_value` が NULL か別の値のため、**必ず
未準拠として記録される。**1 回だけ動かして「適用されたのに準拠率が 0% だ」と不具合視しない。
**検証では同じ端末を 2 回以上動かし、2 回目（`already_ok`）で準拠に転じることを確認する。**

**準拠率の分母は AI Gateway の CSV である。**CSV の `User Email` に居ない利用者は、端末側で
正しく適用されていても準拠率の計算から外れ、突合率ごと 0% に見える。**突合率を先に見る。**
検証データを作るときは、CSV の `User Email` と端末の `user_email` を一致させる。端末側は
環境変数 `CC_GOVERNANCE_USER_EMAIL` で上書きできる。

**合格の条件** — 投入したデータが 4 画面に反映される。**スクリーンショットだけで判定しない。**
1280px 幅でブラウザのコンソール error/warning が 0 件、`scrollWidth > clientWidth` になっている
表が無いこと、セルが切れていないこと、ネットワーク失敗が 0 件であることを機械検査で確認する。
768px 以下では `/policy` の表が数 px はみ出すことがある（長いキー名の表にラッパーが無いための
設計上の限界で、SPEC にレスポンシブ要件の記載も無い。不合格としない）。

### A10. verification のスクリプトが動く

`verification/` の各スクリプトを、**README の手順どおりに**動かす。目的は「他の開発担当者が
読んで使えるか」の確認。

**合格の条件** — 手順どおりに動く。動かないもの・前提が書かれていないものは README に反映する。

---

## フェーズ B（API キーが要る）

### B0. 契約列を埋めるためのプロンプト設計

`claude -p` の非対話実行だけで、契約列のほぼ全てに実データを入れられる。列ごとに、
どういうプロンプト・起動方法を与えれば埋まるかを示す。

| 列 | 埋め方 |
| --- | --- |
| `tool_name` | Read・Bash・Glob・Grep・Write など、ツールを使わせるプロンプトを与える。MCP 経由も対象（下記 MCP 節） |
| `skill_name` | 検証用の自作スキルを 1 つ用意し、それを呼ばせるプロンプトを与える |
| `agent_id` | `Task` でサブエージェントを起動させるプロンプトを与える。**値が付くのはサブエージェント自身のツール呼出だけ**であり、親側の `Task` 呼出そのものには付かない |
| `command_name` / `command_source` | 下記「`command_source` の 3 種」参照 |
| `source` | 下記「`source` の 4 種」参照 |
| `compact_trigger` | 下記「`compact_trigger` の両経路」参照 |
| `prompt_id` / `permission_mode` | `UserPromptSubmit` 以降の hook では自然に埋まる。**`SessionStart` の stdin には無い** |
| `is_interrupt` | `false` は `PostToolUseFailure` の通常経路で埋まる。`true` は対話でユーザーが中断した場合と推測されるが**非対話では踏めない（未検証）** |
| `effort_level` | 下記「`effort_level` は非対話では付かない」参照 |

実データに対する秘匿値検査は、Bash に実際に `echo 'SENTINEL-<乱数>'` を実行させ、
`tool_input.command` に本物のコマンド文字列が入った状態で行う（詳細は A7 の 6 対象に同じ）。
これにより、合成フィクスチャではなく実際に流れた `tool_input` に対して許可リストが効いている
ことを確認できる。

#### `source` の 4 種

`SessionStart` の `source` は次の起動方法にそれぞれ対応する。

| `source` | 出し方 |
| --- | --- |
| `startup` | 通常の起動（`claude -p "..."` / `claude`） |
| `resume` | `claude --resume <session_id>`、または `claude -c` |
| `clear` | 対話セッション内で `/clear` |
| `compact` | 圧縮の発生時（次項参照） |

#### `compact_trigger` の両経路

| `compact_trigger` | 出し方 |
| --- | --- |
| `manual` | 対話セッション内で `/compact` |
| `auto` | `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` を低い値（例: 数 %）に下げて起動し、少量のやりとりだけで
自動圧縮の閾値を超えさせる |

#### `command_source` の 3 種

`UserPromptExpansion` の `command_source` はスラッシュコマンドの定義元で決まる。

| `command_source` | 出し方 |
| --- | --- |
| `userSettings` | `~/.claude/commands/`（隔離環境では `$CLAUDE_CONFIG_DIR/commands/`）にコマンドを置き、それを呼ぶ |
| `projectSettings` | プロジェクト直下の `.claude/commands/` にコマンドを置き、それを呼ぶ |
| `plugin` | プラグインが `commands/` で配るスラッシュコマンドを呼ぶ |

#### `effort_level` は非対話では付かない

`claude -p` では、モデル（haiku / sonnet）・`--effort low,high,xhigh` フラグ・「よく考えて」
のような思考を促すプロンプトのいずれを試しても、**stdin に `effort` キー自体が一度も現れない。**
対話モードでの挙動は、自動操作が初回オンボーディングの対話ダイアログを突破できず未確認である
（3 回試行で打ち切り）。**契約の誤りとは断定できない**（`../docs/remaining/unverified.md` §6）。

#### MCP の設定方法

```bash
CLAUDE_CONFIG_DIR="$CC_VERIFY_ROOT/config" claude mcp add --transport http deepwiki https://mcp.deepwiki.com/mcp
```

`.claude.json`（`$CLAUDE_CONFIG_DIR/.claude.json`）の `projects["<cwd>"].mcpServers` に書かれる
（`.mcp.json` ではなく、cwd 単位である）。**非対話 `-p` で MCP を使わせるには、`settings.json` に
`"enableAllProjectMcpServers": true` が要る。**`deepwiki`（`https://mcp.deepwiki.com/mcp`）は
無認証で動作確認できた。MCP 経由のツール呼出は `tool_name` が `mcp__<server>__<tool>` の形で
入る。

#### `systemMessage` の観測方法

`systemMessage`（お知らせの出力）は `claude -p` の出力形式によって見え方が変わる。

| 出力形式 | 見えるか |
| --- | --- |
| `claude -p`（プレーン） | 出ない |
| `--output-format json` | 含まれない |
| `--output-format stream-json --verbose` | **出る**（`type:"system", subtype:"hook_response"` の `output` / `stdout`） |

**`-p` で `stream-json` を使うには `--verbose` が必須**（無いとエラーになる）。日本語 200 字・
ASCII 10000 字の文面を通しても、Claude Code 側の追加切り詰めは確認できなかった。**実際の
画面での見え方と退避境界（フェーズ C の対象）は、この方法だけでは確認できず対話が要る。**

### B1. Claude Code が実際に hook を呼ぶ

隔離環境で `claude -p` を短いプロンプトで数回実行する。モデルは haiku。

**合格の条件** — `queue.jsonl` に、A3 で手動実行したときと同じ形の行が増える。`hooks.json` に
登録した 7 種のうち、その実行で発生するものが実際に発火している。**非対話モード（`claude -p`）
では `permission_mode` が `default`、`effort_level` は `None` になる**（対話モードや別モデルでの
挙動は未検証。`../docs/remaining/unverified.md` §6）。

### B2. stdin の実形状が契約と合う

`hook-behavior/capture_hook_stdin.py` を `settings.json` の hooks に仕込んで生の stdin を採取し、
`contract.py` のキーパスと突き合わせる（登録方法は `README.md` 参照）。

**合格の条件** — `HOOK_FIELDS` のキーパスが実際の stdin に存在する。存在しないキーパスが
あれば、それは契約の誤りとして記録する（コードは直さない）。実際の `Stop` hook の stdin には
`background_tasks` / `cwd` / `hook_event_name` / `last_assistant_message` / `permission_mode` /
`prompt_id` / `session_crons` / `session_id` / `stop_hook_active` / `transcript_path` が含まれる。
`last_assistant_message` は AI の応答本文そのものであり、契約が名指ししていないため収集され
ない。**この実 stdin には `effort` キー自体が無い**（合成フィクスチャには入っていたため、契約の
誤りではないかを別途確認する。`../docs/remaining/unverified.md` §6）。

未発火に終わった hook（`PostToolUse` / `PostToolUseFailure` / `PreCompact` /
`UserPromptExpansion`）は、プロンプトが発火条件を踏まなかっただけであり契約の欠陥ではない。
ツール呼出・ツール失敗・圧縮・スラッシュコマンドを伴うプロンプトで再採取する（B0 参照）。

B0 の手順で再採取した結果、契約が名指ししないキーが複数の hook で観測されている。
**契約に無いキー**: `agent_type`（サブエージェントの種別）/ `duration_ms`（ツール実行時間）/
`tool_use_id` / `error`（`PostToolUseFailure` は `tool_response` の代わりに `error` を持つ）/
`expansion_type`（`slash_command`）/ `command_args` / `custom_instructions` /
`seconds_since_last_response` / `prompt_cache_likely_expired` / `estimated_cache_write_usd` /
`model`（`source=compact` のとき）。`PreCompact` には `permission_mode` が無い。
いずれも契約が名指ししていないため収集されない（意図設計。バグではない）。

### B3. detach した送信が完走する

`claude` のプロセスが終わったあとも送信が完了することを、サーバ側の `events` 件数の増加と
`session_id` の一致で確かめる。

**合格の条件** — `claude -p` 終了後、数秒でサーバ側の行数が増える。本人の `~/.claude` と
開発リポジトリ本体が無変更のままであること。

---

## フェーズ C（対話が要る）

**対話が必要な範囲は当初の想定より狭い。**契約列の充足・`systemMessage` の内容そのもの・
秘匿値検査・detach 送信は、フェーズ B（非対話）だけで確認できる（B0〜B3）。対話セッションが
必須なのは、**画面としての見え方**（お知らせの表示形式・退避後のプレビューの実用性）と、
**初回オンボーディングの対話ダイアログを経る経路の挙動**（`effort_level` の対話モードでの
有無を含む）の 2 点に絞られる。

### C1. お知らせの見え方

隔離環境（`CLAUDE_CONFIG_DIR` を向けたまま）で対話セッションを開き、`systemMessage` が画面に
どう出るかを見る。手順:

1. `seen.json` を削除し、未読のお知らせが少なくとも 1 件ある状態にする
2. `notices.json` に日本語で 600 字を超える長文の項目を一時的に加える（検証後に戻す）
3. `CLAUDE_CONFIG_DIR="$CC_VERIFY_ROOT/config" claude` で対話セッションを開始する
4. 表示を目視する — 先頭に `SessionStart:<source> says: ` の接頭辞が付くこと、長文がその場に
   出るか、Claude Code 側でファイルへ退避されプレビューだけが出るかを確認する
5. 未読が複数件のときに空行 1 つで連結されて見えることを確認する

**確認すること** — 日本語 600 字程度のお知らせが読める形で表示されること。退避が始まる境界
（日本語で約 680 字、ASCII で約 2,000 字。`../docs/knowledge/claude-code-behavior.md`）をまたぐ
文面で、退避後のプレビューが実用的な長さで見えること。

### C2. 自動更新の反映

`verification/autoupdate/` の擬似マーケットプレイスを使う（手順は `README.md` の
`autoupdate/` 節）。

1. `autoupdate/marketplaces/au-verify/` の bare リポジトリから作業コピーを clone する
2. 隔離 HOME（`home-<n>/`）の `.claude/plugins/marketplaces/` にそのコピーを置き、
   `.claude/settings.json` の `extraKnownMarketplaces` にも同じ名前を登録する
3. `run.sh` で隔離 HOME の `claude` を起動し、一度終了する
4. 作業コピー側でプラグインのバージョンを上げてコミットし、bare へ `git push` する
5. 隔離 HOME で `claude` を再度起動し、しばらく待ってから `snap.sh` でマーケットプレイスの
   HEAD・`plugin.json` のバージョン・`installed_plugins.json` を確認する
6. 新しいバージョンが降りるまでの時間を記録する

**確認すること** — 新しいバージョンが端末に降り、以後の hook 実行に反映されること。反映までの
時間は環境によって変わりうるため、**固定値として扱わない**（1 回だけの観測が
`../docs/knowledge/claude-code-behavior.md` にある）。

---

## 検証を難しくする Claude Code の挙動

実装の不具合ではなく、**Claude Code 自身の挙動が検証をやり直しにくくする**ケースがある。
遭遇したら疑ってよい。

- **`extraKnownMarketplaces` の `source` が `"directory"` のとき、マーケットプレイスの
  cache（`plugins/cache/...`）ではなく `settings.json` に書いたディレクトリパスそのものが
  `CLAUDE_PLUGIN_ROOT` になる。**cache 側を書き換えても hook の挙動に反映されない。設定を
  変えて検証したいときは、**マーケットプレイスごと検証ルートにコピー**してから
  `settings.json` の path をそのコピー先に向ける（開発リポジトリ本体を直接指さない）
- **プラグインの `hooks.json` の変更は cache を消さないと反映されない**（`directory` source
  でも）。`claude plugin uninstall` → cache 削除 → `claude plugin install` のフルサイクルが要る
- **マーケットプレイスの remove → add で `plugins/data/` が空になる。**`queue.jsonl` 等の
  既存状態が失われるため、設定をやり直すときは状態の消失を織り込む
- **`claude plugin marketplace add` は bare リポジトリを直接指せない。**http(s) の git URL が
  要り、`verification/autoupdate/githttpd.py` のような HTTP サーバを自前で立てる必要がある
- **無人実行は初回起動の対話ダイアログ 3 段（テーマ選択・フォルダ信頼・API キー確認）で
  止まる。**`.claude.json` への事前投入である程度突破できるが、**API キー確認の段だけは
  pty へのキー送信が必須**であり、ファイルの事前投入では突破できない

## 片付け

```bash
docker compose down          # server/ で
rm -rf "$CC_VERIFY_ROOT"
```

**本人の `~/.claude` は触っていないので戻す作業は無い。**
`git -C ~/.claude status` が空のままであることを最後に確認する。

## 記録

実行結果は `$CC_VERIFY_ROOT/logs/` に残る。**git に入れない。**
採取した hook stdin には**プロンプト本文が入る**ので、社外に出さない。
