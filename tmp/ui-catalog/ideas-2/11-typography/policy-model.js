"use strict";
// 設定の適用状況: context.json の policy を「利用者 → 端末」に組み直す
window.POLICY = (() => {
  const C = window.CTX, P = C.policy, today = C.meta.today_epoch_day;
  const SETTINGS = {
    "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": ["自動圧縮のしきい値", "しきい値"],
    "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": ["プラグインの自動更新", "プラグイン更新"],
    autoUpdatesChannel: ["本体の更新チャネル", "更新チャネル"],
    "env.DISABLE_AUTOUPDATER": ["自動更新の無効化を打ち消す", "自動更新"],
    "env.DISABLE_UPDATES": ["更新の無効化を打ち消す", "更新"],
    "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE": ["パッケージマネージャ経由の自動更新", "パッケージ"],
  };
  const id = (r) => `${r.user_email}|${r.host}`;
  const items = P.items.map((it) => ({
    key: it.key_name, name: SETTINGS[it.key_name]?.[0] ?? it.key_name, short: SETTINGS[it.key_name]?.[1] ?? it.key_name,
    num: it.numerator, den: it.denominator, rate: it.rate, off: new Set(it.non_compliant.map(id)),
  }));
  const stale = new Set(P.stale.map(id));

  const terminals = P.latest_values.map((r) => {
    const on = items.map((it) => !it.off.has(id(r)));
    const offNames = items.filter((_, i) => !on[i]).map((it) => it.short);
    const status = offNames.length ? "off" : stale.has(id(r)) ? "stale" : "ok";
    return { email: r.user_email, host: r.host, value: r.prev_value, day: r.day, dayLabel: r.day_label, ago: today - r.day, on, offNames, status, stale: stale.has(id(r)) };
  });

  const byUser = new Map();
  for (const t of terminals) byUser.set(t.email, [...(byUser.get(t.email) || []), t]);
  const users = [...byUser].map(([email, ts]) => {
    const on = items.map((_, i) => ts.every((t) => t.on[i]));
    const off = on.filter((v) => !v).length;
    const last = ts.reduce((m, t) => (t.day > m.day ? t : m));
    const status = off ? "off" : ts.some((t) => t.stale) ? "stale" : "ok";
    return { email, terminals: ts.length, on, off, day: last.day, dayLabel: last.dayLabel, ago: last.ago, status };
  });
  for (const r of P.not_introduced) users.push({ email: r.user_email, terminals: 0, on: items.map(() => null), off: 0, day: -1, dayLabel: null, ago: null, status: "none" });

  // 版の比較（数値の並びとして）
  const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  const versions = [["プラグイン", P.plugin_versions], ["Claude Code 本体", P.claude_code_versions]].flatMap(([kind, list]) => {
    const latest = list.map((v) => v.version).sort(newer).at(-1), total = list.reduce((s, v) => s + v.count, 0);
    return list.map((v) => ({ kind, version: v.version, count: v.count, total, latest: v.version === latest }));
  });

  return { items, terminals, users, versions, newer, denominator: P.items[0].denominator, staleDays: C.meta.constants.STALE_DAYS, csv: P.csv_imported };
})();
