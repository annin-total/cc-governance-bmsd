"use strict";
// 案 07: 札を出さず、当てた日に縦の線を引き、カード見出しの横（タブではグラフの見出しの横）の値をその日に切り替える
(() => {
  const OFF = "—";
  let hotDay = null;

  function posOf(svg, i) {
    const el = svg.querySelector(`[data-i="${i}"]:not(.hit)`);
    if (!el) return null;
    return el.tagName === "circle" ? +el.getAttribute("cx") : +el.getAttribute("x") + +el.getAttribute("width") / 2;
  }
  function line(svg) {
    let l = svg.querySelector(".xhair");
    if (!l) {
      const band = Boolean(svg.querySelector(".guide"));
      l = document.createElementNS("http://www.w3.org/2000/svg", band ? "rect" : "line");
      l.setAttribute("class", band ? "xhair xband" : "xhair");
      l.setAttribute("vector-effect", "non-scaling-stroke");
      (svg.querySelector(".guide") || svg.querySelector(".marks")).prepend(l);
    }
    return l;
  }
  function slot(svg) {
    const card = svg.closest(".card");
    if (card) return card.querySelector(".k-label .go");
    const h3 = svg.parentElement.querySelector("h3");
    let r = h3.querySelector(".read");
    if (!r) { r = document.createElement("span"); r.className = "read"; h3.append(r); }
    return r;
  }
  function show(scope, day) {
    for (const svg of scope.querySelectorAll("svg[data-s]")) {
      const pts = C.series[svg.dataset.s], i = pts.findIndex((p) => p.day === day), s = slot(svg), l = line(svg);
      svg.querySelectorAll(".is-hot").forEach((e) => e.classList.remove("is-hot"));
      if (!s) continue;
      s.dataset.base ??= s.textContent;
      s.classList.add("reading");
      const x = i < 0 ? null : posOf(svg, i);
      l.style.display = x == null ? "none" : "";
      if (x != null) {
        const h = svg.viewBox.baseVal.height;
        if (l.tagName === "rect") {
          const w = svg.viewBox.baseVal.width / pts.length;
          l.setAttribute("x", (x - w / 2).toFixed(1)); l.setAttribute("width", w.toFixed(1)); l.setAttribute("y", 0); l.setAttribute("height", 112);
        } else { l.setAttribute("x1", x); l.setAttribute("x2", x); l.setAttribute("y1", 0); l.setAttribute("y2", h); }
        svg.querySelectorAll(`[data-i="${i}"]:not(.hit)`).forEach((e) => e.classList.add("is-hot"));
      }
      const pt = i < 0 ? null : pts[i];
      const lb = pt ? pt.label : C.fmt.md(day) + C.fmt.wd(day);
      s.innerHTML = `<span>${svg.closest(".card") ? lb.replace(/（.）$/, "").replace(/^\d{4}\//, "") : lb}</span><b>${pt ? pt.text : OFF}</b>`;
    }
  }
  function hide(scope) {
    for (const s of scope.querySelectorAll(".reading")) { s.classList.remove("reading"); s.textContent = s.dataset.base || ""; }
    scope.querySelectorAll(".xhair").forEach((l) => (l.style.display = "none"));
    scope.querySelectorAll(".is-hot").forEach((e) => e.classList.remove("is-hot"));
  }
  const scopeOf = (el) => el.closest("#kpis, .p-chart");
  document.addEventListener("pointermove", (e) => {
    const h = e.target.closest && e.target.closest(".hit");
    const svg = h && h.closest("svg[data-s]");
    if (!svg) { if (hotDay != null) { document.querySelectorAll("#kpis, .p-chart").forEach(hide); hotDay = null; } return; }
    const day = C.series[svg.dataset.s][h.dataset.i].day;
    if (day === hotDay) return;
    hotDay = day;
    show(scopeOf(svg), day);
  });
  C.hooks.cards.push((cards) => { cards.splice(3, 0, C.forecastCard()); return cards; });
})();
