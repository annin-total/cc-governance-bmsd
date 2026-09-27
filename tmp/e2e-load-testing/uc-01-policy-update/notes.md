# UC 01: 配布値の更新の経路（ユースケース集の 1・4）

## 目的

E2E は空の settings.json への新規導入から始まる。前の版の値が入った端末を新しい版へ更新したときに、
settings.json と policy 行（value・prev_value・apply_result）がどうなるかを実物（`claude` 2.1.283・git source の導入・`plugin update`）で確かめる。
組み合わせの網羅は `tests/` の領分とし、ここでは代表の経路を 4 本通す。

## 確かめる仮説（どう壊れうるか）

- 更新後の最初の SessionStart で新しい値が書かれず、旧版の `policy.py` が動き続ける
- prev_value が旧値を持たない（サーバの準拠判定が狂う）
- ONCE の値を差し替えても再度書かれない、または以後も毎回書き戻す
- 利用者が値の型を変えた端末で、無言で壊れる
- 途中のキーが dict でない端末で、例外や設定の破壊が起きる

## 手順

一時スクリプト `run.py`（e2e の `_root`・`_flow`・`_market`・`_githttp` を import して使う）。
`install` / `publish` の overrides で `hooks/policy.py` を差し替えた版を作り、`test_install.py` と同じく
`plugin marketplace update` → `plugin update` で版を上げる。セッションは未ログインの `claude -p ok`（SessionStart は発火する。認証・費用なし）。
policy 行は `queue.jsonl` と `spool/*.jsonl` をローカルで読む（送信先は空。サーバ・Docker は使っていない）。

```
CC_E2E_RUN=a .venv/bin/python tmp/e2e-load-testing/uc-01-policy-update/run.py [gate R1 R2 R3 R4]
```

`probe.py` は、settings.json の 1 キーを任意の値に変えた後の `claude -p` の init メッセージと `plugin list` を見る補助。

| 経路 | 旧版 V1 → 新版 V2 | 利用者側の状態 |
| --- | --- | --- |
| R1 | SET `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` "60"→"50"、ONCE `env.GOV_E2E_ONCE` "a"→"b" | V1 の間に AC を int 60 に、ONCE を "user" に変える。V2 の後にもう一度 ONCE を変える |
| R2 | SET "60"→"50"、ONCE "a" のまま | 導入前から SET・ONCE と同値。V2 の前に ONCE を "user" にし、`once.json` を消す |
| R3 | R1 と同じ | V1 の後に `env` を文字列 "broken" にしてから更新。その後 `env` を `{}` に直す |
| R4 | V2 で SET に `cleanupPeriodDays: "30"`（文字列。上流の型は数値）を足す。V3 で int 30 に直す | なし |

## 負荷の掛け方

経路ごとに隔離ルート 1 つ、`claude` は常に 1 つだけ（逐次）。セッションは合計 15 回＋ probe 3 回。

## 結果（2026-09-27、macOS・claude 2.1.283・未ログインの `-p`）

`run.py gate R1 R2 R4` と、期待値を直した後の `run.py R3` で「すべて期待どおり」。行は `.local/e2e-load-testing/uc-01-policy-update/R*.json`。

| 経路・セッション | policy 行（value / prev_value / apply_result / plugin_version） | settings.json |
| --- | --- | --- |
| R1 s1 V1 | AC 60 / None / applied / 0.2.2、once a / None / applied | AC "60"、ONCE "a" |
| R1 s2 V1（int 60・ONCE "user"） | AC **60 / 60 / applied**、once a / user / already_ok | AC が文字列 "60" に戻る。ONCE は "user" のまま |
| `plugin update` 直後（セッション前） | 行なし。バックアップも増えない | 旧値のまま |
| R1 s3 V2 | AC 50 / 60 / applied / 0.2.3、once b / user / applied | AC "50"、ONCE "b"。`once.json` は新値の記録だけ |
| R1 s4 V2 | すべて already_ok | 変化なし |
| R1 s5 V2（ONCE を "user2" に） | once b / user2 / already_ok | "user2" のまま（2 回目は書かない） |
| R2 s1 V1（導入前から同値） | AC 60 / 60 / already_ok、once a / a / already_ok（記録は作られる） | 変化なし |
| R2 s2 V2（`once.json` 喪失・ONCE の値は据え置き） | AC 50 / 60 / applied、once **a / user / applied** | 利用者の "user" が "a" に戻される |
| R3 s2 V2（`env` が文字列） | **行が 1 つも無い**（event 行も error 行も無い） | 触れられない（"broken" のまま） |
| R3 s3 V2（`env` を `{}` に直す） | AC 50 / None / applied、once b / None / applied | 追いつく |
| R4 s2 V2（型違いの値を配る） | cleanupPeriodDays 30 / None / applied | `"cleanupPeriodDays": "30"` が書かれる |
| R4 s3 V2 | **行なし**。`plugin list` は `enabled: false` | — |
| R4 s4 V3（直した版へ `plugin update`） | **行なし**。`plugin update` 自体は成功し 0.2.4 が入るが `enabled: false` のまま | "30" のまま（直らない） |

