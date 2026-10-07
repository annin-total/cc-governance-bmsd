"use strict";
// 下段の表（サーバの screens/table.py と components/table.html の写し）。セルの見た目は cells.js。
(() => {
  const K = window.KIT;
  const { esc, fill, lookup, term } = K;
  const SCALED = new Set(["usd", "usd_strong", "usd_sub", "cum", "tok"]);
  const NUMERIC = new Set(["num", "pct", "pct_strong", "measure", "measure_sub", ...SCALED, "diff", "last_day", "ratio",
    "count_of", "num_sub", "bytes", "rank", "dec1", "pct_change", "usd_day"]);
  const COL_EACH_SUB = "{numerator:num} / {denominator:num} 人";

  const sortKey = (v) => (Array.isArray(v) ? v.length : v);
  function sorted(rows, [key, order]) {
    const dir = order === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = sortKey(a[key]), y = sortKey(b[key]);
      if (x === y) return 0;
      if (x === null || x === undefined) return -dir;
      if (y === null || y === undefined) return dir;
      return (x < y ? -1 : 1) * dir;
    });
  }

  function filled(terms, ctx) {
    if (!terms || typeof terms !== "object") return terms;
    return Object.fromEntries(Object.entries(terms).map(([k, v]) => [k,
      typeof v === "string" ? fill(v, ctx) : Array.isArray(v) ? v.map((x) => fill(x, ctx)) : v]));
  }

  function columns(col, tab, rows, ctx) {
    const kind = col.kind || "text";
    const view = {
      key: col.key, item: null, kind, label: col.each ? "" : fill(col.label ?? "", ctx), sub: "", num: NUMERIC.has(kind),
      sort: col.sort === null ? null : col.sort || col.key, terms: filled(col.terms, ctx), by: col.by || "",
      unit: K.L.UNIT[col.unit] || "", den: col.den || "", at: col.at || "", quiet: Boolean(col.quiet),
      top: kind === "bar" ? Math.max(0, ...rows.map((r) => r[col.key] || 0)) : null,
    };
    if (tab.sort && view.sort === tab.sort[0]) view.aria = tab.sort[1] === "desc" ? "descending" : "ascending";
    const views = !col.each ? [view] : (lookup(ctx, col.each) || []).map((item) => {
      const ident = item && typeof item === "object" ? item.key : item;
      const found = (col.terms || {})[ident] ?? ident;
      const label = typeof found === "string" ? found : found[found.length - 1];
      const sub = item && typeof item === "object" ? fill(col.sub || COL_EACH_SUB, item) : "";
      return { ...view, item: ident, label, sub };
    });
    return views.map((v) => ({ ...v, scale: scale(v, rows) }));
  }

  const value = (col, row) => (col.item !== null ? (row[col.key] || {})[col.item] : row[col.key]);
  function scale(col, rows) {
    if (!SCALED.has(col.kind)) return null;
    const top = Math.max(0, ...rows.map((r) => value(col, r)).filter((v) => v).map(Math.abs));
    return col.kind === "tok" ? K.tokUnit(top) : top >= K.WHOLE_FROM;
  }

  function cell(col, row) {
    let v = value(col, row);
    let sort = col.item !== null || !col.sort ? v : row[col.sort];
    if (col.kind === "bar") {
      const whole = col.den === "100" ? 100 : col.den ? row[col.den] : col.top;
      v = K.geo.pct(v, whole);
    }
    if (Array.isArray(sort)) sort = sort.length;
    return { v, sort: sort === null || sort === undefined ? "" : typeof sort === "boolean" ? Number(sort) : sort, row, col };
  }

  function chips(tab, rows, ctx) {
    if (!tab.chipsBy) return [[], () => []];
    const raw = (r) => { const v = r[tab.chipsBy]; return Array.isArray(v) ? v : [v]; };
    let options, ids;
    if (tab.chips) {
      options = tab.chips.map((c) => [c.id, fill(c.label, ctx), c.tone || ""]);
      ids = Object.fromEntries(tab.chips.map((c) => [c.id, c.id]));
    } else {
      const totals = new Map();
      rows.forEach((r) => raw(r).forEach((v) => totals.set(v, (totals.get(v) || 0) + 1)));
      const values = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
      ids = Object.fromEntries(values.map((v, i) => [v, `k${i}`]));
      options = values.map((v) => [ids[v], term(tab.chipTerms, v), ""]);
    }
    const tags = (r) => raw(r).filter((v) => v in ids).map((v) => ids[v]);
    const counted = options.map(([id, label, tone]) => ({ id, label, tone, count: rows.filter((r) => tags(r).includes(id)).length }));
    const every = { id: "all", label: tab.all || K.L.ALL, tone: "", count: rows.length };
    return [(tab.chipsAll === false ? [] : [every]).concat(counted), tags];
  }

  // タブ 1 つ分の表示用の値
  function model(tab, ctx) {
    const source = [...(lookup(ctx, tab.rows) || [])];
    const rows = tab.sort ? sorted(source, tab.sort) : source;
    const cols = tab.cols.filter(K.page.fits).flatMap((c) => columns(c, tab, rows, ctx));
    const [cs, tags] = chips({ ...tab, chips: tab.chips && tab.chips.filter(K.page.fits) }, rows, ctx);
    const key = tab.chart ? tab.chart.key || "day" : null;
    return {
      cols, chips: cs, chipsAll: tab.chipsAll !== false, search: tab.q ? fill(tab.search || "", ctx) : "",
      unit: tab.unit || "", empty: tab.empty,
      total: tab.chipsAll !== false || !cs.length ? rows.length : cs[0].count, source,
      rows: rows.map((r) => ({
        tags: tags(r).join(" "), q: tab.q ? fill(tab.q, r) : "", key: key ? r[key] : null, cells: cols.map((c) => cell(c, r)),
      })),
    };
  }

  function filtersHtml(t) {
    const search = t.search ? `<label class="search"><span class="sr">${K.L.SEARCH}</span><input type="search" placeholder="${esc(t.search)}" data-search></label>` : "";
    const chipbar = t.chips.length ? `<div class="chipbar" role="group" aria-label="${K.L.FILTER_GROUP}">${t.chips.map((c, i) =>
      `<button type="button" data-chip="${esc(c.id)}" aria-pressed="${i === 0}">${c.tone ? `<i class="dot ${c.tone}"></i>` : ""}${esc(c.label)}<b>${K.num(c.count)}</b></button>`).join("")}</div>` : "";
    return `<div class="filters" data-filter hidden>${search}${chipbar}<span class="count"><b data-shown>${K.num(t.total)}</b> / <span${t.chipsAll ? "" : " data-total"}>${K.num(t.total)}</span> ${esc(t.unit)}</span></div>`;
  }

  function tableHtml(t, id, withFilters = true) {
    const head = t.cols.map((c, i) => `<th scope="col" class="c-${c.kind}${c.num ? " num" : ""}"${c.aria ? ` aria-sort="${c.aria}"` : ""}>${c.sort
      ? `<button type="button" data-sort="${i}">${esc(c.label)}<i class="arrow"></i></button>` : esc(c.label)}${c.sub ? `<span class="th-sub">${esc(c.sub)}</span>` : ""}</th>`).join("");
    const body = t.rows.map((r) => `<tr data-tags="${esc(r.tags)}" data-q="${esc(r.q)}"${r.key !== null && r.key !== undefined ? ` data-link="${esc(r.key)}"` : ""}>${r.cells.map((c) =>
      `<td class="c-${c.col.kind}${c.col.num ? " num" : ""}" data-v="${esc(c.sort)}">${K.cells.cell(c)}</td>`).join("")}</tr>`).join("");
    return `${withFilters ? filtersHtml(t) : ""}<div class="tscroll"><table data-testid="${esc(id)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<p class="empty" data-empty${t.rows.length ? " hidden" : ""}>${esc(t.empty || K.L.EMPTY)}</p></div>`;
  }

  window.KIT = Object.assign(window.KIT || {}, { table: { model, filtersHtml, tableHtml } });
})();
