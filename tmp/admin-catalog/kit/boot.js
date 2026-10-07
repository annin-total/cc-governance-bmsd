"use strict";
// 案の定義（window.IA）と window.DATA から、`?page=<id>&period=7|28|12m&asof=YYYY-MM-DD` のページを描く（サーバの base.html の写し）。基準日は basedate.js。
// app.js より先に読み、DOM を描き終えてから app.js と interact.js が操作を付ける。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup } = K;
  const DEFAULT_PERIOD = "7";
  const params = new URLSearchParams(location.search);
  const { keep } = K.basedate;

  const href = (page, period) => keep(`?page=${encodeURIComponent(page.id)}${page.periods && period !== DEFAULT_PERIOD ? `&period=${period}` : ""}`);

  // 値の場所: 定義の data（例 "p.{period}"・"fixed.r3.policy"）が上に来る。P・F・M で期間の値・固定の値・メタを引ける
  function contextOf(dataPath, period) {
    const root = dataPath ? lookup(window.DATA, dataPath.replace("{period}", period)) : {};
    return { ...K.C, P: window.DATA.p[period], F: window.DATA.fixed, M: window.DATA.meta, ...root };
  }

  function nav(ia, here, period) {
    const current = here.navAs || here.id;
    const link = (p) => `<a href="${href(p, period)}"${p.id === current ? ' aria-current="page"' : ""}>${esc(p.title)}</a>`;
    const main = ia.pages.filter((p) => !p.nav).map(link).join("");
    const end = ia.pages.filter((p) => p.nav === "end").map(link).join("");
    return `<header class="top"><div class="wrap bar"><a class="brand" href="${href(ia.pages[0], period)}">${K.L.APP}</a>`
      + `<nav aria-label="${K.L.NAV}">${main}</nav><span class="bar-end">${K.basedate.header()}${end}</span></div></header>`;
  }

  function switcher(page, period) {
    if (!page.periods) return "";
    const links = window.DATA.meta.periods.map((k) => `<a href="${keep(`?page=${encodeURIComponent(page.id)}&period=${k}`)}"${k === period ? ' aria-current="true"' : ""} data-period="${k}">${esc(K.L.PERIOD_NAMES[k])}</a>`).join("");
    return `<nav class="chipbar period" aria-label="${K.L.PERIOD_NAV}">${links}</nav>`;
  }

  // 状態の絞り込み: 判定を持つカードがあるページだけに出す
  function stateFilter(page) {
    const has = (page.groups || []).some((g) => g.cards.some((c) => c.state));
    if (!has) return "";
    const L = K.L;
    return `<div class="chipbar state-filter" role="group" aria-label="${L.STATE_FILTER_NAV}" data-state-filter>`
      + Object.entries(L.STATE_FILTER).map(([id, label], i) => `<button type="button" data-filter="${id}" aria-pressed="${i === 0}">${id !== "all" ? `<i class="dot ${id}"></i>` : ""}${esc(label)}</button>`).join("") + "</div>";
  }

  function sectionsHtml(page, ctx) {
    return page.sections.filter((s) => !s.org || K.look.get().org).map((s) => `<section class="panel section" id="${esc(s.id)}" aria-labelledby="${esc(s.id)}-title"><header class="p-head${s.action ? " p-head-act" : ""}"><div><h2 id="${esc(s.id)}-title">${esc(s.title)}</h2><p class="scope">${esc(fill(s.lead || "", ctx))}</p></div>`
      + `${s.action ? `<a class="btn" href="${esc(keep(s.action.href))}">${esc(s.action.label)}</a>` : ""}</header>`
      + s.blocks.map((b) => K.blocks[b.kind](b, ctx)).join("") + "</section>").join("");
  }

  function render() {
    const ia = window.IA;
    const page = ia.pages.find((p) => p.id === params.get("page")) || ia.pages[0];
    const asked = params.get("period") || DEFAULT_PERIOD;
    const period = page.periods && window.DATA.meta.periods.includes(asked) ? asked : DEFAULT_PERIOD;
    const long = Boolean(page.periods) && period === "12m";
    K.period = period;
    const pageData = page.data || "p.{period}";
    const ctxOf = (item) => contextOf(item.data || pageData, period);
    const ctx = ctxOf(page);
    const top = page.home && page.summary ? K.blocks.summary_latest({}, contextOf("fixed.r3", period), ia) : "";
    const content = page.sections ? sectionsHtml(page, ctx) : top + (page.home ? K.page.homeHtml : K.page.screenHtml)(page, ctxOf, long);
    const act = [stateFilter(page), K.basedate.act(page, "before"), switcher(page, period), K.basedate.act(page, "after")].filter(Boolean).join("");
    const look = K.look.get(), root = document.documentElement;
    if (look.fs !== "F5") root.dataset.fs = look.fs;
    if (look.sticky) Object.assign(root.dataset, { sticky: look.sticky, hv: look.hv }); // 案 51: ヘッダーだけを固定し、高さの型（head5.css）
    document.title = `${page.title} — ${ia.name || K.L.APP}`;
    document.body.innerHTML = nav(ia, page, period)
      + `<main class="wrap">${ia.compare === true ? K.compare.html() : ""}<div class="page-head"><div><h1>${esc(page.title)}</h1><p class="lead">${esc(fill(page.lead || "", ctx))}</p></div>`
      + `${act ? `<div class="head-act">${act}</div>` : ""}</div>${content}</main>`
      + `<footer class="wrap foot">${esc(ia.footer || K.L.FOOTER)}</footer>${ia.compare === "r5" ? K.compare5.html() : ""}`;
    if (look.hv === "HV4") addEventListener("scroll", () => root.classList.toggle("is-shrunk", scrollY > 0), { passive: true });
  }

  K.contextOf = contextOf;
  render();
})();
