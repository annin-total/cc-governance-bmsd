"use strict";
// 案 08: 月次の報告を中心にする（月次・利用・コスト・設定と端末）。部品は parts.js から引く。
(() => {
  const { K, card, tab, page, W, SETTINGS } = window.PARTS;
  const POL = "fixed.policy";
  const long = (id) => ({ ...K[id].long });
  const cards = (ids) => ids.map((id) => card(id));
  const tabs = (ids) => ids.map((id) => tab(id));

  const monthly = page({
    id: "monthly", title: "月次", lead: "今月はいくらで着地し、前月はいくらだったか",
    groups: [
      { id: "now", label: "今月", scope: W.monthNow, cards: cards(["K27", "K28", "K29"]) },
      { id: "prev", label: "前月", scope: W.monthPrev, cards: cards(["K30", "PrevUsers"]) },
      { id: "year", label: "12 か月", data: "p.12m", scope: W.bill12, cards: [long("K20"), long("K10")] },
    ],
    tabs: [tab("T03"), tab("T04months"), tab("T08", { data: "p.12m" })],
  });

  const usage = page({
    id: "usage", title: "利用", lead: "誰がどれだけの頻度で使っているか", periods: true,
    groups: [
      { id: "rec", label: "記録", scope: W.rec, longScope: W.recLong, cards: cards(["K01", "K02", "K03", "K04"]) },
      { id: "bill", label: "利用明細", scope: W.bill, longScope: W.billLong, cards: cards(["K10", "K11", "K12", "K13"]) },
    ],
    tabs: tabs(["T05", "T01", "T17", "T11", "T12"]),
  });

  // 12 か月のコストは月次のページが受け持つため、コストのページの 12 か月は利用者ごととモデルだけにする。
  // キットの「記録から数えるため出しません」の文言はこのページでは誤りになるので、このページを開いたときだけ差し替える
  if (new URLSearchParams(location.search).get("page") === "cost") {
    Object.assign(window.KIT.L, {
      NOT_LONG_CARDS: "{names}は 12 か月では出しません（12 か月のコストは月次のページ、増えた利用者は前の期間と比べるため）",
      NOT_LONG_PANEL: "12 か月では出しません。12 か月のコストの推移は月次のページで見られます。",
    });
  }
  const cost = page({
    id: "cost", title: "コスト", lead: "直近の期間にいくらかかり、何に集まっているか", periods: true,
    groups: [
      { id: "p", label: "期間", scope: W.bill, longScope: W.billLong,
        cards: [card("K20", { long: undefined }), ...cards(["K21", "K24", "K26", "K40", "K41"])] },
    ],
    tabs: tabs(["T04", "T02", "T06", "T09"]),
  });

  const ops = page({
    id: "ops", title: "設定と端末", lead: "設定が入り、端末が記録を送っているか",
    groups: [
      { id: "pol", label: "設定", data: POL, scope: W.pol, cards: cards(["K80", "K81", "K82"]) },
      { id: "term", label: "端末", data: POL, scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件", cards: cards(["K90", "K91", "K93"]) },
      { id: "recv", label: "受信", scope: "直近 {period[days]} 日と、その前の {period[days]} 日 · 端末から届いた記録", cards: cards(["K100", "K102", "K103"]) },
      { id: "thr", label: "しきい値", data: "fixed.effect", scope: W.effect + " · 前後の値は並べるだけで、施策の効果とは読まない",
        cards: cards(["K110", "K111", "K113", "K114"]) },
    ],
    tabs: tabs(["T20", "T21", "T22", "T23", "T30", "T31", "T40", "T42"]),
  });

  window.IA = { id: "08-monthly-report", name: "案 08 月次の報告を中心にする", pages: [monthly, usage, cost, ops, SETTINGS] };
})();
