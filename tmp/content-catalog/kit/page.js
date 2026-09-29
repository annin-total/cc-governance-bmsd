"use strict";
// 上段の群とカード、下段のタブ（サーバの screens/view.py・components/card.html・tabs.html の写し）。
// 12 か月の扱い（long）: 未指定は出さない（カードは群の注記に名前、タブは「出しません」）・"same" はそのまま・オブジェクトは差し替え。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup, parts, partsHtml } = K;
  const SAME = "same";

  const pick = (item, long) => (!long || item.long === SAME ? item : item.long || null);

  function caps(card, ctx) {
    if (card.empty && (lookup(ctx, card.empty) ?? null) === null) return card.capEmpty || [];
    return card.cap || [];
  }

  function cardHtml(card, ctx) {
    const value = card.value ? parts(card.value, ctx) : [];
    const blank = value.length === 1 && value[0][0] === K.EM;
    const delta = card.delta ? fill(card.delta, ctx) : "";
    const state = card.state ? lookup(ctx, card.state) : null;
    const viz = card.viz ? K.viz.render(card, ctx) : "";
    const cs = caps(card, ctx).map((c) => fill(c, ctx));
    const head = `<span class="k-label"><span>${esc(fill(card.label, ctx))}</span>${state ? K.cells.mark(state, K.L.STATE[state]) : card.tab ? `<span class="go">${K.L.OPEN_LIST}</span>` : ""}</span>`;
    const body = (card.value ? `<span class="k-value">${partsHtml(value)}<span class="u">${esc(blank ? "" : card.unit || "")}</span></span>` : "")
      + `<span class="k-sub">${delta && delta !== K.EM ? `<span class="change${delta.startsWith("+") ? " up" : ""}">${esc(delta)}</span>` : ""}${partsHtml(parts(card.sub || "", ctx))}</span>`
      + `<span class="k-viz">${viz}${cs.length ? `<span class="cap">${cs.map((c) => `<span>${esc(c)}</span>`).join("")}</span>` : ""}</span>`;
    const cls = `card${card.wide ? " wide" : ""}`;
    if (!card.tab) return `<div class="${cls}">${head}${body}</div>`;
    const open = card.tab + (card.chip ? `:${card.chip}` : "");
    return `<a class="${cls}" href="#${esc(card.tab)}" data-open="${esc(open)}">${head}${body}</a>`;
  }

  function groupHtml(g, ctxOf, long) {
    const ctx = ctxOf(g);
    const cards = (g.cards || []).map((c) => pick(c, long)).filter(Boolean);
    const missing = long ? (g.cards || []).filter((c) => { const s = pick(c, true); return !s || s.label !== c.label; }).map((c) => fill(c.label, ctx)) : [];
    const scope = long ? g.longScope || K.L.LONG_SCOPE : g.scope || "";
    const note = [missing.length ? K.L.NOT_LONG_CARDS.replace("{names}", missing.join(K.L.LIST_SEP)) : "", g.note ? fill(g.note, ctx) : ""].filter(Boolean).join(" ");
    const label = fill(g.label, ctx);
    return `<section class="group" aria-label="${esc(label)}"><h2 class="glabel">${esc(label)}<span>${esc(fill(scope, ctx))}</span></h2>`
      + (cards.length ? `<div class="cards">${cards.map((c) => cardHtml(c, ctx)).join("")}</div>` : "")
      + (note ? `<p class="gnote">${esc(note)}</p>` : "") + "</section>";
  }

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

  function detailHtml(tabs, ctxOf, long) {
    if (!tabs || !tabs.length) return "";
    const items = tabs.map((t) => ({ t, shown: pick(t, long), ctx: ctxOf(t) }));
    const bar = items.map(({ t, shown, ctx }) => { const id = esc((shown || t).id); return `<a role="tab" id="tab-${id}" href="#${id}" aria-controls="${id}" data-tab="${id}"><b>${esc(fill((shown || t).label, ctx))}</b><span>${esc(shown ? fill(shown.hint || "", ctx) : K.L.NOT_LONG)}</span></a>`; }).join("");
    return `<section class="detail" id="detail" aria-label="${K.L.DETAIL}" data-tabs><h2 class="glabel">${K.L.DETAIL}<span>${K.L.DETAIL_HINT}</span></h2>`
      + `<div class="tabs" role="tablist">${bar}</div>${items.map(({ t, shown, ctx }) => panelHtml(shown || t, ctx, shown)).join("")}</section>`;
  }

  function screenHtml(page, ctxOf, long) {
    return `<div class="kpis">${(page.groups || []).map((g) => groupHtml(g, ctxOf, long)).join("")}</div>${detailHtml(page.tabs, ctxOf, long)}`;
  }

  window.KIT = Object.assign(window.KIT || {}, { page: { screenHtml, pick, SAME } });
})();
