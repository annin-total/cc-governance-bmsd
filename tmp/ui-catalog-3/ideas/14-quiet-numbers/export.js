"use strict";
// エクスポートのページ（既定の扱い）: 月を選ぶ欄とボタンだけのフォームと、その下の CSV の取込
(() => {
  const { h, nf, fmt, val } = UI;
  const D = window.DATA, X = D.export;
  const last = X.months[X.months.length - 1].month;
  const size = (b) => (b >= 1e6 ? `${nf(b / 1e6, 1)} MB` : `${nf(Math.round(b / 1e3))} KB`);
  const sel = document.querySelector("[data-month]");
  sel.replaceChildren(...[...X.months].reverse().map((m) => h("option", { value: m.month }, `${m.month.slice(0, 4)} 年 ${Number(m.month.slice(5))} 月${m.month === last ? "（途中）" : ""}`)));
  const pick = () => {
    const m = X.months.find((x) => x.month === sel.value);
    const rows = Object.values(m.rows).reduce((a, b) => a + b, 0);
    document.querySelector("[data-zip]").replaceChildren("4 表 · ", val(fmt.count(rows, "行")), ` · 約 ${size(m.zip_bytes_est)}`);
  };
  sel.addEventListener("change", pick);
  pick();
  document.querySelector("[data-export]").addEventListener("submit", (e) => e.preventDefault());
  document.querySelector("[data-import-facts]").textContent = `取り込み済み ${D.meta.csv_first} 〜 ${D.meta.csv_last} · ${nf(D.daily_cost.length)} 日`;
  document.querySelector("[data-import] form").addEventListener("submit", (e) => e.preventDefault());
  UI.tooltips();
})();
