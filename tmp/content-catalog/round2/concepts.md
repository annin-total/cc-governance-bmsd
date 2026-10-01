# 管理画面の中身の構成案（第 2 弾）

一時文書である。第 1 弾の案 01（監督の 7 ページ）と案 13（トップと 3 ページ）の中間の構成を 5 個並べる。
カードとタブは `catalog.md` の id だけを使い、案ごとに違うのはページと群への並べ方だけである。
案の番号は第 1 弾（01〜15）と区別して 21〜25 とする。データと設定のページは全案で末尾に置き、ページ数に数えない。

---

## 1. 並べる前に決まること

### 1.1 タブの塊

カードは「開くタブ」が同じページにあるときだけ押せる。開く先でまとまるタブとカードの塊は次の 7 つで、案はこの塊の組み合わせになる。

| 塊 | タブ（数） | この塊のタブを開くカード |
| --- | --- | --- |
| 利用 | `user_use`・`daily_use`・`days_dist`（3） | `active_users`・`days_per_user`・`prompts_per_person_day`・`sessions_per_person_day`。`session_size`・`autocompact_sessions`・`bypass_users` も `user_use` を開ける |
| 呼び出し | `user_calls`・`skills`・`commands`・`external_tools`（4） | `skill_calls`・`command_calls`・`external_calls`・`agent_launches`（`user_calls` だけ） |
| 使われ方 | `session_size`・`usage_modes`（2） | `session_size`・`autocompact_sessions`・`bypass_users` |
| コスト | `user_cost`・`cost_daily`・`models`・`month`・`months`（5。`months` は 12 か月だけ） | `billed_users`・`new_users`・`retention`・`cost`・`cost_per_user`・`top_spenders`・`top10_share`・`model_mix`・`cache_read_share`・`forecast`・`per_bd`・`per_user_bd` |
| 設定の適用 | `policy_users`・`policy_settings`（2）と `policy_terminals`・`policy_versions`（2） | 前の 2 つ: `all_applied`・`off_users`・`not_introduced`・`setting_rates`。後の 2 つ: `stale_terminals`・`plugin_latest`・`core_latest` |
| 設定の効果 | `effect_sessions`・`effect_daily`（2） | `adopters`・`effect_session_size`・`effect_autocompact`・`effect_cost` |
| 収集 | `health`・`errors`（2）と `missing`（1） | `events_received`・`plugin_errors`・`null_rate`・`reconciliation`（`health`）。`uncollected` は `missing` だけ |

### 1.2 制約

1 ページ 6 タブまでとタブの塊から、次のことが並べる前に決まる。各項目は試しの定義と総当たりで確かめた（4 節の末尾）。

- **トップを除いて 3 ページにはできない。**23 タブは 3 × 6 = 18 に収まらない。3 ページにするには 5 つ以上のタブを置かない判断が要る（この文書ではしない）
- **4 ページは 1 つの形にしか責務が通らない。**6 タブ以下の分け方は 40 通りあるが、どれも利用か呼び出しのページに、収集・設定の適用の片側・設定の効果のどれかを同居させる。その中で同居が 1 つで済み、残りが呼び出し＋使われ方・コスト・設定の適用＋効果に揃うのは、利用に収集を置く形だけである。これが案 24 である
- **利用と呼び出しを 1 ページにできない**（7 タブ）。利用とコストも同じ（8 タブ）
- **設定の適用と収集を、そのまま 1 ページにできない**（7 タブ）。まとめるには、端末の 2 タブ（`policy_terminals`・`policy_versions`）を収集の側に寄せるか（案 22）、`missing` を照合の群ごとコストへ寄せる（案 23・25）
- **設定の効果を独立のページにして 5 ページに収めるには、`missing` をコストへ寄せるしかない**（案 25）。寄せないと 6 ページになるか、利用と収集を同じページにすることになる
- **利用明細の利用者の 3 枚（`billed_users`・`new_users`・`retention`）は `user_cost`（12 か月は `months`）と同じページに置かないと押せない。**このため全案でコストのページに置く。`ideas/00-sample/` はこの 3 枚を利用のページに置いており、押せない
- **`csv_freshness` は目録で開くタブを持たず、どの案でも押せない。**比較表の押せないカードの数には入れない
- **12 か月では、記録（`rec`・`match`）だけのページは空になる。**利用の塊・呼び出しの塊のページは、どの並べ方でも 12 か月で空になる。`rec7`・`match7` に固定した群は 12 か月でも 7 日の値で残る

