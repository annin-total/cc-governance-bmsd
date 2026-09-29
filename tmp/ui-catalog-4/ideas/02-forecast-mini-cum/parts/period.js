"use strict";
// 期間の切り替え（見出しの右の分段）。本実装のサーバ描画に合わせ、?period= のリンクで読み直す。開いているタブ（#…）は持ち越す
window.Period = (() => {
  const OPTIONS = [["7", "7 日"], ["28", "28 日"], ["12m", "12 か月"]];
  const DEFAULT = "7";

  const current = () => {
    const p = new URLSearchParams(location.search).get("period");
    return OPTIONS.some(([id]) => id === p) ? p : DEFAULT;
  };

  function render(selected) {
    return `<nav class="chipbar period" aria-label="期間">${OPTIONS.map(([id, label]) =>
      `<a href="?period=${id}"${id === selected ? ' aria-current="true"' : ""} data-period="${id}">${label}</a>`).join("")}</nav>`;
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-period]");
    if (!a) return;
    e.preventDefault();
    location.href = `?period=${a.dataset.period}${location.hash}`;
  });

  return { current, render, is12m: (p) => p === "12m" };
})();
