"use strict";
// 案 21 設定に効果を寄せる: 設定の効果を設定の適用のページの群にする。収集の状態は独立のページに保つ。
(() => {
  const { build } = window.CATALOG;
  const NOTE = "前後の値は並べるだけです。時期の変動を含むため、前後差を施策の効果と読まないでください。";
  window.IA = build({
    id: "21-settings-with-effect", name: "案 21 設定に効果を寄せる",
    pages: [
      { id: "top", title: "トップ", lead: "各ページの先頭の数字と、状態の印を持つカード",
        refs: [{ page: "use", cards: ["active_users", "session_size"] }, { page: "calls", cards: ["skill_calls", "command_calls"] },
          { page: "cost", cards: ["cost", "top_spenders", "forecast"] }, { page: "policy", cards: ["off_users", "not_introduced"] },
          { page: "collect", cards: ["plugin_errors"] }] },
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
      { id: "policy", title: "設定", lead: "配った設定が利用者と端末に入り、しきい値の前後で何が並ぶか",
        groups: [["利用者", ["all_applied", "off_users", "not_introduced"]],
          ["設定と更新", ["setting_rates", "stale_terminals", "plugin_latest", "core_latest"]],
          ["しきい値の前後", ["adopters", "effect_session_size", "effect_autocompact", "effect_cost"], { note: NOTE }]],
        tabs: ["policy_users", "policy_terminals", "policy_settings", "policy_versions", "effect_sessions", "effect_daily"] },
      { id: "collect", title: "収集の状態", lead: "記録が欠けずに届き、利用明細と合っているか",
        groups: [["受信", ["events_received", "plugin_errors", "null_rate"], { win: "rec7" }],
          ["照合", ["reconciliation", "uncollected"], { win: "match7" }],
          ["利用明細", ["csv_freshness"]]],
        tabs: ["health", "errors", "missing"] },
    ],
  });
})();
