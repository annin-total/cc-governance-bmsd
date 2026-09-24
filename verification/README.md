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

**警告 — 書き込み先はこのリポジトリの `tests/fixtures/hook_inputs/` に固定であり、
引数でも環境変数でも変更できない。** 実装は書き込み前にこの書き込み先を空にしてからコピーする。
**採取データを持たずに、あるいは間違った採取先ディレクトリを指定して実行すると、既存の
フィクスチャが消える。** 実行前に `<採取先ディレクトリ>` に採取済みの stdin が入っていることを
必ず確認する。

### hook-behavior/ — hook の実挙動の採取

settings.json の hooks から呼び出し、Claude Code の実挙動を採取するための小スクリプト群。

| ファイル | 何を確かめる |
| --- | --- |
| `capture_hook_stdin.py` | 任意の hook の stdin (JSON payload) をそのままファイルに保存する（圧縮前・スキル名など、確かめたい hook イベントに差し替えて使う汎用スクリプト） |
| `stop_transcript_survey.py` | Stop hook の時点で transcript がどこまで書かれているか（行数・末尾の usage・コンテキストトークン数）を記録する |
| `build_notice_message.py` | hook の `systemMessage` 出力が、指定文字数でどこまで届く／切り詰められるかを確かめる。環境変数 `NOTICE_LEN`（文字数）・`NOTICE_MODE`（`ascii` \| `ja`）で切り替える |
| `scriptname_subpath_app.py` | `SCRIPT_NAME` によるサブパス配備で Flask の URL 生成・ルーティングがどう振る舞うかを確かめる最小アプリ |
| `plugin-data-probe/marketplace/` | プラグインのデータ領域（`CLAUDE_PLUGIN_DATA` とその展開値）を採取する擬似マーケットプレイス一式（プラグイン名 `pdtest`） |

#### capture_hook_stdin.py の使い方

隔離 `CLAUDE_CONFIG_DIR` 配下の `settings.json` の `hooks` に、確かめたい hook イベントごとに
1 エントリを足す。

**`CAPTURE_DIR` は `env` ブロックでは渡せない。** hook エントリに `"env": {...}` を付けると、
**そのエントリ自体が無音で無効化される**（Claude Code 2.1.280 で確認）。`CAPTURE_DIR` は
`command` 文字列の中にインラインで書く。**ただし空白を含むパスは壊れる**（コマンド文字列の
展開はシェルが行うため）。空白を含まない `CAPTURE_DIR`（例: この隔離ルート配下）を使う。

```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "CAPTURE_DIR=\"/path/without/space/captured\" python3 \"/path/to/verification/hook-behavior/capture_hook_stdin.py\" PreCompact"
          }
        ]
      }
    ]
  }
}
```

保存先は `<CAPTURE_DIR>/<hook名>-<epoch_ms>-<pid>.json`。`CAPTURE_DIR` を渡し忘れると
カレントディレクトリに書かれる。

**`PostToolUse` / `PostToolUseFailure` を採取するときは `"matcher": "*"` が必須。** 無いと
無音で発火しない（プラグイン本体の `hooks.json` には最初から付いている）。

**1 つの matcher ブロックの `hooks` 配列に複数コマンドを並べても、2 番目以降は実行されない。**
複数の hook イベント／コマンドを同時に採取したいときは、イベントごとに個別の
`{"matcher": "*", "hooks": [...]}` ブロックに分ける。

**hook を仕込む方法は 2 通りあり、観測が割れている。**
1. `settings.json` の `hooks` に直接エントリを足す（上記の例）
2. マーケットプレイスのコピー（`extraKnownMarketplaces` の `source: "directory"` が指す先）の
   `hooks/hooks.json` を書き換える

`settings.json` 直下の hooks が `claude -p`（非対話）で発火するかは検証グループ間で観測が
割れた。**片方が発火しないときは、もう片方の経路を試す。**マーケットプレイス側の
`hooks.json` を変更した場合は、**プラグインの cache を消さないと反映されない**
（`claude plugin uninstall` → cache 削除 → `claude plugin install` のフルサイクルが要る）。

#### scriptname_subpath_app.py の使い方

`SCRIPT_NAME` によるサブパス配備を確かめる最小 Flask アプリ。**`.venv` の python を使う**
（システムの `python3` には Flask・waitress が入っていない）。

```bash
BASE_PATH=/gov PORT=5099 .venv/bin/python hook-behavior/scriptname_subpath_app.py
curl http://127.0.0.1:5099/gov/       # サブパス付き
curl http://127.0.0.1:5099/          # サブパス無し
```

`BASE_PATH`（既定は空文字列）と `PORT`（既定 `5099`）を環境変数で渡す。

**このアプリ単体では、サブパス無しのアクセスを拒否しない。** `ScriptNameMiddleware` は
`PATH_INFO` が `BASE_PATH` から始まるときだけそれを剥がして `SCRIPT_NAME` に付け替える設計で
あり、始まらないとき（サブパス無しのアクセス）は素通しする。Flask のルーティングは
`PATH_INFO` だけを見て `SCRIPT_NAME` を無視するため、`/` や `/policy` に直接アクセスしても
`200` が返る。**サブパスの境界を強制するのはこのアプリの責務ではなく、前段のリバースプロキシの
責務である。**このスクリプトは URL 生成（`url_for`）とルーティングの挙動だけを確かめるための
ものであり、境界の強制自体を検査するものではない。

#### plugin-data-probe/ の使い方（プラグインのデータ領域の採取）

