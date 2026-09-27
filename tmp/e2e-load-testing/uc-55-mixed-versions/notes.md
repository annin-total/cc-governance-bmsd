# UC 55 版の混在（ユースケース集 55・52）

Claude Code 2.1.283。日付 2026-09-27。トラック C（`CC_E2E_RUN=c`）。

## 目的

1. 契約の違う旧版と新版の端末が、同時に同じ集計サーバへ送ったとき、両方の行が DB に入るか。欠けた列・余分な列・改名した列がどう扱われるか。spool に残り続けるか、error 行が出るか、概況の画面にどう出るか
2. （UC 52）`plugin.json` の `version` を上げずに中身を変えて publish し直したとき、端末に中身が届くか。版を上げた場合との対比。届いた版はサーバの `plugin_version` にどう出るか

## 確かめる仮説（どう壊れうるか）

- 旧版の欠けた列は黙って NULL、余分な列は黙って捨てられる（CLAUDE.md「契約のドリフトは完全に無言」）
- 必須の列（`event_id`・`ts`）が欠けると、行ごと捨てられるのに 200 が返り、端末は spool を消す（欠測が端末にもサーバにも残らない）
- 受信は 401 以外の 4xx を返さないので、契約違いで spool に残り続けることは無い
- 版を上げない publish は `claude plugin update` で届かない（キャッシュが `cache/<mp>/<plugin>/<version>/` で版ごとに分かれる）

## 手順

一時スクリプト（このフォルダ）。すべて `e2e/` の部品（E2ERoot・GitHttpServer・install・publish・DockerServer・ingest_config・session）を import して使う。開発ツリーの `plugin/` は書き換えていない（contract.py の変種は publish の overrides で組み立てコピーにだけ入れた）。

- `_uc55.py`: 契約の変種の生成と、端末（隔離ルート + git 配信）の部品
- `run_mixed.py [--auth]`: 5 端末を導入し、同時に送らせ、DB と概況の HTML を `.local/.../uc-55-mixed-versions/mixed-*/` に取り出す
- `judge.py <出力> [--break]`: 端末ごとに、送った行（端末側の控え）と DB の行を event_id で突き合わせる
- `run_bump.py`: UC 52

端末（版は開発ツリーの 0.2.1 の patch +n）:

| 端末 | 版 | contract.py の変更 |
| --- | --- | --- |
| minus1 | 0.2.2 | HOOK_FIELDS から `permission_mode` を除く（1 列少ない） |
| plus1 | 0.2.3 | HOOK_FIELDS に `hook_event_name_x`（hook_event_name を読む）を足す（1 列多い） |
| renamed | 0.2.4 | 列名 `tool_name` → `tool`（キーパスは同じ） |
| ts_renamed | 0.2.5 | EXTRA_COLUMNS の `ts` → `timestamp`（必須列の改名。policy・error の ts は変えない） |
| new | 0.2.6 | 変更なし（現行） |

送った行を漏れなく控えるため、導入直後に `sent_at` を作って最初の SessionStart での即時送信を止め、全セッションの行を queue にためてから控えを取り、`sent_at` を消して 5 端末の未ログインのセッションを同時に起動して送らせた。

## 負荷の掛け方

- 未ログインの `-p ok` を 5 端末で並行（同時 3 つまで）
- 認証ありの `-p`（haiku・Read だけ許可・a.txt と b.txt を読む 3 ターン）を new×2・minus1・renamed×2・plus1 の 6 本、同時 3 つまで
- 送信は 5 端末の未ログインのセッションを同時に起こして、5 つの送信プロセスが同じサーバへ並行に POST する形

## 結果

### 1. 版の混在（認証あり 6 本 + 未ログイン 10 本、`mixed-auth-*`）

| 端末 | 送った行 | DB に入った行 | NULL を強いられた列 | 黙って捨てられた列 | 1 行も入らなかった種類 | spool の残り | error 行 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| minus1 | 11 | 11 | permission_mode | — | — | 無し | 0 |
| plus1 | 11 | 11 | — | hook_event_name_x | — | 無し | 0 |
| renamed | 18 | 18 | tool_name | tool | — | 無し | 0 |
| ts_renamed | 4 | **2** | （ts） | timestamp | **event（全部）** | 無し | 0 |
| new | 18 | 18 | — | — | — | 無し | 0 |

