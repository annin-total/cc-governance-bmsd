"use strict";
// 案の定義（window.IA）と window.DATA から、`?page=<id>&period=7|28|12m&asof=YYYY-MM-DD` のページを描く（サーバの base.html の写し）。
// app.js より先に読み、DOM を描き終えてから app.js と interact.js が操作を付ける。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup } = K;
  const DEFAULT_PERIOD = "7";
  const params = new URLSearchParams(location.search);
  const ASOF = params.get("asof");

  const href = (page, period) => `?page=${encodeURIComponent(page.id)}${page.periods && period !== DEFAULT_PERIOD ? `&period=${period}` : ""}${ASOF ? `&asof=${ASOF}` : ""}`;

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
      + `<nav aria-label="${K.L.NAV}">${main}</nav><span class="bar-end"><span class="asof">${esc(K.L.ASOF.replace("{}", K.day(window.DATA.meta.asof)))}</span>${end}</span></div></header>`;
  }

  function switcher(page, period) {
    if (!page.periods) return "";
    const links = window.DATA.meta.periods.map((k) => `<a href="?page=${encodeURIComponent(page.id)}&period=${k}${ASOF ? `&asof=${ASOF}` : ""}"${k === period ? ' aria-current="true"' : ""} data-period="${k}">${esc(K.L.PERIOD_NAMES[k])}</a>`).join("");
    return `<nav class="chipbar period" aria-label="${K.L.PERIOD_NAV}">${links}</nav>`;
  }

  // 状態の絞り込み: 判定を持つカードがあるページだけに出す
  function stateFilter(page) {
    const has = (page.groups || []).some((g) => g.cards.some((c) => c.state));
    if (!has) return "";
    const L = K.L;
    return `<div class="chipbar state-filter" role="group" aria-label="${L.STATE_FILTER_NAV}" data-state-filter="${K.look.get().filter}">`
      + Object.entries(L.STATE_FILTER).map(([id, label], i) => `<button type="button" data-filter="${id}" aria-pressed="${i === 0}">${id !== "all" ? `<i class="dot ${id}"></i>` : ""}${esc(label)}</button>`).join("") + "</div>";
  }

  // 基準日: 概況では選ぶ。専用ページは受け取った基準日を見出しの横に出し、「今日に戻す」で外す
  function baseDate(page) {
    const today = K.day(window.DATA.meta.asof);
    if (page.home) {
      const first = K.day(window.DATA.meta.first_day + 27);
      return `<label class="asof-pick">${esc(K.L.BASE_DATE)}<input type="date" value="${esc(ASOF || today)}" min="${first}" max="${today}" data-asof></label>`;
    }
    if (!ASOF) return "";
    const back = new URLSearchParams(location.search);
    back.delete("asof");
    return `<span class="asof-tag">${esc(K.L.BASE_DATE_TAG.replace("{}", K.md(Date.parse(ASOF) / 86400000)))}<a href="?${esc(back.toString())}${esc(location.hash)}" data-asof-reset>${esc(K.L.BASE_RESET)}</a></span>`;
  }

  function sectionsHtml(page, ctx) {
    return page.sections.map((s) => `<section class="panel section" id="${esc(s.id)}" aria-labelledby="${esc(s.id)}-title"><header class="p-head${s.action ? " p-head-act" : ""}"><div><h2 id="${esc(s.id)}-title">${esc(s.title)}</h2><p class="scope">${esc(fill(s.lead || "", ctx))}</p></div>`
      + `${s.action ? `<a class="btn" href="${esc(s.action.href)}">${esc(s.action.label)}</a>` : ""}</header>`
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
    const content = page.sections ? sectionsHtml(page, ctx) : top + K.page.screenHtml(page, ctxOf, long);
    const act = [stateFilter(page), page.home ? baseDate(page) : "", switcher(page, period)].filter(Boolean).join("");
    document.title = `${page.title} — ${ia.name || K.L.APP}`;
    document.body.innerHTML = nav(ia, page, period)
      + `<main class="wrap">${ia.compare ? K.compare.html() : ""}<div class="page-head"><div><h1>${esc(page.title)}${page.home ? "" : baseDate(page)}</h1><p class="lead">${esc(fill(page.lead || "", ctx))}</p></div>`
      + `${act ? `<div class="head-act">${act}</div>` : ""}</div>${content}</main>`
      + `<footer class="wrap foot">${esc(ia.footer || K.L.FOOTER)}</footer>`;
  }

  K.contextOf = contextOf;
  render();
})();
