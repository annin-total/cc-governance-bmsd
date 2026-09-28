(() => {
  const M = window.ROSTER;
  const STATUS = {
    noncompliant: ["未適用あり", "ng"],
    notintro: ["未導入", "warn"],
    stale: ["報告停止", "neutral"],
    ok: ["すべて適用", "ok"],
  };
  const FILTERS = [["all", "すべて"], ["noncompliant"], ["notintro"], ["stale"], ["ok"]];
  const $ = (id) => document.getElementById(id);
  const open = new Set();
  let filter = "all", query = "";

  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, M.rows.filter((r) => r.status === k).length]));
  $("lede").innerHTML = `対象 <b>${M.denominator}</b> 人のうち、${M.items.length} つの設定をすべて適用しているのは <b>${counts.ok}</b> 人。` +
    `<span>未適用のある人 ${counts.noncompliant} 人 · プラグイン未導入 ${counts.notintro} 人 · 報告が止まった人 ${counts.stale} 人</span>`;
  $("scope").textContent = `対象: 利用明細（CSV）の最終日までの 30 日にコストがある利用者 ${M.denominator} 人 · ` +
    `端末は直近 30 日に設定の報告があった ${M.terminalCount} 台`;
  $("foot-note").innerHTML =
    "1 台でも違う値の端末があれば、その利用者は未適用と数えます。このため台数と人数は一致しません。<br>" +
    `報告停止 = 最後の報告から ${M.staleDays} 日以上経った端末。適用の判定は最後の報告の値で行います。<br>` +
    "※ 版: 端末ごとのバージョンは今のサーバでは集計していないため空欄です。分布は下の「バージョンの分布」にあります。";

  // --- 絞り込み ---
  for (const [key, label] of FILTERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.filter = key;
    const n = key === "all" ? M.rows.length : counts[key];
    const tone = STATUS[key]?.[1];
    b.innerHTML = `${tone ? `<i class="st-dot ${tone}"></i>` : ""}${label || STATUS[key][0]}<span>${n}</span>`;
    b.addEventListener("click", () => { filter = key; render(); });
    $("seg").append(b);
  }
  $("q").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); render(); });
  $("toggle-all").addEventListener("click", () => {
    const vis = visible();
    const allOpen = vis.every((r) => open.has(r.email));
    vis.forEach((r) => (allOpen ? open.delete(r.email) : open.add(r.email)));
    render();
  });

  // --- 見出し ---
  const bar = (rate) => `<svg class="mini" viewBox="0 0 64 4" aria-hidden="true"><rect width="64" height="4" fill="var(--hair)"/><rect width="${(rate / 100) * 64}" height="4" fill="var(--accent)"/></svg>`;
  $("thead").innerHTML = `<tr>
    <th class="c-st">状態</th><th class="c-user">利用者</th><th class="c-n">端末</th>
    ${M.items.map((it) => `<th class="c-set" title="${it.key}"><div class="nm">${it.name[0]}<br>${it.name[1]}</div>
      <div class="rt"><b>${it.num}</b> / ${it.den} 人</div>${bar(it.rate)}</th>`).join("")}
    <th class="c-day">最終報告日</th><th class="c-ver">版 ※</th></tr>`;

  // --- 本体 ---
  const mark = (v) => `<span class="mk ${v === null ? "none" : v ? "on" : "off"}" role="img" aria-label="${v === null ? "報告なし" : v ? "適用" : "未適用"}"></span>`;
  const ago = (d) => (d === 0 ? "今日" : `${d} 日前`);
  const [local, domain] = [(e) => e.split("@")[0], (e) => "@" + e.split("@")[1]];

  function visible() {
    return M.rows.filter((r) => (filter === "all" || r.status === filter) &&
      (!query || r.email.toLowerCase().includes(query) || r.terminals.some((t) => t.host.toLowerCase().includes(query))));
  }

  function userRow(r) {
    const [label, tone] = STATUS[r.status];
    const isOpen = open.has(r.email);
    const day = r.last ? `${r.last.dayLabel}<small class="${r.daysAgo >= M.staleDays ? "late" : ""}">${ago(r.daysAgo)}</small>` : `<span class="dim">報告なし</span>`;
    return `<tr class="row ${isOpen ? "open" : ""}" data-user="${r.email}" tabindex="0" aria-expanded="${isOpen}">
      <td class="c-st"><span class="chev" aria-hidden="true"></span><span class="st ${tone}">${r.offCount ? `未適用 ${r.offCount} 項目` : label}</span></td>
      <td class="c-user"><b>${local(r.email)}</b><span class="dom">${domain(r.email)}</span></td>
      <td class="c-n">${r.terminals.length || "—"}</td>
      ${r.on.map((v) => `<td class="c-set">${mark(v)}</td>`).join("")}
      <td class="c-day">${day}</td><td class="c-ver dim">—</td></tr>`;
  }

  function detailRows(r) {
    if (r.notIntroduced) {
      return `<tr class="term msg"><td></td><td colspan="${M.items.length + 5}">
        利用明細（CSV）には直近 30 日のコストがありますが、プラグインからの報告が 1 件もありません。プラグインを入れていないか、別のメールアドレスで送っている可能性があります。</td></tr>`;
    }
    return r.terminals.map((t, i) => `<tr class="term ${i === r.terminals.length - 1 ? "last" : ""}">
      <td class="c-st">${t.stale ? `<span class="st neutral sm">報告停止</span>` : ""}</td>
      <td class="c-user"><span class="host">${t.host}</span></td>
      <td class="c-n"></td>
      ${t.on.map((v, j) => `<td class="c-set">${mark(v)}${j === 0 ? `<span class="val">${t.value ?? "未設定"}</span>` : ""}</td>`).join("")}
      <td class="c-day">${t.dayLabel}<small class="${t.stale ? "late" : ""}">${ago(M.today - t.day)}</small></td>
      <td class="c-ver dim">—</td></tr>`).join("");
  }

  function render() {
    document.querySelectorAll("#seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filter)));
    const vis = visible();
    $("tbody").innerHTML = vis.map((r) => userRow(r) + (open.has(r.email) ? detailRows(r) : "")).join("");
    $("empty").hidden = vis.length > 0;
    $("toggle-all").textContent = vis.length && vis.every((r) => open.has(r.email)) ? "すべて閉じる" : "すべて開く";
  }

  $("tbody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr.row");
    if (!tr) return;
    const u = tr.dataset.user;
    open.has(u) ? open.delete(u) : open.add(u);
    render();
  });
  $("tbody").addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr.row")) {
      e.preventDefault();
      const u = e.target.dataset.user;
      open.has(u) ? open.delete(u) : open.add(u);
      render();
      document.querySelector(`tr.row[data-user="${u}"]`).focus();
    }
  });

  // --- バージョンの分布 ---
  const vblock = (title, rows) => {
    const total = rows.reduce((s, r) => s + r.count, 0);
    const max = Math.max(...rows.map((r) => r.count));
    return `<div><h3>${title}<span>${total} 台</span></h3>${rows.map((r) => `<div class="vrow"><span class="vv">${r.version}</span>
      <svg viewBox="0 0 200 10" class="vbar" aria-hidden="true"><rect width="${(r.count / max) * 200}" height="10" fill="var(--accent-2)"/></svg>
      <span class="vn">${r.count} 台</span></div>`).join("")}</div>`;
  };
  $("versions").innerHTML = vblock("プラグイン", M.pluginVersions) + vblock("Claude Code 本体", M.ccVersions);

  render();
})();
