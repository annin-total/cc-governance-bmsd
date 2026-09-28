// 部品: ナビ・カード・タブ・絞り込み付きの表・小さなグラフ。値の意味は知らない。
window.UI = (() => {
  const SCREENS = [["index.html", "概況"], ["policy.html", "設定の適用状況"], ["#", "設定の効果"], ["#", "スキル・コマンドの利用"]];
  const TONE_LABEL = { ok: "正常", warn: "注意", ng: "要対応" };

  const n = (v) => v.toLocaleString("ja-JP");
  const pct = (v) => v.toFixed(1) + "%";
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±");
  const md = (s) => s.slice(5).replace("-", "/");
  const dot = (tone, text = TONE_LABEL[tone] || "") => `<span class="dot ${tone}">${text}</span>`;
  const st = (tone, text) => `<span class="st ${tone}">${text}</span>`;

  function nav(host, current, asof, screens = SCREENS) {
    host.innerHTML = `<a class="brand" href="${screens[0][0]}">Claude Code 利用状況</a><nav aria-label="画面">` +
      screens.map(([href, label]) => `<a href="${href}"${label === current ? ' aria-current="page"' : ""}>${label}</a>`).join("") +
      `</nav><span class="asof">${asof} 時点</span>`;
  }

  function cardHtml(c) {
    const delta = c.delta ? `<span class="delta ${c.delta.up ? "up" : ""}">${c.delta.text}</span>` : "";
    return `<a class="card${c.span ? " span" + c.span : ""}" href="#${c.tab}" data-tab="${c.tab}" data-chip="${c.chip || ""}">
      <div class="k-head"><span class="k-label">${c.label}</span>${c.status ? dot(c.status, c.statusText) : ""}</div>
      ${c.value != null ? `<div class="k-value">${c.value}<span class="u">${c.unit || ""}</span></div>` : "<div></div>"}
      <div class="k-sub">${delta}${c.sub || ""}</div>
      <div class="k-viz">${c.viz || ""}</div></a>`;
  }

  // GROUPS の順に、CARDS を group で振り分けて描く。カードを押すと onPick(tab, chip)。
  function cardGroups(host, groups, cards, onPick) {
    host.innerHTML = groups.map((g) => `<section><h2 class="glabel">${g.label}${g.scope ? ` <span>${g.scope}</span>` : ""}</h2>
      <div class="cards">${cards.filter((c) => c.group === g.id).map(cardHtml).join("")}</div></section>`).join("");
    host.addEventListener("click", (e) => {
      const a = e.target.closest(".card");
      if (!a) return;
      e.preventDefault();
      onPick(a.dataset.tab, a.dataset.chip || undefined);
    });
  }

  // タブ。選んだタブは URL の # に残す。
  function tabs(host, defs) {
    host.innerHTML = `<div class="tabs" role="tablist">${defs.map((d) => `<button type="button" role="tab" data-id="${d.id}">
      <b>${d.label}</b>${d.note ? `<span>${d.note}</span>` : ""}</button>`).join("")}</div><div class="panel" role="tabpanel"></div>`;
    const panel = host.querySelector(".panel");
    function open(id, chip) {
      const d = defs.find((x) => x.id === id) || defs[0];
      host.querySelectorAll("[role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === d.id)));
      panel.innerHTML = "";
      d.render(panel, { chip });
      history.replaceState(null, "", "#" + d.id);
    }
    host.querySelector(".tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[role=tab]");
      if (b) open(b.dataset.id);
    });
    open(decodeURIComponent(location.hash.slice(1)));
    return { open };
  }

  const head = (panel, title, scope, aside = "") =>
    panel.insertAdjacentHTML("beforeend", `<header><div><h3>${title}</h3><p class="scope">${scope}</p></div>${aside}</header>`);

  // 絞り込み（文字・状態の区分）と、列見出しでの並べ替えを持つ表。
  function list(panel, spec, preset = {}) {
    const s = { q: "", chip: preset.chip || "all", col: spec.sortCol ?? -1, dir: spec.sortDir || 1 };
    const box = document.createElement("div");
    box.innerHTML = `<div class="fbar">${spec.search ? `<input type="search" placeholder="${spec.search.placeholder}" aria-label="${spec.search.placeholder}">` : ""}
      ${spec.chips ? `<div class="chips" role="group" aria-label="状態の区分"></div>` : ""}<span class="count"></span></div>
      <div class="tbl${spec.scroll ? " scroll" : ""}"><table><thead></thead><tbody></tbody></table></div>${spec.note ? `<p class="note">${spec.note}</p>` : ""}`;
    panel.append(box);
    const $ = (sel) => box.querySelector(sel);
    const cols = spec.columns;

    if (spec.chips) {
      const all = [{ key: "all", label: "すべて" }, ...spec.chips.options];
      $(".chips").innerHTML = all.map((o) => {
        const c = o.key === "all" ? spec.rows.length : spec.rows.filter((r) => spec.chips.of(r) === o.key).length;
        return `<button type="button" data-key="${o.key}">${o.tone ? dot(o.tone, o.label) : o.label}<b>${c}</b></button>`;
      }).join("");
      $(".chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { s.chip = b.dataset.key; draw(); } });
    }
    if (spec.search) $("input").addEventListener("input", (e) => { s.q = e.target.value.trim().toLowerCase(); draw(); });
    $("thead").addEventListener("click", (e) => {
      const th = e.target.closest("th.sortable");
      if (!th) return;
      const i = Number(th.dataset.i);
      s.dir = s.col === i ? -s.dir : cols[i].num ? -1 : 1;
      s.col = i;
      draw();
    });

    const arrow = () => `<span class="ar">${s.dir > 0 ? "▲" : "▼"}</span>`;
    function draw() {
      let rows = spec.rows.filter((r) => (s.chip === "all" || spec.chips.of(r) === s.chip) && (!s.q || spec.search.text(r).toLowerCase().includes(s.q)));
      if (s.col >= 0) {
        const f = cols[s.col].sort;
        rows = [...rows].sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * s.dir; });
      }
      box.querySelectorAll(".chips button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.key === s.chip)));
      $("thead").innerHTML = `<tr>${cols.map((c, i) => `<th class="${[c.num ? "num" : "", c.cls || "", c.sort ? "sortable" : ""].join(" ")}" data-i="${i}"${c.sort ? ` aria-sort="${s.col === i ? (s.dir > 0 ? "ascending" : "descending") : "none"}"` : ""}>` +
        (s.col === i && c.num ? arrow() : "") + c.label + (s.col === i && !c.num ? arrow() : "") + "</th>").join("")}</tr>`;
      $("tbody").innerHTML = rows.length
        ? rows.map((r) => `<tr>${cols.map((c) => `<td class="${[c.num ? "num" : "", c.cls || ""].join(" ")}">${c.cell(r)}</td>`).join("")}</tr>`).join("")
        : `<tr class="empty"><td colspan="${cols.length}">条件に合う行はありません</td></tr>`;
      $(".count").textContent = `${rows.length} / ${spec.rows.length} ${spec.unit || "行"}を表示`;
    }
    draw();
  }

  // --- 小さなグラフ ---
  function spark(vals, hi) {
    const w = 300, h = 50, pad = 4, min = Math.min(...vals), span = Math.max(...vals) - min || 1;
    const x = (i) => (i / (vals.length - 1)) * w, y = (v) => pad + (h - 2 * pad) * (1 - (v - min) / span);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`), cut = vals.length - hi, last = vals.length - 1;
    return `<div class="spark"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="${x(cut - 1)}" width="${w - x(cut - 1)}" height="${h}" fill="var(--faint)"/>
      <polyline points="${pts.slice(0, cut).join(" ")}" fill="none" stroke="var(--muted)" stroke-width="1.3" vector-effect="non-scaling-stroke"/>
      <polyline points="${pts.slice(cut - 1).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(last)}" cy="${y(vals[last])}" r="3" fill="var(--accent)"/></svg></div>`;
  }
  const cap = (...parts) => `<div class="cap">${parts.map((p) => `<span>${p}</span>`).join("")}</div>`;
  const meter = (v, max, color = "var(--accent)") => `<span class="track"><i style="width:${(v / max) * 100}%;background:${color}"></i></span>`;
  // rows: [[label, value, max, valueText, color?]]
  const rows = (list, labelWidth = "1fr") => `<div class="rows" style="--rl:${labelWidth}">` +
    list.map(([l, v, max, t, c]) => `<div><span>${l}</span>${meter(v, max, c)}<span class="v">${t}</span></div>`).join("") + "</div>";
  // parts: [[label, value, color, text?]]
  const stack = (parts) => `<div class="seg">${parts.map(([, v, c]) => `<span style="flex:${v};background:${c}"></span>`).join("")}</div>` +
    `<div class="legend">${parts.map(([l, v, c, t]) => `<span><i class="sw" style="background:${c}"></i>${l} ${t ?? v}</span>`).join("")}</div>`;
  const waffle = (tones) => `<div class="waffle" aria-hidden="true">${tones.map((t) => `<i style="background:${t}"></i>`).join("")}</div>`;

  function bars(vals, labels, w, h, hi) {
    const pad = { t: 16, b: 20 }, max = Math.max(...vals), step = w / vals.length, bw = step * 0.6;
    const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    return `<svg viewBox="0 0 ${w} ${h}">` + vals.map((v, i) => {
      const x = i * step + (step - bw) / 2, fill = i >= vals.length - hi ? "var(--accent)" : "var(--ghost)";
      return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${h - pad.b - y(v)}" rx="1.5" fill="${fill}"/><text x="${x + bw / 2}" y="${y(v) - 4}" text-anchor="middle">${v}</text>` +
        (i % 2 === 1 ? `<text x="${x + bw / 2}" y="${h - 4}" text-anchor="middle">${labels[i]}</text>` : "");
    }).join("") + `<line x1="0" x2="${w}" y1="${h - pad.b}" y2="${h - pad.b}" stroke="var(--rule)"/></svg>`;
  }

  // 要約: lead のある群は says をつなぎ 1 文に、issue のあるカードは状態ごとに 1 文にまとめる。
  function summary(host, groups, cards, onPick) {
    const s1 = groups.filter((g) => g.lead).map((g) => g.lead + cards.filter((c) => c.group === g.id && c.says).map((c) => c.says).join("、") + "。").join("");
    const judged = cards.filter((c) => c.issue);
    const part = (tone, label) => {
      const hit = judged.filter((c) => c.status === tone);
      return hit.length ? `<span class="ls">${dot(tone, label)}</span>${hit.map((c) => `<a href="#${c.tab}" data-tab="${c.tab}" data-chip="${c.chip || ""}">${c.issue}</a>`).join("、")}。` : "";
    };
    const okN = judged.filter((c) => c.status === "ok").length, bad = judged.length - okN;
    const s2 = part("ng", "要対応") + part("warn", "注意") + (bad ? (okN ? `ほかの ${okN} 項目は正常です。` : "") : "確認が必要な項目はありません。");
    host.innerHTML = `<p class="l1">${s1}</p><p class="l2">${s2}</p>`;
    host.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-tab]");
      if (!a) return;
      e.preventDefault();
      onPick(a.dataset.tab, a.dataset.chip || undefined);
    });
  }

  return { summary, SCREENS, n, pct, usd, sign, md, dot, st, nav, cardGroups, tabs, head, list, spark, cap, meter, rows, stack, waffle, bars };
})();
