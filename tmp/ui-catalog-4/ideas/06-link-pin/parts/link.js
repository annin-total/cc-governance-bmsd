"use strict";
// 下段のタブのグラフと表の連動。グラフの列（g.col）と表の行（tr）を data-k で結び、当てた方と同じ k を強調する。
// 押すと強調を固定し（表の上に「09/23 を表示中 ×」）、同じ棒・行をもう一度押すか × で外す。固定中は当てても変えない。
// グラフから当てた・押したときだけ、行が表の枠の外にあれば枠の中を最小限スクロールする（ページは動かさない）
(() => {
  const F = window.Fmt;
  const COL = "svg.chart g.col[data-k]", ROW = "tbody tr[data-k]";
  const pins = new WeakMap(); // panel → 固定した k

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

  // 札の文言: 行の日付（td.c-date の data-v = 日の番号）。日付のない行（今月のタブの前月だけの営業日）は営業日の番号
  const pinLabel = (panel, k) => {
    const day = panel.querySelector(`tr[data-k="${CSS.escape(k)}"] td.c-date`)?.dataset.v;
    return day ? F.md(Number(day)) : `${k} 営業日目`;
  };

  function unpin(panel) {
    pins.delete(panel);
    panel.classList.remove("is-pinned");
    panel.querySelector(".pin-tag")?.remove();
    clear(panel);
  }

  function pin(panel, k, fromChart) {
    pins.set(panel, k);
    panel.classList.add("is-pinned");
    hot(panel, k, fromChart);
    let tag = panel.querySelector(".pin-tag");
    if (!tag) {
      tag = Object.assign(document.createElement("button"), { type: "button", className: "pin-tag", title: "固定を外す" });
      const filters = panel.querySelector(".filters");
      if (filters) filters.querySelector(".count").before(tag);
      else panel.querySelector(".tscroll").before(tag);
    }
    tag.innerHTML = `<b>${pinLabel(panel, k)}</b> を表示中<span class="x" aria-hidden="true">×</span>`;
  }

  const linked = (el) => {
    const panel = el?.closest(".panel");
    return panel && panel.querySelector(COL) && panel.querySelector(ROW) ? panel : null;
  };

  document.addEventListener("pointerover", (e) => {
    const col = e.target.closest(COL), row = col ? null : e.target.closest(ROW);
    const panel = linked(col || row);
    if (!panel || pins.has(panel)) return;
    hot(panel, (col || row).dataset.k, Boolean(col));
  });
  document.addEventListener("pointerout", (e) => {
    const from = e.target.closest("svg.chart, tbody");
    if (!from || from.contains(e.relatedTarget)) return;
    const panel = from.closest(".panel");
    if (panel && !pins.has(panel)) clear(panel);
  });
  document.addEventListener("click", (e) => {
    const tag = e.target.closest(".pin-tag");
    if (tag) return unpin(tag.closest(".panel"));
    const col = e.target.closest(COL), row = col ? null : e.target.closest(ROW);
    const panel = linked(col || row);
    if (!panel) return;
    const k = (col || row).dataset.k;
    if (pins.get(panel) === k) {
      unpin(panel);
      hot(panel, k, false); // 外したあとも指は同じ棒・行の上にあるので、当てた状態に戻す
    } else pin(panel, k, Boolean(col));
  });
})();
