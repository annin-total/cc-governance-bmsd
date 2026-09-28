"use strict";
// 案 08: タブのグラフと表を連動させる。棒に当てると表の同じ行を、行に当てると棒を強調する（カードは既定の札）
(() => {
  const HOT = "is-hot", TICK_GAP = 40;
  let hot = [];
  const clear = () => { hot.forEach((e) => e.classList.remove(HOT, "has-hot")); hot = []; };
  const mark = (els) => {
    for (const e of els) {
      e.classList.add(HOT);
      const svg = e.closest("svg");
      if (svg) { svg.classList.add("has-hot"); hot.push(svg); }
    }
    hot.push(...els);
  };
  document.getElementById("daily").dataset.noTip = "";
  function reveal(tr) {
    const box = tr.closest(".tscroll"), top = tr.offsetTop - box.querySelector("thead").offsetHeight;
    if (top < box.scrollTop || tr.offsetTop + tr.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - tr.offsetHeight * 2;
  }

  // 日ごとのコスト: サーバが描いた棒（<title> に日付）から、日付 → 棒と x の対応を作る
  const costSvg = document.querySelector("#cost .p-chart svg");
  const costBars = new Map();
  for (const r of costSvg.querySelectorAll("rect")) {
    const t = r.querySelector("title");
    if (!t) continue;
    const day = t.textContent.slice(0, 10);
    r.dataset.date = day;
    t.remove();
    const e = costBars.get(day) || { x: +r.getAttribute("x") + +r.getAttribute("width") / 2, rects: [] };
    e.rects.push(r);
    costBars.set(day, e);
  }
  // 目盛りは週ごとで重なるので、各月の最初の週だけ残す（今の画面の課題。この案の範囲外）
  let lastMonth = "", lastX = -Infinity;
  for (const t of costSvg.querySelectorAll('text[text-anchor="middle"]')) {
    const m = t.textContent.slice(0, 2), x = +t.getAttribute("x");
    if (m === lastMonth || x - lastX < TICK_GAP) t.remove(); else { lastMonth = m; lastX = x; }
  }
  const costDays = Array.from(costBars.entries()).sort((a, b) => a[1].x - b[1].x);
  const guide = document.createElementNS("http://www.w3.org/2000/svg", "line");
  guide.setAttribute("class", "xhair");
  guide.setAttribute("y1", 0);
  guide.setAttribute("y2", 158);
  guide.style.display = "none";
  costSvg.prepend(guide);
  function costHot(day) {
    const e = costBars.get(day);
    if (!e) return;
    mark(e.rects);
    guide.setAttribute("x1", e.x); guide.setAttribute("x2", e.x); guide.style.display = "";
  }

  document.addEventListener("pointermove", (e) => {
    const t = e.target;
    clear();
    guide.style.display = "none";
    const h = t.closest && t.closest("#daily .hit");
    if (h) {
      const svg = h.closest("svg[data-s]"), day = C.series[svg.dataset.s][h.dataset.i].day;
      mark(Array.from(document.querySelectorAll(`#daily [data-i="${h.dataset.i}"]:not(.hit)`)));
      const tr = document.querySelector(`#daily tr[data-day="${day}"]`);
      if (tr && !tr.hidden) { mark([tr]); reveal(tr); }
      return;
    }
    if (t.closest && t.closest("#cost .p-chart svg")) {
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(costSvg.getScreenCTM().inverse());
      let best = costDays[0];
      for (const d of costDays) if (Math.abs(d[1].x - pt.x) < Math.abs(best[1].x - pt.x)) best = d;
      costHot(best[0]);
      const tr = document.querySelector(`#cost tr[data-q="${best[0]}"]`);
      if (tr && !tr.hidden) { mark([tr]); reveal(tr); }
      return;
    }
    const tr = t.closest && t.closest("#daily tbody tr, #cost tbody tr");
    if (!tr) return;
    mark([tr]);
    if (tr.dataset.day) {
      const s = C.series[document.querySelector("#daily svg[data-s]").dataset.s], i = s.findIndex((p) => String(p.day) === tr.dataset.day);
      mark(Array.from(document.querySelectorAll(`#daily [data-i="${i}"]:not(.hit)`)));
    } else costHot(tr.dataset.q);
  });
  C.hooks.cards.push((cards) => { cards.splice(3, 0, C.forecastCard()); return cards; });
})();
