"use strict";
/* 全画面の節を「問い」ごとにまとめた目次。here: この画面の節（ページ内リンク） */
const TOC = [
  { q: "使われているか", items: [
    ["概況", "日ごとの利用者数とセッション数"], ["概況", "使い方の内訳"], ["概況", "日ごとのコスト"],
    ["スキル・コマンド", "スキル"], ["スキル・コマンド", "コマンド"], ["スキル・コマンド", "サブエージェントの利用"],
  ] },
  { q: "守られているか", items: [
    ["設定の適用状況", "設定ごとの適用率", "rates"], ["設定の適用状況", "端末ごとの状況", "terminals"],
    ["設定の適用状況", "バージョン", "versions"],
  ] },
  { q: "効果はあるか", items: [
    ["設定の効果", "適用前後のコスト"], ["設定の効果", "圧縮直前のコンテキスト"], ["設定の効果", "応答終了時のコンテキスト"],
  ] },
  { q: "データは正常か", items: [
    ["概況", "受信の状況"], ["概況", "プラグインのエラー"], ["概況", "項目の欠け"], ["概況", "利用明細（CSV）の取り込み"],
  ] },
];

(function renderToc() {
  const html = TOC.map((g) => {
    const here = g.items.some((it) => it[2]);
    let prev = "";
    const lis = g.items.map(([screen, name, id]) => {
      const head = screen !== prev ? `<li class="scr">${screen}</li>` : "";
      prev = screen;
      return head + (id
        ? `<li><a class="here" href="#${id}" data-target="${id}">${name}</a></li>`
        : `<li><a href="#" title="${screen}の画面へ">${name}</a></li>`);
    }).join("");
    return `<details class="grp${here ? " cur" : ""}" open><summary>${g.q}</summary><ul>${lis}</ul></details>`;
  }).join("");
  document.getElementById("toc").innerHTML = html;

  const links = [...document.querySelectorAll(".toc a.here")];
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("on", a.dataset.target === e.target.id));
    });
  }, { rootMargin: "-20% 0px -70% 0px" });
  links.forEach((a) => io.observe(document.getElementById(a.dataset.target)));
})();
