"use strict";
// 目録のカードの続き: 利用状況・設定の適用状況・概況専用・設定の効果・収集の状態（concepts.md の 2.1・2.5）。書き方は catalog_cards.js の先頭。
(() => {
  const { L } = window.KIT;
  const { K } = window.CATALOG;
  const PREV = "前の {period[days]} 日";
  const CH = (k) => `r3[changes][${k}]`;
  const DAILY_CAP = "日ごと · 濃い棒が直近 {period[days]} 日";
  // 呼び出し 3 種: 回数（大）・前との率・前の回数・使った人 N / 全 M 人・上位 3 つ
  const calls = (key, label, chip, cap) => ({ win: "rec", label, unit: "回", tabs: ["calls", "user_calls"], chip, wide: true, better: "up", value: `{calls[${key}][total]:num}`,
    delta: { v: CH(`${key}_calls`) },
    sub: `前 {calls[${key}][prev]:num} 回 · 使った人 {calls[${key}][users]:num} / 全 {calls[${key}][all_users]:num} 人`,
    viz: { kind: "rates", src: `calls[${key}][top]`, field: "calls", den: "max", label: "{label}", right: ["{calls:num} 回", "{users:num} 人"] }, cap: [cap] });
  const side = (field, fmt) => ({ kind: "pair", src: "F[effect2]", field, terms: L.SIDE, fmt });
  const P = (k) => `counts[${k}]`;
  const M = (k) => `mix[${k}]`;

  Object.assign(K, {
    // ---- 利用状況: 頻度 ----
    days_per_user: { win: "rec", label: "1 人あたりの利用日数", unit: "日", tabs: ["user_use"], better: "up", value: "{x[active][days_per_user]:dec1}",
      delta: { v: CH("days_per_user") },
      sub: "前 {x[active_prev][days_per_user]:dec1} 日 · 記録を送った {x[active][users]:num} 人", viz: { kind: "hist", src: "x[days_dist]", sides: ["now"] }, cap: ["利用した日数ごとの人数（1 日〜{period[days]} 日）"] },
    prompts_per_person_day: { win: "rec", label: "1 人 1 日あたりの指示", unit: "件", tabs: ["daily_use"], better: "up", value: "{x[active][prompts_per_person_day]:dec1}",
      delta: { v: CH("prompts_per_person_day") },
      sub: "前 {x[active_prev][prompts_per_person_day]:dec1} 件", viz: { kind: "bars", src: "x[daily]", field: "prompts" }, cap: ["全員の指示 · " + DAILY_CAP] },
    sessions_per_person_day: { win: "rec", label: "1 人 1 日あたりのセッション", unit: "件", tabs: ["daily_use"], better: "up", value: "{x[active][sessions_per_person_day]:dec1}",
      delta: { v: CH("sessions_per_person_day") },
      sub: "期間のセッション {x[active][sessions]:num} 件 · 前 {x[active_prev][sessions_per_person_day]:dec1} 件", viz: { kind: "bars", src: "x[daily]", field: "sessions" }, cap: ["全員のセッション · " + DAILY_CAP] },
    // ---- 利用状況: 呼び出し ----
    skill_calls: calls("skills", "スキルの呼び出し", "skill", "上位 3 つ · 回数と使った人"),
    command_calls: calls("commands", "コマンドの呼び出し", "command", "上位 3 つ · 定義元をまたいで合計"),
    external_calls: calls("external", "外部ツールの呼び出し", "external", "上位 3 つ · MCP はサーバごと"),
    agent_launches: { win: "rec", label: "サブエージェントの起動", unit: "回", tabs: ["user_calls"], wide: true, better: "up", value: "{calls[agents][total]:num}",
      delta: { v: CH("agents_calls") },
      sub: "前 {calls[agents][prev]:num} 回 · 使った人 {calls[agents][users]:num} / 全 {calls[agents][all_users]:num} 人",
      viz: { kind: "meter", src: "calls[agents][users]", den: "calls[agents][all_users]" }, cap: ["帯は使った人の割合 · 種類は記録していない"] },
    // ---- 利用状況: セッション ----
    session_size: { win: "rec", label: "セッションの大きさ（中央）", unit: "トークン", wide: true, tabs: ["session_size"], better: "down", value: "{size[median]:tok}",
      delta: { v: CH("session_size") },
      sub: "四分位 {size[q1]:tok}〜{size[q3]:tok} · 前 {size[prev][median]:tok} · {size[sessions]:num} セッション",
      viz: { kind: "hist", src: "size[dist]", sides: ["prev", "recent"], terms: L.PERIOD }, cap: ["セッションごとに応答終了時のコンテキストの最大 · 区間の幅 {CONTEXT_BIN:tok} トークン"] },
    autocompact_sessions: { win: "rec", label: "自動コンパクトに達した割合", unit: "%", tabs: ["session_size"], better: "", value: "{size[auto_share]:dec1}",
      delta: { v: CH("autocompact_pt"), fmt: "signed_pt" },
      sub: "{size[auto_sessions]:num} / {size[sessions]:num} セッション · 前 {size[prev][auto_share]:pct}",
      viz: { kind: "meter", src: "size[auto_share]", den: 100, tone: "neutral" }, cap: ["自動コンパクト（PreCompact の auto）が 1 回でもあったセッション"] },
    bypass_users: { win: "rec", label: "確認なしモードを使った利用者", unit: "人", tabs: ["usage_modes"], better: "down", value: "{x[active][bypass_users]:num}",
      delta: { v: CH("bypass_diff"), fmt: "signed", unit: "人" },
      sub: "記録を送った利用者の {x[active][bypass_reach]:pct} · 前 {x[active_prev][bypass_users]:num} 人",
      viz: { kind: "meter", src: "x[active][bypass_users]", den: "x[active][users]", tone: "neutral" }, cap: ["権限モード「確認なし」の記録が 1 件でもあった人"] },

    // ---- 設定の適用状況（30 日・利用者単位）----
    all_applied: { win: "p30", label: "すべての設定を適用", unit: "人", tabs: ["policy_users"], chip: "ok", value: `{${P("ok")}:num}`, sub: `適用率 {${P("ok_rate")}:pct}`,
      viz: { kind: "meter", src: P("ok"), den: "denominator", tone: "ok" }, cap: ["{items:count} つの設定がすべて配布した値"] },
    off_users: { win: "p30", label: "未適用のある利用者", unit: "人", tabs: ["policy_users"], chip: "off", value: `{${P("off")}:num}`, state: "states[off]",
      sub: "違う値か未設定の設定がある", viz: { kind: "meter", src: P("off"), den: "denominator", tone: "ng" } },
    not_introduced: { win: "p30", label: "プラグイン未導入", unit: "人", tabs: ["policy_users"], chip: "none", value: `{${P("none")}:num}`, state: "states[none]",
      sub: "コストがあるのに報告が無い", viz: { kind: "meter", src: P("none"), den: "denominator", tone: "warn" } },
    setting_rates: { win: "p30", label: "設定ごとの適用率", tabs: ["policy_settings"], wide: true, sub: "最も低いのは {lowest:setting}",
      viz: { kind: "rates", src: "items", field: "rate", terms: L.SETTING, right: ["{numerator:num} / {denominator:num} 人", "{rate:pct}"] } },
    core_outdated: { win: "p30", label: "本体の未更新", unit: "人", tabs: ["versions"], chip: "core", value: "{core[outdated]:num}", state: "core[state]",
      sub: "最新 {core[latest]}", span: "直近 {POLICY_DAYS} 日 · 対象 {core[total]:num} 人", viz: { kind: "stack", src: "core[parts]", tone: "ver" } },
    plugin_outdated: { win: "p30", label: "プラグインの未更新", unit: "人", tabs: ["versions"], chip: "plugin", value: "{plugin[outdated]:num}", state: "plugin[state]",
      sub: "最新 {plugin[latest]}", span: "直近 {POLICY_DAYS} 日 · 対象 {plugin[total]:num} 人", viz: { kind: "stack", src: "plugin[parts]", tone: "ver" } },
    // ---- 概況専用: 設定の適用（all_applied・off_users・not_introduced の 3 区分をまとめただけ。排他で合計は対象の人数）----
    applied_mix: { win: "p30", label: "設定の適用", tabs: ["policy_users"], state: ["states[off]", "states[none]"],
      why: `未適用 {${M("off")}:num} 人・未導入 {${M("none")}:num} 人`, sub: `すべて適用 {${M("ok")}:num} 人`,
      values: [["未適用", `{${M("off")}:num}`], ["未導入", `{${M("none")}:num}`]], unit: "人",
      viz: { kind: "mix", src: "mix", band: [["ok", "すべて適用"], ["none", "未導入"], ["off", "未適用"]] } },
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
      delta: { v: CH("events") }, sub: "前 {events[prev]:num} 件 · 送信した利用者 {r3[changes][senders]:num} 人", viz: { kind: "pair", src: "events", terms: L.PAIR } },
    went_silent: { win: "rec7", label: "記録が途絶えた利用者", unit: "人", tabs: ["user_delivery"], chip: "silent", better: "down", value: "{r3[silent][users]:num}",
      delta: { v: "r3[silent][delta]", fmt: "signed", unit: "人" },
      sub: "前の 7 日に記録か設定の報告があり、直近の 7 日に無い · 前 {r3[silent][prev]:num} 人" },
    plugin_errors: { win: "rec7", label: "プラグインのエラー", unit: "件", tabs: ["errors"], value: "{errors[total]:num}", state: "r3[errors][state]",
      sub: "{errors[kinds]:num} 種類", viz: { kind: "stack", src: "errors[stages]", tone: "warn", terms: L.STAGE },
      viz3: { kind: "toprows", src: "r3[errors][top]", head: "{stage:stage}", name: "{error_type}", right: "{count:num} 件" } }, // 型 V3: 件数の多い種類の上位 3 行
    null_rate: { win: "rec7", label: "項目の欠け（最大）", unit: "%", tabs: ["health"], wide: true, chip: "null", value: "{nulls[rate]:dec1}", state: "r3[nulls][state]", why: "{nulls[key]:field} {nulls[rate]:pct}",
      sub: "{nulls[key]:field} · {nulls[ok]:num} / {nulls[total]:num} 項目が正常", viz: { kind: "rates", src: "nulls[fields]", field: "rate", terms: L.HEALTH_ITEM, right: ["{rate:pct}"] } },
    reconciliation: { win: "match7", label: "利用明細との照合率", unit: "%", tabs: ["user_delivery"], chip: "unbilled", value: "{reconciliation[rate]:dec1}",
      sub: "利用明細にもいた {reconciliation[numerator]:num} 人 / 送信した {reconciliation[denominator]:num} 人",
      viz: { kind: "meter", src: "reconciliation[numerator]", den: "reconciliation[denominator]" } },
    csv_freshness: { win: "now", label: "利用明細の鮮度", unit: "日前", value: "{S[age]:num}", state: "S[state]", why: "最終日 {S[csv_end]:md}",
      sub: "最終日 {S[csv_end]:md} · 今日と前日の分はまだ無い" },
  });
})();
