"use strict";
// 足した操作: 状態の絞り込み（?filter= で初期値）・サマリーの下書きとタイトルの既定。基準日の指定は calendar.js。
(() => {
  const K = window.KIT;
  const all = (root, sel) => Array.from(root.querySelectorAll(sel));
  const MATCH = { all: () => true, warn: (s) => s === "warn" || s === "ng", ng: (s) => s === "ng" };

  // 該当しないカードを薄くする
  function applyFilter(bar, id) {
    const ok = MATCH[id] || MATCH.all;
    for (const b of all(bar, "[data-filter]")) b.setAttribute("aria-pressed", String(b.dataset.filter === id));
    for (const c of all(document, "main .card")) c.classList.toggle("is-dim", !ok(c.dataset.state));
    const url = new URL(location.href);
    if (id === "all") url.searchParams.delete("filter"); else url.searchParams.set("filter", id);
    history.replaceState(null, "", url);
  }

  function setupFilter() {
    const bar = document.querySelector("[data-state-filter]");
    if (!bar) return;
    bar.addEventListener("click", (e) => { const b = e.target.closest("[data-filter]"); if (b) applyFilter(bar, b.dataset.filter); });
    const first = new URLSearchParams(location.search).get("filter");
    if (first && MATCH[first]) applyFilter(bar, first);
  }

  function setupSummaryForm() {
    const form = document.querySelector("[data-summary-form]");
    if (!form) return;
    const asof = form.querySelector("[data-sum-asof]");
    const title = form.querySelector("[data-sum-title]");
    asof.addEventListener("change", () => {
      if (asof.value < asof.min || asof.value > asof.max) asof.value = asof.max;
      title.value = K.summary.titleOf(Date.parse(asof.value) / 86400000);
    });
    form.querySelector("[data-sum-draft]").addEventListener("click", () => { form.querySelector("[data-sum-body]").value = K.summary.draft(); });
  }

  document.addEventListener("DOMContentLoaded", () => { setupFilter(); setupSummaryForm(); });
})();
