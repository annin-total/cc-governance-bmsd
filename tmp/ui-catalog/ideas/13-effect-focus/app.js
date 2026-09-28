(() => {
  const E = window.CTX.effect;
  const THRESHOLD = 120000;
  const NS = "http://www.w3.org/2000/svg";
  const nf = (n, d = 0) => n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = (n) => "$" + nf(n, 2);
  const man = (n) => nf(n / 10000, 0) + " 万";
  const pct = (n) => nf(n, 1) + "%";

  const el = (tag, attrs = {}, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };
  const svg = (w, h) => el("svg", { viewBox: `0 0 ${w} ${h}`, role: "img" });

  // --- 集計 ---
  const side = (f) => {
    const rows = E.study.filter(f);
    const n = rows.reduce((s, r) => s + r.denominator, 0);
    return {
      n,
      cost: rows.reduce((s, r) => s + r.cost * r.denominator, 0) / n,
      tokens: rows.reduce((s, r) => s + r.tokens * r.denominator, 0) / n,
    };
  };
  const pre = side((r) => r.relative_day < 0);
  const post = side((r) => r.relative_day > 0);

  const over = (rows) => {
    const total = rows.reduce((s, r) => s + r.count, 0);
    const hi = rows.filter((r) => r.bin >= THRESHOLD).reduce((s, r) => s + r.count, 0);
    return { total, hi, rate: (hi / total) * 100 };
  };
  const pc = { b: over(E.context_pre_compact.before), a: over(E.context_pre_compact.after) };
  const st = { b: over(E.context_stop.before), a: over(E.context_stop.after) };

  // --- 冒頭の答え ---
  document.getElementById("refval").textContent = E.reference_value + "%";
  document.getElementById("ans-work").innerHTML =
    `圧縮直前のコンテキストが 12 万トークン以上だった記録は、<span class="was">${pct(pc.b.rate)}</span>` +
    `（${nf(pc.b.hi)} / ${nf(pc.b.total)} 件）から <em>${pct(pc.a.rate)}</em>（${nf(pc.a.hi)} / ${nf(pc.a.total)} 件）になった。`;
  const costChg = (post.cost / pre.cost - 1) * 100;
  document.getElementById("ans-cost").innerHTML =
    `1 人 1 日あたりのコストは ${usd(pre.cost)} から <em>${usd(post.cost)}</em>（${nf(costChg, 0).replace("-", "−")}%）。` +
    `ただし時期の変動を含む。`;

  // --- 図 1: スロープ ---
  const slopes = [
    { grp: "設定の働き", cls: "work", title: "圧縮直前が 12 万以上", unit: "トークン数が 12 万以上の記録の割合",
      b: pc.b.rate, a: pc.a.rate, fmt: pct, chg: "pt",
      frac: `${nf(pc.b.hi)} / ${nf(pc.b.total)} 件 → ${nf(pc.a.hi)} / ${nf(pc.a.total)} 件` },
    { grp: "", cls: "work", title: "応答終了時が 12 万以上", unit: "トークン数が 12 万以上の記録の割合",
      b: st.b.rate, a: st.a.rate, fmt: pct, chg: "pt",
      frac: `${nf(st.b.hi)} / ${nf(st.b.total)} 件 → ${nf(st.a.hi)} / ${nf(st.a.total)} 件` },
    { grp: "コスト（時期の変動を含む）", cls: "cost", title: "1 人 1 日あたりコスト", unit: "USD",
      b: pre.cost, a: post.cost, fmt: usd, chg: "%",
      frac: `のべ ${nf(pre.n)} 人日 → ${nf(post.n)} 人日` },
    { grp: "", cls: "cost", title: "1 人 1 日あたりトークン", unit: "入力とキャッシュの読み書き",
      b: pre.tokens, a: post.tokens, fmt: man, chg: "%",
      frac: `のべ ${nf(pre.n)} 人日 → ${nf(post.n)} 人日` },
  ];
  const slopeHost = document.getElementById("slopes");
  for (const s of slopes) {
    const W = 190, H = 150, x1 = 50, x2 = 140, top = 14, bot = 122;
    const max = Math.max(s.b, s.a) * 1.08;
    const y = (v) => bot - (v / max) * (bot - top);
    const g = svg(W, H);
    g.append(el("line", { x1, x2: x1, y1: top - 6, y2: bot, class: "axis" }));
    g.append(el("line", { x1: x2, x2, y1: top - 6, y2: bot, class: "axis" }));
    g.append(el("line", { x1: x1 - 4, x2: x2 + 4, y1: bot, y2: bot, class: "axis" }));
    const col = s.cls === "work" ? "var(--after)" : "var(--ink2)";
    g.append(el("line", { x1, y1: y(s.b), x2, y2: y(s.a), stroke: col, "stroke-width": 2.5 }));
    g.append(el("circle", { cx: x1, cy: y(s.b), r: 4.5, fill: "var(--before)" }));
    g.append(el("circle", { cx: x2, cy: y(s.a), r: 4.5, fill: col }));
    g.append(el("text", { x: x1 - 10, y: y(s.b) + 4, "text-anchor": "end", class: "lbl-strong" }, s.fmt(s.b)));
    g.append(el("text", { x: x2 + 10, y: y(s.a) + 4, class: "lbl-strong" }, s.fmt(s.a)));
    g.append(el("text", { x: x1, y: H - 6, "text-anchor": "middle" }, "適用前"));
    g.append(el("text", { x: x2, y: H - 6, "text-anchor": "middle" }, "適用後"));
    const d = s.chg === "pt" ? s.a - s.b : (s.a / s.b - 1) * 100;
    const div = document.createElement("div");
    div.className = "slope " + s.cls;
    div.innerHTML = `<div class="grp">${s.grp}</div><h3>${s.title}</h3><div class="unit">${s.unit}</div>`;
    div.append(g);
    div.insertAdjacentHTML("beforeend",
      `<div class="chg"><b>${nf(d, 1).replace("-", "−")}</b>${s.chg === "pt" ? "ポイント" : "%"}</div><div class="frac">${s.frac}</div>`);
    slopeHost.append(div);
  }

  // --- 図 2: 重ねたヒストグラム ---
  const hists = [
    { title: "圧縮直前", hook: "PreCompact", data: E.context_pre_compact },
    { title: "応答終了時", hook: "Stop", data: E.context_stop },
  ];
  const allBins = [...new Set(hists.flatMap((h) => [...h.data.before, ...h.data.after].map((r) => r.bin)))].sort((a, b) => a - b);
  const binW = E.context_bin;
  const nBins = allBins[allBins.length - 1] / binW + 1;
  const share = (rows) => {
    const t = rows.reduce((s, r) => s + r.count, 0);
    const m = new Map(rows.map((r) => [r.bin, r.count]));
    return Array.from({ length: nBins }, (_, i) => ((m.get(i * binW) || 0) / t) * 100);
  };
  const histHost = document.getElementById("hists");
  const tblHost = document.getElementById("hist-tables");
  for (const h of hists) {
    const sb = share(h.data.before), sa = share(h.data.after);
    const W = 460, H = 250, L = 34, R = 8, T = 18, B = 218;
    const ymax = Math.ceil(Math.max(...sb, ...sa) / 5) * 5;
    const cw = (W - L - R) / nBins;
    const x = (i) => L + i * cw;
    const y = (v) => B - (v / ymax) * (B - T);
    const g = svg(W, H);
    for (let v = 0; v <= ymax; v += 5) {
      g.append(el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v ? "grid" : "axis" }));
      if (v % 10 === 0) g.append(el("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, v + "%"));
    }
    let d = `M${x(0)},${B}`;
    sb.forEach((v, i) => { d += ` L${x(i)},${y(v)} L${x(i + 1)},${y(v)}`; });
    d += ` L${x(nBins)},${B}`;
    g.append(el("path", { d, fill: "var(--before-soft)", stroke: "none" }));
    sa.forEach((v, i) => {
      if (v > 0) g.append(el("rect", { x: x(i) + 3, width: cw - 6, y: y(v), height: B - y(v), fill: "var(--after)", opacity: .88 }));
    });
    g.append(el("path", { d, fill: "none", stroke: "var(--before)", "stroke-width": 2, "stroke-linejoin": "round" }));
    const tx = x(THRESHOLD / binW);
    g.append(el("line", { x1: tx, x2: tx, y1: T - 10, y2: B, stroke: "var(--ink)", "stroke-dasharray": "4 3", "stroke-width": 1.2 }));
    g.append(el("text", { x: tx + 6, y: T - 2, class: "lbl-strong", style: "font-size:12px" }, "12 万トークン"));
    for (let i = 0; i <= nBins; i += 2) {
      g.append(el("text", { x: x(i), y: B + 18, "text-anchor": "middle" }, i ? nf((i * binW) / 10000) + " 万" : "0"));
    }
    const box = document.createElement("div");
    box.className = "hist";
    const tb = h.data.before.reduce((s, r) => s + r.count, 0), ta = h.data.after.reduce((s, r) => s + r.count, 0);
    box.innerHTML = `<h3>${h.title}<small>${h.hook} · 適用前 ${nf(tb)} 件 / 適用後 ${nf(ta)} 件</small></h3>`;
    box.append(g);
    histHost.append(box);

    const mb = new Map(h.data.before.map((r) => [r.bin, r.count])), ma = new Map(h.data.after.map((r) => [r.bin, r.count]));
    let rows = "";
    for (let i = 0; i < nBins; i++) {
      const b = mb.get(i * binW), a = ma.get(i * binW);
      rows += `<tr><td>${nf(i * 2)}–${nf(i * 2 + 2)} 万</td><td>${b ?? "—"}</td><td>${pct(sb[i])}</td><td>${a ?? "—"}</td><td>${pct(sa[i])}</td></tr>`;
    }
    tblHost.insertAdjacentHTML("beforeend",
      `<div><table><caption style="text-align:left;font-weight:700;font-size:13px">${h.title}</caption><thead><tr><th>トークン数</th><th>適用前 件数</th><th>割合</th><th>適用後 件数</th><th>割合</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }

  // --- 図 3: 日ごと ---
  const S = E.study, span = E.span;
  const W = 860, L = 70, R = 28;
  const step = (W - L - R) / (span * 2);
  const xd = (d) => L + (d + span) * step;
  const panels = [
    { key: "cost", label: "1 人あたりコスト", fmt: (v) => "$" + nf(v), top: 34, h: 124, ticks: [5, 10], mean: [pre.cost, post.cost], mfmt: usd },
    { key: "tokens", label: "1 人あたりトークン", fmt: (v) => nf(v / 10000) + " 万", top: 206, h: 100, ticks: [500000, 1000000, 1500000], mean: [pre.tokens, post.tokens], mfmt: man },
  ];
  const H3 = 410;
  const g3 = svg(W, H3);
  const zx = xd(0);
  g3.append(el("rect", { x: zx - step / 2, y: 8, width: step, height: 362, fill: "var(--wash)" }));
  g3.append(el("text", { x: zx, y: 400, "text-anchor": "middle", style: "font-size:11px" }, "0 日目 除外"));
  for (const p of panels) {
    const vals = S.map((r) => r[p.key]);
    const max = Math.max(...vals, ...p.ticks) * 1.08;
    const y = (v) => p.top + p.h - (v / max) * p.h;
    const lab = el("text", { x: 0, y: p.top - 12, class: "lbl-strong", style: "font-size:12.5px" }, p.label);
    lab.append(el("tspan", { dx: 14, style: "fill:var(--before);font-weight:700" }, "平均 適用前 " + p.mfmt(p.mean[0])));
    lab.append(el("tspan", { dx: 10, style: "fill:var(--muted);font-weight:400" }, "→"));
    lab.append(el("tspan", { dx: 10, style: "fill:var(--after);font-weight:700" }, "適用後 " + p.mfmt(p.mean[1])));
    g3.append(lab);
    g3.append(el("line", { x1: L, x2: W - R, y1: p.top + p.h, y2: p.top + p.h, class: "axis" }));
    g3.append(el("text", { x: L - 8, y: p.top + p.h + 4, "text-anchor": "end" }, "0"));
    for (const t of p.ticks) {
      g3.append(el("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: "grid" }));
      g3.append(el("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end" }, p.fmt(t)));
    }
    for (const [sgn, m, col] of [[-1, p.mean[0], "var(--before)"], [1, p.mean[1], "var(--after)"]]) {
      const xa = sgn < 0 ? xd(-span) : xd(1), xb = sgn < 0 ? xd(-1) : xd(span);
      g3.append(el("line", { x1: xa, x2: xb, y1: y(m), y2: y(m), stroke: col, "stroke-dasharray": "5 4", "stroke-width": 1.5 }));
    }
    for (const part of [S.filter((r) => r.relative_day < 0), S.filter((r) => r.relative_day > 0)]) {
      const col = part[0].relative_day < 0 ? "var(--before)" : "var(--after)";
      g3.append(el("polyline", { points: part.map((r) => `${xd(r.relative_day)},${y(r[p.key])}`).join(" "), fill: "none", stroke: col, "stroke-width": 1.6, "stroke-opacity": .75 }));
      for (const r of part) g3.append(el("circle", { cx: xd(r.relative_day), cy: y(r[p.key]), r: 2.8, fill: col }));
    }
  }
  const dTop = 336, dH = 26, dMax = Math.max(...S.map((r) => r.denominator));
  g3.append(el("text", { x: 0, y: dTop + 8, class: "lbl-strong", style: "font-size:12px" }, "対象者数"));
  g3.append(el("text", { x: 0, y: dTop + 24 }, `${Math.min(...S.map((r) => r.denominator))}–${dMax} 人`));
  for (const r of S) {
    const hh = (r.denominator / dMax) * dH;
    g3.append(el("rect", { x: xd(r.relative_day) - step * .3, y: dTop + dH - hh, width: step * .6, height: hh, fill: "var(--line)" }));
  }
  for (const d of [-14, -7, -1, 1, 7, 14]) {
    g3.append(el("text", { x: xd(d), y: dTop + dH + 18, "text-anchor": "middle" }, (d > 0 ? "+" : "−") + Math.abs(d) + " 日"));
  }
  document.getElementById("daily").append(g3);

  let tr = "";
  for (const r of S) tr += `<tr><td>${r.relative_day_label}</td><td>${r.denominator} 人</td><td>${usd(r.cost)}</td><td>${nf(r.tokens)}</td></tr>`;
  document.getElementById("daily-table").innerHTML =
    `<table><thead><tr><th>守り始めてからの日数</th><th>対象者数</th><th>1 人あたりコスト</th><th>1 人あたりトークン</th></tr></thead><tbody>${tr}</tbody></table>`;
})();
