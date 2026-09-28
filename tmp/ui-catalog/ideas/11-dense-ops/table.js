// 絞り込み入力・選択と、列見出しでの並べ替えを持つ表
window.DenseTable = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const collator = new Intl.Collator("ja", { numeric: true });

  function mount(root, spec) {
    const { columns, rows, search, select, sort: initial } = spec;
    const state = { q: "", sel: "", key: initial?.key ?? null, dir: initial?.dir ?? 1 };
    root.classList.add("dt");
    root.innerHTML = `<div class="dt-tools">
        <input type="search" class="dt-q" placeholder="${esc(search.placeholder)}" aria-label="${esc(search.placeholder)}">
        ${select ? `<select class="dt-sel" aria-label="${esc(select.label)}"><option value="">${esc(select.all)}</option>${select.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select>` : ""}
        <span class="dt-count" aria-live="polite"></span>
      </div>
      <div class="dt-body" style="${spec.maxHeight ? `max-height:${spec.maxHeight}px` : ""}"><table>
        <thead><tr>${columns.map((c, i) => `<th scope="col" class="${c.num ? "n" : ""}" ${c.width ? `style="width:${c.width}"` : ""}><button type="button" data-i="${i}">${esc(c.label)}<span class="ar" aria-hidden="true"></span></button></th>`).join("")}</tr></thead>
        <tbody></tbody></table></div>`;
    const tbody = root.querySelector("tbody");
    const count = root.querySelector(".dt-count");
    const ths = [...root.querySelectorAll("th")];

    const _value = (c, r) => (c.sortVal ? c.sortVal(r) : r[c.key]);
    function render() {
      const q = state.q.trim().toLowerCase();
      let list = rows.filter((r) => (!q || search.keys.some((k) => String(r[k] ?? "").toLowerCase().includes(q))) && (!state.sel || select.match(r, state.sel)));
      if (state.key !== null) {
        const c = columns[state.key];
        list = [...list].sort((a, b) => {
          const va = _value(c, a), vb = _value(c, b);
          const d = typeof va === "number" && typeof vb === "number" ? va - vb : collator.compare(String(va ?? ""), String(vb ?? ""));
          return d * state.dir;
        });
      }
      ths.forEach((th, i) => {
        const on = i === state.key;
        th.setAttribute("aria-sort", on ? (state.dir > 0 ? "ascending" : "descending") : "none");
        th.querySelector(".ar").textContent = on ? (state.dir > 0 ? "▲" : "▼") : "";
      });
      count.textContent = `${list.length} / ${rows.length} ${spec.unit}`;
      tbody.innerHTML = list.length
        ? list.map((r) => `<tr class="${spec.rowClass ? spec.rowClass(r) : ""}">${columns.map((c) => `<td class="${c.num ? "n" : ""} ${c.cls || ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${columns.length}" class="empty">該当する行はありません</td></tr>`;
    }

    root.querySelector(".dt-q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
    root.querySelector(".dt-sel")?.addEventListener("change", (e) => { state.sel = e.target.value; render(); });
    root.querySelectorAll("th button").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      state.dir = state.key === i ? -state.dir : columns[i].num ? -1 : 1;
      state.key = i;
      render();
    }));
    render();
  }

  return { mount, esc };
})();
