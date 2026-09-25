# 実機検証（E2E）の手順

`e2e/` の正本。実機検証は、モジュール（配布経路上の機能のまとまり）ごとに章を持つ。
テストは実装単体を検査するが、ここが見るのは「実際の導入経路で配置されたものが本物の
`claude` CLI 越しに動くか」である。合否の判定内容はテストの assert と docstring が正本であり、
ここには複写しない。

## モジュール一覧

| モジュール | テストファイル | 認証 | Docker | 対話 |
| --- | --- | --- | --- | --- |
| 導入 | `e2e/test_install.py` | 不要 | 不要 | 不要 |

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

- 検証用の bare リポジトリは `<name>.git` として作られるため、配信 URL も末尾 `.git` で一致させる
  （`e2e/_githttp.py`）
- `claude plugin marketplace add` は bare リポジトリを直接指せないため、smart HTTP で配信する
  （`docs/guide/local-e2e.md` の該当箇所）
- 導入が完了したことは `claude plugin marketplace add` と `claude plugin install` の明示実行で
  確認する。詳細は `docs/knowledge/claude-code-behavior.md`
- `installPath` が指す実体は source の種別で異なる（git source では cache 配下の複製、directory
  source では元ディレクトリ）。詳細は `docs/knowledge/claude-code-behavior.md`
- 手動更新は 2 段階。詳細は `docs/knowledge/claude-code-behavior.md`

### 実物でも確かめられない限界

配布経路は開発ツリーから組み立てたローカルの git リポジトリで代替しており、実在の配布リポジトリ
（社内 Bitbucket 等）への到達・認証は確かめない。Windows での実行は未検証。
