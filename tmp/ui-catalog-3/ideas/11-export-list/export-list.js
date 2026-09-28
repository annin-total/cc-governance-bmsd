"use strict";
// 案 11: 月の一覧から押すだけでダウンロードする。取り込みはページの上部に置く
const X = (() => {
  const { D, h, int, mb } = L;
  const TABLES = [["events", "記録"], ["policy_state", "設定の報告"], ["errors", "エラー"], ["cost_daily", "利用明細"]];
  const short = (iso) => iso.slice(5).replace("-", "/");

  function monthCell(m, i, all) {
    const note = i === 0 ? `${short(D.meta.today)} まで · 途中` : i === all.length - 1 ? `${short(D.meta.csv_first)} から` : null;
    return { v: m.month, cls: "c-date", content: [m.month, note ? P.sub(`（${note}）`) : null] };
  }

  function list() {
    const months = [...D.export.months].reverse();
    const max = Math.max(...months.map((m) => m.zip_bytes_est));
    const cols = [{ label: "月", cls: "c-date" }, ...TABLES.map(([, l]) => ({ label: l, cls: "c-num num" })), { label: "大きさ（目安）", cls: "c-num num" }, { cls: "c-bar" }, { cls: "c-act" }];
    const rows = months.map((m, i, all) => ({ cells: [monthCell(m, i, all),
      ...TABLES.map(([k]) => ({ v: m.rows[k], cls: "c-num num", content: `${int(m.rows[k])} 件` })),
      { v: m.zip_bytes_est, cls: "c-num num", content: mb(m.zip_bytes_est) },
      { v: m.zip_bytes_est, cls: "c-bar", content: P.hbar((m.zip_bytes_est / max) * 100) },
      { cls: "c-act", content: h("button", { type: "button", class: "btn sub", "aria-label": `${m.month} の ZIP をダウンロード` }, "ダウンロード") }] }));
    const t = P.table("months", cols, rows, 0);
    return h("div", { class: "panel", "data-panel": "months" },
      h("header", { class: "p-head" }, h("h2", {}, "月ごとの全ログ"), h("p", { class: "scope" }, "新しい月から · 1 行が 1 つの ZIP · 大きさは圧縮後の見込み")),
      t,
      h("p", { class: "note" }, "ZIP の中身は events.csv（記録）・policy_state.csv（設定の報告）・errors.csv（エラー）・cost_daily.csv（利用明細）の 4 つです。利用者名つき、UTF-8、日付は JST です。"));
  }

  function start() {
    document.getElementById("export").replaceChildren(
      P.block("取り込む", "利用明細（CSV）はコストとトークンの正本です",
        h("form", { class: "panel form-row", action: "#" }, h("label", { class: "field", for: "csv" }, "CSV"), h("input", { type: "file", id: "csv", accept: ".csv" }),
          h("button", { type: "submit", class: "btn" }, "CSV を取り込む"), h("span", { class: "form-hint" }, `取り込み済みの明細 ${D.meta.csv_first}〜${D.meta.csv_last}`))),
      P.block("書き出す", "記録・設定の報告・エラー・利用明細の 4 表を、月ごとに表ごとの CSV の ZIP で", list()));
  }

  return { start };
})();
