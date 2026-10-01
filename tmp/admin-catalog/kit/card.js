"use strict";
// 上段のカード（サーバの components/card.html の写しに、状態の札・増減のチップ・目安の表を足したもの）。
// 押した先: 同じページでは data-open（app.js がタブを開く）、概況では href（専用ページのタブへ移る）。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup, parts, partsHtml } = K;
  const RANK = { ng: 0, warn: 1, ok: 2 };

  function caps(card, ctx) {
    if (card.empty && (lookup(ctx, card.empty) ?? null) === null) return card.capEmpty || [];
    return card.cap || [];
  }

  // 状態: state は場所か場所の並び（行ごとの札を持つカードは最も重いもの）
  function stateOf(card, ctx) {
    if (!card.state) return null;
    const tones = [].concat(card.state).map((p) => lookup(ctx, p)).filter((t) => t in RANK);
    return tones.length ? tones.sort((a, b) => RANK[a] - RANK[b])[0] : null;
  }

  const target = (card, chip) => {
    const hash = `${card.tab}${chip ? `:${chip}` : ""}`;
    return card.href !== undefined ? `href="${esc(`${card.href}#${hash}`)}"` : `href="#${esc(card.tab)}" data-open="${esc(hash)}"`;
  };

  // 目安を超えた利用者: 行（1 日・7 日・28 日）× 列（注意・要確認）の人数。マスを押すと、その目安で絞った一覧
  function limitGrid(card, ctx) {
    const v = card.viz, L = K.L, C = K.C;
    const head = `<span class="lg-row lg-head"><span></span><span>${esc(L.STATE.warn)}</span><span>${esc(L.STATE.ng)}</span></span>`;
    const rows = lookup(ctx, v.src).map((r) => {
      const name = `${L.LIMIT_SPAN[r.key]}<span class="sub"> ${esc(fill(v.rule, { e: C.USER_COST_ELEVATED[r.key], h: C.USER_COST_HIGH[r.key] }))}</span>`;
      const cell = (tone) => (r[tone] && card.tab ? `<a class="lg-n ${tone}" ${target(card, r.key)}>${K.num(r[tone])}</a>` : `<span class="lg-n zero">${K.num(r[tone])}</span>`);
      return `<span class="lg-row"><span>${name}</span>${cell("warn")}${cell("ng")}</span>`;
    }).join("");
    return `<span class="lgrid">${head}${rows}</span>`;
  }

  // 行ごとの札を持つ内訳（まとめたカード）: 見出し・値・札
  function stateRows(card, ctx) {
    return `<span class="srows">${card.viz.rows.map((r) => {
      const t = lookup(ctx, r.state || "") || "";
      return `<span class="srow"><span>${esc(fill(r.label, ctx))}</span><b class="num">${esc(fill(r.value, ctx))}</b><span>${K.look.stateHtml(t)}</span></span>`;
    }).join("")}</span>`;
  }

  function vizHtml(card, ctx) {
    if (!card.viz) return "";
    if (card.viz.kind === "limit") return limitGrid(card, ctx);
    if (card.viz.kind === "staterows") return stateRows(card, ctx);
    return K.viz.render(card, ctx);
  }

  function cardHtml(card, ctx) {
    const value = card.value ? parts(card.value, ctx) : [];
    const blank = value.length === 1 && value[0][0] === K.EM;
    const state = stateOf(card, ctx);
    const mark = K.look.stateHtml(state);
    const cs = caps(card, ctx).map((c) => fill(c, ctx));
    const label = `<span>${esc(fill(card.label, ctx))}</span>`;
    const inner = Boolean(card.tab) && card.viz && card.viz.kind === "limit"; // マスに押せる先があるカードは、全体を押せるリンクにしない
    const body = (card.value ? `<span class="k-value">${partsHtml(value)}<span class="u">${esc(blank ? "" : card.unit || "")}</span></span>` : "")
      + `<span class="k-sub">${K.look.deltaHtml(card, ctx)}${partsHtml(parts(card.sub || "", ctx))}</span>`
      + `<span class="k-viz">${vizHtml(card, ctx)}${cs.length ? `<span class="cap">${cs.map((c) => `<span>${esc(c)}</span>`).join("")}</span>` : ""}</span>`;
    const attrs = `class="card${card.wide ? " wide" : ""}" data-ref="${esc(card.ref || "")}" data-state="${state || ""}"`;
    if (inner) return `<div ${attrs}><span class="k-label">${label}<span class="k-end">${mark}<a class="go" ${target(card, card.chip)}>${K.L.OPEN_LIST}</a></span></span>${body}</div>`;
    const head = `<span class="k-label">${label}${mark || (card.tab ? `<span class="go">${K.L.OPEN_LIST}</span>` : "")}</span>`;
    if (!card.tab) return `<div ${attrs}>${head}${body}</div>`;
    return `<a ${attrs} ${target(card, card.chip)}>${head}${body}</a>`;
  }

  window.KIT = Object.assign(window.KIT || {}, { card: { cardHtml, stateOf } });
})();
