# リリース手順書

`plugin/` を配布リポジトリ（`../cc-marketplace-governance-bmsd`）の `plugins/governance/` へ差し込み、社内マーケットプレイスとして配布する手順である。上から順に実行すれば終わる。

**配布リポジトリの `plugins/governance/` は直接編集しない。**変更は必ずこのリポジトリの `plugin/` に対して行い、この手順で差し込む。

## 1. 前提

- 変更がこのリポジトリの `main` にマージ済みであること（配布リポジトリの `main` は 8 でマージする）
- `pytest -q tests` が通っていること
- `pytest e2e` が通っていること。`claude` が PATH に無いと全件 skip になり、Docker・認証の無い環境では
  該当モジュールだけが skip になる。skip が出たら何が未確認のまま残っているかを意識する（`docs/guide/e2e.md`）
- **初回リリースの前に、`plugin/config.json` の `ingest_url` と `ingest_token` を埋める。**空のまま配ると、端末は 1 件も送信しないまま「導入済み」に見える。検証スクリプトはこれを見ない

## 2. `version` を上げる

`plugin/.claude-plugin/plugin.json` の `version` を上げる。**`version` を書く場所はここ 1 か所だけである。**

`version` は端末が更新の要否を判断する唯一の手がかりである。上げ忘れると、変更は端末に届かないまま「届いたことになる」。上げ忘れを検出する仕組みは無い。

## 3. プラグインを検証する（このリポジトリ）

```
python scripts/validate_plugin.py
```

マニフェストの形式は `claude plugin validate --strict` で見るため、`claude` が PATH に要る（無ければ `[NG]`）。
3.10 以上の python で実行する（標準ライブラリの一覧を持たない 3.10 未満では `[NG]`）。

`[NG]` が 1 つでも出たら、差し込む前に `plugin/` を直す。このスクリプトは `config.json` の値や `policy.py` の中身を見ない。それらは「確認項目」で人が確かめる。

## 4. 配布リポジトリの作業ブランチへ複製してコミットする

配布リポジトリで作業ブランチを作り（既にあれば切り替え）、`plugin/` の内容で `plugins/governance/` を丸ごと置き換えてコミットする。`main` へは直接コミットしない。

## 5. マーケットプレイスを検証する（配布リポジトリ）

```
cd ../cc-marketplace-governance-bmsd
python scripts/validate.py
```

収録プラグインと `templates/plugin/` の両方を検証する。`[NG]` が 1 つでも出たら、このリポジトリの `plugin/` を直して「プラグインを検証する」からやり直す。

## 6. 確認項目

検出する仕組みが無いため、人が確かめる。

- **`version` を上げた**
- **`policy.py` から項目を黙って削除していない**（理由は「誤った設定値を配ってしまったとき」）
- `policy.py` を変えたら `scripts/sync_contract.py` を実行し、サーバ側の複製も同じリリースで更新した
- `python scripts/check_settings_schema.py` が `[OK]` で終わる。`[NG]` なら `--write` で取り直し、`pytest -q tests` を流す（`policy.py` の検証に使う settings.json のスキーマが、上流の最新版より古くなっていないか）
- 効果測定の対象の施策（`server/ccgov/constants.py` の `REFERENCE_KEY` / `REFERENCE_VALUE`）の値を変えたら、同じリリースでこの 2 つを差し替えた。差し替えると以前の実験は画面から消える（データは残る）
- 配布リポジトリの作業ブランチで `diff -r -x __pycache__ -x .DS_Store plugin/ ../cc-marketplace-governance-bmsd/plugins/governance/` が差分なしで終わる（このリポジトリから実行する）
- `notices.json` の `url` は `https://` で始まり、意図したページを指している
- `notices.json` を変えたら、「staging で確かめる」の 4 でお知らせが表示されることを見る（`pytest e2e` は見本の
  `notices.json` を使うため本物の文面を通らず、壊れた JSON は黙って空になる）
- `notices.json` のお知らせは 1 件を日本語で 600 字程度までに収めた（長い文面はファイルへ退避され、先頭しか表示されない。境界は `../knowledge/measurements.md`）
- `config.json` の送信先 URL が `https://` で始まり、デプロイ済みのサーバの URL と一致している（スキームは検査されない。理由は `../decisions/plugin.md` の「受け入れている限界」）
- `config.json` の受信トークンが、サーバの Secret ファイルの `INGEST_TOKEN` と一致している。**一致していなければ全端末の送信が 401 で跳ね返り続ける。**端末は spool を保持するが、`config.json` の `spool_max_days`・`spool_max_bytes` を超えた分は古いものから失われ、誰も気づかない

受信トークンは平文でリポジトリに入る。機密防御ではなく誤送信の防止のために置き、到達制御はネットワーク境界が担う。トークンを入れ替えるときは、サーバの Secret ファイルの更新と同じリリースで行う。新旧どちらでも通る期間は作れず、その間の 401 は端末の spool が `spool_max_days`・`spool_max_bytes` の範囲で吸収する。

## 7. staging で確かめる

配布リポジトリの `main` へ入れる前に、4 で作った作業ブランチを `staging` ブランチへ反映し、
使い捨ての隔離環境（`CLAUDE_CONFIG_DIR`）に ref 付きで導入して確かめる。本人の実環境には触れない。

1. 配布リポジトリで、作業ブランチを `staging` へ反映する

   ```
   git push origin <作業ブランチ>:staging
   ```

   `staging` がまだ無ければこの push が作成を兼ねる。以降のリリースでも同じコマンドで進める。作業ブランチの履歴を書き換えた場合など fast-forward できないときは `--force` が要る。`staging` は検証専用で、履歴を保存する対象ではないため force push してよい

