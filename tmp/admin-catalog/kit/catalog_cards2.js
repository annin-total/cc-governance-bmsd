"use strict";
// 目録のカードの続き: 利用状況・設定の適用状況・設定の効果・収集の状態（concepts.md の 2.2）。書き方は catalog_cards.js の先頭。
(() => {
  const { L } = window.KIT;
  const { K } = window.CATALOG;
  const PREV = "前の {period[days]} 日";
  const CH = (k) => `r3[changes][${k}]`;
  const DAILY_CAP = "日ごと · 濃い棒が直近 {period[days]} 日";
  // 呼び出し 3 種: 回数（大）・前との率・前の回数・使った人 N / 全 M 人・上位 3 つ
  const calls = (key, label, chip, cap) => ({ win: "rec", label, unit: "回", tabs: ["calls", "user_calls"], chip, wide: true, better: "up", value: `{calls[${key}][total]:num}`,
    delta: { v: CH(`${key}_calls`), prev: `{calls[${key}][prev]:num} 回` },
    sub: `前 {calls[${key}][prev]:num} 回 · 使った人 {calls[${key}][users]:num} / 全 {calls[${key}][all_users]:num} 人`,
    viz: { kind: "rates", src: `calls[${key}][top]`, field: "calls", den: "max", label: "{label}", right: ["{calls:num} 回", "{users:num} 人"] }, cap: [cap] });
  const side = (field, fmt) => ({ kind: "pair", src: "F[effect2]", field, terms: L.SIDE, fmt });
  const P = (k) => `counts[${k}]`;

  Object.assign(K, {
    // ---- 利用状況: 頻度 ----
    days_per_user: { win: "rec", label: "1 人あたりの利用日数", unit: "日", tabs: ["user_use"], better: "up", value: "{x[active][days_per_user]:dec1}",
      delta: { v: CH("days_per_user"), prev: "{x[active_prev][days_per_user]:dec1} 日" },
      sub: "前 {x[active_prev][days_per_user]:dec1} 日 · 記録を送った {x[active][users]:num} 人", viz: { kind: "hist", src: "x[days_dist]", sides: ["now"] }, cap: ["利用した日数ごとの人数（1 日〜{period[days]} 日）"] },
    prompts_per_person_day: { win: "rec", label: "1 人 1 日あたりの指示", unit: "件", tabs: ["daily_use"], better: "up", value: "{x[active][prompts_per_person_day]:dec1}",
      delta: { v: CH("prompts_per_person_day"), prev: "{x[active_prev][prompts_per_person_day]:dec1} 件" },
      sub: "前 {x[active_prev][prompts_per_person_day]:dec1} 件", viz: { kind: "bars", src: "x[daily]", field: "prompts" }, cap: ["全員の指示 · " + DAILY_CAP] },
    sessions_per_person_day: { win: "rec", label: "1 人 1 日あたりのセッション", unit: "件", tabs: ["daily_use"], better: "up", value: "{x[active][sessions_per_person_day]:dec1}",
      delta: { v: CH("sessions_per_person_day"), prev: "{x[active_prev][sessions_per_person_day]:dec1} 件" },
      sub: "期間のセッション {x[active][sessions]:num} 件 · 前 {x[active_prev][sessions_per_person_day]:dec1} 件", viz: { kind: "bars", src: "x[daily]", field: "sessions" }, cap: ["全員のセッション · " + DAILY_CAP] },
    // ---- 利用状況: 呼び出し ----
    skill_calls: calls("skills", "スキルの呼び出し", "skill", "上位 3 つ · 回数と使った人"),
    command_calls: calls("commands", "コマンドの呼び出し", "command", "上位 3 つ · 定義元をまたいで合計"),
    external_calls: calls("external", "外部ツールの呼び出し", "external", "上位 3 つ · MCP はサーバごと"),
    agent_launches: { win: "rec", label: "サブエージェントの起動", unit: "回", tabs: ["user_calls"], wide: true, better: "up", value: "{calls[agents][total]:num}",
      delta: { v: CH("agents_calls"), prev: "{calls[agents][prev]:num} 回" },
      sub: "前 {calls[agents][prev]:num} 回 · 使った人 {calls[agents][users]:num} / 全 {calls[agents][all_users]:num} 人",
      viz: { kind: "meter", src: "calls[agents][users]", den: "calls[agents][all_users]" }, cap: ["帯は使った人の割合 · 種類は記録していない"] },
    // ---- 利用状況: セッション ----
    session_size: { win: "rec", label: "セッションの大きさ（中央）", unit: "トークン", wide: true, tabs: ["session_size"], better: "down", value: "{size[median]:tok}",
      delta: { v: CH("session_size"), prev: "{size[prev][median]:tok}" },
      sub: "四分位 {size[q1]:tok}〜{size[q3]:tok} · 前 {size[prev][median]:tok} · {size[sessions]:num} セッション",
      viz: { kind: "hist", src: "size[dist]", sides: ["prev", "recent"], terms: L.PERIOD }, cap: ["セッションごとに応答終了時のコンテキストの最大 · 区間の幅 {CONTEXT_BIN:tok} トークン"] },
    autocompact_sessions: { win: "rec", label: "自動コンパクトに達した割合", unit: "%", tabs: ["session_size"], better: "", value: "{size[auto_share]:dec1}",
      delta: { v: CH("autocompact_pt"), fmt: "signed_pt", prev: "{size[prev][auto_share]:pct}" },
      sub: "{size[auto_sessions]:num} / {size[sessions]:num} セッション · 前 {size[prev][auto_share]:pct}",
      viz: { kind: "meter", src: "size[auto_share]", den: 100, tone: "neutral" }, cap: ["自動コンパクト（PreCompact の auto）が 1 回でもあったセッション"] },
    bypass_users: { win: "rec", label: "確認なしモードを使った利用者", unit: "人", tabs: ["usage_modes"], better: "down", value: "{x[active][bypass_users]:num}",
      delta: { v: CH("bypass_diff"), fmt: "signed", unit: "人", prev: "{x[active_prev][bypass_users]:num} 人" },
      sub: "記録を送った利用者の {x[active][bypass_reach]:pct} · 前 {x[active_prev][bypass_users]:num} 人",
      viz: { kind: "meter", src: "x[active][bypass_users]", den: "x[active][users]", tone: "neutral" }, cap: ["権限モード「確認なし」の記録が 1 件でもあった人"] },

    // ---- 設定の適用状況（30 日・利用者単位）----
    all_applied: { win: "p30", label: "すべての設定を適用", unit: "人", tabs: ["policy_users"], chip: "ok", value: `{${P("ok")}:num}`, sub: `直近 {POLICY_DAYS} 日の対象 {denominator:num} 人のうち {${P("ok_rate")}:pct}`,
      viz: { kind: "meter", src: P("ok"), den: "denominator", tone: "ok" }, cap: ["{items:count} つの設定がすべて配布した値"] },
    off_users: { win: "p30", label: "未適用のある利用者", unit: "人", tabs: ["policy_users"], chip: "off", value: `{${P("off")}:num}`, state: "states[off]",
      sub: "違う値か未設定の設定がある", viz: { kind: "meter", src: P("off"), den: "denominator", tone: "ng" }, cap: ["直近 {POLICY_DAYS} 日の対象 {denominator:num} 人のうち"] },
    not_introduced: { win: "p30", label: "プラグイン未導入", unit: "人", tabs: ["policy_users"], chip: "none", value: `{${P("none")}:num}`, state: "states[none]",
      sub: "コストがあるのに報告が無い", viz: { kind: "meter", src: P("none"), den: "denominator", tone: "warn" }, cap: ["直近 {POLICY_DAYS} 日の対象 {denominator:num} 人のうち"] },
    setting_rates: { win: "p30", label: "設定ごとの適用率", tabs: ["policy_settings"], wide: true, sub: "最も低いのは {lowest:setting}",
      viz: { kind: "rates", src: "items", field: "rate", terms: L.SETTING, right: ["{numerator:num} / {denominator:num} 人", "{rate:pct}"] } },
    core_outdated: { win: "p30", label: "本体が古いバージョンの利用者", unit: "人", tabs: ["versions"], chip: "core", value: "{core[outdated]:num}", state: "core[state]",
      sub: "最新 {core[latest]} · 直近 {POLICY_DAYS} 日の対象 {core[total]:num} 人", viz: { kind: "stack", src: "core[parts]", tone: "accent" } },
    plugin_outdated: { win: "p30", label: "プラグインが古いバージョンの利用者", unit: "人", tabs: ["versions"], chip: "plugin", value: "{plugin[outdated]:num}", state: "plugin[state]",
      sub: "最新 {plugin[latest]} · 直近 {POLICY_DAYS} 日の対象 {plugin[total]:num} 人", viz: { kind: "stack", src: "plugin[parts]", tone: "accent" } },
    // 案 33: まとめたカード（行ごとの札。カードの札は行の最も重いもの）
    applied_all: { win: "p30", label: "設定の適用", unit: "人", tabs: ["policy_users"], value: `{${P("ok")}:num}`, state: ["states[off]", "states[none]"],
      why: `未適用あり {${P("off")}:num} 人・未導入 {${P("none")}:num} 人`, sub: `すべての設定を適用 · 直近 {POLICY_DAYS} 日の対象 {denominator:num} 人のうち {${P("ok_rate")}:pct}`,
      viz: { kind: "staterows", rows: [{ label: "未適用あり", value: `{${P("off")}:num} 人`, state: "states[off]" }, { label: "未導入", value: `{${P("none")}:num} 人`, state: "states[none]" }] } },
    outdated_all: { win: "p30", label: "古いバージョンの利用者", tabs: ["versions"], state: ["core[state]", "plugin[state]"], why: "本体 {core[outdated]:num} 人・プラグイン {plugin[outdated]:num} 人", sub: "直近 {POLICY_DAYS} 日 · 最新 本体 {core[latest]} · プラグイン {plugin[latest]}",
      viz: { kind: "staterows", rows: [{ label: "本体", value: "{core[outdated]:num} / {core[total]:num} 人", state: "core[state]" }, { label: "プラグイン", value: "{plugin[outdated]:num} / {plugin[total]:num} 人", state: "plugin[state]" }] } },

    // 案 33: 利用者・呼び出し・セッションを 1 枚にまとめたカード（行ごとの札の仕組みは applied_all と同じ。いまの行は判定を持たない）
    users_all: { win: "bill", label: "利用明細にいた利用者", unit: "人", tabs: ["user_cost"], better: "up", value: "{r3[cost][users]:num}", state: "r3[cost][users_state]",
      delta: { v: "r3[cost][users_change]", prev: "{r3[cost][prev_users]:num} 人" }, why: "前との率 {r3[cost][users_change]:signed_pct}", sub: "前 {r3[cost][prev_users]:num} 人",
      viz: { kind: "staterows", rows: [{ label: "使い始めた", value: "{m[new_user_count]:num} 人" }, { label: "前の {period[days]} 日からの離脱", value: "{m[left_users]:count} 人" },
        { label: "継続率", value: "{m[retention_rate]:pct}" }] },
      long: { label: "利用明細にいた利用者", unit: "人", tabs: ["months", "user_cost"], value: "{r3[cost][users]:num}", sub: "期間にコストがあった人",
        viz: { kind: "staterows", rows: [{ label: "使い始めた", value: "{m[new_user_count]:num} 人" }, { label: "継続率（{m[retention_month]:ym}）", value: "{m[retention_rate]:pct}" }] } } },
    calls_all: { win: "rec", label: "呼び出し", tabs: ["calls", "user_calls"], wide: true, sub: "回数 · 前との差 · 使った人（全 {calls[skills][all_users]:num} 人のうち）",
      viz: { kind: "staterows", rows: [["skills", "スキル"], ["commands", "コマンド"], ["external", "外部ツール"], ["agents", "サブエージェントの起動"]].map(([k, label]) => (
        { label, value: `{calls[${k}][total]:num} 回 · {calls[${k}][delta]:signed} · {calls[${k}][users]:num} 人` })) } },
    session_all: { win: "rec", label: "セッション", unit: "トークン", tabs: ["session_size", "usage_modes"], wide: true, better: "down", value: "{size[median]:tok}",
      delta: { v: CH("session_size"), prev: "{size[prev][median]:tok}" }, sub: "大きさの中央 · 前 {size[prev][median]:tok} · {size[sessions]:num} セッション",
      viz: { kind: "staterows", rows: [{ label: "自動コンパクトに達した割合", value: "{size[auto_share]:pct}（前 {size[prev][auto_share]:pct}）" },
        { label: "確認なしモードを使った利用者", value: "{x[active][bypass_users]:num} 人（前 {x[active_prev][bypass_users]:num} 人）" }] } },

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

    // ---- 収集の状態 ----
    events_received: { win: "rec7", label: "受信した記録", unit: "件", tabs: ["health"], better: "", value: "{events[recent]:num}",
      delta: { v: CH("events"), prev: "{events[prev]:num} 件" }, sub: "前 {events[prev]:num} 件 · 送信した利用者 {r3[changes][senders]:num} 人", viz: { kind: "pair", src: "events", terms: L.PAIR } },
    went_silent: { win: "rec7", label: "記録が途絶えた利用者", unit: "人", tabs: ["user_delivery"], chip: "silent", better: "down", value: "{r3[silent][users]:num}",
      delta: { v: "r3[silent][delta]", fmt: "signed", unit: "人", prev: "{r3[silent][prev]:num} 人" },
      sub: "前の 7 日に記録か設定の報告があり、直近の 7 日に無い · 前 {r3[silent][prev]:num} 人" },
    plugin_errors: { win: "rec7", label: "プラグインのエラー", unit: "件", tabs: ["errors"], value: "{errors[total]:num}", state: "r3[errors][state]",
      sub: "直近 7 日 · {errors[kinds]:num} 種類", viz: { kind: "stack", src: "errors[stages]", tone: "warn", terms: L.STAGE } },
    null_rate: { win: "rec7", label: "項目の欠け（最大）", unit: "%", tabs: ["health"], wide: true, chip: "null", value: "{nulls[rate]:dec1}", state: "r3[nulls][state]", why: "{nulls[key]:field} {nulls[rate]:pct}",
      sub: "{nulls[key]:field} · {nulls[ok]:num} / {nulls[total]:num} 項目が正常", viz: { kind: "rates", src: "nulls[fields]", field: "rate", terms: L.HEALTH_ITEM, right: ["{rate:pct}"] } },
    reconciliation: { win: "match7", label: "利用明細との照合率", unit: "%", tabs: ["user_delivery"], chip: "unbilled", value: "{reconciliation[rate]:dec1}",
      sub: "利用明細にもいた {reconciliation[numerator]:num} 人 / 送信した {reconciliation[denominator]:num} 人",
      viz: { kind: "meter", src: "reconciliation[numerator]", den: "reconciliation[denominator]" } },
    csv_freshness: { win: "now", label: "利用明細の鮮度", unit: "日前", value: "{F[m][csv_freshness_days]:num}", sub: "最終日 {F[m][csv_end]:md} · 今日と前日の分はまだ無い" },
  });
})();
