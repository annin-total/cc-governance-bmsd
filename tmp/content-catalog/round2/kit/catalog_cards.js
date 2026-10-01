"use strict";
// 目録のカードと窓（catalog.md の「カード」「窓」）。カードの中身はここにだけ書き、案の ia.js は id で呼ぶ。
// win: 群の窓。tabs: 押したときに開くタブの候補（ページにある最初のタブ）。long: 12 か月の差し替え（"same" はそのまま）。
(() => {
  const { L } = window.KIT;
  const SAME = "same";
  const PREV = "前の {period[days]} 日";

  // 窓。data は群の値の根、fixed は期間に依らない窓（12 か月でも同じに出す）、base は同じ種類の窓（期間を固定した写し）
  const W = {
    rec: { name: "記録", scope: "直近 {period[days]} 日（{period[start]:md}〜{period[end]:md}）と前の {period[days]} 日 · 記録を送った利用者", longScope: "記録" },
    rec7: { name: "受信", base: "rec", data: "p.7", fixed: true, scope: "直近 7 日（{period[start]:md}〜{period[end]:md}）と前の 7 日 · 記録を送った利用者 · 期間は選べません" },
    bill: { name: "利用明細", scope: "利用明細 {x[cost][start]:md}〜{x[cost][end]:md} と前の {period[days]} 日 · 利用明細にコストがあった利用者",
      longScope: "利用明細 直近 {period[months]} か月（{x[cost][start]:day}〜{x[cost][end]:day}）· 週と暦月 · 前の期間と比べない" },
    match: { name: "照合", scope: "利用明細の最終日までの {period[days]} 日 · 記録と利用明細の突き合わせ", longScope: "記録と利用明細の突き合わせ" },
    match7: { name: "照合", base: "match", data: "p.7", fixed: true, scope: "利用明細の最終日までの 7 日 · 記録と利用明細の突き合わせ · 期間は選べません" },
    month: { name: "今月", fixed: true, scope: "{month[month]:ym} · 利用明細の最終日（{month[as_of]:md}）まで · 前月と並べる" },
    p30: { name: "端末の報告", data: "fixed.policy", fixed: true, scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件 · 対象は{basis:basis} {denominator:num} 人" },
    study: { name: "しきい値の前後", data: "fixed.effect", fixed: true, scope: "{REFERENCE_KEY:setting}を {REFERENCE_VALUE} にした前後 {EVENT_STUDY_SPAN} 日 · しきい値を守り始めた利用者 · 前後の境は各利用者が守り始めた日" },
    now: { name: "利用明細の鮮度", fixed: true, scope: "現時点 · 取り込んだ利用明細" },
  };

  const TREND_CAP = ["{period[prev_start]:md}", "濃い部分が直近 {period[days]} 日", "{period[end]:md}"];
  const DAILY_CAP = "日ごと · 濃い棒が直近 {period[days]} 日";
  const MONTHS_BARS = (field, fmt) => ({ kind: "bars", src: "x[months]", field, fmt, tipLabel: "{day:ym}" });
  // 呼び出し 4 種: 回数（大）・前との差・使った人 N / 全 M 人・上位 3 つ
  const calls = (key, label, tabs, cap) => ({ win: "rec", label, unit: "回", tabs, wide: true, value: `{calls[${key}][total]:num}`, delta: `{calls[${key}][delta]:signed}`,
    sub: `${PREV} {calls[${key}][prev]:num} 回 · 使った人 {calls[${key}][users]:num} / 全 {calls[${key}][all_users]:num} 人`,
    viz: { kind: "rates", src: `calls[${key}][top]`, field: "calls", den: "max", label: "{label}", right: ["{calls:num} 回", "{users:num} 人"] }, cap: [cap] });
  const side = (field, fmt) => ({ kind: "pair", src: "F[effect2]", field, terms: L.SIDE, fmt });

  const K = {
    // ---- 利用（記録）----
    active_users: { win: "rec", label: "利用者", unit: "人", tabs: ["user_use", "daily_use"], value: "{x[active][users]:num}", delta: "{users[delta]:signed}",
      sub: PREV + " {x[active_prev][users]:num} 人", viz: { kind: "spark", src: "x[daily]", field: "users" }, cap: TREND_CAP },
    days_per_user: { win: "rec", label: "1 人あたりの利用日数", unit: "日", tabs: ["days_dist", "user_use"], value: "{x[active][days_per_user]:dec1}",
      sub: PREV + " {x[active_prev][days_per_user]:dec1} 日", viz: { kind: "hist", src: "x[days_dist]", sides: ["now"] }, cap: ["利用した日数ごとの人数（1 日〜{period[days]} 日）"] },
    prompts_per_person_day: { win: "rec", label: "1 人 1 日あたりの指示", unit: "件", tabs: ["daily_use", "user_use"], value: "{x[active][prompts_per_person_day]:dec1}",
      sub: PREV + " {x[active_prev][prompts_per_person_day]:dec1} 件", viz: { kind: "bars", src: "x[daily]", field: "prompts" }, cap: ["全員の指示 · " + DAILY_CAP] },
    sessions_per_person_day: { win: "rec", label: "1 人 1 日あたりのセッション", unit: "件", tabs: ["daily_use", "user_use"], value: "{x[active][sessions_per_person_day]:dec1}",
      sub: "期間のセッション {x[active][sessions]:num} 件 · 前 {x[active_prev][sessions_per_person_day]:dec1} 件", viz: { kind: "bars", src: "x[daily]", field: "sessions" }, cap: ["全員のセッション · " + DAILY_CAP] },

    // ---- 呼び出し（記録）----
    skill_calls: calls("skills", "スキルの呼び出し", ["skills", "user_calls"], "上位 3 つ · 回数と使った人"),
    command_calls: calls("commands", "コマンドの呼び出し", ["commands", "user_calls"], "上位 3 つ · 定義元をまたいで合計"),
    external_calls: calls("external", "外部ツールの呼び出し", ["external_tools", "user_calls"], "上位 3 つ · MCP はサーバごと"),
    agent_launches: { win: "rec", label: "サブエージェントの起動", unit: "回", tabs: ["user_calls"], wide: true, value: "{calls[agents][total]:num}", delta: "{calls[agents][delta]:signed}",
      sub: PREV + " {calls[agents][prev]:num} 回 · 使った人 {calls[agents][users]:num} / 全 {calls[agents][all_users]:num} 人",
      viz: { kind: "meter", src: "calls[agents][users]", den: "calls[agents][all_users]" }, cap: ["帯は使った人の割合 · 種類は記録していない"] },

    // ---- セッション（記録）----
    session_size: { win: "rec", label: "セッションの大きさ（中央）", unit: "トークン", wide: true, tabs: ["session_size", "user_use"], value: "{size[median]:tok}",
      sub: "四分位 {size[q1]:tok}〜{size[q3]:tok} · " + PREV + " {size[prev][median]:tok} · {size[sessions]:num} セッション",
      viz: { kind: "hist", src: "size[dist]", sides: ["prev", "recent"], terms: L.PERIOD }, cap: ["セッションごとに応答終了時のコンテキストの最大 · 区間の幅 {CONTEXT_BIN:tok} トークン"] },
    autocompact_sessions: { win: "rec", label: "自動コンパクトに達した割合", unit: "%", tabs: ["session_size", "user_use"], value: "{size[auto_share]:dec1}",
      sub: "{size[auto_sessions]:num} / {size[sessions]:num} セッション · " + PREV + " {size[prev][auto_share]:pct}",
      viz: { kind: "meter", src: "size[auto_share]", den: 100, tone: "warn" }, cap: ["自動コンパクト（PreCompact の auto）が 1 回でもあったセッション"] },
    bypass_users: { win: "rec", label: "確認なしモードを使った利用者", unit: "人", tabs: ["usage_modes", "user_use"], value: "{x[active][bypass_users]:num}",
      sub: "記録を送った利用者の {x[active][bypass_reach]:pct} · " + PREV + " {x[active_prev][bypass_users]:num} 人",
      viz: { kind: "meter", src: "x[active][bypass_users]", den: "x[active][users]", tone: "warn" }, cap: ["権限モード「確認なし」の記録が 1 件でもあった人"] },

    // ---- 利用（利用明細）----
    billed_users: { win: "bill", label: "利用明細の利用者", unit: "人", tabs: ["user_cost"], value: "{x[cost][users]:num}", sub: PREV + " {x[cost][users_prev]:num} 人",
      viz: { kind: "bars", src: "x[daily]", field: "cost_users" }, cap: ["日ごとの人数 · 濃い棒が直近 {period[days]} 日"],
      long: { label: "利用明細の利用者", unit: "人", tabs: ["months", "user_cost"], value: "{x[cost][users]:num}", sub: "期間にコストがあった人", viz: MONTHS_BARS("users"), cap: ["暦月ごとの人数"] } },
    new_users: { win: "bill", label: "使い始めた利用者", unit: "人", tabs: ["user_cost"], value: "{m[new_user_count]:num}", sub: "利用明細に初めてコストが出た人",
      long: { label: "使い始めた利用者", unit: "人", tabs: ["months", "user_cost"], value: "{m[new_user_count]:num}", sub: "利用明細に初めてコストが出た人", viz: MONTHS_BARS("new_users"), cap: ["暦月ごとの人数"] } },
    retention: { win: "bill", label: "継続率", unit: "%", tabs: ["user_cost"], value: "{m[retention_rate]:dec1}", sub: "前の {period[days]} 日から離れた {m[left_users]:count} 人",
      viz: { kind: "meter", src: "m[retention_rate]", den: 100, tone: "ok" }, cap: ["前の期間の利用者のうち、今も使った割合"],
      long: { label: "継続率", unit: "%", tabs: ["months", "user_cost"], value: "{m[retention_rate]:dec1}", sub: "{m[retention_month]:ym} · 前の月から離れた {m[left_users]:count} 人",
        viz: { kind: "bars", src: "m[retention_rows]", field: "rate", fmt: "dec1", tipLabel: "{day:ym}" }, cap: ["暦月ごと · 前の月の利用者のうち、その月も使った割合"] } },

    // ---- コスト（利用明細）----
    cost: { win: "bill", label: "コスト", tabs: ["cost_daily", "user_cost"], value: "{x[cost][total]:usd}", delta: "{x[cost][change]:signed_pct}", sub: PREV + " {x[cost][prev]:usd}",
      viz: { kind: "bars", src: "x[daily]", field: "cost", fmt: "usd" }, cap: [DAILY_CAP],
      long: { label: "コスト", tabs: ["cost_weeks", "months"], value: "{x[cost][total]:usd}", sub: "月平均 {cost[monthly]:usd} · 前の期間と比べない", viz: MONTHS_BARS("cost", "usd"), cap: ["暦月ごと"] } },
    cost_per_user: { win: "bill", label: "1 人あたりコスト", tabs: ["user_cost"], value: "{x[cost][per_user]:usd}", delta: "{x[cost][per_user_change]:signed_pct}",
      sub: "利用明細の {x[cost][users]:num} 人で割る", viz: { kind: "pair", src: "x[cost]", terms: { per_user_prev: PREV, per_user: "直近 {period[days]} 日" } },
      long: { label: "1 人あたりコスト", tabs: ["user_cost"], value: "{x[cost][per_user]:usd}", sub: "利用明細の {x[cost][users]:num} 人で割る" } },
    top_spenders: { win: "bill", label: "コストの多い利用者", tabs: ["user_cost"], wide: true, sub: "上位 5 人 · 割合は期間のコストのうち",
      viz: { kind: "rates", src: "x[billed]", field: "cost", den: "max", label: "{email}", limit: 5, right: ["{cost:usd}", "{share:pct}"] }, long: SAME },
    top10_share: { win: "bill", label: "上位 10% の占める割合", unit: "%", tabs: ["user_cost"], value: "{x[cost][top10_share]:dec1}", sub: "上位 {x[cost][top10_n]:num} 人 · 上位 5 人は {x[cost][top5_share]:pct}",
      viz: { kind: "meter", src: "x[cost][top10_share]", den: 100, tone: "warn" }, long: SAME },
    model_mix: { win: "bill", label: "モデル別の内訳", unit: "%", tabs: ["models"], wide: true, value: "{x[models][0][share]:dec1}",
      sub: "最も多いのは {x[models][0][key]:model} · 使った人 {x[models][0][users]:num} 人",
      viz: { kind: "rates", src: "x[models]", field: "share", label: "{key:model}", right: ["{cost:usd}", "{share:pct}"] }, cap: ["割合は期間のコストのうち"], long: SAME },
    cache_read_share: { win: "bill", label: "キャッシュ読み込みの割合", unit: "%", tabs: ["models"], value: "{x[tokens][cache_read_share]:dec1}", sub: "全 {x[tokens][total]:tok} トークンのうち",
      viz: { kind: "meter", src: "x[tokens][cache_read_share]", den: 100, tone: "ok" }, long: SAME },

    // ---- 今月 ----
    forecast: { win: "month", label: "月末のコスト見込み（{month[month]:mon} 月）", tabs: ["month"], value: "{month[forecast]:usd}", viz: { kind: "forecast", src: "month", stats: [] },
      cap: ["実績 {month[actual]:usd} · {month[elapsed]:num} / {month[business_days]:num} 営業日", "{month[as_of]:asof}"],
      empty: "month[as_of]", capEmpty: ["今月（{month[month]:mon} 月）の利用明細はまだありません"] },
    per_bd: { win: "month", label: "営業日あたりのコスト", tabs: ["month"], value: "{month[per_bd]:usd}", delta: "{month[per_bd_change]:signed_pct}", sub: "前月 {month[prev_per_bd]:usd}",
      viz: { kind: "pair", src: "month", terms: { prev_per_bd: "前月", per_bd: "今月" } } },
    per_user_bd: { win: "month", label: "1 人 1 営業日あたり", tabs: ["month"], value: "{month[per_user]:usd}", delta: "{month[per_user_change]:signed_pct}",
      sub: "前月 {month[prev_per_user]:usd} · 今月 {month[users]:num} 人", viz: { kind: "pair", src: "month", terms: { prev_per_user: "前月", per_user: "今月" } } },

    // ---- 設定の適用（30 日）----
    all_applied: { win: "p30", label: "すべての設定を適用", unit: "人", tabs: ["policy_users"], chip: "ok", value: "{counts[ok]:num}", sub: "対象 {denominator:num} 人のうち {counts[ok_rate]:pct}",
      viz: { kind: "meter", src: "counts[ok]", den: "denominator", tone: "ok" }, cap: ["{counts[items]:num} つの設定がすべて配布した値"] },
    off_users: { win: "p30", label: "未適用のある利用者", unit: "人", tabs: ["policy_users"], chip: "off", value: "{counts[off]:num}", state: "states[off]",
      sub: "端末 {counts[off_terminals]:num} 台 · 違う値か未設定", viz: { kind: "meter", src: "counts[off]", den: "denominator", tone: "ng" }, cap: ["対象 {denominator:num} 人のうち"] },
    not_introduced: { win: "p30", label: "プラグイン未導入", unit: "人", tabs: ["policy_users"], chip: "none", value: "{counts[none]:num}", state: "states[none]",
      sub: "コストがあるのに報告が無い", viz: { kind: "meter", src: "counts[none]", den: "denominator", tone: "warn" }, cap: ["対象 {denominator:num} 人のうち"] },
    setting_rates: { win: "p30", label: "設定ごとの適用率", tabs: ["policy_settings"], wide: true, sub: "最も低いのは {lowest:setting}",
      viz: { kind: "rates", src: "items", field: "rate", terms: L.SETTING, right: ["{numerator:num} / {denominator:num} 人", "{rate:pct}"] } },
    stale_terminals: { win: "p30", label: "報告が止まった端末", unit: "台", tabs: ["policy_terminals"], chip: "stale", value: "{counts[stale_terminals]:num}",
      sub: "{counts[stale_users]:num} 人 · 最後の報告から {STALE_DAYS} 日以上", viz: { kind: "meter", src: "counts[stale_terminals]", den: "counts[terminals]", tone: "neutral" }, cap: ["全 {counts[terminals]:num} 台のうち"] },
    plugin_latest: { win: "p30", label: "プラグインが最新版の端末", unit: "台", tabs: ["policy_versions"], chip: "plugin", value: "{plugin[latest_count]:num}",
      sub: "最新 {plugin[latest]} · 全 {plugin[total]:num} 台", viz: { kind: "stack", src: "plugin[parts]", tone: "accent" } },
    core_latest: { win: "p30", label: "本体が最新版の端末", unit: "台", tabs: ["policy_versions"], chip: "core", value: "{core[latest_count]:num}",
      sub: "最新 {core[latest]} · 全 {core[total]:num} 台", viz: { kind: "stack", src: "core[parts]", tone: "accent" } },

    // ---- 設定の効果（前後 14 日）----
    adopters: { win: "study", label: "しきい値を守り始めた利用者", unit: "人", tabs: ["effect_daily"], value: "{adopters:num}", sub: "日ごとの対象者 {study[people_min]:num}〜{study[people_max]:num} 人" },
    effect_session_size: { win: "study", label: "セッションの大きさ（中央）", unit: "トークン", tabs: ["effect_sessions"], value: "{F[effect2][after][median]:tok}",
      sub: "適用後（適用前 {F[effect2][before][median]:tok}）· {F[effect2][before][sessions]:num} → {F[effect2][after][sessions]:num} 件", viz: side("median"), cap: ["セッションごとに応答終了時のコンテキストの最大"] },
    effect_autocompact: { win: "study", label: "自動コンパクトに達した割合", unit: "%", tabs: ["effect_sessions"], value: "{F[effect2][after][auto_share]:dec1}",
      sub: "適用後（適用前 {F[effect2][before][auto_share]:pct}）· {F[effect2][before][auto_sessions]:num} → {F[effect2][after][auto_sessions]:num} 件", viz: side("auto_share"),
      cap: ["しきい値を下げると、達するセッションは増える"] },
    effect_cost: { win: "study", label: "1 人 1 日あたりのコスト", tabs: ["effect_daily"], value: "{study[after][cost]:usd}",
      sub: "適用後（適用前 {study[before][cost]:usd}）· {study[before][person_days]:num} → {study[after][person_days]:num} 人日", viz: { kind: "pair", src: "study", field: "cost", terms: L.SIDE },
      cap: ["{EFFECT_PROVIDER:provider} · 時期の変動を含む"] },

    // ---- 収集 ----
    events_received: { win: "rec", label: "受信した記録", unit: "件", tabs: ["health"], value: "{events[recent]:num}", delta: "{events[delta]:signed}", sub: PREV + " {events[prev]:num} 件",
      viz: { kind: "pair", src: "events", terms: L.PAIR } },
    plugin_errors: { win: "rec", label: "プラグインのエラー", unit: "件", tabs: ["errors"], value: "{errors[total]:num}", state: "errors[state]", sub: "{errors[kinds]:num} 種類 · 前との比較なし",
      viz: { kind: "stack", src: "errors[stages]", tone: "warn", terms: L.STAGE } },
    null_rate: { win: "rec", label: "項目の欠け（最大）", unit: "%", tabs: ["health"], wide: true, chip: "null", value: "{nulls[rate]:dec1}", state: "nulls[state]",
      sub: "{nulls[key]:field} · {nulls[ok]:num} / {nulls[total]:num} 項目が正常", viz: { kind: "rates", src: "nulls[fields]", field: "rate", terms: L.HEALTH_ITEM, right: ["{rate:pct}"] } },
    reconciliation: { win: "match", label: "利用明細との照合率", unit: "%", tabs: ["health", "missing"], value: "{reconciliation[rate]:dec1}",
      sub: "利用明細にもいた {reconciliation[numerator]:num} 人 / 送信した {reconciliation[denominator]:num} 人",
      viz: { kind: "meter", src: "reconciliation[numerator]", den: "reconciliation[denominator]" }, cap: ["前との比較なし"] },
    uncollected: { win: "match", label: "記録の無い利用明細の利用者", unit: "人", tabs: ["missing"], chip: "billed_only", value: "{m[uncollected_billed_users]:count}", sub: "コストはあるが記録が無い" },
    csv_freshness: { win: "now", label: "利用明細の鮮度", unit: "日前", value: "{F[m][csv_freshness_days]:num}", sub: "最終日 {F[m][csv_end]:day} · 利用明細は約 3 日遅れで確定" },
  };

  window.CATALOG = Object.assign(window.CATALOG || {}, { K, W, SAME });
})();
