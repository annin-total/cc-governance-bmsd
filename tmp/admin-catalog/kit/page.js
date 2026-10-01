"use strict";
// 上段の群、下段のタブ（サーバの screens/view.py・components/tabs.html の写し）。カードは card.js。
// 12 か月の扱い（long）: 未指定は出さない（カードは群の注記に名前、タブは「出しません」）・"same" はそのまま・オブジェクトは差し替え。
(() => {
  const K = window.KIT;
  const { esc, fill } = K;
  const SAME = "same";

  const pick = (item, long) => (!long || item.long === SAME ? item : item.long ? { ref: item.ref, ...item.long } : null);

  const ROW = 4; // 1 行に並べられるカードの列数（格子の最小幅と本文の幅から）
  const shownCards = (g, long) => (g.cards || []).map((c) => pick(c, long)).filter(Boolean);
  const spanOf = (g, long) => shownCards(g, long).reduce((n, c) => n + (c.wide ? 2 : 1), 0);

  function groupHtml(g, ctxOf, long, span) {
    const ctx = ctxOf(g);
    const cards = shownCards(g, long);
    const missing = long ? (g.cards || []).filter((c) => { const s = pick(c, true); return !s || s.label !== c.label; }).map((c) => fill(c.label, ctx)) : [];
    const scope = long ? g.longScope || K.L.LONG_SCOPE : g.scope || "";
    const note = [missing.length ? K.L.NOT_LONG_CARDS.replace("{names}", missing.join(K.L.LIST_SEP)) : "", g.note ? fill(g.note, ctx) : ""].filter(Boolean).join(" ");
    const label = fill(g.label, ctx);
    const links = (g.links || []).map((l) => `<a class="glink" href="${esc(l.href)}">${esc(K.L.OPEN_PAGE.replace("{}", l.title))}</a>`).join("");
    const style = span ? ` style="grid-column: span ${span}; --cols: ${span}"` : "";
    return `<section class="group${span ? " packed" : ""}" aria-label="${esc(label)}"${style}><h2 class="glabel">${esc(label)}<span>${esc(fill(scope, ctx))}</span>${links}</h2>`
      + (cards.length ? `<div class="cards">${cards.map((c) => K.card.cardHtml(c, ctx)).join("")}</div>` : "")
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

  // 窓の違う小さな群（2 列以下）が続くとき、ROW 列に収まるだけ 1 行に並べる（look.pack）。群ごとに見出しと期間の注記を持つ
  function rows(groups, long) {
    const out = [];
    for (const g of groups) {
      const n = spanOf(g, long), last = out[out.length - 1];
      const small = K.look.get().pack && n > 0 && n <= 2;
      if (small && last && last.small && last.n + n <= ROW) { last.push(g); last.n += n; } else out.push(Object.assign([g], { small, n }));
    }
    return out;
  }

  function screenHtml(page, ctxOf, long) {
    return `<div class="kpis">${rows(page.groups || [], long).map((r) => (r.length > 1
      ? `<div class="group-row">${r.map((g) => groupHtml(g, ctxOf, long, spanOf(g, long))).join("")}</div>` : groupHtml(r[0], ctxOf, long))).join("")}</div>${detailHtml(page.tabs, ctxOf, long)}`;
  }

  window.KIT = Object.assign(window.KIT || {}, { page: { screenHtml, pick, SAME } });
})();
