// 設定の適用状況の定義。設定・指標・一覧は配列から描画する。
window.M = (() => {
  const C = window.CTX, P = C.policy, K = window.K;
  const { n, fix, sum, esc, mark, judge } = K;
  const today = C.meta.today_epoch_day, STALE = C.meta.constants.STALE_DAYS, DAYS = C.meta.constants.POLICY_DAYS;

  // 設定の表示名。未登録のキーはキー名のまま出る
  // 表示名と、表の列見出し用の 2 行。未登録のキーはキー名のまま出る
  const SETTINGS = {
    "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": ["自動圧縮のしきい値", "自動圧縮の<br>しきい値"],
    "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": ["プラグインの自動更新", "プラグインの<br>自動更新"],
    autoUpdatesChannel: ["本体の更新チャネル", "本体の<br>更新チャネル"],
    "env.DISABLE_AUTOUPDATER": ["自動更新の無効化を打ち消す", "自動更新の無効化<br>を打ち消す"],
    "env.DISABLE_UPDATES": ["更新の無効化を打ち消す", "更新の無効化<br>を打ち消す"],
    "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE": ["パッケージマネージャ経由の自動更新", "パッケージ<br>マネージャ経由"],
  };
  const SETTING_RULE = { on: "value", bad: "low", warn: 80, ng: 75 };
  const items = P.items.map((it) => ({
    key: it.key_name, name: (SETTINGS[it.key_name] || [it.key_name])[0], head: (SETTINGS[it.key_name] || [, it.key_name])[1],
    off: new Set(it.non_compliant.map((r) => r.user_email + "|" + r.host)), offTerminals: it.non_compliant.length,
  }));

  // 利用者 → 端末 の入れ子
  const stale = new Map(P.stale.map((r) => [r.user_email + "|" + r.host, r.last_day]));
  const users = new Map();
  for (const r of P.latest_values) {
    if (!users.has(r.user_email)) users.set(r.user_email, { email: r.user_email, terminals: [] });
    const id = r.user_email + "|" + r.host;
    users.get(r.user_email).terminals.push({ host: r.host, value: r.prev_value, day: stale.get(id) ?? r.day, stale: stale.has(id), on: items.map((it) => !it.off.has(id)) });
  }
  for (const r of P.not_introduced) users.set(r.user_email, { email: r.user_email, terminals: [], notIntroduced: true });
  const STATUS = { noncompliant: ["未適用あり", "ng"], notintro: ["未導入", "warn"], stale: ["報告停止", "none"], ok: ["すべて適用", "ok"] };
  const ORDER = { noncompliant: 0, notintro: 1, stale: 2, ok: 3 };
  const rows = [...users.values()].map((u) => {
    const t = u.terminals, on = items.map((_, i) => (u.notIntroduced ? null : t.every((x) => x.on[i])));
    const offCount = on.filter((v) => v === false).length, lastDay = t.length ? Math.max(...t.map((x) => x.day)) : null;
    const status = u.notIntroduced ? "notintro" : offCount ? "noncompliant" : t.some((x) => x.stale) ? "stale" : "ok";
    return { ...u, on, offCount, status, lastDay, hosts: t.map((x) => x.host).join(" "), anyStale: t.some((x) => x.stale) };
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.offCount - a.offCount || a.email.localeCompare(b.email));
  const dayLabel = (d) => new Date((d + 0.5) * 864e5).toISOString().slice(0, 10);

  // 指標（利用者の集合から計算する。絞り込み中の集合を渡せば再計算される）
  function calc(us) {
    const den = us.length;
    const set = items.map((it, i) => {
      const num = us.filter((u) => u.on[i] === true).length, rate = den ? (num / den) * 100 : null;
      const m = { id: "set" + i, group: "設定ごとの適用率", label: it.name, value: rate, unit: "%", show: (v) => (v == null ? "—" : fix(v, 1)),
        sub: `${num} / ${den} 人 · 未適用の端末 ${us.reduce((s, u) => s + u.terminals.filter((t) => !t.on[i]).length, 0)} 台`, scope: `直近 ${DAYS} 日 · 利用者`,
        viz: () => `<div class="viz">${K.meter(num, den)}</div>`, rule: SETTING_RULE, tab: "users",
        pin: { label: `「${it.name}」が未適用`, fn: (r) => r.on[i] !== true } };
      m.tone = judge(m.rule, m);
      return m;
    });
    const ni = us.filter((u) => u.notIntroduced).length, st = sum(us, (u) => u.terminals.filter((t) => t.stale).length), tAll = sum(us, (u) => u.terminals.length);
    const ex = [
      { id: "notintro", group: "例外", label: "プラグイン未導入", value: ni, unit: "人", show: n, sub: `コストはあるが報告なし · ${den} 人中`, scope: `直近 ${DAYS} 日`,
        rule: { on: "value", bad: "high", warn: 0, ng: 5 }, tab: "users", chip: "notintro" },
      { id: "stale", group: "例外", label: "報告が止まった端末", value: st, unit: "台", show: n, sub: `最後の報告から ${STALE} 日以上 · ${tAll} 台中`, scope: `直近 ${DAYS} 日`,
        rule: { on: "value", bad: "high", warn: 0, ng: 10 }, tab: "users", pin: { label: "報告が止まった端末がある", fn: (r) => r.anyStale } },
    ];
    ex[0].viz = () => `<div class="viz">${K.meter(ni, den)}</div>`;
    ex[1].viz = () => `<div class="viz">${K.meter(st, tAll)}</div>`;
    ex.forEach((m) => { m.tone = judge(m.rule, m); });
    return [...set, ...ex];
  }

  const cellDot = (v) => (v == null ? '<span class="na">—</span>' : v ? '<i class="on" title="配布した値"></i>' : '<i class="off" title="違う値・未設定"></i>');
  const statusChips = { label: "状態", of: (r) => r.status, items: Object.entries(STATUS).map(([k, [l, t]]) => [k, l, t]) };
  const versionRows = [["プラグイン", P.plugin_versions], ["Claude Code 本体", P.claude_code_versions]].flatMap(([kind, list]) => {
    const t = sum(list, (v) => v.count), latest = [...list].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0].version;
    return list.map((v) => ({ kind, version: v.version, count: v.count, total: t, latest: v.version === latest }));
  });
  const verSort = (r) => r.kind + r.version.split(".").map((x) => x.padStart(4, "0")).join(".");

  const TABS = [
    { id: "users", label: "利用者ごと", title: "利用者ごとの適用状況", scope: `直近 ${DAYS} 日 · 1 人 1 行（端末は利用者とホスト名の組）· ●配布した値 ○違う値・未設定`, unit: "人",
      note: "1 台でも違う値の端末があれば、その利用者は未適用と数えます。このため台数と人数は一致しません。",
      rows, text: (r) => `${r.email} ${r.hosts}`, chips: statusChips, sort: ["status", "asc"], placeholder: "利用者・端末名",
      cols: [
        { key: "status", label: "状態", w: "118px", render: (r) => mark(STATUS[r.status][1], r.status === "noncompliant" ? `未適用 ${r.offCount}` : STATUS[r.status][0]), sort: (r) => ORDER[r.status] * 10 - r.offCount },
        { key: "email", label: "利用者", render: (r) => `${esc(r.email)}<span class="aux code">${r.terminals.length ? r.hosts : "端末の報告なし"}</span>` },
        { key: "tcount", label: "端末", num: true, sort: (r) => r.terminals.length, render: (r) => (r.terminals.length ? `${r.terminals.length} 台` : "—") },
        ...items.map((it, i) => ({ key: "s" + i, label: `<span title="${it.name}">${it.head}</span>`, nosort: true, cls: "dotcol", render: (r) => cellDot(r.on[i]) })),
        { key: "lastDay", label: "最終報告日", num: true, sort: (r) => r.lastDay ?? -1,
          render: (r) => (r.lastDay == null ? '<span class="sub">報告なし</span>' : `${dayLabel(r.lastDay)} <span class="${today - r.lastDay >= STALE ? "late" : "sub"}">${today - r.lastDay ? today - r.lastDay + " 日前" : "今日"}</span>`) },
      ] },
    { id: "settings", label: "設定ごと", title: "設定ごとの適用率と未適用の端末", scope: `直近 ${DAYS} 日 · 分母は利用明細（CSV）の最終日までの ${DAYS} 日にコストがある利用者`, unit: "設定",
      rows: [], text: (r) => `${r.label} ${r.key}`, chips: { label: "状態", of: (r) => r.tone, items: [["ng", "要対応", "ng"], ["warn", "注意", "warn"], ["ok", "正常", "ok"]] }, placeholder: "設定名・キー",
      note: `状態は ${K.ruleText(SETTING_RULE, "%")} としています（仮の基準）。`,
      cols: [
        { key: "tone", label: "状態", render: (r) => mark(r.tone), sort: (r) => ({ ng: 2, warn: 1, ok: 0 })[r.tone] },
        { key: "label", label: "設定", render: (r) => `${r.label}<span class="aux code">${esc(r.key)}</span>` },
        { key: "num", label: "適用済み / 対象", num: true, render: (r) => `${r.num} <span class="sub">/ ${r.den} 人</span>` },
        { key: "value", label: "適用率", num: true, render: (r) => fix(r.value, 1) + "%" },
        { key: "bar", label: "", nosort: true, w: "22%", render: (r) => K.meter(r.num, r.den, r.tone) },
        { key: "offT", label: "未適用の端末", num: true, render: (r) => `${r.offT} 台` },
      ] },
    { id: "versions", label: "バージョン", title: "プラグインと Claude Code 本体のバージョン", scope: `直近 ${DAYS} 日 · 端末ごとに最新の報告を 1 件`, unit: "行",
      rows: versionRows, text: (r) => `${r.kind} ${r.version}`, sort: ["version", "desc"], placeholder: "バージョン",
      chips: { label: "種類", of: (r) => r.kind, items: [["プラグイン", "プラグイン"], ["Claude Code 本体", "Claude Code 本体"]] },
      cols: [
        { key: "kind", label: "種類" },
        { key: "version", label: "バージョン", cls: "code", sort: verSort, render: (r) => `${r.version}${r.latest ? ' <span class="tag">最新</span>' : ""}` },
        { key: "count", label: "端末数", num: true, render: (r) => `${r.count} <span class="sub">/ ${r.total} 台</span>` },
        { key: "bar", label: "", nosort: true, w: "40%", render: (r) => K.meter(r.count, r.total, r.latest ? "" : "ghost") },
      ] },
  ];
  const uTab = TABS[0];

  function settingRows(us) {
    return calc(us).filter((m) => m.id.startsWith("set")).map((m, i) => ({ ...m, key: items[i].key, num: us.filter((u) => u.on[i] === true).length, den: us.length,
      offT: us.reduce((s, u) => s + u.terminals.filter((t) => !t.on[i]).length, 0) }));
  }
  TABS[1].rows = settingRows(rows);
  const bad = rows.filter((r) => r.status !== "ok").length;
  uTab.badge = bad; uTab.tone = "ng";
  const sBad = TABS[1].rows.filter((r) => r.tone !== "ok").length;
  if (sBad) { TABS[1].badge = sBad; TABS[1].tone = "warn"; }

  const from = dayLabel(today - DAYS + 1).slice(5).replace("-", "/"), to = dayLabel(today).slice(5).replace("-", "/");
  return {
    page: "policy", title: "設定の適用状況", lead: "配布した設定が各端末で有効になっているか",
    period: `直近 ${DAYS} 日（${from}〜${to}）`, groups: ["設定ごとの適用率", "例外"],
    METRICS: calc(rows), TABS, calc, settingRows, rows, items, STATUS,
  };
})();
