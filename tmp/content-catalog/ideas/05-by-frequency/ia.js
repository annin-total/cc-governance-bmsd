"use strict";
// 案 05: 見る頻度で分ける（日々の確認・月の集計・分析）。部品は parts.js（concepts.md 3 節の辞書）から引く。
(() => {
  const { card, tab, page, W, SETTINGS, SAME } = window.PARTS;
  const POL = "fixed.policy";

  const daily = page({
    id: "daily", title: "日々の確認", lead: "今日、手を打つべきことはあるか",
    groups: [
      { id: "recv", label: "受信", scope: "直近 {period[days]} 日と、その前の {period[days]} 日 · 端末から届いた記録", cards: [card("K100"), card("K102"), card("K103")] },
      { id: "term", label: "端末", data: POL, scope: W.pol, cards: [card("K81"), card("K90"), card("K91")] },
      { id: "use", label: "利用", scope: W.rec, cards: [card("K01"), card("K05")] },
    ],
    tabs: [tab("T30"), tab("T31"), tab("T20"), tab("T01")],
  });

  const month = page({
    id: "month", title: "月の集計", lead: "今月と前月はいくらで、誰に集まったか",
    groups: [
      { id: "cost", label: "今月と前月", scope: W.month, cards: [card("K27"), card("K28"), card("K29"), card("K30")] },
      { id: "who", label: "今月の利用者", scope: W.monthNow, cards: [card("MonthUsers"), card("MonthTop")] },
    ],
    tabs: [tab("T03"), tab("T04now"), tab("T08", { data: "p.12m" })],
  });

  const analysis = page({
    id: "analysis", title: "分析", lead: "使われ方とコストの中身はどうなっているか", periods: true,
    groups: [
      { id: "cost", label: "コスト", scope: W.bill, longScope: W.billLong, cards: [card("K20"), card("K24"), card("K40"), card("K41")] },
      { id: "who", label: "利用者", scope: W.bill, longScope: W.billLong, cards: [card("K10"), card("K12"), card("K13")] },
      { id: "how", label: "使い方", scope: W.rec, longScope: W.recLong, cards: [card("K03"), card("K52"), card("K55"), card("K67")] },
      { id: "pol", label: "設定", data: POL, scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件 · 推移は週ごと", longScope: "期間に依らない · 直近 {POLICY_DAYS} 日",
        cards: [card("K82"), card("K83")] },
      { id: "thr", label: "しきい値", data: "fixed.effect", scope: W.effect, longScope: W.effect, cards: [card("K110"), card("K111")] },
    ],
    tabs: [tab("T04"), tab("T06"), tab("T05"), tab("T11"), tab("T12"), tab("T13"), tab("T22"), tab("T24"), tab("T40")],
  });

  window.IA = { id: "05-by-frequency", name: "案 05 見る頻度で分ける", pages: [daily, month, analysis, SETTINGS] };
})();
