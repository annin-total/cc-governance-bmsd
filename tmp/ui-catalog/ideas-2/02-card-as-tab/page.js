// 02: カードがタブを兼ねる。押したカードの一覧が下に出る。同じ一覧を指すカードはそろって選択の印が付く
(() => {
  const K = window.KIT, S = window.SCREENS[document.body.dataset.screen];
  const $ = (id) => document.getElementById(id);
  K.header($("top"), S.key, { overview: "index.html", policy: "policy.html" });
  K.head($("head"), S);
  $("foot").textContent = K.FOOT;

  const same = (a, b) => a.to.tab === b.to.tab && (a.to.facet || "") === (b.to.facet || "");
  let current = S.cards[0];

  function select(c) {
    current = c;
    K.cardGroups($("cards"), S, (x, g) => {
      const on = same(x, current);
      return { tag: "button", selected: on, go: g.compact ? (on ? "" : "↓") : x === current ? "表示中" : on ? "同じ一覧" : "一覧 ↓" };
    });
    const tab = S.tabs.find((t) => t.id === c.to.tab);
    const peers = S.cards.filter((x) => same(x, c)).map((x) => x.label).join("・");
    $("panel").innerHTML = `<div class="panel-h"><span class="from">${peers}</span><h2>${tab.label}</h2><span class="scope">${tab.scope}</span></div><div id="body"></div>`;
    K.panelBody($("body"), tab, { facet: c.to.facet }, { heading: false });
  }
  $("cards").addEventListener("click", (e) => {
    const b = e.target.closest(".card"); if (!b) return;
    select(S.cards.find((x) => x.id === b.dataset.card));
  });
  select(S.cards.find((c) => c.id === location.hash.slice(1)) || S.cards[0]);
})();
