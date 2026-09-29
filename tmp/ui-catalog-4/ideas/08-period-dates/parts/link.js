"use strict";
// 下段のタブのグラフと表の連動。グラフの列（g.col）と表の行（tr）を data-k で結び、当てた方と同じ k を強調する。
// グラフから当てたときだけ、行が表の枠の外にあれば枠の中を最小限スクロールする（ページは動かさない）
(() => {
  const COL = "svg.chart g.col[data-k]", ROW = "tbody tr[data-k]";

  function clear(panel) {
    panel.classList.remove("is-linking");
    for (const el of panel.querySelectorAll(".is-hot")) el.classList.remove("is-hot");
  }

  // 見えている範囲 = 表の枠（見出しの行の下）と画面の重なり。その外にある行だけを、近い端まで動かす
  function reveal(row) {
    const box = row.closest(".tscroll");
    if (!box) return;
    const head = box.querySelector("thead")?.getBoundingClientRect().height || 0;
    const b = box.getBoundingClientRect(), r = row.getBoundingClientRect();
    const top = Math.max(b.top + head, 0), bottom = Math.min(b.bottom, window.innerHeight);
    if (bottom - top < r.height) return;
    if (r.top < top) box.scrollTop -= top - r.top;
    else if (r.bottom > bottom) box.scrollTop += r.bottom - bottom;
  }

  function hot(panel, k, fromChart) {
    clear(panel);
    panel.classList.add("is-linking");
    const esc = CSS.escape(k);
    for (const el of panel.querySelectorAll(`g.col[data-k="${esc}"], tr[data-k="${esc}"]`)) el.classList.add("is-hot");
    const row = panel.querySelector(`tr[data-k="${esc}"]`);
    if (fromChart && row && !row.hidden) reveal(row);
  }

  document.addEventListener("pointerover", (e) => {
    const col = e.target.closest(COL), row = col ? null : e.target.closest(ROW);
    const panel = (col || row)?.closest(".panel");
    if (!panel || !panel.querySelector(COL) || !panel.querySelector(ROW)) return;
    hot(panel, (col || row).dataset.k, Boolean(col));
  });
  document.addEventListener("pointerout", (e) => {
    const from = e.target.closest("svg.chart, tbody");
    if (!from || from.contains(e.relatedTarget)) return;
    const panel = from.closest(".panel");
    if (panel) clear(panel);
  });
})();
