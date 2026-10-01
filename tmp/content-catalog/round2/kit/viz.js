"use strict";
// カードの小さなグラフ（サーバの view._viz・month_view.card・components/charts.html の viz の写しと、足した部品）。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup, term, parts, partsHtml } = K;
  const SHADES = 3;
  const MINI_PAD = 36; // geo.bars の上下の余白（16 + 20）。小さな縦棒では余白を切り落とす
  const hbar = (p, tone = "") => `<span class="hbar ${tone}"><i style="width: ${Math.round(p * 10) / 10}%"></i></span>`;

  function tip(row, value, fmt, unit) {
    const shown = K.FORMATS[fmt || "num"](value) + (unit ? ` ${unit}` : "");
    return fill("end" in row ? K.L.SPARK_TIP_WEEK : K.L.SPARK_TIP, { ...row, value: shown });
  }

  function sparkSvg(g) {
    const hits = g.hits.map((h) => `<rect class="hit" x="${h.x}" y="0" width="${h.w}" height="${g.h}" data-tip="${esc(h.tip)}" data-gx="${h.gx}"><title>${esc(h.tip)}</title></rect>`).join("");
    return `<svg class="spark" viewBox="0 0 ${g.w} ${g.h}" preserveAspectRatio="none" aria-hidden="true">
<rect class="spark-shade" x="${g.shade_x}" y="0" width="${g.w - g.shade_x}" height="${g.h}"/><path class="spark-area" d="${g.area}"/>
<polyline class="spark-old" points="${g.old}" vector-effect="non-scaling-stroke"/><polyline class="spark-new" points="${g.new}" vector-effect="non-scaling-stroke"/>
<circle class="spark-dot" cx="${g.last[0]}" cy="${g.last[1]}" r="3"/><line class="spark-guide" x1="0" x2="0" y1="0" y2="${g.h}" vector-effect="non-scaling-stroke"/>${hits}</svg>`;
  }

  // 小さな縦棒（直近を濃く）。当てると値を出す
  function barsSvg(rows, v, unit) {
    const values = rows.map((r) => r[v.field] || 0);
    const hi = rows.map((r, i) => (r.period ? r.period === "recent" : v.hiLast ? i >= rows.length - v.hiLast : true));
    const g = K.geo.bars(values, rows.map(() => ""), rows.map((r) => r.day ?? r.key), hi, K.geo.SPARK_W, K.geo.SPARK_H + MINI_PAD, false);
    const body = g.bars.map((b, i) => {
      const t = v.tipLabel ? fill(v.tipLabel, rows[i]) + "  " + K.FORMATS[v.fmt || "num"](rows[i][v.field]) + (unit ? ` ${unit}` : "") : tip(rows[i], rows[i][v.field], v.fmt, unit);
      return `<rect class="${b.hi ? "bar-hi" : "bar-old"}" x="${b.x}" y="${b.y - 16}" width="${b.w}" height="${b.h}" rx="1"/><rect class="hit" x="${b.hit_x}" y="0" width="${b.hit_w}" height="${g.h - MINI_PAD}" data-tip="${esc(t)}"><title>${esc(t)}</title></rect>`;
    }).join("");
    return `<svg class="spark" viewBox="0 0 ${g.w} ${g.h - MINI_PAD}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
  }

  function forecast(month, v) {
    const rows = month.rows.filter((r) => r.mode === "bd");
    if (!rows.some((r) => r.cum !== null || r.prev !== null)) return "";
    const stats = v.stats.map(([label, key]) => {
      const change = month[`${key}_change`];
      const ch = change === null ? "" : fill("{v:signed_pct}", { v: change });
      const prev = fill(K.L.FC_PREV, { month: month.prev_month, value: K.usd(month[`prev_${key}`]) });
      return `<span class="fc-stat"><span class="fc-label">${esc(label)}</span>
<span class="fc-now">${partsHtml(parts("{v:usd}", { v: month[key] }))}${ch ? `<span class="change${change > 0 ? " up" : ""}">${esc(ch)}</span>` : ""}</span><span class="fc-prev">${esc(prev)}</span></span>`;
    }).join("");
    const g = K.geo.cum(rows, K.geo.CUM_MINI);
    const cols = g.cols.map((c, i) => {
      const r = rows[i];
      const head = fill(r.day !== null ? K.L.FC_TIP : K.L.FC_TIP_N, { ...r, n: i + 1 });
      let now = r.cum !== null ? K.usd(r.cum) : "";
      if (now && !r.actual) now = K.L.FC_FORECAST.replace("{}", now);
      const prev = r.prev !== null ? fill(K.L.FC_PREV, { month: month.prev_month, value: K.usd(r.prev) }) : "";
      const t = head + "  " + [now, prev].filter(Boolean).join(" · ");
      return `<rect class="hit" x="${c.hit_x}" y="0" width="${c.hit_w}" height="${g.h}" data-tip="${esc(t)}" data-gx="${c.cx}"><title>${esc(t)}</title></rect>`;
    }).join("");
    return `<span class="fc-stats">${stats}</span><svg class="fc-cum" viewBox="0 0 ${g.w} ${g.h}" preserveAspectRatio="none" aria-hidden="true">
${g.prev ? `<polyline class="fc-cum-prev" points="${g.prev}" vector-effect="non-scaling-stroke"/>` : ""}${g.fc ? `<polyline class="fc-cum-fc" points="${g.fc}" vector-effect="non-scaling-stroke"/>` : ""}${g.now ? `<polyline class="fc-cum-now" points="${g.now}" vector-effect="non-scaling-stroke"/>` : ""}${g.last ? `<circle class="spark-dot" cx="${g.last[0]}" cy="${g.last[1]}" r="2.5"/>` : ""}<line class="spark-guide" x1="0" x2="0" y1="0" y2="${g.h}" vector-effect="non-scaling-stroke"/>${cols}</svg>`;
  }

  function histSvg(rows, v) {
    const sides = v.sides || ["before", "after"];
    const g = K.geo.hist(rows, sides, K.geo.SPARK_W, K.geo.SPARK_H, 0, 0);
    const segs = g.bars.map((b) => b.segs.map((s, j) => `<rect class="${j === b.segs.length - 1 ? "bar-hi" : "bar-old"}" x="${s.x}" y="${s.y}" width="${g.bw}" height="${s.h}"/>`).join("")).join("");
    const names = sides.map((s) => fill((v.terms || {})[s] ?? s, v.ctx));
    const legend = names.length > 1 ? `<span class="legend">${names.map((n, i) => `<span><i class="${i === names.length - 1 ? "bar-hi" : "bar-old"}"></i>${esc(n)}</span>`).join("")}</span>` : "";
    return `<svg class="spark" viewBox="0 0 ${g.w} ${g.h}" preserveAspectRatio="none" aria-hidden="true">${segs}</svg>${legend}`;
  }

  // 行ごとの横棒と右端の値。`den` は 100（百分率）・"max"（列の最大）・場所（分母の値）
  function rates(rows, v, ctx, wide) {
    const field = v.field;
    const top = v.den === "max" ? Math.max(0, ...rows.map((r) => r[field] || 0)) : v.den ? lookup(ctx, v.den) : 100;
    const shown = v.limit ? rows.slice(0, v.limit) : rows;
    const body = shown.map((r) => {
      const label = v.label ? fill(v.label, r) : term(v.terms, r.key);
      const right = (v.right || []).map((t, i, all) => `<span class="num${i === all.length - 1 ? " strong" : ""}">${esc(fill(t, r))}</span>`).join("");
      return `<span class="rate"><span>${esc(label)}</span>${hbar(K.geo.pct(r[field], top))}${right}</span>`;
    }).join("");
    return `<span class="rates${wide ? " wide" : ""}">${body}</span>`;
  }

  function render(card, ctx) {
    const v = { ...card.viz, ctx };
    const src = v.src ? lookup(ctx, v.src) : null;
    if (v.kind === "spark") {
      const rows = src || [];
      const g = K.geo.spark(rows.map((r) => r[v.field]), (ctx.period || {}).days || rows.length);
      if (!g) return "";
      g.hits = g.hits.map((h, i) => ({ ...h, tip: tip(rows[i], rows[i][v.field], v.fmt, card.unit) }));
      return sparkSvg(g);
    }
    if (v.kind === "bars") return barsSvg(v.limit ? src.slice(-v.limit) : src, v, card.unit);
    if (v.kind === "forecast") return forecast(src, v);
    if (v.kind === "meter") {
      const den = typeof v.den === "number" ? v.den : lookup(ctx, v.den);
      return `<span class="meter ${v.tone || ""}"><i style="width: ${Math.round(K.geo.pct(src, den) * 10) / 10}%"></i></span>`;
    }
    if (v.kind === "pair") {
      const keys = Object.keys(v.terms);
      const values = keys.map((k) => (v.field ? (src[k] || {})[v.field] : src[k]));
      const top = Math.max(0, ...values.map((x) => x || 0));
      return keys.map((k, i) => `<span class="pair"><span>${esc(fill(v.terms[k], ctx))}</span>${hbar(K.geo.pct(values[i], top), i ? "" : "ghost")}</span>`).join("");
    }
    if (v.kind === "hist") return src && src.length ? histSvg(src, v) : "";
    if (v.kind === "stack") {
      if (!src || !src.length) return "";
      const pairs = v.field ? src.map((r) => [r.key, r[v.field]]) : src;
      const ps = pairs.map(([k, n], i) => ({ label: term(v.terms, k), value: n, cls: `${v.tone}-${i % SHADES}` }));
      return `<span class="stack">${ps.map((p) => `<i class="${p.cls}" style="flex: ${p.value}"></i>`).join("")}</span>
<span class="legend">${ps.map((p) => `<span><i class="${p.cls}"></i>${esc(p.label)} ${K.num(p.value)}</span>`).join("")}</span>`;
    }
    if (v.kind === "rates") return rates(src || [], v, ctx, card.wide);
    console.error(`kit: 知らないグラフの種類: ${v.kind}`);
    return "";
  }

  window.KIT = Object.assign(window.KIT || {}, { viz: { render, hbar } });
})();
