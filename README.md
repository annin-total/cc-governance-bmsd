# cc-governance-bmsd

## 概要

BMSD 本部で使う Claude Code の利用を把握し、推進するための仕組み。
決めた設定値とお知らせを全員の端末へ届け、その効果を利用状況とコストの数字で確かめる。
会話やプロンプトの本文は収集しない。

```
端末のプラグイン（各自の Claude Code）
  │ 設定の適用・お知らせの表示・利用状況の記録
  ▼ HTTP で送信
集計サーバ ◀── AI Gateway の日次 CSV（コスト）
  │
  ▼
管理画面（概況・policy・effect・assets）
```

| ディレクトリ | 中身 |
| --- | --- |
| `plugin/` | 端末プラグイン `governance`。そのまま配布される |
| `server/` | 集計サーバと管理画面（submodule） |
| `docs/` | 仕様・設計判断・手順書 |
| `tests/` | プラグインと契約のテスト、統合テスト |
| `e2e/` | 実機検証（`pytest e2e`） |
| `scripts/` | 契約の同期、プラグインの検証、fixture の再生成、hook stdin の採取、性能計測 |

## 技術スタック

| 対象 | 使うもの |
| --- | --- |
| プラグイン | Python 3（標準ライブラリのみ）、Claude Code の hook |
| サーバ | Python 3.9、Flask、waitress |
| DB | SQLite（開発）、MySQL（PyMySQL） |
| 画面 | Jinja2 テンプレート、CSS |
| 実行環境 | Docker（`python:3.9-slim`） |
| 開発ツール | pytest、ruff |
| 端末OS | Windows、macOS |

## 利用手順・実行手順

### プラグインの導入（利用者向け）

Claude Code の中で、次の 2 つを順に実行する。

```
/plugin marketplace add <マーケットプレイスの URL>
/plugin install governance@cc-marketplace-governance-bmsd
```

Claude Code を開き直し、お知らせが表示されれば導入できている。
案内文の雛形と展開の進め方は [`docs/guide/onboarding.md`](docs/guide/onboarding.md)。

### 開発環境の準備

submodule（`server/`）を含めて clone する。

```bash
git clone --recurse-submodules https://github.com/annin-total/cc-governance-bmsd.git
cd cc-governance-bmsd
```

venv を親と `server/` にそれぞれ作る。

macOS:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
```

Windows:

```powershell
py -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt

cd server
py -m venv .venv
.venv\Scripts\pip install -r requirements.txt -r requirements-dev.txt
```

### サーバの起動

`server/` で Docker Compose を使う。設定は `server/dev.env`（開発用のダミー値）が使われる。DB は既定で SQLite（AIP 相当）で、MySQL（One Cloud 相当）で動かすときは、`dev.env` の `DB_DSN` の 2 行を入れ替えて profile `mysql` を付ける（使い方は `server/compose.yaml` の先頭）。

```bash
cd server
docker compose up --build
```

- 管理画面: http://localhost:15000/dev-admin/ （Basic 認証。パスワードは `dev.env` の `ADMIN_PASSWORD`、ユーザー名は任意）
- 止めるとき: `docker compose down`

### テストの実行

親（プラグインと統合テスト）と `server/` で、それぞれ実行する。

| | macOS | Windows |
| --- | --- | --- |
| テスト | `.venv/bin/python -m pytest -q` | `.venv\Scripts\python -m pytest -q` |
| リンター | `.venv/bin/ruff check .` | `.venv\Scripts\ruff check .` |
| プラグインの検証（親のみ） | `.venv/bin/python scripts/validate_plugin.py` | `.venv\Scripts\python scripts\validate_plugin.py` |

## 設定項目

### プラグイン

変えたら `plugin/.claude-plugin/plugin.json` の `version` を上げてリリースする。

| 項目 | 意味 | 例 |
| --- | --- | --- |
| `plugin/config.json` の `ingest_url` | 送信先（サーバの `/ingest`） | `https://example.com/governance/ingest` |
| `plugin/config.json` の `ingest_token` | 送信用のトークン。サーバの `INGEST_TOKEN` と同じ値 | `dummy-token` |
| `plugin/hooks/policy.py` | 端末の `settings.json` に適用する設定値（書き方は `policy_sample.py`） | `SET = {"env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"}` |
| `plugin/notices.json` | 利用者に表示するお知らせ（`id`・`title`・`body`） | `{"id": "2026-10-01-intro", "title": "...", "body": "..."}` |

### サーバ（環境変数）

| 項目 | 意味 | 例 |
| --- | --- | --- |
| `INGEST_TOKEN` | 受信用のトークン。未設定・空なら起動しない | `dummy-token` |
| `ADMIN_PATH` | 管理画面を置くパス。推測しにくいランダムな文字列。`/` を含めない。未設定なら起動しない | `dummy-admin-path` |
| `ADMIN_PASSWORD` | 管理画面の Basic 認証の共有パスワード（ユーザー名は問わない）。未設定なら起動しない | `dummy-admin-password` |
| `DB_DSN` | DB の接続先 | `sqlite:////app/data/dev.db`、`mysql://user:pass@host/db` |
| `BASE_PATH` | サブパスで公開するときのパス。末尾に `/` を付けない | `/<workspace_id>/cc-governance-server` |
| `CSV_DIR` | 画面で取り込んだ AI Gateway の CSV を置くディレクトリ（アプリが書き込める場所）。未設定なら取り込まない | `/mnt/data/cc-governance-server/csv` |

## ドキュメント

- 詳しくは [`docs/README.md`](docs/README.md)（読者別の入口と文書の一覧）
- リリース手順: [`docs/guide/release.md`](docs/guide/release.md)
- デプロイ手順: [`docs/guide/deploy-aip.md`](docs/guide/deploy-aip.md)
