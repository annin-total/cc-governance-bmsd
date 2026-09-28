// 概況の定義。指標を 1 つ足す = METRICS に 1 行、一覧を 1 つ足す = TABS に 1 要素。
window.M = (() => {
  const C = window.CTX, O = C.overview, H = O.health, K = window.K;
  const { n, fix, usd, sgn, md, sum, esc, mark, judge } = K;
  const WEEK = 7, COST_SPARK_DAYS = 28;
  const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
  const NULL_ITEMS = [["tool_name", "ツール名", "ツール実行の記録が分母"], ["skill_name", "スキル名", "スキルの実行記録が分母"], ["context_tokens", "コンテキストのトークン数", "圧縮直前と応答終了の記録が分母"], ["command_source", "コマンドの定義元", "コマンド展開の記録が分母"]];
  const DIST = [
    ["権限モード", O.permission_mode_distribution, { default: "通常", acceptEdits: "編集を自動承認", plan: "プランモード", bypassPermissions: "確認なし" }],
    ["effort（思考量）", O.effort_level_distribution, { low: "低", medium: "中", high: "高" }],
    ["セッションの開始", O.source_distribution, { startup: "新規起動", resume: "再開", clear: "クリア後", compact: "圧縮後" }],
  ];

  const trend = O.user_session_trend;
  const byDay = new Map();
  for (const r of O.daily_cost) {
    const d = byDay.get(r.day_label) || { day: r.day_label, bedrock: 0, vertex: 0 };
    d[r.provider === "aws-bedrock" ? "bedrock" : "vertex"] += r.cost;
    byDay.set(r.day_label, d);
  }
  const costDays = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).map((d) => ({ ...d, total: d.bedrock + d.vertex }));
  const cWeek = costDays.slice(-WEEK), cPrevWeek = costDays.slice(-2 * WEEK, -WEEK);
  const cNow = sum(cWeek, (d) => d.total), cPrev = sum(cPrevWeek, (d) => d.total);
  const avg = (a) => sum(a) / a.length;
  const sNow = avg(trend.slice(WEEK).map((t) => t.sessions)), sPrev = avg(trend.slice(0, WEEK).map((t) => t.sessions));
  const errTotal = sum(O.error_summary, (e) => e.count);
  const worstNull = NULL_ITEMS.map(([k, l]) => [l, H.recent.null_rates[k], H.prev.null_rates[k]]).sort((a, b) => b[1] - a[1])[0];
  const pctCh = (a, b) => ((a - b) / b) * 100;
  const tCap = [md(trend[0].day_label), "日ごと", md(trend[trend.length - 1].day_label)];
  const stageSum = [...O.error_summary.reduce((m, e) => m.set(STAGE[e.stage], (m.get(STAGE[e.stage]) || 0) + e.count), new Map())].sort((a, b) => b[1] - a[1]);

  // 指標の定義。rule が状態の判定基準（仮の値。README 参照）
  const METRICS = [
    { id: "users", group: "利用", label: "送信した利用者", value: H.recent.terminals, prev: H.prev.terminals, unit: "人", show: n, diff: "abs",
      scope: "直近 7 日", viz: () => K.spark(trend.map((t) => t.users), WEEK, tCap), rule: { on: "change", bad: "low", warn: -10, ng: -25 }, tab: "trend" },
    { id: "sessions", group: "利用", label: "1 日あたりのセッション", value: sNow, prev: sPrev, unit: "件", show: (v) => fix(v, 1), diff: "abs",
      scope: "直近 7 日の日ごとの平均", viz: () => K.spark(trend.map((t) => t.sessions), WEEK, tCap), rule: { on: "change", bad: "low", warn: -10, ng: -25 }, tab: "trend" },
    { id: "cost", group: "利用", label: "コスト（利用明細）", value: cNow, prev: cPrev, unit: "", show: usd, diff: "pct",
      scope: `${md(cWeek[0].day)}〜${md(cWeek[WEEK - 1].day)}（利用明細の最終日まで）`,
      viz: () => K.spark(costDays.slice(-COST_SPARK_DAYS).map((d) => d.total), WEEK, [md(costDays[costDays.length - COST_SPARK_DAYS].day), "日ごと", md(costDays[costDays.length - 1].day)]),
      rule: { on: "change", bad: "high", warn: 5, ng: 20 }, tab: "cost" },
    { id: "events", group: "データの届き具合", label: "受信した記録", value: H.recent.events, prev: H.prev.events, unit: "件", show: n, diff: "abs",
      scope: "直近 7 日", viz: () => K.bars([["前の 7 日", H.prev.events, n(H.prev.events), "ghost"], ["直近 7 日", H.recent.events, n(H.recent.events)]]),
      rule: { on: "change", bad: "low", warn: -10, ng: -25 }, tab: "health" },
    { id: "recon", group: "データの届き具合", label: "CSV との照合率", value: O.reconciliation_rate, unit: "%", show: (v) => fix(v, 1),
      sub: `CSV にもいた ${O.reconciliation_numerator} 人 / 送信した ${O.reconciliation_denominator} 人`, scope: "利用明細の最終日までの 7 日",
      viz: () => `<div class="viz">${K.meter(O.reconciliation_numerator, O.reconciliation_denominator)}</div>`, rule: { on: "value", bad: "low", warn: 95, ng: 80 }, tab: "health" },
    { id: "errors", group: "データの届き具合", label: "プラグインのエラー", value: errTotal, unit: "件", show: n,
      sub: `${O.error_summary.length} 種類 · 前との比較なし`, scope: "直近 7 日", viz: () => K.stack(stageSum), rule: { on: "value", bad: "high", warn: 0, ng: 20 }, tab: "errors" },
    { id: "nulls", group: "データの届き具合", label: "項目の欠け（最大）", value: worstNull[1], unit: "%", show: (v) => fix(v, 1),
      sub: `${worstNull[0]} · 前の 7 日 ${fix(worstNull[2], 1)}%`, scope: "直近 7 日",
      viz: () => K.bars(NULL_ITEMS.map(([k, l]) => [l, H.recent.null_rates[k], fix(H.recent.null_rates[k], 1) + "%"])), rule: { on: "value", bad: "high", warn: 20, ng: 50 }, tab: "health" },
  ];
  for (const m of METRICS) {
    if (m.prev != null) {
      m.change = pctCh(m.value, m.prev);
      m.delta = m.diff === "pct" ? `${sgn(m.change)}${fix(Math.abs(m.change), 1)}%` : `${sgn(m.value - m.prev)}${m.show(Math.abs(m.value - m.prev))}`;
      m.sub = m.sub || `前の 7 日 ${m.show(m.prev)}${m.unit ? " " + m.unit : ""}`;
    }
    m.tone = judge(m.rule, m);
  }

  // 詳しい一覧の定義
  const nullTone = (r) => (r > 50 ? "ng" : r > 20 ? "warn" : "ok");
  const byId = Object.fromEntries(METRICS.map((m) => [m.id, m]));
  const toneChips = { label: "状態", of: (r) => r.tone, items: [["ng", "要対応", "ng"], ["warn", "注意", "warn"], ["ok", "正常", "ok"]] };
  const healthRows = [
    ...["events", "users", "recon"].map((id) => { const m = byId[id]; return { name: m.label, sub: m.scope, now: m.value, prev: m.prev, fmt: (v) => m.show(v) + (m.unit === "%" ? "%" : " " + m.unit), tone: m.tone, kind: "受信" }; }),
    ...NULL_ITEMS.map(([k, l, s]) => ({ name: l, sub: s, now: H.recent.null_rates[k], prev: H.prev.null_rates[k], fmt: (v) => fix(v, 1) + "%", tone: nullTone(H.recent.null_rates[k]), kind: "欠け" })),
  ];
  const distRows = DIST.flatMap(([cat, list, map], ci) => { const t = sum(list, (r) => r.count); return list.map((r) => ({ cat, ci, name: map[r.value] || r.value, raw: r.value, count: r.count, share: (r.count / t) * 100 })); });
  const tMax = Math.max(...trend.map((t) => t.sessions)), cMax = Math.max(...costDays.map((d) => d.total));
  const recentFrom = trend[WEEK].day_label;

  const TABS = [
    { id: "trend", label: "日ごとの利用", title: "日ごとの利用者数とセッション数", scope: "直近 14 日 · 日", unit: "日",
      rows: trend, text: (r) => r.day_label, sort: ["day", "desc"], placeholder: "日付（例 09-2）",
      chips: { label: "期間", of: (r) => (r.day_label >= recentFrom ? "recent" : "prev"), items: [["recent", "直近 7 日"], ["prev", "前の 7 日"]] },
      cols: [
        { key: "day", label: "日付", render: (r) => r.day_label },
        { key: "users", label: "利用者数", num: true, render: (r) => `${r.users} 人` },
        { key: "sessions", label: "セッション数", num: true, render: (r) => `${r.sessions} 件` },
        { key: "bar", label: "", nosort: true, w: "40%", render: (r) => K.meter(r.sessions, tMax, r.day_label >= recentFrom ? "" : "ghost") },
      ] },
    { id: "cost", label: "日ごとのコスト", title: "日ごとのコスト", scope: "利用明細（CSV）の全期間 · 日 × 提供元（USD）", unit: "日",
      rows: costDays, text: (r) => r.day, sort: ["day", "desc"], placeholder: "日付（例 2026-09）",
      chips: { label: "月", of: (r) => r.day.slice(0, 7), items: [...new Set(costDays.map((d) => d.day.slice(0, 7)))].map((m) => [m, `${+m.slice(5)} 月`]) },
      cols: [
        { key: "day", label: "日付", render: (r) => r.day },
        { key: "bedrock", label: "AWS Bedrock", num: true, render: (r) => (r.bedrock ? usd(r.bedrock) : "—") },
        { key: "vertex", label: "Google Vertex AI", num: true, render: (r) => (r.vertex ? usd(r.vertex) : "—") },
        { key: "total", label: "合計", num: true, render: (r) => `<b>${usd(r.total)}</b>` },
        { key: "bar", label: "", nosort: true, w: "30%", render: (r) => K.meter(r.total, cMax) },
      ] },
    { id: "errors", label: "プラグインのエラー", title: "プラグインのエラー", scope: "直近 7 日 · 端末 = 利用者とホスト名の組", unit: "種類",
      note: "端末側の処理が失敗した記録。失った記録は戻りません。状態は端末数 10 台以上を要対応としています。",
      rows: O.error_summary.map((e) => ({ ...e, stageName: STAGE[e.stage] || e.stage, tone: e.terminals >= 10 ? "ng" : "warn" })),
      text: (r) => `${r.stageName} ${r.stage} ${r.error_type} ${r.version}`, sort: ["count", "desc"], chips: toneChips, placeholder: "処理段階・エラーの種類・版",
      cols: [
        { key: "tone", label: "状態", render: (r) => mark(r.tone), sort: (r) => ({ ng: 2, warn: 1, ok: 0 })[r.tone] },
        { key: "stageName", label: "処理段階", render: (r) => `${r.stageName}<span class="aux code">${r.stage}</span>` },
        { key: "error_type", label: "エラーの種類", cls: "code" },
        { key: "count", label: "件数", num: true, render: (r) => `${r.count} 件` },
        { key: "terminals", label: "端末数", num: true, render: (r) => `${r.terminals} 台` },
        { key: "version", label: "最後に起きた版", num: true, cls: "code" },
      ] },
    { id: "health", label: "受信と項目の欠け", title: "受信と項目の欠け", scope: "直近 7 日と前の 7 日 · 欠けの分母は、その項目が送られるはずの記録", unit: "項目",
      note: "欠けは 20% 以下を正常、20% 超を注意、50% 超を要対応とします。100% に跳ねたら上流の仕様変更を疑います。",
      rows: healthRows, text: (r) => `${r.name} ${r.kind}`, chips: toneChips, placeholder: "項目名",
      cols: [
        { key: "tone", label: "状態", render: (r) => mark(r.tone), sort: (r) => ({ ng: 2, warn: 1, ok: 0 })[r.tone] },
        { key: "kind", label: "区分", cls: "sub" },
        { key: "name", label: "項目", render: (r) => `${r.name}<span class="aux">${r.sub}</span>` },
        { key: "now", label: "直近 7 日", num: true, render: (r) => r.fmt(r.now) },
        { key: "prev", label: "前の 7 日", num: true, render: (r) => (r.prev == null ? "—" : `<span class="sub">${r.fmt(r.prev)}</span>`) },
      ] },
    { id: "usage", label: "使われ方", title: "使われ方", scope: "直近 7 日 · 記録の件数（開始のしかたはセッション開始の記録）", unit: "行",
      rows: distRows, text: (r) => `${r.cat} ${r.name} ${r.raw}`, placeholder: "値（例 プラン）",
      chips: { label: "分類", of: (r) => r.cat, items: DIST.map(([c]) => [c, c]) },
      cols: [
        { key: "ci", label: "分類", render: (r) => r.cat },
        { key: "name", label: "値", render: (r) => `${r.name}<span class="aux code">${esc(r.raw)}</span>` },
        { key: "count", label: "件数", num: true, render: (r) => n(r.count) },
        { key: "share", label: "分類内の割合", num: true, render: (r) => fix(r.share, 1) + "%" },
        { key: "bar", label: "", nosort: true, w: "30%", render: (r) => K.meter(r.share, 50) },
      ] },
  ];
  const errTab = TABS.find((t) => t.id === "errors"), healthTab = TABS.find((t) => t.id === "health");
  errTab.badge = errTab.rows.length; errTab.tone = "ng";
  const hBad = healthRows.filter((r) => r.tone !== "ok").length;
  if (hBad) { healthTab.badge = hBad; healthTab.tone = "warn"; }

  return {
    page: "overview", title: "概況", lead: "全体の利用量と、集計データの健全性",
    period: `直近 7 日（${md(trend[WEEK].day_label)}〜${md(trend[trend.length - 1].day_label)}）と前の 7 日`,
    groups: ["利用", "データの届き具合"], METRICS, TABS,
  };
})();
