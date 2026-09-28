(() => {
  const C = window.CTX;
  const O = C.overview;
  const LABEL = {
    stage: { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" },
    perm: { default: "通常", acceptEdits: "編集を自動承認", plan: "プランモード", bypassPermissions: "確認なし" },
    effort: { low: "低", medium: "中", high: "高" },
    source: { startup: "新規起動", resume: "再開", clear: "クリア後", compact: "圧縮後" },
  };
  const NULL_ITEMS = [
    ["tool_name", "ツール名", "ツール実行の記録"],
    ["skill_name", "スキル名", "スキルの実行記録"],
    ["context_tokens", "コンテキストのトークン数", "圧縮直前と応答終了の記録"],
    ["command_source", "コマンドの定義元", "コマンド展開の記録"],
  ];
  const TREND_SPLIT = 7;
  const COST_SHOWN = 14;

  const $ = (id) => document.getElementById(id);
  const n = (v) => v.toLocaleString("ja-JP");
  const pct = (v) => v.toFixed(1) + "%";
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + n(Math.abs(v));
  const md = (label) => label.slice(5).replace("-", "/");
  const state = (r) => (r > 50 ? ["ng", "要確認"] : r > 20 ? ["warn", "注意"] : ["ok", "正常"]);
  const rows = (el, list) => { el.innerHTML = list.join(""); };

  $("asof").textContent = `${C.meta.today_label} 時点`;

  const H = O.health;
  const csvLast = O.daily_cost[O.daily_cost.length - 1].day_label;
  $("csv-last").textContent = csvLast;
  rows($("t-health"), [
    `<tr><td>受信した記録</td><td class="num fig">${n(H.recent.events)}<span class="unit">件</span></td><td class="num">${signed(H.recent.events - H.prev.events)}</td><td class="sub">再送の重複は除く</td></tr>`,
    `<tr><td>送信した利用者</td><td class="num fig">${n(H.recent.terminals)}<span class="unit">人</span></td><td class="num delta zero">${signed(H.recent.terminals - H.prev.terminals)}</td><td class="sub">記録を 1 件以上送った人</td></tr>`,
    `<tr><td>CSV との照合率<span class="mark"> *</span></td><td class="num fig">${O.reconciliation_rate.toFixed(1)}<span class="unit">%</span></td><td class="num sub">—</td><td class="sub">CSV にもいた ${O.reconciliation_numerator} 人 / 送信した ${O.reconciliation_denominator} 人</td></tr>`,
  ]);

  rows($("t-errors"), O.error_summary.map((e) =>
    `<tr><td>${LABEL.stage[e.stage] || e.stage}</td><td class="code">${e.error_type}</td><td class="num">${n(e.count)}</td><td class="num">${n(e.terminals)}</td><td>${e.version}</td></tr>`));

  rows($("t-nulls"), NULL_ITEMS.map(([k, name, denom]) => {
    const r = H.recent.null_rates[k], p = H.prev.null_rates[k];
    const [cls, txt] = state(r);
    return `<tr><td>${name}</td><td class="sub">${denom}</td><td class="num">${pct(r)}</td><td class="num sub">${pct(p)}</td><td><span class="state ${cls}">${txt}</span></td></tr>`;
  }));

  const vTotal = O.plugin_versions.reduce((s, v) => s + v.count, 0);
  rows($("t-versions"), [
    ...O.plugin_versions.map((v) => `<tr><td>${v.version}</td><td class="num">${n(v.count)}</td><td class="num sub">${pct((v.count / vTotal) * 100)}</td></tr>`),
    `<tr class="total"><td>計</td><td class="num">${n(vTotal)}</td><td class="num sub"></td></tr>`,
  ]);

  const byDay = new Map();
  for (const r of O.daily_cost) {
    const d = byDay.get(r.day_label) || { "aws-bedrock": 0, "google-vertex": 0 };
    d[r.provider] = (d[r.provider] || 0) + r.cost;
    byDay.set(r.day_label, d);
  }
  const days = [...byDay.keys()].sort().reverse();
  const costRow = (day) => {
    const d = byDay.get(day), a = d["aws-bedrock"], g = d["google-vertex"];
    return `<tr><td>${day}</td><td class="num">${a ? usd(a) : "—"}</td><td class="num">${g ? usd(g) : "—"}</td><td class="num">${usd(a + g)}</td></tr>`;
  };
  rows($("t-cost"), days.slice(0, COST_SHOWN).map(costRow));
  rows($("t-cost-rest"), days.slice(COST_SHOWN).map(costRow));
  $("cost-more-label").textContent = `それより前の ${days.length - COST_SHOWN} 日（${days[days.length - 1]} から）を表示`;

  const trend = O.user_session_trend;
  const block = (title, list) => `
    <table class="ledger"><caption>${title}</caption>
      <thead><tr><th>日付</th><th class="num">利用者数</th><th class="num">セッション数</th></tr></thead>
      <tbody>${list.map((t) => `<tr><td>${t.day_label}</td><td class="num">${t.users}</td><td class="num">${t.sessions}</td></tr>`).join("")}</tbody>
    </table>`;
  const prev = trend.slice(0, TREND_SPLIT), recent = trend.slice(TREND_SPLIT);
  $("trend-pair").innerHTML =
    block(`前の 7 日（${md(prev[0].day_label)}〜${md(prev[prev.length - 1].day_label)}）`, prev) +
    block(`直近 7 日（${md(recent[0].day_label)}〜${md(recent[recent.length - 1].day_label)}）`, recent);

  const dist = (el, list, map) => {
    const total = list.reduce((s, r) => s + r.count, 0);
    rows(el, [
      ...list.map((r) => `<tr><td>${map[r.value] || r.value}</td><td class="num">${n(r.count)}</td><td class="num sub">${pct((r.count / total) * 100)}</td></tr>`),
      `<tr class="total"><td>計</td><td class="num">${n(total)}</td><td class="num sub"></td></tr>`,
    ]);
  };
  dist($("t-perm"), O.permission_mode_distribution, LABEL.perm);
  dist($("t-effort"), O.effort_level_distribution, LABEL.effort);
  dist($("t-source"), O.source_distribution, LABEL.source);
})();
