// 全案で共通の部品: 書式・状態の判定・小さなグラフ・タブ・絞り込み・表。
window.K = (() => {
  const n = (v) => v.toLocaleString("ja-JP");
  const fix = (v, d) => v.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sgn = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±");
  const md = (s) => s.slice(5).replace("-", "/");
  const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const TONE = { ok: "正常", warn: "注意", ng: "要対応", none: "基準なし" };
  const mark = (tone, text = TONE[tone]) => `<span class="mark ${tone}">${text}</span>`;

  // 基準: { on: "value" | "change", bad: "high" | "low", warn, ng }。change は前期間比（%）
  function judge(rule, m) {
    if (!rule) return "none";
    const v = rule.on === "change" ? m.change : m.value;
    if (v == null) return "none";
    const over = (t) => (rule.bad === "high" ? v > t : v < t);
    return over(rule.ng) ? "ng" : over(rule.warn) ? "warn" : "ok";
  }
  function ruleText(rule, unit = "") {
    if (!rule) return "判定の基準なし";
    const ch = rule.on === "change";
    const f = (t) => (ch && t > 0 ? "+" : "") + String(t).replace("-", "−") + (ch ? "%" : unit);
    const cmp = rule.bad === "high" ? "超" : "未満";
    return `${ch ? "前期間比 " : ""}${f(rule.warn)}${cmp}で注意、${f(rule.ng)}${cmp}で要対応`;
  }

  // 小さなグラフ（SVG・横棒）
  function spark(vals, recent, cap) {
    const w = 300, h = 44, pad = 4, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const x = (i) => (i / (vals.length - 1)) * w, y = (v) => pad + (h - 2 * pad) * (1 - (v - min) / span);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`), cut = vals.length - recent, last = vals.length - 1;
    return `<div class="viz"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="${x(cut - 1)}" y="0" width="${w - x(cut - 1)}" height="${h}" fill="var(--wash)"/>
      <polyline points="${pts.slice(0, cut).join(" ")}" fill="none" stroke="var(--muted)" stroke-width="1.3" vector-effect="non-scaling-stroke"/>
      <polyline points="${pts.slice(cut - 1).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(last)}" cy="${y(vals[last])}" r="2.6" fill="var(--accent)"/></svg>${cap ? capRow(cap) : ""}</div>`;
  }
  const capRow = (parts) => `<div class="cap">${parts.map((p) => `<span>${p}</span>`).join("")}</div>`;
  const meter = (num, den, tone = "") => `<span class="meter ${tone}"><i style="width:${den ? (num / den) * 100 : 0}%"></i></span>`;
  function bars(rows) {
    const max = Math.max(...rows.map((r) => r[1])) || 1;
    return `<div class="viz bars">${rows.map(([l, v, t, cls = ""]) => `<div><span class="bl">${l}</span><span class="meter ${cls}"><i style="width:${(v / max) * 100}%"></i></span><span class="bv">${t}</span></div>`).join("")}</div>`;
  }
  const stack = (parts) => `<div class="viz"><div class="stack">${parts.map(([, v], i) => `<i class="s${i}" style="flex:${v}"></i>`).join("")}</div>`
    + `<div class="cap left">${parts.map(([l, v], i) => `<span><b class="sw s${i}"></b>${l} ${v}</span>`).join("")}</div></div>`;

  // タブ: [{ id, label, badge?, tone? }]
  function tabs(el, list, active, onPick) {
    el.setAttribute("role", "tablist");
    el.innerHTML = list.map((t) => `<button type="button" role="tab" data-id="${t.id}" aria-selected="${t.id === active}">${t.label}${t.badge != null ? `<span class="badge ${t.tone || ""}">${t.badge}</span>` : ""}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("[data-id]"); if (b) onPick(b.dataset.id); };
  }

  // 絞り込みの状態: { q, chip, pin: { label, fn }, sort, dir }
  const newState = (tab) => ({ q: "", chip: "all", pin: null, sort: tab.sort?.[0] ?? null, dir: tab.sort?.[1] ?? "desc" });
  function rowsOf(tab, st, skipChip = false) {
    let rows = tab.rows;
    if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter((r) => tab.text(r).toLowerCase().includes(q)); }
    if (st.pin) rows = rows.filter(st.pin.fn);
    if (!skipChip && st.chip !== "all" && tab.chips) rows = rows.filter((r) => tab.chips.of(r) === st.chip);
    const col = tab.cols.find((c) => c.key === st.sort);
    if (col) {
      const v = col.sort || ((r) => r[col.key]), d = st.dir === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => (v(a) > v(b) ? d : v(a) < v(b) ? -d : 0));
    }
    return rows;
  }

  function chipsHtml(tab, st) {
    if (!tab.chips) return "";
    const base = rowsOf(tab, { ...st, sort: null }, true);
    const cnt = (k) => base.filter((r) => tab.chips.of(r) === k).length;
    const one = (k, label, tone) => `<button type="button" data-chip="${k}" aria-pressed="${st.chip === k}">${tone ? `<b class="dot ${tone}"></b>` : ""}${label}<span class="c">${k === "all" ? base.length : cnt(k)}</span></button>`;
    return `<span class="seg-label">${tab.chips.label}</span><div class="seg" role="group" aria-label="${tab.chips.label}">${one("all", "すべて")}${tab.chips.items.map(([k, l, t]) => one(k, l, t)).join("")}</div>`;
  }

  function tableHtml(tab, st) {
    const rows = rowsOf(tab, st);
    const th = tab.cols.map((c) => {
      const on = st.sort === c.key, arrow = c.nosort ? "" : `<span class="ar">${on ? (st.dir === "asc" ? "▲" : "▼") : "↕"}</span>`;
      return `<th class="${c.num ? "num" : ""} ${c.cls || ""} ${on ? "on" : ""}" ${c.nosort ? "" : `data-sort="${c.key}" aria-sort="${on ? (st.dir === "asc" ? "ascending" : "descending") : "none"}"`} ${c.w ? `style="width:${c.w}"` : ""}>${c.label}${arrow}</th>`;
    }).join("");
    const body = rows.length ? rows.map((r) => `<tr>${tab.cols.map((c) => `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}</tr>`).join("")
      : `<tr class="empty"><td colspan="${tab.cols.length}">条件に合う行はありません</td></tr>`;
    return { html: `<thead><tr>${th}</tr></thead><tbody>${body}</tbody>`, count: rows.length };
  }

  // 一覧（絞り込み＋表）。opts.search=false で文字入力を出さない（外の共通バーを使う案）
  function list(el, tab, st, opts = {}) {
    el.innerHTML = `<div class="list-head"><div><h3>${tab.title}</h3><p class="scope">${tab.scope}</p></div>${opts.aside || ""}</div>
      <div class="filter">${opts.search === false ? "" : `<label class="search"><span class="sr">文字で絞り込み</span><input type="search" placeholder="${tab.placeholder || "文字で絞り込み"}" value="${esc(st.q)}"></label>`}<div class="chips"></div><span class="pin-slot"></span><span class="count"></span></div>
      <div class="tbl-wrap"${opts.maxH ? ` style="max-height:${opts.maxH}px"` : ""}><table></table></div>${tab.note ? `<p class="note">${tab.note}</p>` : ""}`;
    const draw = () => {
      const t = tableHtml(tab, st);
      el.querySelector("table").innerHTML = t.html;
      el.querySelector(".chips").innerHTML = chipsHtml(tab, st);
      el.querySelector(".pin-slot").innerHTML = st.pin ? `<span class="pin">${st.pin.label}<button type="button" aria-label="条件を外す">×</button></span>` : "";
      el.querySelector(".count").innerHTML = `<b>${t.count}</b> / ${tab.total ?? tab.rows.length} ${tab.unit || "行"}`;
    };
    el.oninput = (e) => { if (e.target.matches("input[type=search]")) { st.q = e.target.value; draw(); } };
    el.onclick = (e) => {
      const s = e.target.closest("[data-sort]"), c = e.target.closest("[data-chip]"), p = e.target.closest(".pin button");
      if (s) { const k = s.dataset.sort; st.dir = st.sort === k && st.dir === "desc" ? "asc" : "desc"; st.sort = k; }
      else if (c) st.chip = c.dataset.chip;
      else if (p) st.pin = null;
      else return;
      draw();
    };
    draw();
    return draw;
  }

  // タブ付きの詳しい一覧。選んだタブは URL の # に残す。o.derive(tab) で描画前の表を差し替えられる
  function details(el, M, o = {}) {
    const byId = Object.fromEntries(M.TABS.map((t) => [t.id, t]));
    const st = Object.fromEntries(M.TABS.map((t) => [t.id, newState(t)]));
    const h = (location.hash.match(/t=(\w+)/) || [])[1];
    let cur = byId[h] ? h : M.TABS[0].id;
    el.innerHTML = `<div class="tabbar"></div><div class="tabbody"></div>`;
    const draw = () => {
      tabs(el.querySelector(".tabbar"), M.TABS, cur, pick);
      const t = o.derive ? o.derive(byId[cur]) : byId[cur];
      list(el.querySelector(".tabbody"), t, st[cur], { ...o, aside: o.aside?.(byId[cur]) });
    };
    function pick(id) { cur = id; history.replaceState(null, "", "#t=" + id); draw(); o.onPick?.(id); }
    draw();
    return { open: (id, preset = {}) => { st[id] = { ...newState(byId[id]), ...preset }; pick(id); }, redraw: draw, current: () => cur };
  }

  // 指標カード。o.compact で値と補足だけにする
  const valueHtml = (m) => `${m.show(m.value)}${m.unit ? `<span class="u">${m.unit}</span>` : ""}`;
  const deltaHtml = (m) => (m.delta ? `<span class="delta ${m.tone === "ok" ? "" : m.tone}">${m.delta}</span>` : "");
  const card = (m, o = {}) => `<button type="button" class="card${o.compact ? " compact" : ""}" data-metric="${m.id}" title="${m.label}。基準: ${ruleText(m.rule, m.unit)}">
      <div class="k-label"><span>${m.label}</span>${o.noMark ? "" : mark(m.tone)}</div>
      <div class="k-value">${valueHtml(m)}</div>
      <div class="k-sub">${deltaHtml(m)}${m.sub}</div>${o.compact ? "" : m.viz()}${o.rule ? `<div class="k-rule">基準: ${ruleText(m.rule, m.unit)}</div>` : ""}</button>`;

  const head = (M, right = "") => `<div class="page-head"><h1>${M.title}</h1><p class="lead">${M.lead}</p><span class="period">期間: <b>${M.period}</b></span>${right}</div>`;

  return { details, card, head, valueHtml, deltaHtml, n, fix, usd, sgn, md, sum, esc, TONE, mark, judge, ruleText, spark, capRow, meter, bars, stack, tabs, newState, rowsOf, chipsHtml, tableHtml, list };
})();
