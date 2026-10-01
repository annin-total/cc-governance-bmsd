"use strict";
// 案 35 セッションを効果の隣に（concepts.md 6 章）。案 31 からセッションの群とタブを設定の効果へ移す。
(() => {
  const { build } = window.CATALOG;
  window.IA = build({
    id: "35-session-by-effect", name: "案 35 セッションを効果の隣に",
    pages: [
      { id: "home", title: "概況", home: true, summary: true, lead: "コスト・利用者・設定の適用の要点と、注意・要確認の点",
        groups: [
          ["コスト", ["cost", "per_user_bd"]],
          ["今月", ["forecast"]],
          ["基準を超えた利用者", ["over_day_bars", "over_week_bars", "over_month_bars"]],
          ["利用者", ["billed_users"]],
          ["設定の適用", ["all_applied", "off_users", "not_introduced", "core_outdated", "plugin_outdated"]],
        ] },
      { id: "cost", title: "コストと利用者", periods: true, lead: "いくらかかり、誰に集まり、何人が使っているか",
        groups: [
          ["コスト", ["cost", "per_user_bd", "top_spenders", "model_mix", "cache_read_share"]],
          ["今月", ["forecast"]],
          ["基準を超えた利用者", ["over_day_bars", "over_week_bars", "over_month_bars"]],
          ["利用者", ["billed_users", "new_users", "retention"]],
        ],
        tabs: ["user_cost", "over_users", "cost_daily", "models", "month", "months"] },
      { id: "activity", title: "利用状況", periods: true, lead: "どれだけの頻度で使い、何を呼び出し、セッションはどれだけ大きいか",
        groups: [
          ["頻度", ["days_per_user", "prompts_per_person_day", "sessions_per_person_day", "bypass_users"]],
          ["呼び出し", ["skill_calls", "command_calls", "external_calls", "agent_launches"]],
        ],
        tabs: ["user_use", "user_calls", "daily_use", "calls", "usage_modes"] },
      { id: "policy", title: "設定の適用状況", data: "fixed.r3.policy", lead: "配布した設定と更新が、利用者に行き渡っているか",
        groups: [
          ["設定", ["all_applied", "off_users", "not_introduced", "setting_rates"]],
          ["版", ["core_outdated", "plugin_outdated"]],
        ],
        tabs: ["policy_users", "policy_settings", "versions"] },
      { id: "effect", title: "設定の効果", periods: true, lead: "設定を守り始めた前後で、セッションの大きさとコストはどう並ぶか",
        groups: [
          ["セッション", ["session_size", "autocompact_sessions"]],
          ["しきい値の前後", ["adopters", "effect_session_size", "effect_autocompact", "effect_cost"]],
        ],
        tabs: ["session_size", "effect_sessions", "effect_daily"] },
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
