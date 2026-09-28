"use strict";
// 期間の切り替え: 上段のカード・群の見出し・タブ（日ごとの利用とコスト）を選んだ期間で描き直す
(() => {
  const D = window.DATA, F = window.Fmt, C = window.Charts, K = window.Cards;
  const LONG = "12m";
  const PROVIDERS = D.periods["7"].cost.providers;
  const RECORD_TABS = ["modes", "health", "errors"];
  const range = ([a, b]) => `${F.md(a)}〜${F.md(b)}`;

  // 画面の文言。[data-text=キー] の要素に入る（案ごとに使う文言を選ぶ）
  function texts(k) {
    if (k === LONG) {
      const w = D.twelve_months.weeks;
      return {
        usage: "直近 12 か月 · 週ごと · 利用明細の項目だけ",
        tail: "· 週ごと · 利用明細の項目だけ",
        delivery: "記録由来の項目は 12 か月では出しません。7 日・28 日で見られます",
        dates: `${w[0].start.replaceAll("-", "/")}〜${D.meta.csv_last.replaceAll("-", "/")} · 月曜始まりの週`,
        csv: `利用明細は ${F.md(D.meta.csv_last_epoch_day)} まで`,
      };
    }
    const p = D.periods[k], n = Number(k);
    return {
      usage: `直近 ${n} 日と、その前の ${n} 日`,
      tail: `と、その前の ${n} 日`,
      delivery: `直近 ${n} 日と、その前の ${n} 日（照合率は利用明細の最終日までの ${n} 日）`,
      dates: `直近 ${range(p.events_window.recent)} · 前の ${range(p.events_window.prev)}`,
      csv: `利用明細は ${F.md(D.meta.csv_last_epoch_day)} まで`,
    };
  }

  const th = (label, i, cls, sorted) => `<th scope="col" class="${cls}"${sorted ? ' aria-sort="descending"' : ""}><button type="button" data-sort="${i}">${label}<i class="arrow"></i></button></th>`;
  const hbar = (v, max) => `<td class="c-bar" data-v="${v}"><span class="hbar"><i style="width: ${((v / max) * 100).toFixed(1)}%"></i></span></td>`;
  const chips = (list, total, unit) => `<div class="filters" data-filter>
  <div class="chipbar" role="group" aria-label="区分">${list.map(([id, l, c], i) => `<button type="button" data-chip="${id}" aria-pressed="${i === 0}">${l}<b>${c}</b></button>`).join("")}</div>
  <span class="count"><b data-shown>${total}</b> / ${total} ${unit}</span></div>`;
  const head = (h2, scope) => `<header class="p-head"><h2>${h2}</h2><p class="scope">${scope}</p></header>`;
  const table = (id, ths, rows) => `<div class="tscroll"><table data-testid="${id}"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>
<p class="empty" data-empty hidden>条件に合う行はありません。</p></div>`;
  const ticksDaily = (days, n) => days.map((d) => (n === 7 || F.isMonday(d) ? F.md(d) : ""));
  const weekTicks = () => {
    const fw = D.twelve_months.month_first_week;
    // 範囲の途中から始まる最初の月は、次の月の目盛りと重なるときは出さない
    const at = new Map(fw.filter((m, i) => !fw[i + 1] || fw[i + 1].week_index - m.week_index >= 3).map((m) => [m.week_index, `${Number(m.month.slice(5))} 月`]));
    return D.twelve_months.weeks.map((_, i) => at.get(i) || "");
  };
  const weekLabel = (w) => `${F.md(F.toDay(w.start))}〜${w.partial ? `（${w.days_with_data} 日分）` : F.md(F.toDay(w.end))}`;
  const costTable = (id, items, keyCell) => {
    // 表の中で桁の書式をそろえる（合計が 1,000 以上なら全列を整数に）
    const max = Math.max(...items.map((it) => it.total)), fmt = F.usdCol([max]);
    const ths = th(keyCell.label, 0, "c-date", true) + PROVIDERS.map((p, i) => th(F.PROVIDER[p], i + 1, "c-usd num")).join("") + th("合計", 3, "c-usd_strong num") + '<th scope="col" class="c-bar"></th>';
    const rows = items.slice().reverse().map((it) => `<tr data-tags="${it.tag || ""}" data-q=""><td class="c-date" data-v="${it.key}">${keyCell.cell(it)}</td>`
      + PROVIDERS.map((p) => `<td class="c-usd num" data-v="${it.providers[p] || 0}">${fmt(it.providers[p] || 0)}</td>`).join("")
      + `<td class="c-usd_strong num" data-v="${it.total}"><b>${fmt(it.total)}</b></td>${hbar(it.total, max)}</tr>`).join("");
    return table(id, ths, rows);
  };
  const costTip = (label, it) => [`${label} ${F.usdWhole(it.total)}`, PROVIDERS.map((p) => `${F.PROVIDER[p]} ${F.usdWhole(it.providers[p] || 0)}`).join(" · ")];

  function dailyPanel(k) {
    if (k === LONG) {
      const w = D.twelve_months.weeks, max = Math.max(...w.map((x) => x.users));
      return head("週ごとの利用者数（利用明細）", `${texts(k).dates} · 最後の週は ${w[w.length - 1].days_with_data} 日分 · セッション数は記録由来のため出しません`)
        + `<div class="p-chart">${C.bars(w.map((x) => x.users), { hiFrom: 0, ticks: weekTicks(), tips: w.map((x) => [`${weekLabel(x)} の週 ${x.users} 人`]), labels: false, wide: true, dimLast: w[w.length - 1].partial })}</div>`
        + chips([["all", "すべて", w.length]], w.length, "週")
        + table("daily", th("週", 0, "c-date", true) + th("利用者数", 1, "c-num num") + '<th scope="col" class="c-bar"></th>',
          w.slice().reverse().map((x) => `<tr data-q=""><td class="c-date" data-v="${F.toDay(x.start)}">${weekLabel(x)}</td><td class="c-num num" data-v="${x.users}">${x.users} 人</td>${hbar(x.users, max)}</tr>`).join(""));
    }
    const n = Number(k), tr = D.periods[k].trend, days = tr.map((r) => r.day), ticks = ticksDaily(days, n);
    const chart = (key, h3, unit) => `<div><h3>${h3}</h3>${C.bars(tr.map((r) => r[key]), { hiFrom: n, ticks, tips: tr.map((r) => [`${F.md(r.day)}${F.wd(r.day)} ${h3} ${r[key]} ${unit}`]) })}</div>`;
    const tag = (r) => (r.period === "recent" ? `直近 ${n} 日` : `前の ${n} 日`), max = Math.max(...tr.map((r) => r.sessions));
    return head("日ごとの利用者数とセッション数", `直近 ${tr.length} 日 · 日ごと · 濃い色が直近 ${n} 日`)
      + `<div class="p-chart"><div class="two">${chart("users", "利用者数", "人")}${chart("sessions", "セッション数", "件")}</div></div>`
      + chips([["all", "すべて", tr.length], ["recent", `直近 ${n} 日`, n], ["prev", `前の ${n} 日`, n]], tr.length, "日")
      + table("daily", th("日付", 0, "c-date", true) + th("期間", 1, "c-tag") + th("利用者数", 2, "c-num num") + th("セッション数", 3, "c-num num") + '<th scope="col" class="c-bar">セッション数の比較</th>',
        tr.slice().reverse().map((r) => `<tr data-tags="${r.period}" data-q=""><td class="c-date" data-v="${r.day}">${F.ymd(r.day)}<span class="sub">${F.wd(r.day)}</span></td><td class="c-tag" data-v="${r.period}"><span class="sub">${tag(r)}</span></td><td class="c-num num" data-v="${r.users}">${r.users} 人</td><td class="c-num num" data-v="${r.sessions}">${r.sessions} 件</td>${hbar(r.sessions, max)}</tr>`).join(""));
  }

  function costPanel(k) {
    const legend = `<div class="legend">${PROVIDERS.map((p, i) => `<span><i class="series-${i}"></i>${F.PROVIDER[p]}</span>`).join("")}</div>`;
    if (k === LONG) {
      const w = D.twelve_months.weeks, items = w.map((x) => ({ ...x, key: F.toDay(x.start), total: x.cost, parts: PROVIDERS.map((p) => x.providers[p] || 0) }));
      return head("週ごとのコスト", `利用明細（CSV） ${texts(k).dates} · 週 × 提供元（USD）· 最後の週は ${w[w.length - 1].days_with_data} 日分`)
        + `<div class="p-chart">${C.stack(items, { ticks: weekTicks(), tips: items.map((it) => costTip(`${weekLabel(it)} の週`, it)), dimLast: w[w.length - 1].partial })}${legend}</div>`
        + chips([["all", "すべて", w.length]], w.length, "週") + costTable("cost", items, { label: "週", cell: weekLabel });
    }
    const p = D.periods[k], n = Number(k), [a] = p.cost_window.prev, [, b] = p.cost_window.recent;
    const items = D.daily_cost.filter((r) => r.day >= a && r.day <= b).map((r) => ({ ...r, key: r.day, tag: r.day >= p.cost_window.recent[0] ? "recent" : "prev", parts: PROVIDERS.map((q) => r.providers[q] || 0) }));
    return head("日ごとのコスト", `利用明細（CSV） ${range([a, b])} · 日 × 提供元（USD）· 濃い地が直近 ${n} 日`)
      + `<div class="p-chart">${C.stack(items, { ticks: ticksDaily(items.map((r) => r.day), n), tips: items.map((r) => costTip(`${F.md(r.day)}${F.wd(r.day)}`, r)), shadeFrom: n })}${legend}</div>`
      + chips([["all", "すべて", items.length], ["recent", `直近 ${n} 日`, n], ["prev", `前の ${n} 日`, n]], items.length, "日")
      + costTable("cost", items, { label: "日付", cell: (r) => `${F.ymd(r.day)}<span class="sub">${F.wd(r.day)}</span>` });
  }

  function tabTexts(k) {
    if (k === LONG) return { daily: ["週ごとの利用者", "53 週 · 利用明細"], cost: ["週ごとのコスト", "53 週 · 利用明細"] };
    const n = Number(k), p = D.periods[k];
    return { daily: ["日ごとの利用", `直近 ${n * 2} 日`], cost: ["日ごとのコスト", `直近 ${n * 2} 日 · 利用明細`],
      modes: ["使われ方", `直近 ${n} 日 · 記録`], health: ["受信と項目の欠け", `直近 ${n} 日と前の ${n} 日`], errors: ["プラグインのエラー", `直近 ${n} 日 · ${p.errors.total} 件`] };
  }

  function set(k) {
    const long = k === LONG, t = texts(k);
    document.documentElement.dataset.shown = k;
    document.querySelector("[data-cards=usage]").innerHTML = long ? K.usageLong() : K.usage(k);
    document.querySelector("[data-cards=delivery]").innerHTML = long ? "" : K.delivery(k);
    for (const el of document.querySelectorAll("[data-text]")) el.textContent = t[el.dataset.text];
    for (const [id, [b, s]] of Object.entries(tabTexts(k))) {
      const tab = document.querySelector(`[data-tab="${id}"]`);
      tab.querySelector("b").textContent = b; tab.querySelector("span").textContent = s;
    }
    for (const id of RECORD_TABS) document.querySelector(`[data-tab="${id}"]`).hidden = long;
    document.querySelector("[data-panel=daily]").innerHTML = dailyPanel(k);
    document.querySelector("[data-panel=cost]").innerHTML = costPanel(k);
    for (const b of document.querySelectorAll("[data-period]")) b.setAttribute("aria-pressed", String(b.dataset.period === k));
    for (const s of document.querySelectorAll("select[data-period-select]")) s.value = k;
    if (document.documentElement.classList.contains("js")) refreshTabs(long);
  }

  // app.js の状態（区分・並べ替え）を描き直した表に合わせ直す
  function refreshTabs(long) {
    for (const id of ["daily", "cost"]) document.querySelector(`[data-panel=${id}] [data-chip=all]`).click();
    const open = document.querySelector('[data-tab][aria-selected="true"]');
    if (long && open && RECORD_TABS.includes(open.dataset.tab)) document.querySelector("[data-tab=cost]").click();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-period]");
    if (b) { set(b.dataset.period); return; }
    const card = e.target.closest(".kpis [data-open]");
    if (!card) return;
    e.preventDefault();
    const [id] = card.dataset.open.split(":");
    document.querySelector(`[data-tab="${id}"]`).click();
    for (const c of document.querySelectorAll(".kpis .card")) c.classList.toggle("is-open", c === card);
    document.querySelector("#detail").scrollIntoView({ block: "start" });
  });
  document.addEventListener("change", (e) => { if (e.target.matches("select[data-period-select]")) set(e.target.value); });

  set(new URLSearchParams(location.search).get("period") || "7");
  C.bindTips();
})();
