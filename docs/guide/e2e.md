# 実機検証（E2E）の手順

`e2e/` の正本。実機検証は、モジュール（配布経路上の機能のまとまり）ごとに章を持つ。
テストは実装単体を検査するが、ここが見るのは「実際の導入経路で配置されたものが本物の
`claude` CLI 越しに動くか」である。合否の判定内容はテストの assert と docstring が正本であり、
ここには複写しない。

## モジュール一覧

| モジュール | テストファイル | 実行の指定（`pytest` の引数） | 認証 | Docker |
| --- | --- | --- | --- | --- |
| 導入 | `e2e/test_install.py` | `e2e/test_install.py` | 不要 | 不要 |
| 設定の配布 | `e2e/test_settings.py` | `e2e -k settings` | 不要 | 不要 |
| お知らせ | `e2e/test_notices.py` | `e2e -k notices` | 不要 | 不要 |
| 収集 | `e2e/test_collect.py` | `e2e -k collect` | 必要 | 不要 |
| 送信 | `e2e/test_send.py` | `e2e -k send` | 不要 | 必要 |
| 非漏洩 | `e2e/test_leak.py` | `e2e -k leak` | 必要 | 必要（陽性対照は不要） |
| サーバ | `e2e/test_server.py` | `e2e -k server` | 不要 | 必要 |

## 実行方法

```bash
# リポジトリのルートで
.venv/bin/python -m pytest e2e                      # 全モジュール
.venv/bin/python -m pytest e2e/test_install.py      # 導入だけ（ほかは一覧の「実行の指定」）
```

## 前提

- `claude` が PATH にある。無いテストは自動的に skip される
- git 2.32 以上（隔離環境の `GIT_CONFIG_GLOBAL` 遮断に必要）
- `CLAUDE.md` の Commands の `.venv`

## 認証

要認証のテスト（marker `requires_auth`）は、Claude Code の認証を環境変数で渡して実行する。無ければ理由付きで skip される。
Bedrock なら `CLAUDE_CODE_USE_BEDROCK=1` と `AWS_PROFILE`・`AWS_REGION` などの `AWS_*`（他の方式の例は `ANTHROPIC_API_KEY`・`CLAUDE_CODE_OAUTH_TOKEN`）。
`/setup-bedrock` で設定した値は `~/.claude/settings.json` の `env` にあり、隔離した config には届かないので、同じ値を export する。
SSO なら先に `aws sso login` を済ませる（`awsAuthRefresh` も settings のキーなので届かない）。
渡るのは `e2e/_auth.py` と、基本の変数とプロキシ（`e2e/_root.py`）の許可リストの変数だけ。
Bedrock では、組織で有効なモデル ID への固定（`ANTHROPIC_DEFAULT_HAIKU_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL`）が要りうる。

## 安全の約束

- **隔離は `CLAUDE_CONFIG_DIR` だけで行い、`HOME` は差し替えない。**macOS で `HOME` を差し替えると
  認証が壊れるため（`docs/knowledge/claude-code-behavior.md`）
- **本物の `~/.claude` に痕跡が無いことを確かめる。**`e2e/conftest.py` が本物の `~/.claude` の痕跡と
  `plugin/` 木の変化を見て、違えばセッション全体を失敗させる
- **`tests/` と同時に流さない。**`tests/conftest.py` は import 時に `HOME` を差し替え、隔離の前提を
  崩す。混在すると `e2e/conftest.py` が検出して終了する
- **本体の自動更新は `--settings` で止める。**配る設定が隔離した `settings.json` の `env` で自動更新を有効にし、環境変数の
  `DISABLE_AUTOUPDATER` に勝つ。native 版の更新先は `HOME` の下で隔離の外なので、`e2e/_root.py` の `run_claude` が
  上位の層の `--settings` で無効にする。手動確認で起動するときも同じ `--settings` を付ける
- **E2E の外で `plugin/` を複製して hook を直接起動するときは、複製の送信先を空かローカルにする。**開発ツリーの
  `config.json` の `ingest_url`・`ingest_token` は本番の値であり、そのまま起動すると本番へ送りうる。
  `e2e/_market.py` の `publish` を通した組み立ては送信先を空にする。直接起動では、状態の置き場の `sent_at` の
  mtime で送信プロセスを起動させるかを制御する（`plugin/hooks/_spool.py` の `should_send`）
