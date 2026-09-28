// 04: 2 段のナビ。上の段 = 画面、下の段（常に上端に残る）= 画面の中の一覧。本文は要点カードと選んだ一覧
(() => {
  const K = window.KIT, S = window.SCREENS[document.body.dataset.screen];
  const $ = (id) => document.getElementById(id);
  K.header($("top"), S.key, { overview: "index.html", policy: "policy.html" });
  K.head($("head"), S);
  $("foot").textContent = K.FOOT;
  $("sub-label").textContent = `${S.title}の一覧`;

  K.cardGroups($("cards"), S, (c) => ({ href: `#${c.to.tab}${c.to.facet ? ":" + c.to.facet : ""}` }));
  const mark = K.tabs($("tabs"), S.tabs, (id) => { select(id); reveal(); });

  function select(id, preset = {}) {
    mark(id);
    K.panelBody($("panel"), S.tabs.find((t) => t.id === id), preset);
  }
  // 一覧の頭が画面の下半分にあるときだけ、帯の直下まで送る
  function reveal() {
    const top = $("detail").getBoundingClientRect().top, bar = $("subnav").offsetHeight;
    if (top > innerHeight * 0.6 || top < bar) scrollTo({ top: scrollY + top - bar - 12, behavior: "smooth" });
  }
  $("cards").addEventListener("click", (e) => {
    const a = e.target.closest(".card"); if (!a) return;
    e.preventDefault();
    const c = S.cards.find((x) => x.id === a.dataset.card);
    select(c.to.tab, { facet: c.to.facet }); reveal();
  });
  const [tab, facet] = location.hash.slice(1).split(":");
  select(S.tabs.some((t) => t.id === tab) ? tab : S.tabs[0].id, { facet });
})();
