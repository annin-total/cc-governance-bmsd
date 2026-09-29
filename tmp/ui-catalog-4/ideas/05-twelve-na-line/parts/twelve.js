"use strict";
// 12 か月の見せ方: 週ごとの棒と月ごとの合計（暦月）の行、出せない群の 1 行の注記、出せないタブの 1 行の注記
window.Twelve = (() => {
  const F = window.Fmt, U = window.UI, C = window.Charts;
  const FOOT_H = 40;          // 月ごとの合計の行の高さ
  const MIN_MONTH_WEEKS = 3;  // 次の月と近すぎる月（範囲の最初の端数の月）は行に出さない
  const NA_TEXT_TAIL = "記録から数える項目は 7 日・28 日で見られます。";

  const weeks = () => window.DATA.twelve_months.weeks;
  const range = () => `${window.DATA_EXTRA.twelve.start}〜${window.DATA_EXTRA.twelve.end}`;
  const partialNote = () => { const w = weeks(); return w[w.length - 1].partial ? ` · 最後の週は ${w[w.length - 1].days_with_data} 日分` : ""; };
  const weekKey = (w) => F.toDay(w.start);
  const weekCell = (w) => `${w.start}${U.sub(w.partial ? `〜（${w.days_with_data} 日分）` : `〜${F.md(F.toDay(w.end))}`)}`;

  // 軸の下の行: 各月の最初の週の位置に、月と暦月の合計を書く
  function monthRow(valueOf) {
    const fw = window.DATA.twelve_months.month_first_week, months = new Map(window.DATA_EXTRA.twelve.months.map((m) => [m.month, m]));
    const shown = fw.filter((m, i) => !fw[i + 1] || fw[i + 1].week_index - m.week_index >= MIN_MONTH_WEEKS);
    return (xAt, axisY) => shown.map(({ month, week_index: i }) => {
      const m = months.get(month), x = xAt(i).toFixed(1);
      return `<line class="month-sep" x1="${x}" x2="${x}" y1="${axisY}" y2="${axisY + FOOT_H - 4}"/>`
        + `<text class="month-name" x="${Number(x) + 5}" y="${axisY + 14}">${month}${m.partial && m.end === window.DATA_EXTRA.twelve.end ? "（途中）" : ""}</text>`
        + `<text class="month-total" x="${Number(x) + 5}" y="${axisY + 31}">${valueOf(m)}</text>`;
    }).join("");
  }
  const skippedMonths = () => {
    const fw = window.DATA.twelve_months.month_first_week;
    return window.DATA_EXTRA.twelve.months.filter((m) => fw.some((f, i) => f.month === m.month && fw[i + 1] && fw[i + 1].week_index - f.week_index < MIN_MONTH_WEEKS));
  };
  const skippedNote = () => skippedMonths().map((m) => `${m.month} は ${F.md(F.toDay(m.start))}〜${F.md(F.toDay(m.end))} の ${m.days} 日分のため行に出しません。`).join("");

  function usersPanel() {
    const w = weeks(), max = Math.max(...w.map((x) => x.users));
    const chart = C.bars(w.map((x) => x.users), { keys: w.map(weekKey), width: C.W_FULL, h: 150, labels: false, dim: w.at(-1).partial ? [w.length - 1] : [], foot: monthRow((m) => `${m.users} 人`), footH: FOOT_H - 20 });
    const rows = [...w].reverse().map((x) => U.tr({ k: weekKey(x) }, U.td("c-date", weekKey(x), weekCell(x)) + U.td("c-num num", x.users, F.withUnit(x.users, "人")) + U.hbar(x.users, max)));
    return U.head("週ごとの利用者数（利用明細）", `${range()} · 月曜始まりの週${partialNote()} · セッション数は記録から数えるため出しません`)
      + `<div class="p-chart">${chart}<div class="legend"><span>軸の下の行は暦月の利用者数（月の中の重複なし）</span></div></div>`
      + U.filters({ total: w.length, unit: "週" })
      + U.table("daily", [{ label: "週の始まり", cls: "c-date", sort: "descending" }, { label: "利用者数", cls: "c-num num" }, { cls: "c-bar" }], rows)
      + U.note(`週の人数は、その週に利用明細にコストがあった人数です。月の人数は週の人数の合計ではありません。${skippedNote()}`);
  }

  function costPanel(providers) {
    const w = weeks(), items = w.map((x) => ({ ...x, total: x.cost, parts: providers.map((p) => x.providers[p] || 0) }));
    const fmt = F.usdCol(items.map((it) => it.total)), max = Math.max(...items.map((it) => it.total));
    const chart = C.stack(items, { keys: w.map(weekKey), dim: w.at(-1).partial ? [w.length - 1] : [], foot: monthRow((m) => F.usdText(m.cost)), footH: FOOT_H - 22 });
    const legend = `<div class="legend">${providers.map((p, i) => `<span><i class="series-${i}"></i>${F.PROVIDER[p]}</span>`).join("")}<span>薄い棒は途中の週 · 軸の下の行は暦月の合計</span></div>`;
    const rows = [...items].reverse().map((it) => U.tr({ k: weekKey(it) }, U.td("c-date", weekKey(it), weekCell(it))
      + providers.map((p) => U.td("c-usd num", it.providers[p] || 0, fmt(it.providers[p] || 0))).join("")
      + U.td("c-usd_strong num", it.total, `<b>${fmt(it.total)}</b>`) + U.hbar(it.total, max)));
    return U.head("週ごとのコスト", `利用明細（CSV）${range()} · 週 × 提供元（USD）${partialNote()}`)
      + `<div class="p-chart">${chart}${legend}</div>`
      + U.filters({ total: w.length, unit: "週" })
      + U.table("cost", [{ label: "週の始まり", cls: "c-date", sort: "descending" }, ...providers.map((p) => ({ label: F.PROVIDER[p], cls: "c-usd num" })),
        { label: "合計", cls: "c-usd_strong num" }, { cls: "c-bar" }], rows)
      + U.note(`月の合計は暦月で数えるため、週の区切りとは合いません。${skippedNote()}`);
  }

  // 出せないタブ: 枠（パネルの地）ごと畳み、1 行の注記だけを置く（twelve.css の .panel:has(> .na-line)）
  const unavailable = (title, scope) => `<p class="na-line">${title}は、${scope}では出しません。${NA_TEXT_TAIL}</p>`;
  const groupNote = (names) => `${names.join("・")}は、記録から数えるため 12 か月では出しません`;
  const scope = () => `直近 12 か月（${range()}）· 週ごと · 利用明細の項目だけ`;

  return { usersPanel, costPanel, unavailable, groupNote, scope, weekKey, range, NA_TAB: "12 か月では出しません" };
})();
