// context.json の policy を「利用者 → 端末」の入れ子に組み直す。
window.ROSTER = (() => {
  const C = window.CTX, P = C.policy;
  const today = C.meta.today_epoch_day;

  const SETTINGS = {
    "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": ["自動圧縮の", "しきい値"],
    "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": ["プラグインの", "自動更新"],
    autoUpdatesChannel: ["本体の", "更新チャネル"],
    "env.DISABLE_AUTOUPDATER": ["自動更新の無効化", "を打ち消す"],
    "env.DISABLE_UPDATES": ["更新の無効化", "を打ち消す"],
    "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE": ["パッケージ", "マネージャ経由"],
  };
  const items = P.items.map((it) => ({
    key: it.key_name, name: SETTINGS[it.key_name] || [it.key_name, ""],
    num: it.numerator, den: it.denominator, rate: it.rate,
    off: new Set(it.non_compliant.map((r) => r.user_email + "|" + r.host)),
  }));

  const stale = new Map(P.stale.map((r) => [r.user_email + "|" + r.host, r.last_day]));
  const users = new Map();
  for (const r of P.latest_values) {
    if (!users.has(r.user_email)) users.set(r.user_email, { email: r.user_email, terminals: [] });
    const id = r.user_email + "|" + r.host;
    users.get(r.user_email).terminals.push({
      host: r.host, value: r.prev_value, day: r.day, dayLabel: r.day_label,
      stale: stale.has(id),
      on: items.map((it) => !it.off.has(id)),
    });
  }
  for (const r of P.not_introduced) users.set(r.user_email, { email: r.user_email, terminals: [], notIntroduced: true });

  const ORDER = { noncompliant: 0, notintro: 1, stale: 2, ok: 3 };
  const rows = [...users.values()].map((u) => {
    const t = u.terminals;
    const on = items.map((_, i) => (u.notIntroduced ? null : t.every((x) => x.on[i])));
    const offCount = on.filter((v) => v === false).length;
    const last = t.reduce((m, x) => (x.day > (m?.day ?? -1) ? x : m), null);
    const status = u.notIntroduced ? "notintro" : offCount ? "noncompliant" : t.some((x) => x.stale) ? "stale" : "ok";
    return { ...u, on, offCount, last, status, daysAgo: last ? today - last.day : null };
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.offCount - a.offCount || a.email.localeCompare(b.email));

  return {
    items, rows, today,
    denominator: P.items[0].denominator,
    terminalCount: P.latest_values.length,
    staleDays: C.meta.constants.STALE_DAYS,
    pluginVersions: P.plugin_versions,
    ccVersions: P.claude_code_versions,
  };
})();
