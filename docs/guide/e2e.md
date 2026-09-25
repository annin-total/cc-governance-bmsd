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
| サーバ | `e2e/test_server.py` | 不要 | 要 | 不要（手動確認は要る） |

書かれていないモジュールはまだ無い。

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

## 安全の約束

- **隔離は `CLAUDE_CONFIG_DIR` だけで行い、`HOME` は差し替えない。**macOS で `HOME` を差し替えると
  認証が壊れるため（`docs/guide/local-e2e.md` の原則）
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
  （`docs/guide/local-e2e.md` の該当箇所）
- 導入が完了したことは `claude plugin marketplace add` と `claude plugin install` の明示実行で
  確認する。詳細は `docs/knowledge/claude-code-behavior.md`
- 導入経路の判定に `installPath` は使えない。directory source でも `plugin list` の `installPath` は
  cache 配下を示すが、hook が動くのは元のディレクトリ。詳細は `docs/knowledge/claude-code-behavior.md`
- 手動更新は 2 段階。詳細は `docs/knowledge/claude-code-behavior.md`

### 実物でも確かめられない限界

配布経路は開発ツリーから組み立てたローカルの git リポジトリで代替しており、実在の配布リポジトリ
（社内 Bitbucket 等）への到達・認証は確かめない。Windows での実行は未検証。

## 手動確認の準備

認証と対話が要る確認は、テストが残した隔離ルートで行う。お知らせのテストのルートは、見本の
お知らせが未読のまま設定も適用済みなので、両モジュールの手動確認に使える。

```bash
CC_E2E_KEEP=1 .venv/bin/python -m pytest e2e -k 未読 -s   # 残したルートのパスが表示される（-s が無いと出ない）
cd <ルート>/project && CLAUDE_CONFIG_DIR=<ルート>/config claude   # 対話で起動し /login でログインする
```

- ログインは隔離した config ごとに 1 回要る（本人の認証は引き継がず、上書きもしない）
- 起動はルート内の空の `project/` から行う。リポジトリ内で起動すると、そのプロジェクトの hooks や CLAUDE.md が混ざる
- macOS ではログインするとキーチェーンに config ごとの項目ができ、ルートを消しても残る。消し方は未検証
- `url` 付きの項目は、`<ルート>/config/plugins/cache/` 配下の installPath にある `notices.json` に足す。
  git source では hook は cache から動く（`docs/knowledge/claude-code-behavior.md`）
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
4. 終わったら `docker compose -p ccgov-manual down -v --rmi local` で、この確認のコンテナ・ボリューム・
   イメージだけを消す

### 実物でも確かめられない限界

DB は SQLite だけで、MySQL は確かめない。AIP の前段（Ingress のサブパスの扱い・HTTPS）、`/mnt/data` の
永続（再起動をまたいだデータの保持）、起動時の `pip install` がプロキシ越しに通るか、起動時間と
アイドル停止は、実行基盤でしか確かめられない。
