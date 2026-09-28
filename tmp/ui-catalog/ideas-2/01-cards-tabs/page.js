// 01: 上段にカード、下段にタブ。カードを押すと該当のタブを開いて下段へ移る
(() => {
  const K = window.KIT, S = window.SCREENS[document.body.dataset.screen];
  const $ = (id) => document.getElementById(id);
  K.header($("top"), S.key, { overview: "index.html", policy: "policy.html" });
  K.head($("head"), S);
  $("foot").textContent = K.FOOT;

  K.cardGroups($("cards"), S, (c) => ({ href: `#${c.to.tab}${c.to.facet ? ":" + c.to.facet : ""}` }));
  const mark = K.tabs($("tabs"), S.tabs, (id) => select(id));

  function select(id, preset = {}) {
    mark(id);
    K.panelBody($("panel"), S.tabs.find((t) => t.id === id), preset);
  }
  $("cards").addEventListener("click", (e) => {
    const a = e.target.closest(".card"); if (!a) return;
    e.preventDefault();
    const c = S.cards.find((x) => x.id === a.dataset.card);
    select(c.to.tab, { facet: c.to.facet });
    $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  const [tab, facet] = location.hash.slice(1).split(":");
  select(S.tabs.some((t) => t.id === tab) ? tab : S.tabs[0].id, { facet });
})();