- **`CC_E2E_KEEP=1` で隔離ルートを残せる。**失敗時の調査用。既定では片付けで消える
- **並行して多く起動すると偽の赤になりうる。**同じ Mac で `claude` を一斉に多数起動すると、
  `SessionStart` の hook が `hooks.json` の `SessionStart` の `timeout` に間に合わず打ち切られ
  （`outcome: cancelled`）、設定の適用や policy 行が抜けうる。`e2e/_flow.py` の `session()` は、打ち切られた回を
  「SessionStart の hook が打ち切られた」と名指しして落とす（その回は判定できない）。本数の目安は `docs/knowledge/measurements.md` の
  「一斉起動と `SessionStart` の打ち切り」にあり、その値は測った時の `timeout` に依存する。
  複数の E2E を並行させるときは、起動をずらすか本数を絞る。送信の完了待ち（`wait_quiet`）が前提と
  する静止時間（`_QUIET_SEC`）も、高負荷で崩れて偽の赤になるかは未検証

## 導入（モジュール 1）

git source のマーケットプレイスとして導入し、cache への複製・2 段階更新・`SessionStart` hook が
実配置から動くこと・`uninstall` の挙動を確かめる。`tests/` のモックでは、配布物が実際に
`claude plugin` 経由で解決され、hook が `installPath` 配下から呼ばれることまでは確認できない。

### 実物でも確かめられない限界

配布経路は開発ツリーから組み立てたローカルの git リポジトリで代替しており、実在の配布リポジトリ
（社内 Bitbucket 等）への到達・認証は確かめない。組み立てでは `config.json` の `ingest_url`・`ingest_token` を
空に差し替えるので、開発ツリーにある本番の送信先は通らない（送信のモジュールはローカルの集計サーバへ向け直す）。

## 手動確認の準備

認証と対話が要る確認は、テストが残した隔離ルートで行う。お知らせのテストのルートは、見本の
お知らせが未読のまま設定も適用済みなので、両モジュールの手動確認に使える。

```bash
CC_E2E_KEEP=1 .venv/bin/python -m pytest e2e -k 未読 -s   # 残したルートのパスが表示される（-s が無いと出ない）
cd <ルート>/project
env -i HOME="$HOME" USER="$USER" TERM="$TERM" PATH="$PATH" CLAUDE_CONFIG_DIR=<ルート>/config <認証の変数> claude --settings '{"env":{"DISABLE_AUTOUPDATER":"1"}}'   # 対話で起動する（認証は環境変数で渡し、/login しない）
```

- 起動はルート内の空の `project/` から行う。リポジトリ内で起動すると、そのプロジェクトの hooks や CLAUDE.md が混ざる
- ログインは避け、認証は環境変数で渡す（「認証」の節）。macOS で `/login` すると、キーチェーンに config ごとの項目
  `Claude Code-credentials-<8 桁>` ができ、ルートを消しても残る。消すときは、末尾の 8 桁が消した config の項目だけを
  `security delete-generic-password -s 'Claude Code-credentials-<8 桁>'` で消す（8 桁の求め方は
  `docs/knowledge/claude-code-behavior.md`）。末尾の無い `Claude Code-credentials` は本人の認証なので消さない
- `url` 付きの項目は、`<ルート>/config/plugins/cache/` 配下の installPath にある `notices.json` に足す。
  git source では hook は cache から動く（`docs/knowledge/claude-code-behavior.md`）
- **この `claude` を、別の Claude Code セッションの中（Bash 等）から起動しない。**起動形態を示す環境変数
  （`CLAUDECODE` 等）を継承し、判定が汚れる。`env -i` で空の環境から起動し、コマンドの最低限の変数と
  認証の変数（「認証」の節）だけを渡す。プロキシ環境では、`e2e/_root.py` の許可リストのプロキシ系の変数も渡す
- 終わったらルートを消す

## 設定の配布（モジュール 2）

`installPath` の `policy.py` が `SessionStart` で隔離した `settings.json` に当たり、Claude Code 本体の
書き込みと共存し、本体の記録に取り込まれること、`statusline.js` が `installPath` から配置されることを
確かめる。適用の規則そのもの（`SET` / `ADD` / `REMOVE` / `ONCE`・競合・パース失敗）は `tests/` が見る。

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
上書きは確かめない（責務の外）。`ONCE` の値が実配置で書かれたかは確かめない（`SET`・`ADD`・`REMOVE` は
`settings.json` の中身で判定する）。

## お知らせ（モジュール 3）

