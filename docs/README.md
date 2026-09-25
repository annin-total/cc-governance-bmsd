# 文書の索引

## 読者別の入口

- **管理者（非エンジニアを含む）** — 導入の進め方は `guide/onboarding.md`、仕組みの全体像は `spec/system.md`
- **開発者** — 仕様は `spec/`、なぜそうなっているかは `decisions/`、手順は `guide/`。
  書き換えるときの規約は `CLAUDE.md`

## 一覧

| ファイル | 中身 |
| --- | --- |
| `spec/system.md` | 全体像。端末・配布経路・サーバが何をどう受け渡すか・契約 |
| `spec/plugin.md` | 端末プラグインの仕様（設定の適用・お知らせ・収集と送信） |
| `spec/server.md` | 集計サーバの仕様（受信・保存・集計・画面・CSV 取込） |
| `spec/dashboard-style.md` | サーバの画面の見た目の決まり |
| `decisions/plugin.md` | プラグインと契約の設計判断 |
| `decisions/server.md` | サーバの設計判断 |
| `guide/onboarding.md` | 利用者への導入案内と段階的な展開の進め方 |
| `guide/release.md` | プラグインを配布リポジトリへ差し込んでリリースする手順 |
| `guide/deploy-aip.md` | サーバを実行基盤（AIP）へデプロイする手順 |
| `guide/local-e2e.md` | 導入から画面表示までを手元の実機で確かめる手順 |
| `guide/e2e.md` | 実機検証（`pytest e2e`）の正本。モジュールごとの目的・実行方法・罠 |
| `knowledge/upstream-features.md` | Claude Code に実在する hook・キー・環境変数の目録 |
| `knowledge/claude-code-behavior.md` | Claude Code の振る舞い（プラグインの更新・hook の実行環境・transcript） |
| `knowledge/measurements.md` | 実測値（SQLite・MySQL の性能と挙動、hook の起動時間、transcript の分布） |
| `knowledge/db-and-framework-facts.md` | DB とフレームワークの仕様として決まっていること |
| `remaining/known-issues.md` | 原因を特定済みで未修正の不具合 |
| `remaining/unverified.md` | 確かめれば白黒が付く未検証事項 |
| `remaining/deploy.md` | 実行基盤に到達しないとできない確認 |
| `remaining/distribution.md` | 社内リポジトリに到達しないとできない配布の確認 |

検証の道具のカタログは `../verification/README.md` にある。
