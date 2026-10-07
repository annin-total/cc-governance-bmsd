"use strict";
// 目録の「基準を超えた利用者」のカード（concepts.md の 2.2）。区分は期間のタブに連動する（7 日＝日次・週次、28 日＝月次、12 か月は出さない）。
// only: カードを出す期間。`over_<区分>_duo` は要確認と注意を 2 つの大きな数字で並べる型（案 51）。
(() => {
  const { L } = window.KIT;
  const { K } = window.CATALOG;
  const PERIOD_OF = { day: "7", week: "7", month: "28" };
  const SPANS = Object.keys(PERIOD_OF);
  const O = (s, k) => `r3[over][${s}][${k}]`;
  const LONG_WHY = "7 日・28 日の期間で判定する";

  // 31 の形: 大きな数字＝注意以上の人数、添える数字＝人数とコストの割合、下段＝要確認・注意の 1 行 2 列
  const base = (s) => ({
    win: "bill", label: `基準を超えた利用者（${L.OVER_SPAN[s]}）`, unit: "人", only: [PERIOD_OF[s]], longWhy: LONG_WHY, tabs: ["over_users"], chip: s, better: "down",
    value: `{${O(s, "users")}:num}`, state: O(s, "state"), why: `要確認 {${O(s, "ng")}:num} 人・注意 {${O(s, "warn")}:num} 人`,
    delta: { v: O(s, "delta"), fmt: "signed", unit: "人" },
    sub: `全\u00a0{${O(s, "all_users")}:num}\u00a0人の\u00a0{${O(s, "user_share")}:pct} · コストの\u00a0{${O(s, "cost_share")}:pct}`,
    viz: { kind: "ov_tally", src: `r3[over][${s}]` },
    cap: [`${L.OVER_SPAN[s]}の基準 注意 \${USER_COST_ELEVATED[${s}]}・要確認 \${USER_COST_HIGH[${s}]}`],
  });

  // 要確認と注意を別々の大きな数字で（合計を出さない）。下段は look.over（D1〜D6。over.js）
  const duo = (c) => ({ ...c, value: null, delta: null, sub: "", viz: { ...c.viz, kind: "ov_duo" } });

  SPANS.forEach((s) => {
    const c = base(s);
    K[`over_${s}`] = c;
    K[`over_${s}_duo`] = duo(c);
  });

})();
