# UC 06: 撤回（ユースケース集の 6・7・56）

## 目的

配った設定を取り下げたとき（`REMOVE`・`SET` の `None`・前の版へのロールバック）に、端末の `settings.json` から本当に消えるか、
利用者が自分で入れた要素・キーが残るかを実物（`claude` 2.1.283・隔離ルート・ローカルの git 配信）で確かめる。
あわせて、ユースケース集の冒頭にある「E2E が SET だけを前提にしている疑い」を、壊した入力で実際に確かめる。

## 確かめる仮説（どう壊れうるか）

1. `REMOVE` が配った要素を消さない、利用者の要素まで消す、重複の片方だけ残す
2. `SET` の `None` がキーを消さない、兄弟の利用者キーまで消す
3. 版を下げる更新を Claude Code が受け付けない／受け付けても設定が前の状態に戻らない。`ONCE` の記録が戻り方を狂わせる
4. 既存の `e2e/test_settings.py` は ADD・REMOVE・None を判定しておらず（通るが判定していない）、足すと無関係の理由で落ちる
5. 撤回の手順（`release.md` 10 章の「ADD の要素は REMOVE に移す」）を誤ると、端末が壊れた状態で回り続ける

## 手順

一時スクリプト（このフォルダ）。どれも `e2e/` の部品（`E2ERoot`・`GitHttpServer`・`install`・`publish`・`session`）を import して使う。
pytest e2e は流していない。`policy.py` は `publish` の overrides で差し替え、開発ツリーの `plugin/` には触れていない。

- `uc06_lib.py`: 共有部品。一時ディレクトリ名を `cc-e2e-a-06-*` にする。`UC06_MUTANT` に壊した `_policy_ops.py` を指定すると、それも配る
- `scenarios.py`: シナリオ A（REMOVE）・A3（同じ要素を ADD と REMOVE の両方に書く誤り）・B（SET の None）・C1（版を下げる）・C2（前の中身を新しい版で配る）
- `gating.py`: `e2e/test_settings.py` のテスト関数 2 つに、policy を差し替えた `plugin/` の複製を `_market.PLUGIN_SRC` 経由で渡して直接呼ぶ
- `auth_check.py`: 認証ありの `claude -p`（haiku）1 回で、REMOVE と None が未ログインと同じく効くか
- `flaky_first_session.py`: 導入直後の 1 回目のセッションで適用が抜ける頻度と、そのときの hook の結果を数える
- `mutant_*.py`: 判定がゲートするかを見るために壊した `_policy_ops.py`（`remove_noop`: REMOVE が何も消さない／`remove_first`: 重複の最初の 1 つだけ消す／`none_noop`: None がキーを消さない）

実行: `CC_E2E_RUN=a .venv/bin/python tmp/e2e-load-testing/uc-06-policy-revoke/scenarios.py [A A3 B C1 C2]`（このフォルダを cwd にする）。
SessionStart の発火は未ログインの `session()` で十分（設定の適用に認証は要らない）。認証は `auth_check.py` だけで使った。

## 負荷の掛け方

- 更新は毎回、実物の 2 段階（`plugin marketplace update` → `plugin update`）で V1→V2→V3 と進める
- 利用者の手編集を挟む: 配列の独自要素・配った要素の重複・兄弟の独自キー・独自のトップレベルキー・`ONCE` の値の書き換え
- 実装を 3 通りに壊して、自分の判定と既存 E2E の判定が落ちるかを見る

## 結果

条件: macOS・`claude` 2.1.283・未ログイン（`auth_check.py` のみ認証あり）・Docker 不使用。1 シナリオ 20〜60 秒。

### A. REMOVE（UC 6）— 仕様どおり

V1 で `ADD permissions.deny [R1, R2]`、利用者が先に `deny [U]`・`allow`・独自キーを入れておく。
V1 の後に利用者が R1 をもう 1 つ足し、V2 で `ADD [R2]`・`REMOVE [R1]`。

| 確認 | 結果 |
| --- | --- |
| V1: ADD は利用者の要素の後ろに足す（`[U, R1, R2]`） | OK |
| V2: R1 は重複も含めて消え、`[U, R2]` になる | OK |
| V2: `allow`・独自キーは残る | OK |
| V2: policy 行 `remove:permissions.deny` は `applied`・value `["R1"]`、2 回目は `already_ok` | OK |
| V3（ADD・REMOVE の行を消しただけ）: R2 は端末に残る | OK（仕様どおり残る） |

