"use strict";
// 下段のタブの表とグラフの連動（表の側からだけ）。表の行（tr）に当てたときだけ、同じ data-k のグラフの列（g.col）を強調する。
// グラフに当てても何も変えず、表も動かさない
(() => {
  const COL = "svg.chart g.col[data-k]", ROW = "tbody tr[data-k]";

  function clear(panel) {
    panel.classList.remove("is-linking");
    for (const el of panel.querySelectorAll(".is-hot")) el.classList.remove("is-hot");
  }

  function hot(panel, k) {
    clear(panel);
    panel.classList.add("is-linking");
    const esc = CSS.escape(k);
    for (const el of panel.querySelectorAll(`g.col[data-k="${esc}"], tr[data-k="${esc}"]`)) el.classList.add("is-hot");
  }

  document.addEventListener("pointerover", (e) => {
    const row = e.target.closest(ROW), panel = row?.closest(".panel");
    if (!panel || !panel.querySelector(COL)) return;
    hot(panel, row.dataset.k);
  });
  document.addEventListener("pointerout", (e) => {
    const from = e.target.closest("tbody");
    if (!from || from.contains(e.relatedTarget)) return;
    const panel = from.closest(".panel");
    if (panel) clear(panel);
  });
})();
