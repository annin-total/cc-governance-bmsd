# UC 60: 撤去と再導入（ユースケース集の 60・30）

## 目的

`claude plugin disable`・`claude plugin uninstall` の後に端末に何が残り、ステータスラインが動き続けるか、
入れ直したときに既読・ONCE の記録・バックアップがどう引き継がれるかを実物で確かめる。

## 確かめる仮説（どう壊れうるか）

- 撤去後、settings.json の `statusLine.command` が宙づりのスクリプトを指し、ステータスラインがエラーになる
- 配った値（SET・ONCE）や `extraKnownMarketplaces.<mp>.autoUpdate` が残り、マーケットプレイスを外すと `source` の無い項目だけが残って settings.json ごと無効になる（UC 13 の読み捨て）
- 再導入で既読が消え、過去のお知らせが再表示される（ユースケース集のコードからの推定）
- 再導入で `once.json` が残るため ONCE は書き直されない（同）。逆に `governance/` を片付けた後の再導入では、利用者が変えた値を ONCE が上書きする
- `disable` でも data が消える、または hook が動き続ける

## 手順

一時スクリプト `run.py`（e2e の `_root`・`_flow`・`_market`・`_githttp` を import。UC 01 の `run.py` の雛形を流用）。
`install` の overrides で `hooks/policy.py` を差し替えた版（SET: `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` "60" と本物の autoUpdate、
ONCE: `policy_sample.py` と同じ `statusLine`（`node "${GOVERNANCE_HOME}/statusline.js"`）と `env.GOV_E2E_ONCE` "a"）を git source で導入する。
お知らせは同梱の `notices.json`（1 件・url なし）。セッションは未ログインの `claude -p ok --output-format stream-json --verbose`
（SessionStart は発火する。認証・費用・Docker なし）。お知らせの有無は SessionStart の `hook_response` の `systemMessage` で見る。

- `-p` は既読を書かない（`CLAUDE_CODE_ENTRYPOINT` が `sdk-`）ので、「対話起動で読んだ」状態は data の `seen.json` に通知 ID を直接書いて模した
- ステータスラインは `-p` では描画されないので、settings.json の `statusLine.command` を `/bin/sh -c` で、隔離 env・サンプルの stdin JSON を与えて実行した（本体が描画に使う経路そのものではない）

```
CC_E2E_RUN=a .venv/bin/python tmp/e2e-load-testing/uc-60-uninstall-reinstall/run.py [R1 R2 R3 R4]
```

| 経路 | 操作 |
| --- | --- |
| R1 | 導入 → s1 → 既読化 → s2 → `disable` → s3 → `enable` → s4 → 利用者が ONCE の値を "user" に → `uninstall` → s5 → ステータスライン（`governance/` あり・一時的に退避）→ `doctor` → 同じ版を `install` → s6 |
| R2 | 導入 → s1 → `uninstall` → `marketplace remove` → `doctor`・ステータスライン → `marketplace add` → `install` → s2 |
| R3 | 導入 → s1 → `uninstall` → 利用者が `governance/` を消し、`statusLine` を自前（`echo mine`）に、ONCE の値を "user" に → `install` → s2 |
| R4 | 導入 → s1 → 既読化 → `uninstall --keep-data` → `install` → s2 |

## 負荷の掛け方

経路ごとに隔離ルート 1 つ、`claude` は常に 1 つ（逐次）。セッション 13 回、CLI（install・uninstall など）約 20 回、`doctor` 2 回。

## 結果（2026-09-27、macOS・claude 2.1.283・node v24.19.0・未ログインの `-p`）

`run.py R1` と `run.py R2 R3 R4` で、置いた判定 13 個がすべて期待どおり。記録は `.local/e2e-load-testing/uc-60-uninstall-reinstall/R1〜R4.json`。

### 撤去で残るもの・消えるもの（事実）