- 送った列と DB の値は、共通する列ですべて一致（不一致 0）。同時送信で行の取り違え・欠落は無かった
- **ts_renamed は event 行が 1 行も入らないのに、error 行も spool の残りも無い。**サーバは `ts` の無い行を破棄件数に数えて 200 を返し、端末の送信プロセスは 2xx なので spool を消す。応答本文の `dropped` は誰も見ない。policy 行（ts を変えていない）は入るので、概況の版の分布にはその端末が普通に現れる。サーバの `parse_lines` に同じ 4 行を渡して stored 2 / dropped 2 になることを別途確かめた（HTTP 応答そのものは記録していない）
- 4xx は一度も返らなかった。受信が返す 4xx は 401（トークン誤り）だけ（`server/ccgov/web/ingest_api.py`）で、契約の違いでは返らない。したがって契約違いで spool に残り続けるケースは無い（コードと観測の両方）
- 未ログインだけの試行（`mixed-noauth-*`、各端末 4 行）でも同じ表になった

概況の画面（`/`）での見え方:

| 表 | 表示 | 読み取れること |
| --- | --- | --- |
| NULL 率 | tool_name 33.3%「注意」（PostToolUse 12 行中 renamed の 4 行）、context_tokens 0.0% | renamed の欠測は見える |
| NULL 率 | permission_mode は表に無い | **minus1 の欠測は見えない**（NULL 率の対象は 4 列だけ） |
| permission_mode 別の件数 | default 23 | NULL を数えないので minus1 の分は黙って消える |
| 版の分布 | `0.2.6 1`（未ログインの試行では `0.2.5 1`） | **5 端末が 1 台に潰れる。**分布は (user_email, host) ごとの最新 1 行で、隔離ルートは同じ host・user_email は NULL のため。どの版が「最新」かは版の大小でなく ts の新しさで決まる |
| hook の失敗 | 空 | ts_renamed の全欠測は出ない |
| 利用者数 | 0（セッション数 14） | API キー認証・未ログインでは user_email が NULL |

判定のゲートの確認（`judge.py --break`）: (1) 誤った期待（minus1 に NULL 無し・ts_renamed は全部届く）で minus1 と ts_renamed が不合格、(2) DB のコピーで minus1 の 1 行に permission_mode='default' を入れると値の不一致で不合格。どちらも落ちることを確かめた。

### 2. 版の上げ忘れ（UC 52、`bump-*`、未ログインのみ）

中身の違いは `hooks/_uc55_marker.txt`（A→B→C）で見た。4 回実行し、完走した 2 回（うち 1 回は uninstall の段なし）で同じ結果。表は最後の回。

| 段 | installed_plugins の版 | installPath の中身 | マーケットプレイスの clone |
| --- | --- | --- | --- |
| 0.2.12（A）を導入して起動 | 0.2.12 | A | A |
| 同じ 0.2.12 で B を publish → 起動 ×2 | 0.2.12 | A | A |
| `plugin marketplace update` | 0.2.12 | A | **B** |
| `plugin update` →「already at the latest version (0.2.12)」 | 0.2.12（gitCommitSha も不変） | **A（届かない）** | B |
| `plugin uninstall` → `install`（同じ版のまま） | 0.2.12（gitCommitSha が変わる） | **B（届く）** | B |
| 0.2.13 で C を publish → 起動 ×2 | 0.2.12 | B | B |
| `marketplace update` + `plugin update` →「updated from 0.2.12 to 0.2.13 … Restart to apply changes.」 | 0.2.13 | C | C |

- 版を上げない publish は、`marketplace update` で clone までは届くが、`plugin update` は版だけを比べて「最新」と答え、installPath（`cache/.../0.2.12/`）は古い中身のまま。**端末は旧い中身で動き続け、何も警告しない**
- uninstall → install なら同じ版でも新しい中身が同じ `0.2.12/` に入る
- サーバの policy_state の版は `0.2.12` 12 行・`0.2.13` 2 行。中身 A で動いた行と B で動いた行はどちらも `0.2.12` で、**サーバからは区別できない**
- 起動だけでは、版を上げた場合も含めて更新は起きなかった（`known_marketplaces.json` の autoUpdate は 2 回目の起動から true）。ただし隔離 env は `DISABLE_AUTOUPDATER=1` を固定で付け、起動は未ログインの `-p`。起動時の自動更新が無いのがこのどちらによるものかは**未確認**

