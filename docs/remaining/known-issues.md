# 既知の不具合

原因箇所まで特定できているが、まだ直していないもの。

## 端末プラグイン

### `SessionStart(source=resume)` の `context_tokens` を取りこぼしている

`collect.py` は `context_tokens` を `PreCompact` / `Stop` のときだけ transcript から算出するが、
`SessionStart(source=resume)` の stdin には `context_tokens` が直接含まれる。
`resume` 直後の文脈量を取り逃している（バグではなく機会損失）。

**完了条件** — 契約に採るかを決める。採るなら `HOOK_FIELDS` に足して回帰テストを足す。
採らないなら理由を `../decisions/plugin.md` に記録する。
