"use strict";
// 下段のタブのグラフ（サーバの screens/tab_charts.py・month_view.chart と components/charts.html の写し）。
// 棒と表の行は data-link（定義の key の値）で結ぶ。連動は app.js が受け持つ。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup, term } = K;
  const TREND = [540, 132], WIDE = [1100, 180], HIST = [1100, 200];
  const MONTH_ROW_H = 40, MONTH_ROW_MIN_WEEKS = 3, TEXT_X = 5, NAME_Y = 14, VALUE_Y = 31, GAP = 4;

  const col = (b, h, inner) => `<g class="col${b.dim ? " is-partial" : ""}" data-link="${esc(b.key)}"><rect class="hit" x="${b.hit_x}" y="0" width="${b.hit_w}" height="${h}"/>${inner}</g>`;
  const grid = (g, label) => g.ticks.map((t) => `<line class="gridline" x1="${g.left}" x2="${g.w}" y1="${t.y}" y2="${t.y}"/><text x="${g.left - 8}" y="${t.y + 4}" text-anchor="end">${esc(label(t.v))}</text>`).join("");
  const legend = (items, extra = []) => `<div class="legend">${items.map(([cls, name]) => `<span><i class="${cls}"></i>${esc(name)}</span>`).join("")}${extra.map((t) => `<span>${esc(t)}</span>`).join("")}</div>`;

  function barsPanel(title, g) {
    const body = g.bars.map((b) => col(b, g.base, `<rect class="${b.hi ? "bar-hi" : "bar-old"}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="1.5"/>`
      + (g.values ? `<text x="${b.cx}" y="${b.y - 4}" text-anchor="middle">${esc(K.num(b.v))}</text>` : "")
      + (b.label ? `<text x="${b.cx}" y="${g.h - 4}" text-anchor="middle">${esc(b.label)}</text>` : ""))).join("");
    return `<div><h3>${esc(title)}</h3><svg viewBox="0 0 ${g.w} ${g.h}" aria-hidden="true">${body}<line class="axis" x1="0" x2="${g.w}" y1="${g.base}" y2="${g.base}"/></svg></div>`;
  }

  function bars(c, rows, ctx) {
    const key = c.key || "day", dayKeys = c.dayKeys !== false;
    const size = c.panels.length > 1 ? TREND : WIDE;
    const hi = rows.map((r) => (r.period ? r.period === "recent" : true));
    const labels = rows.map((r) => (c.tick ? fill(c.tick, r) : K.md(r[key])));
    const panels = c.panels.map((p) => barsPanel(fill(p.title, ctx), K.geo.bars(rows.map((r) => r[p.field] || 0), labels, rows.map((r) => r[key]), hi, ...size, dayKeys)));
    return { html: panels.length > 1 ? `<div class="two">${panels.join("")}</div>` : panels.join("") };
  }

  function stacked(c, rows, ctx) {
    const key = c.key || "day";
    const series = c.fields ? c.fields.map((f) => f.field) : lookup(ctx, c.series) || [];
    const names = c.fields ? c.fields.map((f) => fill(f.label, ctx)) : series.map((s) => term(c.terms, s));
    const valueOf = (r, s) => (c.fields ? r[s] : (r[c.seriesField] || {})[s]) || 0;
    const g = K.geo.stacked(rows.map((r) => [r[key], series.map((s) => valueOf(r, s))]), ...WIDE, !c.months);
    let note = "", foot = "", viewH = g.h;
    if (c.shade) {
      const recent = g.bars.filter((b, i) => rows[i].period === "recent");
      g.shade_x = recent.length ? recent[0].hit_x : null;
    }
    if (c.months) {
      g.bars.forEach((b, i) => { b.dim = rows[i].partial; });
      const months = lookup(ctx, c.months.src) || [];
      const shown = months.filter((m, i) => i + 1 === months.length || months[i + 1].week - m.week >= MONTH_ROW_MIN_WEEKS);
      foot = shown.map((m) => {
        const x = g.bars[m.week].hit_x;
        const name = K.ym(m.day) + (m.partial && m === months[months.length - 1] ? K.L.MONTH_PARTIAL : "");
        const value = c.months.value === "users" ? `${K.num(m.users)} ${K.L.UNIT.person}` : K.usd(m[c.months.value || "total"]);
        return `<line class="month-sep" x1="${x}" x2="${x}" y1="${g.base}" y2="${g.base + MONTH_ROW_H - GAP}"/><text class="month-name" x="${x + TEXT_X}" y="${g.base + NAME_Y}">${esc(name)}</text><text class="month-total" x="${x + TEXT_X}" y="${g.base + VALUE_Y}">${esc(value)}</text>`;
      }).join("");
      viewH = g.base + MONTH_ROW_H;
      note = months.filter((m) => !shown.includes(m)).map((m) => fill(K.L.MONTH_SKIPPED, m)).join("");
    }
    const tickFmt = c.fmt === "usd" ? K.usd0 : K.num;
    const body = g.bars.map((b) => col(b, g.base, b.segs.map((s) => `<rect class="series-${s.series}" x="${b.x}" y="${s.y}" width="${b.w}" height="${s.h}"/>`).join("")
      + (b.tick ? `<text x="${b.cx}" y="${g.h - 4}" text-anchor="middle">${esc(c.tick ? fill(c.tick, rows[g.bars.indexOf(b)]) : K.md(b.key))}</text>` : ""))).join("");
    const shade = g.shade_x !== null ? `<rect class="spark-shade" x="${g.shade_x}" y="0" width="${g.w - g.shade_x}" height="${g.base}"/>` : "";
    const svg = `<svg class="chart" viewBox="0 0 ${g.w} ${viewH}" aria-hidden="true">${shade}${grid(g, tickFmt)}${foot}${body}</svg>`;
    const shownNames = names.length > 1 || !c.months ? names.map((n, i) => [`series-${i}`, n]) : [];
    return { html: svg + legend(shownNames, (c.legend || []).map((t) => fill(t, ctx))), note };
  }

  function cumSvg(m) {
    const g = m.geo;
    const cols = g.cols.map((c) => `<g class="col" data-link="${esc(c.key)}"><rect class="hit" x="${c.hit_x}" y="0" width="${c.hit_w}" height="${g.h}"/><line class="guide" x1="${c.cx}" x2="${c.cx}" y1="${g.top}" y2="${g.base}"/>`
      + (c.prev_y !== null ? `<circle class="dot-prev" cx="${c.cx}" cy="${c.prev_y}" r="3"/>` : "")
      + (c.y !== null ? `<circle class="${c.actual ? "dot-now" : "dot-fc"}" cx="${c.cx}" cy="${c.y}" r="3"/>` : "")
      + `<text x="${c.cx}" y="${g.h - 4}" text-anchor="middle">${c.label}</text></g>`).join("");
    return `<svg class="chart cum" viewBox="0 0 ${g.w} ${g.h}" aria-hidden="true">${g.bands.map((b) => `<rect class="off" x="${b.x}" y="${g.top}" width="${b.w}" height="${g.base - g.top}"/>`).join("")}${grid(g, K.usd0)}`
      + `${g.prev ? `<polyline class="cum-prev" points="${g.prev}"/>` : ""}${g.fc ? `<polyline class="cum-fc" points="${g.fc}"/>` : ""}${g.now ? `<polyline class="cum-now" points="${g.now}"/>` : ""}${cols}</svg>`
      + `<div class="legend cum-legend"><span><i class="ln now"></i>${esc(m.legend[0])}</span><span><i class="ln fc"></i>${esc(m.legend[1])}</span><span><i class="ln prev"></i>${esc(m.legend[2])}</span>`
      + `${m.off ? `<span><i class="off"></i>${esc(m.off)}</span>` : ""}<span>${esc(m.axis)}</span></div>`;
  }

  function month(c, rows, ctx) {
    const src = lookup(ctx, c.src);
    const legendText = c.legend.map((t) => fill(t, ctx));
    const html = Object.keys(c.axis).map((mode) => `<div data-when="${mode}">${cumSvg({
      geo: K.geo.cum(src.rows.filter((r) => r.mode === mode), K.geo.CUM_TAB), axis: c.axis[mode], legend: legendText,
      off: mode === "cal" ? fill(c.off, ctx) : "",
    })}</div>`).join("");
    return { html, switches: true };
  }

  function hist(c, rows, ctx) {
    const sides = c.sides || ["before", "after"];
    const g = K.geo.hist(rows, sides, ...HIST, K.geo.STACK_PAD_LEFT, K.geo.STACK_PAD_BOTTOM);
    const body = g.bars.map((b) => col(b, g.base, b.segs.map((s, j) => `<rect class="${j === b.segs.length - 1 ? "bar-hi" : "bar-old"}" x="${s.x}" y="${s.y}" width="${g.bw}" height="${s.h}"/>`).join("")
      + `<text x="${b.cx}" y="${g.h - 4}" text-anchor="middle">${esc(c.tick ? fill(c.tick, b.row) : K.binRange(b.key))}</text>`)).join("");
    const names = sides.map((s) => fill((c.terms || {})[s] ?? s, ctx));
    const svg = `<svg viewBox="0 0 ${g.w} ${g.h}" aria-hidden="true">${grid(g, (v) => `${Math.round(v)}%`)}${body}</svg>`;
    return { html: svg + (names.length > 1 ? legend(names.map((n, i) => [i === names.length - 1 ? "bar-hi" : "bar-old", n])) : "") };
  }

  const KINDS = { bars, stacked, month, hist };
  function build(c, rows, ctx) {
    if (!KINDS[c.kind]) { console.error(`kit: 知らないグラフの種類: ${c.kind}`); return null; }
    if (c.kind !== "month" && c.kind !== "bars" && !rows.length) return null;
    return KINDS[c.kind](c, rows, ctx);
  }

  window.KIT = Object.assign(window.KIT || {}, { charts: { build } });
})();
