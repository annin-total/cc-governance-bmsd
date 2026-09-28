(() => {
  const C = window.CTX, O = C.overview, H = O.health;
  const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
  const DIST = [
    ["権限モード", O.permission_mode_distribution, { default: "通常", acceptEdits: "編集を自動承認", plan: "プランモード", bypassPermissions: "確認なし" }],
    ["effort（思考量）", O.effort_level_distribution, { low: "低", medium: "中", high: "高" }],
    ["セッションの開始のしかた", O.source_distribution, { startup: "新規起動", resume: "再開", clear: "クリア後", compact: "圧縮後" }],
  ];
  const NULL_ITEMS = [["tool_name", "ツール名"], ["skill_name", "スキル名"], ["context_tokens", "コンテキストのトークン数"], ["command_source", "コマンドの定義元"]];
  const PROVIDERS = [["aws-bedrock", "AWS Bedrock", "var(--accent)"], ["google-vertex", "Google Vertex AI", "var(--accent-2)"]];
  const WEEK = 7;
  const COST_SPARK_DAYS = 28;

  const $ = (id) => document.getElementById(id);
  const n = (v) => v.toLocaleString("ja-JP");
  const pct = (v) => v.toFixed(1) + "%";
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±");
  const md = (s) => s.slice(5).replace("-", "/");
  const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
  const avg = (a) => sum(a) / a.length;
  const state = (r) => (r > 50 ? ["ng", "要確認"] : r > 20 ? ["warn", "注意"] : ["ok", "正常"]);

  $("asof").textContent = `${C.meta.today_label} 時点`;

  const trend = O.user_session_trend;
  const byDay = new Map();
  for (const r of O.daily_cost) {
    const d = byDay.get(r.day_label) || {};
    d[r.provider] = (d[r.provider] || 0) + r.cost;
    byDay.set(r.day_label, d);
  }
  const days = [...byDay.keys()].sort();
  const total = (d) => sum(Object.values(byDay.get(d)));
  const cNow = sum(days.slice(-WEEK), total), cPrev = sum(days.slice(-2 * WEEK, -WEEK), total);
  const sNow = avg(trend.slice(WEEK).map((t) => t.sessions)), sPrev = avg(trend.slice(0, WEEK).map((t) => t.sessions));
  const errTotal = sum(O.error_summary, (e) => e.count);

  const card = ({ href, label, value, unit = "", chip, chipCls = "", sub, viz }) => `
    <a class="card" href="#${href}">
      <div class="k-label">${label}<span class="go">詳細 →</span></div>
      <div class="k-value">${value}<span class="u">${unit}</span></div>
      <div class="k-sub">${chip ? `<span class="chip ${chipCls}">${chip}</span>` : ""}${sub}</div>
      <div class="k-spark">${viz}</div>
    </a>`;

  const spanCap = (a, b, mid) => `<div class="cap"><span>${a}</span><span>${mid}</span><span>${b}</span></div>`;
  $("cards-use").innerHTML = [
    card({ href: "sec-trend", label: "送信した利用者", value: H.recent.terminals, unit: "人", chip: `${sign(H.recent.terminals - H.prev.terminals)}${Math.abs(H.recent.terminals - H.prev.terminals)}`, sub: `前の 7 日 ${H.prev.terminals} 人`,
      viz: spark(trend.map((t) => t.users), WEEK) + spanCap(md(trend[0].day_label), md(trend[trend.length - 1].day_label), "日ごとの人数") }),
    card({ href: "sec-trend", label: "1 日あたりのセッション", value: sNow.toFixed(1), unit: "件", chip: `${sign(sNow - sPrev)}${Math.abs(sNow - sPrev).toFixed(1)}`, chipCls: sNow > sPrev ? "up" : "", sub: `前の 7 日 ${sPrev.toFixed(1)} 件（日ごとの平均）`,
      viz: spark(trend.map((t) => t.sessions), WEEK) + spanCap(md(trend[0].day_label), md(trend[trend.length - 1].day_label), "日ごとの件数") }),
    card({ href: "sec-cost", label: "コスト（利用明細）", value: usd(cNow), chip: `${sign(cNow - cPrev)}${Math.abs(((cNow - cPrev) / cPrev) * 100).toFixed(1)}%`, chipCls: "up", sub: `${md(days[days.length - WEEK])}〜${md(days[days.length - 1])} · 前の 7 日 ${usd(cPrev)}`,
      viz: spark(days.slice(-COST_SPARK_DAYS).map(total), WEEK) + spanCap(md(days[days.length - COST_SPARK_DAYS]), md(days[days.length - 1]), "日ごとの合計") }),
  ].join("");

  $("cards-data").innerHTML = [
    card({ href: "sec-recv", label: "受信した記録", value: n(H.recent.events), unit: "件", chip: `${sign(H.recent.events - H.prev.events)}${n(Math.abs(H.recent.events - H.prev.events))}`, chipCls: "up", sub: `前の 7 日 ${n(H.prev.events)} 件`,
      viz: pairBars([["前の 7 日", H.prev.events, "var(--ghost)"], ["直近 7 日", H.recent.events, "var(--accent)"]]) }),
    card({ href: "sec-recv", label: "CSV との照合率", value: O.reconciliation_rate.toFixed(1), unit: "%", sub: `CSV にもいた ${O.reconciliation_numerator} 人 / 送信した ${O.reconciliation_denominator} 人`,
      viz: meter(O.reconciliation_numerator, O.reconciliation_denominator) + `<div class="cap"><span>利用明細の最終日までの 7 日 · 前との比較なし</span></div>` }),
    card({ href: "sec-errors", label: "プラグインのエラー", value: errTotal, unit: "件", chip: "注意", chipCls: "warn", sub: `${O.error_summary.length} 種類 · 前との比較なし`,
      viz: stack(O.error_summary.map((e) => [e.count, `${STAGE[e.stage]}`])) }),
  ].join("");

  // 詳細
  $("trend-charts").innerHTML =
    `<div><h3>利用者数</h3>${bars(trend.map((t) => t.users), trend.map((t) => md(t.day_label)), 560, 150)}</div>` +
    `<div><h3>セッション数</h3>${bars(trend.map((t) => t.sessions), trend.map((t) => md(t.day_label)), 560, 150)}</div>`;

  $("cost-chart").innerHTML = costChart(1150, 200) + `<div class="legend">${PROVIDERS.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}</div>`;
  $("t-cost").innerHTML = `<thead><tr><th>日付</th>${PROVIDERS.map(([, l]) => `<th class="num">${l}</th>`).join("")}<th class="num">合計</th></tr></thead><tbody>`
    + [...days].reverse().map((d) => `<tr><td>${d}</td>${PROVIDERS.map(([k]) => `<td class="num">${byDay.get(d)[k] ? usd(byDay.get(d)[k]) : "—"}</td>`).join("")}<td class="num"><b>${usd(total(d))}</b></td></tr>`).join("") + `</tbody>`;

  $("t-nulls").innerHTML = `<thead><tr><th>項目</th><th class="num">直近 7 日</th><th class="num">前の 7 日</th><th>状態</th></tr></thead><tbody>`
    + `<tr class="group"><td colspan="4">受信</td></tr>`
    + `<tr><td>受信した記録</td><td class="num">${n(H.recent.events)} 件</td><td class="num sub">${n(H.prev.events)} 件</td><td class="sub">—</td></tr>`
    + `<tr><td>送信した利用者</td><td class="num">${H.recent.terminals} 人</td><td class="num sub">${H.prev.terminals} 人</td><td class="sub">—</td></tr>`
    + `<tr><td>CSV との照合率 <span class="sub">利用明細の最終日までの 7 日</span></td><td class="num">${pct(O.reconciliation_rate)} <span class="sub">${O.reconciliation_numerator} / ${O.reconciliation_denominator} 人</span></td><td class="num sub">—</td><td class="sub">—</td></tr>`
    + `<tr class="group"><td colspan="4">項目の欠け（空だった割合）</td></tr>`
    + NULL_ITEMS.map(([k, name]) => { const r = H.recent.null_rates[k], [c, t] = state(r); return `<tr><td>${name}</td><td class="num">${pct(r)}</td><td class="num sub">${pct(H.prev.null_rates[k])}</td><td><span class="dot ${c}">${t}</span></td></tr>`; }).join("") + `</tbody>`;

  $("t-errors").innerHTML = `<thead><tr><th>処理段階</th><th>エラーの種類</th><th class="num">件数</th><th class="num">端末数</th><th class="num">最後に起きた版</th></tr></thead><tbody>`
    + O.error_summary.map((e) => `<tr><td>${STAGE[e.stage] || e.stage}</td><td class="code">${e.error_type}</td><td class="num">${e.count}</td><td class="num">${e.terminals}</td><td class="num">${e.version}</td></tr>`).join("") + `</tbody>`;
  const vt = sum(O.plugin_versions, (v) => v.count);
  $("t-versions").innerHTML = `<thead><tr><th>プラグインのバージョン</th><th class="num">端末数</th><th style="width:40%"></th></tr></thead><tbody>`
    + O.plugin_versions.map((v) => `<tr><td>${v.version}</td><td class="num">${v.count} <span class="sub">/ ${vt}</span></td><td><span class="hbar" style="width:${(v.count / Math.max(...O.plugin_versions.map((x) => x.count))) * 100}%"></span></td></tr>`).join("") + `</tbody>`;

  $("usage").innerHTML = DIST.map(([title, list, map]) => {
    const t = sum(list, (r) => r.count), max = Math.max(...list.map((r) => r.count));
    return `<div><h3>${title} <span class="sub">計 ${n(t)} 件</span></h3><table><tbody>`
      + list.map((r) => `<tr><td>${map[r.value] || r.value}</td><td style="width:38%"><span class="hbar" style="width:${(r.count / max) * 100}%"></span></td><td class="num">${n(r.count)}</td><td class="num sub">${pct((r.count / t) * 100)}</td></tr>`).join("")
      + `</tbody></table></div>`;
  }).join("");

  function spark(vals, hiLast) {
    const w = 300, h = 52, pad = 4, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const x = (i) => (i / (vals.length - 1)) * w, y = (v) => pad + (h - 2 * pad) * (1 - (v - min) / span);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const cut = vals.length - hiLast;
    const recentArea = `M${x(cut - 1)},${h} L${pts.slice(cut - 1).join(" L")} L${w},${h} Z`;
    const last = vals.length - 1;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="${x(cut - 1)}" y="0" width="${w - x(cut - 1)}" height="${h}" fill="#ece8e2"/>
      <path d="${recentArea}" fill="var(--accent-2)" opacity=".35"/>
      <polyline points="${pts.slice(0, cut).join(" ")}" fill="none" stroke="var(--muted)" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
      <polyline points="${pts.slice(cut - 1).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(last)}" cy="${y(vals[last])}" r="3" fill="var(--accent)"/></svg>`;
  }

  function pairBars(rows) {
    const max = Math.max(...rows.map((r) => r[1]));
    return rows.map(([l, v, c]) => `<div class="cap" style="justify-content:flex-start;gap:10px;align-items:center"><span style="width:64px">${l}</span><span style="flex:1;height:10px;background:#ece8e2;border-radius:2px"><span style="display:block;height:10px;width:${(v / max) * 100}%;background:${c};border-radius:2px"></span></span></div>`).join("");
  }

  function meter(num, den) {
    return `<div style="height:10px;background:#ece8e2;border-radius:2px"><div style="height:10px;width:${(num / den) * 100}%;background:var(--accent);border-radius:2px"></div></div>`;
  }

  function stack(parts) {
    const shades = ["#8a5a12", "#b0823f", "#d2b186"];
    const merged = new Map(); parts.forEach(([v, l]) => merged.set(l, (merged.get(l) || 0) + v));
    const list = [...merged].sort((a, b) => b[1] - a[1]);
    const seg = list.map(([, v], i) => `<span style="flex:${v};background:${shades[i % shades.length]}"></span>`).join("");
    return `<div style="display:flex;gap:2px;height:10px;border-radius:2px;overflow:hidden">${seg}</div>`
      + `<div class="cap" style="justify-content:flex-start;gap:14px">${list.map(([l, v], i) => `<span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;background:${shades[i % shades.length]}"></i>${l} ${v}</span>`).join("")}</div>`;
  }

  function bars(vals, labels, w, h) {
    const pad = { t: 16, b: 20 }, max = Math.max(...vals), step = w / vals.length, bw = step * 0.6;
    const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    return `<svg viewBox="0 0 ${w} ${h}">` + vals.map((v, i) => {
      const x = i * step + (step - bw) / 2, fill = i >= vals.length - WEEK ? "var(--accent)" : "var(--ghost)";
      return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${h - pad.b - y(v)}" rx="1.5" fill="${fill}"/><text x="${x + bw / 2}" y="${y(v) - 4}" text-anchor="middle">${v}</text>`
        + (i % 2 === 1 ? `<text x="${x + bw / 2}" y="${h - 4}" text-anchor="middle">${labels[i]}</text>` : "");
    }).join("") + `<line x1="0" x2="${w}" y1="${h - pad.b}" y2="${h - pad.b}" stroke="var(--rule)"/></svg>`;
  }

  function costChart(w, h) {
    const pad = { t: 10, b: 22, l: 44 }, max = Math.ceil(Math.max(...days.map(total)) / 100) * 100;
    const step = (w - pad.l) / days.length, bw = step * 0.72;
    const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    let g = "";
    for (let v = 0; v <= max; v += 100) g += `<line x1="${pad.l}" x2="${w}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">$${v}</text>`;
    days.forEach((d, i) => {
      const x = pad.l + i * step + (step - bw) / 2;
      let acc = 0;
      for (const [k, l, c] of PROVIDERS) {
        const v = byDay.get(d)[k] || 0;
        if (v) g += `<rect x="${x}" y="${y(acc + v)}" width="${bw}" height="${y(acc) - y(acc + v)}" fill="${c}"><title>${d} ${l} ${usd(v)}</title></rect>`;
        acc += v;
      }
      if (i % WEEK === 0) g += `<text x="${x + bw / 2}" y="${h - 4}" text-anchor="middle">${md(d)}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="日ごとのコスト">${g}</svg>`;
  }
})();
