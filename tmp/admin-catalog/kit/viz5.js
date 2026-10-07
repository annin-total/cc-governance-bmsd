"use strict";
// 案 51 のコストのカードのグラフの部品（concepts5.md の 4.3）: 日ごとの面と影（area・shadow）・折れ線（line）・営業日の棒と前の平均（bdbars・avg）・
// マス目（grid）。分布・内訳の帯・累積は viz5b.js。値は p[期間].r5.series（日ごとのコスト・人数・営業日か・前か直近か）。
(() => {
  const K = window.KIT;
  const { esc, lookup } = K;
  const W = 300, H = 56, PAD = 4;
  const r1 = (v) => Math.round(v * 10) / 10;
  const svg = (body, cls = "") => `<svg class="k5 ${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
  const cap = (text) => `<span class="cap k5-cap"><span>${esc(text)}</span></span>`;
  const scaleY = (top) => (v) => r1(PAD + (H - 2 * PAD) * (1 - (v || 0) / (top || 1)));
  const xs = (n) => (i) => r1(n > 1 ? (i / (n - 1)) * W : W / 2);
  const points = (vals, x, y) => vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  // 1 日の値: field が "per_user" なら、その日のコスト ÷ その日の人数
  const valueOf = (r, field) => (field === "per_user" ? (r.users ? r.cost / r.users : 0) : r.cost);
  const series = (ctx) => lookup(ctx, "r5[series]") || [];
  const recent = (ctx) => series(ctx).filter((r) => r.period === "recent");
  const prevRows = (ctx) => series(ctx).filter((r) => r.period === "prev");

  // 前と直近を同じ軸に並べる（12 か月の値は目録の暦月の棒になり、ここへは来ない）。data-days は軸の日数、k5-old・k5-new は前と直近の印
  const frame = (body, days, cls = "") => svg(body, cls).replace("<svg ", `<svg data-days="${days}" `);
  const ends = (rows) => `<span class="k5-ends"><span>${esc(K.md(rows[0].day))}</span><span>${esc(K.md(rows[rows.length - 1].day))}</span></span>`;
  const span = (rows) => rows[rows.length - 1].day - rows[0].day + 1;

  // area: 前と直近の日ごとの線。直近の区間だけ地を薄く敷き、線の下を塗る。前の区間の線は灰
  // shadow（K7）: 軸は直近だけにし、前の期間の線を曜日をそろえて薄く重ねる
  function area(v, ctx) {
    if (v.shadow) return shadowArea(ctx);
    const rows = series(ctx), vals = rows.map((r) => r.cost), cut = rows.findIndex((r) => r.period === "recent");
    const y = scaleY(Math.max(...vals)), x = xs(vals.length);
    const pts = (a, b) => points(vals.slice(a, b), (i) => x(i + a), y);
    const body = `<rect class="k5-band" x="${x(cut)}" y="0" width="${r1(W - x(cut))}" height="${H}"/>`
      + `<path class="k5-area" d="M${x(cut)},${H} L${pts(cut).replace(/ /g, " L")} L${W},${H} Z"/>`
      + `<polyline class="k5-old" points="${pts(0, cut + 1)}" vector-effect="non-scaling-stroke"/><polyline class="k5-line k5-new" points="${pts(cut)}" vector-effect="non-scaling-stroke"/>`;
    return frame(body, span(rows)) + ends(rows) + cap(K.L.K5.area);
  }

  function shadowArea(ctx) {
    const now = recent(ctx), old = prevRows(ctx);
    const vals = now.map((r) => r.cost), olds = old.map((r) => r.cost);
    const y = scaleY(Math.max(...vals, ...olds)), x = xs(vals.length);
    const shadow = olds.length === vals.length ? `<polyline class="k5-shadow" points="${points(olds, x, y)}" vector-effect="non-scaling-stroke"/>` : "";
    const body = `<path class="k5-area" d="M0,${H} L${points(vals, x, y).replace(/ /g, " L")} L${W},${H} Z"/>${shadow}`
      + `<polyline class="k5-line" points="${points(vals, x, y)}" vector-effect="non-scaling-stroke"/>`;
    return svg(body) + ends(now) + cap(K.L.K5.area_shadow);
  }

  // 営業日だけの行（前と直近）と、前の期間の 1 営業日あたりの平均
  function bdValues(v, ctx) {
    const rows = series(ctx).filter((r) => r.bd), old = rows.filter((r) => r.period === "prev");
    const avg = v.field === "per_user" ? lookup(ctx, "r3[cost][prev_per_user_bd]") : old.reduce((s, r) => s + r.cost, 0) / (old.length || 1);
    return { rows, vals: rows.map((r) => valueOf(r, v.field)), avg, days: span(series(ctx)) };
  }

  // bdbars: 前と直近の営業日ごとの棒（前は灰）。avg で前の期間の 1 営業日あたりの平均を点線で重ね、超えた直近の棒を濃くする
  function bdbars(v, ctx) {
    const { rows, vals, avg, days } = bdValues(v, ctx);
    const top = Math.max(...vals, v.avg ? avg : 0), y = scaleY(top), step = W / Math.max(vals.length, 1), bw = step * 0.62;
    const isNew = (i) => rows[i].period === "recent";
    const cls = (x, i) => (!isNew(i) ? "bar-old k5-old" : !v.avg || x > avg ? "bar-hi k5-new" : "bar-mid k5-new");
    const over = vals.filter((x, i) => isNew(i) && x > avg).length, m = rows.filter((r) => r.period === "recent").length;
    const bars = vals.map((x, i) => `<rect class="${cls(x, i)}" x="${r1(i * step + (step - bw) / 2)}" y="${y(x)}" width="${r1(bw)}" height="${r1(H - PAD - y(x))}"><title>${esc(`${K.md(rows[i].day)}  ${K.usd(x)}`)}</title></rect>`).join("");
    const line = v.avg ? `<line class="k5-avg" x1="0" x2="${W}" y1="${y(avg)}" y2="${y(avg)}" vector-effect="non-scaling-stroke"/>` : "";
    const text = v.avg ? K.L.K5.bdbars_avg.replace("{n}", over).replace("{m}", m) : K.L.K5.bdbars;
    return frame(bars + line, days) + ends(series(ctx)) + cap(v.field === "per_user" ? `${K.L.K5.per_user} · ${text}` : text);
  }

  // line: 前と直近の営業日ごとの値の線（塗らない。前の区間は灰）
  function line(v, ctx) {
    const { rows, vals, days } = bdValues(v, ctx);
    const y = scaleY(Math.max(...vals)), x = xs(vals.length), cut = rows.findIndex((r) => r.period === "recent");
    const pts = (a, b) => points(vals.slice(a, b), (i) => x(i + a), y);
    const dots = vals.map((val, i) => `<circle class="${i < cut ? "k5-dot-old" : "k5-dot"}" cx="${x(i)}" cy="${y(val)}" r="2"/>`).join("");
    const body = `<polyline class="k5-old" points="${pts(0, cut + 1)}" vector-effect="non-scaling-stroke"/><polyline class="k5-line k5-new" points="${pts(cut)}" vector-effect="non-scaling-stroke"/>${dots}`;
    return frame(body, days) + ends(series(ctx)) + cap(`${K.L.K5.per_user} · ${K.L.K5.line}`);
  }

  // grid: 曜日（行）× 週（列）の濃淡。12 か月は窓の 365 日、7・28 日は前と直近
  function grid(v, ctx) {
    const rows = series(ctx), top = Math.max(1, ...rows.map((r) => r.cost));
    const wd = (d) => (new Date(d * 86400000).getUTCDay() + 6) % 7;
    const first = rows[0].day - wd(rows[0].day), weeks = Math.ceil((rows[rows.length - 1].day - first + 1) / 7);
    const cw = Math.min(W / weeks, H / 7), ch = cw, steps = 4; // マスは正方形に近く、左から詰める
    const cells = rows.map((r) => {
      const level = r.cost ? Math.min(steps, Math.ceil((r.cost / top) * steps)) : 0;
      const col = Math.floor((r.day - first) / 7);
      return `<rect class="k5-cell lv-${level}${r.period === "prev" ? " is-prev" : ""}" x="${r1(col * cw + 0.5)}" y="${r1(wd(r.day) * ch + 0.5)}" width="${r1(cw - 1)}" height="${r1(ch - 1)}"><title>${esc(`${K.md(r.day)}（${K.weekday(r.day)}）  ${K.usd(r.cost)}`)}</title></rect>`;
    }).join("");
    return svg(cells, "k5-grid") + cap(K.L.K5.grid);
  }

  window.KIT = Object.assign(window.KIT || {}, { viz5: { ...(window.KIT.viz5 || {}), area, bdbars, line, grid, svg, cap, scaleY, xs, points, W, H, PAD, r1 } });
})();
