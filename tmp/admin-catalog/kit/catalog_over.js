"use strict";
// 目録の「基準を超えた利用者」のカード（concepts.md の 2.2）。区分は期間のタブに連動する（7 日＝日次・週次、28 日＝月次、12 か月は出さない）。
// only: カードを出す期間。案 32〜36 は同じ値の見せ方の変種（`over_<区分>_<変種>`）を ia.js で差し替える。
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
    delta: { v: O(s, "delta"), fmt: "signed", unit: "人", prev: `{${O(s, "prev_users")}:num} 人` },
    sub: `全\u00a0{${O(s, "all_users")}:num}\u00a0人の\u00a0{${O(s, "user_share")}:pct} · コストの\u00a0{${O(s, "cost_share")}:pct}`,
    viz: { kind: "ov_tally", src: `r3[over][${s}]` },
    cap: [`${L.OVER_SPAN[s]}の基準 注意 \${USER_COST_ELEVATED[${s}]}・要確認 \${USER_COST_HIGH[${s}]}`],
  });

  const VARIANTS = {
    // 32: 要確認と注意を別々の大きな数字で（合計を出さない）
    duo: (s, c) => ({ ...c, value: null, delta: null, sub: "", viz: { ...c.viz, kind: "ov_duo" } }),
    // 34: 下段に該当者の上位 3 人。人数の内訳は添える数字へ
    top: (s, c) => ({ ...c, sub: `要確認\u00a0{${O(s, "ng")}:num}・注意\u00a0{${O(s, "warn")}:num}\u00a0人 · ${c.sub}`, viz: { ...c.viz, kind: "ov_top" } }),
    // 35: 下段に要確認・注意それぞれの前と今の横棒
    bars: (s, c) => ({ ...c, viz: { ...c.viz, kind: "ov_bars" } }),
    // 36: 大きな数字は要確認の人数だけ。下段は利用者全体を状態で分けた帯
    band: (s, c) => ({ ...c, unit: "人（要確認）", value: `{${O(s, "ng")}:num}`, delta: { v: O(s, "ng_delta"), fmt: "signed", unit: "人" },
      why: `注意 {${O(s, "warn")}:num} 人`, sub: `注意\u00a0{${O(s, "warn")}:num}\u00a0人 · 注意以上\u00a0{${O(s, "users")}:num}\u00a0人`, viz: { ...c.viz, kind: "ov_band" } }),
  };

  SPANS.forEach((s) => {
    const c = base(s);
    K[`over_${s}`] = c;
    Object.entries(VARIANTS).forEach(([name, make]) => { K[`over_${s}_${name}`] = make(s, c); });
  });

  // 33: 1 枚に区分の行をまとめる（行ごとに要確認・注意の人数と札、新たに該当・外れた）
  K.over_rows = {
    win: "bill", label: "基準を超えた利用者", unit: "人", longWhy: LONG_WHY, tabs: ["over_users"], state: "r3[over][state]",
    why: SPANS.filter((s) => PERIOD_OF[s] === "7").map((s) => `${L.OVER_SPAN[s]} 要確認 {${O(s, "ng")}:num}・注意 {${O(s, "warn")}:num} 人`).join("、"),
    sub: "区分ごとの注意以上の人数",
    viz: { kind: "staterows", rows: SPANS.map((s) => ({ only: [PERIOD_OF[s]], label: L.OVER_SPAN[s], value: `要確認 {${O(s, "ng")}:num} · 注意 {${O(s, "warn")}:num} 人`,
      state: O(s, "state"), moves: `r3[over][${s}]` })) },
    cap: ["基準の金額は一覧の注記"],
  };
})();
