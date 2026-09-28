"use strict";
// 概況: 上段のカードと下段のタブの定義。項目を足すときは CARDS / TABS に 1 行（1 要素）足す
(() => {
  const C = window.CTX, O = C.overview, H = O.health;
  const { n, pct, usd, signed, md, sum, weekday, mark, hbar, cap, spark, meter, stack, pair, rows } = window.UI;
  const G = window.OVERVIEW_CHARTS;
  const WEEK = C.meta.constants.RECENT_DAYS;

  const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
  const FIELDS = { tool_name: ["ツール名", "ツール実行の記録が分母"], skill_name: ["スキル名", "Skill ツールの実行記録が分母"], context_tokens: ["コンテキストのトークン数", "圧縮直前と応答終了の記録が分母"], command_source: ["コマンドの定義元", "コマンド展開の記録が分母"] };
  const DIST = [
    ["権限モード", O.permission_mode_distribution, { default: ["通常", "操作ごとに許可を求める"], acceptEdits: ["編集を自動承認", "ファイル編集は確認なし"], plan: ["プランモード", "計画だけ立て、変更はしない"], bypassPermissions: ["確認なし", "すべての操作を確認なし"] }],
    ["effort（思考量）", O.effort_level_distribution, { low: ["低"], medium: ["中"], high: ["高"] }],
    ["セッションの開始", O.source_distribution, { startup: ["新規起動"], resume: ["再開", "前のセッションを続けた"], clear: ["クリア後"], compact: ["圧縮後"] }],
  ];
  // 欠けの割合の判定（仮の基準: 20% 超で注意、50% 超で要確認）
  const nullState = (r) => (r > 50 ? ["ng", "要確認"] : r > 20 ? ["warn", "注意"] : ["ok", "正常"]);
  const WARN_SHADES = ["var(--warn)", "var(--warn-2)", "var(--warn-3)"];

  const trend = O.user_session_trend;
  const cost = G.costByDay(O.daily_cost);
  const cNow = sum(cost.days.slice(-WEEK), cost.total), cPrev = sum(cost.days.slice(-2 * WEEK, -WEEK), cost.total);
  const avg = (a) => sum(a) / a.length;
  const sNow = avg(trend.slice(WEEK).map((t) => t.sessions)), sPrev = avg(trend.slice(0, WEEK).map((t) => t.sessions));
  const errTotal = sum(O.error_summary, (e) => e.count);
  const errByStage = [...O.error_summary.reduce((m, e) => m.set(e.stage, (m.get(e.stage) || 0) + e.count), new Map())].sort((a, b) => b[1] - a[1]);
  const nulls = Object.keys(H.recent.null_rates).map((k) => ({ k, r: H.recent.null_rates[k], p: H.prev.null_rates[k] }));
  const worst = nulls.reduce((m, x) => (x.r > m.r ? x : m));
  const modes = O.permission_mode_distribution, modesTotal = sum(modes, (m) => m.count);
  const bypass = modes.find((m) => m.value === "bypassPermissions")?.count ?? 0;
  const tspan = cap(md(trend[0].day_label), "濃い部分が直近 7 日", md(trend.at(-1).day_label));

  const GROUPS = [
    { id: "use", label: "利用", scope: "直近 7 日と、その前の 7 日" },
    { id: "data", label: "データの届き具合", scope: "直近 7 日と、その前の 7 日（照合率は利用明細の最終日までの 7 日）" },
  ];
  const CARDS = [
    { group: "use", tab: "daily", label: "送信した利用者", value: H.recent.terminals, unit: "人", delta: [signed(H.recent.terminals - H.prev.terminals)], sub: `前の 7 日 ${H.prev.terminals} 人`, viz: spark(trend.map((t) => t.users), WEEK) + tspan },
    { group: "use", tab: "daily", label: "1 日あたりのセッション", value: n(sNow, 1), unit: "件", delta: [signed(sNow - sPrev, 1), "up"], sub: `前の 7 日 ${n(sPrev, 1)} 件`, viz: spark(trend.map((t) => t.sessions), WEEK) + tspan },
    { group: "use", tab: "cost", label: "コスト（利用明細）", value: usd(cNow), delta: [`${signed(((cNow - cPrev) / cPrev) * 100, 1)}%`, "up"], sub: `前の 7 日 ${usd(cPrev)}`, viz: spark(cost.days.slice(-28).map(cost.total), WEEK) + cap(md(cost.days.at(-28)), `${md(cost.days.at(-WEEK))}〜${md(cost.days.at(-1))} の合計`, md(cost.days.at(-1))) },
        { group: "use", tab: "modes", label: "確認なしモードの記録", value: n((bypass / modesTotal) * 100, 1), unit: "%", sub: `${n(bypass)} 件 / 全 ${n(modesTotal)} 件`, viz: meter(bypass, modesTotal) + cap(`権限モード「確認なし」の割合 · 4 区分`) },
    { group: "data", tab: "health", label: "受信した記録", value: n(H.recent.events), unit: "件", delta: [signed(H.recent.events - H.prev.events), "up"], sub: `前の 7 日 ${n(H.prev.events)} 件`, viz: pair([["前の 7 日", H.prev.events, H.recent.events, "ghost"], ["直近 7 日", H.recent.events, H.recent.events]]) },
    { group: "data", tab: "health", label: "CSV との照合率", value: n(O.reconciliation_rate, 1), unit: "%", sub: `CSV にもいた ${O.reconciliation_numerator} 人 / 送信した ${O.reconciliation_denominator} 人`, viz: meter(O.reconciliation_numerator, O.reconciliation_denominator) + cap("前との比較なし") },
    { group: "data", tab: "errors", label: "プラグインのエラー", value: errTotal, unit: "件", state: ["warn", "注意"], sub: `${O.error_summary.length} 種類 · 前との比較なし`, viz: stack(errByStage.map(([s, v], i) => [v, STAGE[s] || s, WARN_SHADES[i % 3]])) },
        { group: "data", tab: "health", label: "項目の欠け（最大）", value: n(worst.r, 1), unit: "%", state: nullState(worst.r), sub: `${FIELDS[worst.k][0]} · ${nulls.filter((x) => nullState(x.r)[0] === "ok").length} / ${nulls.length} 項目が正常`, viz: rows(nulls.map((x) => [FIELDS[x.k][0], x.r, 100, `<b class="num">${pct(x.r)}</b>`])) },
  ];

  const period = (i, len) => (i >= len - WEEK ? "直近 7 日" : "前の 7 日");
  const lastCsv = cost.days.length;
  const TABS = [
    { id: "daily", label: "日ごとの利用", hint: `直近 ${trend.length} 日`, title: "日ごとの利用者数とセッション数", scope: `直近 ${trend.length} 日 · 日ごと · 濃い色が直近 7 日`, chart: () => G.trendCharts(trend, WEEK),
      table: () => ({ rows: trend.map((t, i) => ({ ...t, period: period(i, trend.length) })), sort: ["day_label", -1], unit: "日",
        chips: [{ id: "all", label: "すべて", test: () => true }, { id: "recent", label: "直近 7 日", test: (r) => r.period === "直近 7 日" }, { id: "prev", label: "前の 7 日", test: (r) => r.period === "前の 7 日" }],
        cols: [{ key: "day_label", label: "日付", cell: (r) => `${r.day_label}<span class="sub">（${weekday(r.day_label)}）</span>` }, { key: "period", label: "期間", cell: (r) => `<span class="sub">${r.period}</span>` },
          { key: "users", label: "利用者数", num: true, cell: (r) => `${r.users} 人` }, { key: "sessions", label: "セッション数", num: true, cell: (r) => `${r.sessions} 件` },
          { key: "bar", label: "セッション数の比較", sort: false, width: "34%", cell: (r) => hbar(r.sessions, Math.max(...trend.map((t) => t.sessions))) }] }) },
    { id: "cost", label: "日ごとのコスト", hint: "利用明細の全期間", title: "日ごとのコスト", scope: `利用明細（CSV）の全期間 ${cost.days[0]}〜${cost.days.at(-1)} · 日 × 提供元（USD）`, chart: () => G.costChart(cost),
      table: () => ({ rows: cost.days.map((d, i) => ({ day: d, i, ...cost.byDay.get(d), total: cost.total(d) })), sort: ["day", -1], unit: "日", maxHeight: 420,
        search: { placeholder: "日付（例: 09-2）", text: (r) => r.day },
        chips: [{ id: "all", label: "全期間", test: () => true }, { id: "d30", label: "最後の 30 日", test: (r) => r.i >= lastCsv - 30 }, { id: "d7", label: "最後の 7 日", test: (r) => r.i >= lastCsv - WEEK }],
        cols: [{ key: "day", label: "日付", cell: (r) => `${r.day}<span class="sub">（${weekday(r.day)}）</span>` },
          ...G.PROVIDERS.map(([k, l]) => ({ key: k, label: l, num: true, sort: (r) => r[k] || 0, cell: (r) => (r[k] ? usd(r[k]) : `<span class="sub">—</span>`) })),
          { key: "total", label: "合計", num: true, cell: (r) => `<b>${usd(r.total)}</b>` }, { key: "bar", label: "", sort: false, width: "26%", cell: (r) => hbar(r.total, Math.max(...cost.days.map(cost.total))) }] }) },
    { id: "modes", label: "使われ方", hint: "直近 7 日 · 記録", title: "使われ方", scope: "直近 7 日 · 記録の件数（開始のしかたはセッション開始の記録）· 割合は区分の中での割合",
      table: () => {
        const rows = DIST.flatMap(([kind, list, dict]) => { const t = sum(list, (r) => r.count); return list.map((r) => ({ kind, name: dict[r.value]?.[0] ?? r.value, desc: dict[r.value]?.[1] ?? "", count: r.count, share: (r.count / t) * 100 })); });
        return { rows, sort: null, unit: "行",
          chips: [{ id: "all", label: "すべて", test: () => true }, ...DIST.map(([k], i) => ({ id: `k${i}`, label: k, test: (r) => r.kind === k }))],
          cols: [{ key: "kind", label: "区分", cell: (r) => `<span class="sub">${r.kind}</span>` }, { key: "name", label: "値", cell: (r) => `${r.name}${r.desc ? `<span class="sub"> ${r.desc}</span>` : ""}` },
            { key: "count", label: "件数", num: true, cell: (r) => n(r.count) }, { key: "share", label: "割合", num: true, cell: (r) => pct(r.share) }, { key: "bar", label: "", sort: false, width: "26%", cell: (r) => hbar(r.share, 100) }] };
      } },
    { id: "health", label: "受信と項目の欠け", hint: "直近 7 日と前の 7 日", title: "受信と項目の欠け", scope: "直近 7 日と前の 7 日 · 欠けの分母は、その項目が送られるはずの記録", note: "欠けは 20% 以下を正常、20% 超を注意、50% 超を要確認とします（仮の基準）。100% に跳ねたら上流の仕様変更を疑います。",
      table: () => ({ sort: null, unit: "行",
        rows: [
          { kind: "受信", name: "受信した記録", desc: "再送の重複を除く", now: `${n(H.recent.events)} 件`, prev: `${n(H.prev.events)} 件`, diff: signed(H.recent.events - H.prev.events), st: null },
          { kind: "受信", name: "送信した利用者", desc: "", now: `${H.recent.terminals} 人`, prev: `${H.prev.terminals} 人`, diff: signed(H.recent.terminals - H.prev.terminals), st: null },
          { kind: "受信", name: "CSV との照合率", desc: "利用明細の最終日までの 7 日", now: `${pct(O.reconciliation_rate)}<span class="sub"> ${O.reconciliation_numerator} / ${O.reconciliation_denominator} 人</span>`, prev: "—", diff: "—", st: null },
          ...nulls.map((x) => ({ kind: "項目の欠け", name: FIELDS[x.k][0], desc: FIELDS[x.k][1], now: pct(x.r), prev: pct(x.p), diff: `${signed(x.r - x.p, 1)} pt`, st: nullState(x.r) })),
        ],
        chips: [{ id: "all", label: "すべて", test: () => true }, { id: "recv", label: "受信", test: (r) => r.kind === "受信" }, { id: "null", label: "項目の欠け", test: (r) => r.kind === "項目の欠け" }],
        cols: [{ key: "kind", label: "区分", sort: false, cell: (r) => `<span class="sub">${r.kind}</span>` }, { key: "name", label: "項目", sort: false, cell: (r) => `${r.name}${r.desc ? `<span class="sub"> ${r.desc}</span>` : ""}` },
          { key: "now", label: "直近 7 日", num: true, sort: false }, { key: "prev", label: "前の 7 日", num: true, sort: false, cell: (r) => `<span class="sub">${r.prev}</span>` },
          { key: "diff", label: "差", num: true, sort: false }, { key: "st", label: "状態", sort: false, cell: (r) => (r.st ? mark(...r.st) : `<span class="sub">—</span>`) }] }) },
    { id: "errors", label: "プラグインのエラー", hint: `直近 7 日 · ${errTotal} 件`, title: "プラグインのエラー", scope: "直近 7 日 · 端末 = 利用者とホスト名の組 · 失った記録は戻りません",
      table: () => ({ rows: O.error_summary.map((e) => ({ ...e, stageName: STAGE[e.stage] || e.stage })), sort: ["count", -1], unit: "行",
        search: { placeholder: "エラーの種類・版", text: (r) => `${r.error_type} ${r.version} ${r.stageName}` },
        chips: [{ id: "all", label: "すべて", test: () => true }, ...errByStage.map(([s]) => ({ id: s, label: STAGE[s] || s, test: (r) => r.stage === s }))],
        cols: [{ key: "stageName", label: "処理段階", cell: (r) => `${r.stageName}<span class="sub code"> ${r.stage}</span>` }, { key: "error_type", label: "エラーの種類", cell: (r) => `<span class="code">${r.error_type}</span>` },
          { key: "count", label: "件数", num: true }, { key: "terminals", label: "端末数", num: true, cell: (r) => `${r.terminals} 台` }, { key: "version", label: "最後に起きた版", num: true, cell: (r) => `<span class="code">${r.version}</span>` }] }) },
  ];

  window.UI.page({ groups: GROUPS, cards: CARDS, tabs: TABS });
})();
