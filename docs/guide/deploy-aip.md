# AIP FaaS (WebApp) デプロイ手順 — cc-governance-server

AI Platform (AIP) の FaaS（WebApp Function type, Git mode）に、Bitbucket 経由で集計サーバをデプロイするための手順。

## 前提

- デプロイ単位はこのリポジトリのルートである。サーバのソースは `server/` にある
- DB は SQLite を使う。DB ファイルと CSV は永続領域 `/mnt/data/` に置く
- MySQL を採るときは、その前に `db.init` が MySQL の表を `DEFAULT CHARSET=utf8mb4` で作り、起動時に文字コードを検査するようにする。
  今の DDL（`contract.py` の `ddl()`）は文字コードを指定しないため、既定が utf8mb3・latin1 の DB では
  4 バイト文字を 1 字含む行があるだけで、そのリクエストの行がすべて保存されない
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
| `CSV_DIR` | 画面で取り込んだ AI Gateway の CSV を置くディレクトリ。**アプリが書き込める場所にする**（受け取ったファイルと、受け取りの途中の一時ディレクトリを置く）。未設定なら取り込まず、画面にエラーを出す | `/mnt/data/cc-governance-server/csv` |
| `PKG_PROXY` | 依存の取得に使う社内プロキシ。社内のホスト名を含むため、値をこのリポジトリにも git にも書かない。未定義なら起動しない。プロキシが要らなければ空で定義する | `http://<社内プロキシのホスト>:<ポート>` |

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
      - Git Repository Url: `対象リポジトリの SSH URL`（HTTP は使えない）
      - Branch: デプロイ対象のブランチ
      - Entrypoint: `server/entry.sh`（リポジトリルートからの相対パス）
   - Tags: `NGINX_ENABLE_REWRITE_TARGET` = `false`（既定のままだと AIP がリクエストパスを書き換え、`BASE_PATH` によるサブパス対応と噛み合わない）
   - スケールアウトの設定はしない。永続領域上の SQLite の 1 ファイルを複数のレプリカが掴むと壊れる

   作成直後の初回デプロイは必ず一度起動に失敗する（Open Terminal は Function の作成後にしか開けず、`entry.sh` は Secret ファイルが無いと起動を中止する）。次の「Secretを設定する」の restart で解消する

3. Secretを設定する（初回のみ・手動作業）
   1. 「新規Function作成」で作成した Function の詳細画面で「Open Terminal」を開く
   2. `INGEST_TOKEN`・`ADMIN_PATH`・`ADMIN_PASSWORD` の値を作る。3 回実行し、それぞれの値に使う。`INGEST_TOKEN` の値はプラグインの `config.json` の `ingest_token` にも入れる:
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
      INGEST_TOKEN=dummy-ingest-token
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
   5. `plugin/config.json` の `spool_max_bytes` を端末が送りうる本文の大きさの目安とし、その大きさの本文を POST し、`413` が返らないことを確認する（前段のリバースプロキシの `client_max_body_size` を確かめる）
   6. 管理画面の「データと設定」の「取り込む」で CSV を 1 本取り込み、同じファイルをもう一度取り込んでコストが二重計上されないことと、`CSV_DIR` にそのファイルが置かれたことを確認する
   7. 1 台の端末で `claude` を動かし、イベントが `events` に入ること、送信後に端末の spool が消えることを確認する
5. コード更新時は「restart」ボタンで再起動

push だけでは反映されない。ソースの更新も Secret の変更も、「restart」を経て初めて効く。

## 既知の制約・未検証事項

- **Public Access が HTTPS かどうかは未検証**: 平文の HTTP なら、Basic 認証のパスワードと `ADMIN_PATH` が VPN の中を平文で流れる
- **前段のリバースプロキシが `Authorization` ヘッダをアプリに渡すかどうかは未検証**: 渡さなければ、正しいパスワードでも画面は常に `401` になる
- `sh-centos-science` は公式ドキュメント上 alpha 版扱いのため、AIP 側の仕様変更・非推奨化のリスクが残る

## その他

### CSV の取り込み方（CSV を使う場合）

CSV は任意の補強であり、取り込まなくてもサーバは動く。取り込むときは次を守る。取込は日（`day`）ごとに行を置き換えるため
（`../spec/server.md` の「CSV 取込」）、守らないと行が黙って減る。画面はどちらのファイルも成功と出す。

- 1 ファイルは、含む日の全行を含める。一部の行だけの訂正版を取り込むと、その日の行が訂正版の行だけになる
- 同じ日を含むファイルが複数あるときは、後から取り込んだものが勝つ
- ファイルを消すときは「データと設定」の一覧から削除する。そのファイルから取り込んだ行も消える。
  `CSV_DIR` から直接消したファイルの行は DB に残り、一覧に残ったその名前から削除できる

### バックアップ

アプリケーションはバックアップ機構を持たない。永続領域の複製を運用手順として行う。

- DB ファイルと `CSV_DIR` を、CSV 取込と同じ日次の操作として永続領域の外へ複製する
- 復旧できるのは最後の複製時点までである。複製より後に失ったものは、テーブルごとに次のとおり

| テーブル | 失ったとき |
| --- | --- |
| `cost_daily` | `CSV_DIR` の複製にある CSV を、画面から取り込み直せる |
| `company_holidays` | 画面から登録し直す |
| `org_roster`・`org_roster_files` | 手元の組織 CSV を、画面から月ごとに取り込み直す（サーバは組織 CSV のファイルを置かない） |
| `events` | 再現できない。端末は受信済み（2xx）の分を spool から消すため、再送されない |
| `policy_state` | 再現できない。準拠開始日は過去の観測にしか存在しない |
| `errors` | `events` と同じ |

## 改訂履歴

- 2026-09-30: CSV を画面で受け取って取り込む手順にし、`CSV_DIR` に書き込みの権限が要ること・一覧からの削除・`company_holidays` を失ったときを加えた
- 2026-10-08: 組織の名簿を失ったときを加えた
