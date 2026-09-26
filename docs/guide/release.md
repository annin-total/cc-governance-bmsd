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
- 効果測定の対象の施策（`server/ccgov/constants.py` の `REFERENCE_KEY` / `REFERENCE_VALUE`）の値を変えたら、同じリリースでこの 2 つを差し替えた。差し替えると以前の実験は画面から消える（データは残る）
- 配布リポジトリの作業ブランチで `diff -r -x __pycache__ -x .DS_Store plugin/ ../cc-marketplace-governance-bmsd/plugins/governance/` が差分なしで終わる（このリポジトリから実行する）
- `notices.json` の `url` は `https://` で始まり、意図したページを指している
- `config.json` の送信先 URL が、デプロイ済みのサーバの URL と一致している
- `config.json` の受信トークンが、サーバの Secret ファイルの `INGEST_TOKEN` と一致している。**一致していなければ全端末の送信が 401 で跳ね返り続ける。**端末は spool を保持するのでイベントは失われないが、誰も気づかないまま溜まる

受信トークンは平文でリポジトリに入る。機密防御ではなく誤送信の防止のために置き、到達制御はネットワーク境界が担う。トークンを入れ替えるときは、サーバの Secret ファイルの更新と同じリリースで行う。新旧どちらでも通る期間は作れず、その間の 401 は端末の spool が吸収する。

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

5. 確認後、`STAGING` のディレクトリを消す

   ```
   rm -rf "$STAGING"
   ```

   macOS でログインした場合、キーチェーンに config ごとの項目が残る。消し方は
   `docs/guide/e2e.md` の「手動確認の準備」にある

6. 「PR を作りマージする」へ進む

## 8. PR を作りマージする

配布リポジトリで、4 の作業ブランチから `main` へ PR を作る。マージされた時点で配布される。

## 9. 届いたことを確認する

数日後に概況画面の健全性の行で `plugin_version` の分布を見る。この列はセッションを開始した時点の版であり、長く開いたままのセッションは古い版を報告し続ける。更新の直後に新旧が混じるのは正常で、**古い版が何日も残り続けることが、配布の届いていない端末の印である。**

15 分待っても版が上がらない端末では、手動更新の 2 段階を両方行う（1 段目はカタログを更新するだけで、本体の版は上がらない）。

```
claude plugin marketplace update cc-marketplace-governance-bmsd
claude plugin update governance
```

## 10. 誤った設定値を配ってしまったとき

- `policy.py` に正しい値を書く。施策をやめる場合は `SET` の値を `None`（キーを消す）か Claude Code の既定値にし、`ADD` で配った要素は `REMOVE` に移す
- `version` を上げて配り直す
- 即時の撤回手段は無い。全端末に行き渡るまで数日かかる

**`policy.py` から項目を消すだけでは撤回にならない。**消した項目は以後何もされず、既に書き込まれた値が全端末に残り続ける。`ONCE` で配った値も同じで、戻すには値を変えて配り直す。端末ごとに書き換える直前の `settings.json` は `<config_dir>/governance/backups/` に 10 世代残っている。

## 11. 列や行の種類を足したとき

契約（`plugin/hooks/contract.py`）に列を足すリリースでは、サーバ側のテーブルの作り直し（`../spec/server.md` の「契約と実テーブルの突き合わせ」）を先に済ませる。**順序を誤るとサーバが起動しない。**

行の種類（`kind`）を足すリリースでも、サーバを先にデプロイする。古いサーバは知らない種類の行を捨てて 200 を返すので、端末は送れたものとして spool から消す。

## 改訂履歴

- 2026-09-25: 設定値の置き場を `policy.py` にし、撤回の方法を `SET` の `None` と `REMOVE` で書いた
- 2026-09-25: `staging` ブランチで開発者の端末だけに先に届けて確かめる手順を加えた
- 2026-09-25: 配布側の作業を「作業ブランチへ複製・コミット→ staging へ push → 確認 → main へ PR」の順に揃え、1 の前提が指す `main` を明記した
- 2026-09-25: 効果測定の実験の差し替えと、配布物と正本の一致の確認を確認項目に加えた
- 2026-09-26: `staging` の確認を、本人の実環境ではなく使い捨ての `CLAUDE_CONFIG_DIR` で行う手順に変更し、ref の実測メモを `docs/knowledge/claude-code-behavior.md` へ移した。前提に `pytest e2e` を加えた