### 1.3 全案で同じにしたこと

- 収集の受信・照合を期間を選ばないページに置くときは `rec7`・`match7` に固定する（第 1 弾の案 12・13 と同じ）
- トップは参照だけで中身を持たない。トップに置くのは「各ページの最初の群の先頭（人数・回数・金額）」「状態の印を持つカード（`off_users`・`not_introduced`・`plugin_errors` など）」「利用者ごとのコスト順位の入口（`top_spenders`）」「今月の見込み（`forecast`）」に限る
- トップに設定の効果のカードを置かない。前後の値を状態の数字のように並べると、前後差を効果と読ませる（決着済みの扱い）

---

## 2. 案の一覧

| 番号 | 名前 | トップ | ページ（トップを除く） |
| --- | --- | --- | --- |
| 21 | 設定に効果を寄せる | あり | 利用・呼び出し・コスト・設定・収集の状態 |
| 22 | 端末の点検をまとめる | あり | 利用・呼び出し・コスト・設定・端末 |
| 23 | セッションに効果を寄せる | なし | 利用・呼び出し・セッション・コスト・端末 |
| 24 | 4 ページにまとめる | あり | 利用・呼び出しとセッション・コスト・設定 |
| 25 | 効果を独立させる | あり | 利用・呼び出し・コスト・端末・設定の効果 |

窓の記号は `catalog.md` の「窓」の id を使う。カードの並びは群の中の表示順である。

---

## 3. 各案

### 案 21 設定に効果を寄せる

**狙い**: 案 01 の 7 ページから、独立していた設定の効果を設定の適用に寄せ、6 ページ目を減らす。「配った設定が入ったか」と「入れた前後で何が並ぶか」を 1 ページで読む。収集の状態は独立を保つ。

| ページ | リード | 群（見出し · 窓 · カード） | タブ |
| --- | --- | --- | --- |
| 利用（期間あり） | 誰が、どれだけの頻度で、どんな大きさのセッションで使っているか | 利用者 · `rec` · `active_users`・`days_per_user`・`prompts_per_person_day`・`sessions_per_person_day`<br>使われ方 · `rec` · `session_size`・`autocompact_sessions`・`bypass_users` | `user_use`・`daily_use`・`days_dist`・`session_size`・`usage_modes` |
| 呼び出し（期間あり） | スキル・コマンド・外部ツール・サブエージェントが、どれだけ何人に使われているか | 呼び出し · `rec` · `skill_calls`・`command_calls`・`external_calls`・`agent_launches` | `user_calls`・`skills`・`commands`・`external_tools` |
| コスト（期間あり） | いくらかかり、誰とどのモデルに集まっているか | 利用明細の利用者 · `bill` · `billed_users`・`new_users`・`retention`<br>コスト · `bill` · `cost`・`cost_per_user`・`top10_share`・`top_spenders`・`model_mix`・`cache_read_share`<br>今月 · `month` · `forecast`・`per_bd`・`per_user_bd` | `user_cost`・`cost_daily`・`models`・`month`・`months` |
| 設定（期間なし） | 配った設定が利用者と端末に入り、しきい値の前後で何が並ぶか | 利用者 · `p30` · `all_applied`・`off_users`・`not_introduced`<br>設定と更新 · `p30` · `setting_rates`・`stale_terminals`・`plugin_latest`・`core_latest`<br>しきい値の前後 · `study` · `adopters`・`effect_session_size`・`effect_autocompact`・`effect_cost` | `policy_users`・`policy_terminals`・`policy_settings`・`policy_versions`・`effect_sessions`・`effect_daily` |
| 収集の状態（期間なし） | 記録が欠けずに届き、利用明細と合っているか | 受信 · `rec7` · `events_received`・`plugin_errors`・`null_rate`<br>照合 · `match7` · `reconciliation`・`uncollected`<br>利用明細 · `now` · `csv_freshness` | `health`・`errors`・`missing` |

