// 06 共通の絞り込みバー: 画面上部の 1 本のバー（期間・文字・状態）が、カードと一覧の両方にかかる。
(() => {
  const M = window.M, K = window.K, app = document.getElementById("app");
  const POLICY = M.page === "policy";
  const g = { q: "", tone: "all" };

  // 状態の区分: 概況は指標の状態、設定の適用状況は利用者の状態
  const STATES = POLICY ? Object.entries(M.STATUS).map(([k, [l, t]]) => [k, l, t]) : [["ng", "要対応", "ng"], ["warn", "注意", "warn"], ["ok", "正常", "ok"]];
  const PLACEHOLDER = POLICY ? "利用者・端末名（例 user00）" : "項目名・日付など";
  const hit = (text) => !g.q || text.toLowerCase().includes(g.q.toLowerCase());

  // 文字だけで絞った集合（状態の区分の件数に使う）と、状態も含めて絞った集合
  const byText = () => (POLICY ? M.rows.filter((u) => hit(`${u.email} ${u.hosts}`)) : M.METRICS.filter((m) => hit(m.label)));
  const stateOf = (x) => (POLICY ? x.status : x.tone);
  const picked = () => byText().filter((x) => g.tone === "all" || stateOf(x) === g.tone);
  const users = () => (POLICY ? picked() : []);
  const metrics = () => (POLICY ? M.calc(users()) : picked());

  // 一覧に共通バーの条件をかける。状態の区分チップはバーに一本化する
  function derive(t) {
    const d = { ...t, total: t.rows.length, chips: t.chips && t.chips.label !== "状態" ? t.chips : null };
    if (POLICY) {
      if (t.id === "users") d.rows = users();
      else if (t.id === "settings") d.rows = M.settingRows(users());
    } else {
      d.rows = t.rows.filter((r) => hit(t.text(r)) && (g.tone === "all" || r.tone === undefined || r.tone === g.tone));
    }
    return d;
  }
  function aside(t) {
    const off = POLICY ? t.id === "versions" : g.tone !== "all" && t.rows[0]?.tone === undefined;
    const why = POLICY ? "端末ごとの集計のため、バーの条件はこの一覧にかかりません" : "この一覧には状態がないため、状態の条件はかかりません";
    const calc = POLICY && t.id === "settings" && filtered() ? `<span class="aside">絞り込んだ ${users().length} 人で計算</span>` : "";
    return off && filtered() ? `<span class="aside">${why}</span>` : calc;
  }
  const filtered = () => g.q || g.tone !== "all";

  const csv = POLICY ? "" : `<button type="button" class="btn quiet">利用明細（CSV）を取り込む</button>`;
  app.innerHTML = K.head(M, csv).replace(/<span class="period">.*?<\/span>/, "")
    + `<div class="gbar" role="search" aria-label="この画面の絞り込み">
        <div class="g-item"><span class="g-lbl">期間</span><span class="g-period">${M.period}</span></div>
        <label class="g-item"><span class="g-lbl">${POLICY ? "利用者" : "文字"}</span><input type="search" placeholder="${PLACEHOLDER}"></label>
        <div class="g-item"><span class="g-lbl">状態</span><div class="seg g-states"></div></div>
        <div class="g-end"><span class="g-count"></span><button type="button" class="g-reset" hidden>解除</button></div>
      </div>
      <div id="groups"></div><section class="detail" id="detail"><div id="tabs"></div></section>`;

  const bar = app.querySelector(".gbar");
  const det = K.details(document.getElementById("tabs"), M, { derive, aside, search: false });
  function draw() {
    const ms = metrics(), all = M.METRICS.length, base = byText();
    const cnt = (k) => (k === "all" ? base.length : base.filter((x) => stateOf(x) === k).length);
    bar.querySelector(".g-states").innerHTML = [["all", "すべて"], ...STATES].map(([k, l, t]) => `<button type="button" data-tone="${k}" aria-pressed="${g.tone === k}">${t ? `<b class="dot ${t}"></b>` : ""}${l}<span class="c">${cnt(k)}</span></button>`).join("");
    bar.querySelector(".g-count").innerHTML = POLICY ? `<b>${users().length}</b> / ${M.rows.length} 人` : `カード <b>${ms.length}</b> / ${all}`;
    if (POLICY) {
      M.TABS[0].badge = users().filter((u) => u.status !== "ok").length || null;
      M.TABS[1].badge = M.settingRows(users()).filter((r) => r.tone !== "ok").length || null;
    }
    bar.querySelector(".g-reset").hidden = !filtered();
    const note = POLICY && filtered() ? `<span>絞り込んだ ${users().length} 人で計算</span>` : !POLICY && ms.length < all ? `<span>条件に合わない ${all - ms.length} 枚を隠しています</span>` : "";
    document.getElementById("groups").innerHTML = M.groups.map((gr) => {
      const list = ms.filter((m) => m.group === gr);
      return list.length ? `<section class="kgroup"><h2 class="glabel">${gr}${note}</h2><div class="cards">${list.map((m) => K.card(m)).join("")}</div></section>` : "";
    }).join("") || `<p class="empty-cards">条件に合う指標はありません</p>`;
    det.redraw();
  }
  bar.addEventListener("input", (e) => { g.q = e.target.value; draw(); });
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tone]");
    if (b) { g.tone = b.dataset.tone; draw(); }
    if (e.target.closest(".g-reset")) { g.q = ""; g.tone = "all"; bar.querySelector("input").value = ""; draw(); }
  });
  document.getElementById("groups").addEventListener("click", (e) => {
    const c = e.target.closest("[data-metric]");
    if (!c) return;
    const m = metrics().find((x) => x.id === c.dataset.metric);
    det.open(m.tab, { pin: m.pin || null });
    document.getElementById("detail").scrollIntoView({ behavior: "smooth" });
  });
  draw();
})();
