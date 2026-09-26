# 実機検証（E2E）の手順

`e2e/` の正本。実機検証は、モジュール（配布経路上の機能のまとまり）ごとに章を持つ。
テストは実装単体を検査するが、ここが見るのは「実際の導入経路で配置されたものが本物の
`claude` CLI 越しに動くか」である。合否の判定内容はテストの assert と docstring が正本であり、
ここには複写しない。

## モジュール一覧

| モジュール | テストファイル | 認証 | Docker | 対話 |
| --- | --- | --- | --- | --- |
| 導入 | `e2e/test_install.py` | 不要 | 不要 | 不要 |
| 設定の配布 | `e2e/test_settings.py` | 不要 | 不要 | 不要（手動確認は要る） |
| お知らせ | `e2e/test_notices.py` | 不要 | 不要 | 不要（手動確認は要る） |
| 収集 | `e2e/test_collect.py` | 必要 | 不要 | 不要 |
| 送信 | `e2e/test_send.py` | 不要 | 必要 | 不要 |
| 非漏洩 | `e2e/test_leak.py` | 必要 | 必要（陽性対照は不要） | 不要 |
| サーバ | `e2e/test_server.py` | 不要 | 必要 | 不要（手動確認は要る） |

## 実行方法

```bash
cd product/cc-governance-bmsd
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt  # 初回のみ
.venv/bin/python -m pytest e2e             # 全モジュール
.venv/bin/python -m pytest e2e -k install  # 導入だけ
```

`pytest.ini` の `testpaths` は `tests/` だけを向くため、`e2e` はパスを明示したときだけ集まる。
`tests/` と同時には指定しない（後述）。

## 前提

- `claude` が PATH にある。無いテストは自動的に skip される
- git 2.32 以上（隔離環境の `GIT_CONFIG_GLOBAL` 遮断に必要）
- 上記の `.venv`

## 認証

要認証のテスト（marker `requires_auth`）は、Claude Code の認証を環境変数で渡して実行する。無ければ黙って skip される。
Bedrock なら `CLAUDE_CODE_USE_BEDROCK=1` と `AWS_PROFILE`・`AWS_REGION` などの `AWS_*`（他の方式の例は `ANTHROPIC_API_KEY`）。
`/setup-bedrock` で設定した値は `~/.claude/settings.json` の `env` にあり、隔離した config には届かないので、同じ値を export する。
SSO なら先に `aws sso login` を済ませる（`awsAuthRefresh` も settings のキーなので届かない）。Bedrock での実行は未検証。
渡るのは `e2e/_auth.py` とプロキシ（`e2e/_root.py`）の許可リストの変数だけ。モデルは別名 `haiku`（effort の列だけ `sonnet`）で、
解決先は `ANTHROPIC_DEFAULT_HAIKU_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` で固定できる。

## 安全の約束

- **隔離は `CLAUDE_CONFIG_DIR` だけで行い、`HOME` は差し替えない。**macOS で `HOME` を差し替えると
  認証が壊れるため（`docs/knowledge/claude-code-behavior.md`）
- **本物の `~/.claude` に痕跡が無いことを確かめる。**`e2e/conftest.py` のセッション fixture が、
  終了時に本物の `settings.json` 等へ今回の隔離ルート名・git 配信のアドレス・statusline の目印が
  現れていないこと、開始時と終了時でこのプラグインの導入の有無が変わらないこと、`plugin/` 木が
  変わらないことを見て、違えばセッション全体を失敗させる。本物の値そのものは比べない
  （並行する本物の Claude Code が正当に書き換えるため）
- **`tests/` と同時に流さない。**`tests/conftest.py` は import 時に `HOME` を差し替え、隔離の前提を
  崩す。混在すると `e2e/conftest.py` が検出して終了する
- **`CC_E2E_KEEP=1` で隔離ルートを残せる。**失敗時の調査用。既定では片付けで消える

## 導入（モジュール 1）

git source のマーケットプレイスとして導入し、cache への複製・2 段階更新・`SessionStart` hook が
実配置から動くこと・`uninstall` の挙動を確かめる。`tests/` のモックでは、配布物が実際に
`claude plugin` 経由で解決され、hook が `installPath` 配下から呼ばれることまでは確認できない。

```bash
.venv/bin/python -m pytest e2e -k install
```

### 前提と罠