**トップの参照**（10 枚）: 利用 → `active_users`・`session_size`／呼び出し → `skill_calls`・`command_calls`／コスト → `cost`・`top_spenders`・`forecast`／設定 → `off_users`・`not_introduced`／収集の状態 → `plugin_errors`。
理由: 各ページの先頭の数字に、状態の印を持つ 3 枚と順位の入口を足した。呼び出しはスキルとコマンドが配布物の使われ方を直接示すので 2 枚にした。

**強み**
- ページ名が案 01 とほぼ同じで、どこに何があるかを名前から引ける
- 設定の効果が独立のページでなくなり、「効果」をページ名で掲げない。前後の値は設定の適用の続きとして読まれる
- 押せないカードが無い。タブの最大は 6（設定）

**弱み**
- 設定のページが 3 群・11 枚・6 タブで最も重い
- 報告の止まった端末と版が設定のページにあり、受信・エラーと別のページに割れる（第 1 弾の批判 3 が残る）
- 12 か月で利用・呼び出しの 2 ページが空になる

**近さ**: 01 に近い（01 の 7 ページから設定の効果を寄せた形）。

### 案 22 端末の点検をまとめる

**狙い**: 第 1 弾で推した「案 12 のページ＋案 13 のトップ」を 6 タブの決まりに合わせた形。設定の適用を「利用者と設定」と「端末」に分け、端末側を受信・照合と 1 ページにして、端末まわりの点検を 1 か所で答える。

| ページ | リード | 群（見出し · 窓 · カード） | タブ |
| --- | --- | --- | --- |
| 利用（期間あり） | 案 21 と同じ | 案 21 と同じ | 案 21 と同じ |
| 呼び出し（期間あり） | 案 21 と同じ | 案 21 と同じ | 案 21 と同じ |
| コスト（期間あり） | 案 21 と同じ | 案 21 と同じ | 案 21 と同じ |
| 設定（期間なし） | 配った設定が誰に入り、しきい値の前後で何が並ぶか | 適用 · `p30` · `all_applied`・`off_users`・`not_introduced`・`setting_rates`<br>しきい値の前後 · `study` · `adopters`・`effect_session_size`・`effect_autocompact`・`effect_cost` | `policy_users`・`policy_settings`・`effect_sessions`・`effect_daily` |
| 端末（期間なし） | 端末が最新版で、記録が欠けずに届き、利用明細と合っているか | 版と報告 · `p30` · `stale_terminals`・`plugin_latest`・`core_latest`<br>受信 · `rec7` · `events_received`・`plugin_errors`・`null_rate`<br>照合 · `match7` · `reconciliation`・`uncollected`<br>利用明細 · `now` · `csv_freshness` | `policy_terminals`・`policy_versions`・`health`・`errors`・`missing` |

**トップの参照**（10 枚）: 利用 → `active_users`・`session_size`／呼び出し → `skill_calls`／コスト → `cost`・`top_spenders`・`forecast`／設定 → `off_users`・`not_introduced`／端末 → `stale_terminals`・`plugin_errors`。
理由: 案 21 と同じ決まりで選び、端末のページからは状態の印を持つ 2 枚（報告停止・エラー）を出した。

**強み**
- 端末に関わる点検（版・報告停止・受信・欠け・エラー・照合）が 1 ページで答えられる（第 1 弾の批判 3 を解く）
- 設定のページは「利用者と設定」に閉じ、4 タブで軽い。タブの最大は 5
- 押せないカードが無い。トップを外しても各ページは壊れない

