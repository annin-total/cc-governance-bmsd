"use strict";
// 下段の「今月のコスト」タブ: 暦日を横軸にした累積（今月の実績・月末までの見込み・前月）と、日ごとの表。
// 今月の週末と祝日は薄い帯で示す。グラフの列と表の行は data-k（日）で結ぶ（link.js）
window.MonthTab = (() => {
  const F = window.Fmt, U = window.UI, C = window.Charts;
  const W = C.W_FULL, H = 210, AXIS_W = 56, TOP = 8;

  const mon = (ym) => `${Number(ym.slice(5))} 月`;
  const day = (isoText) => F.toDay(isoText);
  const daysIn = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0)).getUTCDate();

  // 暦日ごとの行: その日のコスト・累積（実績の最終日まで）・見込みの累積（残りの営業日）・営業日の番号・休みの印
  function calendar(ym, bizRows, asOf) {
    const m = window.DATA.month_forecast, cost = new Map(window.DATA.daily_cost.map((r) => [r.date, r.total]));
    const holiday = new Map(m.holidays.map((h) => [h.date, h.name])), biz = new Map(bizRows.map((r) => [r.date, r]));
    let cum = 0;
    return Array.from({ length: daysIn(ym) }, (_, j) => {
      const date = `${ym}-${String(j + 1).padStart(2, "0")}`, b = biz.get(date), wd = new Date(`${date}T00:00:00Z`).getUTCDay();
      const done = date <= asOf, c = done ? cost.get(date) ?? 0 : null;
      if (done) cum += c;
      return { d: j + 1, date, cost: c, cum: done ? cum : null, forecast_cum: b?.forecast_cum ?? null, bd: b?.n ?? null,
        holiday: holiday.get(date) ?? null, off: wd === 0 || wd === 6 || holiday.has(date) };
    });
  }

  // 連続した休みの日を 1 本の帯にまとめる
  function bands(cur, pitch) {
    const runs = [];
    for (const r of cur) if (r.off) (runs.at(-1)?.to === r.d - 1 ? runs.at(-1) : runs[runs.push({ from: r.d }) - 1]).to = r.d;
    return runs.map(({ from, to }) => `<rect class="off" x="${(AXIS_W + (from - 1) * pitch).toFixed(1)}" y="${TOP}" width="${((to - from + 1) * pitch).toFixed(1)}" height="${H - TOP}"/>`).join("");
  }

  function chart(cur, prev, forecast, prevTotal) {
    const n = Math.max(cur.length, prev.length), pitch = (W - AXIS_W) / n;
    const { top, step } = C.nice(Math.max(forecast, prevTotal), 5);
    const x = (d) => AXIS_W + (d - 0.5) * pitch, y = (v) => H - ((H - TOP) * v) / top;
    const pt = (d, v) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`;
    const actual = cur.filter((r) => r.cum != null), last = actual[actual.length - 1];
    let grid = "";
    for (let v = 0; v <= top + 1e-9; v += step) grid += `<line class="gridline" x1="${AXIS_W}" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${AXIS_W - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${F.usdText(v, true)}</text>`;
    const lines = `<polyline class="cum-prev" points="${prev.map((r) => pt(r.d, r.cum)).join(" ")}"/>`
      + `<polyline class="cum-fc" points="${[pt(last.d, last.cum), ...cur.filter((r) => r.forecast_cum != null).map((r) => pt(r.d, r.forecast_cum))].join(" ")}"/>`
      + `<polyline class="cum-now" points="${actual.map((r) => pt(r.d, r.cum)).join(" ")}"/>`;
    const cols = Array.from({ length: n }, (_, j) => {
      const d = j + 1, c = cur[j], p = prev[j], v = c ? c.cum ?? c.forecast_cum : null;
      return `<g class="col" data-k="${d}"><rect class="hit" x="${(AXIS_W + j * pitch).toFixed(1)}" y="0" width="${pitch.toFixed(1)}" height="${H}"/>`
        + `<line class="guide" x1="${x(d).toFixed(1)}" x2="${x(d).toFixed(1)}" y1="${TOP}" y2="${H}"/>`
        + (p ? `<circle class="dot-prev" cx="${x(d).toFixed(1)}" cy="${y(p.cum).toFixed(1)}" r="3"/>` : "")
        + (v != null ? `<circle class="${c.cum != null ? "dot-now" : "dot-fc"}" cx="${x(d).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3"/>` : "")
        + `<text class="tick" x="${x(d).toFixed(1)}" y="${H + 16}" text-anchor="middle">${d}</text></g>`;
    }).join("");
    return `<svg class="chart cum" viewBox="0 0 ${W} ${H + 22}" aria-hidden="true">${bands(cur, pitch)}${grid}${lines}${cols}</svg>`;
  }

  function table(cur, prev, prevMonth) {
    const n = Math.max(cur.length, prev.length);
    const costs = cur.filter((r) => r.cost != null).map((r) => r.cost), maxCost = Math.max(...costs);
    const fCost = F.usdCol(costs), fCum = F.usdCol([...cur.map((r) => r.cum ?? r.forecast_cum ?? 0), ...prev.map((r) => r.cum)]);
    const rows = Array.from({ length: n }, (_, j) => {
      const c = cur[j], p = prev[j], d = j + 1;
      const date = c ? `${F.md(day(c.date))}${U.sub(F.wd(day(c.date)))}${c.holiday ? U.sub(` · ${c.holiday}`) : ""}` : U.dash;
      const cum = c?.cum != null ? `<b>${fCum(c.cum)}</b>` : c?.forecast_cum != null ? U.sub(`見込み ${fCum(c.forecast_cum)}`) : U.dash;
      return U.tr({ k: d, tags: c?.cum != null ? "actual" : "rest" },
        U.td("c-date", c ? day(c.date) : "", date) + U.td("c-bd", c?.bd, c?.bd ?? U.dash)
        + U.td("c-usd num", c?.cost, c?.cost != null ? fCost(c.cost) : U.dash)
        + (c?.cost != null ? U.hbar(c.cost, maxCost) : U.td("c-bar", "", ""))
        + U.td("c-usd_strong num", c?.cum ?? c?.forecast_cum, cum)
        + U.td("c-usd num", p?.cum, p ? U.sub(fCum(p.cum)) : U.dash));
    });
    return U.table("month", [
      { label: "日付", cls: "c-date", sort: "ascending" }, { label: "営業日", cls: "c-bd" }, { label: "その日のコスト", cls: "c-usd num" },
      { cls: "c-bar" }, { label: "今月の累積", cls: "c-usd_strong num" }, { label: `前月（${mon(prevMonth)}）の累積`, cls: "c-usd num" },
    ], rows);
  }

  const tab = () => {
    const m = window.DATA.month_forecast;
    return { id: "month", title: "今月のコスト", sub: `${mon(m.month)} · ${m.elapsed_business_days} / ${m.business_days} 営業日` };
  };

  function panel() {
    const m = window.DATA.month_forecast, { current, prev, users, prev_users: prevUsers } = window.DATA_EXTRA.month;
    const cur = calendar(m.month, current.rows, m.as_of), prv = calendar(prev.month, prev.rows, prev.rows.at(-1).date);
    const legend = `<div class="legend cum-legend"><span><i class="ln now"></i>今月の実績 ${F.usd(m.actual)}</span><span><i class="ln fc"></i>月末までの見込み ${F.usd(m.forecast)}</span><span><i class="ln prev"></i>前月（${mon(prev.month)}）${F.usd(prev.total)}</span><span><i class="off"></i>${mon(m.month)}の週末と祝日</span></div>`;
    return U.head("今月のコストの累積と月末の見込み", `${m.month} · 利用明細（CSV）の ${F.md(day(m.as_of))} まで · 横軸は暦日（前月は同じ日付に重ねる）`)
      + `<div class="p-chart">${chart(cur, prv, m.forecast, prev.total)}${legend}</div>`
      + table(cur, prv, prev.month)
      + U.note(`見込みは実績 × 月の営業日数 ÷ 経過した営業日数です（${F.usd(m.actual)} × ${m.business_days} ÷ ${m.elapsed_business_days}）。営業日は平日かつ国民の祝日でない日です。見込みの累積は残りの営業日に置いています。`
        + `1 人 1 営業日あたりは、営業日あたりをその月に利用明細でコストがあった利用者（${mon(m.month)} ${users} 人・${mon(prev.month)} ${prevUsers} 人）で割った値です。経過が ${window.ForecastCard.MIN_ELAPSED} 営業日未満のあいだは見込みを出しません（仮の基準）。`);
  }

  return { tab, panel };
})();
