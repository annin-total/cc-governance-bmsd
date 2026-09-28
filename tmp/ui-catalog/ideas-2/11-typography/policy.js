"use strict";
// 設定の適用状況: 上段のカードと下段のタブの定義。項目を足すときは CARDS / TABS に 1 要素足す
(() => {
  const M = window.POLICY;
  const { pct, mark, hbar, cap, meter, stack, rows } = window.UI;
  const USER_ST = { off: ["ng", "未適用あり"], none: ["warn", "未導入"], stale: ["neutral", "報告停止"], ok: ["ok", "すべて適用"] };
  const TERM_ST = { off: ["ng", "未適用"], stale: ["neutral", "報告停止"], ok: ["ok", "適用"] };
  const ORDER = { off: 0, none: 1, stale: 2, ok: 3 };
  const VERSION_SHADES = ["var(--accent)", "var(--accent-2)", "var(--ghost)"];

  const count = (list, st) => list.filter((r) => r.status === st).length;
  const staleTerms = M.terminals.filter((t) => t.stale);
  const offTerms = M.terminals.filter((t) => t.status === "off");
  const lowest = M.items.reduce((m, it) => (it.rate < m.rate ? it : m));
  const ago = (d) => (d === 0 ? "今日" : `${d} 日前`);
  const day = (r) => (r.dayLabel ? `${r.dayLabel}<span class="sub ${r.ago >= M.staleDays ? "late" : ""}"> ${ago(r.ago)}</span>` : `<span class="sub">報告なし</span>`);
  const user = (email) => { const [a, b] = email.split("@"); return `<b class="u-id">${a}</b><span class="sub">@${b}</span>`; };
  const dot = (v) => `<span class="on ${v === null ? "none" : v ? "yes" : "no"}" role="img" aria-label="${v === null ? "報告なし" : v ? "適用" : "未適用"}"></span>`;
  const chipsOf = (map, list, all) => [{ id: "all", label: all, test: () => true },
    ...Object.entries(map).map(([id, [tone, label]]) => ({ id, label, tone, test: id === "stale" && list === M.terminals ? (r) => r.stale : (r) => r.status === id }))];
  const versionCard = (kind, label) => {
    const vs = M.versions.filter((v) => v.kind === kind).sort((a, b) => M.newer(b.version, a.version)), top = vs[0];
    return { group: "set", tab: "versions", chip: kind === "プラグイン" ? "plugin" : "core", label, value: top.count, unit: "台",
      sub: `最新 ${top.version} · 全 ${top.total} 台`, viz: stack(vs.map((v, i) => [v.count, v.version, VERSION_SHADES[i % 3]])) };
  };

  const GROUPS = [
    { id: "who", label: "利用者", scope: `直近 30 日 · 対象は利用明細（CSV）の最終日までの 30 日にコストがある ${M.denominator} 人` },
    { id: "set", label: "設定と更新", scope: "直近 30 日 · 端末ごとに最新の報告 1 件" },
  ];
  const CARDS = [
    { group: "who", tab: "users", chip: "ok", label: "すべての設定を適用", value: count(M.users, "ok"), unit: "人", sub: `対象 ${M.denominator} 人のうち ${pct((count(M.users, "ok") / M.denominator) * 100)}`, viz: meter(count(M.users, "ok"), M.denominator, "ok") + cap(`${M.items.length} つの設定がすべて配布した値`) },
    { group: "who", tab: "users", chip: "off", label: "未適用のある利用者", value: count(M.users, "off"), unit: "人", state: ["ng", "要確認"], sub: `端末 ${offTerms.length} 台 · 違う値か未設定`, viz: meter(count(M.users, "off"), M.denominator, "ng") + cap(`対象 ${M.denominator} 人のうち`) },
    { group: "who", tab: "users", chip: "none", label: "プラグイン未導入", value: count(M.users, "none"), unit: "人", state: ["warn", "注意"], sub: "コストがあるのに報告が無い", viz: meter(count(M.users, "none"), M.denominator, "warn") + cap(`対象 ${M.denominator} 人のうち`) },
    { group: "who", tab: "terminals", chip: "stale", label: "報告が止まった端末", value: staleTerms.length, unit: "台", sub: `${new Set(staleTerms.map((t) => t.email)).size} 人 · 最後の報告から ${M.staleDays} 日以上`, viz: meter(staleTerms.length, M.terminals.length, "neutral") + cap(`全 ${M.terminals.length} 台のうち`) },
    { group: "set", tab: "settings", wide: true, label: "設定ごとの適用率", sub: `最も低いのは ${lowest.name}`,
      viz: rows(M.items.map((it) => [it.name, it.rate, 100, `<span class="num">${it.num} / ${it.den} 人</span><b class="num">${pct(it.rate)}</b>`])) },
    versionCard("プラグイン", "プラグインが最新版の端末"),
    versionCard("Claude Code 本体", "本体が最新版の端末"),
  ];

  const TABS = [
    { id: "users", label: "利用者ごと", hint: `${M.users.length} 人`, title: "利用者ごとの適用状況", scope: `対象 ${M.denominator} 人 · ${dot(true)} 配布した値　${dot(false)} 違う値か未設定　${dot(null)} 報告なし（未導入）`,
      note: "1 台でも違う値の端末があれば、その利用者は未適用と数えます。このため台数と人数は一致しません。",
      table: () => ({ rows: M.users, unit: "人", sort: ["status", 1],
        search: { placeholder: "利用者で絞り込み", text: (r) => r.email }, chips: chipsOf(USER_ST, M.users, "すべて"),
        cols: [{ key: "status", label: "状態", sort: (r) => ORDER[r.status] * 10 - r.off, cell: (r) => mark(USER_ST[r.status][0], r.off ? `未適用 ${r.off} 項目` : USER_ST[r.status][1]), width: "132px" },
          { key: "email", label: "利用者", cell: (r) => user(r.email) }, { key: "terminals", label: "端末", num: true, cell: (r) => r.terminals || `<span class="sub">—</span>` },
          ...M.items.map((it, i) => ({ key: `s${i}`, label: it.short, sub: `${it.num} / ${it.den} 人`, cls: "c-on", sort: (r) => (r.on[i] === null ? -1 : +r.on[i]), cell: (r) => dot(r.on[i]) })),
          { key: "day", label: "最終報告日", num: true, cell: day }] }) },
    { id: "terminals", label: "端末ごと", hint: `${M.terminals.length} 台`, title: "端末ごとの現在の値", scope: "直近 30 日に設定の報告があった端末 · 端末ごとに最新の報告 1 件",
      note: `報告停止 = 最後の報告から ${M.staleDays} 日以上経った端末。30 日を過ぎると一覧から外れます。`,
      table: () => ({ rows: M.terminals, unit: "台", sort: ["status", 1],
        search: { placeholder: "利用者・端末名で絞り込み", text: (r) => `${r.email} ${r.host}` }, chips: chipsOf(TERM_ST, M.terminals, "すべて"),
        cols: [{ key: "status", label: "状態", sort: (r) => ORDER[r.status] * 10 - r.offNames.length, cell: (r) => mark(...TERM_ST[r.status]) + (r.stale && r.status !== "stale" ? ` ${mark("neutral", "報告停止")}` : ""), width: "132px" },
          { key: "email", label: "利用者", cell: (r) => user(r.email) }, { key: "host", label: "端末名", cell: (r) => `<span class="code">${r.host}</span>` },
          { key: "value", label: "自動圧縮のしきい値", num: true, sort: (r) => +(r.value ?? -1), cell: (r) => r.value ?? `<span class="sub">未設定</span>` },
          { key: "offNames", label: "未適用の設定", sort: (r) => r.offNames.length, cell: (r) => (r.offNames.length ? `<b class="num-ng">${r.offNames.length}</b> <span class="sub">${r.offNames.join("、")}</span>` : `<span class="sub">—</span>`) },
          { key: "day", label: "最終報告日", num: true, cell: day }] }) },
    { id: "settings", label: "設定ごと", hint: `${M.items.length} 設定`, title: "設定ごとの適用率", scope: `直近 30 日 · 分母は利用明細（CSV）の最終日までの 30 日にコストがある利用者 ${M.denominator} 人`,
      table: () => ({ rows: M.items.map((it) => ({ ...it, offCount: it.off.size })), unit: "行", sort: ["rate", 1],
        search: { placeholder: "設定名・キーで絞り込み", text: (r) => `${r.name} ${r.key}` },
        cols: [{ key: "name", label: "設定", cell: (r) => `${r.name}<span class="sub code key">${r.key}</span>` }, { key: "num", label: "適用済み / 対象", num: true, cell: (r) => `${r.num} <span class="sub">/ ${r.den} 人</span>` },
          { key: "rate", label: "適用率", num: true, cell: (r) => `<b>${pct(r.rate)}</b>` }, { key: "bar", label: "", sort: false, width: "24%", cell: (r) => hbar(r.rate, 100) },
          { key: "offCount", label: "未適用の端末", num: true, cell: (r) => `${r.offCount} 台` }] }) },
    { id: "versions", label: "バージョン", hint: "プラグイン・本体", title: "バージョンの分布", scope: "直近 30 日 · 端末ごとに最新の報告 1 件 · 古い版が残るのは更新が届いていない端末",
      table: () => ({ rows: M.versions, unit: "行", sort: ["version", -1],
        chips: [{ id: "all", label: "すべて", test: () => true }, { id: "plugin", label: "プラグイン", test: (r) => r.kind === "プラグイン" }, { id: "core", label: "Claude Code 本体", test: (r) => r.kind !== "プラグイン" }],
        cols: [{ key: "kind", label: "種類", cell: (r) => `<span class="sub">${r.kind}</span>` }, { key: "version", label: "バージョン", sort: (r) => r.version.split(".").reduce((s, x) => s * 1000 + +x, 0), cell: (r) => `<span class="code">${r.version}</span>${r.latest ? ` ${mark("ok", "最新")}` : ""}` },
          { key: "count", label: "端末数", num: true, cell: (r) => `${r.count} <span class="sub">/ ${r.total} 台</span>` }, { key: "bar", label: "", sort: false, width: "34%", cell: (r) => hbar(r.count, r.total) }] }) },
  ];

  window.UI.page({ groups: GROUPS, cards: CARDS, tabs: TABS });
})();
