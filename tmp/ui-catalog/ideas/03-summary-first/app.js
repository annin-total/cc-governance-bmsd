(() => {
  const C = window.CTX, O = C.overview, H = O.health;
  const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
  const DIST = {
    perm: ["権限モード", { default: "通常", acceptEdits: "編集を自動承認", plan: "プランモード", bypassPermissions: "確認なし" }],
    effort: ["effort（思考量）", { low: "低", medium: "中", high: "高" }],
    source: ["セッションの開始のしかた", { startup: "新規起動", resume: "再開", clear: "クリア後", compact: "圧縮後" }],
  };
  const NULL_ITEMS = [["tool_name", "ツール名", "ツール実行の記録"], ["skill_name", "スキル名", "スキルの実行記録"], ["context_tokens", "コンテキストのトークン数", "圧縮直前と応答終了の記録"], ["command_source", "コマンドの定義元", "コマンド展開の記録"]];
  const PROVIDERS = [["aws-bedrock", "AWS Bedrock"], ["google-vertex", "Google Vertex AI"]];
  const OK_LIMIT = 20;
  const WEEK = 7;

  const $ = (id) => document.getElementById(id);
  const n = (v) => v.toLocaleString("ja-JP");
  const pct = (v) => v.toFixed(1) + "%";
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + n(Math.abs(v));
  const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8)}`;
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const state = (r) => (r > 50 ? ["ng", "要確認"] : r > OK_LIMIT ? ["warn", "注意"] : ["ok", "正常"]);
  const ref = (id, text) => `<a href="#${id}" data-open="${id}">${text}</a>`;

  // 集計
  const trend = O.user_session_trend, recent = trend.slice(WEEK), users = recent.map((t) => t.users);
  const byDay = new Map();
  for (const r of O.daily_cost) {
    const d = byDay.get(r.day_label) || {};
    d[r.provider] = (d[r.provider] || 0) + r.cost;
    byDay.set(r.day_label, d);
  }
  const days = [...byDay.keys()].sort();
  const total = (d) => sum(Object.values(byDay.get(d)), (v) => v);
  const cNow = sum(days.slice(-WEEK), total), cPrev = sum(days.slice(-2 * WEEK, -WEEK), total);
  const bedrockShare = (sum(days.slice(-WEEK), (d) => byDay.get(d)["aws-bedrock"] || 0) / cNow) * 100;
  const errTotal = sum(O.error_summary, (e) => e.count);
  const nullMax = Math.max(...Object.values(H.recent.null_rates));
  const vTotal = sum(O.plugin_versions, (v) => v.count);
  const latest = [...O.plugin_versions].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
  const csvLast = days[days.length - 1];

  $("asof").textContent = `${C.meta.today_label} 時点の要約`;

  const S = [
    ["利用", "", `直近 7 日（${md(recent[0].day_label)}〜${md(recent[WEEK - 1].day_label)}）に ${ref("d-recv", H.recent.terminals + " 人")}が記録を送りました。前の 7 日と${H.recent.terminals === H.prev.terminals ? "同じ人数" : signed(H.recent.terminals - H.prev.terminals) + " 人"}で、1 日あたりでは ${ref("d-trend", Math.min(...users) + "〜" + Math.max(...users) + " 人")}が使っています。`],
    ["コスト", "", `利用明細の最終日 ${md(csvLast)} までの 7 日のコストは ${ref("d-cost", usd(cNow))} で、その前の 7 日より ${ref("d-cost", (((cNow - cPrev) / cPrev) * 100).toFixed(1) + "% " + (cNow >= cPrev ? "増え" : "減り"))}ました。<span class="aside">うち AWS Bedrock が ${pct(bedrockShare)}。</span>`],
    ["エラー", "warn", `プラグインのエラーが ${ref("d-errors", O.error_summary.length + " 種類・" + errTotal + " 件")} 起きています。最新の版 ${latest.version} が届いた端末は ${ref("d-versions", latest.count + " / " + vTotal + " 台")}です。`],
    ["欠けと照合", "", `項目の欠けは${nullMax <= OK_LIMIT ? ` ${ref("d-nulls", "4 項目とも " + OK_LIMIT + "% 以下")}で正常` : `最大 ${ref("d-nulls", pct(nullMax))}`}です。${O.reconciliation_numerator === O.reconciliation_denominator ? `送信した ${O.reconciliation_denominator} 人は ${ref("d-recv", "全員")}が利用明細にも載っています。` : `送信した ${O.reconciliation_denominator} 人のうち、利用明細に載っているのは ${ref("d-recv", O.reconciliation_numerator + " 人")}です。`}`],
  ];
  $("summary").innerHTML = S.map(([topic, cls, text]) => `<li><span class="topic ${cls}">${topic}</span><p class="sentence">${text}</p></li>`).join("");

  // 詳細
  $("t-recv").innerHTML = `<thead><tr><th>項目</th><th class="num">直近 7 日</th><th class="num">前の 7 日との差</th><th>数え方</th></tr></thead><tbody>
    <tr><td>受信した記録</td><td class="num">${n(H.recent.events)} 件</td><td class="num">${signed(H.recent.events - H.prev.events)}</td><td class="sub">再送の重複は除く</td></tr>
    <tr><td>送信した利用者</td><td class="num">${H.recent.terminals} 人</td><td class="num">${signed(H.recent.terminals - H.prev.terminals)}</td><td class="sub">記録を 1 件以上送った人</td></tr>
    <tr><td>CSV との照合率</td><td class="num">${pct(O.reconciliation_rate)}</td><td class="num sub">—</td><td class="sub">CSV にもいた ${O.reconciliation_numerator} 人 / 送信した ${O.reconciliation_denominator} 人</td></tr></tbody>`;

  $("c-errors").textContent = `${O.error_summary.length} 行`;
  $("t-errors").innerHTML = `<thead><tr><th>処理段階</th><th>エラーの種類</th><th class="num">件数</th><th class="num">端末数</th><th class="num">最後に起きた版</th></tr></thead><tbody>`
    + O.error_summary.map((e) => `<tr><td>${STAGE[e.stage] || e.stage}</td><td class="code">${e.error_type}</td><td class="num">${e.count}</td><td class="num">${e.terminals}</td><td class="num">${e.version}</td></tr>`).join("") + `</tbody>`;

  $("t-nulls").innerHTML = `<thead><tr><th>項目</th><th>分母になる記録</th><th class="num">直近 7 日</th><th class="num">前の 7 日</th><th>状態</th></tr></thead><tbody>`
    + NULL_ITEMS.map(([k, name, denom]) => { const r = H.recent.null_rates[k], [c, t] = state(r); return `<tr><td>${name}</td><td class="sub">${denom}</td><td class="num">${pct(r)}</td><td class="num sub">${pct(H.prev.null_rates[k])}</td><td><span class="dot ${c}">${t}</span></td></tr>`; }).join("") + `</tbody>`;

  $("c-versions").textContent = `${O.plugin_versions.length} 版`;
  $("t-versions").innerHTML = `<thead><tr><th>バージョン</th><th class="num">端末数</th><th class="num">割合</th><th></th></tr></thead><tbody>`
    + O.plugin_versions.map((v) => `<tr><td>${v.version}</td><td class="num">${v.count}</td><td class="num sub">${pct((v.count / vTotal) * 100)}</td><td style="width:50%"><span class="bar" style="width:${(v.count / vTotal) * 100}%"></span></td></tr>`).join("")
    + `<tr class="total"><td>計</td><td class="num">${vTotal}</td><td></td><td></td></tr></tbody>`;

  $("c-cost").textContent = `${days.length} 日 · ${days[0]} から`;
  const maxDay = Math.max(...days.map(total));
  $("t-cost").innerHTML = `<thead><tr><th>日付</th>${PROVIDERS.map(([, l]) => `<th class="num">${l}</th>`).join("")}<th class="num">合計</th><th></th></tr></thead><tbody>`
    + [...days].reverse().map((d) => `<tr><td>${d}</td>${PROVIDERS.map(([k]) => `<td class="num">${byDay.get(d)[k] ? usd(byDay.get(d)[k]) : "—"}</td>`).join("")}<td class="num"><b>${usd(total(d))}</b></td><td style="width:30%"><span class="bar" style="width:${(total(d) / maxDay) * 100}%"></span></td></tr>`).join("") + `</tbody>`;

  $("t-trend").innerHTML = `<thead><tr><th>日付</th><th class="num">利用者数</th><th class="num">セッション数</th><th></th></tr></thead><tbody>`
    + [...trend].reverse().map((t, i) => `<tr${i === WEEK - 1 ? ' style="border-bottom:2px solid var(--ink-2)"' : ""}><td>${t.day_label}${i < WEEK ? "" : ' <span class="sub">前の 7 日</span>'}</td><td class="num">${t.users}</td><td class="num">${t.sessions}</td><td></td></tr>`).join("") + `</tbody>`;

  $("usage").innerHTML = [["perm", O.permission_mode_distribution], ["effort", O.effort_level_distribution], ["source", O.source_distribution]].map(([k, list]) => {
    const [title, map] = DIST[k], t = sum(list, (r) => r.count);
    return `<div><h3>${title}</h3><table><thead><tr><th>値</th><th class="num">件数</th><th class="num">割合</th></tr></thead><tbody>`
      + list.map((r) => `<tr><td>${map[r.value] || r.value}</td><td class="num">${n(r.count)}</td><td class="num sub">${pct((r.count / t) * 100)}</td></tr>`).join("")
      + `<tr class="total"><td>計</td><td class="num">${n(t)}</td><td></td></tr></tbody></table></div>`;
  }).join("");

  // 操作
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-open]");
    if (a) {
      const d = $(a.dataset.open);
      d.open = true;
      d.classList.remove("flash"); void d.offsetWidth; d.classList.add("flash");
    }
    const t = ev.target.closest("[data-toggle]");
    if (t) document.querySelectorAll(".details details").forEach((d) => { d.open = t.dataset.toggle === "open"; });
  });
})();
