"use strict";
// 目録のカードとタブを id で並べて、案の定義（window.IA）を組み立てる。書き方は catalog.md の「定義の書き方」。
// 群の窓はカードの win から決まり、窓の違うカードを 1 つの群に入れるとエラーを出す。同じカードを 2 か所に置いてもエラー。
(() => {
  const { K, W, T, SAME, settings } = window.CATALOG;
  const PERIOD = new URLSearchParams(location.search).get("period");
  const LONG = PERIOD === "12m";
  const fail = (msg) => console.error(`catalog: ${msg}`);

  function cardOf(id) {
    if (!K[id]) fail(`知らないカード: ${id}`);
    return { ...K[id], ref: id };
  }

  // 群 { label, cards: [id], win?, note? } または [label, [id], { win, note }]。win は期間を固定した窓（rec7 など）
  function group(spec, i) {
    const s = Array.isArray(spec) ? { label: spec[0], cards: spec[1], ...(spec[2] || {}) } : spec;
    const cards = s.cards.map(cardOf);
    const base = cards[0].win;
    if (cards.some((c) => c.win !== base)) fail(`群「${s.label}」に窓の違うカード: ${[...new Set(cards.map((c) => c.win))].join(", ")}`);
    const winId = s.win || base;
    const w = W[winId];
    if (!w || (w.base || winId) !== base) fail(`群「${s.label}」の窓 ${winId} はカードの窓 ${base} と合わない`);
    const out = cards.map(({ win, ...c }) => (w.fixed && !c.long ? { ...c, long: SAME } : c));
    return { id: s.id || `g${i + 1}`, label: s.label, win: winId, scope: w.scope, longScope: w.fixed ? w.scope : w.longScope, data: w.data, note: s.note, cards: out };
  }

  function tabOf(id) {
    if (!T[id]) fail(`知らないタブ: ${id}`);
    const t = { ...T[id] };
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

  // ページ { id, title, lead, periods, groups: [群], tabs: [id] }
  function page(def) {
    const all = (def.tabs || []).map(tabOf).filter((t) => !t.longOnly || LONG);
    const shown = (t) => !LONG || Boolean(t.long);
    const tabs = [...all.filter(shown), ...all.filter((t) => !shown(t))]; // 12 か月では出るタブを先に開く
    const ids = tabs.map((t) => (LONG && t.long && t.long !== SAME ? t.long.id : t.id));
    const groups = (def.groups || []).map(group).map((g) => ({ ...g, cards: g.cards.map((c) => resolve(c, ids)) }));
    return { ...def, tabs, groups };
  }

  // トップ { id, title, lead, refs: [{ page, cards: [id] }] }。群は窓ごとに作り（見出しは窓の名前）、カードは参照元のタブへ移る
  function top(def, pages) {
    const groups = new Map();
    for (const ref of def.refs) {
      const p = pages.find((x) => x.id === ref.page);
      if (!p) { fail(`トップが参照するページが無い: ${ref.page}`); continue; }
      for (const id of ref.cards) {
        const g = p.groups.find((x) => x.cards.some((c) => c.ref === id));
        if (!g) { fail(`ページ ${p.id} にカードが無い: ${id}`); continue; }
        const key = g.win;
        if (!groups.has(key)) groups.set(key, { ...g, id: `top-${key}`, label: W[key].name, cards: [] });
        groups.get(key).cards.push(linked(g.cards.find((c) => c.ref === id), p));
      }
    }
    const periods = def.periods ?? def.refs.some((r) => (pages.find((x) => x.id === r.page) || {}).periods);
    return { ...def, periods, groups: [...groups.values()], tabs: [] };
  }

  function linked(card, p) {
    const href = (c) => `?page=${p.id}${p.periods && PERIOD ? `&period=${PERIOD}` : ""}#${c.tab}${c.chip ? `:${c.chip}` : ""}`;
    const out = card.tab ? { ...card, href: href(card) } : { ...card };
    if (card.long && card.long !== SAME) out.long = card.long.tab ? { ...card.long, href: href(card.long) } : card.long;
    return out;
  }

  // 案 { id, name, pages: [ページかトップ] }。データと設定のページは末尾に足す
  function build(ia) {
    const normal = ia.pages.filter((p) => !p.refs).map(page);
    const seen = new Map();
    normal.forEach((p) => p.groups.forEach((g) => g.cards.forEach((c) => {
      if (seen.has(c.ref)) fail(`カード ${c.ref} が 2 か所にある: ${seen.get(c.ref)} と ${p.id}`);
      seen.set(c.ref, p.id);
    })));
    const pages = ia.pages.map((p) => (p.refs ? top(p, normal) : normal.find((x) => x.id === p.id)));
    return { ...ia, pages: [...pages, settings] };
  }

  Object.assign(window.CATALOG, { build, LONG });
})();
