"use strict";
// 案 51 の「部署と人数・コストの割合」の見せ方（look.concd。CD1〜CD4）。値は r5[depts]（部・課・不明の行）と x[billed]（CD3 の利用者の段）。
// 部の色は部署の絞り込みと同じ（--dc-0・--dc-1、不明は灰）。どの図も data-cost-total に使ったコストの合計を持つ。
(() => {
  const K = window.KIT;
  const { esc, lookup, fill } = K;
  const U = () => K.concUsers;
  const leaves = (ctx) => (lookup(ctx, "r5[depts]") || []).filter((r) => r.kind !== "dept" && r.users > 0); // 課と不明（部の行は課の合計なので重ねない）
  const depts = (ctx) => (lookup(ctx, "r5[depts]") || []).filter((r) => r.kind !== "section");
  const color = (ctx, dept) => { const i = (lookup(ctx, "F[org][depts]") || []).indexOf(dept); return i < 0 ? "var(--muted)" : `var(--dc-${i})`; };
  const nameOf = (r) => (r.kind === "unknown" ? K.L.UNKNOWN : r.kind === "dept" ? r.dept : r.section || K.L.DF_NO_SECTION);

  // CD1 部署ごとに人数の割合とコストの割合の 2 本の横棒（カードは部と不明、タブは課も）。CD5 は課をコストの多い順に TOP_SECTIONS 個
  function cd1(ctx, size, at, only) {
    const rows = only || (at === "tab" ? (lookup(ctx, "r5[depts]") || []) : depts(ctx));
    const n = lookup(ctx, "r3[cost][users]"), total = U().sum(depts(ctx).map((r) => r.cost));
    const top = Math.max(...rows.map((r) => Math.max(r.users / n, r.cost / total)));
    const bar = (v, cls) => `<span class="hbar ${cls}"><i style="width: ${U().r1((v / top) * 100)}%"></i></span>`;
    const body = rows.map((r) => `<span class="conc-drow${r.kind === "section" && !only ? " is-sec" : ""}${only ? " is-top" : ""}" style="--dc: ${color(ctx, r.dept)}" data-sec="${esc(`${r.dept}|${r.section ?? ""}`)}" data-cost="${r.cost}"><span>${only ? '<i class="conc-mark"></i>' : ""}${esc(nameOf(r))}</span>`
      + `${bar(r.users / n, "conc-people")}<span class="num">${esc(K.pct((r.users / n) * 100))}</span>${bar(r.cost / total, "conc-cost")}<span class="num">${esc(K.pct((r.cost / total) * 100))}</span></span>`).join("");
    const tag = only ? "" : ` data-cost-total="${U().r1(total * 100) / 100}"`; // CD5 は上位だけなので合計を持たない
    return `<span class="conc-drows${only ? " conc-top" : ""}"${tag}><span class="conc-dhead"><span></span><span>${esc(K.L.CONC.people)}</span><span></span><span>${esc(K.L.CONC.cost)}</span><span></span></span>${body}</span>` + U().note(only ? fill(K.L.CONC.cd5, { more: secs(ctx).length - only.length, unknown: (depts(ctx).find((r) => r.kind === "unknown") || {}).users || 0 }) : K.L.CONC.cd1);
  }

  // CD5 コストの多い課: 課（不明は課として並べず、添え書きに数える）をコストの多い順に TOP_SECTIONS 個。見せ方は CD1 と同じ
  const TOP_SECTIONS = 5;
  const secs = (ctx) => (lookup(ctx, "r5[depts]") || []).filter((r) => r.kind === "section" && r.users > 0).sort((a, b) => b.cost - a.cost);
  const cd5 = (ctx, size, at) => cd1(ctx, size, at, secs(ctx).slice(0, TOP_SECTIONS));

  // CD2 マリメッコ: 横幅＝人数、高さ＝1 人あたりのコスト、面積＝コスト（課と不明。部で色分け）
  function cd2(ctx, size) {
    const rows = leaves(ctx), [w, h] = size, n = U().sum(rows.map((r) => r.users)), top = Math.max(...rows.map((r) => r.cost / r.users));
    let x = 0;
    const body = rows.map((r) => {
      const rw = (r.users / n) * w, rh = ((r.cost / r.users) / top) * h, out = `<rect class="conc-mk" style="fill: ${color(ctx, r.dept)}" x="${U().r1(x)}" y="${U().r1(h - rh)}" width="${U().r1(Math.max(rw - 1, 0.5))}" height="${U().r1(rh)}"><title>${esc(`${nameOf(r)}  ${r.users} 人 · ${K.usd(r.cost)}`)}</title></rect>`;
      x += rw;
      return out;
    }).join("");
    return U().svg(size, U().sum(rows.map((r) => r.cost)), body) + U().note(K.L.CONC.cd2);
  }

  // 帯を値の比で切る（slice-and-dice）。dir が "x" なら横に並べる
  function slice(items, box, dir) {
    const total = U().sum(items.map((i) => i.v)) || 1;
    let at = dir === "x" ? box.x : box.y;
    return items.map((i) => {
      const len = ((dir === "x" ? box.w : box.h) * i.v) / total, b = dir === "x" ? { ...box, x: at, w: len } : { ...box, y: at, h: len };
      at += len;
      return { ...i, b };
    });
  }

  // CD3 ツリーマップ: 部→課（タブは→利用者）の入れ子。面積＝コスト、色＝部
  function cd3(ctx, size, at) {
    const [w, h] = size, rows = lookup(ctx, "r5[depts]") || [], us = U().users(ctx);
    const top = slice(depts(ctx).map((d) => ({ d, v: d.cost })), { x: 0, y: 0, w, h }, "x");
    const rect = (b, cls, fill, title) => `<rect class="${cls}" style="fill: ${fill}" x="${U().r1(b.x)}" y="${U().r1(b.y)}" width="${U().r1(Math.max(b.w - 0.6, 0.3))}" height="${U().r1(Math.max(b.h - 0.6, 0.3))}"><title>${esc(title)}</title></rect>`;
    const body = top.map(({ d, b }) => {
      const kids = d.kind === "unknown" ? [{ s: null, v: d.cost }] : rows.filter((r) => r.kind === "section" && r.dept === d.dept).map((s) => ({ s, v: s.cost }));
      return slice(kids, b, "y").map(({ s, b: sb }) => {
        const label = s ? nameOf(s) : K.L.UNKNOWN;
        if (at !== "tab") return rect(sb, "conc-tm", color(ctx, d.dept), `${label}  ${K.usd(s ? s.cost : d.cost)}`);
        const mine = us.filter((u) => (d.kind === "unknown" ? u.dept === null : u.dept === d.dept && u.section === s.section)).map((u) => ({ u, v: u.cost }));
        return slice(mine, sb, "x").map(({ u, b: ub }) => rect(ub, "conc-tm", color(ctx, d.dept), `${u.email}（${label}）  ${K.usd(u.cost)}`)).join("");
      }).join("");
    }).join("");
    return U().svg(size, U().sum(depts(ctx).map((r) => r.cost)), body) + U().note(K.L.CONC.cd3);
  }

  // CD4 散布図: 課ごとの点。横＝人数、縦＝1 人あたりのコスト、点の大きさ＝コスト
  function cd4(ctx, size) {
    const rows = leaves(ctx), [w, h] = size, pad = 8;
    const xm = Math.max(...rows.map((r) => r.users)), ym = Math.max(...rows.map((r) => r.cost / r.users)), cm = Math.max(...rows.map((r) => r.cost));
    const dots = rows.map((r) => `<circle class="conc-dot" style="fill: ${color(ctx, r.dept)}" cx="${U().r1(pad + ((w - 2 * pad) * r.users) / xm)}" cy="${U().r1(h - pad - ((h - 2 * pad) * (r.cost / r.users)) / ym)}" r="${U().r1(2 + 8 * Math.sqrt(r.cost / cm))}"><title>${esc(`${nameOf(r)}  ${r.users} 人 · ${K.usd(r.cost / r.users)} / 人 · ${K.usd(r.cost)}`)}</title></circle>`).join("");
    return U().svg(size, U().sum(rows.map((r) => r.cost)), `<line class="conc-axis" x1="${pad}" y1="${h - pad}" x2="${w}" y2="${h - pad}"/><line class="conc-axis" x1="${pad}" y1="0" x2="${pad}" y2="${h - pad}"/>${dots}`, "conc-fixed") + U().note(fill(K.L.CONC.cd4, {}));
  }

  K.concDepts = { CD1: cd1, CD2: cd2, CD3: cd3, CD4: cd4, CD5: cd5 };
})();
