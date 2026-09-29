"use strict";
// 期間の切り替え（見出しの右の分段）と、その下に選んだ期間の日付。本実装のサーバ描画に合わせ、?period= のリンクで読み直す。
// 開いているタブ（#…）は持ち越す。7 日・28 日の日付は記録の期間（利用明細は 1 日前で終わる）、12 か月は利用明細の期間
window.Period = (() => {
  const OPTIONS = [["7", "7 日"], ["28", "28 日"], ["12m", "12 か月"]];
  const DEFAULT = "7";

  const current = () => {
    const p = new URLSearchParams(location.search).get("period");
    return OPTIONS.some(([id]) => id === p) ? p : DEFAULT;
  };

  function dates(k) {
    const F = window.Fmt, span = ([a, b]) => `${F.md(a)}〜${F.md(b)}`;
    if (k === "12m") return `${window.DATA_EXTRA.twelve.start}〜${window.DATA_EXTRA.twelve.end}`;
    const w = window.DATA.periods[k].events_window;
    return `${span(w.recent)}<span class="sep">·</span>前の ${k} 日 ${span(w.prev)}`;
  }

  function render(selected) {
    return `<div class="period-box"><nav class="chipbar period" aria-label="期間">${OPTIONS.map(([id, label]) =>
      `<a href="?period=${id}"${id === selected ? ' aria-current="true"' : ""} data-period="${id}">${label}</a>`).join("")}</nav>
  <p class="period-dates">${dates(selected)}</p></div>`;
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-period]");
    if (!a) return;
    e.preventDefault();
    location.href = `?period=${a.dataset.period}${location.hash}`;
  });

  return { current, render, is12m: (p) => p === "12m" };
})();
