"use strict";
// 既定のツールチップ: グラフの点・棒に当てると、カーソルの近くに小さな札で値を出す
(() => {
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  let hot = [];
  const clear = () => { hot.forEach((e) => e.classList.remove("is-hot")); hot = []; tip.hidden = true; };
  document.addEventListener("DOMContentLoaded", () => document.body.append(tip));
  document.addEventListener("pointermove", (e) => {
    const h = e.target.closest && e.target.closest(".hit");
    const svg = h && !h.closest("[data-no-tip]") && h.closest("[data-s]");
    const pt = svg && C.series[svg.dataset.s][h.dataset.i];
    clear();
    if (!pt) return;
    hot = Array.from(svg.querySelectorAll(`[data-i="${h.dataset.i}"]:not(.hit)`));
    hot.forEach((el) => el.classList.add("is-hot"));
    tip.innerHTML = `<span>${pt.label}</span><b>${pt.text}</b>`;
    tip.hidden = false;
    const r = tip.getBoundingClientRect(), gap = 12;
    const x = e.clientX + gap + r.width > innerWidth - gap ? e.clientX - gap - r.width : e.clientX + gap;
    const y = e.clientY - gap - r.height < gap ? e.clientY + gap : e.clientY - gap - r.height;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
})();
