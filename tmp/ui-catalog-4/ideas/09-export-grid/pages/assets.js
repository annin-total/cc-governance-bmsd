"use strict";
// スキル・コマンドの利用。7 日・28 日は今の画面と同じ（選んだ期間の値）。12 か月はすべて記録から数えるため、群は注記、タブは「出しません」
(() => {
  const D = window.DATA, F = window.Fmt, U = window.UI, P = window.Period, Tw = window.Twelve;
  const TREND = [["up", "増えた"], ["down", "減った"], ["flat", "変わらない"]];
  const TITLE = { skills: "スキルごとの呼び出し回数と利用者数", commands: "コマンドごとの呼び出し回数と利用者数", agent: "サブエージェントの利用" };

  const code = (s) => `<span class="code">${F.esc(s)}</span>`;
  const topRates = (top) => `<span class="rates wide">${top.map((t) => `<span class="rate"><span>${F.esc(t.key)}</span>${U.hbarSpan(t.share)}<span class="num">${F.withUnit(t.calls, "回")}</span><span class="num strong">${F.pct(t.share)}</span></span>`).join("")}</span>`;
  const callCard = (label, open, s, n, capText) => U.card({ label, open, cls: "wide", value: F.int(s.recent), unit: "回",
    sub: `${U.change(F.signed(s.delta), s.delta > 0)}前の ${n} 日 ${F.withUnit(F.int(s.prev), "回")} · ${s.kinds} 種類`, viz: topRates(s.top) + U.cap(capText) });

  function groups(k) {
    if (P.is12m(k)) {
      return U.group("呼び出し", "直近 12 か月", "", Tw.groupNote(["スキルの呼び出し", "コマンドの呼び出し"]))
        + U.group("サブエージェント", "直近 12 か月", "", Tw.groupNote(["サブエージェントの中の記録"]));
    }
    const p = D.periods[k], n = Number(k), a = p.agent;
    return U.group("呼び出し", `直近 ${n} 日と、その前の ${n} 日`, callCard("スキルの呼び出し", "skills", p.skills, n, `呼び出しの多い順 · 割合は直近 ${n} 日の全呼び出しのうち`)
      + callCard("コマンドの呼び出し", "commands", p.commands, n, `呼び出しの多い順（定義元をまたいで合計）· 割合は直近 ${n} 日の全呼び出しのうち`))
      + U.group("サブエージェント", `直近 ${n} 日 · 分母は全記録`, U.card({ label: "サブエージェントの中の記録", open: "agent", value: F.fixed(a.rate, 1), unit: "%",
        sub: `${F.int(a.numerator)} 件 / 全 ${F.int(a.denominator)} 件`, viz: U.meter(a.rate, "サブエージェントの中で起きた記録の割合") }));
  }

  function callTable(id, rows, n, withSource) {
    const max = Math.max(...rows.map((r) => r.recent_calls));
    const trs = rows.map((r) => U.tr({ tags: r.trend, q: `${r.name}${withSource ? ` ${r.source || "—"}` : ""}` }, U.td("c-code", F.esc(r.name), code(r.name))
      + (withSource ? U.td("c-code", F.esc(r.source || ""), r.source ? code(r.source) : U.dash) : "")
      + U.td("c-num num", r.recent_calls, F.withUnit(r.recent_calls, "回")) + U.hbar(r.recent_calls, max) + U.td("c-num_sub num", r.prev_calls, U.sub(r.prev_calls))
      + U.td("c-diff num", r.calls_diff, F.signed(r.calls_diff)) + U.td("c-num num", r.recent_users, F.withUnit(r.recent_users, "人")) + U.td("c-diff num", r.users_diff, F.signed(r.users_diff))));
    const cols = [{ label: id === "skills" ? "スキル" : "コマンド", cls: "c-code" }, ...(withSource ? [{ label: "定義元", cls: "c-code" }] : []),
      { label: "呼び出し回数", cls: "c-num num", sort: "descending" }, { cls: "c-bar" }, { label: `前の ${n} 日`, cls: "c-num_sub num" },
      { label: "差", cls: "c-diff num" }, { label: "利用者数", cls: "c-num num" }, { label: "利用者の差", cls: "c-diff num" }];
    return U.filters({ search: withSource ? "コマンド名・定義元で絞り込み" : "スキル名で絞り込み", total: rows.length, unit: "行",
      chips: [["all", "すべて", rows.length], ...TREND.map(([t, l]) => [t, l, rows.filter((r) => r.trend === t).length])] }) + U.table(id, cols, trs);
  }

  function bodies(k) {
    if (P.is12m(k)) return Object.fromEntries(Object.entries(TITLE).map(([id, t]) => [id, Tw.unavailable(t, `直近 12 か月（${Tw.range()}）`)]));
    const p = D.periods[k], n = Number(k), a = p.agent, diff = `差は直近から前の ${n} 日を引いた値です。増えた・減ったは呼び出し回数の差で分けます。`;
    const agentRows = a.rows.map((r) => U.tr({}, U.td("c-term", r.kind, r.kind === "agent" ? "サブエージェントの中" : "サブエージェントの外")
      + U.td("c-num num", r.count, F.withUnit(F.int(r.count), "件")) + U.td("c-pct_strong num", r.share, `<b>${F.pct(r.share)}</b>`) + U.hbar(r.share, 100)));
    return {
      skills: U.head(TITLE.skills, `直近 ${n} 日と前の ${n} 日 · スキルの呼び出しの記録`) + callTable("skills", p.skills.rows, n, false) + U.note(diff),
      commands: U.head(TITLE.commands, `直近 ${n} 日と前の ${n} 日 · コマンドの呼び出しの記録 · 定義元は記録された値のまま`) + callTable("commands", p.commands.rows, n, true)
        + U.note(`同じコマンドでも定義元が違えば別の行です。${diff}`),
      agent: U.head(TITLE.agent, `直近 ${n} 日 · 分母は全記録 ${F.int(a.denominator)} 件`) + U.filters({ total: a.rows.length, unit: "行" })
        + U.table("agent", [{ label: "記録", cls: "c-term" }, { label: "件数", cls: "c-num num" }, { label: "割合", cls: "c-pct_strong num" }, { cls: "c-bar" }], agentRows)
        + U.note("サブエージェントの中で起きた記録にだけ、サブエージェントの識別子が付きます。"),
    };
  }

  function tabList(k) {
    if (P.is12m(k)) return [["skills", "スキル"], ["commands", "コマンド"], ["agent", "サブエージェント"]].map(([id, title]) => ({ id, title, sub: Tw.NA_TAB }));
    const p = D.periods[k], n = Number(k);
    return [{ id: "skills", title: "スキル", sub: `${p.skills.kinds} 種類 · ${F.withUnit(p.skills.recent, "回")}` },
      { id: "commands", title: "コマンド", sub: `${p.commands.kinds} 種類 · ${F.withUnit(F.int(p.commands.recent), "回")}` },
      { id: "agent", title: "サブエージェント", sub: `直近 ${n} 日 · ${F.pct(p.agent.rate)}` }];
  }

  const k = P.current();
  window.Shell.mount(k);
  document.querySelector('[data-slot="period"]').innerHTML = P.render(k);
  document.querySelector('[data-slot="kpis"]').innerHTML = groups(k);
  document.querySelector('[data-slot="detail"]').outerHTML = U.detail(tabList(k), bodies(k));
})();
