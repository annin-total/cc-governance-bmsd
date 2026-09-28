"use strict";
// スキル・コマンドの利用の上段と一覧を、選んだ期間で描き直す（12 か月は記録由来なので出さない）
(() => {
  const { h, val, fmt, nf, signed } = UI;
  const D = window.DATA;
  const PERIODS = [{ id: "7", label: "7 日" }, { id: "28", label: "28 日" }, { id: "12m", label: "12 か月" }];
  // サブエージェントは data に期間ごとの値が無いので、本物の画面の 7 日の値を置く
  const AGENT = { rate: 4.6, num: 167, den: 3592 };
  const TREND = [["all", "すべて"], ["up", "増えた"], ["down", "減った"], ["flat", "変わらない"]];

  const hbar = (pct) => h("span", { class: "hbar" }, h("i", { style: `width: ${pct.toFixed(1)}%` }));
  const change = (d) => h("span", { class: d > 0 ? "change up" : "change" }, signed(d));
  const group = (name, scope, kids, note) => h("section", { class: "group", "aria-label": name },
    h("h2", { class: "glabel" }, name, h("span", {}, scope)), kids ? h("div", { class: "cards" }, kids) : null, note ? h("p", { class: "gnote" }, note) : null);

  function callsCard(id, label, S, n, capText) {
    return h("a", { class: "card wide", href: `#${id}`, "data-open": id },
      h("span", { class: "k-label" }, h("span", {}, label), h("span", { class: "go" }, "一覧")),
      h("span", { class: "k-value" }, val(fmt.count(S.recent, "回"), true)),
      h("span", { class: "k-sub" }, change(S.delta), `前の ${n} 日 `, val(fmt.count(S.prev, "回")), ` · ${S.kinds} 種類`),
      h("span", { class: "k-viz" }, h("span", { class: "rates wide" }, S.top.map((t) => h("span", { class: "rate" },
        h("span", {}, t.key), hbar(t.share), h("span", { class: "num" }, val(fmt.count(t.calls, "回"))), h("span", { class: "num strong" }, val(fmt.pct(t.share)))))),
      h("span", { class: "cap" }, h("span", {}, capText(n)))));
  }

  function agentCard() {
    return h("a", { class: "card", href: "#agent", "data-open": "agent" },
      h("span", { class: "k-label" }, h("span", {}, "サブエージェントの中の記録"), h("span", { class: "go" }, "一覧")),
      h("span", { class: "k-value" }, val(fmt.pct(AGENT.rate), true)),
      h("span", { class: "k-sub" }, val(fmt.count(AGENT.num, "件")), " / 全 ", val(fmt.count(AGENT.den, "件"))),
      h("span", { class: "k-viz" }, h("span", { class: "meter" }, h("i", { style: `width: ${AGENT.rate}%` })), h("span", { class: "cap" }, h("span", {}, "サブエージェントの中で起きた記録の割合"))));
  }

  function panel(id, S, n, withSource) {
    const max = Math.max(...S.rows.map((r) => r.recent_calls));
    const counts = Object.fromEntries(TREND.map(([k]) => [k, k === "all" ? S.rows.length : S.rows.filter((r) => r.trend === k).length]));
    const cols = [[withSource ? "コマンド" : "スキル", "c-code"], ...(withSource ? [["定義元", "c-code"]] : []), ["呼び出し回数", "c-num num"], ["", "c-bar"],
      [`前の ${n} 日`, "c-num_sub num"], ["差", "c-diff num"], ["利用者数", "c-num num"], ["利用者の差", "c-diff num"]];
    const sortCol = withSource ? 2 : 1;
    const rows = S.rows.map((r) => h("tr", { "data-tags": r.trend, "data-q": `${r.name} ${r.source ?? "—"}` },
      h("td", { class: "c-code", "data-v": r.name }, h("span", { class: "code" }, r.name)),
      withSource ? h("td", { class: "c-code", "data-v": r.source ?? "" }, r.source ? h("span", { class: "code" }, r.source) : h("span", { class: "sub" }, "—")) : null,
      h("td", { class: "c-num num", "data-v": r.recent_calls }, val(fmt.count(r.recent_calls, "回"))),
      h("td", { class: "c-bar", "data-v": r.recent_calls }, hbar((r.recent_calls / max) * 100)),
      h("td", { class: "c-num_sub num", "data-v": r.prev_calls }, h("span", { class: "sub" }, nf(r.prev_calls))),
      h("td", { class: "c-diff num", "data-v": r.calls_diff }, signed(r.calls_diff)),
      h("td", { class: "c-num num", "data-v": r.recent_users }, val(fmt.count(r.recent_users, "人"))),
      h("td", { class: "c-diff num", "data-v": r.users_diff }, signed(r.users_diff))));
    const what = withSource ? "コマンド" : "スキル";
    return [
      h("header", { class: "p-head" }, h("h2", {}, `${what}ごとの呼び出し回数と利用者数`),
        h("p", { class: "scope" }, `直近 ${n} 日と前の ${n} 日 · ${what}の呼び出しの記録${withSource ? " · 定義元は記録された値のまま" : ""}`)),
      h("div", { class: "filters", "data-filter": "" },
        h("label", { class: "search" }, h("span", { class: "sr" }, "絞り込み"), h("input", { type: "search", placeholder: withSource ? "コマンド名・定義元で絞り込み" : "スキル名で絞り込み", "data-search": "" })),
        h("div", { class: "chipbar", role: "group", "aria-label": "区分" }, TREND.map(([k, l]) => h("button", { type: "button", "data-chip": k, "aria-pressed": String(k === "all") }, l, h("b", {}, counts[k])))),
        h("span", { class: "count" }, h("b", { "data-shown": "" }, S.rows.length), ` / ${S.rows.length} 行`)),
      h("div", { class: "tscroll" }, h("table", { "data-testid": id },
        h("thead", {}, h("tr", {}, cols.map(([t, c], i) => h("th", { scope: "col", class: c, "aria-sort": i === sortCol ? "descending" : null },
          t ? h("button", { type: "button", "data-sort": i }, t, h("i", { class: "arrow" })) : "")))),
        h("tbody", {}, rows)), h("p", { class: "empty", "data-empty": "", hidden: "" }, "条件に合う行はありません。")),
      h("p", { class: "note" }, `${withSource ? "同じコマンドでも定義元が違えば別の行です。" : ""}差は直近から前の ${n} 日を引いた値です。増えた・減ったは呼び出し回数の差で分けます。`),
    ];
  }

  function render(p) {
    const kpis = document.querySelector("[data-kpis]");
    const detail = document.querySelector("#detail");
    for (const b of document.querySelectorAll("[data-period]")) b.setAttribute("aria-pressed", String(b.dataset.period === p));
    if (p === "12m") {
      kpis.replaceChildren(group("呼び出し", "端末の記録から数えるため、12 か月では出しません。7 日か 28 日で見ます"),
        group("サブエージェント", "端末の記録から数えるため、12 か月では出しません"));
      detail.hidden = true;
      return;
    }
    const P = D.periods[p];
    detail.hidden = false;
    kpis.replaceChildren(
      group("呼び出し", `直近 ${p} 日と、その前の ${p} 日`, [
        callsCard("skills", "スキルの呼び出し", P.skills, p, (n) => `呼び出しの多い順 · 割合は直近 ${n} 日の全呼び出しのうち`),
        callsCard("commands", "コマンドの呼び出し", P.commands, p, (n) => `呼び出しの多い順（定義元をまたいで合計）· 割合は直近 ${n} 日の全呼び出しのうち`)]),
      group("サブエージェント", "直近 7 日 · 分母は全記録", [agentCard()]));
    document.querySelector('[data-panel="skills"]').replaceChildren(...panel("skills", P.skills, p, false));
    document.querySelector('[data-panel="commands"]').replaceChildren(...panel("commands", P.commands, p, true));
    const tab = (id, S) => { document.querySelector(`#tab-${id} span`).replaceChildren(`${S.kinds} 種類 · `, val(fmt.count(S.recent, "回"))); };
    tab("skills", P.skills);
    tab("commands", P.commands);
  }

  const sw = document.querySelector("[data-period-switch]");
  sw.replaceChildren(...PERIODS.map((x) => h("button", { type: "button", "data-period": x.id }, x.label)));
  const q = new URLSearchParams(location.search).get("p");
  let p = PERIODS.some((x) => x.id === q) ? q : "7";
  sw.addEventListener("click", (e) => {
    const b = e.target.closest("[data-period]");
    if (!b || b.dataset.period === p) return;
    p = b.dataset.period;
    history.replaceState(null, "", `?p=${p}${location.hash}`);
    render(p);
  });
  render(p);
  UI.tooltips();
})();
