"use strict";
// 案 51（look.ends === "bill"）の帯の期間の表示と、利用明細の古さの警告（第 4 弾から移植）。基準日の値は basedate.js、日を選ぶのは calendar.js。
// 期間のページは押すとカレンダー、状態のページ（page.now）は今日の「MM/DD 時点」で押せない。
(() => {
  const K = window.KIT;
  const { esc, fill } = K;
  const LAG_DAYS = 3; // 明細の遅れの見本（look.lag）で、利用明細の最終日を何日前に見せるか
  const meta = () => window.DATA.meta;

  // 明細の遅れの見本: 値は変えず、利用明細の最終日と鮮度の表示だけを LAG_DAYS 日前にする（build が look を決めた後に 1 回呼ぶ）
  function prepare() {
    if (K.look.get().lag !== "lag") return;
    const m = meta();
    m.csv_end -= LAG_DAYS;
    m.end = m.csv_end;
    m.days.forEach((x) => { if (x.day > m.csv_end) x.csv = false; });
  }

  // 今日の取り込みの状態（選んだ基準日に依らない）
  function fresh() {
    const m = meta();
    const age = m.csv_end === null ? null : m.today - m.csv_end;
    return { today: m.today, csv_end: m.csv_end, age, state: age !== null && age >= m.csv_stale_days ? "warn" : "ok" };
  }

  // 期間の日数（送りと、カレンダーの薄い地の幅。期間を持たないページは 0）
  function span(page) {
    if (!page.periods || page.now) return 0;
    const p = window.DATA.p[K.period].period;
    return p.end - p.start + 1;
  }

  function step(d, n, back) {
    const B = K.basedate, ok = back ? d >= B.first() : d - n < B.today();
    const label = (back ? K.L.CAL_STEP_BACK : K.L.CAL_STEP_NEXT).replace("{}", n);
    return ok ? `<a class="cal-step" href="${esc(B.hrefAt(Math.min(d, B.today())))}" aria-label="${esc(label)}" title="${esc(label)}" data-cal-step>${back ? "◀" : "▶"}</a>`
      : `<span class="cal-step" aria-disabled="true">${back ? "◀" : "▶"}</span>`;
  }

  // 帯の期間の表示（look.cal で形が変わる: CA3 は前後の送りとアイコン、CA7 は押せない文字で、日の帯は calendar.js が帯の下に置く）
  function display(page) {
    const L = K.L, cal = K.look.get().cal;
    if (page.now) return `<span class="asof-range asof-now" data-period-display>${esc(L.ASOF.replace("{}", K.md(meta().today)))}</span>`;
    const end = K.basedate.chosen(), p = window.DATA.p[K.period].period, n = span(page);
    const text = !page.periods ? L.ASOF.replace("{}", K.md(end)) : `${(p.long ? K.day : K.md)(end - (p.end - p.start))}〜${K.md(end)}`;
    if (cal === "CA7") return `<span class="asof-range asof-text" data-period-display data-cal-span="${n}">${esc(text)}</span>`;
    const open = (cls, body) => `<button type="button" class="${cls}" data-cal-open data-cal-span="${n}" aria-expanded="false" title="${esc(L.BASE_DATE_PICK)}">${body}</button>`;
    if (cal === "CA3") {
      const by = n || 7;
      return `<span class="cal-steps" data-period-display>${step(end - by, by, true)}<span class="asof-text">${esc(text)}</span>${step(end + by, by, false)}`
        + `${open("cal-icon", `<span class="sr">${esc(L.CAL_OPEN)}</span>`)}</span>`;
    }
    return `<span class="asof-range" data-period-display>${open("", esc(text))}</span>`;
  }

  // 利用明細の古さの警告（look.stale が W1 のとき、帯の期間の表示の横。押すと収集の状態へ）
  function stale() {
    const s = fresh();
    if (K.look.get().stale !== "W1" || s.state !== "warn") return "";
    return `<a class="stale" href="${esc(K.basedate.keep("?page=collect"))}" data-stale>${esc(fill(K.L.STALE, s))}</a>`;
  }

  Object.assign(K.basedate, { display, stale, fresh, span });
  K.prepares = [...(K.prepares || []), prepare];
})();
