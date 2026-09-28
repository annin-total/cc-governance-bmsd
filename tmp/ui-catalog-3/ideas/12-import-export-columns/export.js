"use strict";
// エクスポートのページ（案 12）: 左で CSV を取り込み、右で月を選ぶと含まれる表・行数・大きさ・列が見える
(() => {
  const { h, nf, fmt } = UI;
  const D = window.DATA, X = D.export;
  const TABLES = [["events", "記録"], ["policy_state", "設定の報告"], ["errors", "エラー"], ["cost_daily", "利用明細"]];
  const last = X.months[X.months.length - 1].month;
  const size = (b) => (b >= 1e6 ? `${nf(b / 1e6, 1)} MB` : b >= 1e3 ? `${nf(Math.round(b / 1e3))} KB` : "1 KB 未満");
  const label = (m) => `${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月${m === last ? "（途中）" : ""}`;
  const dash = () => h("span", { class: "sub" }, "—");

  function tables(m) {
    const body = document.querySelector("[data-tables]");
    body.replaceChildren(...TABLES.map(([k, name]) => h("tr", {},
      h("td", { class: "xname" }, h("b", {}, name), h("span", { class: "code sub key" }, `${k}.csv`)),
      h("td", { class: "num" }, m ? UI.val(fmt.count(m.rows[k], "行")) : dash()),
      h("td", { class: "num" }, m ? size(m.csv_bytes_est[k]) : dash()),
      h("td", { class: "xcolsl" }, h("span", { class: "code" }, X.columns[k].join(", "))))));
  }

  function pick(id) {
    const m = X.months.find((x) => x.month === id);
    tables(m);
    const dl = document.querySelector("[data-dl]");
    dl.disabled = !m;
    dl.textContent = m ? `${id}.zip をダウンロード` : "ZIP をダウンロード";
    const total = m ? Object.values(m.rows).reduce((a, b) => a + b, 0) : 0;
    document.querySelector("[data-zip]").textContent = m ? `4 表 · ${nf(total)} 行 · 約 ${size(m.zip_bytes_est)}` : "月を選ぶと、含まれる表の行数と大きさが出ます";
  }

  function facts(done) {
    const rows = X.months.reduce((a, m) => a + m.rows.cost_daily, 0);
    const item = (k, ...v) => h("div", {}, h("dt", {}, k), h("dd", {}, ...v));
    document.querySelector("[data-import-facts]").replaceChildren(
      item("取り込み済みの期間", `${D.meta.csv_first} 〜 ${D.meta.csv_last}`),
      item("日数と行数", `${nf(D.daily_cost.length)} 日 · ${nf(rows)} 行`),
      item("最後に取り込んだ時刻", done ? "2026-09-29 10:14" : "2026-09-29 08:02"));
    if (done) {
      document.querySelector("[data-import-result]").replaceChildren(h("p", { class: "notice ok", role: "status" },
        `取り込みました · 3 ファイルを読み、${D.meta.csv_first}〜${D.meta.csv_last} の ${nf(D.daily_cost.length)} 日を置き換えました`));
    }
  }

  const sel = document.querySelector("[data-month]");
  sel.replaceChildren(h("option", { value: "" }, "月を選ぶ"), ...[...X.months].reverse().map((m) => h("option", { value: m.month }, label(m.month))));
  sel.addEventListener("change", () => pick(sel.value));
  document.querySelector("[data-export]").addEventListener("submit", (e) => e.preventDefault());
  document.querySelector("[data-import] form").addEventListener("submit", (e) => { e.preventDefault(); facts(true); });
  const q = new URLSearchParams(location.search);
  if (q.get("m")) sel.value = q.get("m");
  pick(sel.value);
  facts(q.get("imported") === "1");
  UI.tooltips();
})();
