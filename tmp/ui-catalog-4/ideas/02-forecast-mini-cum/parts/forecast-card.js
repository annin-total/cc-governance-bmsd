"use strict";
// 月末のコストの見込みのカード（1/4 の大きさ）。数字の下端に営業日を横軸にした低い累積の線（今月・見込み・前月）。
// 押すと下段の「今月のコスト」タブが開く
window.ForecastCard = (() => {
  const F = window.Fmt, U = window.UI;
  const CUM_W = 300, CUM_H = 28, CUM_PAD = 2;
  const MIN_ELAPSED = 3; // 経過営業日がこれ未満なら見込みを「—」にする（仮の値）

  const monthNo = (ym) => Number(ym.slice(5));
  const changeChip = (now, prev) => {
    const diff = ((now - prev) / prev) * 100;
    return U.change(F.signed(diff, 1, "%"), diff > 0);
  };
  // 1 つの比較: 見出し・今月の値と増減・前月の値
  const stat = (label, now, prev, prevMonth) => `<span class="fc-stat"><span class="fc-label">${label}</span>
  <span class="fc-now">${F.usd(now)}${changeChip(now, prev)}</span><span class="fc-prev">${prevMonth} 月 ${F.usd(prev)}</span></span>`;

  // 低い累積の線。点ごとの札は「n 営業日目 · 日付  今月の累積 · 前月の累積」
  function cumLine(cur, prev, forecast, prevMon) {
    const n = Math.max(cur.business_days, prev.business_days), top = Math.max(forecast, prev.total);
    const x = (i) => ((i - 1) * CUM_W) / (n - 1), y = (v) => CUM_PAD + ((top - v) * (CUM_H - 2 * CUM_PAD)) / top;
    const pt = (r, v) => `${x(r.n).toFixed(1)},${y(v).toFixed(1)}`;
    const actual = cur.rows.filter((r) => r.cum != null), last = actual[actual.length - 1];
    const fc = [pt(last, last.cum), ...cur.rows.filter((r) => r.forecast_cum != null).map((r) => pt(r, r.forecast_cum))];
    const hits = Array.from({ length: n }, (_, j) => {
      const i = j + 1, c = cur.rows[j], p = prev.rows[j], a = Math.max(0, x(i - 0.5)), b = Math.min(CUM_W, x(i + 0.5));
      const now = c?.cum != null ? F.usdText(c.cum) : c?.forecast_cum != null ? `見込み ${F.usdText(c.forecast_cum)}` : "";
      const tip = `${i} 営業日目${c ? ` · ${F.md(F.toDay(c.date))}` : ""}  ${[now, p ? `${prevMon} 月 ${F.usdText(p.cum)}` : ""].filter(Boolean).join(" · ")}`;
      return `<rect class="hit" x="${a.toFixed(1)}" y="0" width="${(b - a).toFixed(1)}" height="${CUM_H}" data-tip="${F.esc(tip)}" data-gx="${x(i).toFixed(1)}"/>`;
    }).join("");
    return `<svg class="fc-cum" viewBox="0 0 ${CUM_W} ${CUM_H}" preserveAspectRatio="none" aria-hidden="true">
  <polyline class="fc-cum-prev" points="${prev.rows.map((r) => pt(r, r.cum)).join(" ")}" vector-effect="non-scaling-stroke"/>
  <polyline class="fc-cum-fc" points="${fc.join(" ")}" vector-effect="non-scaling-stroke"/>
  <polyline class="fc-cum-now" points="${actual.map((r) => pt(r, r.cum)).join(" ")}" vector-effect="non-scaling-stroke"/>
  <circle class="spark-dot" cx="${x(last.n).toFixed(1)}" cy="${y(last.cum).toFixed(1)}" r="2.5"/>
  <line class="spark-guide" x1="0" x2="0" y1="0" y2="${CUM_H}" vector-effect="non-scaling-stroke"/>${hits}</svg>`;
  }

  function card() {
    const m = window.DATA.month_forecast, x = window.DATA_EXTRA.month;
    const ok = m.elapsed_business_days >= MIN_ELAPSED, prevMon = monthNo(m.prev_month);
    return U.card({
      label: `月末のコスト見込み（${monthNo(m.month)} 月）`, open: "month", cls: "fc",
      value: ok ? F.usd(m.forecast) : "—",
      viz: `<span class="fc-stats">${stat("営業日あたり", m.per_business_day, m.prev_per_business_day, prevMon)}${stat("1 人 1 営業日あたり", x.per_user_per_business_day, x.prev_per_user_per_business_day, prevMon)}</span>`
        + cumLine(x.current, x.prev, m.forecast, prevMon)
        + U.cap(`実績 ${F.usd(m.actual)} · ${m.elapsed_business_days} / ${m.business_days} 営業日`, `${F.md(F.toDay(m.as_of))} まで`),
    });
  }

  return { card, MIN_ELAPSED };
})();
