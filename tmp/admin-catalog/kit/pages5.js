"use strict";
// 案 51 だけが読む区画: データと設定の「組織 CSV」（モック。押しても何も起きない。look.org のときだけ出す）。見せ方は look.oi（OI1〜OI5）。
// 名簿は月ごとに取り込む（F[org][rosters]）。どの月にどの名簿を使うかは F[org][applied]（その月→無ければ前の最新→前が無ければ後の最初）。
(() => {
  const K = window.KIT;
  const { esc, fill } = K;
  const MONTH_FROM_NAME = /(\d{4})[-_]?(\d{2})/; // OI5: ファイル名の年月（例 org_202606.csv）
  const W = {
    title: "組織 CSV", lead: "利用者のメールアドレスを業務メールアドレスに突き合わせ、部と課を引きます。名簿は月ごとに取り込みます",
    file: "組織 CSV", month: "対象の年月", run: "組織 CSV を取り込む",
    note: "同じ年月を取り込むと上書きし、前の分は消します。名簿の無い月は前の最新の名簿を使い、前が無ければ後の最初の名簿を使います。名簿に無い利用者は部署を不明として扱います。",
    guess: "ファイル名に年月（例 org_202606.csv）があれば、対象の年月に入れます。",
    use: "{use:ym} の名簿", own: "この月の名簿", band: "→ {use:ym}", empty: "取り込んだ名簿はありません。",
    pick: "ファイルを選ぶ", legacy_run: "取り込む", legacy_note: "月 1 回の更新。名簿に無い利用者は部署を不明として扱う",
    stats: [["取り込んだ日", "{F[org][imported]:day}"], ["行数", "{F[org][rows]:num} 行"], ["部の数", "{F[org][depts_n]:num}"], ["課の数", "{F[org][sections_n]:num}"],
      ["名簿に無い利用者", "{F[org][unlisted]:num} 人（利用明細の最終日までの 30 日にコストがあった人のうち）"]],
  };
  const NUM = (key, label, unit) => ({ key, kind: "num", label, unit, sort: null });
  const COLS = [{ key: "month", kind: "ym", label: "対象の年月", sort: null }, { key: "file", kind: "code", label: "ファイル", sort: null }, NUM("rows", "行数", "item"),
    NUM("depts_n", "部"), NUM("sections_n", "課"), NUM("unlisted", "名簿に無い利用者", "person"), { key: "imported", kind: "day", label: "取り込んだ日", sort: null },
    { key: "file", kind: "delete_file", label: "", sort: null }];

  const rosters = (ctx) => [...(ctx.F.org.rosters || [])].sort((a, b) => b.month - a.month).map((r) => ({ ...r, source_file: r.file, first: null }));
  const table = (tab, ctx) => K.table.tableHtml(K.table.model(tab, ctx), tab.id, false);
  const form = (guess) => `<form class="upload-form org-form" onsubmit="return false"><label>${esc(W.file)}<input type="file" accept=".csv"${guess ? " data-org-guess" : ""}></label>`
    + `<label>${esc(W.month)}<input type="month" data-org-month></label><button type="submit" class="btn">${esc(W.run)}</button></form>`
    + `<p class="note">${esc(W.note)}${guess ? ` ${esc(W.guess)}` : ""}</p>`;

  // OI1・OI5: 取り込んだ月ごとの行
  const byRoster = (ctx) => table({ id: "org_rosters", rows: "F[org][rosters]", cols: COLS, empty: W.empty, unit: "件", fold: K.C.TABLE_FOLD_ROWS }, { ...ctx, F: { ...ctx.F, org: { ...ctx.F.org, rosters: rosters(ctx) } } });

  // OI4: 直近 12 か月のすべての月の行。名簿の無い月は使う月を薄く示す
  function byMonth(ctx) {
    const have = new Map(ctx.F.org.rosters.map((r) => [r.month, r]));
    const rows = [...ctx.F.org.applied].reverse().map((a) => ({ ...(have.get(a.month) || {}), month: a.month, use: a.use, own: have.has(a.month),
      using: fill(have.has(a.month) ? W.own : W.use, a) }));
    const cols = [COLS[0], { key: "using", kind: "text", label: "使う名簿", sort: null }, ...COLS.slice(1, -1)]; // 削除は名簿のある月だけにあるため、取り込んだ月の表（OI1）で行う
    return table({ id: "org_months", rows: "R", cols, unit: "か月", fold: K.C.TABLE_FOLD_ROWS, rowData: (r) => ({ month: r.month, use: r.use, own: r.own ? "1" : "0" }) }, { ...ctx, R: rows });
  }

  // OI3: 直近 12 か月のマス。名簿のある月を塗り、無い月に使う月を示す
  const band = (ctx) => `<div class="org-band">${ctx.F.org.applied.map((a) => {
    const own = a.use === a.month;
    return `<span class="org-cell${own ? " is-own" : ""}" data-month="${a.month}" data-use="${a.use}"><b>${esc(K.ym(a.month))}</b><span>${esc(own ? W.own : fill(W.band, a))}</span></span>`;
  }).join("")}</div>`;

  // OI2: 取り込みの欄（1 か月分の要約）
  const legacy = (ctx) => `<div class="org-import"><div class="org-actions"><button type="button" class="btn-sub">${esc(W.pick)}</button><button type="button" class="btn">${esc(W.legacy_run)}</button></div>`
    + `<dl class="org-stats">${W.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(fill(v, ctx))}</dd></div>`).join("")}</dl><p class="note">${esc(W.legacy_note)}</p></div>`;

  const TYPES = {
    OI1: (ctx) => form(false) + byRoster(ctx),
    OI2: legacy,
    OI3: (ctx) => form(false) + band(ctx) + byRoster(ctx),
    OI4: (ctx) => form(false) + byMonth(ctx),
    OI5: (ctx) => form(true) + byRoster(ctx),
  };
  K.blocks.org_import = (b, ctx) => `<div class="org-${K.look.get().oi}" data-oi="${K.look.get().oi}">${TYPES[K.look.get().oi](ctx)}</div>`;

  // OI5: ファイルを選ぶと、名前の年月を対象の年月に入れる
  document.addEventListener("change", (e) => {
    if (!e.target.matches("[data-org-guess]") || !e.target.files.length) return;
    const m = MONTH_FROM_NAME.exec(e.target.files[0].name);
    if (m) e.target.closest("form").querySelector("[data-org-month]").value = `${m[1]}-${m[2]}`;
  });

  // 一覧の折りたたみ（fold5.js）: 取り込んだファイル・書き出しの月・サマリーの一覧に、初めに出す行の数を渡す（表ごとに変えられる）
  const FOLDS = { csv_files: K.C.TABLE_FOLD_ROWS, months: K.C.TABLE_FOLD_ROWS, summaries: K.C.TABLE_FOLD_ROWS };
  for (const page of window.CATALOG.sectionPages) {
    for (const b of page.sections.flatMap((s) => s.blocks)) {
      const id = b.tab ? b.tab.id : b.kind;
      if (id in FOLDS) Object.assign(b.tab || b, { fold: FOLDS[id] });
    }
  }

  // 行の多い見本（look.rows が many）: 取り込んだファイル・名簿・サマリーを増やし、折りたたみが見える状態にする。名簿の適用は同じ決まりで数え直す
  const SAMPLE = { files: 14, rosters: 12, summaries: 12 };
  const apply = (months, shown) => shown.map((m) => { const before = months.filter((x) => x <= m); return { month: m, use: before.length ? Math.max(...before) : Math.min(...months.filter((x) => x > m)) }; });
  const monthBack = (day, n) => { const d = new Date(day * 86400000); return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1) / 86400000); };
  K.prepares = [...(K.prepares || []), () => {
    if (K.look.get().rows !== "many" || !K.look.get().org) return;
    const F = window.DATA.fixed, org = F.org, first = Math.min(...org.rosters.map((r) => r.month));
    F.settings.files.files.push(...Array.from({ length: SAMPLE.files }, (_, i) => { const m = monthBack(window.DATA.meta.csv_end, i + 1);
      return { source_file: `cost_${K.ym(m)}.csv`, first: m, last: monthBack(window.DATA.meta.csv_end, i) - 1, bytes: null }; }));
    org.rosters.push(...Array.from({ length: SAMPLE.rosters }, (_, i) => { const m = monthBack(first, i + 1);
      return { ...org.rosters[0], month: m, file: `org_${K.ym(m).replace("-", "")}.csv`, imported: monthBack(m, -1) }; }));
    org.applied = apply(org.rosters.map((r) => r.month), org.applied.map((a) => a.month));
    const s = F.r3.summaries, last = s[s.length - 1];
    s.push(...Array.from({ length: SAMPLE.summaries }, (_, i) => { const asof = last.asof - 7 * (i + 1);
      return { ...last, id: `x${i}`, asof, created: asof, updated: asof, title: K.summary.titleOf(asof) }; }));
  }];

  const settings = window.CATALOG.sectionPages.find((p) => p.id === "settings");
  const at = settings.sections.findIndex((s) => s.id === "import") + 1;
  settings.sections.splice(at, 0, { id: "org", title: W.title, lead: W.lead, org: true, blocks: [{ kind: "org_import" }] });
})();
