"use strict";
// 案 23 セッションに効果を寄せる: 設定の効果を同じ指標の今の値の隣に置く。トップを置かない。
(() => {
  const { build } = window.CATALOG;
  const NOTE = "前後の値は並べるだけです。時期の変動を含むため、前後差を施策の効果と読まないでください。";
  window.IA = build({
    id: "23-sessions-with-effect", name: "案 23 セッションに効果を寄せる",
    pages: [
      { id: "use", title: "利用", lead: "誰が、どれだけの頻度で使っているか", periods: true,
        groups: [["利用者", ["active_users", "days_per_user", "prompts_per_person_day", "sessions_per_person_day"]]],
        tabs: ["user_use", "daily_use", "days_dist"] },
      { id: "calls", title: "呼び出し", lead: "スキル・コマンド・外部ツール・サブエージェントが、どれだけ何人に使われているか", periods: true,
        groups: [["呼び出し", ["skill_calls", "command_calls", "external_calls", "agent_launches"]]],
        tabs: ["user_calls", "skills", "commands", "external_tools"] },
      { id: "sess", title: "セッション", lead: "セッションはどれだけ大きく、しきい値を守り始めた前後でどう並ぶか", periods: true,
        groups: [["使われ方", ["session_size", "autocompact_sessions", "bypass_users"]],
          ["しきい値の前後", ["adopters", "effect_session_size", "effect_autocompact", "effect_cost"], { note: NOTE }]],
        tabs: ["session_size", "usage_modes", "effect_sessions", "effect_daily"] },
      { id: "cost", title: "コスト", lead: "いくらかかり、誰とどのモデルに集まり、利用明細と記録が揃っているか", periods: true,
        groups: [["利用明細の利用者", ["billed_users", "new_users", "retention"]],
          ["コスト", ["cost", "cost_per_user", "top10_share", "top_spenders", "model_mix", "cache_read_share"]],
          ["今月", ["forecast", "per_bd", "per_user_bd"]],
          ["記録との照合", ["reconciliation", "uncollected"]],
          ["利用明細", ["csv_freshness"]]],
        tabs: ["user_cost", "cost_daily", "models", "month", "months", "missing"] },
      { id: "term", title: "端末", lead: "配った設定と最新版が端末に入り、記録が欠けずに届いているか",
        groups: [["適用", ["all_applied", "off_users", "not_introduced", "setting_rates"]],
          ["版と報告", ["stale_terminals", "plugin_latest", "core_latest"]],
          ["受信", ["events_received", "plugin_errors", "null_rate"], { win: "rec7" }]],
        tabs: ["policy_users", "policy_terminals", "policy_settings", "policy_versions", "health", "errors"] },
    ],
  });
})();
