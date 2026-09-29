"use strict";
// エクスポートのページ: 上に取り込む（CSV）、下に月の一覧から押すだけで書き出す（1 行が 1 つの ZIP）。
// 取り込みは模型なので、選んだ CSV をブラウザで数えて結果の知らせを出すだけ
(() => {
  const D = window.DATA, F = window.Fmt, U = window.UI;
  const TABLES = [["events", "記録"], ["policy_state", "設定の報告"], ["errors", "エラー"], ["cost_daily", "利用明細"]];

  function monthCell(m, i, all) {
    const note = i === 0 ? `${F.md(D.meta.today_epoch_day)} まで · 途中` : i === all.length - 1 ? `${F.md(F.toDay(D.meta.csv_first))} から` : "";
    return `${m.month}${note ? U.sub(`（${note}）`) : ""}`;
  }

  function list() {
    const months = [...D.export.months].reverse(), max = Math.max(...months.map((m) => m.zip_bytes_est));
    const rows = months.map((m, i, all) => U.tr({}, U.td("c-date", m.month, monthCell(m, i, all))
      + TABLES.map(([k]) => U.td("c-num num", m.rows[k], F.withUnit(F.int(m.rows[k]), "件"))).join("")
      + U.td("c-num num", m.zip_bytes_est, F.bytes(m.zip_bytes_est)) + U.hbar(m.zip_bytes_est, max)
      + U.td("c-act", "", `<button type="button" class="btn sub" aria-label="${m.month} の ZIP をダウンロード">ダウンロード</button>`)));
    const cols = [{ label: "月", cls: "c-date" }, ...TABLES.map(([, l]) => ({ label: l, cls: "c-num num" })),
      { label: "大きさ（目安）", cls: "c-num num" }, { cls: "c-bar" }, { cls: "c-act" }].map((c) => ({ ...c, sortable: false }));
    return `<div class="panel">${U.head("月ごとの全ログ", "新しい月から · 1 行が 1 つの ZIP · 大きさは圧縮後の見込み") + U.table("months", cols, rows)
      + U.note("ZIP の中身は events.csv（記録）・policy_state.csv（設定の報告）・errors.csv（エラー）・cost_daily.csv（利用明細）の 4 つです。利用者名つき、UTF-8、日付は JST です。")}</div>`;
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
    const total = ci >= 0 ? lines.reduce((s, l) => s + Number(l.split(",")[ci] || 0), 0) : null;
    return `${name} を取り込みました。${F.withUnit(F.int(lines.length), "行")} · ${dates[0]}〜${dates[dates.length - 1]}${total != null ? ` · 合計 ${F.usdText(total)}` : ""}`;
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
    + U.group("書き出す", "記録・設定の報告・エラー・利用明細の 4 表を、月ごとに表ごとの CSV の ZIP で", "", "", list());
  document.querySelector("[data-import]").addEventListener("submit", onImport);
})();
