"use strict";
// 目録のカードとタブを id で並べて、案の定義（window.IA）を組み立てる。書き方は README.md の「定義の書き方」。
// 群の窓はカードの win から決まり、窓の違うカードを 1 つの群に入れるとエラーを出す。同じページに同じカードを 2 回置いてもエラー。
(() => {
  const { K, W, T, SAME, sectionPages } = window.CATALOG;
  const KIT = window.KIT;
  const params = new URLSearchParams(location.search);
  const PERIOD = params.get("period");
  const ASOF = params.get("asof");
  const LONG = PERIOD === "12m";
  const fail = (msg) => console.error(`catalog: ${msg}`);
  const bill = () => KIT.look.get().ends === "bill";
  // 案 51 だけが読むファイル（cards5.js・tabs5.js）が足す、look に合わせたカードとタブの差し替え。案 31 では空
  const adapt = (kind, x) => (window.CATALOG[kind] || []).reduce((out, f) => f(out), x);

  function cardOf(id) {
    if (!K[id]) fail(`知らないカード: ${id}`);
    return adapt("cardAdapters", { ...K[id], ref: id });
  }

  // 群 [見出し, [カード id], { win, note }] か { label, cards, win, note }。win は期間を固定した窓（rec7 など）
  function group(spec, i) {
    const s = Array.isArray(spec) ? { label: spec[0], cards: spec[1], ...(spec[2] || {}) } : spec;
    const at = KIT.look.get().concAt; // onlyAt: 置き場の切り替え（案 51 の conc。card・tab）で出すときだけ
    const cards = s.cards.map(cardOf).filter((c) => !c.onlyAt || c.onlyAt === at);
    const base = cards[0].win;
    if (cards.some((c) => c.win !== base)) fail(`群「${s.label}」に窓の違うカード: ${[...new Set(cards.map((c) => c.win))].join(", ")}`);
    const winId = s.win || base;
    const w = W[winId];
    if (!w || (winId !== base && w.base !== base)) fail(`群「${s.label}」の窓 ${winId} はカードの窓 ${base} と合わない`);
    const out = cards.map((c) => (w.fixed && !c.long ? { ...c, long: SAME } : c));
    return { id: s.id || `g${i + 1}`, label: s.label, win: winId, scope: w.scope, longScope: w.fixed ? w.scope : w.longScope,
      brief: w.brief, longBrief: w.fixed ? w.brief : w.longBrief, data: (bill() && w.today) || w.data, note: s.note, cards: out };
  }

  function tabOf(id) {
    if (!T[id]) fail(`知らないタブ: ${id}`);
    const t = adapt("tabAdapters", { ...T[id], ...(bill() && (T[id] || {}).today ? { data: T[id].today } : {}) });
    if ((t.data || "").startsWith("fixed") && !t.long) t.long = SAME;
    return t;
  }

  // カードの tabs（候補）から、ページにある最初のタブを開く先にする。無ければ押せないカード
  function resolve(card, ids) {
    const { tabs, ...out } = card;
    const hit = (tabs || []).find((t) => ids.includes(t));
    if (hit) out.tab = hit; else delete out.chip;
    if (card.long && card.long !== SAME) out.long = resolve(card.long, ids);
    return out;
  }

  function noDuplicates(where, ids) {
    const seen = new Set();
    ids.forEach((id) => { if (seen.has(id)) fail(`${where} に同じカードが 2 回ある: ${id}`); seen.add(id); });
  }

  // ページ { id, title, lead, periods, groups: [群], tabs: [id] }
  function page(def) {
    const all = (def.tabs || []).map(tabOf).filter((t) => (!t.longOnly || LONG) && (!t.onlyAt || t.onlyAt === KIT.look.get().concAt));
    const shown = (t) => !LONG || Boolean(t.long);
    const tabs = [...all.filter(shown), ...all.filter((t) => !shown(t))]; // 12 か月では出るタブを先に開く
    const ids = tabs.map((t) => (LONG && t.long && t.long !== SAME ? t.long.id : t.id));
    const specs = (KIT.look.get().groups === "G3" && def.groups3) || def.groups || []; // groups3: 群の型 G3（案 51）
    const groups = specs.map(group).map((g) => ({ ...g, cards: g.cards.map((c) => resolve(c, ids)) }));
    noDuplicates(`ページ ${def.id}`, groups.flatMap((g) => g.cards.map((c) => c.ref)));
    return { ...def, tabs, groups };
  }

  // 専用ページへの URL。期間と基準日を引き継ぐ
  const pageHref = (p) => `?page=${p.id}${p.periods && PERIOD ? `&period=${PERIOD}` : ""}${ASOF ? `&asof=${ASOF}` : ""}`;

  function linked(card, p) {
    const out = card.tab ? { ...card, href: card.href || pageHref(p) } : { ...card };
    if (card.long && card.long !== SAME) out.long = card.long.tab ? { ...card.long, href: pageHref(p) } : card.long;
    return out;
  }

  // 案 51: 概況に写す今日の時点の窓（stamp）のカードは、添える数字の前に「MM/DD 時点」を付ける
  const stamped = (c, g) => (bill() && W[g.win].stamp ? { ...c, sub: [KIT.L.ASOF.replace("{}", "{M[today]:md}"), c.sub].filter(Boolean).join(" · ") } : c);

  // 概況 { id, title, lead, home: true, summary, groups: [群] }。群は並びと窓だけを決め、見出しは出さない（page.js の homeHtml）。
  // カードは専用ページの定義をそのまま使い、押すと専用ページのタブへ移る
  function home(def, pages) {
    const where = (id) => pages.find((p) => p.groups.some((g) => g.cards.some((c) => c.ref === id)));
    const groups = def.groups.map((spec, i) => {
      const g = group(spec, i);
      const from = g.cards.map((c) => where(c.ref));
      g.cards.forEach((c, j) => { if (!from[j]) fail(`概況のカード ${c.ref} が専用ページに無い`); });
      const cards = g.cards.map((c, j) => (from[j] ? linked(from[j].groups.flatMap((x) => x.cards).find((x) => x.ref === c.ref), from[j]) : c)).map((c) => stamped(c, g));
      return { ...g, id: `home-${i + 1}`, cards };
    });
    noDuplicates("概況", groups.flatMap((g) => g.cards.map((c) => c.ref)));
    return { ...def, periods: def.periods ?? true, groups, tabs: [] };
  }

  // 案 { id, name, look, pages: [概況とページ] }。サマリーとデータと設定のページは末尾に足す
  function build(ia) {
    // compare: 比較用の切り替え（true は compare.js の右上の帯、"r5" は compare5.js の右下のパネル）
    KIT.look.set(ia.compare === "r5" ? KIT.compare5.look(ia.look) : ia.compare ? KIT.compare.look(ia.look) : ia.look);
    if (KIT.basedate.prepare) KIT.basedate.prepare();
    const normal = ia.pages.filter((p) => !p.home).map(page);
    const pages = ia.pages.map((p) => (p.home ? home(p, normal) : normal.find((x) => x.id === p.id)));
    return { ...ia, pages: [...pages, ...sectionPages] };
  }

  Object.assign(window.CATALOG, { build, LONG, ASOF });
})();