利用者が自分で入れた要素でも、配った要素と等値なら REMOVE は消す（要素に持ち主の区別は無い）。仕様の範囲だが、利用者への説明は要る。

### A3. 同じ要素を ADD と REMOVE の両方に書く — 毎セッション書き込みとバックアップが起きる（不具合候補）

`ADD deny [R3]` と `REMOVE deny [R3]` を同じ版に書き、3 セッション起動した。

- 3 回とも `add:permissions.deny` と `remove:permissions.deny` が `applied`。**バックアップが 1→2→3 と毎回増えた**
- 最終の内容は変わらない（`[U]`）ので、利用者からは何も起きていないように見える
- バックアップは `_BACKUP_KEEP = 10` 世代なので、10 セッションで**撤回前の正しいバックアップが押し出されて消える**（推定。10 回は回していない）
- サーバでは、全端末が毎日 `applied` を 2 行ずつ送り続ける（推定）

原因: `plugin/hooks/_policy_ops.py:146-152` の `apply_ops` が ADD（足す→pending）→REMOVE（消す→pending）を同じ dict に続けて当て、
差分の有無を「最終の内容が元と違うか」ではなく「pending の項目があるか」（`plugin/hooks/_settings.py` の `apply_settings`）で決めている。
`release.md` 10 章は「`ADD` で配った要素は `REMOVE` に移す」と書くが、ADD から消し忘れるとこの状態になる。
`tests/plugin/test_policy_schema.py:84` の `test_定義の形` は ADD と REMOVE の重なりを検査しない。
同じ形の誤り（`SET` の list と `ADD` を同じパスに書く）も毎回書き込むと推定する（未実行）。

### B. SET の None（UC 7）— 仕様どおり

V1 で `env.CC_E2E_REVOKE="1"`・`includeCoAuthoredBy=false`・`sandbox.enabled=false`、利用者が `env.CC_E2E_USER` を入れておく。

| 確認 | 結果 |
| --- | --- |
| V2（行を消しただけ）: 3 キーとも端末に残る | OK（仕様どおり残る） |
| V3（None）: 3 キーとも消える | OK |
| V3: 兄弟の `env.CC_E2E_USER` は残る | OK |
| V3: policy 行は value=NULL・prev_value=旧値（`"1"`）・`applied`、2 回目は `already_ok`・prev=NULL | OK |

途中の dict は空になっても残る（`"sandbox": {}`）。Claude Code は空の dict を受け付けるので害は無いと推定（スキーマ検証は未実施）。

### C. 前の版へのロールバック（UC 56）

準備: V1（`SET env.CC_E2E_VAL=v1`・`ONCE env.CC_E2E_ONCE=a`）→ V2（`v2`・`ONCE b`・`ADD deny [R9]`）→ 利用者が `CC_E2E_ONCE` を `user` に変える。

| | C1: 前の中身を**版も V1 に戻して**配る | C2: 前の中身を**新しい版 V3** で配る（release.md の撤回） |
| --- | --- | --- |
| `claude plugin update` | rc 0、`updated from 0.2.3 to 0.2.2`。**版を下げる更新をそのまま受け付けた** | 通常の更新 |
| installed の版 | 0.2.2 | 0.2.4 |
| SET | `v1` に戻る | `v1` に戻る |
| ONCE（利用者は `user` にしていた） | **`a` で上書きされた**（`once:` 行 `applied`・prev `user`） | **`a` で上書きされた** |
| V2 で ADD した R9 | 残る | 残る |

- 外界の事実: `claude` 2.1.283 の `plugin update` は、マーケットプレイスの版が下がっていても入れ替える（rc 0）。自動更新（`DISABLE_AUTOUPDATER` を切った経路）での下げ方は未確認
- ONCE の記録（`once.json`）は**今の policy の組だけを残す**（`plugin/hooks/_settings.py:110-116`）。V2 で `[path, a]` の記録が消えるため、
  前の値に戻すと「値を変えて配った」扱いになり、利用者が変えた値を上書きする。仕様（「値を変えて配れば再度 1 回書く」）どおりだが、
  ユースケース集 56 の補足「ONCE の記録は governance/ に残るので、値を変えないと書き直されない」は**誤り**（前の値へ戻すと書き直される）
- ロールバックは ADD を戻さない。前の版に戻すだけでは、新版で足した要素が残る（REMOVE が要る）。版を下げても上げても同じ

