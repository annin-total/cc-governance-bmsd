"use strict";
// 概況。7 日・28 日は今の型のまま値を差し替え、12 か月は案ごとの TWELVE に任せる
const O = (() => {
  const { D, h, md, wd, int, usd, signed, epoch } = L;
  const STAGES = { send: "送信", apply_settings: "設定の書き込み", collect: "記録の収集" };
  // data.js に 28 日の欠けの値が無いので、今の画面（7 日）の値を置く
  const NULLS = [["ツール名", 9.2], ["スキル名", 6.4], ["コンテキストのトークン数", 8.6], ["コマンドの定義元", 11.7]];
  const FORECAST_MIN_DAYS = 3;
  const dayTip = (ep, text) => [`${md(ep)}${wd(ep)}`, text];

  function _trendCard(N, key, label, value, unit, delta, prev, f) {
    const t = D.periods[N].trend;
    const split = t.findIndex((d) => d.period === "recent");
    return P.card({ open: "daily", label, value, unit, change: [signed(delta, f), delta > 0], sub: `前の ${N} 日 ${prev}`,
      viz: [C.spark(t.map((d) => d[key]), split, t.map((d) => dayTip(d.day, `${f(d[key])} ${unit}`))),
        P.cap(md(t[0].day), `濃い部分が直近 ${N} 日`, md(t[t.length - 1].day))] });
  }

  function costCard(N) {
    const c = D.periods[N].cost, [a, b] = D.periods[N].cost_window.recent;
    const days = D.daily_cost.filter((d) => d.day > c.end - (N === 7 ? 28 : 56) && d.day <= c.end);
    const split = days.findIndex((d) => d.day === a);
    return P.card({ open: "cost", label: "コスト（利用明細）", value: usd(c.recent), change: [`${signed(c.change, (n) => n.toFixed(1))}%`, c.change > 0],
      sub: `前の ${N} 日 ${usd(c.prev)}`,
      viz: [C.spark(days.map((d) => d.total), split, days.map((d) => dayTip(d.day, usd(d.total)))), P.cap(md(days[0].day), `${md(a)}〜${md(b)} の合計`, md(b))] });
  }

  function forecastCard(href) {
    const f = D.month_forecast, m = Number(f.month.slice(5)), pm = Number(f.prev_month.slice(5));
    const enough = f.elapsed_business_days >= FORECAST_MIN_DAYS;
    const top = Math.max(f.per_business_day, f.prev_per_business_day);
    return P.card({ open: "cost", href, label: "月末のコストの見込み", value: enough ? usd(f.forecast) : "—",
      sub: `${m} 月の実績 ${usd(f.actual)} · 営業日 ${f.elapsed_business_days} / ${f.business_days} 日`,
      viz: [h("span", { class: "rates fc" },
        P.rate(`${m} 月`, (f.per_business_day / top) * 100, usd(f.per_business_day)),
        P.rate(`${pm} 月`, (f.prev_per_business_day / top) * 100, usd(f.prev_per_business_day), true)),
      P.cap(`営業日あたり · ${pm} 月は ${f.prev_business_days} 営業日で ${usd(f.prev_total)}`)] });
  }

  function useGroup(N) {
    const p = D.periods[N];
    return P.group("利用", `直近 ${N} 日と、その前の ${N} 日`, [
      _trendCard(N, "users", "送信した利用者", String(p.users.recent), "人", p.users.delta, `${p.users.prev} 人`, int),
      _trendCard(N, "sessions", "1 日あたりのセッション", p.sessions_per_day.recent.toFixed(1), "件", p.sessions_per_day.delta,
        `${p.sessions_per_day.prev.toFixed(1)} 件`, (n) => n.toFixed(1)),
      costCard(N),
      forecastCard(),
      P.card({ open: "modes", label: "確認なしモードの記録", value: p.bypass.rate.toFixed(1), unit: "%",
        sub: `${int(p.bypass.numerator)} 件 / 全 ${int(p.bypass.denominator)} 件`, viz: [P.meter(p.bypass.rate), P.cap("権限モード「確認なし」の割合")] }),
    ]);
  }

  function healthGroup(N) {
    const p = D.periods[N], e = p.events, top = Math.max(e.recent, e.prev), worst = NULLS.reduce((a, b) => (b[1] > a[1] ? b : a));
    return P.group("データの届き具合", `直近 ${N} 日と、その前の ${N} 日（照合率は利用明細の最終日までの ${N} 日）`, [
      P.card({ open: "health", label: "受信した記録", value: int(e.recent), unit: "件", change: [signed(e.delta), e.delta > 0], sub: `前の ${N} 日 ${int(e.prev)} 件`,
        viz: [P.pair(`前の ${N} 日`, (e.prev / top) * 100, true), P.pair(`直近 ${N} 日`, (e.recent / top) * 100)] }),
      P.card({ open: "health", label: "CSV との照合率", value: p.reconciliation.rate.toFixed(1), unit: "%",
        sub: `CSV にもいた ${p.reconciliation.numerator} 人 / 送信した ${p.reconciliation.denominator} 人`, viz: [P.meter(p.reconciliation.rate), P.cap("前との比較なし")] }),
      P.card({ open: "errors", label: "プラグインのエラー", mark: ["warn", "注意"], value: String(p.errors.total), unit: "件", sub: `${p.errors.kinds} 種類 · 前との比較なし`,
        viz: [h("span", { class: "stack" }, p.errors.stages.map(([, n], i) => h("i", { class: `warn-${i}`, style: `flex: ${n}` }))),
          h("span", { class: "legend" }, p.errors.stages.map(([k, n], i) => h("span", {}, h("i", { class: `warn-${i}` }), `${STAGES[k]} ${n}`)))] }),
      P.card({ open: "health", label: "項目の欠け（最大）", mark: ["ok", "正常"], value: worst[1].toFixed(1), unit: "%", sub: `${worst[0]} · 4 / 4 項目が正常`,
        viz: [h("span", { class: "rates" }, NULLS.map(([k, v]) => P.rate(k, v, `${v.toFixed(1)}%`)))] }),
    ]);
  }

  function dailyPanel(N) {
    const t = D.periods[N].trend, hi = t.map((d) => d.period === "recent");
    const tick = (i) => (N === 7 || (t[i].day + 4) % 7 === 1 ? md(t[i].day) : null);
    const chart = (key, unit) => C.dayBars(t.map((d) => d[key]), { hi, labels: N === 7, tick, tips: t.map((d) => dayTip(d.day, `${d[key]} ${unit}`)) });
    const max = Math.max(...t.map((d) => d.sessions));
    const rows = [...t].reverse().map((d) => ({ tags: d.period, cells: [P.dateCell(d.day),
      { v: d.period, cls: "c-tag", content: P.sub(`${d.period === "recent" ? "直近" : "前の"} ${N} 日`) },
      { v: d.users, cls: "c-num num", content: `${d.users} 人` }, { v: d.sessions, cls: "c-num num", content: `${d.sessions} 件` },
      { v: d.sessions, cls: "c-bar", content: P.hbar((d.sessions / max) * 100) }] }));
    return P.panel("daily", "日ごとの利用者数とセッション数", `直近 ${N * 2} 日 · 日ごと · 濃い色が直近 ${N} 日`,
      h("div", { class: "p-chart" }, h("div", { class: "two" }, h("div", {}, h("h3", {}, "利用者数"), chart("users", "人")), h("div", {}, h("h3", {}, "セッション数"), chart("sessions", "件")))),
      P.filters({ chips: [["all", "すべて", t.length], ["recent", `直近 ${N} 日`, N], ["prev", `前の ${N} 日`, N]], total: t.length, unit: "日" }),
      P.table("daily", [{ label: "日付", cls: "c-date" }, { label: "期間", cls: "c-tag" }, { label: "利用者数", cls: "c-num num" }, { label: "セッション数", cls: "c-num num" }, { text: "セッション数の比較", cls: "c-bar" }], rows, 0));
  }

  const TAB_SUB = {
    daily: (N) => `直近 ${N * 2} 日`, modes: (N) => `直近 ${N} 日 · 記録`, health: (N) => `直近 ${N} 日と前の ${N} 日`,
    errors: (N) => `直近 ${N} 日 · ${D.periods[N].errors.total} 件`,
  };

  function render(p) {
    const top = document.getElementById("top"), detail = document.getElementById("detail");
    for (const t of detail.querySelectorAll("[data-tab]")) {
      t.removeAttribute("aria-disabled");
      const span = t.querySelector("span");
      span.dataset.orig = span.dataset.orig || span.textContent;
      span.textContent = p !== "12m" && TAB_SUB[t.dataset.tab] ? TAB_SUB[t.dataset.tab](Number(p)) : span.dataset.orig;
    }
    detail.hidden = false;
    if (p === "12m") TWELVE.overview(top, detail);
    else {
      const N = Number(p);
      top.replaceChildren(useGroup(N), healthGroup(N));
      detail.querySelector("[data-panel=daily]").replaceWith(dailyPanel(N));
    }
    L.openTab(detail, location.hash.slice(1), false);
  }

  function start() {
    const detail = document.getElementById("detail");
    L.adoptTitles(detail);
    for (const f of detail.querySelectorAll("[data-filter]")) f.hidden = false;
    L.switcher(document.getElementById("switch"), render);
    render(L.period());
  }

  // 12 か月: 週ごとの値。最後の週は途中なので折れ線から外す
  const weeks = () => D.twelve_months.weeks;
  const full = () => weeks().filter((w) => !w.partial);
  const weekTip = (w) => [w.partial ? `${md(epoch(w.start))}${wd(epoch(w.start))}のみ` : `${md(epoch(w.start))}〜${md(epoch(w.end))} の週`];
  const total12 = () => weeks().reduce((a, w) => a + w.cost, 0);
  const range12 = () => `${weeks()[0].start}〜${weeks()[weeks().length - 1].end}`;

  function cost12Card(withSpark, href) {
    const ws = full();
    return P.card({ open: "cost", href, label: "コスト（利用明細）", value: usd(total12()), sub: `月平均 ${usd(total12() / 12)} · 前の期間と比べない`,
      viz: withSpark ? [C.spark(ws.map((w) => w.cost), 0, ws.map((w) => [...weekTip(w), usd(w.cost)])), P.cap(ws[0].start.slice(0, 7), "週ごとの合計", ws[ws.length - 1].start.slice(0, 7))]
        : [P.cap(`${range12()} · 53 週`)] });
  }

  function users12Card(withSpark, href) {
    const ws = full(), last = ws[ws.length - 1];
    return P.card({ open: "cost", href, label: "利用者（利用明細）", value: String(last.users), unit: "人", sub: `${md(epoch(last.start))} の週 · 12 か月前の週 ${ws[0].users} 人`,
      viz: withSpark ? [C.spark(ws.map((w) => w.users), 0, ws.map((w) => [...weekTip(w), `${w.users} 人`])), P.cap(ws[0].start.slice(0, 7), "週ごとに明細に出た人数", last.start.slice(0, 7))]
        : [P.cap("週ごとに利用明細に出た人数")] });
  }

  return { start, forecastCard, cost12Card, users12Card, weeks, weekTip, range12, total12 };
})();
