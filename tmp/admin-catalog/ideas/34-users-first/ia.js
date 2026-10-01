"use strict";
// 案 34 利用者から入る（concepts.md の 6 章）。31 から、利用者の群を先頭に並べ、利用者ごとのタブを user_all にまとめる。
(() => {
  const { build } = window.CATALOG;
  window.IA = build({
    id: "34-users-first", name: "案 34 利用者から入る",
    look: { delta: { worseOnly: true } },
    pages: [
      { id: "home", title: "概況", home: true, summary: true, lead: "コスト・利用者・設定の適用の要点と、注意・要確認の点",
        groups: [
          ["基準を超えた利用者", ["over_day_top", "over_week_top", "over_month_top"]],
          ["コストの多い利用者", ["top_spenders_diff"]],
          ["コスト", ["cost", "per_user_bd"]],
          ["今月", ["forecast"]],
          ["利用者", ["billed_users"]],
          ["設定の適用", ["all_applied", "off_users", "not_introduced", "core_outdated", "plugin_outdated"]],
        ] },
      { id: "cost", title: "コストと利用者", periods: true, lead: "いくらかかり、誰に集まり、何人が使っているか",
        groups: [
          ["基準を超えた利用者", ["over_day_top", "over_week_top", "over_month_top"]],
          ["コスト", ["cost", "per_user_bd", "top_spenders_diff", "model_mix", "cache_read_share"]],
          ["今月", ["forecast"]],
          ["利用者", ["billed_users", "new_users", "retention"]],
        ],
        tabs: ["user_all", "over_users", "cost_daily", "models", "month", "months"] },
      { id: "activity", title: "利用状況", periods: true, lead: "どれだけの頻度で使い、何を呼び出し、セッションはどれだけ大きいか",
        groups: [
          ["頻度", ["days_per_user", "prompts_per_person_day", "sessions_per_person_day"]],
          ["呼び出し", ["skill_calls", "command_calls", "external_calls", "agent_launches"]],
          ["セッション", ["session_size", "autocompact_sessions", "bypass_users"]],
        ],
        tabs: ["daily_use", "calls", "session_size", "usage_modes"], borrow: ["user_all"] },
      { id: "policy", title: "設定の適用状況", data: "fixed.r3.policy", lead: "配布した設定と更新が、利用者に行き渡っているか",
        groups: [
          ["設定", ["all_applied", "off_users", "not_introduced", "setting_rates"]],
          ["版", ["core_outdated", "plugin_outdated"]],
        ],
        tabs: ["policy_users", "policy_settings", "versions"] },
      { id: "effect", title: "設定の効果", data: "fixed.effect", lead: "設定を守り始めた前後で、セッションの大きさとコストはどう並ぶか",
        groups: [["しきい値の前後", ["adopters", "effect_session_size", "effect_autocompact", "effect_cost"]]],
        tabs: ["effect_sessions", "effect_daily"] },
      { id: "collect", title: "収集の状態", lead: "記録が欠けずに届き、利用明細と合っているか",
        groups: [
          ["受信", ["events_received", "went_silent", "plugin_errors", "null_rate"], { win: "rec7" }],
          ["照合", ["reconciliation"]],
          ["利用明細", ["csv_freshness"]],
        ],
        tabs: ["user_delivery", "health", "errors"] },
    ],
  });
})();
