# verification/

実機検証で使う道具のカタログ。何があり、何のためにあるかを示す。確かめる順序と合格の条件は
`docs/guide/local-e2e.md` にある。各スクリプトの引数と挙動は、それぞれのファイルの冒頭にある。

採取したログ・transcript・生データはここに置かない。

## fixture-sanitization/ — フィクスチャの無害化

| ファイル | 用途 |
| --- | --- |
| `sanitize_fixtures.py` | 実採取した hook stdin から自由文と個人のホームディレクトリを取り除き、`tests/fixtures/hook_inputs/` を作り直す |

`python3 fixture-sanitization/sanitize_fixtures.py <採取先ディレクトリ>`

**書き込み先は `tests/fixtures/hook_inputs/` に固定で、実行のたびに空にしてから書き直す。**
採取先を間違えると既存のフィクスチャが消える。実行前に、採取先に採取済みの stdin が揃っていることを確かめる。

## hook-behavior/ — Claude Code が hook に何を渡すかを調べる

| ファイル | 用途 |
| --- | --- |
| `capture_hook_stdin.py` | 任意の hook の stdin をそのままファイルに保存する |
| `stop_transcript_survey.py` | Stop hook の時点で transcript がどこまで書かれているかを記録する |
| `build_notice_message.py` | `systemMessage` が何文字まで届くか・どこで切られるかを確かめる |
| `scriptname_subpath_app.py` | `SCRIPT_NAME` によるサブパス配備での URL 生成とルーティングを確かめる最小 Flask アプリ |
| `plugin-data-probe/marketplace/` | プラグインのデータ領域（`CLAUDE_PLUGIN_DATA` とその展開値）を採取する擬似マーケットプレイス |

### capture_hook_stdin.py を仕込むときの罠

隔離 `CLAUDE_CONFIG_DIR` の `settings.json` の `hooks` に、イベントごとに 1 エントリを足す。

```json
{ "hooks": { "PreCompact": [ { "matcher": "*", "hooks": [ { "type": "command",
  "command": "CAPTURE_DIR=\"/path/without/space/captured\" python3 \"/path/to/verification/hook-behavior/capture_hook_stdin.py\" PreCompact" } ] } ] } }
```

- **`CAPTURE_DIR` は `command` 文字列の中に書く。**hook エントリに `"env"` を付けると、そのエントリが無音で無効になる。空白を含むパスは壊れる
- **`PostToolUse` / `PostToolUseFailure` は `"matcher": "*"` が無いと発火しない**
- **1 つの matcher ブロックに複数コマンドを並べると、2 番目以降は実行されない。**イベントごとにブロックを分ける
- `settings.json` の hooks が `claude -p` で発火しないことがある。そのときはマーケットプレイスのコピーの `hooks/hooks.json` に仕込む（反映には cache の削除が要る）

### その他の注意

- `scriptname_subpath_app.py` は `.venv/bin/python` で動かす（システムの `python3` には Flask が無い）。サブパス無しのアクセスも素通しで `200` を返す。サブパスの境界を強制するのは前段のリバースプロキシであり、このアプリはそれを検査しない
- `plugin-data-probe/` は `autoupdate/isolated_home_run.sh` の隔離 HOME に仕込んで使う

## autoupdate/ — 配布経路が端末まで降りるかを調べる

| ファイル/ディレクトリ | 用途 |
| --- | --- |
| `githttpd.py` | bare リポジトリを http で配る最小の git サーバ（localhost 限定）。`claude plugin marketplace add` が bare を直接指せないために使う。`python3 githttpd.py <bare の親ディレクトリ> <ポート>` |
| `run.sh` | 隔離 HOME（`home-<n>/`）で `claude` を起動する |
| `snap.sh` | 隔離 HOME で自動更新がどこまで進んだかを一覧表示する |
| `isolated_home_run.sh` | 隔離 HOME で `claude` を起動し、データ領域の作られ方を確かめる |
| `marketplaces/au-verify/` | 擬似マーケットプレイス（プラグイン名 `audummy`。SessionStart で版を `$HOME/captured.log` に書く） |

- 各擬似マーケットプレイスは、`*-bare.git` が履歴の正本で、隣のディレクトリは `.git` を持たないスナップショットである。作業コピーは bare から clone して作る
- `home-<n>/` は実行のたびに自分で用意する作業データであり、リポジトリに含まれない
- 隔離 HOME に擬似マーケットプレイスを置くときは、`.claude/settings.json` の `extraKnownMarketplaces` にも登録する。`settings.json` がセッション開始時に `known_marketplaces.json` へ同期されるため

## performance/ — 性能の測定を再現する

| ファイル | 用途 |
| --- | --- |
| `sqlite_bench.py` | `events` の `COUNT(DISTINCT event_id)` を被覆インデックスあり/なしで計測する（SQLite）。`python3 sqlite_bench.py <db> <日数> <1日の行数>` |
| `mysql_schema.sql` | サーバのテーブル定義の MySQL 版。型・制約が通るかを確かめる |
| `mysql_indexes.sql` | 上のテーブルに対する被覆インデックス |

**`ANALYZE` を省くと、インデックスありの方が無しより遅くなることがある。**`sqlite_bench.py` は
`ANALYZE` を呼ばないので、インデックスの効果を見るときは計測前に手で実行する。MySQL は
`mysql_schema.sql` → データ投入 → `mysql_indexes.sql` → `ANALYZE TABLE` の順に流す。