| 対象 | `disable` 後 | `uninstall` 後 | `uninstall --keep-data` 後 |
| --- | --- | --- | --- |
| settings.json の `enabledPlugins` | `"governance@…": false` | 項目が消える（`{}` が残る） | 同左 |
| settings.json の `statusLine`・`env`（配った値・ONCE の値）・`extraKnownMarketplaces.<mp>`（`autoUpdate: true` を含む） | 残る | **残る（`enabledPlugins` 以外のキーの値は変わらない。dict で比較）** | 残る |
| `<config>/governance/`（`statusline.js`・`once.json`・`backups/`） | 残る | 残る | 残る |
| `plugins/data/<plugin>-<mp>/`（`seen.json`・`identity.json`・`queue.jsonl`・`spool/`・`sent_at`） | 残る | **消える（未送信の queue・spool ごと）** | 残る |
| `plugins/cache/<mp>/governance/<ver>/` | 残る | 残る（`.orphaned_at` が付く） | 同左 |
| `claude doctor` の `Invalid settings` | — | 出ない | — |

- `disable` 中・`uninstall` 後のセッションでは、うちの hook は起動されない（`hook_response` 0 件、行 0 件、init の plugins から消える）
- `marketplace remove` は `extraKnownMarketplaces.<mp>` の項目を**うちの `autoUpdate` ごと**消す（`{}` が残る）。`source` の無い項目は残らず、`doctor` も不正を出さない。仮説「宙づりの autoUpdate で settings.json ごと無効」は起きなかった

### ステータスライン（事実。シェルで実行した結果）

| 状態 | 終了コード | 標準出力 | 標準エラー |
| --- | --- | --- | --- |
| 導入中・`disable` 中・`uninstall` 後・`marketplace remove` 後 | 0 | `Opus \| project \| ctx 12%` | 空 |
| `uninstall` 後に `governance/` を消した | **1** | 空 | node の `Error: Cannot find module '<config>/governance/statusline.js'`（`MODULE_NOT_FOUND`）とスタック |

- 撤去後も `statusLine` は `governance/statusline.js` を指し続け、ファイルが残るので**動き続ける**。壊れるのは利用者が `governance/` を片付けたとき（`statusLine` を先に外さない場合）
- その状態で本体が画面に何を出すか（空行・エラー表示）は**未検証**（対話起動が要る）

### 再導入（事実）

| 経路 | お知らせ | ONCE | settings.json | バックアップ |
| --- | --- | --- | --- | --- |
| R1 既定の uninstall → install | **再表示される**（既読の `seen.json` が data ごと消えたため） | `already_ok`（`once.json` が残る）。利用者が撤去中に変えた "user" は守られる | 変わらない（全キー already_ok で書き込みなし） | 1 のまま（増えない） |
| R2 marketplace remove → add → install | 再表示 | `already_ok` | `autoUpdate` だけ prev None / applied で書き直される（`marketplace add` が `source` だけの項目を作るため） | 1 → 2 |
| R3 `governance/` を片付けてから install | 再表示 | **`applied`: 利用者の `statusLine`（`echo mine`）と "user" を配った値で上書き**。`statusLine` の行は prev_value が NULL（dict はスカラ以外で NULL にする仕様、`docs/spec/plugin.md` 96 行） | 上書き。`statusline.js` も再作成され、ステータスラインは再び動く | 新しく 1 |
| R4 `uninstall --keep-data` → install | **再表示されない**（`seen.json` が残る） | `already_ok` | 変わらない | 1 のまま |

- 同じ版の再導入では、キャッシュの `<ver>/` がそのまま使われ、`.orphaned_at` が消える
- 再導入の後、data は新しく作られる（`identity.json` も作り直し）

### 判定がゲートしていることの確認

すべての判定に、同じ実行の中に逆の結果になる対照がある: お知らせ（s1 出る／s2 出ない／s6 出る／R4 出ない）、hook の起動（s3・s5 は 0 件／s4・s6 は 6 件）、
ステータスライン（`governance/` あり rc 0／退避で rc 1）、ONCE（R1 already_ok で "user" 維持／R3 applied で "a" に上書き）。
判定式を壊した入力で落とす別の実行は行っていない。

## 想定外だったこと

