"use strict";
// 案 42 利用者から入る（concepts.md 6.2）。コストと利用者を利用者数から並べ、利用者ごとのタブを user_all に、課ごとを記録の段つきにする。見せ方は 41 の推奨で固定。
(() => {
  const { build } = window.CATALOG;
  window.IA = build({
    id: "42-users", name: "案 42 利用者から入る",
    look: { over: "O2", cost: "C31", ver: "V3", head: "H1" },
    pages: [
      { id: "home", title: "概況", home: true, summary: true, lead: "コスト・利用者・設定の適用の要点と、注意・要確認の点はどこか",
        cards: ["cost", "per_user_bd", "forecast", "billed_users", "over_day", "over_week", "over_month", "applied_mix", "core_outdated", "plugin_outdated", "plugin_errors"] },
      { id: "cost", title: "コストと利用者", periods: true, lead: "いくらかかり、誰に集まり、何人が使っているか",
        cards: ["billed_users", "over_day", "over_week", "over_month", "cost", "per_user_bd", "forecast", "retention", "model_mix"],
        tabs: ["user_all", "over_users", "cost_daily", "models", "month", "months", "sections_rec"] },
      { id: "activity", title: "利用状況", periods: true, lead: "どれだけの頻度で使い、何を呼び出し、セッションはどれだけ大きいか",
        cards: ["days_per_user", "prompts_per_person_day", "sessions_per_person_day", "skill_calls", "command_calls", "external_calls", "agent_launches",
          "session_size", "autocompact_sessions", "cache_read_share", "bypass_users"],
        tabs: ["daily_use", "calls", "session_size", "usage_modes"], borrow: ["user_all", "models"] },
      { id: "policy", title: "設定の適用状況", now: true, data: "fixed.r3.policy", lead: "配布した設定と更新が、利用者に行き渡っているか",
        cards: ["all_applied", "off_users", "not_introduced", "core_outdated", "plugin_outdated", "setting_rates"],
        tabs: ["policy_users", "policy_settings", "versions"] },
      { id: "effect", title: "設定の効果", data: "fixed.effect", lead: "設定を守り始めた前後で、セッションの大きさとコストはどう並ぶか",
        cards: ["adopters", "effect_session_size", "effect_autocompact", "effect_cost"], tabs: ["effect_sessions", "effect_daily"] },
      { id: "collect", title: "収集の状態", now: true, data: "fixed.now", lead: "記録が欠けずに届き、利用明細と合っているか",
        cards: ["events_received", "went_silent", "plugin_errors", "null_rate", "reconciliation", "csv_freshness"], tabs: ["user_delivery", "health", "errors"] },
    ],
  });
})();
