"use strict";
// エクスポートのページ: 上に取り込む（CSV）、下に暦年の 12 か月の格子（4 × 3）。月のマスを押すとその月の ZIP を書き出す。
// 年は格子の右上の分段で切り替える。取り込みは模型なので、選んだ CSV をブラウザで数えて結果の知らせを出すだけ
(() => {
  const D = window.DATA, F = window.Fmt, U = window.UI;
  const TABLES = ["events", "policy_state", "errors", "cost_daily"];
  const BY = new Map(D.export.months.map((m) => [m.month, m]));
  const FIRST = D.export.months[0].month, LAST = D.export.months.at(-1).month;
  const YEARS = [...new Set(D.export.months.map((m) => m.month.slice(0, 4)))];
  const total = (m) => TABLES.reduce((s, k) => s + m.rows[k], 0);
  const MAX = Math.max(...D.export.months.map(total));

  function note(ym) {
    if (ym === LAST) return `${F.md(D.meta.today_epoch_day)} まで · 途中`;
    return ym === FIRST ? `${F.md(F.toDay(D.meta.csv_first))} から` : "";
  }

  function cell(ym) {
    const m = BY.get(ym), name = `${Number(ym.slice(5))} 月`;
    if (!m) return `<div class="ex-cell none"><span class="k-label"><span>${name}</span></span><span class="ex-foot">${ym > LAST ? "まだありません" : "記録なし"}</span></div>`;
    return `<button type="button" class="ex-cell" aria-label="${ym} の ZIP をダウンロード">
  <span class="k-label"><span>${name}</span><span class="go">ZIP</span></span>
  <span class="ex-count">${F.withUnit(F.int(total(m)), "件")}</span>${U.hbarSpan((total(m) / MAX) * 100)}
  <span class="ex-foot"><span>${F.bytes(m.zip_bytes_est)}</span><span>${note(ym)}</span></span></button>`;
  }

  const grid = (year) => Array.from({ length: 12 }, (_, i) => cell(`${year}-${String(i + 1).padStart(2, "0")}`)).join("");

  const exportGroup = (year) => `<section class="group" aria-label="書き出す">
  <div class="ex-ghead"><h2 class="glabel">書き出す<span>記録・設定の報告・エラー・利用明細の 4 表を、月ごとに表ごとの CSV の ZIP で</span></h2>
  <div class="chipbar" role="group" aria-label="年">${YEARS.map((y) => `<button type="button" data-year="${y}" aria-pressed="${y === year}">${y} 年</button>`).join("")}</div></div>
  <div class="ex-grid" data-grid>${grid(year)}</div>
  <p class="gnote">月を押すとその月の ZIP をダウンロードします。中身は events.csv・policy_state.csv・errors.csv・cost_daily.csv（利用者名つき、UTF-8、日付は JST）。大きさは圧縮後の見込みです。</p></section>`;

  function onYear(e) {
    const b = e.target.closest("[data-year]");
    if (!b) return;
    for (const x of document.querySelectorAll("[data-year]")) x.setAttribute("aria-pressed", String(x === b));
    document.querySelector("[data-grid]").innerHTML = grid(b.dataset.year);
  }

  const importForm = () => `<form class="panel ex-import" action="#" data-import>
  <div class="notice" data-result hidden></div>
  <div class="ex-row"><label class="ex-field" for="csv">利用明細の CSV</label><input type="file" id="csv" accept=".csv">
  <button type="submit" class="btn">CSV を取り込む</button><span class="ex-hint">取り込み済みの明細 ${D.meta.csv_first}〜${D.meta.csv_last}</span></div></form>`;

  // 模型の取り込み: 行数・日付の範囲・金額の合計を数えて知らせる
  function summarize(name, text) {
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(","), di = cols.findIndex((c) => /date|day/i.test(c)), ci = cols.indexOf("cost");
    const dates = lines.map((l) => l.split(",")[di]).filter(Boolean).sort();
    const sum = ci >= 0 ? lines.reduce((s, l) => s + Number(l.split(",")[ci] || 0), 0) : null;
    return `${name} を取り込みました。${F.withUnit(F.int(lines.length), "行")} · ${dates[0]}〜${dates[dates.length - 1]}${sum != null ? ` · 合計 ${F.usdText(sum)}` : ""}`;
  }

  function onImport(e) {
    e.preventDefault();
    const form = e.target, file = form.querySelector("input[type=file]").files[0], out = form.querySelector("[data-result]");
    const show = (ok, text) => { out.className = `notice ${ok ? "ok" : "ng"}`; out.textContent = text; out.hidden = false; };
    if (!file) { show(false, "取り込む CSV を選んでください。"); return; }
    file.text().then((t) => show(true, summarize(file.name, t)), () => show(false, `${file.name} を読めませんでした。`));
  }

  window.Shell.mount();
  document.querySelector('[data-slot="export"]').innerHTML = U.group("取り込む", "利用明細（CSV）はコストとトークンの正本です", "", "", importForm())
    + exportGroup(LAST.slice(0, 4));
  document.querySelector("[data-import]").addEventListener("submit", onImport);
  document.querySelector('[aria-label="年"]').addEventListener("click", onYear);
})();