**弱み**
- 端末のページが 4 群・4 種の窓（`p30`・`rec7`・`match7`・`now`）を持ち、群の見出しで窓を読み分ける必要がある
- 設定の適用の 4 タブが 2 ページに割れる。`not_introduced`（未導入）は端末の話にも見えるが、開く先が `policy_users` のため設定のページに置く
- 12 か月で利用・呼び出しの 2 ページが空になる

**近さ**: 01 と 13 のちょうど中間（ページの切り方は 01、端末への集約は 13）。

### 案 23 セッションに効果を寄せる

**狙い**: 設定の効果を、同じ指標（セッションの大きさ・自動コンパクトに達した割合）の今の値の隣に置く。利用・呼び出し・セッション・コストを 4 ページに分け、設定の適用と受信を端末のページにまとめる。トップを置かない。

| ページ | リード | 群（見出し · 窓 · カード） | タブ |
| --- | --- | --- | --- |
| 利用（期間あり） | 誰が、どれだけの頻度で使っているか | 利用者 · `rec` · `active_users`・`days_per_user`・`prompts_per_person_day`・`sessions_per_person_day` | `user_use`・`daily_use`・`days_dist` |
| 呼び出し（期間あり） | 案 21 と同じ | 案 21 と同じ | 案 21 と同じ |
| セッション（期間あり） | セッションはどれだけ大きく、しきい値を守り始めた前後でどう並ぶか | 使われ方 · `rec` · `session_size`・`autocompact_sessions`・`bypass_users`<br>しきい値の前後 · `study` · `adopters`・`effect_session_size`・`effect_autocompact`・`effect_cost` | `session_size`・`usage_modes`・`effect_sessions`・`effect_daily` |
| コスト（期間あり） | いくらかかり、誰とどのモデルに集まり、利用明細と記録が揃っているか | 利用明細の利用者 · `bill` · 案 21 と同じ<br>コスト · `bill` · 案 21 と同じ<br>今月 · `month` · 案 21 と同じ<br>記録との照合 · `match` · `reconciliation`・`uncollected`<br>利用明細 · `now` · `csv_freshness` | `user_cost`・`cost_daily`・`models`・`month`・`months`・`missing` |
| 端末（期間なし） | 配った設定と最新版が端末に入り、記録が欠けずに届いているか | 適用 · `p30` · `all_applied`・`off_users`・`not_introduced`・`setting_rates`<br>版と報告 · `p30` · `stale_terminals`・`plugin_latest`・`core_latest`<br>受信 · `rec7` · `events_received`・`plugin_errors`・`null_rate` | `policy_users`・`policy_terminals`・`policy_settings`・`policy_versions`・`health`・`errors` |

**トップの参照**: なし。

**強み**
- しきい値の前後の値が、同じ指標の直近の値と同じページに並び、何の前後かが説明なしで分かる
- 12 か月でもセッションのページは前後の群が残る。空になるのは利用・呼び出しの 2 ページ
- 押せないカードが無い

**弱み**
- コストのページが 5 群・15 枚・6 タブ（12 か月）で最も重く、リードの問いが 2 つになる（コストと、利用明細と記録の突き合わせ）
- 期間のあるページの中に期間に依らない群（`study`）が入り、期間を切り替えても動かない群がある
- 端末のページが 6 タブで上限に達し、収集の塊が端末とコストに割れる
- トップが無く、全体を 1 枚で見る場所が無い（トップは参照だけなので後から足せる）

**近さ**: 01 に近い（ページを細かく分ける側）。

### 案 24 4 ページにまとめる

**狙い**: 案 13 のページの少なさを、6 タブの決まりの中で最も近く再現する。1.2 のとおり 4 ページは利用と収集を同じページにする形しか成り立たないので、利用のページを「記録から見た利用と、その記録の欠け」と読む。