- http の git URL は末尾を `.git` にする。付けないと `marketplace add` は marketplace.json の URL と
  解釈して 404 になる（Claude Code 2.1.282 で観測）
- `claude plugin marketplace add` は bare リポジトリを直接指せないため、smart HTTP で配信する
- 導入が完了したことは `claude plugin marketplace add` と `claude plugin install` の明示実行で確認する
- 導入経路の判定に `installPath` は使えない。directory source でも `plugin list` の `installPath` は
  cache 配下を示すが、hook が動くのは元のディレクトリ
- 手動更新は 2 段階

いずれも詳細は `docs/knowledge/claude-code-behavior.md`。

### 実物でも確かめられない限界

配布経路は開発ツリーから組み立てたローカルの git リポジトリで代替しており、実在の配布リポジトリ
（社内 Bitbucket 等）への到達・認証は確かめない。Windows での実行は未検証。

## 手動確認の準備

認証と対話が要る確認は、テストが残した隔離ルートで行う。お知らせのテストのルートは、見本の
お知らせが未読のまま設定も適用済みなので、両モジュールの手動確認に使える。

```bash
CC_E2E_KEEP=1 .venv/bin/python -m pytest e2e -k 未読 -s   # 残したルートのパスが表示される（-s が無いと出ない）
cd <ルート>/project
env -i HOME="$HOME" USER="$USER" TERM="$TERM" PATH="$PATH" CLAUDE_CONFIG_DIR=<ルート>/config <認証の変数> claude   # 対話で起動し /login でログインする
```

- ログインは隔離した config ごとに 1 回要る（本人の認証は引き継がず、上書きもしない）
- 起動はルート内の空の `project/` から行う。リポジトリ内で起動すると、そのプロジェクトの hooks や CLAUDE.md が混ざる
- ログインは避け、認証は環境変数で渡す（「認証」の節）。macOS で `/login` すると、キーチェーンに config ごとの項目
  `Claude Code-credentials-<8 桁>` ができ、ルートを消しても残る。消すときは、末尾の 8 桁が消した config の項目だけを
  `security delete-generic-password -s 'Claude Code-credentials-<8 桁>'` で消す（8 桁の求め方は
  `docs/knowledge/claude-code-behavior.md`）。末尾の無い `Claude Code-credentials` は本人の認証なので消さない
- `url` 付きの項目は、`<ルート>/config/plugins/cache/` 配下の installPath にある `notices.json` に足す。
  git source では hook は cache から動く（`docs/knowledge/claude-code-behavior.md`）
- **この `claude` を、別の Claude Code セッションの中（Bash 等）から起動しない。**起動形態を示す環境変数
  （`CLAUDECODE` 等）を継承し、判定が汚れる。`env -i` で空の環境から起動し、基本の変数
  （`e2e/_root.py` の許可リスト）と認証の変数（「認証」の節）だけを渡す
- 終わったらルートを消す

## 設定の配布（モジュール 2）

`installPath` の `policy.py` が `SessionStart` で隔離した `settings.json` に当たり、Claude Code 本体の
書き込みと共存し、本体の記録に取り込まれること、`statusline.js` が `installPath` から配置されることを
確かめる。適用の規則そのもの（`SET` / `ADD` / `REMOVE` / `ONCE`・競合・パース失敗）は `tests/` が見る。

```bash
.venv/bin/python -m pytest e2e -k settings
```

### 手動確認項目

準備は「手動確認の準備」。

- **reapply**: 対話セッションを開いた後に `settings.json` の `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` を
  別の値に書き換え、`/governance:reapply` を実行する。合格: その項目が `applied`（書き込んだ）と報告され、
  `settings.json` の値が `policy.py` の値に戻る
- **設定が実際に効くか**: 対話セッションで `!echo $CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` を実行する
  （子プロセスが settings の `env` を受け継ぐことは `docs/knowledge/claude-code-behavior.md`）。
  合格: `policy.py` の値が出る

### 実物でも確かめられない限界

自動圧縮が実際に早く走るか（トークンを消費する長いセッションが要る）と、自動更新が実際に
新しい版を降ろすか（待ち時間が要る）は確かめない。プロジェクトや managed の設定による
上書きは確かめない（責務の外）。

## お知らせ（モジュール 3）

