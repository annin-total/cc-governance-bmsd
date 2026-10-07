"use strict";
// 基準を超えた利用者のカードの下段（catalog_over.js の viz.kind）。src は r3[over][区分]（人数・前・新規・離脱・上位）。
(() => {
  const K = window.KIT;
  const { esc, lookup } = K;
  const TONES = ["ng", "warn"]; // 要確認・注意の順に並べる
  const L = () => K.L;

  // 新規（悪化の向き）・離脱（改善の向き）。増減のチップと同じ部品
  function moves(s) {
    const chip = (n, label, tone) => K.look.chipHtml(`${label} ${K.num(n)} 人`, n ? tone : "neutral");
    return `<span class="ov-moves">${chip(s.new, L().OVER_KIND.new, "worse")}${chip(s.left, L().OVER_KIND.left, "better")}</span>`;
  }

  const prevText = (n) => `<span class="ov-prev">${esc(L().OVER_PREV.replace("{}", K.num(n)))}</span>`; // 前の人数
  const count = (s, t) => `<b class="ov-n${s[t] ? ` ${t}` : ""}">${K.num(s[t])}</b><span class="ov-u">人</span>`;

  // 案 31: 1 行 2 列（要確認・注意。前の人数つき）
  const tally = (s) => moves(s) + `<span class="ov-tally">${TONES.map((t) =>
    `<span class="ov-cell"><span class="ov-name">${esc(L().STATE[t])}</span>${count(s, t)}${prevText(s[`prev_${t}`])}</span>`).join("")}</span>`;

  // 要確認と注意を別々の大きな数字で並べる（案 51）
  const duo = (s) => `<span class="ov-duo">${TONES.map((t) =>
    `<span class="ov-big"><span class="ov-name">${esc(L().STATE[t])}</span><span class="k-value">${K.num(s[t])}<span class="u">人</span></span>${prevText(s[`prev_${t}`])}</span>`).join("")}</span>` + moves(s);

  const KINDS = { ov_tally: tally, ov_duo: duo };
  function render(card, ctx) {
    const s = lookup(ctx, card.viz.src);
    return s ? KINDS[card.viz.kind](s) : "";
  }

  window.KIT = Object.assign(window.KIT || {}, { over: { render, has: (kind) => kind in KINDS } });
})();
