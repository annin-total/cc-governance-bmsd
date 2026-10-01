"use strict";
// 案の定義（window.IA）と window.DATA から、`?page=<id>&period=7|28|12m` のページを描く（サーバの base.html の写し）。
// app.js より先に読み、DOM を描き終えてから app.js が操作を付ける。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup } = K;
  const DEFAULT_PERIOD = "7";

  const href = (page, period) => `?page=${encodeURIComponent(page.id)}${page.periods && period !== DEFAULT_PERIOD ? `&period=${period}` : ""}`;

  // 値の場所: 定義の data（例 "p.{period}"・"fixed.policy"）が上に来る。P・F・M で期間の値・固定の値・メタを引ける
  function contextOf(dataPath, period) {
    const root = dataPath ? lookup(window.DATA, dataPath.replace("{period}", period)) : {};
    return { ...K.C, P: window.DATA.p[period], F: window.DATA.fixed, M: window.DATA.meta, ...root };
  }

  function nav(ia, here, period) {
    const link = (p) => `<a href="${href(p, period)}"${p.id === here.id ? ' aria-current="page"' : ""}>${esc(p.title)}</a>`;
    const main = ia.pages.filter((p) => p.nav !== "end").map(link).join("");
    const end = ia.pages.filter((p) => p.nav === "end").map(link).join("");
    return `<header class="top"><div class="wrap bar"><a class="brand" href="${href(ia.pages[0], period)}">${K.L.APP}</a>`
      + `<nav aria-label="${K.L.NAV}">${main}</nav><span class="bar-end"><span class="asof">${esc(K.L.ASOF.replace("{}", K.day(window.DATA.meta.asof)))}</span>${end}</span></div></header>`;
  }

  function switcher(page, period) {
    if (!page.periods) return "";
    const links = window.DATA.meta.periods.map((k) => `<a href="?page=${encodeURIComponent(page.id)}&period=${k}"${k === period ? ' aria-current="true"' : ""} data-period="${k}">${esc(K.L.PERIOD_NAMES[k])}</a>`).join("");
    return `<div class="head-act"><nav class="chipbar period" aria-label="${K.L.PERIOD_NAV}">${links}</nav></div>`;
  }

  const BLOCKS = {
    note: (b, ctx) => `<p class="note">${esc(fill(b.text, ctx))}</p>`,
    notice: (b, ctx) => `<p class="notice ${b.tone || "ok"}">${esc(fill(b.text, ctx))}</p>`,
    form: (b) => `<form class="${b.cls}" onsubmit="return false">${b.fields.map((f) => `<label${f.grow ? ' class="grow"' : ""}>${esc(f.label)}<input type="${f.type || "text"}"${f.accept ? ` accept="${f.accept}"` : ""}></label>`).join("")}<button type="submit" class="btn">${esc(b.button)}</button></form>`,
    table: (b, ctx) => K.table.tableHtml(K.table.model(b.tab, ctx), b.tab.id),
    months: (b, ctx) => {
      const data = lookup(ctx, b.src);
      const top = Math.max(0, ...data.months.map((m) => m.bytes || 0));
      const rows = data.months.map((m) => `<details class="m-item"><summary class="m-row"><span class="m-month">${esc(K.ym(m.first))}`
        + `${m.to ? `<span class="sub">${esc(fill(b.words.to, { day: m.to }))}</span>` : ""}${m.from ? `<span class="sub">${esc(fill(b.words.from, { day: m.from }))}</span>` : ""}</span>`
        + `<span class="num">${K.num(m.total)} ${esc(b.words.unit)}</span><span class="num">${esc(K.size(m.bytes))}</span>${K.viz.hbar(K.geo.pct(m.bytes, top))}<a class="btn-sub" href="#export">${esc(b.words.download)}</a></summary>`
        + `<dl class="m-tables">${Object.entries(data.columns).map(([name, cols]) => `<div><dt><b>${esc(b.words.tables[name])}</b> <span class="code">${esc(name)}.csv</span></dt><dd class="num">${K.num(m.rows[name])} ${esc(b.words.unit)}</dd><dd class="code">${esc(cols.join(", "))}</dd></div>`).join("")}</dl></details>`).join("");
      return `<div class="months" data-testid="months"><div class="m-row m-head">${b.words.head.map((h, i) => `<span${i ? ' class="num"' : ""}>${esc(h)}</span>`).join("")}</div>${rows}</div>`
        + (data.months.length ? "" : `<p class="empty">${esc(b.words.empty)}</p>`);
    },
  };

  function sectionsHtml(page, ctx) {
    return page.sections.map((s) => `<section class="panel section" id="${esc(s.id)}" aria-labelledby="${esc(s.id)}-title"><header class="p-head"><h2 id="${esc(s.id)}-title">${esc(s.title)}</h2><p class="scope">${esc(fill(s.lead || "", ctx))}</p></header>`
      + s.blocks.map((b) => BLOCKS[b.kind](b, ctx)).join("") + "</section>").join("");
  }

  function render() {
    const ia = window.IA;
    const params = new URLSearchParams(location.search);
    const page = ia.pages.find((p) => p.id === params.get("page")) || ia.pages[0];
    const asked = params.get("period") || DEFAULT_PERIOD;
    const period = page.periods && window.DATA.meta.periods.includes(asked) ? asked : DEFAULT_PERIOD;
    const long = Boolean(page.periods) && period === "12m";
    const pageData = page.data || "p.{period}";
    const ctxOf = (item) => contextOf(item.data || pageData, period);
    const ctx = ctxOf(page);
    const content = page.sections ? sectionsHtml(page, ctx) : K.page.screenHtml(page, ctxOf, long);
    document.title = `${page.title} — ${ia.name || K.L.APP}`;
    document.body.innerHTML = nav(ia, page, period)
      + `<main class="wrap"><div class="page-head"><div><h1>${esc(page.title)}</h1><p class="lead">${esc(fill(page.lead || "", ctx))}</p></div>${switcher(page, period)}</div>${content}</main>`
      + `<footer class="wrap foot">${esc(ia.footer || K.L.FOOTER)}</footer>`;
  }

  render();
})();
