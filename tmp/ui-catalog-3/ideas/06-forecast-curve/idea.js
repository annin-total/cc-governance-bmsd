"use strict";
// 案 06: 見込みのカードに、営業日を横軸にした累積のグラフ（今月の実線・月末までの破線・前月の薄い線）を載せる
(() => {
  const { D, fmt, card, change, cap, costOf, forecast } = C;
  const F = forecast();
  const HOL = new Set(D.month_forecast.holidays.map((h) => fmt.dayOf(h.date)));
  const W = 300, H = 116, L = 46, T = 6, B = 96, STEP_Y = 4000;

  function monthDays(ym) {
    const a = fmt.dayOf(ym + "-01"), [y, m] = ym.split("-").map(Number);
    const b = fmt.dayOf(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
    return C.range(a, b);
  }
  const isBd = (d) => { const w = new Date(d * 864e5).getUTCDay(); return w > 0 && w < 6 && !HOL.has(d); };
  // 営業日 k の値 = その日までの累積（直前の休日の分を含む）
  function cumByBd(ym, lastDay) {
    let sum = 0;
    const out = [];
    for (const d of monthDays(ym)) {
      if (d > lastDay) break;
      sum += (costOf.get(d) || { total: 0 }).total;
      if (isBd(d)) out.push({ day: d, v: sum });
    }
    return out;
  }
  const asOf = fmt.dayOf(F.as_of);
  const cur = cumByBd(F.month, asOf), prev = cumByBd(F.prev_month, Infinity);
  const n = Math.max(F.business_days, prev.length), top = Math.ceil(Math.max(F.forecast, F.prev_total) / STEP_Y) * STEP_Y;
  const X = (k) => +(L + (k - 1) * (W - L - 4) / (n - 1)).toFixed(1), Y = (v) => +(B - v / top * (B - T)).toFixed(1);
  const pl = (pts) => pts.map((p, i) => `${X(i + 1)},${Y(p.v)}`).join(" ");
  const k = cur.length;

  function chart() {
    const grid = [];
    for (let v = 0; v <= top; v += STEP_Y) grid.push(`<line class="gridline" x1="${L}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt.usd(v, true)}</text>`);
    const ticks = [1, 5, 10, 15, n].map((t) => `<text x="${X(t)}" y="${H - 2}" text-anchor="middle">${t}</text>`).join("");
    const pts = [];
    for (let i = 1; i <= n; i++) {
      const c = cur[i - 1], p = prev[i - 1];
      const est = i > k && i <= F.business_days ? F.actual + F.per_business_day * (i - k) : null;
      const parts = [c ? `今月 ${fmt.usd(c.v)}` : est != null ? `見込み ${fmt.usd(est)}` : null, p ? `前月 ${fmt.usd(p.v)}` : null].filter(Boolean);
      pts.push({ day: i, v: c ? c.v : est != null ? est : p ? p.v : null, label: `${i} 営業日目${c ? "（" + fmt.md(c.day) + "）" : ""}`, text: parts.join(" · ") });
    }
    C.series.fc = pts;
    const step = (W - L - 4) / (n - 1);
    const hits = pts.map((_, i) => `<rect class="hit" data-i="${i}" x="${(X(i + 1) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${B}"/>`).join("");
    const dots = pts.map(({ v }, i) => { return v == null ? "" : `<circle class="pt" data-i="${i}" cx="${X(i + 1)}" cy="${Y(v)}" r="3"/>`; }).join("");
    return `<svg class="fc-chart" data-s="fc" viewBox="0 0 ${W} ${H}" aria-hidden="true">${grid.join("")}${ticks}` +
      `<polyline class="fc-prev" points="${pl(prev)}"/>` +
      `<polyline class="fc-est" points="${X(k)},${Y(F.actual)} ${X(F.business_days)},${Y(F.forecast)}"/>` +
      `<polyline class="fc-cur" points="${pl(cur)}"/>` +
      `<circle class="spark-dot" cx="${X(k)}" cy="${Y(F.actual)}" r="3"/><circle class="fc-end" cx="${X(F.business_days)}" cy="${Y(F.forecast)}" r="3"/>` +
      `<g class="marks">${dots}</g><g class="hits">${hits}</g></svg>`;
  }

  function fcCard() {
    const key = `<span class="legend fc-key"><span><i class="k-cur"></i>今月の実績</span><span><i class="k-est"></i>月末までの見込み</span><span><i class="k-prev"></i>前月（${F.pm} 月）</span></span>`;
    return card({ cls: "wide fc", label: `月末のコストの見込み（${F.m} 月）`, open: "cost", value: F.value,
      sub: `実績 ${fmt.usd(F.actual)} · ${F.elapsed_business_days} / ${F.business_days} 営業日`,
      viz: `<span class="fc-side"><span class="k-sub">${change(fmt.signed(F.ch, (v) => v.toFixed(1) + "%"), F.ch > 0)}営業日あたり ${fmt.usd(F.per_business_day)}</span>` +
        cap(`前月 ${F.prev_business_days} 営業日で ${fmt.usd(F.prev_total)}`) + cap(`${fmt.md(asOf)} まで · 横軸は営業日`) + `</span>${chart()}${key}` });
  }
  C.hooks.cards.push((cards) => { cards.push(fcCard()); return cards; });
})();
