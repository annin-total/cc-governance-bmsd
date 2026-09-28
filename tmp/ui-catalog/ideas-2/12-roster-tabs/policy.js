// 設定の適用状況: 上段の要点カードと、下段のタブ（設定ごと・利用者ごと・端末ごと）の定義。
(() => {
  const { pct, st, rows, stack, meter, waffle } = UI;
  const { P, K, items, terminals, roster, count, userDenominator, reportedTerminals } = M;
  // 仮の判定基準（README に記載）
  const rateTone = (r) => (r < 50 ? "ng" : r < 80 ? "warn" : "ok");
  const latestTone = (share) => (share < 0.5 ? "warn" : "ok");
  const USER_ST = { ng: "未適用あり", warn: "未導入", neutral: "報告停止", ok: "すべて適用" };
  const TERM_ST = { ng: "未適用", warn: "未導入", neutral: "報告停止", ok: "適用済み" };
  const TONE_COLOR = { ng: "var(--ng)", warn: "#c89a52", neutral: "var(--ghost)", ok: "var(--accent)" };
  const VER_SHADES = ["var(--accent)", "var(--accent-2)", "var(--ghost)"];

  const uc = (s) => count(roster, s), tc = (s) => count(terminals, s);
  const allOk = uc("ok");
  const staleTerms = terminals.filter((t) => t.stale);
  const names = (list, f) => list.slice(0, 4).map(f).join("<br>") + (list.length > 4 ? `<br>ほか ${list.length - 4}` : "");
  const local = (e) => e.split("@")[0];
  const ago = (d) => (d === 0 ? "今日" : `${d} 日前`);

  const versionCard = (label, list) => {
    const byVer = [...list].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    const total = byVer.reduce((s, v) => s + v.count, 0), latest = byVer[0];
    return { group: "exc", tab: "terms", label, value: latest.version, unit: `が最新`, status: latestTone(latest.count / total),
      statusText: latest.count / total < 0.5 ? "更新の遅れ" : "正常",
      sub: `最新は ${latest.count} / ${total} 台 · 端末ごとに最後の報告`,
      viz: stack(byVer.map((v, i) => [v.version, v.count, VER_SHADES[i % 3], `${v.count} 台`])) };
  };

  const GROUPS = [
    { id: "rate", label: "適用", scope: `直近 ${K.POLICY_DAYS} 日 · 利用者は利用明細（CSV）にコストがある ${userDenominator} 人` },
    { id: "exc", label: "例外と版", scope: `直近 ${K.POLICY_DAYS} 日 · 端末は設定の報告があった ${reportedTerminals} 台` },
  ];
  const CARDS = [
    { group: "rate", tab: "users", chip: "ok", label: "すべての設定を適用した利用者", value: allOk, unit: `/ ${userDenominator} 人`,
      status: rateTone((allOk / userDenominator) * 100), sub: `${items.length} つの設定をすべて適用 · ${pct((allOk / userDenominator) * 100)}`,
      viz: waffle(roster.map((r) => TONE_COLOR[r.status])) + `<div class="legend">${["ok", "ng", "warn", "neutral"].map((k) => `<span><i class="sw" style="background:${TONE_COLOR[k]}"></i>${USER_ST[k]}</span>`).join("")}</div>` },
    { group: "rate", tab: "settings", span: 2, label: "設定ごとの適用率", sub: "適用した利用者 / 対象の利用者。1 台でも違う値の端末があれば未適用",
      viz: rows(items.map((it) => [it.name, it.rate, 100, `${it.num} / ${it.den} 人`, it.rate < 80 ? "var(--warn)" : "var(--accent)"]), "200px") },
    { group: "rate", tab: "users", chip: "ng", label: "未適用のある利用者", value: uc("ng"), unit: "人", status: uc("ng") ? "ng" : "ok",
      sub: `端末では ${tc("ng")} 台`, viz: names(roster.filter((r) => r.status === "ng"), (r) => `${local(r.email)} <span class="sub">${r.offCount} 項目</span>`) },
    { group: "exc", tab: "users", chip: "warn", label: "プラグイン未導入", value: uc("warn"), unit: "人", status: uc("warn") ? "warn" : "ok",
      sub: "CSV にコストがあるのに報告がない", viz: names(roster.filter((r) => r.status === "warn"), (r) => local(r.email)) },
    { group: "exc", tab: "terms", chip: "neutral", label: "報告が止まった端末", value: staleTerms.length, unit: "台", status: staleTerms.length ? "warn" : "ok",
      sub: `最後の報告から ${K.STALE_DAYS} 日以上`, viz: names([...staleTerms].sort((a, b) => b.ago - a.ago), (t) => `${t.host} <span class="sub">${t.ago} 日前</span>`) },
    versionCard("プラグインの版", P.plugin_versions),
    versionCard("Claude Code 本体の版", P.claude_code_versions),
  ];

  const mark = (v) => `<span class="mk ${v === null ? "none" : v ? "on" : "off"}" role="img" aria-label="${v === null ? "報告なし" : v ? "適用" : "未適用"}"></span>`;
  const statusChips = (labels) => ["ng", "warn", "neutral", "ok"].map((k) => ({ key: k, label: labels[k], tone: k }));

  const TABS = [
    { id: "settings", label: "設定ごと", note: `${items.length} 項目`, render(p, pre) {
      UI.head(p, "設定ごとの適用率", `直近 ${K.POLICY_DAYS} 日 · 対象 = 利用明細（CSV）にコストがある利用者 ${userDenominator} 人`);
      UI.list(p, { rows: items, unit: "項目", sortCol: 2, sortDir: 1,
        chips: { of: (r) => rateTone(r.rate), options: [{ key: "warn", label: "80% 未満", tone: "warn" }, { key: "ok", label: "80% 以上", tone: "ok" }] },
        search: { placeholder: "設定名・キー名", text: (r) => r.name + r.key },
        note: "1 台でも違う値の端末があれば、その利用者は未適用と数えます。このため未適用の端末数と人数は一致しません。",
        columns: [
          { label: "設定", cell: (r) => `${r.name}<br><span class="code sub">${r.key}</span>`, sort: (r) => r.name },
          { label: "適用", num: 1, cell: (r) => `${r.num} <span class="sub">/ ${r.den} 人</span>`, sort: (r) => r.num },
          { label: "適用率", num: 1, cell: (r) => pct(r.rate), sort: (r) => r.rate },
          { label: "", cls: "bar-cell", cell: (r) => meter(r.rate, 100, r.rate < 80 ? "var(--warn)" : "var(--accent)") },
          { label: "未適用の端末", num: 1, cell: (r) => `${r.offCount} 台`, sort: (r) => r.offCount },
        ] }, pre);
    } },
    { id: "users", label: "利用者ごと", note: `${roster.length} 人 · 要対応 ${uc("ng") + uc("warn")}`, render(p, pre) {
      UI.head(p, "利用者ごとの適用状況", `直近 ${K.POLICY_DAYS} 日 · 1 人 1 行。複数の端末がある人は、すべての端末で適用して「適用」`,
        `<div class="sub" style="white-space:nowrap">${mark(true)} 適用　${mark(false)} 未適用　${mark(null)} 報告なし</div>`);
      UI.list(p, { rows: roster, unit: "人",
        chips: { of: (r) => r.status, options: statusChips(USER_ST) },
        search: { placeholder: "利用者（例: user004）", text: (r) => r.email },
        columns: [
          { label: "状態", cell: (r) => st(r.status, r.offCount ? `未適用 ${r.offCount} 項目` : USER_ST[r.status]), sort: (r) => ({ ng: 0, warn: 1, neutral: 2, ok: 3 })[r.status] * 10 - r.offCount },
          { label: "利用者", cell: (r) => r.email, sort: (r) => r.email },
          { label: "端末", num: 1, cell: (r) => r.hosts ? `${r.hosts} 台` : "—", sort: (r) => r.hosts },
          ...items.map((it, i) => ({ label: it.short, cls: "mid", cell: (r) => mark(r.on[i]), sort: (r) => (r.on[i] === null ? -1 : Number(r.on[i])) })),
          { label: "最終報告日", num: 1, cell: (r) => r.last ? `${r.last.dayLabel} <span class="sub ${r.last.ago >= K.STALE_DAYS ? "warn" : ""}">${ago(r.last.ago)}</span>` : `<span class="sub">報告なし</span>`, sort: (r) => r.last?.day ?? -1 },
        ] }, pre);
    } },
    { id: "terms", label: "端末ごと", note: `${reportedTerminals} 台＋未導入 ${uc("warn")} 人`, render(p, pre) {
      UI.head(p, "端末ごとの状況", `直近 ${K.POLICY_DAYS} 日に報告した端末 ${reportedTerminals} 台と、プラグイン未導入の利用者 ${uc("warn")} 人（端末名は分からない）`);
      UI.list(p, { rows: terminals, unit: "行", scroll: true,
        chips: { of: (r) => r.status, options: statusChips(TERM_ST) },
        search: { placeholder: "利用者・端末名", text: (r) => r.email + " " + (r.host || "") },
        columns: [
          { label: "状態", cell: (r) => st(r.status, TERM_ST[r.status]), sort: (r) => ({ ng: 0, warn: 1, neutral: 2, ok: 3 })[r.status] },
          { label: "利用者", cell: (r) => r.email, sort: (r) => r.email },
          { label: "端末名", cell: (r) => r.host ? `<span class="code">${r.host}</span>` : `<span class="sub">不明</span>`, sort: (r) => r.host || "" },
          { label: "自動圧縮のしきい値", num: 1, cell: (r) => (r.host ? (r.value ?? `<span class="sub">未設定</span>`) : "—"), sort: (r) => Number(r.value ?? -1) },
          { label: "未適用の設定", cell: (r) => r.offs.length ? `<b class="ng">${r.offs.length}</b> <span class="sub">${r.offs.map((o) => o.short).join("、")}</span>` : `<span class="sub">—</span>`, sort: (r) => r.offs.length },
          { label: "最終報告日", num: 1, cell: (r) => r.day !== null ? `${r.dayLabel} <span class="sub ${r.stale ? "warn" : ""}">${ago(r.ago)}</span>` : `<span class="sub">報告なし</span>`, sort: (r) => r.day ?? -1 },
        ] }, pre);
    } },
  ];

  window.PAGE = { GROUPS, CARDS, TABS };
})();
