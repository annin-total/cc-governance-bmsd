"use strict";
// 案 07: 見る人で分ける（利用状況・報告・運用の点検）。期間の切り替えは利用状況の 7 日・28 日だけ（data-extra.js）。部品は parts.js から引く。
(() => {
  const { K, T, card, tab, page, W, SETTINGS } = window.PARTS;
  const POL = "fixed.policy";
  const long = (id) => ({ ...K[id].long });
  const cards = (ids) => ids.map((id) => card(id));
  const tabs = (ids) => ids.map((id) => tab(id));

  const usage = page({
    id: "usage", title: "利用状況", lead: "誰がどれだけ、何に使い、いくらかかっているか", periods: true,
    groups: [
      { id: "bill", label: "利用明細", scope: W.bill, cards: cards(["K10", "K20", "K21", "K23", "K40"]) },
      { id: "rec", label: "記録", scope: W.rec, cards: cards(["K01", "K03", "K04", "K52", "K55"]) },
    ],
    tabs: tabs(["T04", "T05", "T06", "T11", "T12"]),
  });

  const report = page({
    id: "report", title: "報告", lead: "報告に載せる今月・前月・1 年の数字は何か",
    groups: [
      { id: "month", label: "今月と前月", scope: W.month, cards: cards(["K27", "K30", "K28", "K29"]) },
      { id: "year", label: "12 か月", data: "p.12m", scope: W.bill12, cards: [long("K20"), long("K10"), long("K12"), card("K24")] },
    ],
    tabs: [tab("T03"), tab("T08", { data: "p.12m" }), { ...T.T04.long, id: "people", data: "p.12m" }],
  });

  const ops = page({
    id: "ops", title: "運用の点検", lead: "端末・設定・収集は正しく動いているか",
    groups: [
      { id: "pol", label: "設定", data: POL, scope: W.pol, cards: cards(["K80", "K81", "K82", "K85"]) },
      { id: "term", label: "端末", data: POL, scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件", cards: cards(["K90", "K91", "K92", "K93"]) },
      { id: "recv", label: "受信", scope: "直近 {period[days]} 日と、その前の {period[days]} 日 · 端末から届いた記録", cards: cards(["K100", "K102", "K103", "K107"]) },
      { id: "match", label: "照合", scope: W.match + " · 鮮度は今日時点", cards: cards(["K101", "K104", "K108"]) },
      { id: "thr", label: "しきい値", data: "fixed.effect", scope: W.effect, cards: cards(["K110", "K111"]) },
    ],
    tabs: tabs(["T20", "T21", "T22", "T23", "T25", "T30", "T31", "T32", "T40"]),
  });

  window.IA = { id: "07-by-audience", name: "案 07 見る人で分ける", pages: [usage, report, ops, SETTINGS] };
})();
