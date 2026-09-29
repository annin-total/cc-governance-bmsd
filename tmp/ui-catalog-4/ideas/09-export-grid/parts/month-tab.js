"use strict";
// 下段の「今月のコスト」タブ: 営業日を横軸にした累積（今月の実績・月末までの見込み・前月）と、営業日ごとの表。
// グラフの列と表の行は data-k（営業日の番号）で結ぶ（link.js）
window.MonthTab = (() => {
  const F = window.Fmt, U = window.UI, C = window.Charts;
  const W = C.W_FULL, H = 210, AXIS_W = 56, TOP = 8;

  const mon = (ym) => `${Number(ym.slice(5))} 月`;
  const day = (isoText) => F.toDay(isoText);

  function chart(cur, prev, forecast) {
    const n = Math.max(cur.business_days, prev.business_days), pitch = (W - AXIS_W) / n;
    const { top, step } = C.nice(Math.max(forecast, prev.total), 5);
    const x = (i) => AXIS_W + (i - 0.5) * pitch, y = (v) => H - ((H - TOP) * v) / top;
    const pt = (i, v) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    const actual = cur.rows.filter((r) => r.cum != null), last = actual[actual.length - 1];
    let grid = "";
    for (let v = 0; v <= top + 1e-9; v += step) grid += `<line class="gridline" x1="${AXIS_W}" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${AXIS_W - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${F.usdText(v, true)}</text>`;
    const lines = `<polyline class="cum-prev" points="${prev.rows.map((r) => pt(r.n, r.cum)).join(" ")}"/>`
      + `<polyline class="cum-fc" points="${[pt(last.n, last.cum), ...cur.rows.filter((r) => r.forecast_cum != null).map((r) => pt(r.n, r.forecast_cum))].join(" ")}"/>`
      + `<polyline class="cum-now" points="${actual.map((r) => pt(r.n, r.cum)).join(" ")}"/>`;
    const cols = Array.from({ length: n }, (_, j) => {
      const i = j + 1, c = cur.rows[j], p = prev.rows[j], v = c ? c.cum ?? c.forecast_cum : null;
      return `<g class="col" data-k="${i}"><rect class="hit" x="${(AXIS_W + j * pitch).toFixed(1)}" y="0" width="${pitch.toFixed(1)}" height="${H}"/>`
        + `<line class="guide" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${TOP}" y2="${H}"/>`
        + (p ? `<circle class="dot-prev" cx="${x(i).toFixed(1)}" cy="${y(p.cum).toFixed(1)}" r="3"/>` : "")
        + (v != null ? `<circle class="${c.cum != null ? "dot-now" : "dot-fc"}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3"/>` : "")
        + `<text class="tick" x="${x(i).toFixed(1)}" y="${H + 16}" text-anchor="middle">${i}</text></g>`;
    }).join("");
    return `<svg class="chart cum" viewBox="0 0 ${W} ${H + 22}" aria-hidden="true">${grid}${lines}${cols}</svg>`;
  }

  function table(cur, prev) {
    const n = Math.max(cur.business_days, prev.business_days);
    const costs = cur.rows.filter((r) => r.cost != null).map((r) => r.cost), maxCost = Math.max(...costs);
    const fCost = F.usdCol(costs), fCum = F.usdCol([...cur.rows.map((r) => r.cum ?? r.forecast_cum ?? 0), ...prev.rows.map((r) => r.cum)]);
    const rows = Array.from({ length: n }, (_, j) => {
      const c = cur.rows[j], p = prev.rows[j], i = j + 1;
      const date = c ? `${F.md(day(c.date))}${U.sub(F.wd(day(c.date)))}${c.from ? U.sub(` · ${F.md(day(c.from))}〜 の合計`) : ""}` : U.dash;
      const cum = c?.cum != null ? `<b>${fCum(c.cum)}</b>` : c?.forecast_cum != null ? U.sub(`見込み ${fCum(c.forecast_cum)}`) : U.dash;
      return U.tr({ k: i, tags: c?.cum != null ? "actual" : "rest" },
        U.td("c-bd", i, `${i}`) + U.td("c-date", c ? day(c.date) : "", date)
        + U.td("c-usd num", c?.cost, c?.cost != null ? fCost(c.cost) : U.dash)
        + (c?.cost != null ? U.hbar(c.cost, maxCost) : U.td("c-bar", "", ""))
        + U.td("c-usd_strong num", c?.cum ?? c?.forecast_cum, cum)
        + U.td("c-usd num", p?.cum, p ? U.sub(fCum(p.cum)) : U.dash));
    });
    return U.table("month", [
      { label: "営業日", cls: "c-bd", sort: "ascending" }, { label: "日付", cls: "c-date" }, { label: "その日のコスト", cls: "c-usd num" },
      { cls: "c-bar" }, { label: "今月の累積", cls: "c-usd_strong num" }, { label: `前月（${mon(prev.month)}）の累積`, cls: "c-usd num" },
    ], rows);
  }

  const tab = () => {
    const m = window.DATA.month_forecast;
    return { id: "month", title: "今月のコスト", sub: `${mon(m.month)} · ${m.elapsed_business_days} / ${m.business_days} 営業日` };
  };

  function panel() {
    const m = window.DATA.month_forecast, { current: cur, prev, users, prev_users: prevUsers } = window.DATA_EXTRA.month;
    const legend = `<div class="legend cum-legend"><span><i class="ln now"></i>今月の実績 ${F.usd(m.actual)}</span><span><i class="ln fc"></i>月末までの見込み ${F.usd(m.forecast)}</span><span><i class="ln prev"></i>前月（${mon(prev.month)}）${F.usd(prev.total)}</span></div>`;
    return U.head("今月のコストの累積と月末の見込み", `${m.month} · 利用明細（CSV）の ${F.md(day(m.as_of))} まで · 横軸は営業日（休日の分は次の営業日に含める）`)
      + `<div class="p-chart">${chart(cur, prev, m.forecast)}${legend}</div>`
      + table(cur, prev)
      + U.note(`見込みは実績 × 月の営業日数 ÷ 経過した営業日数です（${F.usd(m.actual)} × ${m.business_days} ÷ ${m.elapsed_business_days}）。営業日は平日かつ国民の祝日でない日です。`
        + `1 人 1 営業日あたりは、営業日あたりをその月に利用明細でコストがあった利用者（${mon(m.month)} ${users} 人・${mon(prev.month)} ${prevUsers} 人）で割った値です。経過が ${window.ForecastCard.MIN_ELAPSED} 営業日未満のあいだは見込みを出しません（仮の基準）。`);
  }

  return { tab, panel };
})();
