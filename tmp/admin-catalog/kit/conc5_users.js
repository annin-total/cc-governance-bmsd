"use strict";
// 案 51 の「利用者の集中」の見せ方（look.conc。CC1〜CC4）。値は x[billed]（利用者ごとのコスト・状態）と r5[prev_costs]。
// 固定の区切り（上位 N% など）を置かない。CC3 の階級は判定の基準（正常・注意・要確認。12 か月は基準が無いので出さない）。
// どの図も svg の data-cost-total に使ったコストの合計を持つ（全体のコストと一致することを検査する）。
(() => {
  const K = window.KIT;
  const { esc, lookup, fill } = K;
  const r1 = (v) => Math.round(v * 10) / 10;
  const STATES = ["ng", "warn", "ok"];
  const WAFFLE_COLS = { card: 20, tab: 40 };
  const LEVELS = 4;

  const users = (ctx) => (lookup(ctx, "x[billed]") || []).filter((r) => r.cost > 0).sort((a, b) => b.cost - a.cost);
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const svg = (size, total, body, cls = "") => `<svg class="conc ${cls}" viewBox="0 0 ${size[0]} ${size[1]}" preserveAspectRatio="${cls === "conc-fixed" ? "xMidYMid meet" : "none"}" data-cost-total="${r1(total * 100) / 100}" aria-hidden="true">${body}</svg>`;
  const note = (t) => `<span class="cap conc-cap"><span>${esc(t)}</span></span>`;

  // 多い順の累積の点（横＝人数の累積割合、縦＝コストの累積割合）
  function curve(costs, [w, h]) {
    const total = sum(costs) || 1;
    let acc = 0;
    return [`0,${h}`, ...costs.map((c, i) => { acc += c; return `${r1(((i + 1) / costs.length) * w)},${r1(h - (acc / total) * h)}`; })].join(" ");
  }

  // CC1 累積の曲線（ローレンツ曲線）。対角線（全員が同じ額）を薄く、前の期間の曲線を薄く重ねる
  function cc1(ctx, size) {
    const now = users(ctx).map((r) => r.cost), prev = lookup(ctx, "r5[prev_costs]") || [];
    const [w, h] = size;
    const body = `<line class="conc-diag" x1="0" y1="${h}" x2="${w}" y2="0" vector-effect="non-scaling-stroke"/>`
      + (prev.length ? `<polyline class="conc-prev" points="${curve(prev, size)}" vector-effect="non-scaling-stroke"/>` : "")
      + `<polyline class="conc-now" points="${curve(now, size)}" vector-effect="non-scaling-stroke"/>`;
    return svg(size, sum(now), body) + note(K.L.CONC.cc1 + (prev.length ? K.L.CONC.cc1_prev : ""));
  }

  // CC2 パレート図: コストの多い順の利用者ごとの棒と、累積割合の折れ線
  function cc2(ctx, size) {
    const now = users(ctx).map((r) => r.cost), [w, h] = size, top = now[0] || 1, step = w / Math.max(now.length, 1);
    const bars = now.map((c, i) => `<rect class="bar-mid" x="${r1(i * step)}" y="${r1(h - (c / top) * h)}" width="${r1(Math.max(step - 0.4, 0.4))}" height="${r1((c / top) * h)}"/>`).join("");
    return svg(size, sum(now), bars + `<polyline class="conc-now" points="${curve(now, size)}" vector-effect="non-scaling-stroke"/>`) + note(K.L.CONC.cc2);
  }

  // CC3 状態の階級ごとに、コストの 100% の帯と人数の 100% の帯を上下にそろえる
  function cc3(ctx) {
    const us = users(ctx);
    if (us.some((r) => !r.state)) return `<span class="conc-na">${esc(K.L.CONC.cc3_na)}</span>`;
    const total = sum(us.map((r) => r.cost)), n = us.length;
    const cls = STATES.map((s) => { const g = us.filter((r) => r.state === s); return { s, users: g.length, cost: sum(g.map((r) => r.cost)) }; });
    const band = (key, whole) => `<span class="conc-band">${cls.map((c) => `<i class="ov-${c.s}" style="flex: ${c[key] / whole}"></i>`).join("")}</span>`;
    const legend = cls.map((c) => `<span><i class="ov-${c.s}"></i>${esc(fill(K.L.CONC.cc3_row, { state: K.L.STATE[c.s], n: c.users, share: (c.cost / total) * 100 }))}</span>`).join("");
    return `<span class="conc-bands" data-cost-total="${r1(total * 100) / 100}"><span class="conc-blabel">${esc(K.L.CONC.cost)}</span>${band("cost", total)}`
      + `<span class="conc-blabel">${esc(K.L.CONC.people)}</span>${band("users", n)}</span><span class="legend conc-legend">${legend}</span>` + note(K.L.CONC.cc3);
  }

  // CC4 1 人 1 マスのワッフル（多い順、マスの濃さ＝コストの 4 段）
  function cc4(ctx, size, at) {
    const us = users(ctx), cols = WAFFLE_COLS[at], top = (us[0] || {}).cost || 1;
    const cells = us.map((r) => `<i class="conc-cell lv-${Math.max(1, Math.ceil((r.cost / top) * LEVELS))}" title="${esc(`${r.email}  ${K.usd(r.cost)}`)}"></i>`).join("");
    return `<span class="conc-waffle" style="grid-template-columns: repeat(${cols}, 1fr)" data-cost-total="${r1(sum(us.map((r) => r.cost)) * 100) / 100}">${cells}</span>` + note(K.L.CONC.cc4);
  }

  K.concUsers = { CC1: cc1, CC2: cc2, CC3: cc3, CC4: cc4, users, sum, svg, note, r1 };
})();
