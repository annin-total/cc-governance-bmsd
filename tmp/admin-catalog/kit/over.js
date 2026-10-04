"use strict";
// 基準超えのカードの中身（catalog_over.js の viz.kind "ov"。見せ方 O1〜O4 は viz.form）。src は r3[over][区分]。
// 並びは 新規・離脱 → 前との差 → 内訳 → コストの割合 → 基準（concepts.md の 2.3）。人数の割合は出さない。
(() => {
  const K = window.KIT;
  const { esc, lookup } = K;
  const L = () => K.L;

  // 新規（悪化の向き）・離脱（改善の向き）。増減のチップと同じ部品
  function moves(n, left) {
    const chip = (v, label, tone) => K.look.chipHtml(`${label} ${K.num(v)} 人`, v ? tone : "neutral");
    return `<span class="ov-moves">${chip(n, L().OVER_KIND.new, "worse")}${chip(left, L().OVER_KIND.left, "better")}</span>`;
  }
  const diff = (v) => `<span class="ov-line">${esc(L().OVER_DIFF)} ${K.look.chipHtml(`${K.signed(v)} 人`, K.look.tone(v, "down"))}</span>`;
  const prev = (n) => `<span class="ov-prev">${esc(L().OVER_PREV.replace("{}", K.num(n)))}</span>`;
  const count = (s, t) => `<b class="ov-n${s[t] ? ` ${t}` : ""}">${K.num(s[t])}</b><span class="ov-u">人</span>`;
  const share = (v, ng) => `<span class="ov-note">${esc((ng ? L().OVER_SHARE_NG : L().OVER_SHARE).replace("{}", K.pct(v)))}</span>`;
  const rule = (s, span) => `<span class="ov-note">${esc(K.fill(L().OVER_RULE, { unit: L().OVER_UNIT[span], elevated: s.elevated, high: s.high }))}</span>`;

  // O1: 1 行 2 列（要確認・注意。前の人数つき）
  const tally = (s) => `<span class="ov-tally">${["ng", "warn"].map((t) =>
    `<span class="ov-cell"><span class="ov-name">${esc(L().STATE[t])}</span>${count(s, t)}${prev(s[`prev_${t}`])}</span>`).join("")}</span>`;
  // O3: 要確認と注意を 2 つの大きな数字で（数字ごとに前の人数と新規・離脱）
  const duo = (s) => `<span class="ov-duo">${["ng", "warn"].map((t) =>
    `<span class="ov-big"><span class="ov-name">${esc(L().STATE[t])}</span><span class="k-value">${K.num(s[t])}<span class="u">人</span></span>${prev(s[`prev_${t}`])}${moves(s[`${t}_new`], s[`${t}_left`])}</span>`).join("")}</span>`;

  const FORMS = {
    O1: (s, span) => moves(s.new, s.left) + diff(s.delta) + tally(s) + share(s.cost_share) + rule(s, span),
    O2: (s, span) => moves(s.ng_new, s.ng_left) + diff(s.ng_delta)
      + `<span class="ov-note ov-quiet">${esc(K.fill(L().OVER_WARN_LINE, { n: s.warn, prev: s.prev_warn }))}</span>` + share(s.ng_cost_share, true) + rule(s, span),
    O3: (s, span) => duo(s) + diff(s.delta) + share(s.cost_share) + rule(s, span),
    O4: (s) => moves(s.ng_new, s.ng_left) + diff(s.ng_delta) + `<span class="ov-line">${prev(s.prev_ng)}</span>` + share(s.ng_cost_share, true),
  };

  function render(card, ctx) {
    const s = lookup(ctx, card.viz.src);
    return s ? `<span class="ov">${FORMS[card.viz.form](s, card.viz.span)}</span>` : "";
  }

  window.KIT = Object.assign(window.KIT || {}, { over: { render, has: (kind) => kind === "ov" } });
})();
