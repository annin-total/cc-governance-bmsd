# governance プラグインの固有情報

## 名前と置き場

| 項目 | 値 |
| --- | --- |
| 手順書（前提・確認項目・配った後の作業） | `docs/guide/release.md` |
| 配布物（開発リポジトリ） | `plugin/` |
| 版の置き場 | `plugin/.claude-plugin/plugin.json` の `version`。ここ 1 か所だけ |
| 配布リポジトリの URL | `https://github.com/annin-total/cc-marketplace-governance-bmsd.git` |
| 配布リポジトリの置き場 | 開発リポジトリのルートの隣（`../cc-marketplace-governance-bmsd`）。開発リポジトリを git worktree で開いているときは、置き場を聞く |
| 差し込み先（配布リポジトリ） | `plugins/governance/` |
| マーケットプレイス名 | `cc-marketplace-governance-bmsd` |
| プラグイン名 | `governance` |

配布リポジトリの `README.md` と `templates/` は一般の利用者も読む。開発リポジトリの名前やパスを書き込まない。

## 開発側の検証

開発リポジトリのルートで流す。

```bash
.venv/bin/python scripts/validate_plugin.py
```

- Windows では `.venv/bin/python` を `.venv/Scripts/python.exe` に読み替える
- `validate_plugin.py` はマニフェストの形式を `claude plugin validate --strict` で見るため、`claude` が PATH に要る（無ければ `[NG]`）。
  3.10 以上の python で実行する（3.10 未満では `[NG]`）
- `validate_plugin.py` は `config.json` の値と `policy.py` の中身を見ない。それらは手順書の確認項目で確かめる

## 設定値

`plugin/config.json` の `ingest_url`（送信先）と `ingest_token`（受信トークン）は、開発リポジトリに埋めたまま配る。
空なら差し込まずに止まり、手順書の「前提」に従って埋めるよう伝える。空のまま配ると、端末は 1 件も送信しないまま導入済みに見える。

- `ingest_token` の値は表示しない。記録・PR・コミットメッセージにも書かない。確かめるのは空でないことだけ
- `ingest_url` は `https://` で始まることを見る。デプロイ済みのサーバの URL との一致は利用者に聞く
- トークンがサーバの Secret と一致しているかは機械では確かめられない。利用者に聞く
