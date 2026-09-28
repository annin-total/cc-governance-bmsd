"use strict";
// 概況の上段と「日ごとの利用」タブを、期間（7 / 28 / 12m）ごとに window.DATA から描く。案ごとの差は idea.js が hooks で足す
const C = (() => {
  const D = window.DATA;
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const MS = 86400000;
  const dayOf = (s) => Math.round(Date.parse(s + "T00:00:00Z") / MS);
  const date = (d) => new Date(d * MS);
  const md = (d) => date(d).toISOString().slice(5, 10).replace("-", "/");
  const ymd = (d) => date(d).toISOString().slice(0, 10);
  const wd = (d) => `（${WD[date(d).getUTCDay()]}）`;
  const int = (n) => Math.round(n).toLocaleString("ja-JP");
  const usd = (v, whole) => (v >= 1000 || whole ? "$" + int(v) : "$" + v.toFixed(2));
  const signed = (n, s) => (n > 0 ? "+" : n < 0 ? "−" : "±") + s(Math.abs(n));
  const fmt = { md, ymd, wd, int, usd, signed, dayOf };

  const costOf = new Map(D.daily_cost.map((r) => [r.day, r]));
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const PERIODS = ["7", "28", "12m"];
  const LABEL = { "7": "7 日", "28": "28 日", "12m": "12 か月" };
  const series = {};
  const hooks = { cards: [], afterRender: [] };

  // 折れ線（カード）。split 以降を直近として濃く描く。null なら全体を 1 本で
  function spark(id, pts, split) {
    series[id] = pts;
    const n = pts.length, vs = pts.map((p) => p.v);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const X = (i) => +(i * 300 / (n - 1)).toFixed(1);
    const Y = (v) => +(44 - (hi === lo ? .5 : (v - lo) / (hi - lo)) * 40).toFixed(1);
    const xy = (i) => `${X(i)},${Y(vs[i])}`;
    const s = split == null ? 0 : split - 1;
    const pl = (a, b) => range(a, b).map(xy).join(" ");
    const step = 300 / (n - 1);
    const hits = pts.map((_, i) => `<rect class="hit" data-i="${i}" x="${Math.max(0, X(i) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="48"/>`).join("");
    const dots = pts.map((_, i) => `<circle class="pt" data-i="${i}" cx="${X(i)}" cy="${Y(vs[i])}" r="3"/>`).join("");
    return `<svg class="spark" data-s="${id}" viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true">` +
      (split == null ? "" : `<rect class="spark-shade" x="${X(s)}" y="0" width="${(300 - X(s)).toFixed(1)}" height="48"/>`) +
      `<path class="spark-area" d="M${X(s)},48 L${pl(s, n - 1).replace(/ /g, " L")} L300,48 Z"/>` +
      (split == null ? "" : `<polyline class="spark-old" points="${pl(0, s)}" vector-effect="non-scaling-stroke"/>`) +
      `<polyline class="spark-new" points="${pl(s, n - 1)}" vector-effect="non-scaling-stroke"/>` +
      `<circle class="spark-dot" cx="300" cy="${Y(vs[n - 1])}" r="3"/><g class="marks">${dots}</g><g class="hits">${hits}</g></svg>`;
  }

  // 棒グラフ（タブ）。7 日は毎日、28 日は月曜に目盛り
  function bars(id, pts, unit, every) {
    series[id] = pts;
    const W = 540, base = 112, n = pts.length, step = W / n, bw = step * .62;
    const hi = Math.max(...pts.map((p) => p.v));
    const out = pts.map((p, i) => {
      const h = p.v / hi * 96, x = i * step + (step - bw) / 2, cx = (x + bw / 2).toFixed(1);
      const tl = every === "day" && i > 0 && date(p.day).getUTCDate() !== 1 ? String(date(p.day).getUTCDate()) : md(p.day);
      const tick = every === "day" || date(p.day).getUTCDay() === 1 ? `<text x="${cx}" y="128" text-anchor="middle">${tl}</text>` : "";
      const val = every === "day" ? `<text class="bar-val" x="${cx}" y="${(base - h - 4).toFixed(1)}" text-anchor="middle">${p.v}</text>` : "";
      return `<rect class="${p.old ? "bar-old" : "bar-hi"}" data-i="${i}" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"/>${val}${tick}`;
    }).join("");
    const hits = pts.map((_, i) => `<rect class="hit" data-i="${i}" x="${(i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${base}"/>`).join("");
    return `<svg data-s="${id}" data-unit="${unit}" viewBox="0 0 ${W} 132" aria-hidden="true"><g class="guide"></g>${out}<line class="axis" x1="0" x2="${W}" y1="${base}" y2="${base}"/><g class="hits">${hits}</g></svg>`;
  }

  const dayPt = (day, v, fmtV, old) => ({ day, v, old, label: md(day) + wd(day), text: fmtV(v) });
  const weekPt = (w, v, fmtV) => ({ day: dayOf(w.start), v, label: w.start.replace(/-/g, "/") + " の週", text: fmtV(v) });

  function card({ label, open, go = "一覧", mark, value, unit = "", sub = "", viz = "", cls = "" }) {
    const right = mark ? `<span class="mark ${mark[0]}">${mark[1]}</span>` : `<span class="go">${go}</span>`;
    return `<a class="card ${cls}" href="#${open}" data-open="${open}"><span class="k-label"><span>${label}</span>${right}</span>` +
      `<span class="k-value">${value}<span class="u">${unit}</span></span><span class="k-sub">${sub}</span><span class="k-viz">${viz}</span></a>`;
  }
  const change = (s, up) => `<span class="change${up ? " up" : ""}">${s}</span>`;
  const cap = (...xs) => `<span class="cap">${xs.map((x) => `<span>${x}</span>`).join("")}</span>`;
  const meter = (pct, capText) => `<span class="meter"><i style="width: ${pct}%"></i></span>` + cap(capText);

  function useCards(p) {
    if (p === "12m") return useCards12m();
    const P = D.periods[p], N = p, rec = `直近 ${N} 日`, prv = `前の ${N} 日`;
    const trend = P.trend, split = trend.findIndex((t) => t.period === "recent");
    const tr = (k, f) => trend.map((t) => dayPt(t.day, t[k], f, t.period === "prev"));
    const cw = P.cost_window, cdays = range(cw.prev[0], cw.recent[1]);
    const cpts = cdays.map((d) => dayPt(d, costOf.get(d).total, usd, d < cw.recent[0]));
    const trCap = cap(md(trend[0].day), `濃い部分が${rec}`, md(trend[trend.length - 1].day));
    const spd = P.sessions_per_day;
    return [
      card({ label: "送信した利用者", open: "daily", value: P.users.recent, unit: "人",
        sub: change(signed(P.users.delta, String), P.users.delta > 0) + `${prv} ${P.users.prev} 人`, viz: spark(`users-${p}`, tr("users", (v) => v + " 人"), split) + trCap }),
      card({ label: "1 日あたりのセッション", open: "daily", value: spd.recent.toFixed(1), unit: "件",
        sub: change(signed(spd.delta, (v) => v.toFixed(1)), spd.delta > 0) + `${prv} ${spd.prev.toFixed(1)} 件`, viz: spark(`sessions-${p}`, tr("sessions", (v) => v + " 件"), split) + trCap }),
      card({ label: "コスト（利用明細）", open: "cost", value: usd(P.cost.recent),
        sub: change(signed(P.cost.change, (v) => v.toFixed(1) + "%"), P.cost.change > 0) + `${prv} ${usd(P.cost.prev)}`,
        viz: spark(`cost-${p}`, cpts, cdays.indexOf(cw.recent[0])) + cap(md(cdays[0]), `${md(cw.recent[0])}〜${md(cw.recent[1])} の合計`, md(cw.recent[1])) }),
      card({ label: "確認なしモードの記録", open: "modes", value: P.bypass.rate.toFixed(1), unit: "%",
        sub: `${int(P.bypass.numerator)} 件 / 全 ${int(P.bypass.denominator)} 件`, viz: meter(P.bypass.rate, "権限モード「確認なし」の割合") }),
    ];
  }

  function useCards12m() {
    const ws = D.twelve_months.weeks, full = ws.filter((w) => !w.partial), last = full[full.length - 1];
    const total = ws.reduce((a, w) => a + w.cost, 0);
    const first = dayOf(ws[0].start), end = dayOf(ws[ws.length - 1].end);
    const wcap = cap(ymd(first).slice(0, 7), "週ごと", ymd(dayOf(last.start)).slice(0, 7));
    return [
      card({ label: "利用者（利用明細）", open: "cost", value: last.users, unit: "人",
        sub: `${md(dayOf(last.start))}〜${md(dayOf(last.end))} の週 · 前との比較なし`, viz: spark("users-12m", full.map((w) => weekPt(w, w.users, (v) => v + " 人")), null) + wcap }),
      card({ label: "コスト（利用明細）", open: "cost", value: usd(total),
        sub: `${ymd(first)}〜${ymd(end)} の合計`, viz: spark("cost-12m", full.map((w) => weekPt(w, w.cost, usd)), null) + wcap }),
    ];
  }

  // 月末の見込み（暦月）。経過営業日が少ないと「—」（閾値は仮）
  const FORECAST_MIN_ELAPSED = 3;
  function forecast() {
    const F = D.month_forecast, ok = F.elapsed_business_days >= FORECAST_MIN_ELAPSED;
    const ch = (F.per_business_day / F.prev_per_business_day - 1) * 100;
    return { ...F, ok, ch, m: +F.month.slice(5), pm: +F.prev_month.slice(5), value: ok ? usd(F.forecast) : "—" };
  }
  function forecastCard() {
    const F = forecast();
    return card({ label: `月末のコストの見込み（${F.m} 月）`, open: "cost", value: F.value,
      sub: change(signed(F.ch, (v) => v.toFixed(1) + "%"), F.ch > 0) + `営業日あたり ${usd(F.per_business_day)}`,
      viz: `<span class="meter"><i style="width: ${(F.elapsed_business_days / F.business_days * 100).toFixed(1)}%"></i></span>` +
        cap(`実績 ${usd(F.actual)}（${md(dayOf(F.as_of))} まで）`, `${F.elapsed_business_days} / ${F.business_days} 営業日`) +
        cap(`前月 ${usd(F.prev_per_business_day)} / 営業日`, `計 ${usd(F.prev_total)}`) });
  }

  const STAGE = { send: "送信", apply_settings: "設定の書き込み", collect: "記録の収集" };
  function healthCards(p) {
    const P = D.periods[p], N = p, rec = `直近 ${N} 日`, prv = `前の ${N} 日`, ev = P.events, mx = Math.max(ev.recent, ev.prev);
    const pair = (l, v, g) => `<span class="pair"><span>${l}</span><span class="hbar ${g}"><i style="width: ${(v / mx * 100).toFixed(1)}%"></i></span></span>`;
    const st = P.errors.stages;
    return [
      card({ label: "受信した記録", open: "health", value: int(ev.recent), unit: "件", sub: change(signed(ev.delta, int), ev.delta > 0) + `${prv} ${int(ev.prev)} 件`, viz: pair(prv, ev.prev, "ghost") + pair(rec, ev.recent, "") }),
      card({ label: "CSV との照合率", open: "health", value: P.reconciliation.rate.toFixed(1), unit: "%", sub: `CSV にもいた ${P.reconciliation.numerator} 人 / 送信した ${P.reconciliation.denominator} 人`, viz: meter(P.reconciliation.rate, "前との比較なし") }),
      card({ label: "プラグインのエラー", open: "errors", mark: ["warn", "注意"], value: P.errors.total, unit: "件", sub: `${P.errors.kinds} 種類 · 前との比較なし`,
        viz: `<span class="stack">${st.map((s, i) => `<i class="warn-${i}" style="flex: ${s[1]}"></i>`).join("")}</span><span class="legend">${st.map((s, i) => `<span><i class="warn-${i}"></i>${STAGE[s[0]] || s[0]} ${s[1]}</span>`).join("")}</span>` }),
      card({ label: "項目の欠け（最大）", open: "health", mark: ["ok", "正常"], value: "11.7", unit: "%", sub: "コマンドの定義元 · 4 / 4 項目が正常",
        viz: `<span class="rates">${[["ツール名", 9.2], ["スキル名", 6.4], ["コンテキストのトークン数", 8.6], ["コマンドの定義元", 11.7]].map(([l, v]) => `<span class="rate"><span>${l}</span><span class="hbar"><i style="width: ${v}%"></i></span><span class="num strong">${v}%</span></span>`).join("")}</span>` }),
    ];
  }

  const group = (label, scope, cards, extra = "") => `<section class="group" aria-label="${label}"><h2 class="glabel">${label}<span>${scope}</span></h2>${extra}${cards.length ? `<div class="cards">${cards.join("")}</div>` : ""}</section>`;

  function renderKpis(p) {
    const extra = hooks.cards.reduce((cs, f) => f(cs, p) || cs, useCards(p));
    const html = p === "12m"
      ? group("利用", `直近 12 か月 · ${D.twelve_months.weeks[0].start}〜${D.meta.csv_last} · 週ごと（途中の最後の週は線から除く）· 利用明細（CSV）の項目だけ`, extra) +
        group("データの届き具合", "記録由来の項目（受信・欠け・エラー・使われ方・スキル）は 12 か月では出しません。7 日か 28 日で見られます", [])
      : group("利用", `直近 ${p} 日と、その前の ${p} 日`, extra) +
        group("データの届き具合", `直近 ${p} 日と、その前の ${p} 日（照合率は利用明細の最終日までの ${p} 日）`, healthCards(p));
    document.getElementById("kpis").innerHTML = html;
  }

  function renderDaily(p) {
    const panel = document.getElementById("daily"), tabSub = document.querySelector("#tab-daily span");
    if (p === "12m") {
      tabSub.textContent = "12 か月では出さない";
      panel.innerHTML = `<header class="p-head"><h2>日ごとの利用者数とセッション数</h2><p class="scope">記録由来のため、12 か月では出しません</p></header><p class="empty">直近 7 日か 28 日を選ぶと表示します。コストの推移は「日ごとのコスト」にあります。</p>`;
      return;
    }
    const P = D.periods[p], t = P.trend, n = t.length, every = p === "7" ? "day" : "monday";
    const pts = (k, u) => t.map((r) => dayPt(r.day, r[k], (v) => `${v} ${u}`, r.period === "prev"));
    tabSub.textContent = `直近 ${n} 日`;
    const mx = Math.max(...t.map((r) => r.sessions));
    const rows = t.slice().reverse().map((r) => `<tr data-tags="${r.period}" data-day="${r.day}" data-q=""><td class="c-date" data-v="${r.day}">${ymd(r.day)}<span class="sub">${wd(r.day)}</span></td>` +
      `<td class="c-tag" data-v="${r.period}"><span class="sub">${r.period === "recent" ? "直近" : "前の"} ${p} 日</span></td><td class="c-num num" data-v="${r.users}">${r.users} 人</td>` +
      `<td class="c-num num" data-v="${r.sessions}">${r.sessions} 件</td><td class="c-bar" data-v="${r.sessions}"><span class="hbar"><i style="width: ${(r.sessions / mx * 100).toFixed(1)}%"></i></span></td></tr>`).join("");
    panel.innerHTML = `<header class="p-head"><h2>日ごとの利用者数とセッション数</h2><p class="scope">直近 ${n} 日 · 日ごと · 濃い色が直近 ${p} 日</p></header>` +
      `<div class="p-chart"><div class="two"><div><h3><span>利用者数</span></h3>${bars(`d-users-${p}`, pts("users", "人"), "人", every)}</div>` +
      `<div><h3><span>セッション数</span></h3>${bars(`d-sessions-${p}`, pts("sessions", "件"), "件", every)}</div></div></div>` +
      `<div class="filters" data-filter><div class="chipbar" role="group" aria-label="区分"><button type="button" data-chip="all" aria-pressed="true">すべて<b>${n}</b></button>` +
      `<button type="button" data-chip="recent" aria-pressed="false">直近 ${p} 日<b>${n / 2}</b></button><button type="button" data-chip="prev" aria-pressed="false">前の ${p} 日<b>${n / 2}</b></button></div>` +
      `<span class="count"><b data-shown>${n}</b> / ${n} 日</span></div><div class="tscroll"><table data-testid="daily"><thead><tr>` +
      `<th scope="col" class="c-date" aria-sort="descending"><button type="button" data-sort="0">日付<i class="arrow"></i></button></th><th scope="col" class="c-tag"><button type="button" data-sort="1">期間<i class="arrow"></i></button></th>` +
      `<th scope="col" class="c-num num"><button type="button" data-sort="2">利用者数<i class="arrow"></i></button></th><th scope="col" class="c-num num"><button type="button" data-sort="3">セッション数<i class="arrow"></i></button></th><th scope="col" class="c-bar">セッション数の比較</th></tr></thead>` +
      `<tbody>${rows}</tbody></table><p class="empty" data-empty hidden>条件に合う行はありません。</p></div>`;
  }

  let current = "7";
  function render(p) {
    current = PERIODS.includes(p) ? p : "7";
    for (const b of document.querySelectorAll("[data-period]")) b.setAttribute("aria-pressed", String(b.dataset.period === current));
    renderKpis(current);
    renderDaily(current);
    hooks.afterRender.forEach((f) => f(current));
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-period]");
    if (b) {
      const u = new URL(location.href);
      u.searchParams.set("p", b.dataset.period);
      history.replaceState(null, "", u);
      render(b.dataset.period);
      return;
    }
    const c = e.target.closest("#kpis [data-open]");
    if (!c) return;
    e.preventDefault();
    const tab = document.querySelector(`.tabs [data-tab="${c.dataset.open}"]`);
    if (tab) tab.click();
    document.querySelectorAll("#kpis .card").forEach((x) => x.classList.toggle("is-open", x === c));
    document.getElementById("detail").scrollIntoView({ block: "start" });
  });
  document.addEventListener("DOMContentLoaded", () => render(new URLSearchParams(location.search).get("p") || "7"));

  return { D, fmt, series, hooks, card, change, cap, meter, costOf, range, forecast, forecastCard, get period() { return current; }, LABEL };
})();
