"use strict";
// 概況の組み立て。?period= で選んだ期間の上段と下段を描き、そのあと app.js がタブ・絞り込み・並べ替えを受け持つ
(() => {
  const k = window.Period.current();
  window.Shell.mount(k);
  const slot = (name) => document.querySelector(`[data-slot="${name}"]`);
  slot("period").innerHTML = window.Period.render(k);
  slot("kpis").innerHTML = window.OverviewCards.groups(k);
  slot("detail").outerHTML = window.UI.detail(window.OverviewTabs.tabList(k), window.OverviewTabs.bodies(k));
})();
