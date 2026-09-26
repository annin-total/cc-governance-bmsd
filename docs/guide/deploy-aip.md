# AIP FaaS (WebApp) デプロイ手順 — cc-governance-server

AI Platform (AIP) の FaaS（WebApp Function type, Git mode）に、Bitbucket 経由で集計サーバをデプロイするための手順。

## 前提

- デプロイ単位はこのリポジトリのルートである。サーバのソースは submodule `server/` にある
- DB は SQLite を使う。DB ファイルと CSV は永続領域 `/mnt/data/` に置く
- **`/mnt/data/` と `/mnt/data/secrets/` は他のアプリと共有されている。**このアプリのファイルは
  次の 2 か所だけに置く。`/mnt/data/` の直下にファイルを作らず、汎用的な名前を使わない

| 用途 | パス |
| --- | --- |
| データ（DB ファイルと `csv/`） | `/mnt/data/cc-governance-server/` |
| Secret ファイル | `/mnt/data/secrets/cc-governance-server.env` |

## 環境変数

Secret ファイルに `KEY=VALUE` 形式で書く。`entry.sh` が起動時に読み込む。

| 項目 | 説明 | 例 |
| --- | --- | --- |
| `BASE_PATH` | 公開サブパス。AIP は `/<workspace_id>/<ingress_path>` に公開する。末尾に `/` を付けない | `/<workspace_id>/cc-governance-server` |
| `DB_DSN` | DB の接続先。未設定なら起動しない | `sqlite:////mnt/data/cc-governance-server/governance.db` |
| `INGEST_TOKEN` | 受信用のトークン。プラグインの `config.json` の `ingest_token` と文字列として完全に一致させる。未設定・空なら起動しない | `dummy-ingest-token` |
| `ADMIN_PATH` | 管理画面を置くパス。推測しにくいランダムな文字列にする。`/` を含めない。未設定なら起動しない | `dummy-admin-path` |
| `ADMIN_PASSWORD` | 管理画面の Basic 認証の共有パスワード（ユーザー名は問わない）。未設定なら起動しない | `dummy-admin-password` |
| `CSV_DIR` | AI Gateway の CSV を置くディレクトリ。未設定なら取り込まず、画面にエラーを出す | `/mnt/data/cc-governance-server/csv` |
| `PKG_PROXY` | 依存の取得に使う社内プロキシ。社内のホスト名を含むため、値をこのリポジトリにも git にも書かない | `http://<社内プロキシのホスト>:<ポート>` |

## 1. Bitbucketリポジトリへの反映

1. このリポジトリを置く Bitbucket リポジトリを用意する
2. ローカルで動作を確認してから、デプロイ対象のブランチに commit/push する

## 2. AIP側の事前準備（初回のみ・手動作業）

1. AIP の公式ドキュメント「Function as a Service」で公開鍵を確認する
2. 対象の Bitbucket リポジトリの `[Repository setting] → [Access keys] → [Add key]` に登録する（一度だけ）

## 3. AIP操作手順

1. 対象ワークスペースに移動
2. 新規Function作成
   - Function type: **WebApp**
   - Name: 任意（例: `cc-governance-server`）
   - Ingress Path: `/cc-governance-server`
   - Function Base: **sh-centos-science**（例: `sh-centos-science-py39`）
   - HTTP Access Mode: **Public Access**（社内 VPN に接続できる人なら誰でも到達できる）
   - Input Method: **Git Repository**
      - Git Repository Url: `対象リポジトリの SSH URL`
      - Branch: デプロイ対象のブランチ
      - Entrypoint: `server/entry.sh`（リポジトリルートからの相対パス）
   - Tags: `NGINX_ENABLE_REWRITE_TARGET` = `false`（既定のままだと AIP がリクエストパスを書き換え、`BASE_PATH` によるサブパス対応と噛み合わない）
   - スケールアウトの設定はしない。永続領域上の SQLite の 1 ファイルを複数のレプリカが掴むと壊れる
