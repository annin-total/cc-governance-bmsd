"use strict";
// 数値の書式・小さなグラフの SVG・ツールチップ。値は window.DATA 由来の数値と日付だけを埋め込む
(() => {
  const DAY_MS = 86400000;
  const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
  const PROVIDER = { "aws-bedrock": "AWS Bedrock", "google-vertex": "Google Vertex AI" };

  const date = (day) => new Date(day * DAY_MS);
  const md = (day) => { const d = date(day); return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`; };
  const ymd = (day) => date(day).toISOString().slice(0, 10);
  const wd = (day) => `（${WEEK[date(day).getUTCDay()]}）`;
  const isMonday = (day) => date(day).getUTCDay() === 1;
  const toDay = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

  const int = (n) => Math.round(n).toLocaleString("ja-JP");
  const usd = (n) => (Math.abs(n) >= 1000 ? `$${int(n)}` : `$${n.toFixed(2)}`);
  const usdWhole = (n) => `$${int(n)}`;
  const usdCol = (values) => (Math.max(...values) >= 1000 ? usdWhole : (n) => `$${n.toFixed(2)}`);
  const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);
  const signed = (n, digits = 0, unit = "") => (n === 0 ? `±0${unit}` : `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}${unit}`);
  const tip = (lines) => ` data-tip="${lines.join("\n")}"`;

  // カードの折れ線。split 以降が直近（濃い部分）。split が無ければ全体を 1 本で描く
  function spark(values, tips, split) {
    const W = 300, H = 48, n = values.length;
    const lo = Math.min(...values), hi = Math.max(...values);
    const x = (i) => (i * W) / (n - 1);
    const y = (v) => 44 - ((v - lo) / (hi - lo || 1)) * 40;
    const pts = (a, b) => values.slice(a, b).map((v, i) => `${x(a + i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const s = split ?? 0;
    const step = W / (n - 1);
    const hits = values.map((v, i) => `<rect class="hit" x="${(x(i) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" data-gx="${x(i).toFixed(1)}"${tip(tips[i])}/>`).join("");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
  ${split ? `<rect class="spark-shade" x="${x(s).toFixed(1)}" y="0" width="${(W - x(s)).toFixed(1)}" height="${H}"/>` : ""}
  <path class="spark-area" d="M${x(s).toFixed(1)},${H} L${pts(s, n).replaceAll(" ", " L")} L${W},${H} Z"/>
  ${split ? `<polyline class="spark-old" points="${pts(0, s + 1)}" vector-effect="non-scaling-stroke"/>` : ""}
  <polyline class="spark-new" points="${pts(s, n)}" vector-effect="non-scaling-stroke"/>
  <circle class="spark-dot" cx="${W}" cy="${y(values[n - 1]).toFixed(1)}" r="3"/>
  <line class="guide" x1="0" x2="0" y1="0" y2="${H}" vector-effect="non-scaling-stroke"/>${hits}
</svg>`;
  }

  // タブの縦棒。hiFrom 以降を濃くする。ラベルは本数が少ないときだけ棒の上に出す
  function bars(values, { hiFrom = 0, ticks, tips, labels = values.length <= 14, wide = false, dimLast = false }) {
    const W = wide ? 1100 : 540, base = 112, top = 16, n = values.length, step = W / n;
    const w = Math.min(step * 0.62, 24), max = Math.max(...values) || 1;
    const cols = values.map((v, i) => {
      const cx = step * i + step / 2, h = ((base - top) * v) / max;
      return `<g class="col${dimLast && i === n - 1 ? " partial" : ""}"><rect class="${i >= hiFrom ? "bar-hi" : "bar-old"}" x="${(cx - w / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"/>`
        + (labels ? `<text x="${cx.toFixed(1)}" y="${(base - h - 4).toFixed(1)}" text-anchor="middle">${v}</text>` : "")
        + (ticks[i] ? `<text x="${cx.toFixed(1)}" y="128" text-anchor="middle">${ticks[i]}</text>` : "")
        + `<rect class="hit" x="${(step * i).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${base}"${tip(tips[i])}/></g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} 132" aria-hidden="true">${cols}<line class="axis" x1="0" x2="${W}" y1="${base}" y2="${base}"/></svg>`;
  }

  // 提供元ごとの積み上げ棒（コスト）。shadeFrom 以降の背景を薄く塗って直近を示す
  function stack(items, { ticks, tips, shadeFrom, dimLast = false }) {
    const W = 1100, L = 44, base = 158, top = 8, n = items.length, step = (W - L) / n;
    const w = Math.min(step * 0.62, 28);
    const max = Math.max(...items.map((it) => it.total));
    const unit = [50, 100, 200, 500, 1000, 2000, 5000].find((u) => max / u <= 4);
    const yMax = Math.ceil(max / unit) * unit;
    const y = (v) => base - ((base - top) * v) / yMax;
    let out = "";
    for (let v = 0; v <= yMax; v += unit) out += `<line class="gridline" x1="${L}" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${usdWhole(v)}</text>`;
    if (shadeFrom != null) out = `<rect class="spark-shade" x="${(L + step * shadeFrom).toFixed(1)}" y="${top}" width="${(step * (n - shadeFrom)).toFixed(1)}" height="${base - top}"/>` + out;
    items.forEach((it, i) => {
      const cx = L + step * i + step / 2;
      let acc = 0, g = "";
      it.parts.forEach((p, k) => {
        g += `<rect class="series-${k}" x="${(cx - w / 2).toFixed(1)}" y="${y(acc + p).toFixed(1)}" width="${w.toFixed(1)}" height="${(y(acc) - y(acc + p)).toFixed(1)}"/>`;
        acc += p;
      });
      if (ticks[i]) g += `<text x="${cx.toFixed(1)}" y="176" text-anchor="middle">${ticks[i]}</text>`;
      out += `<g class="col${dimLast && i === n - 1 ? " partial" : ""}">${g}<rect class="hit" x="${(L + step * i).toFixed(1)}" y="${top}" width="${step.toFixed(1)}" height="${base - top}"${tip(tips[i])}/></g>`;
    });
    return `<svg viewBox="0 0 ${W} 180" aria-hidden="true">${out}</svg>`;
  }

  // ツールチップ: data-tip を持つ要素に当てると、カーソルの近くに札を出す（1 行目を太字）
  function bindTips() {
    const el = document.createElement("div");
    el.className = "tip";
    el.hidden = true;
    document.body.appendChild(el);
    let guide = null;
    document.addEventListener("mousemove", (e) => {
      const t = e.target.closest?.("[data-tip]");
      if (guide) { guide.style.opacity = 0; guide = null; }
      if (!t) { el.hidden = true; return; }
      const [head, ...rest] = t.dataset.tip.split("\n");
      el.replaceChildren();
      const b = document.createElement("b"); b.textContent = head; el.appendChild(b);
      for (const r of rest) { const s = document.createElement("span"); s.textContent = r; el.appendChild(s); }
      el.hidden = false;
      const pad = 14, r = el.getBoundingClientRect();
      const left = e.clientX + pad + r.width > innerWidth ? e.clientX - pad - r.width : e.clientX + pad;
      el.style.left = `${left}px`;
      el.style.top = `${Math.max(4, e.clientY - r.height - pad)}px`;
      if (t.dataset.gx) {
        guide = t.ownerSVGElement.querySelector(".guide");
        guide.setAttribute("x1", t.dataset.gx); guide.setAttribute("x2", t.dataset.gx); guide.style.opacity = 1;
      }
    });
  }

  window.Charts = { spark, bars, stack, bindTips };
  window.Fmt = { md, ymd, wd, isMonday, toDay, int, usd, usdWhole, usdCol, tokens, signed, PROVIDER };
})();
