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
- **本物の `~/.claude` を前後比較する。**`e2e/conftest.py` のセッション fixture が開始時と終了時で
  `settings.json` 等のハッシュと `plugin/` 木を比較し、差があればセッション全体を失敗させる
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

## 設定の配布（モジュール 2）

`installPath` の `policy.py` が `SessionStart` で隔離した `settings.json` に当たり、Claude Code 本体の
書き込みと共存し、本体の記録に取り込まれること、`statusline.js` が `installPath` から配置されることを
確かめる。適用の規則そのもの（`SET` / `ADD` / `REMOVE` / `ONCE`・競合・パース失敗）は `tests/` が見る。

```bash
.venv/bin/python -m pytest e2e -k settings
```

### 前提と罠

- 期待値は組み立てたコピーの `policy.py` から導く。開発ツリーの `plugin/` を import すると
  `__pycache__` が生え、`e2e/conftest.py` の前後比較が失敗する
- `extraKnownMarketplaces.<name>` は `marketplace add --scope user` が `settings.json` に書く。
  この項目が無いと `autoUpdate` は書かれない（`docs/spec/plugin.md` の「設定の自動適用」）
- 本物の `~/.claude/plugins/known_marketplaces.json` は、並行して動く本物の Claude Code が
  公式マーケットプレイスの更新で書き換えることがある。前後比較がこれで落ちたら、隔離側の痕跡
  （`127.0.0.1` の URL）が無いことを確かめて再実行する

### 手動確認項目

認証と対話が要るため自動化しない。隔離した config（`CLAUDE_CONFIG_DIR`）でログインして行う。

- **reapply**: `settings.json` の `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` を別の値に書き換え、対話で
  `/governance:reapply` を実行する。合格: 結果が表示され、`settings.json` が `policy.py` の値に戻る
- **設定が実際に効くか**: 適用後に対話セッションを開き直し、`!echo $CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`
  を実行する（子プロセスは settings の `env` を受け継ぐ）。合格: `policy.py` の値が出る。自動更新の
  有効化は、本体の記録（`known_marketplaces.json`）に取り込まれることまでを自動で見ている

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

### 前提と罠

- `claude -p` のプレーン出力には `systemMessage` が出ない。`--output-format stream-json --verbose` の
  `hook_response` から読む（`docs/knowledge/claude-code-behavior.md`）
- `claude -p` は非対話起動なので、既読の記録とブラウザ起動は起きない。「2 回目は出ない」は
  対話でしか確かめられない

### 手動確認項目

隔離した config でログインし、`url` 付きの項目を持つ版を導入して対話で起動する。

- **対話での見え方**: 起動直後にお知らせが `SessionStart:startup says:` の接頭辞つきで表示される。
  合格: 題名・本文・`詳細: <url>` がそろい、文面が退避されていない
- **URL が開くか**: 同じ起動で既定ブラウザが先頭の有効な `url` を 1 回だけ開く。合格: 開いたタブが
  1 つで、閉じて開き直した 2 回目のセッションではお知らせも表示されずブラウザも開かない
- **`-p` では開かない**: 同じ config で `claude -p ok` を実行する。合格: ブラウザが開かない

### 実物でも確かめられない限界

ブラウザ起動は OS に依存する観測であり、自動では確かめない。Windows と、VS Code 拡張など
`cli` 以外の対話起動での見え方は未検証。
