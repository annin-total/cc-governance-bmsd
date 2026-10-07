"use strict";
// 案 51 のコストのカードのグラフの部品の続き: 利用者ごとの分布（dist。ヒストグラムか strip）・内訳の帯（split）・累積（cum。prev と棒）と、部品の振り分け。
(() => {
  const K = window.KIT;
  const { esc, lookup, fill } = K;
  const V = K.viz5;
  const { W, H, PAD, r1, svg, cap } = V;
  const BINS = 14; // dist のヒストグラムの区間の数
  const TOP_SHARE = 0.95; // dist の横軸の右端（上位 5% は右端に寄せる。少数の大きな値で分布がつぶれないように）

  // dist: 利用者ごとの 1 人 1 営業日あたり。大きな数字（全体の平均）の位置に印、中央値を添える
  function dist(v, ctx) {
    const d = lookup(ctx, "r5[per_user]");
    if (!d || !d.values.length) return "";
    const top = d.values[Math.floor((d.values.length - 1) * TOP_SHARE)] || 1, x = (val) => r1((Math.min(val, top) / top) * W);
    let body;
    if (v.strip) {
      body = d.values.map((val, i) => `<circle class="k5-strip" cx="${x(val)}" cy="${r1(H / 2 + ((i % 5) - 2) * 6)}" r="2.5"/>`).join("");
    } else {
      const n = Array(BINS).fill(0);
      d.values.forEach((val) => { n[Math.min(BINS - 1, Math.floor((Math.min(val, top) / top) * BINS))] += 1; });
      const y = V.scaleY(Math.max(...n)), bw = W / BINS;
      body = n.map((c, i) => `<rect class="bar-mid" x="${r1(i * bw + 1)}" y="${y(c)}" width="${r1(bw - 2)}" height="${r1(H - PAD - y(c))}"><title>${esc(`${K.usd((i * top) / BINS)}〜  ${c} 人`)}</title></rect>`).join("");
    }
    const mark = `<line class="k5-mean" x1="${x(d.mean)}" x2="${x(d.mean)}" y1="0" y2="${H}" vector-effect="non-scaling-stroke"/>`
      + `<line class="k5-median" x1="${x(d.median)}" x2="${x(d.median)}" y1="0" y2="${H}" vector-effect="non-scaling-stroke"/>`;
    return svg(body + mark) + cap(fill(K.L.K5.dist, { mean: d.mean, median: d.median, n: d.values.length }));
  }

  // split: 合計の前との差を「人数が変わった分」と「1 人あたりが変わった分」に分ける（r3.cost から数える）
  function split(v, ctx) {
    const c = lookup(ctx, "r3[cost]");
    if (!c || !c.prev_users || !c.users) return "";
    const p0 = c.prev_total / c.prev_users, p1 = c.total / c.users;
    const parts = [["users", (c.users - c.prev_users) * p0], ["per", c.users * (p1 - p0)]];
    const span = Math.max(...parts.map(([, x]) => Math.abs(x)), 1);
    const row = ([k, x]) => `<span class="k5-split-row"><span>${esc(K.L.K5.split_parts[k])}</span>`
      + `<span class="k5-split-track"><i class="${x < 0 ? "is-neg" : "is-pos"}" style="width: ${r1((Math.abs(x) / span) * 50)}%"></i></span><b class="num">${esc(K.FORMATS.signed_usd(x))}</b></span>`;
    return `<span class="k5-split">${parts.map(row).join("")}</span>` + cap(fill(K.L.K5.split, { diff: c.total - c.prev_total }));
  }

  // cum: 今月の累積と見込み。prev で前月の累積を見える線で重ねる。bars は日ごとの累積の棒と見込みの点線
  function cum(v, ctx) {
    const m = lookup(ctx, "month");
    const rows = (m.rows || []).filter((r) => r.mode === "bd");
    if (!rows.some((r) => r.cum !== null)) return "";
    const top = Math.max(1, ...rows.flatMap((r) => [r.cum, r.prev]).filter((x) => x !== null)), y = V.scaleY(top), x = V.xs(rows.length);
    const line = (pick, cls) => { const pts = rows.map((r, i) => (pick(r) === null ? null : `${x(i)},${y(pick(r))}`)).filter(Boolean); return pts.length > 1 ? `<polyline class="${cls}" points="${pts.join(" ")}" vector-effect="non-scaling-stroke"/>` : ""; };
    let body;
    if (v.bars) {
      const step = W / rows.length, bw = step * 0.62;
      body = rows.map((r, i) => (r.actual && r.cum !== null ? `<rect class="bar-hi" x="${r1(i * step + (step - bw) / 2)}" y="${y(r.cum)}" width="${r1(bw)}" height="${r1(H - PAD - y(r.cum))}"/>` : "")).join("")
        + line((r) => (r.actual ? null : r.cum), "k5-fc");
    } else {
      body = (v.prev ? line((r) => r.prev, "k5-prev") : "") + line((r) => (r.actual ? r.cum : null), "k5-line") + line((r) => r.cum, "k5-fc");
    }
    const legend = (v.prev ? K.L.K5.cum_prev : K.L.K5.cum).map(([cls, t]) => `<span><i class="${cls}"></i>${esc(fill(t, ctx))}</span>`).join("");
    return svg(body) + `<span class="legend k5-legend">${legend}</span>` + cap(fill(K.L.K5.cum_cap, ctx));
  }

  const PARTS = { area: V.area, bdbars: V.bdbars, line: V.line, grid: V.grid, dist, split, cum };
  function render(card, ctx) {
    const v = card.viz;
    return PARTS[v.part] ? PARTS[v.part](v, ctx) : (console.error(`kit: 知らない部品: ${v.part}`), "");
  }

  Object.assign(K.viz5, { render, has: (kind) => kind === "k5", PARTS });
})();
