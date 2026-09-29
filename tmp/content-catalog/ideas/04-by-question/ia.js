"use strict";
// 案 04 問いで分ける（concepts.md 5 節）。群の見出しも問いにし、カードは群あたり 4 枚まで。部品は parts.js の辞書から引く。
(() => {
  const { T, group, tab, page, settings } = window.PARTS;
  const FREQ_COLS = ["email", "active_days", "sessions", "prompts", "prompts_per_session", "last_day"];

  const people = page({
    id: "people", title: "人数と頻度", lead: "何人が、どれだけの頻度で使っているか", periods: true,
    groups: [
      group("who", "何人が使ったか", "bill", ["K10", "K12", "K13"]),
      group("freq", "どれだけの頻度か", "rec", ["K02", "K03", "K05"]),
    ],
    tabs: [tab("T05", { cols: T.T05.cols.filter((c) => FREQ_COLS.includes(c.key)) }), tab("T17"), tab("T01")],
  });

  const spend = page({
    id: "spend", title: "支出", lead: "いくらかかり、どこに集まっているか", periods: true,
    groups: [
      group("how", "いくらか", "bill", ["K20", "K21", "K22"]),
      group("where", "誰に集まるか", "bill", ["K24", "K23", "K26"]),
      group("month", "今月はいくらになるか", "month", ["K27", "K28", "K30"]),
    ],
    tabs: [tab("T04"), tab("T02"), tab("T03"), tab("T09")],
  });

  const work = page({
    id: "work", title: "作業の中身", lead: "何をどう任せているか", periods: true,
    groups: [
      group("what", "何を使ったか", "rec", ["K52", "K53", "K55", "K60"]),
      group("delegate", "どれだけ任せたか", "rec", ["K04", "K06", "K07", "K67"]),
    ],
    tabs: [tab("T11"), tab("T12"), tab("T13"), tab("T15"), tab("T14")],
  });

  const policy = page({
    id: "policy", title: "設定の適用", lead: "配った設定が効いているか",
    groups: [
      group("values", "値は入っているか", "p30", ["K80", "K81", "K82"]),
      group("threshold", "しきい値は働いているか", "study", ["K110", "K111"]),
      group("bypass", "確認なしで動かしている人はいるか", "rec28", ["K63"]),
    ],
    tabs: [tab("T20"), tab("T22"), tab("T40"), tab("T41")],
  });

  const trust = page({
    id: "trust", title: "データの確かさ", lead: "この画面の数字は信用できるか",
    groups: [
      group("recv", "届いているか", "rec7", ["K100", "K102", "K103"]),
      group("match", "利用明細と合っているか", "match7", ["K101", "K104", "K108"]),
      group("device", "端末は動いているか", "p30", ["K90", "K91", "K92", "K93"]),
    ],
    tabs: [tab("T30"), tab("T31"), tab("T32"), tab("T21"), tab("T23")],
  });

  window.IA = { id: "04-by-question", name: "案 04 問いで分ける", pages: [people, spend, work, policy, trust, settings] };
})();
