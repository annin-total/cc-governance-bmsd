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
| `spec/server.md` | 集計サーバの仕様（受信・保存・集計・画面・CSV の取込と書き出し） |
| `spec/design-system.md` | 管理画面のデザインシステム（見た目・部品・文言の決まり） |
| `decisions/plugin.md` | プラグインと契約の設計判断 |
| `decisions/server.md` | サーバの設計判断 |
| `guide/onboarding.md` | 利用者への導入案内と段階的な展開の進め方 |
| `guide/release.md` | プラグインを配布リポジトリへ差し込んでリリースする手順 |
| `guide/deploy-aip.md` | サーバを実行基盤（AIP）へデプロイする手順 |
| `guide/e2e.md` | 実機検証（`pytest e2e`）の正本。モジュールごとの目的・実行方法・罠 |
| `knowledge/upstream-features.md` | Claude Code に実在する hook・キー・環境変数の目録 |
| `knowledge/claude-code-behavior.md` | Claude Code の振る舞い（プラグインの更新・hook の実行環境・transcript・Mods） |
| `knowledge/measurements.md` | 実測値（SQLite・MySQL の性能と挙動、自システムの画面・受信・書き出し、hook と Claude Code の挙動、transcript の分布） |
| `knowledge/db-and-framework-facts.md` | DB とフレームワークの、測らずに決まっている仕様と数字でない観測 |
| `remaining/unverified.md` | 確かめれば白黒が付く未検証事項 |
| `remaining/known-issues.md` | 既知の課題（修正か判断によって完了するもの） |
| `remaining/deploy.md` | 実行基盤に到達しないとできない確認 |
| `remaining/distribution.md` | 社内リポジトリに到達しないとできない配布の確認と初回の作業 |
| `remaining/mods.md` | Mods（関数フック）を画面とコマンドに限って足す作業 |
| `remaining/collection.md` | 収集の hook の非同期化と、契約に足す項目の検討 |
