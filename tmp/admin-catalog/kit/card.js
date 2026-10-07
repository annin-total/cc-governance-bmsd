"use strict";
// 上段のカード（サーバの components/card.html の写しに、状態の札・増減のチップを足したもの）。
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

  function vizHtml(card, ctx) {
    if (!card.viz) return "";
    if (K.over.has(card.viz.kind)) return K.over.render(card, ctx);
    if (K.viz5 && K.viz5.has(card.viz.kind)) return `<span class="k5-wrap" data-part="${esc(card.viz.part)}">${K.viz5.render(card, ctx)}</span>`; // 案 51 の部品
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
      + `<span class="k-sub">${K.look.deltaHtml(card, ctx)}${card.chipNote ? `<span class="chip-note">${esc(fill(card.chipNote, ctx))}</span>` : ""}${partsHtml(parts(card.sub || "", ctx))}</span>`
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
