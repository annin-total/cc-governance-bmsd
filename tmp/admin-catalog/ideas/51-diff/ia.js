"use strict";
// 案 51 31 との差分（concepts5.md）。骨組みは案 31 のままで、look と比較用の切り替え（compare: "r5"）で 31 から変える点を持つ。
(() => {
  const { build } = window.CATALOG;
  const COST = ["cost_total", "per_bd", "per_user_bd"];
  const OVER = ["over_day_duo", "over_week_duo", "over_month_duo"];
  window.IA = build({
    id: "51-diff", name: "案 51 31 との差分", compare: "r5",
    look: { ends: "bill", asofAt: "range", sticky: "header", brief: false, forecastPrev: "chip", org: true, delta: { palette: "gr" }, fs: "F5" },
    pages: [
      { id: "home", title: "概況", home: true, summary: true, lead: "コスト・利用者・設定の適用の要点と、注意・要確認の点",
        groups: [
          ["コスト", COST],
          ["今月", ["forecast"]],
          ["基準を超えた利用者", OVER],
          ["利用者", ["billed_users"]],
          ["設定の適用", ["all_applied", "off_users", "not_introduced", "core_outdated", "plugin_outdated"]],
        ] },
      { id: "cost", title: "コストと利用者", periods: true, lead: "いくらかかり、誰に集まり、何人が使っているか",
        groups: [
          ["コスト", [...COST, "top_spenders", "model_mix", "cache_read_share"]],
          ["今月", ["forecast"]],
          ["基準を超えた利用者", OVER],
          ["利用者", ["billed_users", "new_users", "retention", "conc_users", "conc_depts"]],
        ],
        groups3: [
          ["コスト", [...COST, "top_spenders", "model_mix", "cache_read_share"]],
          ["今月", ["forecast"]],
          ["利用者", ["billed_users", ...OVER, "new_users", "retention", "conc_users", "conc_depts"], { note: "基準超えは区分ごとの注意以上の人数（基準の金額はカードの中）· 使い始めた利用者は利用明細に初めてコストが出た人" }],
        ],
        tabs: ["user_cost", "over_users", "cost_daily", "models", "month", "months", "depts", "conc"] },
      { id: "activity", title: "利用状況", periods: true, lead: "どれだけの頻度で使い、何を呼び出し、セッションはどれだけ大きいか",
        groups: [
          ["頻度", ["days_per_user", "prompts_per_person_day", "sessions_per_person_day"]],
          ["呼び出し", ["skill_calls", "command_calls", "external_calls", "agent_launches"]],
          ["セッション", ["session_size", "autocompact_sessions", "bypass_users"]],
        ],
        tabs: ["user_use", "user_calls", "daily_use", "calls", "session_size", "usage_modes"] },
      { id: "policy", title: "設定の適用状況", now: true, data: "fixed.r3.policy", lead: "配布した設定と更新が、利用者に行き渡っているか",
        groups: [
          ["設定", ["all_applied", "off_users", "not_introduced", "setting_rates"]],
          ["バージョン", ["core_outdated", "plugin_outdated"]],
        ],
        tabs: ["policy_users", "policy_settings", "versions"] },
      { id: "effect", title: "設定の効果", data: "fixed.effect", lead: "設定を守り始めた前後で、セッションの大きさとコストはどう並ぶか",
        groups: [["しきい値の前後", ["adopters", "effect_session_size", "effect_autocompact", "effect_cost"]]],
        tabs: ["effect_sessions", "effect_daily"] },
      { id: "collect", title: "収集の状態", now: true, lead: "記録が欠けずに届き、利用明細と合っているか",
        groups: [
          ["受信", ["events_received", "went_silent", "plugin_errors", "null_rate"], { win: "rec7" }],
          ["照合", ["reconciliation"]],
          ["利用明細", ["csv_freshness"]],
        ],
        tabs: ["user_delivery", "health", "errors"] },
    ],
  });
})();
