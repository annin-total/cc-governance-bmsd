// 05 状態で束ねる: 指標を定義の基準で「要対応／注意／正常」に振り分け、束ごとに並べる。
(() => {
  const M = window.M, K = window.K, app = document.getElementById("app");
  const BUNDLES = [
    ["ng", "要対応", "基準を外れている。今週中に確かめる"],
    ["warn", "注意", "基準に近い、または前より悪い"],
    ["ok", "正常", "基準の内側"],
  ];

  const MAX_COLS = 4;
  const bundle = ([tone, label, desc]) => {
    const ms = M.METRICS.filter((m) => m.tone === tone), ok = tone === "ok";
    const cards = ms.length ? ms.map((m) => K.card(m, { compact: ok, noMark: true, rule: !ok })).join("") : `<p class="none">該当なし</p>`;
    return `<section class="bundle ${tone}" aria-label="${label}" style="--cols:${Math.max(1, Math.min(ms.length, MAX_COLS))}">
      <header class="b-head"><h2>${K.mark(tone, label)}<b>${ms.length}</b><span>項目</span></h2><p>${desc}</p></header>
      <div class="cards">${cards}</div>
    </section>`;
  };

  const csv = M.page === "overview" ? `<button type="button" class="btn quiet">利用明細（CSV）を取り込む</button>` : "";
  app.innerHTML = K.head(M, csv) + `<div class="bundles">${BUNDLES.map(bundle).join("")}</div>`
    + `<section class="detail" id="detail"><h2 class="sec">詳しい一覧</h2><div id="tabs"></div></section>`;

  const det = K.details(document.getElementById("tabs"), M);
  app.querySelector(".bundles").addEventListener("click", (e) => {
    const b = e.target.closest("[data-metric]");
    if (!b) return;
    const m = M.METRICS.find((x) => x.id === b.dataset.metric);
    det.open(m.tab, { pin: m.pin || null, chip: m.chip || "all" });
    document.getElementById("detail").scrollIntoView({ behavior: "smooth" });
  });
})();
