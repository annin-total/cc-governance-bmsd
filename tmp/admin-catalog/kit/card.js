"use strict";
// 上段のカード（サーバの components/card.html の写しに、状態の札・増減のチップ・行ごとの札を足したもの）。
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

  // 行ごとの札を持つ内訳（まとめたカード）: 見出し・値・札。moves があれば行の下に新たに該当・外れたのチップ
  function stateRows(card, ctx) {
    return `<span class="srows">${card.viz.rows.filter(K.page.fits).map((r) => {
      const t = r.state ? lookup(ctx, r.state) || "" : "";
      const moves = r.moves ? K.over.moves(lookup(ctx, r.moves)) : "";
      return `<span class="srow"><span>${esc(fill(r.label, ctx))}</span><b class="num">${esc(fill(r.value, ctx))}</b><span>${K.look.stateHtml(t)}</span>${moves}</span>`;
    }).join("")}</span>`;
  }

  function vizHtml(card, ctx) {
    if (!card.viz) return "";
    if (K.over.has(card.viz.kind)) return K.over.render(card, ctx);
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
    const body = (card.value ? `<span class="k-value">${partsHtml(value)}<span class="u">${esc(blank ? "" : card.unit || "")}</span></span>` : "")
      + `<span class="k-sub">${K.look.deltaHtml(card, ctx)}${partsHtml(parts(K.look.subOf(card), ctx))}</span>`
      + `<span class="k-viz">${vizHtml(card, ctx)}${cs.length ? `<span class="cap">${cs.map((c) => `<span>${esc(c)}</span>`).join("")}</span>` : ""}</span>`;
    const attrs = `class="card${card.wide ? " wide" : ""}" data-ref="${esc(card.ref || "")}" data-state="${state || ""}"`;
    const go = card.tab ? `<span class="go">${K.L.OPEN_LIST}</span>` : "";
    // 札と入口を両方出す。並ぶときの入口は矢印だけにし、見出しの幅を空ける
    const both = mark && go ? `<span class="k-end">${mark}<span class="go go-icon" title="${K.L.OPEN_LIST}" aria-label="${K.L.OPEN_LIST}"></span></span>` : "";
    const head = `<span class="k-label">${label}${both || mark || go}</span>`;
    if (!card.tab) return `<div ${attrs}>${head}${body}</div>`;
    return `<a ${attrs} ${target(card, card.chip)}>${head}${body}</a>`;
  }

  window.KIT = Object.assign(window.KIT || {}, { card: { cardHtml, stateOf } });
})();
