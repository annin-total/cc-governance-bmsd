"use strict";
// 浮いた小さな札。カードの小さなグラフの点（[data-tip]）と、丸めた値（.exact[data-exact]）に当てると出す。
// タブのグラフには出さない（値は連動した表の行で読む）
(() => {
  const OFFSET = 14;
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  tip.setAttribute("role", "tooltip");

  function place(e) {
    const r = tip.getBoundingClientRect();
    const x = Math.min(e.clientX + OFFSET, window.innerWidth - r.width - 4);
    const y = e.clientY - r.height - OFFSET < 4 ? e.clientY + OFFSET : e.clientY - r.height - OFFSET;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function guide(target) {
    for (const g of document.querySelectorAll(".spark-guide.is-on")) g.classList.remove("is-on");
    const line = target?.closest("svg")?.querySelector(".spark-guide");
    if (!line || target.dataset.gx == null) return;
    line.setAttribute("x1", target.dataset.gx);
    line.setAttribute("x2", target.dataset.gx);
    line.classList.add("is-on");
  }

  // 文言は「日付  値」の 1 行。区切りの 2 つの空白の前を薄く、後ろを濃くする
  function fill(target) {
    const [head, ...rest] = target.matches(".exact") ? ["正確な値", target.dataset.exact] : target.dataset.tip.split("  ");
    const parts = rest.length ? [["span", head], ["b", rest.join("  ")]] : [["b", head]];
    tip.replaceChildren(...parts.map(([tag, text]) => Object.assign(document.createElement(tag), { textContent: text })));
  }

  document.addEventListener("pointerover", (e) => {
    const target = e.target.closest("[data-tip]:not([data-tip='']), .exact[data-exact]");
    if (!target) return;
    fill(target);
    tip.hidden = false;
    guide(target);
    place(e);
  });
  document.addEventListener("pointermove", (e) => { if (!tip.hidden) place(e); });
  document.addEventListener("pointerout", (e) => {
    const from = e.target.closest("[data-tip], .exact[data-exact]");
    if (!from || from.contains(e.relatedTarget)) return;
    tip.hidden = true;
    guide(null);
  });
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(tip));
})();