| ページ | リード | 群（見出し · 窓 · カード） | タブ |
| --- | --- | --- | --- |
| 利用（期間あり） | 誰がどれだけの頻度で使い、その記録が欠けずに届いているか | 利用者 · `rec` · `active_users`・`days_per_user`・`prompts_per_person_day`・`sessions_per_person_day`<br>受信 · `rec` · `events_received`・`plugin_errors`・`null_rate`<br>照合 · `match` · `reconciliation`・`uncollected`<br>利用明細 · `now` · `csv_freshness` | `user_use`・`daily_use`・`days_dist`・`health`・`errors`・`missing` |
| 呼び出しとセッション（期間あり） | 何がどれだけ呼び出され、セッションはどれだけ大きいか | 呼び出し · `rec` · `skill_calls`・`command_calls`・`external_calls`・`agent_launches`<br>使われ方 · `rec` · `session_size`・`autocompact_sessions`・`bypass_users` | `user_calls`・`skills`・`commands`・`external_tools`・`session_size`・`usage_modes` |
| コスト（期間あり） | 案 21 と同じ | 案 21 と同じ | 案 21 と同じ |
| 設定（期間なし） | 案 21 と同じ | 案 21 と同じ | 案 21 と同じ |

**トップの参照**（9 枚）: 利用 → `active_users`・`plugin_errors`／呼び出しとセッション → `skill_calls`・`session_size`／コスト → `cost`・`top_spenders`・`forecast`／設定 → `off_users`・`not_introduced`。
理由: ページが 4 つなので各ページから 2〜3 枚にし、状態の印を持つカードを優先した。

**強み**
- ページが 4 つで最も少なく、案 13 の「迷わない」に最も近い
- 受信と照合が利用と同じ期間で動き、利用の数字がどれだけの記録から出ているかを同じページで確かめられる
- 押せないカードが無い

**弱み**
- 利用のページの問いが 2 つになる（使われ方と、記録の確かさ）。収集の群は保守者向けで、利用を見に来た人には余計である
- 3 ページが 6 タブで上限に達し、カードを 1 枚足す余地も、タブを 1 つ足す余地もほぼ無い
- 12 か月で呼び出しとセッションのページが空になり、利用のページも鮮度の 1 枚だけになる
- 報告の止まった端末と版が設定のページにあり、受信と別のページに割れる

**近さ**: 13 に近い。

### 案 25 効果を独立させる

**狙い**: 設定の効果を案 01 と同じく独立のページに保ったまま 5 ページに収める。そのために照合の群と `missing` をコストへ寄せ、設定の適用と受信を端末のページにまとめる。

| ページ | リード | 群（見出し · 窓 · カード） | タブ |
| --- | --- | --- | --- |
| 利用（期間あり） | 案 21 と同じ | 案 21 と同じ | 案 21 と同じ |
| 呼び出し（期間あり） | 案 21 と同じ | 案 21 と同じ | 案 21 と同じ |
| コスト（期間あり） | 案 23 と同じ | 案 23 と同じ | 案 23 と同じ |
| 端末（期間なし） | 案 23 と同じ | 案 23 と同じ | 案 23 と同じ |
| 設定の効果（期間なし） | 自動コンパクトのしきい値を守り始めた前後で、セッションの大きさとコストはどう並ぶか | しきい値の前後 · `study` · `adopters`・`effect_session_size`・`effect_autocompact`・`effect_cost` | `effect_sessions`・`effect_daily` |

**トップの参照**（9 枚）: 利用 → `active_users`・`session_size`／呼び出し → `skill_calls`／コスト → `cost`・`top_spenders`・`forecast`／端末 → `off_users`・`not_introduced`・`plugin_errors`。
理由: 案 21 と同じ決まり。設定の効果は 1.3 のとおり参照しない。