3. Secretを設定する（初回のみ・手動作業）
   1. 手順 2 で作成した Function の詳細画面で「Open Terminal」を開く
   2. `ADMIN_PATH` と `ADMIN_PASSWORD` の値を作る。2 回実行し、それぞれの値に使う:
      ```bash
      python3 -c "import secrets; print(secrets.token_urlsafe(16))"
      ```
   3. データのディレクトリと Secret ファイルを作成し、権限を絞る:
      ```bash
      mkdir -p /mnt/data/cc-governance-server/csv
      mkdir -p /mnt/data/secrets
      cat > /mnt/data/secrets/cc-governance-server.env << 'EOF'
      BASE_PATH=/<workspace_id>/cc-governance-server
      DB_DSN=sqlite:////mnt/data/cc-governance-server/governance.db
      INGEST_TOKEN=<プラグインのconfig.jsonのingest_token>
      ADMIN_PATH=dummy-admin-path
      ADMIN_PASSWORD=dummy-admin-password
      CSV_DIR=/mnt/data/cc-governance-server/csv
      PKG_PROXY=http://<社内プロキシのホスト>:<ポート>
      EOF
      chmod 600 /mnt/data/secrets/cc-governance-server.env
      ```
      `<...>` と `dummy-` で始まる値はダミーである。実際の値に置き換える
   4. Function を「restart」する（Secret ファイルは起動時に一度だけ読み込まれるため、反映にはこの再起動が必要）
4. 疎通の確認
   1. FaaS List で作成した Function を確認し、Deployment Log で依存の install と待受の開始が通ったことを確認する
   2. Open ボタンでサーバの URL を取得する
   3. 管理画面の URL は `https://<取得したURL>/<ADMIN_PATH>/` である。認証なしで `401`、
      `ADMIN_PASSWORD` を付けて `200` を返すこと、画面が生成するリンクにサブパスと `ADMIN_PATH` が載ることを確認する。
      `ADMIN_PATH` の外（`/` など）は `404` を返すことも確認する
      ```bash
      curl -s -o /dev/null -w '%{http_code}\n' https://<取得したURL>/<ADMIN_PATH>/   # => 401
      curl -s -o /dev/null -w '%{http_code}\n' -u admin:<ADMIN_PASSWORD> https://<取得したURL>/<ADMIN_PATH>/   # => 200
      curl -s -o /dev/null -w '%{http_code}\n' https://<取得したURL>/   # => 404
      ```
   4. 受信エンドポイント（`/ingest`）にトークン無しで POST し、`401` が返ることを確認する
      ```bash
      curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<取得したURL>/ingest   # => 401
      ```
   5. 端末が送りうる最大サイズの本文を POST し、`413` が返らないことを確認する（前段のリバースプロキシの `client_max_body_size` を確かめる）
   6. `CSV_DIR` に CSV を 1 本置いて画面のボタンから取り込み、同じファイルをもう一度取り込んでコストが二重計上されないことを確認する
   7. 1 台の端末で `claude` を動かし、イベントが `events` に入ること、送信後に端末の spool が消えることを確認する
5. コード更新時は「restart」ボタンで再起動

push だけでは反映されない。ソースの更新も Secret の変更も、「restart」を経て初めて効く。

## 既知の制約・未検証事項

- **初回デプロイ時、Secret ファイル未作成による起動失敗は想定内**: `entry.sh` は Secret ファイルが無いと起動を中止する。Open Terminal は Function の作成後にしか開けないため、手順「新規Function作成」の直後は必ず一度失敗する。手順「Secretを設定する」の Secret 作成 → restart で解消する
- **Public Access が HTTPS かどうかは未検証**: 平文の HTTP なら、Basic 認証のパスワードと `ADMIN_PATH` が VPN の中を平文で流れる
- **前段のリバースプロキシが `Authorization` ヘッダをアプリに渡すかどうかは未検証**: 渡さなければ、正しいパスワードでも画面は常に `401` になる
- **submodule の取得は未検証**: AIP が clone 時に submodule `server/` を取得するか、取得元に到達できるかを確かめていない。取得できなければ `server/entry.sh` が存在せず起動しない
- `sh-centos-science` は公式ドキュメント上 alpha 版扱いのため、AIP 側の仕様変更・非推奨化のリスクが残る
- Git Repository Url は SSH 接続のみ有効。HTTP は使えない

## その他

### バックアップ

アプリケーションはバックアップ機構を持たない。永続領域の複製を運用手順として行う。

- DB ファイルと `CSV_DIR` を、CSV 取込と同じ日次の操作として永続領域の外へ複製する
- 復旧できるのは最後の複製時点までである。複製より後に失ったものは、テーブルごとに次のとおり

| テーブル | 失ったとき |
| --- | --- |
| `cost_daily` | CSV から再取込できる |
| `events` | 再現できない。端末は受信済み（2xx）の分を spool から消すため、再送されない |
| `policy_state` | 再現できない。準拠開始日は過去の観測にしか存在しない |
| `errors` | `events` と同じ |
