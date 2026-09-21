# 計画 [3] 端末：設定の自動適用とお知らせ — 実装台帳

**ブランチ:** `feat/client-policy-notices`（`feat/client-collection` から分岐）
**計画:** `docs/plans/03-client-policy-notices.md`

## 着手前の矛盾走査

| # | 走査した対象 | 突き合わせたもの | 結果 |
| --- | --- | --- | --- |
| 1 | タスク 1 の完了判定 `154 passed` | [2] 完了時点の `tests/client/` の実績 | **不一致。**[2] は 162 passed で終わっている（R-42〜R-44 のテストが加わったため）→ 裁定 R-45 |
| 2 | タスク 7 が名指しする `_queue` | [2] の実体 | **不一致。**R-38 で `_spool.py` に改名済み → 裁定 R-46 |
| 3 | タスク 11-8「送信は止まらない」 | `collect.main()` の無効化の実装 | **矛盾。**`main()` は `CC_GOVERNANCE_DISABLE` で送信判定ごと return する → 裁定 R-47 |
| 4 | タスク 7 の `plugin_version` | `contract.POLICY_COLUMNS` | 一致（`plugin_version VARCHAR(32)` が既にある） |
| 5 | タスク 3〜4 の `POLICY` 2 項目 | `contract.POLICY` | 一致（`env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` = `"60"`、`…autoUpdate` = `True`） |
| 6 | タスク 12 の `hooks.json` 7 種 | [2] が置いた 6 種 | 一致（`SessionStart` の 1 ブロックを足すと 7 になる） |
| 7 | タスク 12 の実機確認 | [2] タスク 11 の状況 | **同じ壁。**隔離 HOME での `claude` 起動に利用者の実アカウントでの OAuth 認可が要る → 裁定 R-48 |
| 8 | タスク 8〜9 の `seen.json` の置き場所 | `_spool._state_dir()` | 一致（`CLAUDE_PLUGIN_DATA`、無ければ `~/.claude/cc-governance/`）。この計画で別の規則を作らない |
| 9 | タスク 4 の一時ファイルと [2] の書き込み作法 | `_identity._save_cache()` | 同じディレクトリに一時ファイル → `os.replace` で揃える |
| 10 | タスク 9 の標準出力 JSON | `collect.py` が標準出力に何も出さないこと | 競合なし（`collect.py` は出力しない。出すのは `session_start.py` だけ） |

## 裁定

**R-45: タスク 1 の完了判定 `154 passed` は「退行なし」と読み替える。**
理由: [2] の実績が 162 であり、154 は計画執筆時点の見込み。土台を置くタスクで件数が減らないことが趣旨である。
外れたときの損: 件数のずれを見逃し、[2] のテストが静かに 8 件消えても気づかない。→ 基準値 162 を台帳に明記して固定する。

**R-46: タスク 7 の `_queue` は `_spool` と読み替える。**
理由: R-38 で標準ライブラリ `_queue` との衝突を避けて改名済み。計画は改名前に書かれている。
外れたときの損: `import _queue` が標準ライブラリを掴み、キューに 1 行も積まれないまま成功したように見える。

**R-47: `session_start.py` は `collect.main()` を呼ばない。収集部分を直接組み立て、送信条件の判定を無効化スイッチの外側に置く。**
理由: タスク 11-8 は「`CC_GOVERNANCE_DISABLE` でも送信プロセスが 1 回起動する」を要求する。`collect.main()` は
スイッチが立っていると送信判定に到達せずに return するため、委譲すると 11-8 を満たせない。設計書 §3.9 の趣旨は
「止めるのは利用ログの収集とお知らせの表示であって、ガバナンスとその記録の伝達ではない」であり、
policy イベントを積んだうえで送らないのは、その端末がサーバから静かに消えることと同義である。
外れたときの損: 無効化した端末の policy イベントが端末に溜まり続け、準拠率の分母から消えて施策の効果が実態より良く見える。

**R-48: タスク 12 は `hooks.json` への `SessionStart` 登録までを行い、手順 1〜6 の実機確認は保留する。**
理由: [2] タスク 11 と同じ認可の壁（隔離 HOME での `claude` 起動に利用者の実アカウントでの OAuth 認可が要る）。
利用者の判断を待つ事項であり、勝手に認可しない。
外れたときの損: 完了条件 15〜18（本人の設定ファイルが不変・2 回目の `prev_value` が `"60"`・`systemMessage` の
接頭辞と 600 字・`extraKnownMarketplaces` が作られない）が未検証のまま残る。**台帳と PR に未検証と明記する。**

## 基準値

| 対象 | 着手時点 |
| --- | --- |
| `pytest -q tests/client` | 162 passed |
| `pytest -q`（全体） | 255 passed |
