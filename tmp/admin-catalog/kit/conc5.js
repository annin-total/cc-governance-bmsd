"use strict";
// 案 51 の「人数とコストの割合の関係」（concepts5.md の 4.10）: カード conc_users・conc_depts と詳細タブ conc（集中と部署）。
// 型は look.conc（CC1〜CC4。conc5_users.js）と look.concd（CD1〜CD5。conc5_depts.js）、置き場は look.concAt（card・tab）。
(() => {
  const K = window.KIT;
  const { K: CARDS, T, SAME } = window.CATALOG;
  const SIZE = { card: [300, 110], tab: [520, 240] };

  const draw = (which, ctx, at) => {
    const look = K.look.get(), type = which === "users" ? look.conc : look.concd;
    const fn = (which === "users" ? K.concUsers : K.concDepts)[type];
    return `<span class="conc-wrap conc-at-${at}" data-conc="${type}">${fn(ctx, SIZE[at], at)}</span>`;
  };
  K.vizKinds = { ...(K.vizKinds || {}), conc: (card, ctx) => draw(card.viz.which, ctx, "card") };

  CARDS.conc_users = { win: "bill", label: "コストの集中", tabs: ["user_cost"], wide: true, onlyAt: "card", sub: "利用者ごとのコストの偏り", viz: { kind: "conc", which: "users" }, long: SAME };
  CARDS.conc_depts = { win: "bill", label: "部署ごとの人数とコスト", tabs: ["depts"], wide: true, onlyAt: "card", sub: "部署の人数の割合とコストの割合", viz: { kind: "conc", which: "depts" }, long: SAME };

  // CD5 はカードの見出しを課の上位に合わせる
  const top5 = (card) => (card.ref === "conc_depts" && K.look.get().concd === "CD5" ? { ...card, label: K.L.CONC.cd5_label, sub: K.L.CONC.cd5_sub } : card);
  window.CATALOG.cardAdapters = [...(window.CATALOG.cardAdapters || []), top5];

  T.conc = { id: "conc", label: "集中と部署", hint: "人数とコストの割合 · 利用明細", title: "人数とコストの割合の関係", onlyAt: "tab", long: SAME,
    scope: "利用明細 {r3[cost][start]:md}〜{r3[cost][end]:md} · 利用明細にコストがあった利用者",
    panel: (ctx) => `<div class="conc-tab"><div><h3>${K.L.CONC.users_head}</h3>${draw("users", ctx, "tab")}</div><div><h3>${K.L.CONC.depts_head}</h3>${draw("depts", ctx, "tab")}</div></div>` };
})();
