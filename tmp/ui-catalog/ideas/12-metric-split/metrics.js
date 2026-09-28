// 指標の定義。一覧に出す値と、詳細に出す中身を 1 か所にまとめる。
window.METRICS = (() => {
  const C = window.CTX, O = C.overview, { nf, hbars, dots, dumbbell, stacked, line } = window.Charts;
  const R = O.health.recent, P = O.health.prev;
  const sign = (d, digits = 0) => (d > 0 ? "+" : d < 0 ? "−" : "±") + nf(Math.abs(d), digits);
  const usd = (v) => "$" + nf(v);
  const PERIOD7 = "直近 7 日（前の 7 日と比べる）";

  const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
  const FIELD = { tool_name: ["ツール名", "ツール実行の記録"], skill_name: ["スキル名", "Skill ツールの実行記録"], context_tokens: ["コンテキストのトークン数", "圧縮直前と応答終了の記録"], command_source: ["コマンドの定義元", "コマンド展開の記録"] };
  const PERM = { default: "通常", acceptEdits: "編集を自動承認", plan: "プランモード", bypassPermissions: "確認なし" };
  const EFFORT = { low: "低", medium: "中", high: "高" };
  const SOURCE = { startup: "新規起動", resume: "再開", clear: "クリア後", compact: "圧縮後" };
  const PROVIDER = { "aws-bedrock": ["AWS Bedrock", "var(--accent)"], "google-vertex": ["Google Vertex AI", "var(--accent-2)"] };

  const table = (head, rows) => {
    const t = document.createElement("table");
    t.innerHTML = `<thead><tr>${head.map(([h, n]) => `<th class="${n ? "n" : ""}">${h}</th>`).join("")}</tr></thead>` +
      `<tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${head[i][1] ? "n" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return t;
  };

  // --- コストの集計 ---
  const byDay = new Map();
  for (const r of O.daily_cost) {
    if (!byDay.has(r.day_label)) byDay.set(r.day_label, {});
    byDay.get(r.day_label)[r.provider] = r.cost;
  }
  const days = [...byDay.keys()].sort().map((label) => ({ label, parts: byDay.get(label) }));
  const dayTotal = (d) => Object.values(d.parts).reduce((a, b) => a + b, 0);
  const last7 = days.slice(-7), prev7 = days.slice(-14, -7);
  const sum = (ds, key) => ds.reduce((s, d) => s + (key ? d.parts[key] || 0 : dayTotal(d)), 0);
  const costR = sum(last7), costP = sum(prev7);
  const csvLast = days[days.length - 1].label;

  // --- 分布の共通処理 ---
  const dist = (rows, names) => {
    const total = rows.reduce((s, r) => s + r.count, 0);
    const sorted = [...rows].sort((a, b) => b.count - a.count);
    return { total, top: sorted[0], rows: sorted.map((r) => ({ ...r, name: names[r.value] || r.value, share: (r.count / total) * 100 })) };
  };
  const distMetric = (id, name, rows, names, q, explain, unit = "記録") => {
    const d = dist(rows, names);
    return {
      id, group: "use", name,
      list: `${d.rows[0].name} <small>${nf(d.rows[0].share, 0)}%</small>`,
      state: "neutral",
      detail: () => ({
        q, scope: [["期間", "直近 7 日"], ["母集団", `${unit} ${nf(d.total)} 件`]],
        hero: { big: d.rows[0].name, word: true, unit: `${nf(d.rows[0].share, 1)}%`, frac: `最も多い値 · ${nf(d.top.count)} / ${nf(d.total)} 件` },
        blocks: [{ h: "値ごとの件数", sub: `全 ${nf(d.total)} 件`, node: hbars(d.rows.map((r) => ({ label: r.name, value: r.count, text: `${nf(r.count)} 件 · ${nf(r.share, 1)}%` })), { max: d.rows[0].count }) }],
        explain,
      }),
    };
  };

  const errTotal = O.error_summary.reduce((s, r) => s + r.count, 0);
  const nullRows = Object.keys(FIELD).map((k) => ({ key: k, label: FIELD[k][0], recent: R.null_rates[k], prev: P.null_rates[k] }));
  const nullMax = nullRows.reduce((m, r) => (r.recent > m.recent ? r : m));
  const nullState = (v) => (v > 50 ? "ng" : v > 20 ? "warn" : "ok");
  const trend = O.user_session_trend;
  const avg = (k, rows) => rows.reduce((s, r) => s + r[k], 0) / rows.length;

  const list = [
    {
      id: "events", group: "health", name: "受信した記録",
      list: `${nf(R.events)}<small>件</small>`, state: "ok",
      detail: () => ({
        q: "プラグインからの記録は途切れずに届いているか。",
        scope: [["期間", PERIOD7], ["数え方", "記録ごとに 1 件。再送の重複は除く"]],
        hero: { big: nf(R.events), unit: "件", cmp: `前の 7 日 ${nf(P.events)} 件`, d: sign(R.events - P.events) + ` 件（${sign(((R.events - P.events) / P.events) * 100, 1)}%）` },
        blocks: [{ h: "前の 7 日との比較", node: hbars([
          { label: "前の 7 日", value: P.events, text: `${nf(P.events)} 件`, color: "var(--accent-2)" },
          { label: "直近 7 日", value: R.events, text: `${nf(R.events)} 件` }]) }],
        explain: ["件数が急に減ったときは、収集の停止か上流の仕様変更を疑います。", "日ごとの件数は今のサーバでは集計していません。"],
      }),
    },
    {
      id: "senders", group: "health", name: "送信した利用者",
      list: `${nf(R.terminals)}<small>人</small>`, state: "ok",
      detail: () => ({
        q: "記録を送ってきた利用者は何人か。",
        scope: [["期間", PERIOD7], ["数え方", "メールアドレスごとに 1 人（端末の数ではない）"]],
        hero: { big: nf(R.terminals), unit: "人", cmp: `前の 7 日 ${nf(P.terminals)} 人`, d: sign(R.terminals - P.terminals) + " 人" },
        blocks: [{ h: "前の 7 日との比較", node: hbars([
          { label: "前の 7 日", value: P.terminals, text: `${P.terminals} 人`, color: "var(--accent-2)" },
          { label: "直近 7 日", value: R.terminals, text: `${R.terminals} 人` }]) }],
        explain: ["日ごとの人数は「日ごとの利用者とセッション」で見られます。1 人が複数の端末から送っても 1 人と数えます。"],
      }),
    },
    {
      id: "recon", group: "health", name: "CSV との照合率",
      list: `${nf(O.reconciliation_rate, 0)}<small>%</small>`, state: O.reconciliation_rate >= 95 ? "ok" : "warn",
      detail: () => ({
        q: "記録を送った利用者は、全社の利用明細（CSV）にも名前があるか。",
        scope: [["期間", `CSV の最終日（${csvLast}）までの 7 日`], ["母集団", "その期間に記録を送った利用者"]],
        hero: { big: nf(O.reconciliation_rate, 0), unit: "%", frac: `CSV にもいた ${O.reconciliation_numerator} 人 / 送信した ${O.reconciliation_denominator} 人` },
        blocks: [{ h: "1 人を 1 つの点で表示", sub: "塗り = CSV にも名前がある", node: dots(O.reconciliation_numerator, O.reconciliation_denominator) }],
        explain: ["下がったときは、端末が送るメールアドレスと CSV のアドレスの不一致を疑います。", "前の期間との比較はありません。"],
      }),
    },
    {
      id: "errors", group: "health", name: "プラグインのエラー",
      list: `${nf(errTotal)}<small>件</small>`, state: errTotal ? "warn" : "ok",
      detail: () => ({
        q: "端末側の処理は、どこで・何台で失敗しているか。",
        scope: [["期間", "直近 7 日"], ["数え方", "端末 = 利用者とホスト名の組"]],
        hero: { big: nf(errTotal), unit: "件", frac: `${O.error_summary.length} 種類 · 失ったイベントは戻りません`, state: ["warn", "要確認"] },
        blocks: [
          { h: "処理段階とエラーの種類ごとの件数", node: hbars(O.error_summary.map((r) => ({ label: `${STAGE[r.stage] || r.stage} · ${r.error_type}`, value: r.count, text: `${r.count} 件` })), { labelW: 290 }) },
          { h: "内訳", node: table([["処理段階"], ["エラーの種類"], ["件数", 1], ["端末数", 1], ["最後に起きた版", 1]],
            O.error_summary.map((r) => [STAGE[r.stage] || r.stage, `<code>${r.error_type}</code>`, r.count, r.terminals, r.version])) },
        ],
        explain: ["エラーの種類は原因の手がかりなので英語のまま表示しています。", "「最後に起きた版」は、その失敗の最も新しい記録を送ったプラグインのバージョンです。"],
      }),
    },
    {
      id: "nulls", group: "health", name: "項目の欠け（最大）",
      list: `${nf(nullMax.recent, 1)}<small>%</small>`, state: nullState(nullMax.recent),
      detail: () => ({
        q: "上流の仕様変更で、送られるはずの項目が消えていないか。",
        scope: [["期間", PERIOD7], ["分母", "その項目が送られるはずの記録"]],
        hero: { big: nf(nullMax.recent, 1), unit: "%", frac: `最も欠けが多い項目: ${nullMax.label}`, state: ["ok", "正常"] },
        blocks: [
          { h: "項目ごとの欠けの割合", sub: "○ 前の 7 日 → ● 直近 7 日", node: dumbbell(nullRows, { bands: [{ at: 20, label: "注意 20%", color: "var(--warn)" }, { at: 50, label: "要確認 50%", color: "var(--ng)" }] }) },
          { h: "内訳", node: table([["項目"], ["分母になる記録"], ["前の 7 日", 1], ["直近 7 日", 1]],
            nullRows.map((r) => [r.label, `<span style="color:var(--muted)">${FIELD[r.key][1]}</span>`, nf(r.prev, 1) + "%", `<b>${nf(r.recent, 1)}%</b>`])) },
        ],
        explain: ["20% 以下を正常、20% 超を注意、50% 超を要確認とします。", "100% に跳ねたときは、上流の仕様変更で項目が送られなくなった可能性が高いです。"],
      }),
    },
    {
      id: "cost", group: "use", name: "コスト（直近 7 日）",
      list: `${usd(costR)}`, state: "neutral",
      detail: () => ({
        q: "いつ・どの提供元でいくらかかったか。",
        scope: [["期間", `CSV の全期間（${days[0].label} 〜 ${csvLast}）`], ["出どころ", "全社の利用明細（CSV）"]],
        hero: { big: usd(costR), unit: "USD", cmp: `前の 7 日 ${usd(costP)}`, d: sign(((costR - costP) / costP) * 100, 1) + "%", frac: `CSV の最終日 ${csvLast} までの 7 日` },
        blocks: [
          { h: "日ごとのコスト", sub: "提供元ごとに積み上げ", legend: Object.values(PROVIDER), node: stacked(days, Object.entries(PROVIDER).map(([key, [, color]]) => ({ key, color })), { highlightFrom: days.length - 7 }) },
          { h: "提供元ごとの合計", node: table([["提供元"], ["直近 7 日", 1], ["前の 7 日", 1], ["全期間", 1]],
            Object.entries(PROVIDER).map(([k, [name]]) => [name, usd(sum(last7, k)), usd(sum(prev7, k)), usd(sum(days, k))]).concat([["<b>合計</b>", `<b>${usd(costR)}</b>`, usd(costP), usd(sum(days))]])) },
        ],
        explain: ["コストは CSV の値が正です。CSV は 1〜2 週ごとに取り込むため、最終日は今日より前になります。"],
      }),
    },
    {
      id: "trend", group: "use", name: "日ごとの利用者とセッション",
      list: `${nf(avg("users", trend.slice(-7)), 1)}<small>人/日</small>`, state: "neutral",
      detail: () => ({
        q: "毎日何人が、何セッション使っているか。",
        scope: [["期間", "直近 14 日"], ["数え方", "その日に記録を送った利用者 / セッション ID の数"]],
        hero: { big: nf(avg("users", trend.slice(-7)), 1), unit: "人/日", cmp: `セッション ${nf(avg("sessions", trend.slice(-7)), 1)} 回/日`, frac: "直近 7 日の平均" },
        blocks: [
          { h: "利用者数", node: line(trend.map((r) => ({ label: r.day_label, v: r.users })), { ticks: [10, 20, 30] }) },
          { h: "セッション数", node: line(trend.map((r) => ({ label: r.day_label, v: r.sessions })), { ticks: [20, 40, 60], color: "var(--ink2)" }) },
        ],
        explain: ["今日（" + C.meta.today_label + "）は集計の途中です。"],
      }),
    },
    distMetric("perm", "権限モード", O.permission_mode_distribution, PERM, "どの権限モードで使われているか。",
      ["「確認なし」はすべての操作を確認なしで行うモードです。", "記録の件数で数えています（人数ではありません）。"]),
    distMetric("effort", "effort（思考量）", O.effort_level_distribution, EFFORT, "どの effort の設定で使われているか。", ["記録の件数で数えています（人数ではありません）。"]),
    distMetric("source", "セッションの始まり方", O.source_distribution, SOURCE, "セッションはどう始まっているか。",
      ["「再開」は --resume などで前のセッションを続けたもの、「圧縮後」は圧縮の後に始まったものです。"], "セッション開始の記録"),
  ];
  return { list, groups: { health: "データの届き具合", use: "利用の実態" }, csvLast };
})();
