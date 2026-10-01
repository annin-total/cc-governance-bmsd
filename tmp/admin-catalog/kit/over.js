"use strict";
// 基準を超えた利用者のカードの下段（catalog_over.js の viz.kind）。src は r3[over][区分]（人数・前・新たに該当・外れた・上位）。
(() => {
  const K = window.KIT;
  const { esc, lookup } = K;
  const TONES = ["ng", "warn"]; // 要確認・注意の順に並べる
  const L = () => K.L;

  // 新たに該当（悪化の向き）・外れた（改善の向き）。増減のチップと同じ部品
  function moves(s) {
    const chip = (n, label, tone) => K.look.chipHtml(`${label} ${K.num(n)} 人`, n ? tone : "neutral");
    return `<span class="ov-moves">${chip(s.new, L().OVER_KIND.new, "worse")}${chip(s.left, L().OVER_KIND.left, "better")}</span>`;
  }

  const prevText = (n) => `<span class="ov-prev">${esc(L().OVER_PREV.replace("{}", K.num(n)))}</span>`; // 前の人数
  const count = (s, t) => `<b class="ov-n${s[t] ? ` ${t}` : ""}">${K.num(s[t])}</b><span class="ov-u">人</span>`;

  // 案 31: 1 行 2 列（要確認・注意。前の人数つき）
  const tally = (s) => moves(s) + `<span class="ov-tally">${TONES.map((t) =>
    `<span class="ov-cell"><span class="ov-name">${esc(L().STATE[t])}</span>${count(s, t)}${prevText(s[`prev_${t}`])}</span>`).join("")}</span>`;

  // 案 32: 要確認と注意を別々の大きな数字で並べる
  const duo = (s) => `<span class="ov-duo">${TONES.map((t) =>
    `<span class="ov-big"><span class="ov-name">${esc(L().STATE[t])}</span><span class="k-value">${K.num(s[t])}<span class="u">人</span></span>${prevText(s[`prev_${t}`])}</span>`).join("")}</span>` + moves(s);

  // 案 34: 該当者の上位 3 人（利用者・金額・札）
  const top = (s) => moves(s) + `<span class="ov-top">${s.top.map((r) =>
    `<span class="ov-trow"><span class="ov-mail">${esc(r.email)}</span><span class="num">${esc(K.usd(r.value))}</span>${K.look.stateHtml(r.state)}</span>`).join("")}</span>`;

  // 案 35: 要確認・注意それぞれの前と今の横棒（軸は組ごと）
  function bars(s) {
    const pair = (t) => {
      const top = Math.max(1, s[t], s[`prev_${t}`]);
      const bar = (n, label, ghost) => `<span class="ov-bar"><span>${esc(label)}</span>${K.viz.hbar(K.geo.pct(n, top), ghost ? "ghost" : "")}<span class="num">${K.num(n)} 人</span></span>`;
      return `<span class="ov-pair"><span class="ov-name">${esc(L().STATE[t])}</span>${bar(s[`prev_${t}`], L().OVER_PREV_SHORT, true)}${bar(s[t], L().OVER_NOW_SHORT, false)}</span>`;
    };
    return moves(s) + `<span class="ov-bars">${TONES.map(pair).join("")}</span>`;
  }

  // 案 36: 利用者全体を要確認・注意・正常で分けた 1 本の帯（人数の割合）
  function band(s) {
    const parts = [["ng", s.ng], ["warn", s.warn], ["ok", s.ok]];
    return moves(s) + `<span class="stack ov-band">${parts.map(([t, n]) => `<i class="ov-${t}" style="flex: ${n}"></i>`).join("")}</span>`
      + `<span class="legend">${parts.map(([t, n]) => `<span><i class="ov-${t}"></i>${esc(L().STATE[t])} ${K.num(n)}</span>`).join("")}</span>`;
  }

  const KINDS = { ov_tally: tally, ov_duo: duo, ov_top: top, ov_bars: bars, ov_band: band };
  function render(card, ctx) {
    const s = lookup(ctx, card.viz.src);
    return s ? KINDS[card.viz.kind](s) : "";
  }

  window.KIT = Object.assign(window.KIT || {}, { over: { render, has: (kind) => kind in KINDS, moves } });
})();