`autoupdate/isolated_home_run.sh` が用意する隔離 HOME に、この擬似マーケットプレイスを
プラグインとして仕込んでから起動すると、`CLAUDE_PLUGIN_DATA` を含む全 CLAUDE 系環境変数・
コマンド文字列での展開値・SessionStart hook の stdin が採取できる。

1. 隔離 HOME (`autoupdate/home/`) の `.claude/plugins/marketplaces/pdtest-mp/` に、
   `plugin-data-probe/marketplace/` の中身を配置し、`installed_plugins.json` で `pdtest` を有効化する。
   **併せて `.claude/settings.json` の `extraKnownMarketplaces` にも `pdtest-mp` を登録する**
   （`docs/spec/plugin.md` §5.4 は「`settings.json` が権威であり、セッション開始時に
   `extraKnownMarketplaces` が `known_marketplaces.json` へ上書き同期される」と明記している。
   `known_marketplaces.json` / `installed_plugins.json` だけを直接編集しても、次のセッション開始で
   `settings.json` の内容に揃えられて消える可能性がある。**この経路は実機で未検証**であり、
   仕様書の記述からの帰結にとどまる）
2. `autoupdate/isolated_home_run.sh` で claude を起動する（SessionStart hook が `pdtest/hooks/probe.py` を呼ぶ）
3. 採取結果は既定で `$HOME/../captured/probe-<epoch>-<pid>.json`（＝隔離 HOME の一つ上の `captured/`）に出る。
   採取先を変えたい場合は `CLAUDE_PROBE_DIR` を起動前に export する
4. `captured/` は実採取データなので `.gitignore` されている（下記参照）。このリポジトリには残さない

### autoupdate/ — 自動更新の検証

プラグインの自動更新が端末へ降りるまでを隔離環境で再現するための、擬似 git サーバと
擬似マーケットプレイス一式。

| ファイル/ディレクトリ | 何を確かめる／何をするか |
| --- | --- |
| `githttpd.py` | `git http-backend` を CGI として呼ぶ最小の smart HTTP サーバ（localhost 限定）。擬似マーケットプレイスを HTTP 経由の自動更新元として使う場合に立てる。引数は `ROOT PORT`（`python3 githttpd.py <bare リポジトリの親ディレクトリ> <ポート>`）。**`ROOT` 配下に bare リポジトリ（`*.git`）を用意してから使う**。空のディレクトリを指定しても起動はするが `git clone` が失敗する |
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
  `docs/spec/plugin.md` §5.4 によれば `~/.claude/settings.json` が権威であり、セッション開始のたびに
  `settings.json` の `extraKnownMarketplaces` が `~/.claude/plugins/known_marketplaces.json` へ
  上書き同期される。したがって隔離 HOME の `.claude/settings.json` の `extraKnownMarketplaces` にも
  マーケットプレイス名を登録しておく必要がある（**実機での確認はしていない。仕様書の記述からの
  帰結**）
- 擬似マーケットプレイスへバージョンを上げて反映させたいときは、bare から clone した作業コピー側で
  コミットして `git push` してから、隔離 HOME 側で自動更新を待つ

**`claude plugin marketplace add` は bare リポジトリを直接指せない。** http(s) の git URL が
要る。同梱の `githttpd.py`（`python3 githttpd.py <bare リポジトリの親ディレクトリ> <ポート>`）
を先に起動し、`http://127.0.0.1:<ポート>/<name>-bare.git` を登録先に使う。

**`run.sh` / `hold.sh` は無人実行では初回起動の対話ダイアログ 3 段で止まる**
（テーマ選択・フォルダ信頼・API キー確認）。突破するには隔離 HOME の `.claude.json` に
`hasCompletedOnboarding` / `theme` / `projects.<cwd の realpath>.hasTrustDialogAccepted` を
事前投入する。**API キー確認の段だけは、ファイルの事前投入では突破できない。**pty 上でキー入力
そのものを送る必要がある（`hold.py` が pty 起動を担う）。

**`.claude.json` にプロジェクトパスを事前投入するときは `realpath` を使う。** macOS では
`/tmp/...` が `/private/tmp/...` のシンボリックリンクであり、Claude Code は解決後の
`/private/tmp/...` をキーとして記録する。`/tmp/...` のまま書くと一致せず、信頼ダイアログが
再度出る。

### performance/ — 性能測定の再現

| ファイル | 何を確かめる |
| --- | --- |
| `sqlite_bench.py` | `events` テーブルの `COUNT(DISTINCT event_id)` を被覆インデックスあり/なしで計測する（SQLite） |
| `mysql_schema.sql` | サーバのテーブル定義（MySQL 版）を実際に流して型・制約が通るかを確かめるためのスキーマ |
| `mysql_indexes.sql` | `mysql_schema.sql` のテーブルに対する被覆インデックス定義 |

使い方: `python3 performance/sqlite_bench.py <db path> <DAYS> <PER_DAY>`。
**このスクリプト自身は `ANALYZE` を呼ばない。** 統計情報が無いまま計測すると、`skill_name` 系の
クエリでインデックスありの方がインデックス無しより遅くなることがある（実測: 18 万行で
2 クエリとも悪化）。インデックスの効果そのものを見たいときは、計測前に手動で
`ANALYZE` を実行してから流す。
MySQL は `mysql_schema.sql` → データ投入 → `mysql_indexes.sql` → `ANALYZE TABLE` の順に流す
（ANALYZE を省くとインデックスなしより遅くなることがある）。
