"use strict";
// 区画（sections）の部品: 注記・知らせ・フォーム・表・月の一覧（データと設定。サーバの settings.html の写し）。サマリーの部品は summary.js が足す。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup } = K;

  const blocks = {
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

  K.blocks = Object.assign(K.blocks || {}, blocks);
})();
