"use strict";
// 上段のカードの格子、下段のタブ（サーバの screens/view.py・components/tabs.html の写し）。カードは card.js。
// カードはページごとに 1 つの格子へ並びの順に流す（群の見出しと注記を持たない）。12 か月で出さないカードは断らずに詰める。
// 12 か月の扱い（long）: 未指定は出さない（タブは「出しません」）・"same" はそのまま・オブジェクトは差し替え。
(() => {
  const K = window.KIT;
  const { esc, fill } = K;
  const SAME = "same";

  const pick = (item, long) => (!long || item.long === SAME ? item : item.long ? { ref: item.ref, data: item.data, ...item.long } : null);
  const fits = (item) => !item.only || item.only.includes(K.period); // only: 出す期間（K.period は boot.js が描く前に決める）
  const shownCards = (page, long) => (page.cards || []).filter(fits).map((c) => pick(c, long)).filter(Boolean);

  function panelHtml(tab, ctx, shown) {
    const head = (scope, dots) => `<header class="p-head"><h2>${esc(fill(tab.title, ctx))}</h2><p class="scope">${esc(fill(scope, ctx))}${dots}</p></header>`;
    const open = `<div class="panel" role="tabpanel" id="${esc(tab.id)}" aria-labelledby="tab-${esc(tab.id)}" data-panel="${esc(tab.id)}">`;
    if (!shown) return `${open}${head(K.L.LONG_SCOPE, "")}<p class="na">${esc(K.L.NOT_LONG_PANEL)}</p></div>`;
    const t = K.table.model(shown, ctx);
    const chart = shown.chart ? K.charts.build(shown.chart, t.source, ctx) : null;
    const hasDot = t.cols.some((c) => c.kind === "dot");
    const dots = hasDot ? [true, false, null].map((v) => `<span class="dot-key">${K.cells.dot(v)} ${esc(K.L.DOT_LEGEND[String(v)])}</span>`).join("") : "";
    const switches = chart && chart.switches;
    const note = fill(shown.note || "", ctx) + ((chart && chart.note) || "");
    return `${open}${head(shown.scope, dots)}${switches ? K.table.filtersHtml(t) : ""}${chart ? `<div class="p-chart">${chart.html}</div>` : ""}`
      + `${K.table.tableHtml(t, shown.id, !switches)}${note ? `<p class="note">${esc(note)}</p>` : ""}</div>`;
  }

  // 下段の見出し「詳しい一覧」はタブの入口で、カードの群の見出しではない
  function detailHtml(tabs, ctxOf, long) {
    if (!tabs || !tabs.length) return "";
    const items = tabs.map((t) => ({ t, shown: pick(t, long), ctx: ctxOf(t) }));
    const bar = items.map(({ t, shown, ctx }) => { const id = esc((shown || t).id); return `<a role="tab" id="tab-${id}" href="#${id}" aria-controls="${id}" data-tab="${id}"><b>${esc(fill((shown || t).label, ctx))}</b><span>${esc(shown ? fill(shown.hint || "", ctx) : K.L.NOT_LONG)}</span></a>`; }).join("");
    return `<section class="detail" id="detail" aria-label="${K.L.DETAIL}" data-tabs><h2 class="glabel">${K.L.DETAIL}<span>${K.L.DETAIL_HINT}</span></h2>`
      + `<div class="tabs" role="tablist">${bar}</div>${items.map(({ t, shown, ctx }) => panelHtml(shown || t, ctx, shown)).join("")}</section>`;
  }

  const grid = (page, ctxOf, long) => `<div class="cards grid">${shownCards(page, long).map((c) => K.card.cardHtml(c, ctxOf(c))).join("")}</div>`;

  // 概況: 見出し「主な指標」の下に 1 つの格子（期間は帯の期間の表示に 1 か所だけ）
  const homeHtml = (page, ctxOf, long) => `<div class="kpis"><section class="home-cards" aria-label="${K.L.HOME_CARDS}"><h2 class="glabel">${K.L.HOME_CARDS}</h2>${grid(page, ctxOf, long)}</section></div>`;
  const screenHtml = (page, ctxOf, long) => `<div class="kpis">${grid(page, ctxOf, long)}</div>${detailHtml(page.tabs, ctxOf, long)}`;

  window.KIT = Object.assign(window.KIT || {}, { page: { screenHtml, homeHtml, pick, fits, shownCards, SAME } });
})();
