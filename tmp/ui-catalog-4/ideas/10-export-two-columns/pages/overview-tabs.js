"use strict";
// 概況の下段（タブとパネル）。日ごとの利用・日ごとのコストは期間に追従し、12 か月は週ごと（twelve.js）。
// 記録から数えるタブ（使われ方・受信と項目の欠け・エラー）は 12 か月では中身の代わりに注記を出す
window.OverviewTabs = (() => {
  const D = window.DATA, X = window.DATA_EXTRA, F = window.Fmt, U = window.UI, C = window.Charts;
  const PROVIDERS = D.periods["7"].cost.providers;
  const RECORD_TABS = ["modes", "health", "errors"];

  const range = ([a, b]) => `${F.md(a)}〜${F.md(b)}`;
  const dateCell = (day) => `${F.ymd(day)}${U.sub(F.wd(day))}`;
  const periodChips = (n, total) => [["all", "すべて", total], ["recent", `直近 ${n} 日`, n], ["prev", `前の ${n} 日`, n]];

  function daily(k) {
    const n = Number(k), tr = D.periods[k].trend, days = tr.map((r) => r.day), ticks = C.dailyTicks(days, C.W_HALF);
    const chart = (key, h3) => `<div><h3>${h3}</h3>${C.bars(tr.map((r) => r[key]), { keys: days, hiFrom: tr.length - n, ticks })}</div>`;
    const max = Math.max(...tr.map((r) => r.sessions));
    const rows = [...tr].reverse().map((r) => U.tr({ tags: r.period, k: r.day }, U.td("c-date", r.day, dateCell(r.day))
      + U.td("c-tag", r.period, U.sub(r.period === "recent" ? `直近 ${n} 日` : `前の ${n} 日`))
      + U.td("c-num num", r.users, F.withUnit(r.users, "人")) + U.td("c-num num", r.sessions, F.withUnit(r.sessions, "件")) + U.hbar(r.sessions, max)));
    return U.head("日ごとの利用者数とセッション数", `直近 ${tr.length} 日 · 日ごと · 濃い色が直近 ${n} 日`)
      + `<div class="p-chart"><div class="two">${chart("users", "利用者数")}${chart("sessions", "セッション数")}</div></div>`
      + U.filters({ chips: periodChips(n, tr.length), total: tr.length, unit: "日" })
      + U.table("daily", [{ label: "日付", cls: "c-date", sort: "descending" }, { label: "期間", cls: "c-tag" }, { label: "利用者数", cls: "c-num num" },
        { label: "セッション数", cls: "c-num num" }, { label: "セッション数の比較", cls: "c-bar", sortable: false }], rows);
  }

  function cost(k) {
    const p = D.periods[k], n = Number(k), [a] = p.cost_window.prev, [r0, b] = p.cost_window.recent;
    const items = D.daily_cost.filter((r) => r.day >= a && r.day <= b).map((r) => ({ ...r, parts: PROVIDERS.map((q) => r.providers[q] || 0) }));
    const days = items.map((r) => r.day), fmt = F.usdCol(items.map((r) => r.total)), max = Math.max(...items.map((r) => r.total));
    const chart = C.stack(items, { keys: days, ticks: C.dailyTicks(days, C.W_FULL - 44), shadeFrom: items.length - n });
    const legend = `<div class="legend">${PROVIDERS.map((q, i) => `<span><i class="series-${i}"></i>${F.PROVIDER[q]}</span>`).join("")}<span>濃い地が直近 ${n} 日</span></div>`;
    const rows = [...items].reverse().map((r) => U.tr({ tags: r.day >= r0 ? "recent" : "prev", q: F.ymd(r.day), k: r.day }, U.td("c-date", r.day, dateCell(r.day))
      + PROVIDERS.map((q) => (r.providers[q] ? U.td("c-usd num", r.providers[q], fmt(r.providers[q])) : U.td("c-usd num", "", U.dash))).join("")
      + U.td("c-usd_strong num", r.total, `<b>${fmt(r.total)}</b>`) + U.hbar(r.total, max)));
    return U.head("日ごとのコスト", `利用明細（CSV）${range([a, b])} · 日 × 提供元（USD）· 濃い地が直近 ${n} 日`)
      + `<div class="p-chart">${chart}${legend}</div>`
      + U.filters({ search: "日付（例: 09-2）", chips: periodChips(n, items.length), total: items.length, unit: "日" })
      + U.table("cost", [{ label: "日付", cls: "c-date", sort: "descending" }, ...PROVIDERS.map((q) => ({ label: F.PROVIDER[q], cls: "c-usd num" })),
        { label: "合計", cls: "c-usd_strong num" }, { cls: "c-bar" }], rows);
  }

  function tabList(k) {
    const month = window.MonthTab.tab();
    if (k === "12m") {
      const w = D.twelve_months.weeks.length;
      return [{ id: "daily", title: "週ごとの利用者", sub: `${w} 週 · 利用明細` }, { id: "cost", title: "週ごとのコスト", sub: `${w} 週 · 利用明細` }, month,
        ...[["modes", "使われ方"], ["health", "受信と項目の欠け"], ["errors", "プラグインのエラー"]].map(([id, title]) => ({ id, title, sub: window.Twelve.NA_TAB }))];
    }
    const n = Number(k), p = D.periods[k];
    return [{ id: "daily", title: "日ごとの利用", sub: `直近 ${n * 2} 日` }, { id: "cost", title: "日ごとのコスト", sub: `直近 ${n * 2} 日 · 利用明細` }, month,
      { id: "modes", title: "使われ方", sub: `直近 ${n} 日 · 記録` }, { id: "health", title: "受信と項目の欠け", sub: `直近 ${n} 日と前の ${n} 日` },
      { id: "errors", title: "プラグインのエラー", sub: `直近 ${n} 日 · ${p.errors.total} 件` }];
  }

  function bodies(k) {
    const R = window.RecordTabs, Tw = window.Twelve;
    if (k === "12m") {
      return { daily: Tw.usersPanel(), cost: Tw.costPanel(PROVIDERS), month: window.MonthTab.panel(),
        ...Object.fromEntries(RECORD_TABS.map((id) => [id, Tw.unavailable(R.TITLE[id], `直近 12 か月（${Tw.range()}）`)])) };
    }
    const r = X.records[k];
    return { daily: daily(k), cost: cost(k), month: window.MonthTab.panel(), modes: R.modes(k, r), health: R.health(k, r), errors: R.errors(k, r) };
  }

  return { tabList, bodies };
})();
