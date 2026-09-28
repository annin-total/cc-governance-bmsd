"use strict";
// エクスポートのページ（案 13）: 暦年の 12 か月を 4×3 の格子に並べ、月を押すとその月の ZIP をダウンロードする
(() => {
  const { h, nf, fmt } = UI;
  const D = window.DATA, X = D.export;
  const TABLES = [["events", "記録"], ["policy_state", "設定の報告"], ["errors", "エラー"], ["cost_daily", "利用明細"]];
  const BY = new Map(X.months.map((m) => [m.month, m]));
  const LAST = X.months[X.months.length - 1].month;
  const FIRST = X.months[0].month;
  const YEARS = [...new Set(X.months.map((m) => m.month.slice(0, 4)))];
  const rowsOf = (m) => Object.values(m.rows).reduce((a, b) => a + b, 0);
  const MAX = Math.max(...X.months.map(rowsOf));
  const size = (b) => (b >= 1e6 ? `${nf(b / 1e6, 1)} MB` : b >= 1e3 ? `${nf(Math.round(b / 1e3))} KB` : "1 KB 未満");
  const parts = (m) => TABLES.map(([k, name]) => `${name} ${nf(m.rows[k])}`).join(" · ");
  let year = LAST.slice(0, 4);
  let picked = null;

  function cell(ym) {
    const m = BY.get(ym);
    const name = `${Number(ym.slice(5))} 月`;
    if (!m) {
      return h("div", { class: "mcell none" }, h("span", { class: "mname" }, name), h("span", { class: "mrows" }, ym > LAST ? "まだありません" : "記録なし"));
    }
    const rows = rowsOf(m);
    return h("button", { type: "button", class: `mcell${picked === ym ? " is-open" : ""}`, "data-m": ym, "data-tip-k": `${ym} の行数`, "data-tip": `${parts(m)} 行` },
      h("span", { class: "mname" }, name, ym === LAST || ym === FIRST ? h("span", { class: "mtag" }, ym === LAST ? "途中" : `${UI.md(UI.dayOf(D.meta.csv_first))} から`) : ""),
      h("span", { class: "mrows" }, UI.val(fmt.count(rows, "行"))),
      h("span", { class: "hbar" }, h("i", { style: `width: ${((rows / MAX) * 100).toFixed(1)}%` })),
      h("span", { class: "mfoot" }, h("span", {}, `約 ${size(m.zip_bytes_est)}`), h("span", { class: "mgo" }, "ZIP")));
  }

  function render() {
    const grid = document.querySelector("[data-grid]");
    grid.replaceChildren(...Array.from({ length: 12 }, (_, i) => cell(`${year}-${String(i + 1).padStart(2, "0")}`)));
    for (const b of document.querySelectorAll("[data-year]")) b.setAttribute("aria-pressed", String(b.dataset.year === year));
  }

  function download(ym) {
    const m = BY.get(ym);
    picked = ym;
    render();
    document.querySelector("[data-dl-result]").replaceChildren(h("p", { class: "notice ok", role: "status" },
      `${ym}.zip をダウンロードしました（約 ${size(m.zip_bytes_est)}）· ${parts(m)} 行`));
  }

  function facts(done) {
    document.querySelector("[data-import-facts]").replaceChildren(
      h("span", { class: "sub" }, "取り込み済み "), `${D.meta.csv_first} 〜 ${D.meta.csv_last}`,
      h("span", { class: "sub" }, ` · ${nf(D.daily_cost.length)} 日 · 最後に取り込んだ時刻 `), done ? "2026-09-29 10:14" : "2026-09-29 08:02");
    if (done) {
      document.querySelector("[data-import-result]").replaceChildren(h("p", { class: "notice ok", role: "status" },
        `取り込みました · 3 ファイルを読み、${D.meta.csv_first}〜${D.meta.csv_last} の ${nf(D.daily_cost.length)} 日を置き換えました`));
    }
  }

  document.querySelector("[data-years]").replaceChildren(...YEARS.map((y) => h("button", { type: "button", "data-year": y }, `${y} 年`)));
  document.querySelector("[data-years]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-year]");
    if (b) { year = b.dataset.year; render(); }
  });
  document.querySelector("[data-grid]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]");
    if (b) download(b.dataset.m);
  });
  document.querySelector("[data-import] form").addEventListener("submit", (e) => { e.preventDefault(); facts(true); });
  render();
  facts(false);
  UI.tooltips();
})();
