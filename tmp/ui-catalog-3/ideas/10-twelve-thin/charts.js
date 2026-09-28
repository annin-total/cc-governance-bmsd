"use strict";
// カードの折れ線とタブの棒グラフ。座標の約束（300×48・540×132）は今の charts.html に合わせる
const C = (() => {
  const { s } = L;
  const f1 = (n) => Number(n.toFixed(1));

  // 点・棒ごとの当たり判定。data-i が同じ印を強調し、data-tip を浮いた札に出す
  const hit = (i, x, y, w, hgt, tip) => s("rect", { class: "hit", x: f1(x), y, width: f1(w), height: hgt, "data-i": i, "data-tip-head": tip[0], "data-tip": tip[1] });

  // split 番目から後ろを直近として濃く描く。split = 0 なら全体を 1 本で描く
  function spark(vals, split, tips) {
    const W = 300, H = 48, n = vals.length;
    const lo = Math.min(...vals), span = Math.max(...vals) - lo || 1;
    const pt = vals.map((v, i) => [f1((i * W) / (n - 1)), f1(44 - ((v - lo) / span) * 40)]);
    const line = (a) => a.map((p) => p.join(",")).join(" ");
    const svg = s("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" });
    if (split > 0) {
      const x0 = pt[split][0];
      const area = `M${x0},${H} L${pt.slice(split).map((p) => p.join(",")).join(" L")} L${W},${H} Z`;
      svg.append(s("rect", { class: "spark-shade", x: x0, y: 0, width: f1(W - x0), height: H }),
        s("path", { class: "spark-area", d: area }),
        s("polyline", { class: "spark-old", points: line(pt.slice(0, split + 1)), "vector-effect": "non-scaling-stroke" }));
    }
    svg.append(s("polyline", { class: "spark-new", points: line(pt.slice(split)), "vector-effect": "non-scaling-stroke" }),
      s("circle", { class: "spark-dot", cx: pt[n - 1][0], cy: pt[n - 1][1], r: 3 }));
    const step = W / (n - 1);
    pt.forEach(([x, y], i) => svg.append(s("circle", { class: "spark-hover", cx: x, cy: y, r: 3, "data-i": i })));
    pt.forEach(([x], i) => svg.append(hit(i, x - step / 2, 0, step, H, tips[i])));
    return svg;
  }

  // o: { hi: bool[], labels: bool, tick: (i) => 文字列 | null, tips }
  function dayBars(vals, o) {
    const W = 540, n = vals.length, step = W / n, bw = step * 0.62, max = Math.max(...vals) || 1;
    const svg = s("svg", { viewBox: `0 0 ${W} 132`, "aria-hidden": "true" });
    vals.forEach((v, i) => {
      const hgt = (v / max) * 96, x = i * step + (step - bw) / 2, cx = f1(i * step + step / 2);
      svg.append(s("rect", { class: o.hi[i] ? "bar-hi" : "bar-old", x: f1(x), y: f1(112 - hgt), width: f1(bw), height: f1(hgt), rx: 1.5, "data-i": i }));
      if (o.labels) svg.append(s("text", { x: cx, y: f1(108 - hgt), "text-anchor": "middle" }, String(v)));
      const t = o.tick(i);
      if (t) svg.append(s("text", { x: cx, y: 128, "text-anchor": "middle" }, t));
    });
    svg.append(s("line", { class: "axis", x1: 0, x2: W, y1: 112, y2: 112 }));
    vals.forEach((v, i) => svg.append(hit(i, i * step, 0, step, 112, o.tips[i])));
    return svg;
  }

  return { spark, dayBars, hit, f1 };
})();
