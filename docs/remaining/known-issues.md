# 既知の不具合

原因箇所まで特定できているが、まだ直していないもの。
サーバ（submodule `cc-governance-monitor`）の修正は submodule 側でコミット・push する。

## 端末プラグイン

### `sent_at` が未来日時だと送信が無期限に止まる

`_spool.py` の `should_send()` は `sent_at` の mtime からの経過秒で判定する。mtime が未来
（時計のズレ・手動改変）だと経過が負になり、その時刻を過ぎるまで送信が止まる。
エラーは出ず、自己修復もしない。

**完了条件** — 経過が負のときも送信するよう直し、`sent_at` が未来日時のケースのテストを足す。

### 単体で `spool_max_bytes` を超えたスプールは、送信を試みずに捨てられる

`_sender.run()` は `rotate()` → `prune()` → 送信の順で動くため、単体で上限（既定 5MB）を
超えたファイルは一度も POST されずに消える。実機では 104MB の queue が既定のまま消滅し、
上限を 500MB に広げると送信・格納された。長期間オフラインだった端末の復帰時に起こる。

**完了条件** — 送信を 1 回試みてから `prune()` する（または分割して送る）よう直してテストで
固定する。この挙動を維持するなら、境界条件として `../spec/plugin.md` に書き、
受け入れている限界として `../decisions/plugin.md` へ移す。

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
