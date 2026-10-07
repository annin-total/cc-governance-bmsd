"use strict";
// 第 3 弾で足した操作: 状態の絞り込み（?filter= で初期値）・基準日の指定（?asof= に移る。basedate.js）・サマリーの下書きとタイトルの既定。
(() => {
  const K = window.KIT;
  const all = (root, sel) => Array.from(root.querySelectorAll(sel));
  const MATCH = { all: () => true, warn: (s) => s === "warn" || s === "ng", ng: (s) => s === "ng" };

  // 該当しないカードを薄くし、カードがすべて該当しない群も薄くする
  function applyFilter(bar, id) {
    const ok = MATCH[id] || MATCH.all;
    for (const b of all(bar, "[data-filter]")) b.setAttribute("aria-pressed", String(b.dataset.filter === id));
    for (const g of all(document, "main .group")) {
      const cards = all(g, ".card");
      let shown = 0;
      for (const c of cards) {
        const hit = ok(c.dataset.state);
        shown += hit;
        c.classList.toggle("is-dim", !hit);
      }
      g.classList.toggle("is-dim", cards.length > 0 && shown === 0);
    }
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

  // 基準日: 選んだ日へ移る（今日と範囲外は外す）。期間の表示のボタンは、隣の隠れた日付の欄の選択を開く
  function setupAsof() {
    for (const input of all(document, "[data-asof]")) {
      input.addEventListener("change", () => {
        const v = input.value;
        const d = !v || v > input.max || v < input.min ? Infinity : Date.parse(v) / 86400000;
        location.href = K.basedate.hrefAt(d);
      });
    }
    for (const b of all(document, "[data-asof-open]")) {
      b.addEventListener("click", () => {
        const input = b.parentElement.querySelector("[data-asof]");
        try { input.showPicker(); } catch (e) { input.focus(); }
      });
    }
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

  document.addEventListener("DOMContentLoaded", () => { setupFilter(); setupAsof(); setupSummaryForm(); });
})();