2. 使い捨ての隔離ディレクトリを用意する

   ```
   STAGING="$(mktemp -d)"
   ```

3. ref に `staging` を付けて登録し、導入する。`CLAUDE_CONFIG_DIR` はコマンドごとに前置し、export
   しない。CLI では `#` の後ろに ref を書く

   ```
   CLAUDE_CONFIG_DIR="$STAGING" claude plugin marketplace add <owner>/<repo>#staging --scope user
   CLAUDE_CONFIG_DIR="$STAGING" claude plugin install governance@cc-marketplace-governance-bmsd --scope user
   CLAUDE_CONFIG_DIR="$STAGING" claude plugin list
   ```

   合格: `governance` が `enabled` で現れ、版が上げた版と一致する（`main` の版のままなら ref が
   効いていない）

   `<owner>/<repo>` の短縮形は GitHub を SSH で clone する（SSH 鍵が無いと失敗する）。社内の
   git サーバや鍵の無い端末では `https://<host>/<owner>/<repo>.git#staging` の形で指定する

4. 認証を環境変数で渡し（会社は Bedrock。渡す変数は `docs/guide/e2e.md` の「認証」の節）、空の
   ディレクトリからセッションを開いて `/plugin` の版と動作を確かめる

   ```
   cd "$(mktemp -d)" && CLAUDE_CONFIG_DIR="$STAGING" claude
   ```

5. 行が本番の受信先に届いたことを確かめる。staging で配る `config.json` は本番の送信先を持つので、
   この端末（開発者本人）の行は本番の DB に入る。これは許容する

   合格: 概況の版の分布に上げた版が出る（行が届いた証拠）

   出なければ、`$STAGING/plugins/data/governance-cc-marketplace-governance-bmsd/` の `queue.jsonl`・`spool/`
   にある error 行のうち、`stage` が `send` のものの `error_type`（`HTTP 401` など）で原因を見る。
   **401 の間は error 行も届かないので、概況に失敗が無いことは合格の証拠にならない。**接続できない・
   名前解決に失敗したときは error 行も残らず、`spool/` にファイルが残るだけである

6. 確認後、`STAGING` のディレクトリを消す

   ```
   rm -rf "$STAGING"
   ```

   macOS でログインした場合、キーチェーンに config ごとの項目が残る。消し方は
   `docs/guide/e2e.md` の「手動確認の準備」にある

7. 「PR を作りマージする」へ進む

## 8. PR を作りマージする

配布リポジトリで、4 の作業ブランチから `main` へ PR を作る。マージされた時点で配布される。

## 9. 届いたことを確認する

数日後に概況画面の `plugin_version` の分布を見る。この列はセッションを開始した時点の版であり、長く開いたままのセッションは古い版を報告し続ける。更新の直後に新旧が混じるのは正常で、**古い版が何日も残り続けることが、配布の届いていない端末の印である。**

15 分待っても版が上がらない端末では、手動更新の 2 段階を両方行う（1 段目はカタログを更新するだけで、本体の版は上がらない）。

```
claude plugin marketplace update cc-marketplace-governance-bmsd
claude plugin update governance
```

## 10. 誤った設定値を配ってしまったとき

- `policy.py` に正しい値を書く。施策をやめる場合は `SET` の値を `None`（キーを消す）か Claude Code の既定値にし、`ADD` で配った要素は `REMOVE` に移す
- `version` を上げて配り直す
- 即時の撤回手段は無い。全端末に行き渡るまで数日かかる

**`policy.py` から項目を消すだけでは撤回にならない。**消した項目は以後何もされず、既に書き込まれた値が全端末に残り続ける。`ONCE` で配った値も同じで、戻すには値を変えて配り直す。端末ごとに書き換える直前の `settings.json` は `<config_dir>/governance/backups/` に残っている（世代数は `plugin/hooks/_govdir.py` の `_BACKUP_KEEP`）。

**本体の検証で捨てられる値（型違いなど）を配ると、配り直しでは戻らない。**本体は `settings.json` に検証を通らない箇所が 1 つでもあるとファイル全体を読まず、`enabledPlugins` も読まれないので hook が 1 本も起動しない。直した版を配っても端末では動かず、行も届かないので概況からは気づけない。端末で気づく手がかりは、`claude doctor` の `Invalid settings` と、`claude plugin list` でプラグインが無効（`enabled: false`）に見えることである（2.1.283 の `-p` で確認。対話での表示は未確認）。復旧は次の順に行う（逆にすると、古い版の hook が同じ値を書き直す。推定）。

1. 直した版を先に配る
2. 利用者が `claude doctor` の `Invalid settings` で名指しされたキーを直すか消す

配る前は `tests/plugin/test_policy_schema.py` が、`policy.py` を適用した結果を上流のスキーマで検証して止める。スキーマが通して本体が捨てる値と、上流が後から厳しくした値は止まらない。

## 11. 列や行の種類を足したとき

契約（`plugin/hooks/contract.py`）に列を足すリリースでは、サーバ側で列の追加を先に済ませる。サーバを止め、`ALTER TABLE <t> ADD COLUMN <列> <型>` を手で実行してから起動する（テーブルは作り直さない。理由は `../decisions/server.md`）。既存の行の新しい列は NULL になる。**順序を誤るとサーバが起動しない**（起動時の検査は `../spec/server.md`）。

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
