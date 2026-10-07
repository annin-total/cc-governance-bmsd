"use strict";
// 案 51 の一覧の折りたたみ: data-fold="N" を持つ一覧（表の定義の fold。既定は C.TABLE_FOLD_ROWS）は、初めは N 行まで出し、
// 残りは「さらに表示（残り N 件）」で開く（「閉じる」で戻す）。N 行以下の一覧には何も出さない。並びは変えない。
(() => {
  const K = window.KIT;
  const itemsOf = (box) => Array.from(box.querySelectorAll(":scope > table > tbody > tr, :scope > .m-item"));

  function setup(box) {
    const n = Number(box.dataset.fold), items = itemsOf(box), rest = items.length - n;
    if (!(n > 0) || rest <= 0) return;
    const btn = document.createElement("button");
    Object.assign(btn, { type: "button", className: "fold-more" });
    btn.dataset.foldMore = "";
    const paint = (open) => {
      items.slice(n).forEach((e) => e.toggleAttribute("data-folded", !open));
      btn.textContent = open ? K.L.FOLD_CLOSE : K.L.FOLD_MORE.replace("{}", K.num(rest));
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", () => paint(btn.getAttribute("aria-expanded") !== "true"));
    box.after(btn);
    paint(false);
  }

  document.addEventListener("DOMContentLoaded", () => document.querySelectorAll("[data-fold]").forEach(setup));
})();
