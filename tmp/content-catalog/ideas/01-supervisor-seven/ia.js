"use strict";
// 案 01 監督の 7 ページ（concepts.md 5 節）。部品は parts.js の辞書から引く。
(() => {
  const { group, tab, page, settings, LONG, SAME } = window.PARTS;

  const use = page({
    id: "use", title: "利用", lead: "誰がどれだけの頻度で使っているか", periods: true,
    groups: [
      group("rec", "記録", "rec", ["K01", "K02", "K03", "K04", "K05"]),
      group("bill", "利用明細", "bill", ["K10", "K11", "K12", "K13"]),
    ],
    tabs: [tab("T05"), tab("T01"), tab("T17"), tab("T16"), tab("T14"), LONG && tab("T08")],
  });

  const cost = page({
    id: "cost", title: "コスト", lead: "いくらかかり、誰に集まっているか", periods: true,
    groups: [
      group("span", "期間", "bill", ["K20", "K21", "K24", "K23", "K40", "K41"]),
      group("month", "今月", "month", ["K27", "K28", "K29", "K30"]),
    ],
    tabs: [tab("T04"), tab("T02"), tab("T03"), tab("T06"), tab("T09"), LONG && tab("T08")],
  });

  const assets = page({
    id: "assets", title: "スキルとコマンド", lead: "配ったものや機能が使われているか", periods: true,
    groups: [
      group("calls", "呼び出し", "rec", ["K50", "K51", "K52", "K53"]),
      group("agent", "サブエージェント", "rec", ["K55", "K56"]),
    ],
    tabs: [tab("T11"), tab("T12"), tab("T13")],
  });

  const policy = page({
    id: "policy", title: "設定の適用状況", lead: "配った設定が有効か",
    groups: [
      group("who", "利用者", "p30", ["K80", "K81", "K90"]),
      group("set", "設定と更新", "p30", ["K82", "K92", "K93"]),
    ],
    tabs: [tab("T20"), tab("T21"), tab("T22"), tab("T23")],
  });

  const effect = page({
    id: "effect", title: "設定の効果", lead: "しきい値は働いているか",
    groups: [
      group("context", "コンテキスト", "study", ["K110", "K111"]),
      group("spend", "コストの前後", "study", ["K112", "K113", "K114"], { note: "前後の値は並べるだけです。時期の変動を含むため、前後差を施策の効果と読まないでください。" }),
    ],
    tabs: [tab("T40"), tab("T41"), tab("T42")],
  });

  const collect = page({
    id: "collect", title: "収集の状態", lead: "数字の元が正しく届いているか", periods: true,
    groups: [
      group("recv", "受信", "rec", ["K100", "K102", "K103", "K106"]),
      group("match", "照合", "match", ["K101", "K104"]),
      group("report", "報告", "p30", ["K91"]),
      group("csv", "利用明細", "now", ["K108"]),
    ],
    tabs: [tab("T30"), tab("T31"), tab("T32")],
  });

  const pages = [use, cost, assets, policy, effect, collect];

  // トップは定義を持たない。参照元のページ・群ごとに群を作り、窓の表記も参照元のまま出す
  const refs = [["use", "rec", ["K01"]], ["use", "bill", ["K10"]], ["cost", "span", ["K20", "K23"]], ["cost", "month", ["K27"]],
    ["policy", "who", ["K81", "K90"]], ["effect", "context", ["K110"]], ["collect", "recv", ["K102", "K103"]]];
  const topGroups = refs.map(([pid, gid, ids]) => {
    const p = pages.find((x) => x.id === pid);
    const g = p.groups.find((x) => x.id === gid);
    return { ...g, id: `${pid}-${gid}`, label: `${p.title} · ${g.label}`, cards: ids.map((k) => ({ ...g.cards.find((c) => c.ref === k), page: p })) };
  });
  const top = { id: "top", title: "トップ", lead: "全体でいま何を見るべきか", periods: true, groups: topGroups };

  // トップのカードは、参照元のページの該当するタブへ移る
  document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(location.search);
    if ((params.get("page") || "top") !== "top") return;
    const period = params.get("period");
    const shown = topGroups.flatMap((g) => g.cards.map((c) => (!LONG || c.long === SAME ? c : c.long ? { ...c.long, page: c.page } : null)).filter(Boolean));
    document.querySelectorAll(".kpis .card").forEach((el, i) => {
      const c = shown[i];
      if (!c || !c.tab || el.tagName !== "A") return;
      const p = c.page;
      el.href = `?page=${p.id}${p.periods && period ? `&period=${period}` : ""}#${c.tab}${c.chip ? `:${c.chip}` : ""}`;
      el.removeAttribute("data-open");
    });
  });

  window.IA = { id: "01-supervisor-seven", name: "案 01 監督の 7 ページ", pages: [top, ...pages, settings] };
})();