`installPath` の `notices.json` が `SessionStart` の `systemMessage` として Claude Code に渡り、
`claude -p` では既読にならず、無効化スイッチ（`CC_GOVERNANCE_DISABLE`）が hook まで届くことを確かめる。
本物の `notices.json` の中身に左右されないよう、`e2e/samples/notices.json` を組み立てたコピーに重ねる。

### 手動確認項目

準備は「手動確認の準備」。`url` 付きの項目を足し、この順に行う（後の確認で既読になるため）。

1. **`-p` では開かない**: 「手動確認の準備」と同じ起動のしかた（`env -i`・`--settings`・空の `project/`）で、`claude` に `-p ok` を付けて実行する。
   合格: ブラウザが開かず、`<ルート>/config/plugins/data/` 配下に `seen.json` が無い
2. **対話での見え方**: 対話で起動する。合格: 題名・本文・`詳細: <url>` がそろって表示される
   （表示の接頭辞と長文の退避は `docs/knowledge/claude-code-behavior.md`）
3. **URL が開くか**: 2 と同じ起動で、既定ブラウザが先頭の有効な `url` を 1 回だけ開く。合格: 開いた
   タブが 1 つで、開き直した次のセッションではお知らせも表示されずブラウザも開かない

### 実物でも確かめられない限界

ブラウザ起動は OS に依存する観測であり、自動では確かめない。

## 収集（モジュール 4）

本物の Claude Code が `hooks.json` に登録した全 hook を呼び、`contract.py` の `HOOK_FIELDS` の各キーパスが
実際の stdin で全行を通して 1 つ以上埋まることを確かめる。上流でキーが改名されると列は無言で NULL に
なり、`tests/` の fixture（採取時点の stdin）では気づけない。
transcript を読む hook（`collect.py` の `_TRANSCRIPT_HOOK_EVENTS`）の行では、transcript から埋める `EXTRA_COLUMNS` の列も同じく確かめる（transcript の行の形は公式の契約ではない）。

### 実物でも確かめられない限界

モデルが指示どおりにツールを呼ぶことに依存する（手順を飛ばすと落ちる。再実行で区別する）。
対話起動でしか現れない値（`is_interrupt` の真）は確かめない。`permission_mode` の `default` 以外は確かめない（既定のまま起動する）。
期待するイベントは `hooks.json` から導くため、hook を登録から外すと期待も一緒に減る。外したことには、
その hook でしか埋まらない列が NULL になることで気づく。他の hook と同じ列しか持たない hook
（`UserPromptSubmit` など）の登録漏れは検出できない。

## 送信（モジュール 5）

切り離された送信プロセスが `claude` の終了後に実サーバ（サーバのモジュールと同じ Docker の集計サーバ）へ
届けること、届かなかった分（誤トークンの 401・閉じたポート）が spool に残り、送信先を直した次の
セッションで届くことを確かめる。
誤トークンの 401 は error 行（`stage` が `send`）になって同じ経路で届き、収集の状態の「プラグインのエラー」に出ることも見る。

### 実物でも確かめられない限界

HTTPS・プロキシ越しの送信と、本番の受信先への到達は確かめない。

## 非漏洩（モジュール 6）

プロンプトと Bash の入出力に仕込んだ一意の `SENTINEL-<乱数>` が、送信まで通してもどこにも残らないことを
確かめる。

### 実物でも確かめられない限界

探すのは ASCII の SENTINEL の完全一致だけで、変換（エスケープ・切り詰め）された断片は見ない。
サーバと Docker のログは走査しない。送信の生バイトは見ず、送信プロセスが spool をそのまま POST する（`tests/` が確認）ことから、送信前の queue の走査で代える。

## サーバ（モジュール 7）

集計サーバを本番に近い形（Docker イメージ・`entry.sh` による Secret ファイルの読み込みと契約の複製の
照合・waitress・`BASE_PATH` 付き）で起動し、実 TCP 越しに管理画面・受信・CSV 取込が届くこと、
契約の複製が記録したハッシュと食い違う（直接編集された）と起動しないことを確かめる。`server/tests` は Flask の `test_client()` で
インプロセスに検査しており、イメージ・`entry.sh`・WSGI サーバ・ソケットを通らない。
受信・取込・集計の中身は `server/tests` が見るので、ここでは繰り返さない。

### 前提と罠