判定がゲートしていることの確認: `gate` で、正しい期待値は通り、value・prev_value・apply_result・版を 1 つずつ違えた 4 通りと行の欠落の計 5 通りがすべて不一致になることを確かめた。
R3 の当初の期待（skipped_missing）が実際に落ちたことも、判定が効いている証拠になる。

## 想定外だったこと

1. **settings.json に上流の型検査に反する値が 1 つでもあると、Claude Code はこのプラグインを無効として扱い、hook が一切動かない**（事実。`probe.py`）。
   `cleanupPeriodDays: "30"`・`env: "broken"` で `plugin list` が `enabled: false`、init の plugins からも消える。
   対照: `cleanupPeriodDays: 31`・`env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: 60`（int）では有効のまま。stderr・終了コードに差は出ない（未ログインの `-p` で観測）。
   - その結果、`_policy_ops` の `skipped_missing`（途中が dict でない）の経路は、少なくとも `env` では実物で到達しない
   - **管理者が SET / ONCE で型違いの値を配ると、全端末で収集ごと止まり、直した版を配っても自力では戻れない**（R4）。hook が動かないので、policy 行も error 行も届かない。サーバからは「policy イベントが途絶えた端末」としてしか見えない
   - 推測（未検証）: ファイル全体が無視されている可能性が高い（`enabledPlugins` が効いていない）。env など他のキーが効いているかは確かめていない
2. `once.json` を失うと、ONCE は利用者が変えた値を書き戻す（R2）。仕様（記録が読めなければ空、`/governance:reapply` も記録を消す）どおりだが、行の上は「once a / user / applied」としか残らない
3. 利用者が同じ値を別の型（int 60）で持つと上書きされ、行は value 60 / prev 60 / applied になる（R1 s2）。サーバの準拠判定（prev_value = "60"）では準拠に数えられる。int のまま効くかは未検証

更新の経路そのもの（仮説 1〜3）は壊れなかった: 更新後の最初のセッションで新しい installPath の `policy.py` が動き、prev_value は旧値を持ち、ONCE は差し替えで 1 回だけ書かれた。

## 課題と改善案

- **`tests/`（最優先）**: `policy.py` の SET / ONCE の値を、Claude Code の settings のスキーマ（上流が公開する JSON Schema。版と取得元は要確認）か、少なくとも既知キーの型表で検査するテストを足す。
  既存 E2E の `test_settings.py::test_2回目は適用済みで本体に取り込まれる` は 2 回目のセッションの行を見るので、実際の `policy.py` に型違いがあれば落ちるはず（コードからの推定。壊した `policy.py` で落ちることは未確認）。ただし E2E を流さないリリースでは素通りする
- **`e2e/`**: 更新をまたぐ経路（旧値が入った端末 → `plugin update` → セッション）を 1 本足す候補。R1 を縮めた「SET の旧値が prev_value に出て新値が書かれる」だけで足りる。ONCE・型違いの組み合わせは `tests/` に任せる
- **`e2e/`（小）**: `_flow.session` と同じ `claude -p` の起動を一時スクリプトから使うとき、`E2ERoot` の置き場を変えられない（`tempfile.tempdir` の差し替えで回避した）。`CC_E2E_RUN` を接頭辞に入れると並行時の片付けが追いやすい
- **`docs/knowledge/`**: 「settings.json の 1 キーでも型が違うと、プラグインが無効（`enabled: false`）になり hook が動かない。`plugin update` は成功する」（claude 2.1.283、未ログインの `-p` で確認）
- **`docs/spec/plugin.md` / 運用**: ONCE の記録喪失で利用者の値を戻すこと、`skipped_missing` が `env` では実質起きないことの扱いを検討（直すかは判断が要る）
- **UC 13（壊れた settings.json）へ**: 利用者の型違いで収集が無言で止まる件は UC 13 の範囲と重なる。そちらで利用者側の症状を詰める

## 片付けたもの・残したもの

- 片付けた: 各経路の隔離ルート（`$TMPDIR/cc-e2e-a-01-*`）と git 配信サーバ。`pgrep` で本 UC のプロセスが無いことを確認
- 本物の `~/.claude` の settings.json・installed_plugins.json・known_marketplaces.json に `cc-e2e` の痕跡が無いことを確認
- 残した: `run.py`・`probe.py`・この `notes.md`。行の記録は `.local/e2e-load-testing/uc-01-policy-update/`（R1〜R4.json、probe.json）
- `$TMPDIR` に `cc-e2e-hh7_zc0n`・`cc-e2e-ljx85tjw`・`cc-e2e-a-06-*`・`cc-e2e-a-13-*` があるが、本 UC のものではない（中身に本 UC の目印 `GOV_E2E_ONCE` が無い）。触っていない
