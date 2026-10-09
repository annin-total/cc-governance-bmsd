# 作業ブランチから導入して確かめる

配布リポジトリの main へ入れる前に、PR に出す作業ブランチ（`release/<版>`）そのものを push し、
使い捨ての隔離環境（`CLAUDE_CONFIG_DIR`）にそのブランチを ref に付けて導入して確かめる。利用者本人の実環境には触れない。
確かめたブランチをそのまま PR にする。名前と URL は `governance.md` にある。

1. 配布リポジトリで、作業ブランチを push する（利用者の承認を得てから）

   ```bash
   git -C <置き場> push -u origin release/<版>
   ```

2. 使い捨ての隔離ディレクトリを用意する

   ```bash
   mktemp -d
   ```

   **出たパスを、以降の各コマンドに直接書く（下の `<隔離ディレクトリ>`）。シェル変数に入れない。**
   Claude Code の Bash ツールは呼び出しごとに変数を引き継がず、`CLAUDE_CONFIG_DIR` が空になると本人の実環境に書き込むおそれがある

3. ref に作業ブランチを付けて登録し、導入する。`CLAUDE_CONFIG_DIR` はコマンドごとに前置し、export しない。CLI では `#` の後ろに ref を書く

   ```bash
   CLAUDE_CONFIG_DIR="<隔離ディレクトリ>" claude plugin marketplace add "<配布リポジトリの URL>#release/<版>" --scope user
   CLAUDE_CONFIG_DIR="<隔離ディレクトリ>" claude plugin install <プラグイン名>@<マーケットプレイス名> --scope user
   CLAUDE_CONFIG_DIR="<隔離ディレクトリ>" claude plugin list
   ```

   合格: プラグインが `enabled` で現れ、版が上げた版と一致する（main の版のままなら ref が効いていない）。
   `<owner>/<repo>#<ref>` の短縮形は GitHub を SSH で clone する（SSH 鍵が無いと失敗し、GitHub 以外では使えない）。URL を使う。
   URL に ref を付けた形は `governance.md` にある。`/` を含むブランチ名を ref に付けた導入は、Claude Code 2.1.295 と GitHub の https の URL で、
   指定したブランチの版が導入されることを確かめている。社内 Bitbucket の URL では確かめていない

4. 認証を環境変数で渡し（会社は Bedrock。渡す変数は `docs/guide/e2e.md` の「認証」）、空のディレクトリからセッションを開いて
   `/plugin` の版と動作を確かめる。起動のしかたは `docs/guide/e2e.md` の「手動確認の準備」と同じにし
   （`env -i` で親の変数を断ち、`--settings` で本体の自動更新を止める）、`CLAUDE_CONFIG_DIR` には `<隔離ディレクトリ>` を渡す。
   対話でしか見えないもの（お知らせの表示など）は、コマンドを渡して利用者に別のターミナルで見てもらう

5. 行が本番の受信先に届いたことを確かめる。作業ブランチの `config.json` は本番の送信先を持つので、
   この端末（開発者本人）の行は本番の DB に入る。これは許容する

   合格: 設定の適用状況（`/policy`）の「プラグインが古いバージョンの利用者」のカードの「最新」に上げた版が出る（行が届いた証拠）。
   「最新」は報告のあった全端末の中で最も新しい版で、準拠率の分母に依らない。バージョンのタブは分母の利用者だけを数えるので、
   本人に直近のコストが無いと上げた版が出ず、合格の判定に使えない。管理画面は利用者に見てもらう

   出なければ、`<隔離ディレクトリ>/plugins/data/governance-cc-marketplace-governance-bmsd/` の `queue.jsonl`・`spool/`
   にある error 行のうち、`stage` が `send` のものの `error_type`（`HTTP 401` など）で原因を見る。
   **401 の間は error 行も届かないので、収集の状態（`/collect`）のプラグインのエラーに失敗が無いことは合格の証拠にならない。**
   接続できない・名前解決に失敗したときは error 行も残らず、`spool/` にファイルが残るだけである

6. 確認後、隔離ディレクトリを消す

   ```bash
   rm -rf "<隔離ディレクトリ>"
   ```

   macOS でログインした場合、キーチェーンに config ごとの項目が残る。消し方は `docs/guide/e2e.md` の「手動確認の準備」にある
