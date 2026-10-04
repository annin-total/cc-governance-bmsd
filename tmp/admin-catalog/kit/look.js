"use strict";
// 案ごとに変える見せ方（KIT.look）と、増減のチップ・状態の札の部品。案の ia.js は build({ look: {...} }) で既定を上書きする。
// over: 基準超えのカード（O1〜O5）・cost: コストのカード（C31・C32）・ver: バージョンとエラーのカード（V1〜V3）・head: ヘッダー（H1・H2）。
(() => {
  const K = window.KIT;
  const { esc, lookup } = K;

  const DEFAULTS = { over: "O2", cost: "C31", ver: "V3", head: "H1" }; // 推奨（concepts.md の 6.3）

  let current = DEFAULTS;
  function set(over) {
    current = { ...DEFAULTS, ...(over || {}) };
    return current;
  }

  // 増減の向き: better は "up"（増えたら改善）・"down"（増えたら悪化）・""（中立）
  function tone(v, better) {
    if (v === null || v === undefined || Number(v) === 0 || !better) return "neutral";
    return (v > 0) === (better === "up") ? "better" : "worse";
  }

  // 増減のチップの部品。t は better・worse・neutral（基準超えの「新規」「離脱」も使う）
  const chipHtml = (text, t) => `<span class="change ${t}" data-tone="${t}">${esc(text)}</span>`;

  function deltaHtml(card, ctx) {
    const d = card.delta;
    if (!d) return "";
    const v = lookup(ctx, d.v);
    if (v === null || v === undefined) return "";
    return chipHtml(K.FORMATS[d.fmt || "signed_pct"](v) + (d.unit ? ` ${d.unit}` : ""), tone(v, card.better));
  }

  // 見出しの右の札。正常は出さない
  const stateHtml = (state) => (state === "warn" || state === "ng" ? K.cells.mark(state, K.L.STATE[state]) : "");

  window.KIT = Object.assign(window.KIT || {}, { look: { set, get: () => current, tone, deltaHtml, chipHtml, stateHtml, DEFAULTS } });
})();
