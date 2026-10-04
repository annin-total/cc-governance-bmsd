"use strict";
// 上段のカード（サーバの components/card.html の写しに、状態の札・増減のチップ・第 2 の数字・カードの期間を足したもの）。
// 押した先: 同じページでは data-open（app.js がタブを開く）、概況や別のページでは href（専用ページのタブへ移る）。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup, parts, partsHtml } = K;
  const RANK = { ng: 0, warn: 1, ok: 2 };

  function caps(card, ctx) {
    if (card.empty && (lookup(ctx, card.empty) ?? null) === null) return card.capEmpty || [];
    return card.cap || [];
  }

  // 状態: state は場所・場所の並び（最も重いもの）・ctx を受け取る関数（基準超えの型ごとの数え方）
  function stateOf(card, ctx) {
    if (!card.state) return null;
    const tones = [].concat(card.state).map((p) => (typeof p === "function" ? p(ctx) : lookup(ctx, p))).filter((t) => t in RANK);
    return tones.length ? tones.sort((a, b) => RANK[a] - RANK[b])[0] : null;
  }

  const target = (card, chip) => {
    const hash = `${card.tab}${chip ? `:${chip}` : ""}`;
    return card.href !== undefined ? `href="${esc(`${card.href}#${hash}`)}"` : `href="#${esc(card.tab)}" data-open="${esc(hash)}"`;
  };

  const vizHtml = (card, ctx) => (!card.viz ? "" : K.over.has(card.viz.kind) ? K.over.render(card, ctx) : K.viz.render(card, ctx));

  // 大きな数字の行: 単位・右に小さく添える値（after）・第 2 の数字（value2。cost の 1 営業日あたり）。values は大きな数字を並べる（applied_mix）
  function valueHtml(card, ctx) {
    if (card.values) return `<span class="k-values">${card.values.map(([label, t]) => `<span class="k-pair"><span class="k-pair-label">${esc(label)}</span>`
      + `<span class="k-value">${partsHtml(parts(t, ctx))}<span class="u">${esc(card.unit || "")}</span></span></span>`).join("")}</span>`;
    if (!card.value) return "";
    const value = parts(card.value, ctx);
    const blank = value.length === 1 && value[0][0] === K.EM;
    const after = card.after ? `<span class="k-after">${esc(fill(card.after, ctx))}</span>` : "";
    const v2 = card.value2 ? `<span class="k-value2"><span>${esc(card.value2.label)}</span><b>${partsHtml(parts(card.value2.value, ctx))}</b></span>` : "";
    return `<span class="k-value">${partsHtml(value)}<span class="u">${esc(blank ? "" : card.unit || "")}</span>${after}${v2}</span>`;
  }

  function cardHtml(card, ctx) {
    const state = stateOf(card, ctx);
    const mark = K.look.stateHtml(state);
    const cs = caps(card, ctx).map((c) => fill(c, ctx));
    const subs = [card.sub, card.span].filter(Boolean).map((t) => partsHtml(parts(t, ctx))).join(" · ");
    const body = valueHtml(card, ctx) + `<span class="k-sub">${K.look.deltaHtml(card, ctx)}${subs}</span>`
      + `<span class="k-viz">${vizHtml(card, ctx)}${cs.length ? `<span class="cap">${cs.map((c) => `<span>${esc(c)}</span>`).join("")}</span>` : ""}</span>`;
    const attrs = `class="card${card.wide ? " wide" : ""}" data-ref="${esc(card.ref || "")}" data-state="${state || ""}"`;
    const go = card.tab ? `<span class="go">${K.L.OPEN_LIST}</span>` : "";
    // 札と入口を両方出す。並ぶときの入口は矢印だけにし、見出しの幅を空ける
    const both = mark && go ? `<span class="k-end">${mark}<span class="go go-icon" title="${K.L.OPEN_LIST}" aria-label="${K.L.OPEN_LIST}"></span></span>` : "";
    const head = `<span class="k-label"><span>${esc(fill(card.label, ctx))}</span>${both || mark || go}</span>`;
    if (!card.tab) return `<div ${attrs}>${head}${body}</div>`;
    return `<a ${attrs} ${target(card, card.chip)}>${head}${body}</a>`;
  }

  window.KIT = Object.assign(window.KIT || {}, { card: { cardHtml, stateOf } });
})();
