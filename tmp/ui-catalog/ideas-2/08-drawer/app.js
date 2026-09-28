// 08 詳細は右の引き出し: 上段のカードは動かさず、押すと右から一覧と絞り込みが出る。
(() => {
  const M = window.M, K = window.K, app = document.getElementById("app");

  const group = (g) => `<section class="kgroup"><h2 class="glabel">${g}</h2><div class="cards">${M.METRICS.filter((m) => m.group === g).map((m) => K.card(m)).join("")}</div></section>`;
  const launch = M.TABS.map((t) => `<button type="button" data-tab="${t.id}">${t.label}${t.badge != null ? `<span class="badge ${t.tone || ""}">${t.badge}</span>` : ""}</button>`).join("");
  const csv = M.page === "overview" ? `<button type="button" class="btn quiet">利用明細（CSV）を取り込む</button>` : "";

  app.innerHTML = K.head(M, csv) + `<div class="kgroups">${M.groups.map(group).join("")}</div>`
    + `<nav class="launch" aria-label="詳しい一覧"><span>詳しい一覧</span>${launch}</nav>`;
  document.body.insertAdjacentHTML("beforeend", `<div class="scrim" hidden></div>
    <aside class="drawer" hidden aria-labelledby="dr-title">
      <header class="dr-head"><div><p class="dr-kicker">${M.title}</p><h2 id="dr-title">詳しい一覧</h2></div><button type="button" class="dr-close" aria-label="閉じる">×</button></header>
      <div class="dr-body" id="tabs"></div>
    </aside>`);

  const drawer = document.querySelector(".drawer"), scrim = document.querySelector(".scrim");
  // 引き出しの幅に収めるため、利用者ごとの表から端末数の列を外す（端末名は利用者の下に出ている）
  const NARROW_DROP = ["tcount"];
  const derive = (t) => ({ ...t, cols: t.cols.filter((c) => !NARROW_DROP.includes(c.key)) });
  const det = K.details(document.getElementById("tabs"), M, { derive, onPick: () => mark(null) });
  const mark = (id) => app.querySelectorAll("[data-metric]").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.metric === id)));
  const open = (tab, preset, metricId = null) => {
    det.open(tab, preset);
    mark(metricId);
    drawer.hidden = scrim.hidden = false;
    drawer.querySelector(".dr-close").focus();
  };
  const close = () => { drawer.hidden = scrim.hidden = true; mark(null); history.replaceState(null, "", location.pathname); };

  app.addEventListener("click", (e) => {
    const c = e.target.closest("[data-metric]"), t = e.target.closest("[data-tab]");
    if (c) { const m = M.METRICS.find((x) => x.id === c.dataset.metric); open(m.tab, { pin: m.pin || null, chip: m.chip || "all" }, m.id); }
    else if (t) open(t.dataset.tab, {});
  });
  drawer.querySelector(".dr-close").onclick = close;
  scrim.onclick = close;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) close(); });
  if (/t=\w+/.test(location.hash)) { drawer.hidden = scrim.hidden = false; }
})();
