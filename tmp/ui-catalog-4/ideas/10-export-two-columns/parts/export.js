"use strict";
// エクスポートのページ（変奏 10）: 左に取り込む、右に月の一覧（1 行が 1 つの ZIP）。月を押すと、その ZIP に入る 4 表の行数・大きさ・列が行の下に開く。
// 取り込みは模型なので、選んだ CSV をブラウザで数えて結果の知らせを出すだけ
(() => {
  const D = window.DATA, F = window.Fmt, U = window.UI, X = D.export;
  const TABLES = [["events", "記録"], ["policy_state", "設定の報告"], ["errors", "エラー"], ["cost_daily", "利用明細"]];
  const KB = 1e3, MB = 1e6;
  const size = (b) => (b >= MB ? F.bytes(b) : b >= KB ? `${F.int(b / KB)} KB` : "1 KB 未満");
  const total = (m) => Object.values(m.rows).reduce((a, b) => a + b, 0);

  function monthCell(m, i, all) {
    const note = i === 0 ? `${F.md(D.meta.today_epoch_day)} まで · 途中` : i === all.length - 1 ? `${F.md(F.toDay(D.meta.csv_first))} から` : "";
    return `<button type="button" class="ex-pick" aria-expanded="false" aria-controls="files-${m.month}"><i class="ex-caret" aria-hidden="true"></i>${m.month}</button>${note ? U.sub(`（${note}）`) : ""}`;
  }

  // 月を押すと開く、その ZIP の中身（表ごとの CSV）
  const files = (m) => `<tr class="ex-files" id="files-${m.month}" hidden><td colspan="5"><dl class="ex-flist">${TABLES.map(([k, l]) => `<div>
  <dt><b>${l}</b><span class="code">${k}.csv</span></dt><dd class="num">${F.withUnit(F.int(m.rows[k]), "件")}</dd><dd class="num">${size(m.csv_bytes_est[k])}</dd>
  <dd class="ex-cols"><span class="code">${X.columns[k].join(", ")}</span></dd></div>`).join("")}</dl></td></tr>`;

  function list() {
    const months = [...X.months].reverse(), max = Math.max(...months.map((m) => m.zip_bytes_est));
    const rows = months.map((m, i, all) => `<tr data-month="${m.month}">${U.td("c-date", m.month, monthCell(m, i, all))
      + U.td("c-num num", total(m), F.withUnit(F.int(total(m)), "件"))
      + U.td("c-num num", m.zip_bytes_est, F.bytes(m.zip_bytes_est)) + U.hbar(m.zip_bytes_est, max)
      + U.td("c-act", "", `<button type="button" class="btn sub" aria-label="${m.month} の ZIP をダウンロード">ダウンロード</button>`)}</tr>${files(m)}`);
    const cols = [{ label: "月", cls: "c-date" }, { label: "行数（4 表）", cls: "c-num num" }, { label: "大きさ（目安）", cls: "c-num num" }, { cls: "c-bar" }, { cls: "c-act" }]
      .map((c) => ({ ...c, sortable: false }));
    return `<div class="panel">${U.head("月ごとの全ログ", "新しい月から · 1 行が 1 つの ZIP · 月を押すと中身の表と列 · 大きさは圧縮後の見込み") + U.table("months", cols, rows)
      + U.note("ZIP の中身は events.csv（記録）・policy_state.csv（設定の報告）・errors.csv（エラー）・cost_daily.csv（利用明細）の 4 つです。利用者名つき、UTF-8、日付は JST です。")}</div>`;
  }

  const importForm = () => `<form class="panel ex-import" action="#" data-import>
  <div class="notice" data-result hidden></div>
  <dl class="ex-facts"><dt>取り込み済みの明細</dt><dd>${D.meta.csv_first}〜${D.meta.csv_last}</dd></dl>
  <label class="ex-field" for="csv">利用明細の CSV</label><input type="file" id="csv" accept=".csv">
  <div class="ex-act"><button type="submit" class="btn">CSV を取り込む</button></div></form>`;

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

  // 月の行を押すと中身を開閉する（ダウンロードのボタンは除く）
  function onPick(e) {
    const row = e.target.closest("tr[data-month]");
    if (!row || e.target.closest(".c-act")) return;
    const btn = row.querySelector(".ex-pick"), open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    row.classList.toggle("is-open", open);
    document.getElementById(btn.getAttribute("aria-controls")).hidden = !open;
  }

  window.Shell.mount();
  document.querySelector('[data-slot="export"]').innerHTML = `<div class="ex-cols2">${U.group("取り込む", "利用明細（CSV）はコストとトークンの正本です", "", "", importForm())
    + U.group("書き出す", "記録・設定の報告・エラー・利用明細の 4 表を、月ごとに表ごとの CSV の ZIP で", "", "", list())}</div>`;
  document.querySelector("[data-import]").addEventListener("submit", onImport);
  document.querySelector('[data-testid="months"]').addEventListener("click", onPick);
})();
