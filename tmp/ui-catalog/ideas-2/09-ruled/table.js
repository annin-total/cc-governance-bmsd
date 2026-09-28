"use strict";
// 絞り込み（文字入力・区分チップ）と並べ替えつきの表
// spec: { cols:[{key,label,sub,num,cell,sort,width}], rows, search:{placeholder,text}, chips:[{id,label,tone,test}], sort:[key,dir], unit, maxHeight }
window.UI.table = (host, spec, preset) => {
  const { n } = window.UI;
  const chips = spec.chips || [];
  const st = { q: "", chip: chips.some((c) => c.id === preset) ? preset : chips[0]?.id, sort: spec.sort?.[0], dir: spec.sort?.[1] ?? -1 };
  const unit = spec.unit || "行";

  host.innerHTML = `
    <div class="filters">
      ${spec.search ? `<label class="search"><span class="sr">絞り込み</span><input type="search" placeholder="${spec.search.placeholder}"></label>` : ""}
      ${chips.length ? `<div class="chips" role="group" aria-label="区分">${chips.map((c) =>
        `<button type="button" data-chip="${c.id}">${c.tone ? `<i class="dot ${c.tone}"></i>` : ""}${c.label}<b>${n(spec.rows.filter(c.test).length)}</b></button>`).join("")}</div>` : ""}
      <span class="count"></span>
    </div>
    <div class="tscroll" style="${spec.maxHeight ? `max-height:${spec.maxHeight}px` : ""}">
      <table class="tbl"><thead><tr>${spec.cols.map((c) => {
        const sortable = c.sort !== false;
        const inner = (sortable ? `<button type="button" data-sort="${c.key}">${c.label}<i class="arrow"></i></button>` : c.label)
          + (c.sub ? `<span class="th-sub">${c.sub}</span>` : "");
        return `<th class="${c.num ? "num" : ""} ${c.cls || ""}" style="${c.width ? `width:${c.width}` : ""}">${inner}</th>`;
      }).join("")}</tr></thead><tbody></tbody></table>
      <p class="empty" hidden>条件に合う行はありません。</p>
    </div>`;

  const tbody = host.querySelector("tbody");
  const valueOf = (row, key) => {
    const col = spec.cols.find((c) => c.key === key);
    return typeof col?.sort === "function" ? col.sort(row) : row[key];
  };

  function visible() {
    const test = chips.find((c) => c.id === st.chip)?.test || (() => true);
    const q = st.q.toLowerCase();
    const rows = spec.rows.filter((r) => test(r) && (!q || spec.search.text(r).toLowerCase().includes(q)));
    if (!st.sort) return rows;
    return rows.slice().sort((a, b) => {
      const x = valueOf(a, st.sort), y = valueOf(b, st.sort);
      return (typeof x === "string" ? x.localeCompare(y, "ja") : x - y) * st.dir;
    });
  }

  function render() {
    const rows = visible();
    tbody.innerHTML = rows.map((r) => `<tr>${spec.cols.map((c) =>
      `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${c.cell ? c.cell(r) : r[c.key]}</td>`).join("")}</tr>`).join("");
    host.querySelector(".empty").hidden = rows.length > 0;
    host.querySelector(".count").innerHTML = `<b>${n(rows.length)}</b> / ${n(spec.rows.length)} ${unit}`;
    host.querySelectorAll("[data-chip]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.chip === st.chip)));
    host.querySelectorAll("th").forEach((th) => {
      const b = th.querySelector("[data-sort]");
      th.setAttribute("aria-sort", b && b.dataset.sort === st.sort ? (st.dir > 0 ? "ascending" : "descending") : "none");
    });
  }

  host.querySelector("input")?.addEventListener("input", (e) => { st.q = e.target.value.trim(); render(); });
  host.addEventListener("click", (e) => {
    const c = e.target.closest("[data-chip]"), s = e.target.closest("[data-sort]");
    if (c) st.chip = c.dataset.chip;
    if (s) { st.dir = st.sort === s.dataset.sort ? -st.dir : -1; st.sort = s.dataset.sort; }
    if (c || s) render();
  });
  render();
};
