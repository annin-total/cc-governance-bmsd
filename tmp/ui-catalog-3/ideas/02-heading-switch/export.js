"use strict";
// エクスポート: 月を選ぶと、ZIP に入る表の行数とおおよその大きさを出す
(() => {
  const X = window.DATA.export, today = window.DATA.meta.today;
  const TABLE = { events: "記録", policy_state: "設定の報告", errors: "エラー", cost_daily: "利用明細" };
  const ORDER = ["events", "policy_state", "errors", "cost_daily"];
  const size = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const label = (m) => `${m.replace("-", " 年 ").replace(/ 0?(\d+)$/, " $1")} 月`;

  const select = document.querySelector("[data-month]");
  const meta = document.querySelector("[data-month-meta]");
  const months = X.months.slice().reverse();
  for (const m of months) {
    const o = document.createElement("option");
    o.value = m.month;
    o.textContent = label(m.month) + (today.startsWith(m.month) ? `（${today.slice(5).replace("-", "/")} まで）` : "");
    select.appendChild(o);
  }

  function show() {
    const m = months.find((x) => x.month === select.value);
    meta.replaceChildren();
    const file = document.createElement("b");
    file.textContent = `ccgov-${m.month}.zip · 約 ${size(m.zip_bytes_est)}`;
    meta.appendChild(file);
    const rows = document.createElement("span");
    rows.textContent = ORDER.map((t) => `${TABLE[t]} ${m.rows[t].toLocaleString("ja-JP")} 行`).join(" · ");
    meta.appendChild(rows);
  }
  select.addEventListener("change", show);
  for (const f of document.querySelectorAll("form")) f.addEventListener("submit", (e) => e.preventDefault());
  show();
})();
