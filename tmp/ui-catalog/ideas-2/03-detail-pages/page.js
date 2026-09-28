// 03: 要点のページ（index / policy）と、詳しい一覧のページ（*-detail）を URL で分ける
(() => {
  const K = window.KIT, S = window.SCREENS[document.body.dataset.screen];
  const $ = (id) => document.getElementById(id);
  const PAGE = { overview: "index.html", policy: "policy.html" };
  const DETAIL = { overview: "overview-detail.html", policy: "policy-detail.html" };
  const link = (tab, facet) => `${DETAIL[S.key]}#${tab}${facet ? ":" + facet : ""}`;
  K.header($("top"), S.key, PAGE);
  $("foot").textContent = K.FOOT;

  if (!$("tabs")) {
    K.head($("head"), S);
    K.cardGroups($("cards"), S, (c) => ({ href: link(c.to.tab, c.to.facet) }));
    $("toc").innerHTML = S.tabs.map((t) => `<li><a href="${link(t.id)}"><b>${t.label}</b><span class="scope">${t.scope}</span><span class="n">${t.count} 行</span><span class="go">詳しく見る →</span></a></li>`).join("");
    return;
  }

  $("crumb").innerHTML = `<a href="${PAGE[S.key]}">${S.title}</a><span aria-hidden="true">/</span><span>詳しい一覧</span>`;
  K.head($("head"), { ...S, key: "detail", title: `${S.title}の詳しい一覧`, lead: `要点は「${S.title}」のページにあります。ここではタブを切り替え、絞り込みと並べ替えで行を探します` });
  const mark = K.tabs($("tabs"), S.tabs, (id) => { history.replaceState(null, "", "#" + id); select(id); });
  function select(id, preset = {}) {
    mark(id);
    K.panelBody($("panel"), S.tabs.find((t) => t.id === id), preset);
  }
  const [tab, facet] = location.hash.slice(1).split(":");
  select(S.tabs.some((t) => t.id === tab) ? tab : S.tabs[0].id, { facet });
})();