### D. 既存 E2E（`e2e/test_settings.py`）が ADD・REMOVE・None でゲートするか

| policy（とプラグインの実装） | `test_SETが入り本体の書き込みも残る` | `test_2回目は適用済みで本体に取り込まれる` |
| --- | --- | --- |
| 本物と同じ SET だけ | PASS | PASS |
| SET に `None` を足す | PASS（**判定していない**） | FAIL `test_settings.py:85`（初回が `already_ok`） |
| ADD を足す | PASS（見ていない） | FAIL `test_settings.py:84`（key_name が SET だけの前提） |
| REMOVE を足す | PASS（見ていない） | FAIL（落ちた行は記録していない。ADD と同じ 84 行と推定） |
| SET の None ＋ **None を消さない壊れた実装** | **PASS** | FAIL（上と同じ理由。壊れたことを検出したのではない） |
| REMOVE ＋ **何も消さない壊れた実装** | **PASS** | FAIL（上と同じ理由） |

ユースケース集の疑い（冒頭の穴 2・3）は**実行で確認した**。

- `test_SET...` は `_dig` が「キーが無い」を None とみなす（`e2e/test_settings.py:33-39`）ので、空の `settings.json` では None の配布が消す前から一致する。壊れた実装でも通る
- `test_2回目...` は ADD・REMOVE・None のどれを足しても、実装が正しくても落ちる（偽の赤）。壊れた実装で落ちるのも同じ理由で、検出していない
- つまり E2E は、撤回の経路を**一切ゲートしていない**。今の本物の `policy.py` が SET だけなので表に出ていない

### 自分の判定がゲートすることの確認

`scenarios.py` を壊した実装で流した。

- `remove_noop`: A の「R1 が消える」「2 回目 already_ok」「V3 の残存」が NG
- `remove_first`（重複の片方を残す）: 「R1 が重複も含め消える」「2 回目 already_ok」が NG
- `none_noop`: B の「3 キーとも消える」「2 回目 already_ok」が NG

注意: 壊れた実装でも policy 行は `applied` になる（例 `remove_noop` で `remove:permissions.deny` が毎回 `applied`・value `["R1"]`）。
**policy 行は「消えた」ことの証拠にならない。**判定は `settings.json` の中身で行う必要がある。

### 認証あり（`auth_check.py`）

haiku で `claude -p` 1 回。REMOVE（利用者の要素は残る）と None（兄弟キーは残る）が未ログインと同じく効いた。費用は 1 回分（数セント未満と推定）。

### E. 高負荷時に SessionStart の hook が打ち切られ、その回の適用が丸ごと抜ける（`flaky_first_session.py`）

`scenarios.py A` の再実行 1 回で、V1 の 1 回目のセッションの policy 行が 0 件・ADD も未適用になった（その後の 3 回の再実行は全部 OK）。
導入→未ログインの `session()` 1 回を 12 回繰り返して数えた。

- 12 回中 1 回、stream-json の `hook_response` が `SessionStart:startup`・`exit_code 1`・**`outcome "cancelled"`**（セッション 11.8 秒。ほかは 2.5〜12.6 秒で `success`）
- その回は data に `identity.json`・`queue.jsonl` だけで、policy 行も設定の書き込みも無い。次のセッションで取り返す（A の V2 で `prev_value` NULL の `applied` を観測）
- `plugin/hooks/hooks.json` の SessionStart の `timeout` は 5 秒。測定時のロードアベレージは 17 前後（8 コア。ほかのトラックと並行）
- 推定: 5 秒の打ち切りに当たった。原子的置換なので `settings.json` が壊れることは無い見込み（打ち切りの瞬間を狙った確認はしていない）

影響: E2E（`test_settings.py` など 1 回目のセッションで判定するもの）は、マシンが重いと偽の赤になる。実端末でも、遅い端末では毎回打ち切られて設定が届かない可能性がある（推定）。
処理時間は UC 43（トラック C）の領分なので、数字はそちらへ渡す。

## 想定外だったこと

- A3: 撤回の手順の書き損じ 1 つで、全端末が毎セッション書き込み・バックアップを続け、正しいバックアップを押し出す
- C: 版を下げる更新が素直に通る。ONCE の記録が前の値を覚えていないので、ロールバックで利用者の値が上書きされる
- 壊れた実装でも policy 行は `applied` を名乗る（行だけを見る判定・画面は撤回の失敗を見抜けない）
- 並行負荷下で SessionStart の hook が 5 秒で打ち切られ（`cancelled`）、その回の適用と policy 行が丸ごと抜けた（12 回中 1 回）

