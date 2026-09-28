"use strict";
// エクスポート（既定の扱い）: 月を選ぶ欄とボタンだけの素朴なフォームと、その下の CSV の取り込み
const X = (() => {
  const { D, h, int, mb } = L;

  const label = (m, i, all) => (i === 0 ? `${m.month}（${D.meta.today.slice(5).replace("-", "/")} まで）` : i === all.length - 1 ? `${m.month}（${D.meta.csv_first.slice(5).replace("-", "/")} から）` : m.month);
  const hint = (m) => `4 表で ${int(Object.values(m.rows).reduce((a, b) => a + b, 0))} 行 · ZIP の大きさの目安 ${mb(m.zip_bytes_est)}`;

  function start() {
    const months = [...D.export.months].reverse();
    const select = h("select", { id: "month", name: "month" }, months.map((m, i) => h("option", { value: m.month }, label(m, i, months))));
    const note = h("span", { class: "form-hint" }, hint(months[0]));
    select.addEventListener("change", () => { note.textContent = hint(months.find((m) => m.month === select.value)); });
    document.getElementById("export").replaceChildren(
      P.block("書き出す", "記録・設定の報告・エラー・利用明細の 4 表 · 利用者名つき · 表ごとの CSV を ZIP にまとめる",
        h("form", { class: "panel form-row", action: "#" }, h("label", { class: "field", for: "month" }, "月"), select,
          h("button", { type: "submit", class: "btn" }, "ZIP をダウンロード"), note)),
      P.block("取り込む", "利用明細（CSV）はコストとトークンの正本です",
        h("form", { class: "panel form-row", action: "#" }, h("label", { class: "field", for: "csv" }, "CSV"), h("input", { type: "file", id: "csv", accept: ".csv" }),
          h("button", { type: "submit", class: "btn" }, "CSV を取り込む"), h("span", { class: "form-hint" }, `取り込み済みの明細 ${D.meta.csv_first}〜${D.meta.csv_last}`))));
  }

  return { start };
})();