**強み**
- 設定の効果のページが案 01 と同じく 1 つの問いに閉じ、今の画面の扱い（決着済み）を崩さない
- 設定の適用・版・受信が端末のページで 1 か所に揃う
- 押せないカードが無い

**弱み**
- コストのページが案 23 と同じく重く、問いが 2 つになる
- 設定の効果のページが 1 群・4 枚・2 タブで薄い
- 端末のページが 6 タブで上限に達する
- 12 か月で利用・呼び出しの 2 ページが空になる

**近さ**: 01 に近い。

---

## 4. 比較

| 案 | ページ数 | トップ | 最大のタブ数（ページ） | 押せないカード | 12 か月で空になるページ |
| --- | ---: | --- | --- | ---: | --- |
| 21 | 5 | あり（10 枚） | 6（設定） | 0 | 利用・呼び出し |
| 22 | 5 | あり（10 枚） | 5（利用・コスト・端末） | 0 | 利用・呼び出し |
| 23 | 5 | なし | 6（コスト〔12 か月〕・端末） | 0 | 利用・呼び出し |
| 24 | 4 | あり（9 枚） | 6（利用・呼び出しとセッション・設定） | 0 | 呼び出しとセッション（利用も鮮度の 1 枚だけ） |
| 25 | 5 | あり（9 枚） | 6（コスト〔12 か月〕・端末） | 0 | 利用・呼び出し |

- 押せないカードの数に `csv_freshness` は入れていない（目録で押せない。全案で 1 枚）
- コストのタブ数は 12 か月の値（`months` を含む）。通常の期間では 1 つ少ない
- 案ごとの軸の取り方

| 軸 | 21 | 22 | 23 | 24 | 25 |
| --- | --- | --- | --- | --- | --- |
| 利用・呼び出し・セッション・コスト | 利用＋使われ方／呼び出し／コスト | 21 と同じ | すべて分ける | 利用＋収集／呼び出し＋使われ方／コスト | 21 と同じ |
| 設定の適用と収集 | 分ける | 端末側を収集とまとめる | 適用と受信をまとめる（照合はコスト） | 分ける（収集は利用へ） | 23 と同じ |
| 設定の効果 | 設定へ寄せる | 設定へ寄せる | セッションへ寄せる | 設定へ寄せる | 独立 |

**確かめ方**: 5 案の定義を `CATALOG.build` の書き方で試しに書き（スクラッチパッドの `r2-design/ideas.js`）、`kit/labels.js`・`catalog_cards.js`・`catalog_tabs.js`・`catalog_tabs2.js`・`catalog.js` を node の vm で読み込んで組み立てた。通常と 12 か月の両方で、コンソールのエラー 0・カード 40 枚とタブ 23 個を各案ですべて置く・トップの参照先がすべて存在することを確かめた。検査は、窓の混ざった群と重複したカードを入れた定義でエラーと押せないカードを出すことも確かめた。4 ページの分け方はタブの塊の総当たりで数えた（`r2-design/part.js`）。撮影による目視はしていない。

---

## 5. 推奨

**案 22 端末の点検をまとめる**を推す。

- 01 と 13 の中間に最も素直に立つ。期間で動く 3 ページ（利用・呼び出し・コスト）は 01 の切り方を保ち、期間に依らない点検は 13 のように端末へまとめる。トップは参照だけなので、外しても何も失わない
- 6 タブの決まりに余裕がある唯一の案である（最大 5）。カードかタブを 1 つ足すときに、ページを組み替えずに済む
- 端末に関わる点検が 1 か所に揃い、第 1 弾の批判 3（収集の点検が 2 ページに割れる）を解く。案 23・25 のようにコストのページへ照合を寄せないので、コストのページの問いが 1 つに保たれる
- 設定の効果を設定のページの群に置き、ページ名で「効果」を掲げない。前後差を効果と読ませない決着と合う

残る懸念は、端末のページで 4 種の窓が並ぶことと、12 か月で利用・呼び出しのページが空になること（後者は全案に共通）。
