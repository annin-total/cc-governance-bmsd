"use strict";
// 案 51 だけが読む区画: データと設定の「組織 CSV」の取り込みの欄（モック。押しても何も起きない。look.org のときだけ出す）。
(() => {
  const K = window.KIT;
  const { esc, fill } = K;
  const W = {
    title: "組織 CSV", lead: "利用者のメールアドレスを業務メールアドレスに突き合わせ、部と課を引きます",
    pick: "ファイルを選ぶ", run: "取り込む", note: "月 1 回の更新。名簿に無い利用者は部署を不明として扱う",
    stats: [["取り込んだ日", "{F[org][imported]:day}"], ["行数", "{F[org][rows]:num} 行"], ["部の数", "{F[org][depts_n]:num}"], ["課の数", "{F[org][sections_n]:num}"],
      ["名簿に無い利用者", "{F[org][unlisted]:num} 人（利用明細の最終日までの 30 日にコストがあった人のうち）"]],
  };

  K.blocks.org_import = (b, ctx) => `<div class="org-import"><div class="org-actions"><button type="button" class="btn-sub">${esc(W.pick)}</button><button type="button" class="btn">${esc(W.run)}</button></div>`
    + `<dl class="org-stats">${W.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(fill(v, ctx))}</dd></div>`).join("")}</dl><p class="note">${esc(W.note)}</p></div>`;

  const settings = window.CATALOG.sectionPages.find((p) => p.id === "settings");
  const at = settings.sections.findIndex((s) => s.id === "import") + 1;
  settings.sections.splice(at, 0, { id: "org", title: W.title, lead: W.lead, org: true, blocks: [{ kind: "org_import" }] });
})();
