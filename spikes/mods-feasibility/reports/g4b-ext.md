# g4b 追加検証: SessionEnd の command hook の timeout で session.end の上限が上がるか

- 対象: Claude Code 2.1.288（macOS）。隔離 `CLAUDE_CONFIG_DIR=<scratch>/g4b/cfg`、未ログイン、モデル呼び出し 0 回
- すべての実行で `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` と `G4B_EXTEND_END_MS` を `env -u` で外した（`ext/cc2.sh`・`ext/tui2.sh`）。mod は env を設定していない（設定すると debug に `set CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` と出るが、今回の debug には一度も出ない）
- 送信先: 遅延 3 秒の受信器（18832）。上限の確認には遅延 12 秒（18838）・65 秒（18839）も使った
- 記録: `runs/x1`〜`runs/x5-*`（各 `debug.log`）、受信器 `runs/x1/recv-d{3,12,65}.jsonl`

## 結論

| 置き場所 | session.end の上限 | 遅延 3 秒の受信先へ |
|---|---|---|
| なし（対照） | 1.5 秒（`budget.ms=1500`） | 打ち切り |
| **mod と同じプラグインの `hooks.json`**（`modules` と並べて `hooks.SessionEnd`、`timeout: 30`） | **上がらない**（1499・1493） | 打ち切り（-p・対話とも） |
| **mod を持たない別プラグイン**（`timeout: 30`） | **上がらない**（1500・1499） | 打ち切り（-p・対話とも） |
| `--settings` の `hooks.SessionEnd`（`timeout: 30`） | 上がる（30 秒） | 200（-p 3072ms、対話 3596ms） |
| `--settings`、`timeout: 120` | 上がる（60 秒で止まる） | 200（-p 3022ms、対話 3024ms） |

- **プラグインの hooks.json に書いた SessionEnd の timeout は上限を上げない。**hook 自体は登録されて実行されている（debug `Registered 1 hooks`・`SessionEnd:other [true] completed with status 0`）。上げるのは settings のファイルに書いた hook だけだった（今回試したのは `--settings` だけ。user・project・managed の settings は試していない）
- プラグインの SessionEnd hook は、自分の `timeout: 30` があっても 1.5 秒で打ち切られる: `sleep 3; echo … >> marker` は `cancelled` になり、marker は書かれなかった。`--settings` の同じ hook は `completed with status 0` で marker が書かれた
- `next.budget.ms` が示す値は「上限」と「hook 1 回の予算 10 秒」の小さい方で、上限そのものではない:
  - `timeout: 5` → 4998、`timeout: 8` → 7999（壁時計で減る）
  - `timeout: 30`・`60`・`120` → 10000。このときは `$` の待ちの間に `remainingMs` が減らない（12 秒の送信の後で 9994）。実際に打ち切られた時刻は次のとおり
- 実際の打ち切り（壁時計）:
  - `timeout: 30`、遅延 12 秒の送信を 3 回続けた: 2 回が 200、全体 31.48 秒で `cut at the SessionEnd bound`
  - `timeout: 120`、遅延 65 秒の送信を 3 回続けた: 1 回目は fetch 自身の 30 秒上限で `aborted: no complete answer within 30000ms`、全体 60.93 秒で `cut at the SessionEnd bound`。**60 秒で止まる**（公式 docs の「up to 60 seconds」と一致）
  - fetch 1 回は上限を延ばしても 30 秒で打ち切られる（前回の結果と同じ）

## 解釈（推測を含む）

- 推測: 公式 docs の「your settings set a longer per-hook timeout」は文字どおり settings に書いた hook の意味で、プラグインの hooks.json の hook は対象外。プラグインだけで上限を上げる手段は、文書化されていない環境変数（前回の結果）しか見つかっていない
- 配布の観点: settings で上げるには、利用者の settings か managed settings に SessionEnd hook を置く必要がある。managed settings で配れば、文書化された手段だけで上限を最大 60 秒にできる（managed からも上がるかは未検証）
- 副作用: 上限を上げると、受信先が応答しないときの終了待ちも同じだけ延びる（30 秒にした対話の終了は、遅延 3 秒の受信先で 6.26 秒かかった。受信先が落ちていればもっと延びる）。mod 側で `Promise.race` の timeout を併用するのが前提になる

## 未検証事項

- user（`~/.claude/settings.json`）・project・managed の settings に書いた SessionEnd hook でも上がるか（`--settings` だけを試した。本人の settings は書き換えない規則のため）
- `disableAllHooks` や `allowManagedHooksOnly` の下での振る舞い
- Windows

## 痕跡

- 受信器（18832・18838・18839）は停止済み。pgrep で recv.py・sender.py・子 claude の残存なし。ポート 18830〜18839 は空き。tmux サーバなし、ソケット削除済み
- 本人の `~/.claude/settings.json` は mtime・サイズとも前回と同じ。`~/.claude.json` は mtime が変わったが g4b の文字列を含まない（並行して動いている本人のセッションと見られる。推測）
- 検証資材の正本: `spikes/mods-feasibility/g4b/ext/`（`se-only`・`se-sleep` のプラグイン、`mod-hooks-t30.json`・`mod-hooks-t120.json`、`settings-*.json`、`cc2.sh`・`tui2.sh`）。mod 本体には `G4B_END=send3`（session.end で 3 回続けて送る）を足した
