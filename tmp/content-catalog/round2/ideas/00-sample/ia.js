"use strict";
// 見本: 目録のカード 40 枚とタブ 23 個を一通り並べる（案ではない）。トップは参照の書き方の見本。
(() => {
  const { build } = window.CATALOG;
  window.IA = build({
    id: "00-sample", name: "見本 目録のカードとタブ",
    pages: [
      { id: "top", title: "トップ", lead: "参照の見本 · 各ページのカードを id で並べる",
        refs: [{ page: "use", cards: ["active_users", "billed_users"] }, { page: "calls", cards: ["skill_calls", "command_calls"] },
          { page: "cost", cards: ["cost", "forecast"] }, { page: "policy", cards: ["off_users", "not_introduced"] }, { page: "collect", cards: ["plugin_errors"] }] },
      { id: "use", title: "利用", lead: "利用者の人数と頻度", periods: true,
        groups: [["記録", ["active_users", "days_per_user", "prompts_per_person_day", "sessions_per_person_day"]],
          ["利用明細", ["billed_users", "new_users", "retention"]]],
        tabs: ["user_use", "daily_use", "days_dist"] },
      { id: "calls", title: "呼び出し", lead: "スキル・コマンド・外部ツール・サブエージェントの呼び出し", periods: true,
        groups: [["呼び出し", ["skill_calls", "command_calls", "external_calls", "agent_launches"]]],
        tabs: ["user_calls", "skills", "commands", "external_tools"] },
      { id: "sessions", title: "セッション", lead: "セッションの大きさと権限モード", periods: true,
        groups: [["セッション", ["session_size", "autocompact_sessions", "bypass_users"]]],
        tabs: ["session_size", "usage_modes"] },
      { id: "cost", title: "コスト", lead: "コストと、その集まり方", periods: true,
        groups: [["期間", ["cost", "cost_per_user", "top10_share", "cache_read_share", "top_spenders", "model_mix"]],
          ["今月", ["forecast", "per_bd", "per_user_bd"]]],
        tabs: ["user_cost", "cost_daily", "models", "month", "months"] },
      { id: "policy", title: "設定の適用状況", lead: "配った設定が端末に入っているか",
        groups: [["利用者", ["all_applied", "off_users", "not_introduced"]], ["設定と更新", ["setting_rates", "stale_terminals", "plugin_latest", "core_latest"]]],
        tabs: ["policy_users", "policy_terminals", "policy_settings", "policy_versions"] },
      { id: "effect", title: "設定の効果", lead: "自動コンパクトのしきい値の前後",
        groups: [["しきい値", ["adopters", "effect_session_size", "effect_autocompact", "effect_cost"],
          { note: "前後の値は並べるだけです。時期の変動を含むため、前後差を施策の効果と読まないでください。" }]],
        tabs: ["effect_sessions", "effect_daily"] },
      { id: "collect", title: "収集の状態", lead: "数字の元が届いているか", periods: true,
        groups: [["受信", ["events_received", "plugin_errors", "null_rate"]], ["照合", ["reconciliation", "uncollected"]], ["利用明細", ["csv_freshness"]]],
        tabs: ["health", "errors", "missing"] },
    ],
  });
})();
