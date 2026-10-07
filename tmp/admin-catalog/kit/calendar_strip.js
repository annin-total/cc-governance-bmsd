"use strict";
// カレンダーの型 CA7（案 51）: 帯の下に直近の日を横一列に並べ（開かない）、期間の窓を枠で示す。日を押すとその日で終わる期間へ移る。
// 日の 3 つの見せ方・選べる範囲・「最新」は calendar.js と同じ（押した日の扱いも calendar.js のクリックの受け手が持つ）。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const STRIP_DAYS = 60; // 帯に並べる日数（今日まで）

  function html(span) {
    const C = K.calendar, ctx = C.context(span), today = ctx.m.today;
    const cells = Array.from({ length: STRIP_DAYS }, (_, i) => C.dayHtml(today - STRIP_DAYS + 1 + i, ctx)).join("");
    return `<div class="cal-strip" data-cal role="group" aria-label="${esc(K.L.BASE_DATE_PICK)}"><div class="strip-days" style="grid-template-columns: repeat(${STRIP_DAYS}, 1fr)">${cells}</div>`
      + `<div class="cal-foot">${C.legendHtml(ctx)}<button type="button" class="cal-latest" data-cal-latest>${esc(K.L.LATEST)}</button></div></div>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const shown = document.querySelector(".asof-text[data-period-display][data-cal-span]");
    const head = document.querySelector("main .page-head");
    if (K.look.get().cal !== "CA7" || !shown || !head) return;
    head.insertAdjacentHTML("afterend", html(Number(shown.dataset.calSpan)));
  });
})();
