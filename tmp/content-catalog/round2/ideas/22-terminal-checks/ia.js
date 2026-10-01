"use strict";
// 案 22 端末の点検をまとめる: 設定の適用を利用者側と端末側に分け、端末側を受信・照合と 1 ページにする。
(() => {
  const { build } = window.CATALOG;
  const NOTE = "前後の値は並べるだけです。時期の変動を含むため、前後差を施策の効果と読まないでください。";
  window.IA = build({
    id: "22-terminal-checks", name: "案 22 端末の点検をまとめる",
    pages: [
      { id: "top", title: "トップ", lead: "各ページの先頭の数字と、状態の印を持つカード",
        refs: [{ page: "use", cards: ["active_users", "session_size"] }, { page: "calls", cards: ["skill_calls"] },
          { page: "cost", cards: ["cost", "top_spenders", "forecast"] }, { page: "policy", cards: ["off_users", "not_introduced"] },
          { page: "term", cards: ["stale_terminals", "plugin_errors"] }] },
      { id: "use", title: "利用", lead: "誰が、どれだけの頻度で、どんな大きさのセッションで使っているか", periods: true,
        groups: [["利用者", ["active_users", "days_per_user", "prompts_per_person_day", "sessions_per_person_day"]],
          ["使われ方", ["session_size", "autocompact_sessions", "bypass_users"]]],
        tabs: ["user_use", "daily_use", "days_dist", "session_size", "usage_modes"] },
      { id: "calls", title: "呼び出し", lead: "スキル・コマンド・外部ツール・サブエージェントが、どれだけ何人に使われているか", periods: true,
        groups: [["呼び出し", ["skill_calls", "command_calls", "external_calls", "agent_launches"]]],
        tabs: ["user_calls", "skills", "commands", "external_tools"] },
      { id: "cost", title: "コスト", lead: "いくらかかり、誰とどのモデルに集まっているか", periods: true,
        groups: [["利用明細の利用者", ["billed_users", "new_users", "retention"]],
          ["コスト", ["cost", "cost_per_user", "top10_share", "top_spenders", "model_mix", "cache_read_share"]],
          ["今月", ["forecast", "per_bd", "per_user_bd"]]],
        tabs: ["user_cost", "cost_daily", "models", "month", "months"] },
      { id: "policy", title: "設定", lead: "配った設定が誰に入り、しきい値の前後で何が並ぶか",
        groups: [["適用", ["all_applied", "off_users", "not_introduced", "setting_rates"]],
          ["しきい値の前後", ["adopters", "effect_session_size", "effect_autocompact", "effect_cost"], { note: NOTE }]],
        tabs: ["policy_users", "policy_settings", "effect_sessions", "effect_daily"] },
      { id: "term", title: "端末", lead: "端末が最新版で、記録が欠けずに届き、利用明細と合っているか",
        groups: [["版と報告", ["stale_terminals", "plugin_latest", "core_latest"]],
          ["受信", ["events_received", "plugin_errors", "null_rate"], { win: "rec7" }],
          ["照合", ["reconciliation", "uncollected"], { win: "match7" }],
          ["利用明細", ["csv_freshness"]]],
        tabs: ["policy_terminals", "policy_versions", "health", "errors", "missing"] },
    ],
  });
})();
