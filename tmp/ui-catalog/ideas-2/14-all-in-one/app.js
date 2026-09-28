// 画面の組み立て: ナビ → 要点カード → 詳しい一覧（タブ）。カードを押すと対応するタブを開く。
(() => {
  const main = document.querySelector("main");
  UI.nav(document.getElementById("nav"), main.dataset.screen, M.C.meta.today_label);
  const detail = document.getElementById("detail");
  const tabs = UI.tabs(document.getElementById("tabs"), PAGE.TABS);
  UI.cardGroups(document.getElementById("cards"), PAGE.GROUPS, PAGE.CARDS, (tab, chip) => {
    tabs.open(tab, chip);
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
