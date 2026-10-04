"use strict";
// 目録の基準超えのカード（concepts.md の 2.3）。区分は期間のタブに連動する（7 日＝日次・週次、28 日＝月次、12 か月は出さない）。
// 見せ方は look.over（O1〜O5）で、catalog.js が overCard(区分, 型) で作り直す。目録の over_<区分> は O1 の形。
(() => {
  const { L, C } = window.KIT;
  const { K } = window.CATALOG;
  const PERIOD_OF = { day: "7", week: "7", month: "28" };
  const O = (s, k) => `r3[over][${s}][${k}]`;
  const src = (s) => `r3[over][${s}]`;
  const at = (s) => (ctx) => window.KIT.lookup(ctx, src(s)) || {};
  // O1・O3 は注意以上を数え、要確認か注意で札を出す。O2・O4 は要確認だけを数え、注意の札を出さない
  const WIDE = (s) => (ctx) => { const o = at(s)(ctx); return o.ng ? "ng" : o.warn ? "warn" : "ok"; };
  const NG_ONLY = (s) => (ctx) => (at(s)(ctx).ng ? "ng" : "ok");

  const FORMS = {
    O1: (s) => ({ label: `基準超え（${L.OVER_SPAN[s]}）`, value: `{${O(s, "users")}:num}`, state: WIDE(s), why: `要確認 {${O(s, "ng")}:num} 人・注意 {${O(s, "warn")}:num} 人` }),
    O2: (s) => ({ label: `要確認の利用者（${L.OVER_SPAN[s]}）`, value: `{${O(s, "ng")}:num}`, after: `前 {${O(s, "prev_ng")}:num}`, state: NG_ONLY(s), why: `前 {${O(s, "prev_ng")}:num} 人` }),
    O3: (s) => ({ label: `基準超えの利用者（${L.OVER_SPAN[s]}）`, wide: true, state: WIDE(s), why: `要確認 {${O(s, "ng")}:num} 人・注意 {${O(s, "warn")}:num} 人` }),
    O4: (s) => ({ label: `${L.OVER_UNIT[s]} $${C.USER_COST_HIGH[s]} 以上`, value: `{${O(s, "ng")}:num}`, state: NG_ONLY(s), why: `前 {${O(s, "prev_ng")}:num} 人` }),
  };

  function overCard(s, form) {
    return { win: "bill", unit: "人", only: [PERIOD_OF[s]], tabs: ["over_users"], chip: s, better: "down", sub: "",
      ...FORMS[form](s), viz: { kind: "ov", form, span: s, src: src(s) } };
  }

  Object.keys(PERIOD_OF).forEach((s) => { K[`over_${s}`] = overCard(s, "O1"); });
  window.CATALOG.overCard = overCard;
})();
