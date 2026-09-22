# verification/

実機検証で使うスクリプト・スキャフォールドを置く。**ここに置くのは仕組みだけである。**
実採取したログ・transcript・生データはここに置かない（`.gitignore` 済みの作業ディレクトリを
自分で用意して使う）。

## 群

### fixture-sanitization/ — フィクスチャの無害化

hook stdin を実採取するたびに、`tests/fixtures/hook_inputs/` へ無害化してコピーするために使う。

| ファイル | 何を確かめる／何をするか |
| --- | --- |
| `sanitize_fixtures.py` | 実採取した hook stdin の JSON から自由文・個人のホームディレクトリを機械的に取り除き、`tests/fixtures/hook_inputs/` にコピーする |

使い方: `python3 fixture-sanitization/sanitize_fixtures.py <採取先ディレクトリ>`
（採取先を省略すると `fixture-sanitization/raw/` を見る。このディレクトリは git に入れない）。

### hook-behavior/ — hook の実挙動の採取

settings.json の hooks から呼び出し、Claude Code の実挙動を採取するための小スクリプト群。

| ファイル | 何を確かめる |
| --- | --- |
| `capture_hook_stdin.py` | 任意の hook の stdin (JSON payload) をそのままファイルに保存する（圧縮前・スキル名など、確かめたい hook イベントに差し替えて使う汎用スクリプト） |
| `stop_transcript_survey.py` | Stop hook の時点で transcript がどこまで書かれているか（行数・末尾の usage・コンテキストトークン数）を記録する |
| `build_notice_message.py` | hook の `systemMessage` 出力が、指定文字数でどこまで届く／切り詰められるかを確かめる |
| `scriptname_subpath_app.py` | `SCRIPT_NAME` によるサブパス配備で Flask の URL 生成・ルーティングがどう振る舞うかを確かめる最小アプリ |
| `plugin-data-probe/marketplace/` | プラグインのデータ領域（`CLAUDE_PLUGIN_DATA` とその展開値）を採取する擬似マーケットプレイス一式（プラグイン名 `pdtest`） |

#### plugin-data-probe/ の使い方（プラグインのデータ領域の採取）

`autoupdate/isolated_home_run.sh` が用意する隔離 HOME に、この擬似マーケットプレイスを
プラグインとして仕込んでから起動すると、`CLAUDE_PLUGIN_DATA` を含む全 CLAUDE 系環境変数・
コマンド文字列での展開値・SessionStart hook の stdin が採取できる。

1. 隔離 HOME (`autoupdate/home/`) の `.claude/plugins/marketplaces/pdtest-mp/` に、
   `plugin-data-probe/marketplace/` の中身を配置し、`installed_plugins.json` で `pdtest` を有効化する。
   **併せて `.claude/settings.json` の `extraKnownMarketplaces` にも `pdtest-mp` を登録する**
   （`docs/design.md` §3.6 は「`settings.json` が権威であり、セッション開始時に
   `extraKnownMarketplaces` が `known_marketplaces.json` へ上書き同期される」と明記している。
   `known_marketplaces.json` / `installed_plugins.json` だけを直接編集しても、次のセッション開始で
   `settings.json` の内容に揃えられて消える可能性がある。**この経路は実機で未検証**であり、
   design.md の記述からの帰結にとどまる）
2. `autoupdate/isolated_home_run.sh` で claude を起動する（SessionStart hook が `pdtest/hooks/probe.py` を呼ぶ）
3. 採取結果は既定で `$HOME/../captured/probe-<epoch>-<pid>.json`（＝隔離 HOME の一つ上の `captured/`）に出る。
   採取先を変えたい場合は `CLAUDE_PROBE_DIR` を起動前に export する
4. `captured/` は実採取データなので `.gitignore` されている（下記参照）。このリポジトリには残さない

### autoupdate/ — 自動更新の検証

プラグインの自動更新が端末へ降りるまでを隔離環境で再現するための、擬似 git サーバと
擬似マーケットプレイス一式。

| ファイル/ディレクトリ | 何を確かめる／何をするか |
| --- | --- |
| `githttpd.py` | `git http-backend` を CGI として呼ぶ最小の smart HTTP サーバ（localhost 限定）。擬似マーケットプレイスを HTTP 経由の自動更新元として使う場合に立てる |
| `run.sh` | 隔離 HOME (`home-<n>/`) で `claude` を起動するラッパ（環境変数を落として汚染を防ぐ） |
| `hold.py` / `hold.sh` | 隔離 HOME で Claude Code の対話セッションを pty 上に起動し、指定秒数だけ保持しながらログを取る |
| `snap.sh` | 隔離 HOME を覗き、自動更新がどこまで進んだか（マーケットプレイス HEAD・plugin.json のバージョン・installed_plugins.json・キャッシュ）を一覧表示する |
| `isolated_home_run.sh` | 隔離 HOME で claude を起動し、プラグインのデータ領域（`~/.claude` 配下）がどこにどう作られるかを確かめるラッパ |
| `marketplaces/dummy-verify/` | 擬似マーケットプレイス 1 組目。`dummy-marketplace-bare.git`（bare、これが正本）と `dummy-marketplace/`（`.git` を持たないただのスナップショット。プラグイン名 `dummy`） |
| `marketplaces/au-verify/` | 擬似マーケットプレイス 2 組目。`mp-bare.git`（bare、これが正本）と `mp-src/`（`.git` を持たないただのスナップショット。プラグイン名 `audummy`。SessionStart hook でバージョンを `$HOME/captured.log` に書く） |

使い方の要点:
- bare リポジトリ（`*-bare.git`）が履歴の正本。`mp-src/` `dummy-marketplace/` はその時点のスナップショットで、
  `.git` は持たない（リポジトリの中にリポジトリを埋め込まないため）。作業コピーとして使うときは
  `git clone <bare>.git 作業コピー名` で改めて clone する
- `home-<n>/`（隔離 HOME）は実行のたびに用意する作業データなので、このリポジトリには含まれない。
  `.claude/plugins/marketplaces/<名前>` に、bare から clone した作業コピーを置いてから使う
- **`.claude/plugins/marketplaces/<名前>` への配置だけでは足りない可能性が高い。**
  `docs/design.md` §3.6 によれば `~/.claude/settings.json` が権威であり、セッション開始のたびに
  `settings.json` の `extraKnownMarketplaces` が `~/.claude/plugins/known_marketplaces.json` へ
  上書き同期される。したがって隔離 HOME の `.claude/settings.json` の `extraKnownMarketplaces` にも
  マーケットプレイス名を登録しておく必要がある（**実機での確認はしていない。design.md の記述からの
  帰結**）
- 擬似マーケットプレイスへバージョンを上げて反映させたいときは、bare から clone した作業コピー側で
  コミットして `git push` してから、隔離 HOME 側で自動更新を待つ

### performance/ — 性能測定の再現

| ファイル | 何を確かめる |
| --- | --- |
| `sqlite_bench.py` | `events` テーブルの `COUNT(DISTINCT event_id)` を被覆インデックスあり/なしで計測する（SQLite） |
| `mysql_schema.sql` | サーバのテーブル定義（MySQL 版）を実際に流して型・制約が通るかを確かめるためのスキーマ |
| `mysql_indexes.sql` | `mysql_schema.sql` のテーブルに対する被覆インデックス定義 |

使い方: `python3 performance/sqlite_bench.py <db path> <DAYS> <PER_DAY>`。
MySQL は `mysql_schema.sql` → データ投入 → `mysql_indexes.sql` → `ANALYZE TABLE` の順に流す
（ANALYZE を省くとインデックスなしより遅くなることがある）。
