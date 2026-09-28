"use strict";
// 数値の書式・DOM の組み立て・小さなグラフ・ツールチップ。値は window.DATA から受け取り、textContent と属性だけで描く
const UI = (() => {
  const DAY = 86400000;
  const WEEK = "日月火水木金土";
  const SVGNS = "http://www.w3.org/2000/svg";
  // 丸めた値に正確な値のツールチップを付けるか（案 14 だけ true にする）
  const opts = { exactTips: false };

  const nf = (n, d = 0) => n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
  const iso = (day) => new Date(day * DAY).toISOString().slice(0, 10);
  const md = (day) => iso(day).slice(5).replace("-", "/");
  const wd = (day) => WEEK[new Date(day * DAY).getUTCDay()];
  const mdw = (day) => `${md(day)}（${wd(day)}）`;
  const dayOf = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / DAY);
  const signed = (n, d = 0) => (n > 0 ? "+" : n < 0 ? "−" : "±") + nf(Math.abs(n), d);

  // 値の部品: pre（前に付く単位）・n（数字）・unit（後ろの単位）・gap（単位の前に空白）・exact（丸める前の値）
  const fmt = {
    usd: (v) => (v >= 1000 ? fmt.usdInt(v) : { pre: "$", n: nf(v, 2) }),
    // 表の列に 1,000 以上の値があるときは、列の全部を整数にそろえる
    usdInt: (v) => ({ pre: "$", n: nf(Math.round(v)), exact: `$${nf(v, 2)}` }),
    tok: (v) => {
      const exact = `${nf(v)} トークン`;
      if (v < 1e6) return { n: nf(Math.round(v / 1e3)), unit: "k", exact };
      const m = v / 1e6;
      return { n: m < 100 ? nf(m, 1) : nf(Math.round(m)), unit: "M", exact };
    },
    count: (v, unit, d = 0) => ({ n: nf(v, d), unit, gap: true }),
    pct: (v) => ({ n: nf(v, 1), unit: "%" }),
  };
  const text = (p) => `${p.pre || ""}${p.n}${p.unit ? (p.gap ? " " : "") + p.unit : ""}`;

  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k);
    return el;
  }
  function s(tag, attrs = {}, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
    for (const k of kids.flat()) if (k) el.append(k);
    return el;
  }

  // 値を 1 つ描く。big は カードの大きな数字（単位は .u）
  function val(p, big = false) {
    const tip = opts.exactTips && p.exact ? { "data-tip": p.exact, "data-tip-k": "正確な値" } : {};
    const el = h("span", { class: "nv", ...tip });
    if (p.pre) el.append(h("span", { class: "unit pre" }, p.pre));
    el.append(h("span", { class: "n" }, p.n));
    if (p.unit && big) el.append(h("span", { class: "u" }, p.unit));
    else if (p.unit) el.append(p.gap ? " " : "", h("span", { class: "unit" }, p.unit));
    return el;
  }

  // カードの折れ線。split 以降を直近として濃く塗る（split が無ければ全体を 1 本で描く）
  function spark(vals, { split = null, tips = [] } = {}) {
    const W = 300, H = 48, top = 4, bottom = 44;
    const max = Math.max(...vals), min = Math.min(...vals);
    const x = (i) => (vals.length === 1 ? W : (i * W) / (vals.length - 1));
    const y = (v) => bottom - ((v - min) / (max - min || 1)) * (bottom - top);
    const pts = (a, b) => vals.slice(a, b).map((v, k) => `${x(a + k).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const last = vals.length - 1;
    const kids = [];
    const from = split ?? 0;
    if (split !== null) kids.push(s("rect", { class: "spark-shade", x: x(split).toFixed(1), y: 0, width: (W - x(split)).toFixed(1), height: H }));
    kids.push(s("path", { class: "spark-area", d: `M${x(from).toFixed(1)},${H} L${pts(from).split(" ").join(" L")} L${W},${H} Z` }));
    if (split !== null) kids.push(s("polyline", { class: "spark-old", points: pts(0, split + 1), "vector-effect": "non-scaling-stroke" }));
    kids.push(s("polyline", { class: "spark-new", points: pts(from), "vector-effect": "non-scaling-stroke" }));
    kids.push(s("circle", { class: "spark-dot", cx: x(last).toFixed(1), cy: y(vals[last]).toFixed(1), r: 3 }));
    const step = W / Math.max(vals.length - 1, 1);
    vals.forEach((_, i) => {
      const t = tips[i];
      if (t) kids.push(s("rect", { class: "hit", x: Math.max(0, x(i) - step / 2).toFixed(1), y: 0, width: step.toFixed(1), height: H, "data-tip-k": t[0], "data-tip": t[1] }));
    });
    return s("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" }, kids);
  }

  // タブの棒グラフ。cls(i) で棒の色、ticks は { i, label } の配列、labels が真なら棒の上に値を書く
  function bars(vals, { w = 540, h: H = 132, cls = () => "bar-hi", ticks = [], labels = false, label = String, tips = [] } = {}) {
    const base = H - 20, top = 16, slot = w / vals.length, bw = slot * 0.62;
    const max = Math.max(...vals) || 1;
    const kids = [];
    vals.forEach((v, i) => {
      const bh = (v / max) * (base - top), bx = i * slot + (slot - bw) / 2, cx = i * slot + slot / 2;
      const t = tips[i] || [];
      kids.push(s("rect", { class: cls(i), x: bx.toFixed(1), y: (base - bh).toFixed(1), width: bw.toFixed(1), height: bh.toFixed(1), rx: 1.5 }));
      if (labels) kids.push(s("text", { x: cx.toFixed(1), y: (base - bh - 4).toFixed(1), "text-anchor": "middle" }, label(v)));
      kids.push(s("rect", { class: "hit", x: (i * slot).toFixed(1), y: 0, width: slot.toFixed(1), height: base, "data-tip-k": t[0], "data-tip": t[1] }));
    });
    for (const t of ticks) kids.push(s("text", { x: (t.i * slot + slot / 2).toFixed(1), y: H - 4, "text-anchor": "middle" }, t.label));
    kids.push(s("line", { class: "axis", x1: 0, x2: w, y1: base, y2: base }));
    return s("svg", { viewBox: `0 0 ${w} ${H}`, "aria-hidden": "true" }, kids);
  }

  // カーソルの近くに浮く札。[data-tip] に当てると出る（data-tip-k は薄く前に置く見出し）
  function tooltips() {
    if (document.querySelector(".tip")) return;
    const tip = h("div", { class: "tip", role: "tooltip", hidden: "" });
    document.body.append(tip);
    const place = (e) => {
      const gap = 14, r = tip.getBoundingClientRect();
      let left = e.clientX + gap, top = e.clientY - r.height - gap / 2;
      if (left + r.width > innerWidth - 8) left = e.clientX - r.width - gap;
      if (top < 8) top = e.clientY + gap;
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    document.addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-tip]");
      if (!t) { tip.hidden = true; return; }
      tip.replaceChildren(t.dataset.tipK ? h("span", {}, t.dataset.tipK) : "", h("b", {}, t.dataset.tip));
      tip.hidden = false;
      place(e);
    });
    document.addEventListener("pointermove", (e) => { if (!tip.hidden) place(e); });
    document.addEventListener("pointerleave", () => { tip.hidden = true; });
  }

  // 本物の画面の <title> つきの図形（日ごとのコスト）も同じ札で見せる
  function titlesToTips(root = document) {
    for (const t of root.querySelectorAll("svg rect > title")) {
      const [date, ...rest] = t.textContent.split(" ");
      const day = dayOf(date);
      t.parentElement.dataset.tipK = `${mdw(day)} ${rest.slice(0, -1).join(" ")}`;
      t.parentElement.dataset.tip = rest[rest.length - 1];
      t.remove();
    }
  }

  return { opts, nf, iso, md, wd, mdw, dayOf, signed, fmt, text, h, s, val, spark, bars, tooltips, titlesToTips };
})();
