"use strict";
// 自作のカレンダー（期間のページで帯の期間の表示を押すと、その下に開く）。日の見せ方は 3 つ（meta.days から）:
// 利用明細あり・利用明細の取り込み待ち（最終日より後で記録がある日。斜線で押せない）・利用明細なし。状態の色は使わない。
// 選べる日は meta.first_pick〜meta.end。選んだ日を枠で、その日で終わる期間（7・28 日）を薄い地で示す。「最新」で asof を外す。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const DAY = 86400000;
  let shown = null; // 表示中の月の 1 日（epoch 日）

  const date = (d) => new Date(d * DAY);
  const fromYM = (y, m) => Math.round(Date.UTC(y, m, 1) / DAY);
  const monthOf = (d) => fromYM(date(d).getUTCFullYear(), date(d).getUTCMonth());
  const addMonths = (first, n) => fromYM(date(first).getUTCFullYear(), date(first).getUTCMonth() + n);

  function kindOf(d, info, m) {
    if (info && info.csv) return "has";
    if (info && info.rec && (m.csv_end === null || d > m.csv_end)) return "wait";
    return "none";
  }

  function dayHtml(d, ctx) {
    const { m, days, sel, span } = ctx;
    const kind = kindOf(d, days.get(d), m);
    const can = m.first_pick !== null && d >= m.first_pick && d <= m.end && kind !== "wait";
    const cls = [`cal-day cal-${kind}`, span && d > sel - span && d <= sel ? "in-range" : "", d === sel ? "is-sel" : "", can ? "" : "is-off"].filter(Boolean).join(" ");
    return `<button type="button" class="${cls}" data-day="${d}" aria-label="${esc(K.day(d))}"${d === sel ? ' aria-current="date"' : ""}${can ? "" : " disabled"}>${date(d).getUTCDate()}</button>`;
  }

  function html(span) {
    const L = K.L, m = window.DATA.meta;
    const ctx = { m, days: new Map(m.days.map((x) => [x.day, x])), sel: K.basedate.chosen(), span };
    const next = addMonths(shown, 1), lead = (date(shown).getUTCDay() + 6) % 7;
    const cells = Array.from({ length: lead }, () => "<span></span>").join("") + Array.from({ length: next - shown }, (_, i) => dayHtml(shown + i, ctx)).join("");
    const nav = (dir, off, label) => `<button type="button" class="cal-nav" data-cal-move="${dir}" aria-label="${esc(label)}"${off ? " disabled" : ""}>${dir < 0 ? "‹" : "›"}</button>`;
    const legend = Object.entries(L.CAL_LEGEND).map(([k, t]) => `<span><i class="cal-key cal-${k}"></i>${esc(t)}</span>`).join("");
    return `<div class="cal" role="dialog" aria-label="${esc(L.BASE_DATE_PICK)}" data-cal><div class="cal-head">${nav(-1, shown <= monthOf(m.days[0].day), L.CAL_PREV)}`
      + `<b>${esc(K.ym(shown))}</b>${nav(1, shown >= monthOf(m.today), L.CAL_NEXT)}</div>`
      + `<div class="cal-grid">${Object.values(L.WEEKDAY_NAMES).map((w) => `<span class="cal-wd">${esc(w)}</span>`).join("")}${cells}</div>`
      + `<div class="cal-foot"><span class="cal-legend">${legend}</span><button type="button" class="cal-latest" data-cal-latest>${esc(L.LATEST)}</button></div></div>`;
  }

  function close() {
    document.querySelectorAll("[data-cal]").forEach((c) => c.remove());
    document.querySelectorAll("[data-cal-open]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  }

  function render(button) {
    close();
    button.insertAdjacentHTML("afterend", html(Number(button.dataset.calSpan)));
    button.setAttribute("aria-expanded", "true");
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    const open = t.closest("[data-cal-open]");
    if (open) {
      if (open.getAttribute("aria-expanded") === "true") { close(); return; }
      shown = monthOf(K.basedate.chosen());
      render(open);
      return;
    }
    if (!t.closest("[data-cal]")) { close(); return; }
    const move = t.closest("[data-cal-move]"), day = t.closest("[data-day]"), latest = t.closest("[data-cal-latest]");
    if (move && !move.disabled) { shown = addMonths(shown, Number(move.dataset.calMove)); render(document.querySelector("[data-cal-open]")); }
    if (day && !day.disabled) location.href = K.basedate.hrefAt(Number(day.dataset.day));
    if (latest) location.href = K.basedate.hrefAt(window.DATA.meta.end);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();