## 課題と改善案

### `e2e/` の追加・修正

1. `test_settings.py:84-85` を SET 以外でも成り立つ形にする: `key_name` の期待値を `policy_key_name` で 4 表から組み、初回の期待を「`applied` か `already_ok`」に緩める（または初回に差分が出る項目だけを `applied` と期待する）
2. **既存値のある端末からの撤回を 1 本足す**（昇格候補。無言で壊れる）: 導入後に `settings.json` へ配った値・利用者の要素を入れ、`REMOVE` と `SET None` を含む版へ 2 段階で更新し、`settings.json` の中身で判定する。`scenarios.py` の A・B が雛形（1 本 30 秒程度）。policy は overrides で差し替え、本物の `policy.py` に依存しない
3. `_dig` のコメント（None を一致とみなす）に、空の設定では None の判定が空振りすることを書くか、None のキーは「導入前に在った」ことを前提として確かめる

3b. E2E の `session()` が stream-json の `hook_response` の `outcome` を見て、`cancelled` なら判定の前に「打ち切り」として失敗させる（偽の赤を設定の不具合と取り違えないため）

### `tests/`（E2E より安く確実）

4. `test_定義の形`（`tests/plugin/test_policy_schema.py:84`）に「同じパスの ADD と REMOVE に同じ要素が無い」を足す。SET の list と ADD／REMOVE の同じパスも禁止を検討
5. `_policy_ops`／`_settings` の単体テストに「ADD と REMOVE が打ち消し合う policy で 2 回適用しても 2 回目は書かない」を足す（今は失敗するはず。直すなら、pending の有無でなく適用後の dict が読んだ dict と等しいかで書くか決める案）
6. ONCE の記録を今の policy の組に絞る挙動（`_settings.py:110-116`）で、前の値に戻すと利用者の値を上書きすることをテストで固定するか、仕様として `docs/spec/plugin.md` に明記する

### `docs/guide/e2e.md`・`release.md`・仕様

7. `release.md` 10 章に「ADD から消さずに REMOVE に書くと毎回書き込み・バックアップが回る」ことと、ロールバック（版を下げる）でも ADD の要素と ONCE の上書きは戻らないことを書く
8. `docs/spec/plugin.md` の ONCE に「記録は今の policy の組だけを持つ。以前に配った値へ戻すと再び書く」を明記
9. `e2e.md` に「設定の配布のテストは空の settings.json から始まり、撤回（REMOVE・None）は判定しない」を限界として明記（2 を足すまで）

### e2e スキルの拡張

10. 設定の配布を変えた差分で、policy に SET 以外（ADD・REMOVE・ONCE・None）があれば「`test_2回目` は偽の赤、`test_SET` は None を判定しない」と報告し、`scenarios.py` 型の一時スクリプト（既存値の注入→2 段階更新→中身で判定）で補う枝を持たせる

### `docs/knowledge/` に足す外界の事実

11. `claude` 2.1.283: `claude plugin update` はマーケットプレイスの版が下がっていても入れ替える（`updated from 0.2.3 to 0.2.2`、rc 0）。このとき `plugin marketplace update` は既存のクローンを作り直していた（`Replacing the existing marketplace clone`）。履歴を書き換えた force push での挙動は未確認

## 片付けたもの・残したもの

- 隔離ルート（`$TMPDIR/cc-e2e-a-06-*`）と plugin の複製（`cc-e2e-a-06-src-*`）: 各シナリオの終わりに削除。残骸なしを確認
- git 配信サーバ: プロセス内のスレッドで、スクリプトの終了とともに停止。起動した `claude` はすべて `-p`・逐次（同時 1 つ）で、残存プロセスなし
- Docker: 不使用
- 本物の `~/.claude`: 3 ファイルに今回の隔離ルート名・ポートの痕跡が無いことを各スクリプトの最後に確認
- `e2e/__pycache__/` が在る（`.gitignore` 済み。部品の import で生じた。ほかの UC の import でも生じうる）。消していない
- ログ・結果の JSON: `product/cc-governance-bmsd/.local/e2e-load-testing/uc-06-policy-revoke/`（`results-*.json`・`gating.log`）。
  `results-A.json` は最後の正常な再実行のもの。打ち切りが起きた回の stream-json は `flaky.json` にある
- コード変更: なし（`plugin/`・`e2e/` とも未変更）
