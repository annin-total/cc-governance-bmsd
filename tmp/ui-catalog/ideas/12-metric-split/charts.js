// インライン SVG のグラフ部品。どれも SVG 要素を返す。
window.Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const nf = (n, d = 0) => n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
  const el = (tag, attrs = {}, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };
  const svg = (w, h) => el("svg", { viewBox: `0 0 ${w} ${h}`, width: w, role: "img" });

  /** 横棒。rows: {label, value, text, color?} */
  function hbars(rows, { W = 760, labelW = 200, rowH = 34, max } = {}) {
    const m = max ?? Math.max(...rows.map((r) => r.value));
    const barW = W - labelW - 110;
    const g = svg(W, rows.length * rowH + 4);
    rows.forEach((r, i) => {
      const y = i * rowH;
      g.append(el("text", { x: 0, y: y + rowH / 2 + 4, class: "t-ink2", style: "font-size:13px" }, r.label));
      g.append(el("rect", { x: labelW, y: y + 8, width: barW, height: rowH - 16, fill: "var(--hair)" }));
      g.append(el("rect", { x: labelW, y: y + 8, width: Math.max(1, (r.value / m) * barW), height: rowH - 16, fill: r.color || "var(--accent)" }));
      g.append(el("text", { x: labelW + barW + 12, y: y + rowH / 2 + 4, class: "t-ink", style: "font-size:13px" }, r.text));
    });
    return g;
  }

  /** 人数を点で並べる。filled / total */
  function dots(filled, total, { W = 760, per = 16, r = 9, gap = 26 } = {}) {
    const rows = Math.ceil(total / per);
    const g = svg(W, rows * gap + 4);
    for (let i = 0; i < total; i++) {
      const cx = r + 2 + (i % per) * gap, cy = r + 2 + Math.floor(i / per) * gap;
      g.append(el("circle", i < filled
        ? { cx, cy, r, fill: "var(--accent)" }
        : { cx, cy, r: r - 1, fill: "none", stroke: "var(--neutral)", "stroke-width": 1.5 }));
    }
    return g;
  }

  /** 前→今のダンベル。rows: {label, prev, recent}。bands: [{from, to, label}] */
  function dumbbell(rows, { W = 760, labelW = 220, rowH = 40, max = 60, bands = [] } = {}) {
    const H = rows.length * rowH + 40;
    const x = (v) => labelW + (v / max) * (W - labelW - 60);
    const g = svg(W, H);
    for (const b of bands) {
      g.append(el("line", { x1: x(b.at), x2: x(b.at), y1: 0, y2: H - 30, stroke: b.color, "stroke-dasharray": "4 3" }));
      g.append(el("text", { x: x(b.at) + 6, y: H - 34, style: `fill:${b.color};font-weight:700` }, b.label));
    }
    for (let v = 0; v <= max; v += 10) {
      g.append(el("text", { x: x(v), y: H - 8, "text-anchor": "middle" }, v + "%"));
    }
    g.append(el("line", { x1: x(0), x2: x(max), y1: H - 26, y2: H - 26, class: "axis" }));
    rows.forEach((r, i) => {
      const y = i * rowH + rowH / 2;
      g.append(el("line", { x1: x(0), x2: x(max), y1: y, y2: y, class: "grid" }));
      g.append(el("text", { x: 0, y: y + 4, class: "t-ink2", style: "font-size:13px" }, r.label));
      g.append(el("line", { x1: x(r.prev), x2: x(r.recent), y1: y, y2: y, stroke: "var(--accent-2)", "stroke-width": 3 }));
      g.append(el("circle", { cx: x(r.prev), cy: y, r: 5, fill: "var(--page)", stroke: "var(--neutral)", "stroke-width": 1.5 }));
      g.append(el("circle", { cx: x(r.recent), cy: y, r: 6, fill: "var(--accent)" }));
      const right = Math.max(r.prev, r.recent);
      g.append(el("text", { x: x(right) + 12, y: y + 4, class: "t-ink" }, nf(r.recent, 1) + "%"));
    });
    return g;
  }

  /** 日ごとの積み上げ棒。days: [{label, parts:{key: v}}]。keys: [{key, color}] */
  function stacked(days, keys, { W = 900, H = 240, L = 56, highlightFrom = null } = {}) {
    const B = H - 28, T = 8;
    const tot = days.map((d) => keys.reduce((s, k) => s + (d.parts[k.key] || 0), 0));
    const top = Math.max(...tot);
    const step = [50, 100, 200, 250, 500, 1000].find((s) => top / s <= 5);
    const max = Math.ceil(top / step) * step;
    const cw = (W - L) / days.length;
    const y = (v) => B - (v / max) * (B - T);
    const g = svg(W, H);
    for (let v = 0; v <= max; v += step) {
      g.append(el("line", { x1: L, x2: W, y1: y(v), y2: y(v), class: v ? "grid" : "axis" }));
      g.append(el("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, "$" + nf(v)));
    }
    if (highlightFrom != null) {
      const hx = L + highlightFrom * cw;
      g.append(el("rect", { x: hx, y: T - 8, width: W - hx, height: B - T + 8, fill: "var(--accent-soft)" }));
      g.append(el("text", { x: W, y: T + 6, "text-anchor": "end", class: "t-ink2", style: "font-size:11.5px" }, "直近 7 日"));
    }
    days.forEach((d, i) => {
      let acc = 0;
      for (const k of keys) {
        const v = d.parts[k.key] || 0;
        g.append(el("rect", { x: L + i * cw + 1, width: Math.max(1, cw - 2), y: y(acc + v), height: y(acc) - y(acc + v), fill: k.color }));
        acc += v;
      }
      const last = days.length - 1;
      if ((i % 7 === 0 && last - i >= 4) || i === last) {
        g.append(el("text", { x: L + i * cw + cw / 2, y: H - 8, "text-anchor": "middle" }, d.label.slice(5).replace("-", "/")));
      }
    });
    return g;
  }

  /** 小さな折れ線。points: [{label, v}] */
  function line(points, { W = 900, H = 150, L = 56, fmt = (v) => nf(v), color = "var(--accent)", ticks } = {}) {
    const B = H - 28, T = 10;
    const max = Math.max(...points.map((p) => p.v), ...ticks) * 1.08;
    const step = (W - L - 20) / (points.length - 1);
    const x = (i) => L + 10 + i * step;
    const y = (v) => B - (v / max) * (B - T);
    const g = svg(W, H);
    g.append(el("line", { x1: L, x2: W, y1: B, y2: B, class: "axis" }));
    g.append(el("text", { x: L - 8, y: B + 4, "text-anchor": "end" }, "0"));
    for (const t of ticks) {
      g.append(el("line", { x1: L, x2: W, y1: y(t), y2: y(t), class: "grid" }));
      g.append(el("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end" }, fmt(t)));
    }
    g.append(el("polyline", { points: points.map((p, i) => `${x(i)},${y(p.v)}`).join(" "), fill: "none", stroke: color, "stroke-width": 2 }));
    points.forEach((p, i) => {
      g.append(el("circle", { cx: x(i), cy: y(p.v), r: 3, fill: color }));
      g.append(el("text", { x: x(i), y: y(p.v) - 9, "text-anchor": "middle", class: "t-ink2", style: "font-size:11.5px" }, fmt(p.v)));
      if (i % 2 === 0 || i === points.length - 1) g.append(el("text", { x: x(i), y: H - 8, "text-anchor": "middle" }, p.label.slice(5).replace("-", "/")));
    });
    return g;
  }

  return { nf, hbars, dots, dumbbell, stacked, line };
})();
