# トラック c の進捗

| UC | 状態 | 結果の 1 行 |
| --- | --- | --- |
| 31 | 済 | `-k collect` は hook 追加・キー改名・`json.py` の隠蔽をすべて落とす。`json.py`/`uuid.py` は exit 0・行 0 の完全な無言で、validate_plugin.py は合格にする。PermissionDenied は `-p` で発火せず（PermissionRequest は発火）。概況の NULL 率は 4 列だけで多くの消滅が見えない |
| 55 | 済 | 契約違いの旧版 4＋新版 1 の同時送信で行は入るが、`ts` 改名版の event 行は全損でどこにも残らない（200 で spool 削除）。版の分布は 5 端末が 1 台に潰れる。版を上げない再 publish は `plugin update` で届かず警告も無い |
| 38 | 実行中 | |
| 43 | 未着手 | |
| 35 | 済 | 同梱は `governance:名前`・`command_source=plugin`、利用者は素の名前・`userSettings`で区別可。組み込み `/compact` は command_name に残らない（2.1.283） |
| 36 | 済 | context_tokens は PreCompact・Stop だけ（9/9）。agent_id で親子は区別可。Agent を使うターンで Stop が 2 回出た（5 ターンで 7 回。サブエージェント境界の Stop という解釈は推定・要再現） |
