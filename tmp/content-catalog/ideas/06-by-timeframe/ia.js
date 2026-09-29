"use strict";
// 案 06: 時間軸で分ける（今月・直近・1 年）。期間の切り替えは直近のページの 7 日・28 日だけ（data-extra.js）。部品は parts.js から引く。
(() => {
  const { K, T, card, tab, page, W, SETTINGS } = window.PARTS;
  const POL = "fixed.policy";
  const long = (id) => ({ ...K[id].long }); // 12 か月の形を常に出す（1 年のページは p.12m に固定）

  const month = page({
    id: "month", title: "今月", lead: "今月はいくらで着地し、誰に集まっているか",
    groups: [
      { id: "fc", label: "見込み", scope: W.month, cards: [card("K27"), card("K28"), card("K29"), card("K30")] },
      { id: "who", label: "今月の利用者", scope: W.monthNow, cards: [card("MonthTop")] },
    ],
    tabs: [tab("T03"), tab("T04now")],
  });

  const recent = page({
    id: "recent", title: "直近", lead: "最近、誰が何にどれだけ使っているか", periods: true,
    groups: [
      { id: "bill", label: "利用明細", scope: W.bill, cards: ["K10", "K20", "K21", "K24", "K23", "K40", "K41"].map((id) => card(id)) },
      { id: "rec", label: "記録", scope: W.rec, cards: ["K01", "K03", "K04", "K52", "K53", "K63"].map((id) => card(id)) },
      { id: "pol", label: "設定", data: POL, scope: W.pol, cards: ["K80", "K81", "K90", "K91"].map((id) => card(id)) },
      { id: "recv", label: "受信", scope: "直近 {period[days]} 日と、その前の {period[days]} 日 · 端末から届いた記録", cards: ["K100", "K102", "K103"].map((id) => card(id)) },
    ],
    tabs: ["T04", "T05", "T06", "T11", "T12", "T20", "T21", "T30", "T31"].map((id) => tab(id)),
  });

  const year = page({
    id: "year", title: "1 年", lead: "利用とコストはどう伸びてきたか", data: "p.12m",
    groups: [
      { id: "y", label: "12 か月", scope: W.bill12,
        cards: [long("K20"), long("K10"), long("K12"),
          card("K40", { sub: "12 か月の合計の内訳 · 月ごとの構成は一覧", tab: "months" }), card("K24")] },
      { id: "pol", label: "設定の推移", scope: W.polTrend, cards: [card("K83")] },
      { id: "thr", label: "しきい値", data: "fixed.effect", scope: W.effect, cards: [card("K110"), card("K111"), card("K112")] },
    ],
    tabs: [tab("T08"), tab("T02w"), { ...T.T04.long, id: "people" }, tab("T24"), tab("T40"), tab("T41")],
  });

  window.IA = { id: "06-by-timeframe", name: "案 06 時間軸で分ける", pages: [month, recent, year, SETTINGS] };
})();