1. **`uninstall` は data を消すので、未送信の `queue.jsonl`・`spool/` が黙って失われる**（事実: data ディレクトリが消える。本 UC は送信先が空なので行が必ず残っていた）。本番では最後の送信間隔（既定 600 秒）の分と、オフライン中に溜まった spool が届かない（推論）。`--keep-data` を付ければ残る
2. `marketplace remove` が `extraKnownMarketplaces.<mp>` を我々のキーごと消すため、宙づりは起きない（仮説は外れた）
3. 隔離した config でも、init の plugins に `agents-md`・`telemetry` が常に現れる。由来は未確認（本体の組み込みと推測）。本 UC の判定には影響しない

## 課題と改善案

- **利用者向けの撤去手順（`docs/` のどこかに新設。置き場所は監督の判断）**: 
  1. 送信を済ませたいなら、撤去の前にセッションを 1 回開いて閉じる（または `--keep-data`）。`uninstall` は未送信分を消す
  2. `statusLine` を使い続けないなら、**settings.json の `statusLine` を先に外してから** `governance/` を消す。逆順だと node の `MODULE_NOT_FOUND` でステータスラインが失敗する
  3. 配った値（`env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` など）は撤去しても settings.json に残る。消すなら手で消す
  4. `governance/` を消してから入れ直すと、ONCE が利用者の値を上書きする。入れ直す予定があるなら `governance/` を残す
- **`docs/spec/plugin.md`（「このディレクトリはアンインストールしても残る」の近く）**: 撤去で `seen.json` が消えるので再導入でお知らせが再表示されること、`once.json` が残るので ONCE は再度書かれないこと、`governance/` を消すと ONCE が再度書かれることを 1〜2 行で足す候補
- **`e2e/test_install.py`（低優先）**: `test_uninstallでdataが消えgovernanceは残る` は `statusline.js` の存在だけを見る。`statusLine.command` を実行して rc 0 を見るのは、現在の `policy.py` が `statusLine` を配らないので判定する対象が無い。配るようになったら、ONCE で `statusLine` を配る版で「撤去後に command が rc 0」「再導入で ONCE already_ok」を足す。無言で壊れる経路ではないので、今は足さない（戦略書の「昇格は無言で壊れる・リリースを止めるものに限る」）
- **`docs/knowledge/claude-code-behavior.md`（「プラグインの配置と更新」の表）に足す事実**（2.1.283）:
  - `plugin uninstall` は settings.json の `enabledPlugins` の項目を消すだけで、ほかのキーには触れない。`--keep-data` で data を残せる
  - `plugin disable` は `enabledPlugins` を `false` にし、data は残る。hook は起動されない
  - `plugin marketplace remove` は `extraKnownMarketplaces.<mp>` を、利用者やプラグインが足したキー（`autoUpdate`）ごと消す。`marketplace add` は `source` だけの項目を作る
  - 同じ版の再導入はキャッシュを再利用し、`.orphaned_at` を消す
- **e2e スキル・`e2e.md`**: ステータスラインは `-p` で描画されないので、「`statusLine.command` を隔離 env のシェルで実行する」を確認手段として書き足す候補。本体の描画での見え方は対話起動の手動確認として残す

## 片付けたもの・残したもの

- 片付けた: 隔離ルート（`$TMPDIR/cc-e2e-a-60-*`）と git 配信サーバ。`ls $TMPDIR | grep cc-e2e-a-60` が空、`pgrep -f cc-e2e-a-60` が該当なし
- 本物の `~/.claude` の settings.json・installed_plugins.json・known_marketplaces.json に本 UC の痕跡（`cc-e2e-a-60-`・`GOV_E2E_ONCE`）が無いことを確認
- 残した: `run.py`・この `notes.md`。記録は `.local/e2e-load-testing/uc-60-uninstall-reinstall/R1〜R4.json`（一時パス・ローカルのポートを含む。認証は使っていない）
- 未実施: 対話起動でのステータスラインの表示（`governance/` を消した後の本体の見え方）、新しい版への再導入（同じ版のみ）
