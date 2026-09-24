# リリース手順書

`plugin/` を配布リポジトリ（`../cc-marketplace-governance-bmsd`）の `plugins/governance/` へ差し込み、社内マーケットプレイスとして配布する手順である。上から順に実行すれば終わる。

**配布リポジトリの `plugins/governance/` は直接編集しない。**変更は必ずこのリポジトリの `plugin/` に対して行い、この手順で差し込む。

## 1. 前提

- 変更がこのリポジトリの `main` にマージ済みであること（配布リポジトリの `main` は 8 でマージする）
- `pytest -q tests` が通っていること
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
- `notices.json` の `url` は `https://` で始まり、意図したページを指している
- `config.json` の送信先 URL が、デプロイ済みのサーバの URL と一致している
- `config.json` の受信トークンが、サーバの Secret ファイルの `INGEST_TOKEN` と一致している。**一致していなければ全端末の送信が 401 で跳ね返り続ける。**端末は spool を保持するのでイベントは失われないが、誰も気づかないまま溜まる

受信トークンは平文でリポジトリに入る。機密防御ではなく誤送信の防止のために置き、到達制御はネットワーク境界が担う。トークンを入れ替えるときは、サーバの Secret ファイルの更新と同じリリースで行う。新旧どちらでも通る期間は作れず、その間の 401 は端末の spool が吸収する。

## 7. staging で確かめる

配布リポジトリの `main` へ入れる前に、4 で作った作業ブランチを `staging` ブランチへ反映し、開発者の端末だけに届けて確かめる。

1. 配布リポジトリで、作業ブランチを `staging` へ反映する

   ```
   git push origin <作業ブランチ>:staging
   ```

   `staging` がまだ無ければこの push が作成を兼ねる。以降のリリースでも同じコマンドで進める。作業ブランチの履歴を書き換えた場合など fast-forward できないときは `--force` が要る。`staging` は開発者端末の検証専用で、履歴を保存する対象ではないため force push してよい

2. 開発者の端末で、次の 2 段階を行う（登録が済んでいなければ、先に下記の方法で登録する）

   ```
   claude plugin marketplace update cc-marketplace-governance-bmsd
   claude plugin update governance
   ```

3. `/plugin` の版と動作を確かめてから、「PR を作りマージする」へ進む

開発者の端末だけ、ref に `staging` を付けて登録する。CLI では `#` の後ろに ref を書く。

```
claude plugin marketplace add <owner>/<repo>#staging
```

`settings.json` に直接書く場合は `source.ref` を置く。CLI で登録しても同じ形で書き込まれる。

```json
"extraKnownMarketplaces": {
  "cc-marketplace-governance-bmsd": {
    "source": { "source": "github", "repo": "<owner>/<repo>", "ref": "staging" }
  }
}
```

実測した挙動（Claude Code 2.1.282）:

- ref を付けている間、2 段階の更新は `staging` の先端の版を入れる。`main` の版は拾わない
- `policy.py` が配る `autoUpdate` は `source` を書き換えないので、ref は保たれる
- **戻すには `source` から `ref` を消し、セッションを 1 度開始してから 2 段階の更新を行う。**登録の変更はセッションの開始時に反映され、`marketplace update` だけでは `staging` のまま残る
- `plugin update` は版が下がる向きにも入れ替える。戻した時点で `main` の版が `staging` より低ければ、端末の版は下がる

未検証: 起動時の自動更新（`autoUpdate`）が ref を付けたまま `staging` の新しい版を取り込むか。

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

## 11. 列を足したとき

契約（`plugin/hooks/contract.py`）に列を足すリリースでは、サーバ側のテーブルの作り直し（`../spec/server.md` の「契約と実テーブルの突き合わせ」）を先に済ませる。**順序を誤るとサーバが起動しない。**

## 改訂履歴

- 2026-09-25: 設定値の置き場を `policy.py` にし、撤回の方法を `SET` の `None` と `REMOVE` で書いた
- 2026-09-25: `staging` ブランチで開発者の端末だけに先に届けて確かめる手順を加えた
- 2026-09-25: 配布側の作業を「作業ブランチへ複製・コミット→ staging へ push → 確認 → main へ PR」の順に揃え、1 の前提が指す `main` を明記した
