# リリース手順書

`plugin/` を配布リポジトリ（`cc-marketplace-governance-bmsd`）の `plugins/governance/` へ差し込み、社内マーケットプレイスとして配布するときに、
満たすべき前提・人が確かめる項目・配った後の作業をまとめる。

差し込みから PR の作成までは、スキル `release-plugin`（`.claude/skills/release-plugin/`）で進める。
開発側の検証 → 配布リポジトリの作業ブランチへの差し込みと `diff` による一致の確認 → 配布側の検証 → 作業ブランチを ref に付けた導入の確認 → 同じ作業ブランチから配布リポジトリの `main` への PR、の順に進み、
マージされた時点で配布される。スキルを使わずに手で進めるときも、`SKILL.md` と `references/` を上から読めば同じ順で進められる。

**配布リポジトリの `plugins/governance/` は直接編集しない。**変更は必ずこのリポジトリの `plugin/` に対して行い、差し込み直す。

## 1. 前提

- 配布する変更がこのリポジトリのリモートに push 済みであること（ブランチは問わない。どのブランチのどのコミットから配ったかを PR に書く）
- `pytest -q tests` が通っていること
- `pytest e2e` が通っていること。skip はそのモジュールを確かめていないことを意味する（何が skip になるかは `e2e.md`）
- **初回リリースの前に、`plugin/config.json` の `ingest_url` と `ingest_token` を埋める。**空のまま配ると、端末は 1 件も送信しないまま「導入済み」に見える。`ingest_token` の値は `deploy-aip.md` の「Secretを設定する」で作る

## 2. 確認項目

検出する仕組みが無いため、人が確かめる。

- **`plugin/.claude-plugin/plugin.json` の `version` を上げた。**`version` を書く場所はここ 1 か所だけで、端末が更新の要否を判断する唯一の手がかりである。上げ忘れると、変更は端末に届かないまま「届いたことになる」
- **`policy.py` から項目を黙って削除していない**（理由は「誤った設定値を配ってしまったとき」）
- `contract.py` か `policy.py` を変えたら `scripts/sync_contract.py` を実行し、サーバ側の複製も同じリリースで更新した。`.venv/bin/python scripts/sync_contract.py --check` が `OK` で終わる（`../spec/server.md` の「契約の複製」）
- `.venv/bin/python scripts/check_settings_schema.py` が `[OK]` で終わる（`[NG]` のときの対処はスクリプトの冒頭）
- 効果測定の対象の施策（`server/ccgov/constants.py` の `REFERENCE_KEY` / `REFERENCE_VALUE`）の値を変えたら、同じリリースでこの 2 つを差し替えた。差し替えると以前の実験は画面から消える（データは残る）。ほかの影響は `server/ccgov/constants.py` のコメントにある
- お知らせは `notices.json` の末尾に足した（並び順で未読の先頭から 1 件ずつ出る）
- `notices.json` の `url` は `https://` で始まり、意図したページを指している
- `notices.json` を変えたら、導入の確認の対話でお知らせが表示されることを見る（`pytest e2e` は見本の
  `notices.json` を使うため本物の文面を通らず、壊れた JSON は黙って空になる）
- `notices.json` のお知らせは 1 件を日本語で 600 字程度までに収めた（長い文面はファイルへ退避され、先頭しか表示されない。境界は `../knowledge/measurements.md`）
- `config.json` の送信先 URL が `https://` で始まり、デプロイ済みのサーバの URL と一致している（スキームは検査されない。理由は `../decisions/plugin.md` の「受け入れている限界」）
- `config.json` の受信トークンが、サーバの Secret ファイルの `INGEST_TOKEN` と一致している。**一致していなければ全端末の送信が 401 で跳ね返り続ける。**端末は spool を保持するが、`config.json` の `spool_max_days`・`spool_max_bytes` を超えた分は古いものから失われ、誰も気づかない

受信トークンは平文でリポジトリに入る。機密防御ではなく誤送信の防止のために置き、到達制御はネットワーク境界が担う。トークンを入れ替えるときは、サーバの Secret ファイルの更新と同じリリースで行う。新旧どちらでも通る期間は作れず、その間の 401 は端末の spool が `spool_max_days`・`spool_max_bytes` の範囲で吸収する。

## 3. 届いたことを確認する

数日後に設定の適用状況（`/policy`）のバージョンのタブで `plugin_version` の分布を見る。この列はセッションを開始した時点の版であり、長く開いたままのセッションは古い版を報告し続ける。更新の直後に新旧が混じるのは正常で、**古い版が何日も残り続けることが、配布の届いていない端末の印である。**

対話でメッセージを送ってからしばらく経っても版が上がらない端末では（自動更新が走る条件は `../knowledge/claude-code-behavior.md`）、手動更新の 2 段階を両方行う（1 段目はカタログを更新するだけで、本体の版は上がらない）。

```
claude plugin marketplace update cc-marketplace-governance-bmsd
claude plugin update governance
```

## 4. 誤った設定値を配ってしまったとき

- `policy.py` に正しい値を書く。施策をやめる場合は `SET` の値を `None`（キーを消す）か Claude Code の既定値にし、`ADD` で配った要素は `REMOVE` に移す
- `version` を上げて配り直す
- 即時の撤回手段は無い。全端末に行き渡るまで数日かかる

