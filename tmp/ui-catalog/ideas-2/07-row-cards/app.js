// 07 横長の行カード: 指標 1 つ = 横長の 1 行（状態・名前・値・差・小さなグラフ）。縦に積むだけなので項目の増減に強い。
(() => {
  const M = window.M, K = window.K, app = document.getElementById("app");

  const row = (m) => `<button type="button" class="rowcard" data-metric="${m.id}" aria-pressed="false">
      <span class="r-mark">${K.mark(m.tone)}</span>
      <span class="r-name"><b>${m.label}</b><span class="scope">${m.scope}</span></span>
      <span class="r-value">${K.valueHtml(m)}</span>
      <span class="r-sub">${K.deltaHtml(m)}<span>${m.sub}</span><span class="r-rule">基準: ${K.ruleText(m.rule, m.unit)}</span></span>
      <span class="r-viz">${m.viz()}</span>
      <span class="r-go" aria-hidden="true">›</span>
    </button>`;
  const group = (g) => `<section class="rgroup"><h2 class="glabel">${g}</h2><div class="rows">${M.METRICS.filter((m) => m.group === g).map(row).join("")}</div></section>`;

  const csv = M.page === "overview" ? `<button type="button" class="btn quiet">利用明細（CSV）を取り込む</button>` : "";
  app.innerHTML = K.head(M, csv) + `<div class="rgroups">${M.groups.map(group).join("")}</div>`
    + `<section class="detail" id="detail"><div id="tabs"></div></section>`;

  const det = K.details(document.getElementById("tabs"), M);
  app.querySelector(".rgroups").addEventListener("click", (e) => {
    const b = e.target.closest("[data-metric]");
    if (!b) return;
    const m = M.METRICS.find((x) => x.id === b.dataset.metric);
    app.querySelectorAll(".rowcard").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    det.open(m.tab, { pin: m.pin || null, chip: m.chip || "all" });
    document.getElementById("detail").scrollIntoView({ behavior: "smooth" });
  });
})();