`installPath` の `notices.json` が `SessionStart` の `systemMessage` として Claude Code に渡り、
`claude -p` では既読にならず、無効化スイッチ（`CC_GOVERNANCE_DISABLE`）が hook まで届くことを確かめる。
本物の `notices.json` の中身に左右されないよう、`e2e/samples/notices.json` を組み立てたコピーに重ねる。

```bash
.venv/bin/python -m pytest e2e -k notices
```

### 手動確認項目

準備は「手動確認の準備」。`url` 付きの項目を足し、この順に行う（後の確認で既読になるため）。

1. **`-p` では開かない**: `CLAUDE_CONFIG_DIR=<ルート>/config claude -p ok` を実行する。
   合格: ブラウザが開かず、`<ルート>/config/plugins/data/` 配下に `seen.json` が無い
2. **対話での見え方**: 対話で起動する。合格: 題名・本文・`詳細: <url>` がそろって表示される
   （表示の接頭辞と長文の退避は `docs/knowledge/claude-code-behavior.md`）
3. **URL が開くか**: 2 と同じ起動で、既定ブラウザが先頭の有効な `url` を 1 回だけ開く。合格: 開いた
   タブが 1 つで、開き直した次のセッションではお知らせも表示されずブラウザも開かない

### 実物でも確かめられない限界

ブラウザ起動は OS に依存する観測であり、自動では確かめない。Windows と、VS Code 拡張など
`cli` 以外の対話起動での見え方は未検証。

## 収集（モジュール 4）

本物の Claude Code が `hooks.json` に登録した全 hook を呼び、`contract.py` の `HOOK_FIELDS` の各キーパスが
実際の stdin で全行を通して 1 つ以上埋まることを確かめる。上流でキーが改名されると列は無言で NULL に
なり、`tests/` の fixture（採取時点の stdin）では気づけない。入力は `e2e/samples/prompts.json`
（ユーザー設定のコマンドとスキル、`claude -p` 3 回分）で、期待値は installPath の `hooks.json` と
`contract.py` から導く。

```bash
.venv/bin/python -m pytest e2e -k collect
```

### 前提と罠

- ツールの失敗と `effort` の起こし方の制約は `docs/knowledge/claude-code-behavior.md`（`PostToolUseFailure` と
  `effort` の行）
- 期待するイベントは `hooks.json` から導くため、hook を登録から外すと期待も一緒に減る。外したことには、
  その hook でしか埋まらない列が NULL になることで気づく。他の hook と同じ列しか持たない hook
  （`UserPromptSubmit` など）の登録漏れは検出できない

### 実物でも確かめられない限界

モデルが指示どおりにツールを呼ぶことに依存する（手順を飛ばすと落ちる。再実行で区別する）。
対話起動でしか現れない値（`permission_mode` の `default` 以外、`is_interrupt` の真）は確かめない。

## 送信（モジュール 5）

切り離された送信プロセスが `claude` の終了後に実サーバ（モジュール 7 と同じ Docker の集計サーバ）へ
届けること、届かなかった分（誤トークンの 401・閉じたポート）が spool に残り、送信先を直した次の
セッションで届くことを確かめる。共有 DB なので判定は自分の `event_id` だけで行う。
誤トークンの 401 は error 行（`stage` が `send`）になって同じ経路で届き、概況の「hook の失敗」の表に出ることも見る。
ほかの段の error 行は起こさない（ほかのモジュールは error 行が 0 件であることだけを見る）。

```bash
.venv/bin/python -m pytest e2e -k send
```

### 前提と罠

- 送信は前回から 10 分以上経ったときだけ起動する（`docs/spec/plugin.md` の「蓄積と送信」）。
  テストは `sent_at` を消して次の送信を起こす。送信先は installPath の `config.json` を直接直す
- queue が空になることは送信完了の判定に使えない。未ログインでも `SessionStart` の後に発火する hook が
  退避の後に積む（`docs/knowledge/claude-code-behavior.md`）
- 送信プロセスの完了は、プラグインの data 配下が 2 秒変化しないことで判断する（OS に依存しない）。
  片付けも同じ待ちを経る。接続したまま応答しない送信先では完了と見分けられないため、組み立てる
  `config.json` の送信タイムアウトを 5 秒に縮めている

### 実物でも確かめられない限界

HTTPS・プロキシ越しの送信と、本番の受信先への到達は確かめない。

## 非漏洩（モジュール 6）

プロンプトと Bash の入出力に仕込んだ一意の `SENTINEL-<乱数>` が、送信まで通してもどこにも残らないことを
確かめる。

