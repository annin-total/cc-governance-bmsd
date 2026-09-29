"use strict";
// 案 03 対象で分ける（concepts.md 5 節）。部品は parts.js の辞書から引く。
(() => {
  const { group, tab, page, settings, LONG } = window.PARTS;

  const users = page({
    id: "users", title: "利用者", lead: "誰がどれだけ使い、いくらかかっているか", periods: true,
    groups: [
      group("bill", "人数とコスト", "bill", ["K10", "K21", "K24", "K23", "K25"]),
      group("rec", "使い方", "rec", ["K01", "K02", "K03", "K04"]),
    ],
    tabs: [tab("T04"), tab("T05"), tab("T17"), tab("T09")],
  });

  const models = page({
    id: "models", title: "モデル", lead: "どのモデルにいくらかかり、トークンはどう使われているか", periods: true,
    groups: [
      group("span", "合計とモデル", "bill", ["K20", "K40", "K46", "K43", "K41"]),
      group("month", "今月", "month", ["K27", "K28"]),
    ],
    tabs: [tab("T06"), tab("T02"), tab("T03"), tab("T07"), LONG && tab("T08")],
  });

  const assets = page({
    id: "assets", title: "スキルとコマンド", lead: "どの機能が誰に使われているか", periods: true,
    groups: [
      group("calls", "スキルとコマンド", "rec", ["K50", "K51", "K52", "K53", "K54"]),
      group("tools", "ツールとサブエージェント", "rec", ["K60", "K55", "K58"]),
    ],
    tabs: [tab("T11"), tab("T12"), tab("T13")],
  });

  const policy = page({
    id: "policy", title: "設定", lead: "配った設定が効き、権限はどう使われているか",
    groups: [
      group("apply", "適用", "p30", ["K80", "K81", "K82", "K83"]),
      group("perm", "権限と effort", "rec28", ["K63", "K65"]),
      group("threshold", "しきい値の働き", "study", ["K110", "K111"]),
    ],
    tabs: [tab("T20"), tab("T22"), tab("T24"), tab("T14", { data: "p.28" }), tab("T40"), tab("T41"), tab("T42")],
  });

  const device = page({
    id: "device", title: "端末", lead: "端末は最新で、記録を送っているか",
    groups: [
      group("install", "導入と版", "p30", ["K90", "K91", "K92", "K93"]),
      group("recv", "受信", "rec7", ["K100", "K102", "K103"]),
      group("match", "照合", "match7", ["K101", "K104"]),
    ],
    tabs: [tab("T21"), tab("T23"), tab("T30"), tab("T31"), tab("T32")],
  });

  window.IA = { id: "03-by-object", name: "案 03 対象で分ける", pages: [users, models, assets, policy, device, settings] };
})();
