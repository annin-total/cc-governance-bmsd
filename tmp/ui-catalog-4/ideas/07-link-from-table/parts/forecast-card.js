"use strict";
// 月末のコストの見込みのカード（1/4 の大きさ・数字だけ）。押すと下段の「今月のコスト」タブが開く
window.ForecastCard = (() => {
  const F = window.Fmt, U = window.UI;
  const MIN_ELAPSED = 3; // 経過営業日がこれ未満なら見込みを「—」にする（仮の値）

  const monthNo = (ym) => Number(ym.slice(5));
  const changeChip = (now, prev) => {
    const diff = ((now - prev) / prev) * 100;
    return U.change(F.signed(diff, 1, "%"), diff > 0);
  };
  // 1 つの比較: 見出し・今月の値と増減・前月の値
  const stat = (label, now, prev, prevMonth) => `<span class="fc-stat"><span class="fc-label">${label}</span>
  <span class="fc-now">${F.usd(now)}${changeChip(now, prev)}</span><span class="fc-prev">${prevMonth} 月 ${F.usd(prev)}</span></span>`;

  function card() {
    const m = window.DATA.month_forecast, x = window.DATA_EXTRA.month;
    const ok = m.elapsed_business_days >= MIN_ELAPSED, prevMon = monthNo(m.prev_month);
    return U.card({
      label: `月末のコスト見込み（${monthNo(m.month)} 月）`, open: "month", cls: "fc",
      value: ok ? F.usd(m.forecast) : "—",
      viz: `<span class="fc-stats">${stat("営業日あたり", m.per_business_day, m.prev_per_business_day, prevMon)}${stat("1 人 1 営業日あたり", x.per_user_per_business_day, x.prev_per_user_per_business_day, prevMon)}</span>`
        + U.cap(`実績 ${F.usd(m.actual)} · ${m.elapsed_business_days} / ${m.business_days} 営業日`, `${F.md(F.toDay(m.as_of))} まで`),
    });
  }

  return { card, MIN_ELAPSED };
})();
