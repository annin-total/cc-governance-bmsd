window.Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const svg = (w, h, label) => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", `0 0 ${w} ${h}`);
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", label);
    return s;
  };
  const el = (p, tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    p.appendChild(e);
    return e;
  };
  const md = (label) => label.slice(5).replace("-", "/");

  function stackedCost(rows, providers) {
    const days = [...new Set(rows.map((r) => r.day_label))];
    const by = new Map(days.map((d) => [d, {}]));
    rows.forEach((r) => (by.get(r.day_label)[r.provider] = r.cost));
    const W = 860, H = 230, L = 46, R = 8, T = 10, B = 26;
    const totals = days.map((d) => Object.values(by.get(d)).reduce((a, v) => a + v, 0));
    const max = Math.ceil(Math.max(...totals) / 100) * 100;
    const s = svg(W, H, "日ごとのコスト、提供元別の積み上げ");
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const bw = (W - L - R) / days.length;
    for (let v = 0; v <= max; v += 100) {
      el(s, "line", { class: v ? "gl" : "ax", x1: L, x2: W - R, y1: y(v), y2: y(v) });
      el(s, "text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, `$${v}`);
    }
    days.forEach((d, i) => {
      let acc = 0;
      providers.forEach((p, k) => {
        const v = by.get(d)[p.key] || 0;
        if (!v) return;
        const r = el(s, "rect", { class: `hit s${k + 1}`, x: L + i * bw + 1, width: Math.max(bw - 2, 1), y: y(acc + v), height: y(acc) - y(acc + v) });
        el(r, "title", {}, `${d} ${p.name} $${v.toFixed(2)}`);
        acc += v;
      });
      if (d.endsWith("-01") || i === 0 || i === days.length - 1 || d.endsWith("-15"))
        el(s, "text", { x: L + i * bw + bw / 2, y: H - 6, "text-anchor": "middle" }, md(d));
    });
    return s;
  }

  function lines(rows, series, max) {
    const W = 420, H = 230, L = 30, R = 34, T = 14, B = 26;
    const s = svg(W, H, "日ごとの利用者数とセッション数");
    const x = (i) => L + (i / (rows.length - 1)) * (W - L - R);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    for (let v = 0; v <= max; v += 20) {
      el(s, "line", { class: v ? "gl" : "ax", x1: L, x2: W - R, y1: y(v), y2: y(v) });
      el(s, "text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, v);
    }
    series.forEach((se, k) => {
      el(s, "polyline", { class: `l${k + 1}`, points: rows.map((r, i) => `${x(i)},${y(r[se.key])}`).join(" ") });
      const last = rows[rows.length - 1];
      el(s, "circle", { class: `d${k + 1}`, cx: x(rows.length - 1), cy: y(last[se.key]), r: 3 });
      el(s, "text", { class: "strong", x: x(rows.length - 1) + 8, y: y(last[se.key]) + 4 }, last[se.key]);
    });
    rows.forEach((r, i) => {
      if (i % 3 === 1) el(s, "text", { x: x(i), y: H - 6, "text-anchor": "middle" }, md(r.day_label));
    });
    return s;
  }

  function dumbbells(items) {
    const W = 520, rowH = 44, L = 150, R = 96, T = 18;
    const H = T + rowH * items.length + 6;
    const s = svg(W, H, "項目ごとの欠けの割合、前の 7 日と直近 7 日");
    const MAX = 60;
    const x = (v) => L + (Math.min(v, MAX) / MAX) * (W - L - R);
    el(s, "rect", { class: "zone-w", x: x(20), y: T - 6, width: x(50) - x(20), height: H - T });
    el(s, "rect", { class: "zone-n", x: x(50), y: T - 6, width: x(MAX) - x(50), height: H - T });
    [0, 10, 20, 30, 40, 50].forEach((v) => el(s, "text", { x: x(v), y: 8, "text-anchor": "middle" }, `${v}%`));
    el(s, "text", { x: x(MAX), y: 8, "text-anchor": "middle" }, "60%〜");
    el(s, "line", { class: "th w", x1: x(20), x2: x(20), y1: T - 6, y2: H });
    el(s, "line", { class: "th n", x1: x(50), x2: x(50), y1: T - 6, y2: H });
    items.forEach((it, i) => {
      const cy = T + rowH * i + rowH / 2;
      el(s, "text", { class: "jp strong", x: 0, y: cy - 3 }, it.name);
      el(s, "text", { x: 0, y: cy + 13, style: "font-size:11px" }, it.code);
      el(s, "line", { class: "track", x1: x(0), x2: x(MAX), y1: cy, y2: cy });
      el(s, "line", { class: "conn", x1: x(it.prev), x2: x(it.now), y1: cy, y2: cy });
      el(s, "circle", { class: "prev", cx: x(it.prev), cy, r: 4.5 });
      el(s, "circle", { class: "now", cx: x(it.now), cy, r: 4.5 });
      el(s, "text", { class: "strong", x: W - R + 14, y: cy - 1 }, `${it.now.toFixed(1)}%`);
      el(s, "text", { class: "jp", x: W - R + 14, y: cy + 15, style: "font-size:11px" }, `前 ${it.prev.toFixed(1)}%`);
    });
    return s;
  }

  return { stackedCost, lines, dumbbells };
})();
