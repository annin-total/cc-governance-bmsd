# 既知の不具合

原因箇所まで特定できているが、まだ直していないもの。
サーバ（submodule `server/`）の修正は submodule 側でコミット・push する。

## 端末プラグイン

### `SessionStart(source=resume)` の `context_tokens` を取りこぼしている

`collect.py` は `context_tokens` を `PreCompact` / `Stop` のときだけ transcript から算出するが、
`SessionStart(source=resume)` の stdin には `context_tokens` が直接含まれる。
`resume` 直後の文脈量を取り逃している（バグではなく機会損失）。

**完了条件** — 契約に採るかを決める。採るなら `HOOK_FIELDS` に足して回帰テストを足す。
採らないなら理由を `../decisions/plugin.md` に記録する。

## サーバ

### `/ingest` 経路では `ANALYZE` が一度も呼ばれない

`db.analyze()` を呼ぶのは `csv_import.import_all()` だけで、`events` は `/ingest` でしか
増えないため、`events` の統計情報が更新されない。実機の DB（約 31 万件）で `sqlite_stat1` に
`events` の行が 0 件だった。クエリは実機で 207.6ms → `ANALYZE` 後 73.1ms、合成データでは
106.9ms → 3.3ms。`ANALYZE` 自体は実機で約 65ms かかる。

**完了条件** — `/ingest` 経由でも（一定件数・一定間隔ごとなど）`analyze()` が呼ばれるよう直し、
テストで固定する。受信のレイテンシを悪化させる場合の間引き方は `../decisions/server.md` に記録する。
