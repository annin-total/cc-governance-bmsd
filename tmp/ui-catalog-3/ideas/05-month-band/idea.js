"use strict";
// 案 05: 概況の最上部に、暦月の「今月」の帯を置く（期間の切り替えとは無関係）
(() => {
  const { fmt, change, forecast } = C;
  const F = forecast();
  const bds = F.business_day_list.map(fmt.dayOf), asOf = fmt.dayOf(F.as_of);
  const rest = bds.filter((d) => d > asOf).map(fmt.md).join("・");
  const segs = bds.map((d) => `<i class="${d <= asOf ? "done" : ""}"></i>`).join("");
  const cell = (label, value, sub, extra = "") => `<div class="m-cell"><span class="m-label">${label}</span><span class="m-val">${value}</span>${extra}<span class="m-sub">${sub}</span></div>`;
  document.getElementById("month").innerHTML =
    `<section class="group month" aria-label="今月のコスト"><h2 class="glabel">今月のコスト<span>${F.month.slice(0, 4)} 年 ${F.m} 月 · 暦月で数え、期間の切り替えとは別 · 利用明細の最終日 ${fmt.md(asOf)} まで</span></h2>` +
    `<div class="mband">` +
    `<div class="m-cell m-main"><span class="m-label">月末の見込み</span><span class="k-value">${F.value}</span><span class="m-sub">実績 × ${F.business_days} ÷ ${F.elapsed_business_days} 営業日</span></div>` +
    cell("実績", fmt.usd(F.actual), `${fmt.md(fmt.dayOf(F.month + "-01"))}〜${fmt.md(asOf)}`) +
    cell("営業日の進み", `${F.elapsed_business_days}<small> / ${F.business_days} 日</small>`, rest ? `残り ${rest}` : "月末まで経過", `<span class="segs" aria-hidden="true">${segs}</span>`) +
    cell("営業日あたり", fmt.usd(F.per_business_day), change(fmt.signed(F.ch, (v) => v.toFixed(1) + "%"), F.ch > 0) + `前月 ${fmt.usd(F.prev_per_business_day)}`) +
    cell(`前月（${F.pm} 月）の合計`, fmt.usd(F.prev_total), `${F.prev_business_days} 営業日`) +
    `</div></section>`;
})();
