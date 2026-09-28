"use strict";
// 案 09: 12 か月を選ぶと「長期」の型に変える。記録から数える群は見出し 1 行に畳む
const TWELVE = (() => {
  const { D, h, s, usd, epoch } = L;
  const W = 1100, G = 44, N = 53, STEP = (W - G) / N;
  const f1 = C.f1;
  const pct = (x) => `${((x / W) * 100).toFixed(3)}%`;

  // 見出し 1 行に畳んだ群。押すと 28 日に切り替える
  const fold = (label, text) => h("section", { class: "group fold", "aria-label": label },
    h("h2", { class: "glabel" }, label, h("span", {}, text),
      h("button", { type: "button", class: "fold-go", "data-goto": "28" }, "28 日で見る")));

  function _yAxis(svg, base, hgt, max, step, label) {
    for (let v = 0; v <= max; v += step) {
      const y = f1(base - (v / max) * hgt);
      svg.append(s("line", { class: "gridline", x1: G, x2: W, y1: y, y2: y }), s("text", { x: G - 8, y: y + 4, "text-anchor": "end" }, label(v)));
    }
  }

  function costChart(ws) {
    const base = 176, hgt = 164, max = Math.ceil(Math.max(...ws.map((w) => w.cost)) / 1000) * 1000, bw = STEP * 0.66;
    const svg = s("svg", { viewBox: `0 0 ${W} 180`, "aria-hidden": "true" });
    _yAxis(svg, base, hgt, max, 1000, (v) => usd(v, true));
    ws.forEach((w, i) => {
      const x = f1(G + i * STEP + (STEP - bw) / 2);
      let y = base;
      ["aws-bedrock", "google-vertex"].forEach((k, j) => {
        const bh = ((w.providers[k] || 0) / max) * hgt;
        y -= bh;
        svg.append(s("rect", { class: `series-${j}${w.partial ? " partial" : ""}`, x, y: f1(y), width: f1(bw), height: f1(bh), "data-i": i }));
      });
    });
    ws.forEach((w, i) => svg.append(C.hit(i, G + i * STEP, 0, STEP, base, [...O.weekTip(w), usd(w.cost)])));
    return svg;
  }

  function usersChart(ws) {
    const base = 68, hgt = 60, max = Math.ceil(Math.max(...ws.map((w) => w.users)) / 20) * 20, bw = STEP * 0.66;
    const svg = s("svg", { viewBox: `0 0 ${W} 72`, "aria-hidden": "true" });
    _yAxis(svg, base, hgt, max, 20, (v) => `${v} 人`);
    ws.forEach((w, i) => {
      const bh = (w.users / max) * hgt;
      svg.append(s("rect", { class: w.partial ? "bar-hi partial" : "bar-hi", x: f1(G + i * STEP + (STEP - bw) / 2), y: f1(base - bh), width: f1(bw), height: f1(bh), rx: 1, "data-i": i }));
    });
    ws.forEach((w, i) => svg.append(C.hit(i, G + i * STEP, 0, STEP, base, [...O.weekTip(w), `${w.users} 人`])));
    return svg;
  }

  // 目盛りを兼ねる月ごとの合計の行。幅は各月の最初の週から次の月の最初の週まで、合計は暦月
  function monthRow(ws) {
    const first = ws[0].start, marks = D.twelve_months.month_first_week, last = ws[ws.length - 1].end;
    const row = h("div", { class: "months" });
    marks.forEach((m, k) => {
      if (m.week_index === 0 && marks.length > 12) return;
      const end = k + 1 < marks.length ? marks[k + 1].week_index : N;
      const sum = D.daily_cost.filter((d) => d.date.startsWith(m.month) && d.date >= first && d.date <= last).reduce((a, d) => a + d.total, 0);
      const partial = m.month === last.slice(0, 7);
      row.append(h("div", { class: "month", style: `left: ${pct(G + m.week_index * STEP)}; width: ${pct((end - m.week_index) * STEP)}` },
        h("span", {}, m.month, partial ? h("small", {}, "（途中）") : null), h("b", {}, usd(sum, true))));
    });
    return row;
  }

  function weekTable(ws) {
    const rows = [...ws].reverse();
    const col = (vals) => { const whole = Math.max(...vals) >= 1000; return (v) => usd(v, whole); };
    const aws = col(ws.map((w) => w.providers["aws-bedrock"] || 0)), gcp = col(ws.map((w) => w.providers["google-vertex"] || 0)), sum = col(ws.map((w) => w.cost));
    const max = Math.max(...ws.map((w) => w.cost));
    return P.table("weeks", [{ label: "週の始まり", cls: "c-date" }, { label: "AWS Bedrock", cls: "num" }, { label: "Google Vertex AI", cls: "num" }, { label: "合計", cls: "num" }, { cls: "c-bar" }, { label: "利用者数", cls: "num" }],
      rows.map((w) => {
        const ep = epoch(w.start), a = w.providers["aws-bedrock"] || 0, g = w.providers["google-vertex"] || 0;
        return { cells: [{ v: ep, cls: "c-date", content: [w.start, P.sub(w.partial ? "（途中 · 1 日）" : L.wd(ep))] },
          { v: a, cls: "num", content: aws(a) }, { v: g, cls: "num", content: gcp(g) }, { v: w.cost, cls: "num", content: h("b", {}, sum(w.cost)) },
          { v: w.cost, cls: "c-bar", content: P.hbar((w.cost / max) * 100, w.partial) }, { v: w.users, cls: "num", content: `${w.users} 人` }] };
      }), 0);
  }

  function longSection() {
    const ws = O.weeks();
    const legend = h("div", { class: "legend" }, h("span", {}, h("i", { class: "series-0" }), "AWS Bedrock"), h("span", {}, h("i", { class: "series-1" }), "Google Vertex AI"), h("span", {}, "薄い棒は途中の週"));
    return h("section", { class: "detail", id: "long", "aria-label": "週ごとの推移" },
      h("h2", { class: "glabel" }, "詳しい一覧", h("span", {}, "週ごと · 利用明細（CSV）")),
      P.panel("long", "週ごとのコストと利用者数", `${O.range12()} · 週は月曜始まり · 月の合計は暦月（USD）`,
        h("div", { class: "p-chart" }, h("h3", {}, "コスト"), costChart(ws), monthRow(ws), legend),
        h("div", { class: "p-chart" }, h("h3", {}, "利用者数"), usersChart(ws)),
        P.filters({ total: ws.length, unit: "週" }), weekTable(ws),
        h("p", { class: "note" }, "月の合計は暦月の値です（2025-09 は 09/29・09/30 の 2 日で、表にだけ含みます）。最後の週は 09/28 の 1 日だけです。")));
  }

  function _goto(e) {
    const b = e.target.closest("[data-goto]");
    if (b) document.querySelector(`#switch [data-period="${b.dataset.goto}"]`).click();
  }
  document.addEventListener("click", _goto);

  function overview(top, detail) {
    detail.hidden = true;
    top.replaceChildren(
      P.group("利用明細（CSV）", `直近 12 か月（${O.range12()}）· 週ごと · 前の期間と比べない`,
        [O.cost12Card(false, "#long"), O.users12Card(false, "#long"), O.forecastCard("#long")]),
      fold("記録から数える項目", "送信した利用者・セッション・確認なしモード・データの届き具合は、12 か月では出しません"),
      longSection());
  }

  function assets(top, detail) {
    detail.hidden = true;
    top.replaceChildren(fold("呼び出し・サブエージェント", "スキル・コマンド・サブエージェントは記録から数えるので、12 か月では出しません"));
  }

  return { overview, assets };
})();
