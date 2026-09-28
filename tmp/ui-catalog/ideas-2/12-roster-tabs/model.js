// context.json から画面が使う値を組み立てる。表示名の対応（言い換え表）もここに置く。
window.M = (() => {
  const C = window.CTX, O = C.overview, H = O.health, P = C.policy, K = C.meta.constants;
  const WEEK = K.RECENT_DAYS;
  const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
  const avg = (a) => sum(a) / a.length;

  const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
  const NULL_ITEMS = [["tool_name", "ツール名", "ツール実行の記録"], ["skill_name", "スキル名", "Skill ツールの実行記録"], ["context_tokens", "コンテキストのトークン数", "圧縮直前と応答終了の記録"], ["command_source", "コマンドの定義元", "コマンド展開の記録"]];
  const PROVIDERS = [["aws-bedrock", "AWS Bedrock", "var(--accent)"], ["google-vertex", "Google Vertex AI", "var(--accent-2)"]];
  const DIST = [
    ["権限モード", O.permission_mode_distribution, { default: "通常", acceptEdits: "編集を自動承認", plan: "プランモード", bypassPermissions: "確認なし" }],
    ["effort（思考量）", O.effort_level_distribution, { low: "低", medium: "中", high: "高" }],
    ["セッションの開始のしかた", O.source_distribution, { startup: "新規起動", resume: "再開", clear: "クリア後", compact: "圧縮後" }],
  ];
  // 設定を 1 つ足す = この表に 1 行足す（無ければキー名のまま出る）
  const SETTINGS = {
    "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": ["自動圧縮のしきい値", "しきい値"],
    "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": ["プラグインの自動更新", "プラグイン更新"],
    autoUpdatesChannel: ["本体の更新チャネル", "更新チャネル"],
    "env.DISABLE_AUTOUPDATER": ["自動更新の無効化を打ち消す", "自動更新"],
    "env.DISABLE_UPDATES": ["更新の無効化を打ち消す", "更新"],
    "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE": ["パッケージマネージャ経由の更新", "パッケージ"],
  };

  // --- 概況 ---
  const trend = O.user_session_trend;
  const costByDay = new Map();
  for (const r of O.daily_cost) {
    const d = costByDay.get(r.day_label) || {};
    d[r.provider] = (d[r.provider] || 0) + r.cost;
    costByDay.set(r.day_label, d);
  }
  const costDays = [...costByDay.keys()].sort();
  const dayTotal = (d) => sum(Object.values(costByDay.get(d)));
  const cost = { days: costDays, byDay: costByDay, dayTotal, now: sum(costDays.slice(-WEEK), dayTotal), prev: sum(costDays.slice(-2 * WEEK, -WEEK), dayTotal) };
  const sessions = { now: avg(trend.slice(-WEEK).map((t) => t.sessions)), prev: avg(trend.slice(0, WEEK).map((t) => t.sessions)) };
  const nulls = NULL_ITEMS.map(([key, label, base]) => ({ key, label, base, now: H.recent.null_rates[key], prev: H.prev.null_rates[key] }));
  const errors = O.error_summary.map((e) => ({ ...e, stageLabel: STAGE[e.stage] || e.stage }));

  // --- 設定の適用状況 ---
  const id = (r) => r.user_email + "|" + r.host;
  const items = P.items.map((it) => {
    const [name, short] = SETTINGS[it.key_name] || [it.key_name, it.key_name];
    return { key: it.key_name, name, short, num: it.numerator, den: it.denominator, rate: it.rate, off: new Set(it.non_compliant.map(id)), offCount: it.non_compliant.length };
  });
  const staleDay = new Map(P.stale.map((r) => [id(r), r.last_day]));
  const today = C.meta.today_epoch_day;
  const terminals = P.latest_values.map((r) => {
    const offs = items.filter((it) => it.off.has(id(r)));
    const stale = staleDay.has(id(r));
    const day = stale ? staleDay.get(id(r)) : r.day;
    const dayLabel = stale ? P.stale.find((s) => id(s) === id(r)).last_day_label : r.day_label;
    return { email: r.user_email, host: r.host, value: r.prev_value, offs, stale, day, dayLabel, ago: today - day,
      status: offs.length ? "ng" : stale ? "neutral" : "ok" };
  });
  for (const r of P.not_introduced) terminals.push({ email: r.user_email, host: null, value: null, offs: [], day: null, status: "warn" });

  const users = new Map();
  for (const t of terminals) {
    if (!users.has(t.email)) users.set(t.email, { email: t.email, terms: [] });
    users.get(t.email).terms.push(t);
  }
  const RANK = { ng: 0, warn: 1, neutral: 2, ok: 3 };
  const roster = [...users.values()].map((u) => {
    const intro = u.terms.some((t) => t.host);
    const on = items.map((it) => (intro ? u.terms.every((t) => !it.off.has(t.email + "|" + t.host)) : null));
    const offCount = on.filter((v) => v === false).length;
    const last = intro ? u.terms.reduce((m, t) => (t.day > m.day ? t : m)) : null;
    const status = !intro ? "warn" : offCount ? "ng" : u.terms.some((t) => t.stale) ? "neutral" : "ok";
    return { email: u.email, hosts: intro ? u.terms.length : 0, on, offCount, last, status };
  }).sort((a, b) => RANK[a.status] - RANK[b.status] || b.offCount - a.offCount || a.email.localeCompare(b.email));
  const count = (list, s) => list.filter((x) => x.status === s).length;

  return {
    C, O, H, P, K, WEEK, sum, avg, today, DIST, PROVIDERS,
    trend, cost, sessions, nulls, errors, items, terminals, roster, count,
    reportedTerminals: P.latest_values.length, userDenominator: P.items[0].denominator,
  };
})();