## 想定外だったこと

- 最初の試行（sent_at を作らない版）で、ある端末で未ログインのセッション後に `sent_at` が無かった（最初の送信が起きていない）。5 端末を 3 並行で起動し 41.7 秒かかった回。原因は未調査（hook のタイムアウトか、起動の失敗かは不明）。2 回目以降は sent_at を先に作る手順に変えたため再現していない
- 版の分布が隔離ルートの数でなく 1 台になった（上記）

## 課題と改善案

- **サーバ（本物に入れるべき候補）**: `ts` や `event_id` の欠けた行を破棄して 200 を返すのは、欠測がどこにも残らない。破棄件数を errors に 1 行積む（stage=`ingest`、error_type=`dropped`）か、概況に破棄件数を出す。応答の `dropped` を端末は使っていない
- **サーバ**: 概況の NULL 率の対象が 4 列だけで、permission_mode・effort_level・source などの欠測は分布表からも黙って消える。分布表に「NULL」の行を出すか、NULL 率の対象を契約の全列にする（UC 31 の発見と同じ）
- **サーバ**: 版の分布は (user_email, host) の最新 1 行で数えるため、user_email が NULL の端末（API キー認証）は host ごとに 1 台へ潰れる。1 人が複数の CLAUDE_CONFIG_DIR を使う場合も同様。仕様として docs に書くか、キーを見直す
- **`server/tests/`**: 旧版の行（列が少ない・多い・改名・ts 欠落）を受信させ、NULL 化・破棄を固定するテストを置く（ユースケース集の補足どおり。E2E より安く確実）
- **`e2e/`**: 版の分布を E2E で見るなら、端末ごとに host か user_email を変える手段が要る（今は変えられない）
- **`e2e.md` / e2e スキル**: 「最初の SessionStart で即送信されるので、控えを取る前に `sent_at` を作って送信を止める」手順は、送った行を漏れなく突き合わせたい検証で再利用できる。`_flow` に部品化してもよい
- **`docs/knowledge/`（外界の事実、2.1.283）**:
  - `claude plugin update` は版（`plugin.json` の version）だけで判定し、同じ版で中身が変わっても「already at the latest version」と答えて installPath を更新しない。`marketplace update` は clone を最新のコミットにする。`uninstall` → `install` は同じ版でも新しい中身を同じ `cache/<mp>/<plugin>/<version>/` に入れ直し、`gitCommitSha` も更新する
  - `plugin update` の成功時の表示は「updated from X to Y for scope user. Restart to apply changes.」
- **release.md（UC 52）**: 版の上げ忘れはサーバの `plugin_version` からは検出できない（同じ版の新旧の中身が区別できない）。リリース前の版上げの確認が唯一の防御である旨を明記する

## コードの変更

- 本体（`plugin/`・`server/`・`e2e/`）は変えていない。このフォルダの一時スクリプトだけ

## 片付けたもの・残したもの

- Docker: `cc-e2e=c` のコンテナ・イメージは各スクリプトの finally で削除。終了後に `docker ps -a` / `docker images` をラベルで確認して 0 件
- 隔離ルート: 各スクリプトの finally で cleanup。`$TMPDIR/cc-e2e-*` に自分のものは残っていない（残っているのはトラック A・B のもの）
- 送信プロセス: 残っていない
- 残したもの: `.local/e2e-load-testing/uc-55-mixed-versions/` に mixed-noauth-*（3 回。1 回目は sent_at 無しで途中停止）・mixed-auth-*・bump-*（4 回。途中停止 2 回はスクリプトの不備で、data ディレクトリの有無の扱い）の DB・送った行・概況の HTML・ログ

## 費用

認証ありのセッション 6 本（haiku）で計 約 0.069 USD（`total_cost_usd` の合計）。
