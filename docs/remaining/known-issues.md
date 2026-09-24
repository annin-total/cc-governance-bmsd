# 端末プラグインの既知の不具合

実機検証で再現し、原因箇所まで特定できているが、**まだ直していない**もの。
いずれも「修正して回帰テストを足す」で完了条件が書ける。

---

## 1. `sent_at` が未来日時だと送信が無期限に止まる

`_sender.py` の `should_send()` は `elapsed = now - sent_at.mtime` で判定し、`elapsed` が
送信間隔（10 分）を超えていることを送信条件とする。`sent_at` の mtime が現在時刻より未来に
なっていると `elapsed` が負になり、**判定が恒久的に偽になる。**時計のズレや `sent_at` の手動
改変で起こりうる。

その未来の時刻を過ぎるまでテレメトリが静かに欠け続け、**エラーは一切出ず、自己修復もしない。**
「無言で壊れる」ことを最も嫌うこのプロジェクトの設計原則に反する経路である。

**完了条件** — `elapsed` が負のときも送信条件が真になるよう判定を直し、`sent_at` が未来日時の
ケースを再現するテストを `tests/` に足す。

## 2. スプールが単体で `spool_max_bytes` を超えると、送信を試みずに捨てられる

`_sender.run()` は `rotate()` → `prune()` → 送信ループの順で動く。**`prune()` が送信より先に
走る。**スプールファイルが単体で `spool_max_bytes`（既定 5MB）を超えていると、一度も
`POST /ingest` を試みないまま削除される。

実機で 104MB の queue を既定のまま送信させると、spool が空になり送信ログも残らず消滅した。
上限を 500MB に広げると正常に送信・格納された。**長期間オフラインだった端末が復帰したとき、
溜まったデータがまとめて捨てられる。**「端末を圧迫しない」設計目的には合致するが、この境界
条件は `../spec/plugin.md` に未記載である。

**完了条件** — 送信を 1 回試みてから `prune()` する（または閾値超過ファイルを分割してから
送信する）よう順序または処理を見直し、単体ファイルが上限を超えるケースの挙動をテストで固定する。
あるいは、この挙動を維持すると判断するなら `../spec/plugin.md` §5.3 に境界条件として明記し、
この項目を `../decisions/plugin.md` §6（受け入れている限界）へ移す。

## 3. `SessionStart(source=resume)` の raw stdin にある `context_tokens` を取りこぼしている

`collect.py` は `context_tokens` を `PreCompact` / `Stop` のときだけ transcript から算出する
設計だが、`SessionStart(source=resume)` の raw stdin には `context_tokens` が直接含まれている。
同様に `seconds_since_last_response` / `prompt_cache_likely_expired` /
`estimated_cache_write_usd` も上流が提供しているが使っていない。

バグではなく機会損失だが、`resume` 直後の文脈量を取り逃している点は記録・判断が要る。

**完了条件** — `SessionStart(source=resume)` の raw `context_tokens` を契約に採るかどうかを
決める（採るなら `HOOK_FIELDS` に追加して回帰テストを足す。採らないなら理由を
`../decisions/plugin.md` に記録してこの項目を消す）。

---

## サーバ側

サーバ（`cc-governance-monitor`）に関する既知の不具合は `server-issues.md` に記録する
（submodule のため、修正はそちらでコミット・push する）。
