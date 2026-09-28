"use strict";
// スキル・コマンドの利用。7 日・28 日は今の型のまま値を差し替え、12 か月は案ごとの TWELVE に任せる
const A = (() => {
  const { D, h, int, signed } = L;
  const TREND = [["all", "すべて"], ["up", "増えた"], ["down", "減った"], ["flat", "変わらない"]];

  function callCard(open, label, x, N, capText) {
    return P.card({ open, wide: true, label, value: int(x.recent), unit: "回", change: [signed(x.delta), x.delta > 0], sub: `前の ${N} 日 ${int(x.prev)} 回 · ${x.kinds} 種類`,
      viz: [h("span", { class: "rates wide" }, x.top.map((t) => h("span", { class: "rate" }, h("span", {}, t.key), P.hbar(t.share),
        h("span", { class: "num" }, `${t.calls} 回`), h("span", { class: "num strong" }, `${t.share.toFixed(1)}%`)))), P.cap(capText)] });
  }

  function top(N) {
    const p = D.periods[N];
    return [
      P.group("呼び出し", `直近 ${N} 日と、その前の ${N} 日`, [
        callCard("skills", "スキルの呼び出し", p.skills, N, `呼び出しの多い順 · 割合は直近 ${N} 日の全呼び出しのうち`),
        callCard("commands", "コマンドの呼び出し", p.commands, N, `呼び出しの多い順（定義元をまたいで合計）· 割合は直近 ${N} 日の全呼び出しのうち`)]),
      P.group("サブエージェント", `直近 ${N} 日 · 分母は全記録`, [P.card({ open: "agent", label: "サブエージェントの中の記録", value: p.agent.rate.toFixed(1), unit: "%",
        sub: `${int(p.agent.numerator)} 件 / 全 ${int(p.agent.denominator)} 件`, viz: [P.meter(p.agent.rate), P.cap("サブエージェントの中で起きた記録の割合")] })]),
    ];
  }

  function callPanel(id, N, x, withSource) {
    const max = Math.max(...x.rows.map((r) => r.recent_calls));
    const code = (v) => (v ? h("span", { class: "code" }, v) : P.sub("—"));
    const cols = [{ label: id === "skills" ? "スキル" : "コマンド", cls: "c-code" }, withSource ? { label: "定義元", cls: "c-code" } : null,
      { label: "呼び出し回数", cls: "c-num num" }, { cls: "c-bar" }, { label: `前の ${N} 日`, cls: "c-num_sub num" }, { label: "差", cls: "c-diff num" },
      { label: "利用者数", cls: "c-num num" }, { label: "利用者の差", cls: "c-diff num" }].filter(Boolean);
    const rows = x.rows.map((r) => ({ tags: r.trend, q: `${r.name} ${r.source || "—"}`, cells: [{ v: r.name, cls: "c-code", content: code(r.name) },
      withSource ? { v: r.source || "", cls: "c-code", content: code(r.source) } : null,
      { v: r.recent_calls, cls: "c-num num", content: `${int(r.recent_calls)} 回` }, { v: r.recent_calls, cls: "c-bar", content: P.hbar((r.recent_calls / max) * 100) },
      { v: r.prev_calls, cls: "c-num_sub num", content: P.sub(int(r.prev_calls)) }, { v: r.calls_diff, cls: "c-diff num", content: signed(r.calls_diff) },
      { v: r.recent_users, cls: "c-num num", content: `${r.recent_users} 人` }, { v: r.users_diff, cls: "c-diff num", content: signed(r.users_diff) }].filter(Boolean) }));
    const count = (k) => (k === "all" ? x.rows.length : x.rows.filter((r) => r.trend === k).length);
    const noun = id === "skills" ? "スキル" : "コマンド";
    return P.panel(id, `${noun}ごとの呼び出し回数と利用者数`, `直近 ${N} 日と前の ${N} 日 · ${noun}の呼び出しの記録${withSource ? " · 定義元は記録された値のまま" : ""}`,
      P.filters({ search: withSource ? "コマンド名・定義元で絞り込み" : "スキル名で絞り込み", chips: TREND.map(([k, l]) => [k, l, count(k)]), total: x.rows.length, unit: "行" }),
      P.table(id, cols, rows, withSource ? 2 : 1),
      h("p", { class: "note" }, `${withSource ? "同じコマンドでも定義元が違えば別の行です。" : ""}差は直近から前の ${N} 日を引いた値です。増えた・減ったは呼び出し回数の差で分けます。`));
  }

  function agentPanel(N) {
    const a = D.periods[N].agent, NAME = { agent: "サブエージェントの中", main: "サブエージェントの外" };
    return P.panel("agent", "サブエージェントの利用", `直近 ${N} 日 · 分母は全記録 ${int(a.denominator)} 件`,
      P.filters({ total: a.rows.length, unit: "行" }),
      P.table("agent", [{ label: "記録", cls: "c-term" }, { label: "件数", cls: "c-num num" }, { label: "割合", cls: "c-pct_strong num" }, { cls: "c-bar" }],
        a.rows.map((r) => ({ cells: [{ v: r.kind, cls: "c-term", content: NAME[r.kind] }, { v: r.count, cls: "c-num num", content: `${int(r.count)} 件` },
          { v: r.share, cls: "c-pct_strong num", content: h("b", {}, `${r.share.toFixed(1)}%`) }, { v: r.share, cls: "c-bar", content: P.hbar(r.share) }] }))),
      h("p", { class: "note" }, "サブエージェントの中で起きた記録にだけ、サブエージェントの識別子が付きます。"));
  }

  function render(p) {
    const topEl = document.getElementById("top"), detail = document.getElementById("detail");
    detail.hidden = false;
    detail.querySelector("[data-off]")?.remove();
    for (const t of detail.querySelectorAll("[data-tab]")) t.removeAttribute("aria-disabled");
    if (p === "12m") { TWELVE.assets(topEl, detail); return; }
    const N = Number(p), x = D.periods[N];
    topEl.replaceChildren(...top(N));
    const sub = { skills: `${x.skills.kinds} 種類 · ${int(x.skills.recent)} 回`, commands: `${x.commands.kinds} 種類 · ${int(x.commands.recent)} 回`, agent: `直近 ${N} 日 · ${x.agent.rate.toFixed(1)}%` };
    for (const t of detail.querySelectorAll("[data-tab]")) t.querySelector("span").textContent = sub[t.dataset.tab];
    detail.querySelector("[data-panel=skills]").replaceWith(callPanel("skills", N, x.skills, false));
    detail.querySelector("[data-panel=commands]").replaceWith(callPanel("commands", N, x.commands, true));
    detail.querySelector("[data-panel=agent]").replaceWith(agentPanel(N));
    L.openTab(detail, location.hash.slice(1), false);
  }

  function start() {
    L.switcher(document.getElementById("switch"), render);
    render(L.period());
  }

  return { start };
})();