**`policy.py` から項目を消すだけでは撤回にならない。**消した項目は以後何もされず、既に書き込まれた値が全端末に残り続ける。`ONCE` で配った値も同じで、戻すには値を変えて配り直す。**前の版の中身を配り直しても（版を下げても）元には戻らない。**`ADD` で足した要素は残り、`ONCE` の値は前の値へ戻した時点で再び 1 回書かれ、利用者が変えた値を上書きする（`ONCE` の記録の範囲は `../spec/plugin.md` の「設定の自動適用」）。端末ごとに書き換える直前の `settings.json` は `<config_dir>/settings-backups/` の日時のフォルダに残っている（`../spec/plugin.md` の「設定の自動適用」）。

**本体の検証で捨てられる値（型違いなど）を配ると、配り直しでは戻らない。**本体が `settings.json` を丸ごと無視して hook も動かず（`../knowledge/claude-code-behavior.md` の「settings.json の読み込み」）、直した版を配っても端末では動かない。行も届かないので、収集の状態のプラグインのエラーには出ない。端末では `claude doctor` の `Invalid settings` と、`claude plugin list` でプラグインが無効（`enabled: false`）に見えることで気づく（`claude plugin list` の表示は 2.1.283 で確認）。復旧は次の順に行う（逆にすると、古い版の hook が同じ値を書き直す。推定）。

1. 直した版を先に配る
2. 利用者が `claude doctor` の `Invalid settings` で名指しされたキーを直すか消す

配る前は `tests/plugin/test_policy_schema.py` が、`policy.py` を適用した結果を上流のスキーマで検証して止める。スキーマが通して本体が捨てる値と、上流が後から厳しくした値は止まらない。

## 5. 列や行の種類を足したとき

契約（`plugin/hooks/contract.py`）に列を足すリリースでは、サーバ側で列の追加を先に済ませる。サーバを止め、`ALTER TABLE <t> ADD COLUMN <列> <型>` を手で実行してから起動する（テーブルは作り直さない。理由は `../decisions/server.md`）。既存の行の新しい列は NULL になる。

- `<型>` は `contract.py` に書いた型と同じにする。起動時の検査は列名しか見ないので、型を誤っても起動する。SQLite では値が誤った型で入り、比較や `max` が無言で誤る
- サーバの環境に `sqlite3` CLI があるとは限らない（`server/Dockerfile` の基底イメージには無い）。サーバが使う Python の標準モジュールで実行し、実行後に `PRAGMA table_info(<t>)` で列と型を確かめる

  ```
  python3 -c "import sqlite3; c = sqlite3.connect('<DB ファイル>'); c.execute('ALTER TABLE <t> ADD COLUMN <列> <型>'); c.commit()"
  ```

- **ALTER を忘れて新しいサーバを起動すると、起動しない**（欠けた列名をログに出す。起動時の検査は `../spec/server.md`）
- 端末を先に配ると、ALTER までに届いた新しい列の値は古いサーバが捨て、後から取り戻せない

行の種類（`kind`）を足すリリースでも、サーバを先にデプロイする。古いサーバは知らない種類の行を捨てて 200 を返すので、端末は送れたものとして spool から消す。

## 改訂履歴

- 2026-09-25: 設定値の置き場を `policy.py` にし、撤回の方法を `SET` の `None` と `REMOVE` で書いた
- 2026-09-25: `staging` ブランチで開発者の端末だけに先に届けて確かめる手順を加えた
- 2026-09-25: 配布側の作業を「作業ブランチへ複製・コミット→ staging へ push → 確認 → main へ PR」の順に揃え、1 の前提が指す `main` を明記した
- 2026-09-25: 効果測定の実験の差し替えと、配布物と正本の一致の確認を確認項目に加えた
- 2026-09-26: `staging` の確認を、本人の実環境ではなく使い捨ての `CLAUDE_CONFIG_DIR` で行う手順に変更し、ref の実測メモを `docs/knowledge/claude-code-behavior.md` へ移した。前提に `pytest e2e` を加えた
- 2026-09-26: お知らせの長さと送信先の `https://` を確認項目に加えた
- 2026-09-26: 列を足すときのサーバ側の手順を `ALTER TABLE ... ADD COLUMN` で書き、版の分布を見る場所を直した
- 2026-09-27: `notices.json` を変えたときの手動確認を確認項目に戻した
- 2026-09-28: staging で行が届いたことの確認と、本体が捨てる値を配ったときの復旧の順序を加えた
- 2026-09-28: 401 が続く間も spool の上限を超えた分は失われることを書いた
- 2026-09-28: ロールバックで戻らないもの、列を足すときの型・実行手段・端末を先に配ったときの欠損を加え、同期の確認項目に `contract.py` を加えた
- 2026-09-28: 章番号での参照を見出し名に替え、staging の対話起動を `e2e.md` の手動確認に寄せ、knowledge・スクリプトと重なる記述を参照に縮めた
- 2026-10-08: 版の分布とエラーを見る場所を、設定の適用状況のバージョンのタブと収集の状態のプラグインのエラーにし、staging の合格を分母に依らない「最新」の版で見るようにした
- 2026-10-09: 差し込みから PR の作成までの手順をスキル `release-plugin` へ移し、この文書を前提・確認項目・配った後の作業に絞った
- 2026-10-09: `staging` ブランチをやめて PR に出す作業ブランチで導入を確かめるようにし、開発リポジトリの `main` 以外のブランチからも配れるようにした
- 2026-10-09: お知らせを `notices.json` の末尾に足すことを確認項目に加えた
- 2026-10-09: 書き換える直前の `settings.json` の置き場を `settings-backups/` にした
