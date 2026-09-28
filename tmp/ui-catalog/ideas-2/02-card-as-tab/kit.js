// 部品: 指標カード・小さな推移・横棒・状態の印・タブ・絞り込みつきの表
window.KIT = (() => {
  const n = (v) => v.toLocaleString("ja-JP");
  const pct = (v, d = 1) => v.toFixed(d) + "%";
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±");
  const md = (s) => s.slice(5).replace("-", "/");
  const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const STATE = { ok: "正常", warn: "注意", ng: "要確認" };

  const dot = (cls, text = STATE[cls]) => `<span class="dot ${cls}">${text}</span>`;
  const delta = (d, fmt = n) => `<span class="delta ${d > 0 ? "up" : ""}">${sign(d)}${fmt(Math.abs(d))}</span>`;
  const mail = (e) => { const [a, b] = e.split("@"); return `<span class="mail"><b>${esc(a)}</b><span>@${esc(b)}</span></span>`; };

  function spark(vals, hi) {
    const w = 300, h = 48, pad = 4, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const x = (i) => (i / (vals.length - 1)) * w, y = (v) => pad + (h - 2 * pad) * (1 - (v - min) / span);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const cut = vals.length - hi, last = vals.length - 1;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="${x(cut - 1)}" y="0" width="${w - x(cut - 1)}" height="${h}" fill="var(--track)"/>
      <polyline points="${pts.slice(0, cut).join(" ")}" fill="none" stroke="var(--ghost)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      <polyline points="${pts.slice(cut - 1).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(last)}" cy="${y(vals[last])}" r="2.6" fill="var(--accent)"/></svg>`;
  }

  // rows: [{ label, value, max, tone, text }]。label が無い 1 行は細い棒 1 本
  function hbars(rows) {
    const solo = rows.length === 1 && rows[0].label == null;
    return `<div class="hb ${solo ? "solo" : ""}">` + rows.map((r) =>
      (solo ? "" : `<span>${r.label}</span>`)
      + `<span class="t"><span class="f ${r.tone || ""}" style="width:${Math.max(0, Math.min(100, (r.value / r.max) * 100)).toFixed(1)}%"></span></span>`
      + (solo ? "" : `<span class="v">${r.text ?? n(r.value)}</span>`)).join("") + `</div>`;
  }

  // 定義 1 件からカードの HTML を作る。tag は a か button
  function card(d, { tag = "a", href = "", selected = false, go = "詳細 →" } = {}) {
    const attrs = tag === "a" ? `href="${href}"` : `type="button" aria-pressed="${selected}"`;
    return `<${tag} class="card" ${attrs} data-card="${d.id}">
      <div class="k-label"><span>${d.label}</span>${go ? `<span class="go">${go}</span>` : ""}</div>
      <div class="k-row"><div class="k-value">${d.value}<span class="u">${d.unit || ""}</span></div>${d.state ? dot(d.state) : ""}</div>
      <div class="k-sub">${d.delta || ""}${d.sub || ""}</div>
      ${d.viz ? `<div class="k-viz">${d.viz}</div>` : ""}
    </${tag}>`;
  }

  // 定義の群ごとにカードを並べる。opts(card, group) がカードの描き方を返す
  function cardGroups(host, screen, opts, groupLink) {
    host.innerHTML = screen.groups.map((g) => `<section aria-labelledby="g-${g.id}">
      <h2 class="glabel" id="g-${g.id}">${g.label}<span>${g.scope}</span>${groupLink ? groupLink(g) : ""}</h2>
      <div class="cards ${g.compact ? "compact" : ""}">${screen.cards.filter((c) => c.group === g.id).map((c) => card(c, { go: g.compact ? "→" : "詳細 →", ...opts(c, g) })).join("")}</div>
    </section>`).join("");
  }

  // タブの帯。items: [{ id, label, count }]。選択の反映関数を返す
  function tabs(bar, items, onSelect) {
    bar.setAttribute("role", "tablist");
    bar.innerHTML = items.map((t) => `<button type="button" class="tab" role="tab" data-tab="${t.id}" aria-selected="false">${t.label}${t.count != null ? `<span class="n">${t.count}</span>` : ""}</button>`).join("");
    bar.addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) onSelect(b.dataset.tab); });
    bar.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const bs = [...bar.querySelectorAll(".tab")], i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      const nx = bs[(i + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length];
      nx.focus(); onSelect(nx.dataset.tab);
    });
    return (id) => bar.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
  }

  // 絞り込みつきの表。spec: { columns, rows, search, placeholder, facet, sort, legend }
  // column: { key, label, hs, num, c, w, html(row), val(row) }。facet: { label, of(row), options: [[key, label, cls]] }
  function list(host, spec, preset = {}) {
    const st = { q: "", f: preset.facet || "all", sort: spec.sort ? [...spec.sort] : null };
    const col = (k) => spec.columns.find((c) => c.key === k);
    host.innerHTML = `<div class="fbar">
        ${spec.facet ? `<div class="facets" role="group" aria-label="${spec.facet.label}"></div>` : ""}
        ${spec.search ? `<label class="search"><span class="sr">${spec.placeholder}</span><input type="search" placeholder="${spec.placeholder}"></label>` : ""}
        <span class="count" aria-live="polite"></span>
      </div>
      <div class="tbl-wrap"><table><thead><tr>${spec.columns.map((c) =>
        `<th class="${c.num ? "num" : ""} ${c.c ? "c" : ""}" data-k="${c.key}" ${c.w ? `style="width:${c.w}"` : ""}>${c.val ? `<button type="button">${c.label}</button>` : c.label}${c.hs ? `<span class="hs">${c.hs}</span>` : ""}</th>`).join("")}</tr></thead><tbody></tbody></table></div>
      <p class="empty" hidden>条件に合う行はありません</p>${spec.legend ? `<div class="legend">${spec.legend}</div>` : ""}`;
    const tbody = host.querySelector("tbody"), facets = host.querySelector(".facets"), input = host.querySelector("input");
    const matchQ = (r) => !st.q || spec.search(r).toLowerCase().includes(st.q);
    const matchF = (r, f) => f === "all" || spec.facet.of(r) === f;

    function draw() {
      if (facets) {
        const base = spec.rows.filter(matchQ);
        facets.innerHTML = [["all", "すべて"], ...spec.facet.options].map(([k, l, cls]) =>
          `<button type="button" class="facet" data-f="${k}" aria-pressed="${st.f === k}">${cls ? `<span class="dot ${cls}"></span>` : ""}${l} <b>${base.filter((r) => matchF(r, k)).length}</b></button>`).join("");
      }
      let rows = spec.rows.filter((r) => matchQ(r) && (!spec.facet || matchF(r, st.f)));
      if (st.sort) {
        const [k, dir] = st.sort, v = col(k).val;
        rows = [...rows].sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1); });
      }
      tbody.innerHTML = rows.map((r) => `<tr>${spec.columns.map((c) => `<td class="${c.num ? "num" : ""} ${c.c ? "c" : ""}">${c.html(r)}</td>`).join("")}</tr>`).join("");
      host.querySelector(".empty").hidden = rows.length > 0;
      host.querySelector(".count").textContent = `${spec.rows.length} 行のうち ${rows.length} 行`;
      host.querySelectorAll("th[data-k]").forEach((th) => {
        if (st.sort && th.dataset.k === st.sort[0]) th.setAttribute("aria-sort", st.sort[1] === "asc" ? "ascending" : "descending");
        else th.removeAttribute("aria-sort");
      });
    }
    facets?.addEventListener("click", (e) => { const b = e.target.closest(".facet"); if (b) { st.f = b.dataset.f; draw(); } });
    input?.addEventListener("input", () => { st.q = input.value.trim().toLowerCase(); draw(); });
    host.querySelector("thead").addEventListener("click", (e) => {
      const th = e.target.closest("th[data-k]"); if (!th || !col(th.dataset.k).val) return;
      const k = th.dataset.k;
      st.sort = st.sort && st.sort[0] === k ? [k, st.sort[1] === "asc" ? "desc" : "asc"] : [k, col(k).num ? "desc" : "asc"];
      draw();
    });
    draw();
    return { setFacet: (f) => { st.f = f; draw(); }, setQuery: (q) => { input.value = q; st.q = q.toLowerCase(); draw(); } };
  }

  // タブ 1 枚ぶんの中身（見出し・期間と母集団・前置き・表・注記）
  function panelBody(host, tab, preset = {}, { heading = true } = {}) {
    host.innerHTML = (heading ? `<div class="panel-h"><h2>${tab.label}</h2><span class="scope">${tab.scope}</span></div>` : "")
      + (tab.pre ? `<div class="pre">${tab.pre()}</div>` : "") + `<div class="lst"></div>` + (tab.note ? `<p class="note">${tab.note}</p>` : "");
    return list(host.querySelector(".lst"), tab.list(), preset);
  }

  // ヘッダ（画面のナビ）。links: { overview, policy }
  function header(host, current, links) {
    const S = [["overview", "概況"], ["policy", "設定の適用状況"], ["effect", "設定の効果"], ["assets", "スキル・コマンドの利用"]];
    host.innerHTML = `<div class="wrap bar"><a class="brand" href="${links.overview}">Claude Code 利用状況</a>
      <nav class="nav" aria-label="画面">${S.map(([k, l]) => `<a href="${links[k] || "#"}" ${k === current ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      <span class="asof">${window.CTX.meta.today_label} 時点</span></div>`;
  }

  // 画面の見出し。概況には利用明細の取り込み（操作）を右に置く
  function head(host, screen) {
    const csvLast = window.CTX.overview.daily_cost.reduce((m, r) => (r.day_label > m ? r.day_label : m), "");
    const act = screen.key === "overview" ? `<div class="act"><span>利用明細（CSV）の最終日 ${csvLast}</span><button type="button" class="btn">CSV を取り込む</button></div>` : "";
    host.innerHTML = `<div><h1>${screen.title}</h1><p class="lead">${screen.lead}</p></div>${act}`;
  }

  const FOOT = "端末から送られた値です。コストとトークンは全社の利用明細（CSV）の値を正とします。監査・人事評価・勤怠管理には使いません。";

  return { n, pct, usd, sign, md, sum, esc, dot, delta, mail, spark, hbars, card, cardGroups, tabs, list, panelBody, header, head, FOOT, STATE };
})();