- Docker のデーモンに繋がること。繋がらなければ skip される。ビルドには PyPI への到達が要る
- コンテナ・イメージのラベルは `cc-e2e=<CC_E2E_RUN>`。同じ Docker で
  サーバのモジュールを並行して走らせるときは、実行ごとに異なる `CC_E2E_RUN` を付け、片付け漏れの
  検査が他の実行の資源と混ざらないようにする。`CC_E2E_RUN` は隔離ルートの名前（`cc-e2e-<CC_E2E_RUN>-`）にも付く
- 前回の実行の片付け漏れ（このラベルのコンテナ・イメージ）が残っていると、テストは失敗して
  削除コマンドを表示する。自動では消さない
- ビルドのたびに Docker のビルドキャッシュが増える。テストは消さない（消す操作は他のイメージの
  キャッシュも巻き込む）。必要なら `docker builder prune` を手で実行する

### 手動確認項目

画面の見た目はブラウザが要るため自動化しない。見た目の規約は `docs/spec/design-system.md`。

開発用のイメージとボリュームを壊さないよう、compose のプロジェクト名を分ける。開発用のサーバが
動いていれば、先に `server/` で `docker compose stop` する。

1. `server/` で `docker compose -p ccgov-manual up -d --build` を実行する
   - 全ての表を埋めて見るときは、`DB_DSN=sqlite:///<ローカルのファイル>` で `scripts/seed_dashboard.py` を流して作った DB を
     `docker compose -p ccgov-manual cp <ローカルのファイル> server:<パス>`（`<パス>` は `server/dev.env` の SQLite の `DB_DSN` のパス）で入れ、2 の取込はしない
2. `http://127.0.0.1:<ポート>/<ADMIN_PATH>/`（`<ポート>` は `server/compose.yaml` の `ports` のホスト側、`<ADMIN_PATH>` は `server/dev.env` の `ADMIN_PATH`）を開き（パスワードは `dev.env` の `ADMIN_PASSWORD`、ユーザー名は任意）、
   見出し帯の右端の「データと設定」の「取り込む」で見本の CSV（`e2e/samples/cost_daily.csv`）を取り込む
3. ブラウザの幅を 1280px にし、6 つのページ（`<ADMIN_PATH>` の下の `/`・`/cost`・`/activity`・`/policy`・`/effect`・`/collect`）と `/summary`・`/settings` を
   順に開く。合格: 開発者ツールのコンソールに error・warning が 0 件、
   コンソールで `document.documentElement.scrollWidth <= document.documentElement.clientWidth` が
   `true`、表のセルが切れていない。**スクリーンショットだけで判定しない**
   - 端末のデータを入れた場合、1 回目の起動だけでは未準拠に見えるのが正常（`docs/spec/server.md` の「データモデル」）
4. 終わったら `docker compose -p ccgov-manual down -v --rmi local` で、この確認のコンテナ・ボリューム・
   イメージだけを消す

### 実物でも確かめられない限界

DB は SQLite だけで、MySQL は確かめない。AIP の前段のリバースプロキシ・`/mnt/data` の永続・起動時の挙動は、実行基盤でしか確かめられない。

## 改訂履歴

- 2026-09-26: 実装・knowledge と重なる記述を削り、各章の実行コマンドをモジュール一覧の「実行の指定」に集めた
- 2026-09-28: 組み立てで送信先を空に差し替えることを導入の限界に書いた
- 2026-09-28: 本体の自動更新を `--settings` で止めることを安全の約束に加えた
- 2026-09-28: 並行起動時の偽の赤・`CC_E2E_RUN` によるラベルの区別・設定の配布で `ONCE` を確かめないこと・
  `permission_mode` が非対話でも `--permission-mode` で変わることを書いた
- 2026-09-28: 手動確認の起動に `--settings` を付け、管理画面のパスと CSV の置き場を `dev.env` の名前で指し、テストと knowledge に重なる判定の記述を削った
- 2026-09-28: E2E の外で hook を直接起動するときの送信先・打ち切りを名指しで落とすこと・隔離ルートの名前の `CC_E2E_RUN` を書いた
- 2026-09-28: 手動確認で表を埋める合成データの入れ方を書いた
- 2026-09-29: 見た目の規約の参照先を `design-system.md` にし、error 行が出る場所を刷新後の画面の語で書いた
- 2026-09-30: CSV の取込を「データと設定」の画面で受け取る手順にし、手動確認の画面に `/settings` を加えた
- 2026-10-08: 手動確認の画面の `/assets` を `/activity` に読み替えた
- 2026-10-08: 手動確認で開くページを今の管理画面の構成に合わせた
