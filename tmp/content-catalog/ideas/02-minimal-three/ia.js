"use strict";
// 案 02 最小の 3 ページ（concepts.md 5 節）。部品は parts.js の辞書から引く。
(() => {
  const { group, tab, page, settings } = window.PARTS;

  const use = page({
    id: "use", title: "利用", lead: "誰がどれだけ、何に使っているか", periods: true,
    groups: [
      group("rec", "記録の利用者", "rec", ["K01", "K03", "K04", "K52", "K55"]),
      group("bill", "利用明細の利用者", "bill", ["K10", "K11", "K12"]),
    ],
    tabs: [tab("T05"), tab("T01"), tab("T11"), tab("T12"), tab("T14")],
  });

  const cost = page({
    id: "cost", title: "コスト", lead: "いくらかかり、誰とどのモデルに集まっているか", periods: true,
    groups: [
      group("span", "期間", "bill", ["K20", "K21", "K24", "K23", "K40", "K41"]),
      group("month", "今月", "month", ["K27", "K28"]),
    ],
    tabs: [tab("T04"), tab("T02"), tab("T03"), tab("T06")],
  });

  const device = page({
    id: "device", title: "端末", lead: "端末に設定が入り、記録が届いているか",
    groups: [
      group("set", "設定", "p30", ["K80", "K81", "K82"]),
      group("install", "導入と版", "p30", ["K90", "K91", "K92", "K93"]),
      group("threshold", "しきい値の働き", "study", ["K110", "K111"]),
      group("recv", "受信", "rec7", ["K100", "K102", "K103"]),
      group("match", "照合", "match7", ["K101"]),
    ],
    tabs: [tab("T20"), tab("T21"), tab("T22"), tab("T23"), tab("T40"), tab("T30"), tab("T31")],
  });

  window.IA = { id: "02-minimal-three", name: "案 02 最小の 3 ページ", pages: [use, cost, device, settings] };
})();
