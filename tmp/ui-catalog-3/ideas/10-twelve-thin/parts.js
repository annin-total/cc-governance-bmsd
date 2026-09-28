"use strict";
// 今の画面の部品（群・指標カード・パネル・絞り込み・表）を、本物のテンプレートと同じ class で組み立てる
const P = (() => {
  const { h, int } = L;

  const block = (label, scope, ...body) => h("section", { class: "group", "aria-label": label },
    h("h2", { class: "glabel" }, label, h("span", {}, scope)), body);
  const group = (label, scope, cards) => block(label, scope, h("div", { class: "cards" }, cards));

  // c: { open | href, label, mark, value, unit, change, sub, viz, wide }
  function card(c) {
    const right = c.mark ? h("span", { class: `mark ${c.mark[0]}` }, c.mark[1]) : h("span", { class: "go" }, "一覧");
    const change = c.change ? h("span", { class: c.change[1] ? "change up" : "change" }, c.change[0]) : null;
    return h("a", { class: c.wide ? "card wide" : "card", href: c.href || `#${c.open}`, "data-open": c.href ? null : c.open },
      h("span", { class: "k-label" }, h("span", {}, c.label), right),
      h("span", { class: "k-value" }, c.value, h("span", { class: "u" }, c.unit || "")),
      h("span", { class: "k-sub" }, change, c.sub),
      c.viz ? h("span", { class: "k-viz" }, c.viz) : null);
  }

  // 12 か月では出さないカード。場所だけを残す
  const offCard = (label, wide) => h("div", { class: wide ? "card wide is-off" : "card is-off", "aria-disabled": "true" },
    h("span", { class: "k-label" }, h("span", {}, label)),
    h("span", { class: "off-note" }, h("b", {}, "12 か月では出しません"), h("span", {}, "7 日・28 日で見られます")));

  const cap = (...parts) => h("span", { class: "cap" }, parts.map((p) => h("span", {}, p)));
  const hbar = (pct, ghost) => h("span", { class: ghost ? "hbar ghost" : "hbar" }, h("i", { style: `width: ${pct.toFixed(1)}%` }));
  const meter = (pct) => h("span", { class: "meter" }, h("i", { style: `width: ${pct.toFixed(1)}%` }));
  const pair = (label, pct, ghost) => h("span", { class: "pair" }, h("span", {}, label), hbar(pct, ghost));
  const rate = (label, pct, num, ghost) => h("span", { class: "rate" }, h("span", {}, label), hbar(pct, ghost), h("span", { class: "num strong" }, num));

  const panel = (id, title, scope, ...body) => h("div", { class: "panel", role: "tabpanel", id, "aria-labelledby": `tab-${id}`, "data-panel": id },
    h("header", { class: "p-head" }, h("h2", {}, title), h("p", { class: "scope" }, scope)), body);

  // chips: [[id, label, count]]
  const filters = ({ search, chips, total, unit }) => h("div", { class: "filters" },
    search ? h("label", { class: "search" }, h("span", { class: "sr" }, "絞り込み"), h("input", { type: "search", placeholder: search, "data-search": true })) : null,
    chips ? h("div", { class: "chipbar", role: "group", "aria-label": "区分" },
      chips.map(([id, label, n]) => h("button", { type: "button", "data-chip": id, "aria-pressed": String(id === "all") }, label, h("b", {}, int(n))))) : null,
    h("span", { class: "count" }, h("b", { "data-shown": true }, int(total)), ` / ${int(total)} ${unit}`));

  // cols: [{ label（並べ替える列） | text（見出しだけ）, cls }]; rows: [{ tags, q, cells: [{ v, cls, content }] }]
  function table(testid, cols, rows, sorted) {
    const head = h("tr", {}, cols.map((c, i) => h("th", { scope: "col", class: c.cls, "aria-sort": i === sorted ? "descending" : null },
      c.label ? h("button", { type: "button", "data-sort": String(i) }, c.label, h("i", { class: "arrow" })) : c.text)));
    const body = rows.map((r) => h("tr", { "data-tags": r.tags || "", "data-q": r.q || "" },
      r.cells.map((c) => h("td", { class: c.cls, "data-v": c.v == null ? "" : String(c.v) }, c.content))));
    return h("div", { class: "tscroll" },
      h("table", { "data-testid": testid }, h("thead", {}, head), h("tbody", {}, body)),
      h("p", { class: "empty", "data-empty": true, hidden: true }, "条件に合う行はありません。"));
  }

  const sub = (text) => h("span", { class: "sub" }, text);
  const dateCell = (ep) => ({ v: ep, cls: "c-date", content: [L.iso(ep), sub(L.wd(ep))] });

  return { block, group, card, offCard, cap, hbar, meter, pair, rate, panel, filters, table, sub, dateCell };
})();