```bash
.venv/bin/python -m pytest e2e -k leak
```

| 対象 | 見方 |
| --- | --- |
| `queue.jsonl` / `spool/` | 送信前に隔離ルートごと走査する |
| 送信の生バイト | 送信プロセスは spool のファイルをそのまま POST する（`tests/` が確認）ので、送信前の queue の走査で代える |
| DB の全列と DB ファイル | コンテナの `/app/data` を `docker cp` で取り出し、バイト列を走査する（全列はバイト列に含まれる）。自分の `event_id` が見つかることで、走査が効いていることを先に確かめる |
| 隔離ルート全体 | `config/projects/`（Claude Code 本体の transcript）を除く。transcript に SENTINEL が在ることを、届いた証拠として先に確かめる |
| 本物の config | `~/.claude`（と起動時の `CLAUDE_CONFIG_DIR`）の全ファイル |

**陽性対照**: `contract.py` に `prompt` と `tool_input.command` のキーパスを足して組み立てた版では、同じ走査が
プラグインの data 配下で SENTINEL を検出する。サーバは契約に無い列を黙って捨てるため、陽性対照はサーバへ送らない。

### 実物でも確かめられない限界

探すのは ASCII の SENTINEL の完全一致だけで、変換（エスケープ・切り詰め）された断片は見ない。
サーバと Docker のログは走査しない。

## サーバ（モジュール 7）

集計サーバを本番に近い形（Docker イメージ・`entry.sh` による Secret ファイルの読み込みと契約の複製の
照合・waitress・`BASE_PATH` 付き）で起動し、実 TCP 越しに管理画面・受信・CSV 取込が届くこと、
契約の複製が正本と食い違うと起動しないことを確かめる。`server/tests` は Flask の `test_client()` で
インプロセスに検査しており、イメージ・`entry.sh`・WSGI サーバ・ソケットを通らない。
受信・取込・集計の中身は `server/tests` が見るので、ここでは繰り返さない。

```bash
.venv/bin/python -m pytest e2e -k server
```

### 前提と罠

- Docker のデーモンに繋がること。繋がらなければ skip される。ビルドには PyPI への到達が要る
- 前回の実行の片付け漏れ（ラベル `cc-e2e=1` のコンテナ・イメージ）が残っていると、テストは失敗して
  削除コマンドを表示する。自動では消さない
- ビルドのたびに Docker のビルドキャッシュが増える。テストは消さない（消す操作は他のイメージの
  キャッシュも巻き込む）。必要なら `docker builder prune` を手で実行する

### 手動確認項目

画面の見た目はブラウザが要るため自動化しない。見た目の規約は `docs/spec/dashboard-style.md`。

開発用のイメージとボリュームを壊さないよう、compose のプロジェクト名を分ける。開発用のサーバが
15000 番で動いていれば、先に `server/` で `docker compose stop` する。

1. `server/` で `docker compose -p ccgov-manual up -d --build` を実行し、
   `docker compose -p ccgov-manual cp ../e2e/samples/cost_daily.csv server:/app/data/csv/` で見本の CSV を入れる
2. `http://127.0.0.1:15000/dev-admin/` を開き（パスワードは `dev.env` の `ADMIN_PASSWORD`、ユーザー名は任意）、
   「CSV を取り込む」を押す
3. ブラウザの幅を 1280px にし、4 画面（`/dev-admin/`・`/dev-admin/policy`・`/dev-admin/effect`・
   `/dev-admin/assets`）を順に開く。合格: 開発者ツールのコンソールに error・warning が 0 件、
   コンソールで `document.documentElement.scrollWidth <= document.documentElement.clientWidth` が
   `true`、表のセルが切れていない。**スクリーンショットだけで判定しない**
   - 端末のデータを入れた場合、1 回目の起動だけでは未準拠に見えるのが正常（`docs/spec/server.md` の準拠の判定）
4. 終わったら `docker compose -p ccgov-manual down -v --rmi local` で、この確認のコンテナ・ボリューム・
   イメージだけを消す

### 実物でも確かめられない限界

DB は SQLite だけで、MySQL は確かめない。AIP の前段（Ingress のサブパスの扱い・HTTPS）、`/mnt/data` の
永続（再起動をまたいだデータの保持）、起動時の `pip install` がプロキシ越しに通るか、起動時間と
アイドル停止は、実行基盤でしか確かめられない。
