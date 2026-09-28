"use strict";
// 概況の上段（カードの群）と「日ごとの利用」タブを、選んだ期間で描き直す
(() => {
  const { h, val, fmt, nf, md, mdw, signed, spark, bars, dayOf } = UI;
  const D = window.DATA;
  const F = D.month_forecast;
  const W = D.twelve_months.weeks;
  const COST = new Map(D.daily_cost.map((r) => [r.day, r]));
  const PERIODS = [{ id: "7", label: "7 日" }, { id: "28", label: "28 日" }, { id: "12m", label: "12 か月" }];
  const STAGE = { send: "送信", apply_settings: "設定の書き込み", collect: "記録の収集" };
  // 経過営業日がこれより少ない月は、見込みを「—」にする（仮の値）
  const FORECAST_MIN_DAYS = 3;
  const MONTH = (ym) => `${Number(ym.slice(5))} 月`;

  const change = (txt, up) => h("span", { class: up ? "change up" : "change" }, txt);
  const cap = (...xs) => h("span", { class: "cap" }, xs.map((x) => h("span", {}, x)));
  const sub = (...xs) => h("span", { class: "k-sub" }, xs);
  const hbar = (pct, ghost) => h("span", { class: ghost ? "hbar ghost" : "hbar" }, h("i", { style: `width: ${pct.toFixed(1)}%` }));
  const meter = (pct) => h("span", { class: "meter" }, h("i", { style: `width: ${pct.toFixed(1)}%` }));

  function card({ label, value, subs = [], viz = null, open = null, mark = null, extra = null }) {
    const tag = open ? "a" : "div";
    return h(tag, { class: "card", href: open ? `#${open}` : null, "data-open": open },
      h("span", { class: "k-label" }, h("span", {}, label), mark || (open ? h("span", { class: "go" }, "一覧") : extra)),
      h("span", { class: "k-value" }, val(value, true)),
      subs.length ? sub(...subs) : null,
      viz ? h("span", { class: "k-viz" }, viz) : null);
  }
  const group = (name, scope, cards, note) => h("section", { class: "group", "aria-label": name },
    h("h2", { class: "glabel" }, name, h("span", {}, scope)),
    cards.length ? h("div", { class: "cards" }, cards) : null,
    note ? h("p", { class: "gnote" }, note) : null);

  function forecastCard() {
    const ok = F.elapsed_business_days >= FORECAST_MIN_DAYS;
    const max = Math.max(F.per_business_day, F.prev_per_business_day);
    const row = (name, v, ghost) => h("span", { class: "rate" }, h("span", {}, name), hbar((v / max) * 100, ghost), h("span", { class: "num" }, val(fmt.usd(v))));
    return card({
      label: "月末のコストの見込み", extra: h("span", { class: "go-plain" }, `${MONTH(F.month)}`),
      value: ok ? fmt.usd(F.forecast) : { n: "—" },
      subs: [`実績 `, val(fmt.usd(F.actual)), ` · 営業日 ${F.elapsed_business_days} / ${F.business_days}`],
      viz: [h("span", { class: "rates fc" }, row(`${MONTH(F.prev_month)}`, F.prev_per_business_day, true), row(`${MONTH(F.month)}`, F.per_business_day, false)),
        h("span", { class: "cap" }, h("span", {}, `営業日あたり · ${MONTH(F.prev_month)}の合計 `, val(fmt.usd(F.prev_total)), `（${F.prev_business_days} 日）`))],
    });
  }

  function daysCards(n) {
    const P = D.periods[n];
    const t = P.trend, split = t.findIndex((r) => r.period === "recent");
    const tip = (k, f) => t.map((r) => [mdw(r.day), UI.text(f(r[k]))]);
    const spanCap = cap(md(t[0].day), `濃い部分が直近 ${n} 日`, md(t[t.length - 1].day));
    const cw = P.cost_window, cdays = [];
    for (let d = cw.prev[0]; d <= cw.recent[1]; d += 1) cdays.push(d);
    const cvals = cdays.map((d) => (COST.get(d) || { total: 0 }).total);
    const e = P.errors;
    const use = group("利用", `直近 ${n} 日と、その前の ${n} 日`, [
      card({ label: "送信した利用者", value: fmt.count(P.users.recent, "人"), open: "daily",
        subs: [change(signed(P.users.delta), P.users.delta > 0), `前の ${n} 日 ${nf(P.users.prev)} 人`],
        viz: [spark(t.map((r) => r.users), { split, tips: tip("users", (v) => fmt.count(v, "人")) }), spanCap.cloneNode(true)] }),
      card({ label: "1 日あたりのセッション", value: fmt.count(P.sessions_per_day.recent, "件", 1), open: "daily",
        subs: [change(signed(P.sessions_per_day.delta, 1), P.sessions_per_day.delta > 0), `前の ${n} 日 ${nf(P.sessions_per_day.prev, 1)} 件`],
        viz: [spark(t.map((r) => r.sessions), { split, tips: tip("sessions", (v) => fmt.count(v, "件")) }), spanCap] }),
      card({ label: "コスト（利用明細）", value: fmt.usd(P.cost.recent), open: "cost",
        subs: [change(`${P.cost.change > 0 ? "+" : "−"}${nf(Math.abs(P.cost.change), 1)}%`, P.cost.change > 0), `前の ${n} 日 `, val(fmt.usd(P.cost.prev))],
        viz: [spark(cvals, { split: cdays.indexOf(cw.recent[0]), tips: cdays.map((d, i) => [mdw(d), UI.text(fmt.usd(cvals[i]))]) }),
          cap(md(cdays[0]), `${md(cw.recent[0])}〜${md(cw.recent[1])} の合計`, md(cw.recent[1]))] }),
      forecastCard(),
      card({ label: "確認なしモードの記録", value: fmt.pct(P.bypass.rate), open: "modes",
        subs: [`${nf(P.bypass.numerator)} 件 / 全 ${nf(P.bypass.denominator)} 件`],
        viz: [meter(P.bypass.rate), cap("権限モード「確認なし」の割合")] }),
    ]);
    const reach = group("データの届き具合", `直近 ${n} 日と、その前の ${n} 日（照合率は利用明細の最終日までの ${n} 日）`, [
      card({ label: "受信した記録", value: fmt.count(P.events.recent, "件"), open: "health",
        subs: [change(signed(P.events.delta), P.events.delta > 0), `前の ${n} 日 ${nf(P.events.prev)} 件`],
        viz: [["前の", P.events.prev, true], ["直近", P.events.recent, false]].map(([k, v, g]) =>
          h("span", { class: "pair" }, h("span", {}, `${k} ${n} 日`), hbar((v / Math.max(P.events.prev, P.events.recent)) * 100, g))) }),
      card({ label: "CSV との照合率", value: fmt.pct(P.reconciliation.rate), open: "health",
        subs: [`CSV にもいた ${P.reconciliation.numerator} 人 / 送信した ${P.reconciliation.denominator} 人`],
        viz: [meter(P.reconciliation.rate), cap("前との比較なし")] }),
      card({ label: "プラグインのエラー", value: fmt.count(e.total, "件"), open: "errors", mark: h("span", { class: "mark warn" }, "注意"),
        subs: [`${e.kinds} 種類 · 前との比較なし`],
        viz: [h("span", { class: "stack" }, e.stages.map(([, c], i) => h("i", { class: `warn-${i}`, style: `flex: ${c}` }))),
          h("span", { class: "legend" }, e.stages.map(([k, c], i) => h("span", {}, h("i", { class: `warn-${i}` }), `${STAGE[k]} ${c}`)))] }),
      nullCard(),
    ]);
    return [use, reach];
  }

  // 項目の欠けは data に期間ごとの値が無いので、本物の画面の 7 日の値をそのまま置く
  function nullCard() {
    const rows = [["ツール名", 9.2], ["スキル名", 6.4], ["コンテキストのトークン数", 8.6], ["コマンドの定義元", 11.7]];
    const c = card({ label: "項目の欠け（最大）", value: fmt.pct(11.7), open: "health", mark: h("span", { class: "mark ok" }, "正常"),
      subs: ["コマンドの定義元 · 4 / 4 項目が正常"],
      viz: h("span", { class: "rates" }, rows.map(([k, v]) => h("span", { class: "rate" }, h("span", {}, k), hbar(v), h("span", { class: "num strong" }, `${nf(v, 1)}%`)))) });
    return c;
  }

  function yearCards() {
    const full = W.filter((w) => !w.partial);
    const lastFull = full[full.length - 1];
    const total = W.reduce((a, w) => a + w.cost, 0);
    const wk = (w) => `${md(dayOf(w.start))}〜 の週`;
    const first = dayOf(W[0].start), last = dayOf(W[W.length - 1].end);
    const use = group("利用", `直近 12 か月 · 月曜始まりの週ごと · 利用明細（CSV）の値だけ`, [
      card({ label: "利用者（利用明細）", value: fmt.count(lastFull.users, "人"), open: "daily",
        subs: [`${md(dayOf(lastFull.start))}〜${md(dayOf(lastFull.end))} の週 · 前との比較なし`],
        viz: [spark(full.map((w) => w.users), { tips: full.map((w) => [wk(w), `${w.users} 人`]) }), cap(UI.iso(first), "週ごと", UI.iso(dayOf(lastFull.end)))] }),
      card({ label: "コスト（利用明細）", value: fmt.usd(total), open: "cost",
        subs: ["週あたり ", val(fmt.usd(total / (W.length - 1 + W[W.length - 1].days_with_data / 7))), " · 前との比較なし"],
        viz: [spark(full.map((w) => w.cost), { tips: full.map((w) => [wk(w), UI.text(fmt.usd(w.cost))]) }), cap(UI.iso(first), "12 か月の合計", UI.iso(last))] }),
      forecastCard(),
    ], "送信した利用者・セッション・確認なしモードは端末の記録から数えるため、12 か月では出しません。");
    const reach = group("データの届き具合", "端末の記録から数えるため、12 か月では出しません。7 日か 28 日で見ます", []);
    return [use, reach];
  }

  function dailyPanel(n) {
    const P = D.periods[n];
    const t = P.trend;
    const cls = (i) => (t[i].period === "recent" ? "bar-hi" : "bar-old");
    const ticks = t.map((r, i) => ({ i, label: md(r.day), keep: n === "7" || UI.wd(r.day) === "月" })).filter((x) => x.keep);
    const chart = (k, unit) => bars(t.map((r) => r[k]), { cls, ticks, labels: n === "7", tips: t.map((r) => [mdw(r.day), `${r[k]} ${unit}`]) });
    const maxS = Math.max(...t.map((r) => r.sessions));
    const rows = [...t].reverse().map((r) => h("tr", { "data-tags": r.period, "data-q": "" },
      h("td", { class: "c-date", "data-v": r.day }, UI.iso(r.day), h("span", { class: "sub" }, `（${UI.wd(r.day)}）`)),
      h("td", { class: "c-tag", "data-v": r.period }, h("span", { class: "sub" }, r.period === "recent" ? `直近 ${n} 日` : `前の ${n} 日`)),
      h("td", { class: "c-num num", "data-v": r.users }, val(fmt.count(r.users, "人"))),
      h("td", { class: "c-num num", "data-v": r.sessions }, val(fmt.count(r.sessions, "件"))),
      h("td", { class: "c-bar", "data-v": r.sessions }, hbar((r.sessions / maxS) * 100))));
    return [
      h("header", { class: "p-head" }, h("h2", {}, "日ごとの利用者数とセッション数"), h("p", { class: "scope" }, `直近 ${n * 2} 日 · 日ごと · 濃い色が直近 ${n} 日`)),
      h("div", { class: "p-chart" }, h("div", { class: "two" }, h("div", {}, h("h3", {}, "利用者数"), chart("users", "人")), h("div", {}, h("h3", {}, "セッション数"), chart("sessions", "件")))),
      h("div", { class: "filters", "data-filter": "" },
        h("div", { class: "chipbar", role: "group", "aria-label": "区分" },
          [["all", "すべて", n * 2], ["recent", `直近 ${n} 日`, n], ["prev", `前の ${n} 日`, n]].map(([k, l, c]) => h("button", { type: "button", "data-chip": k, "aria-pressed": String(k === "all") }, l, h("b", {}, c)))),
        h("span", { class: "count" }, h("b", { "data-shown": "" }, n * 2), ` / ${n * 2} 日`)),
      table(["日付", "期間", "利用者数", "セッション数", "セッション数の比較"], ["c-date", "c-tag", "c-num num", "c-num num", "c-bar"], rows),
    ];
  }

  function weeklyPanel() {
    // 月の最初の週に目盛りを置く。範囲の頭の月が 1 週しかないときは次の月と重なるので省く
    const firsts = D.twelve_months.month_first_week;
    const ticks = firsts.filter((m, k) => !firsts[k + 1] || firsts[k + 1].week_index - m.week_index >= 3).map((m) => ({ i: m.week_index, label: MONTH(m.month) }));
    const cls = (i) => (W[i].partial ? "bar-old" : "bar-hi");
    const tips = (f) => W.map((w) => [`${md(dayOf(w.start))}〜${md(dayOf(w.end))} の週${w.partial ? "（途中）" : ""}`, f(w)]);
    const maxC = Math.max(...W.map((w) => w.cost));
    const rows = [...W].reverse().map((w) => h("tr", { "data-tags": "", "data-q": w.start },
      h("td", { class: "c-date", "data-v": dayOf(w.start) }, `${w.start} 〜 ${md(dayOf(w.end))}`, w.partial ? h("span", { class: "sub" }, `（途中 · ${w.days_with_data} 日分）`) : ""),
      h("td", { class: "c-usd num", "data-v": w.cost }, val(maxC >= 1000 ? fmt.usdInt(w.cost) : fmt.usd(w.cost))),
      h("td", { class: "c-bar", "data-v": w.cost }, hbar((w.cost / maxC) * 100)),
      h("td", { class: "c-num num", "data-v": w.users }, val(fmt.count(w.users, "人")))));
    return [
      h("header", { class: "p-head" }, h("h2", {}, "週ごとのコストと利用者数"), h("p", { class: "scope" }, "直近 12 か月 · 月曜始まりの週 · 利用明細（CSV）· 目盛りは各月の最初の週")),
      h("div", { class: "p-chart" }, h("div", { class: "two" },
        h("div", {}, h("h3", {}, "コスト"), bars(W.map((w) => w.cost), { cls, ticks, tips: tips((w) => UI.text(fmt.usd(w.cost))) })),
        h("div", {}, h("h3", {}, "利用者数"), bars(W.map((w) => w.users), { cls, ticks, tips: tips((w) => `${w.users} 人`) })))),
      h("div", { class: "filters", "data-filter": "" }, h("span", { class: "count" }, h("b", { "data-shown": "" }, W.length), ` / ${W.length} 週`)),
      table(["週", "コスト", "", "利用者数"], ["c-date", "c-usd num", "c-bar", "c-num num"], rows),
      h("p", { class: "note" }, `最後の週（${md(dayOf(W[W.length - 1].start))}〜）は利用明細の最終日までの途中の値で、薄い色で描いています。`),
    ];
  }

  function table(heads, classes, rows) {
    const th = heads.map((t, i) => h("th", { scope: "col", class: classes[i], "aria-sort": i === 0 ? "descending" : null },
      t && classes[i] !== "c-bar" ? h("button", { type: "button", "data-sort": i }, t, h("i", { class: "arrow" })) : t));
    return h("div", { class: "tscroll" }, h("table", { "data-testid": "daily" }, h("thead", {}, h("tr", {}, th)), h("tbody", {}, rows)),
      h("p", { class: "empty", "data-empty": "", hidden: "" }, "条件に合う行はありません。"));
  }

  function render(p) {
    const kpis = document.querySelector("[data-kpis]");
    kpis.replaceChildren(...(p === "12m" ? yearCards() : daysCards(p)));
    const panel = document.querySelector('[data-panel="daily"]');
    panel.replaceChildren(...(p === "12m" ? weeklyPanel() : dailyPanel(p)));
    const tab = document.querySelector("#tab-daily");
    tab.querySelector("b").textContent = p === "12m" ? "週ごとの利用" : "日ごとの利用";
    tab.querySelector("span").textContent = p === "12m" ? "直近 12 か月 · 利用明細" : `直近 ${p * 2} 日`;
    for (const t of document.querySelectorAll('[role="tab"]')) {
      if (["daily", "cost"].includes(t.dataset.tab)) continue;
      const sp = t.querySelector("span");
      sp.dataset.orig ??= sp.textContent;
      sp.textContent = p === "12m" ? "12 か月では出しません" : sp.dataset.orig;
      t.classList.toggle("off", p === "12m");
    }
    for (const b of document.querySelectorAll("[data-period]")) b.setAttribute("aria-pressed", String(b.dataset.period === p));
    document.dispatchEvent(new CustomEvent("period", { detail: p }));
  }

  function init() {
    const sw = document.querySelector("[data-period-switch]");
    sw.replaceChildren(...PERIODS.map((x) => h("button", { type: "button", "data-period": x.id }, x.label)));
    const now = new URLSearchParams(location.search).get("p");
    let p = PERIODS.some((x) => x.id === now) ? now : "7";
    sw.addEventListener("click", (e) => {
      const b = e.target.closest("[data-period]");
      if (!b || b.dataset.period === p) return;
      p = b.dataset.period;
      history.replaceState(null, "", `?p=${p}${location.hash}`);
      render(p);
    });
    document.addEventListener("click", (e) => { if (e.target.closest(".tabs a.off")) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    render(p);
    UI.tooltips();
    UI.titlesToTips();
  }
  init();
})();
