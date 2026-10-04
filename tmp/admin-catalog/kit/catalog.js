"use strict";
// 目録のカードとタブを id で並べて、案の定義（window.IA）を組み立てる。書き方は README.md の「定義の書き方」。
// カードはページごとに 1 つの格子に並びの順で流す（群を持たない）。同じページに同じカードを 2 回置くとエラーを出す。
(() => {
  const { K, W, T, SAME, sectionPages, overCard } = window.CATALOG;
  const KIT = window.KIT;
  const params = new URLSearchParams(location.search);
  const PERIOD = params.get("period");
  const ASOF = params.get("asof");
  const LONG = PERIOD === "12m";
  const OVER = /^over_(day|week|month)$/;
  const fail = (msg) => console.error(`catalog: ${msg}`);

  // 見せ方（look）に合わせた並び: cost は C32 で cost_total・per_bd の 2 枚にする
  const expand = (id) => (id === "cost" && KIT.look.get().cost === "C32" ? ["cost_total", "per_bd"] : [id]);
  const overForm = (home) => { const o = KIT.look.get().over; return o === "O5" ? (home ? "O4" : "O1") : o; };

  // カード 1 枚。data は窓の値の根、span は添える期間（概況の今日の時点の窓は「MM/DD 時点」を前に付ける）
  function cardOf(id, home) {
    if (!K[id]) { fail(`知らないカード: ${id}`); return null; }
    const m = OVER.exec(id);
    const { viz3, ...base } = m ? overCard(m[1], overForm(home)) : K[id];
    const w = W[base.win];
    if (!w) fail(`カード ${id} の窓 ${base.win} が無い`);
    const card = { ...base, ref: id, data: w.data, span: base.span ?? w.span ?? "" };
    if (viz3 && KIT.look.get().ver === "V3") card.viz = viz3;
    if (w.fixed && !card.long) card.long = SAME;
    if (home && w.now) card.span = [KIT.L.ASOF.replace("{}", "{S[today]:md}"), w.homeSpan || card.span].filter(Boolean).join(" · ");
    return card;
  }

  function tabOf(id) {
    if (!T[id]) fail(`知らないタブ: ${id}`);
    const t = { ...T[id] };
    if ((t.data || "").startsWith("fixed") && !t.long) t.long = SAME;
    return t;
  }

  // カードの tabs（候補）から、ページにある最初のタブを開く先にする。無ければ押せないカード
  // alias: タブの replaces（置き換えたタブの id → 置き換えたタブ）。away: 他のページのタブの id → そのページの URL
  function resolve(card, ids, alias = {}, away = {}) {
    const { tabs, ...out } = card;
    const want = (tabs || []).map((t) => (ids.includes(t) ? t : alias[t] || t));
    const hit = want.find((t) => ids.includes(t));
    const far = hit ? null : want.find((t) => t in away);
    if (hit) out.tab = hit; else if (far) Object.assign(out, { tab: far, href: away[far] }); else delete out.chip;
    if (card.long && card.long !== SAME) out.long = resolve(card.long, ids, alias, away);
    return out;
  }

  function noDuplicates(where, ids) {
    const seen = new Set();
    ids.forEach((id) => { if (seen.has(id)) fail(`${where} に同じカードが 2 回ある: ${id}`); seen.add(id); });
  }

  const aliases = (ids) => Object.fromEntries(ids.flatMap((id) => ((T[id] || {}).replaces || []).map((r) => [r, id])));
  // 専用ページへの URL。期間と基準日を引き継ぐ
  const pageHref = (p) => `?page=${p.id}${p.periods && PERIOD ? `&period=${PERIOD}` : ""}${ASOF ? `&asof=${ASOF}` : ""}`;

  // ページ { id, title, lead, periods, now, cards: [id], tabs: [id], borrow: [他のページのタブ id] }。
  // borrow のタブは、ページに開く先の無いカードを押したとき、持ち主のページへ期間と基準日を引き継いで開く
  function page(def, defs) {
    const all = (def.tabs || []).map(tabOf).filter((t) => !t.longOnly || LONG);
    const shown = (t) => !LONG || Boolean(t.long);
    const tabs = [...all.filter(shown), ...all.filter((t) => !shown(t))]; // 12 か月では出るタブを先に開く
    const ids = tabs.map((t) => (LONG && t.long && t.long !== SAME ? t.long.id : t.id));
    const owner = (id) => defs.find((d) => !d.home && d !== def && (d.tabs || []).map((t) => (T[t] || {}).id).includes(id));
    (def.borrow || []).forEach((id) => { if (!owner(id)) fail(`ページ ${def.id} の borrow のタブ ${id} がほかのページに無い`); });
    const away = Object.fromEntries((def.borrow || []).filter(owner).map((id) => [id, pageHref(owner(id))]));
    const alias = aliases([...(def.tabs || []), ...Object.keys(away)]);
    const cards = (def.cards || []).flatMap(expand).map((id) => cardOf(id, false)).filter(Boolean).map((c) => resolve(c, ids, alias, away));
    noDuplicates(`ページ ${def.id}`, cards.map((c) => c.ref));
    return { ...def, tabs, cards, tabIds: ids, alias };
  }

  // 概況 { id, title, lead, home: true, summary, cards: [id] }。カードは専用ページと同じ定義で、押すと専用ページのタブへ移る。
  // 移り先はカードを置いたページ、無ければ（applied_mix）開くタブを持つページ
  function home(def, pages) {
    const has = (p, c) => p.cards.some((x) => x.ref === c.ref);
    const opens = (p, c) => (c.tabs || []).some((t) => p.tabIds.includes(t) || p.alias[t]);
    const cards = (def.cards || []).flatMap(expand).map((id) => cardOf(id, true)).filter(Boolean).map((c) => {
      const p = pages.find((x) => has(x, c)) || pages.find((x) => opens(x, c));
      if (!p) { fail(`概況のカード ${c.ref} の移り先のページが無い`); return c; }
      const r = resolve(c, p.tabIds, p.alias);
      const out = r.tab ? { ...r, href: pageHref(p) } : r;
      if (r.long && r.long !== SAME && r.long.tab) out.long = { ...r.long, href: pageHref(p) };
      return out;
    });
    noDuplicates("概況", cards.map((c) => c.ref));
    return { ...def, periods: def.periods ?? true, cards, tabs: [] };
  }

  // 案 { id, name, look, compare, pages: [概況とページ] }。サマリーとデータと設定のページは末尾に足す
  function build(ia) {
    KIT.look.set(ia.compare ? KIT.compare.look(ia.look) : ia.look); // compare: 比較用の切り替え（compare.js）
    const normal = ia.pages.filter((p) => !p.home).map((p) => page(p, ia.pages));
    const pages = ia.pages.map((p) => (p.home ? home(p, normal) : normal.find((x) => x.id === p.id)));
    return { ...ia, pages: [...pages, ...sectionPages] };
  }

  Object.assign(window.CATALOG, { build, LONG, ASOF });
})();
