(() => {
  const C = window.CTX, O = C.overview, P = C.policy, E = C.effect, A = C.assets;
  const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
  const KEY = {
    "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "自動圧縮のしきい値",
    "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": "プラグインの自動更新",
    autoUpdatesChannel: "本体の更新チャネル",
    "env.DISABLE_AUTOUPDATER": "自動更新の無効化を打ち消す",
    "env.DISABLE_UPDATES": "更新の無効化を打ち消す",
    "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE": "パッケージマネージャ経由の自動更新",
  };
  const PROVIDER = { "aws-bedrock": "AWS Bedrock", "google-vertex": "Google Vertex AI" };
  const NULL_ITEMS = [["tool_name", "ツール名"], ["skill_name", "スキル名"], ["context_tokens", "コンテキストのトークン数"], ["command_source", "コマンドの定義元"]];
  const DISTRIBUTED_PREFIX = "governance:";
  const BIG_CONTEXT = 120000;
  const WEEK = 7;

  const $ = (id) => document.getElementById(id);
  const n = (v) => v.toLocaleString("ja-JP");
  const pct = (v) => v.toFixed(1) + "%";
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (v, f = n) => (v > 0 ? "+" : v < 0 ? "−" : "±") + f(Math.abs(v));
  const md = (s) => s.slice(5).replace("-", "/");
  const state = (r) => (r > 50 ? ["ng", "要確認"] : r > 20 ? ["warn", "注意"] : ["ok", "正常"]);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  $("asof").textContent = `${C.meta.today_label} 時点`;
  const trend = O.user_session_trend, recent = trend.slice(WEEK);
  document.querySelectorAll('[data-range="recent"]').forEach((el) => { el.textContent = `${md(recent[0].day_label)}〜${md(recent[WEEK - 1].day_label)}`; });

  // 問い 1
  const H = O.health;
  const dUsers = H.recent.terminals - H.prev.terminals;
  $("a-used").innerHTML = `${H.recent.terminals}<span class="u">人</span>`;
  const us = recent.map((t) => t.users);
  $("v-used").innerHTML = `前の 7 日と比べて <b>${signed(dUsers)} 人</b>。1 日あたりでは <b>${Math.min(...us)}〜${Math.max(...us)} 人</b>が使っています。`;
  $("c-users").innerHTML = barChart(trend.map((t, i) => ({ v: t.users, label: md(t.day_label), hi: i >= WEEK })), 380, 150)
    + `<div class="legend"><span><i style="background:var(--accent-soft)"></i>前の 7 日</span><span><i style="background:var(--accent)"></i>直近 7 日</span></div>`;

  const costDays = [...new Set(O.daily_cost.map((r) => r.day_label))].sort();
  const cRecent = new Set(costDays.slice(-WEEK)), cPrev = new Set(costDays.slice(-2 * WEEK, -WEEK));
  const provs = [...new Set(O.daily_cost.map((r) => r.provider))];
  const costOf = (set, p) => sum(O.daily_cost.filter((r) => set.has(r.day_label) && (!p || r.provider === p)), (r) => r.cost);
  const cr = [...cRecent], cp = [...cPrev];
  $("t-cost").innerHTML = `<thead><tr><th>提供元</th><th class="num">${md(cr[0])}〜${md(cr[WEEK - 1])}</th><th class="num">${md(cp[0])}〜${md(cp[WEEK - 1])}</th><th class="num">差</th></tr></thead><tbody>`
    + [...provs.map((p) => [PROVIDER[p] || p, costOf(cRecent, p), costOf(cPrev, p), ""]), ["計", costOf(cRecent), costOf(cPrev), "total"]]
      .map(([name, a, b, cls]) => `<tr class="${cls}"><td>${name}</td><td class="num">${usd(a)}</td><td class="num sub">${usd(b)}</td><td class="num">${signed(((a - b) / b) * 100, (x) => x.toFixed(1))}%</td></tr>`).join("") + "</tbody>";

  const assetRows = [];
  for (const s of A.skills) assetRows.push({ name: s.skill_name, kind: "スキル", now: s.recent_calls, prev: s.prev_calls });
  const cmd = new Map();
  for (const c of A.commands) {
    const r = cmd.get(c.command_name) || { name: c.command_name, kind: "コマンド", now: 0, prev: 0 };
    r.now += c.recent_calls; r.prev += c.prev_calls; cmd.set(c.command_name, r);
  }
  assetRows.push(...cmd.values());
  assetRows.sort((a, b) => b.now - a.now);
  $("t-assets").innerHTML = `<thead><tr><th>名前</th><th>種類</th><th class="num">回数</th><th class="num">前の 7 日比</th></tr></thead><tbody>`
    + assetRows.map((r) => `<tr><td>${r.name.startsWith(DISTRIBUTED_PREFIX) ? "<b>" + r.name + "</b>" : r.name}</td><td class="sub">${r.kind}</td><td class="num">${n(r.now)}</td><td class="num">${signed(r.now - r.prev)}</td></tr>`).join("")
    + `</tbody>`;
  $("t-assets").insertAdjacentHTML("afterend", `<p class="caveat">太字は配布したもの。コマンドは定義元の違う行を合算しています。</p>`);

  // 問い 2
  const items = [...P.items].sort((a, b) => a.rate - b.rate);
  const low = items[0];
  $("kept-denom").textContent = `（${low.denominator} 人）`;
  $("a-kept").innerHTML = `${low.rate.toFixed(1)}<span class="u">%</span>`;
  $("v-kept").innerHTML = `最も低いのは<b>${KEY[low.key_name]}</b>で ${low.numerator} / ${low.denominator} 人。6 つの設定すべてで、全員には届いていません。`;
  $("t-items").innerHTML = `<thead><tr><th>設定</th><th></th><th class="num">適用済み / 対象者</th><th class="num">適用率</th><th class="num">未適用の端末</th></tr></thead><tbody>`
    + [...P.items].map((it) => `<tr><td>${KEY[it.key_name] || it.key_name}</td><td><span class="track"><span class="bar" style="width:${it.rate}%"></span></span></td><td class="num sub">${it.numerator} / ${it.denominator}</td><td class="num"><b>${pct(it.rate)}</b></td><td class="num">${it.non_compliant.length} 台</td></tr>`).join("")
    + `</tbody>`;
  $("l-notintro").innerHTML = P.not_introduced.map((u) => `<li>${u.user_email}</li>`).join("");
  $("t-stale").innerHTML = `<thead><tr><th>利用者</th><th>端末名</th><th class="num">最終報告日</th></tr></thead><tbody>`
    + P.stale.map((s) => `<tr><td>${s.user_email}</td><td class="code">${s.host}</td><td class="num">${s.last_day_label}</td></tr>`).join("") + `</tbody>`;
  $("t-ccver").innerHTML = versionRows(P.claude_code_versions);

  // 問い 3
  const pre = E.context_pre_compact;
  const shareBig = (list) => (sum(list.filter((r) => r.bin >= BIG_CONTEXT), (r) => r.count) / sum(list, (r) => r.count)) * 100;
  const bBig = shareBig(pre.before), aBig = shareBig(pre.after);
  const bN = sum(pre.before, (r) => r.count), aN = sum(pre.after, (r) => r.count);
  const bNum = sum(pre.before.filter((r) => r.bin >= BIG_CONTEXT), (r) => r.count), aNum = sum(pre.after.filter((r) => r.bin >= BIG_CONTEXT), (r) => r.count);
  $("a-effect").innerHTML = `${bBig.toFixed(1)}<span class="u">%</span><span class="arrow">→</span>${aBig.toFixed(1)}<span class="u">%</span>`;
  $("v-effect").innerHTML = `<b>12 万トークン以上</b>になってから圧縮された記録の割合（前 ${bNum} / ${n(bN)} 件、後 ${aNum} / ${n(aN)} 件）。守り始めた後は、圧縮がそれより手前で起きています。`;
  $("c-hist").innerHTML = histogram(pre.before, pre.after, E.context_bin, 540, 200);
  $("c-study").innerHTML = studyChart(E.study, 540, 200);

  // 問い 4
  const errTotal = sum(O.error_summary, (e) => e.count);
  const tRange = O.error_summary.map((e) => e.terminals);
  $("a-data").innerHTML = `${errTotal}<span class="u">件</span>`;
  $("v-data").innerHTML = `<span class="state warn">注意</span>直近 7 日のプラグインのエラー。${O.error_summary.length} 種類が、それぞれ ${Math.min(...tRange)}〜${Math.max(...tRange)} 台の端末で起きています。項目の欠けと CSV との照合は正常です。`;
  $("t-errors").innerHTML = `<thead><tr><th>処理段階</th><th>エラーの種類</th><th class="num">件数</th><th class="num">端末</th><th class="num">最後の版</th></tr></thead><tbody>`
    + O.error_summary.map((e) => `<tr><td>${STAGE[e.stage] || e.stage}</td><td class="code">${e.error_type}</td><td class="num">${e.count}</td><td class="num">${e.terminals}</td><td class="num sub">${e.version}</td></tr>`).join("") + `</tbody>`;
  $("t-nulls").innerHTML = `<thead><tr><th>項目</th><th class="num">直近 7 日</th><th class="num">前の 7 日</th><th>状態</th></tr></thead><tbody>`
    + NULL_ITEMS.map(([k, name]) => { const r = H.recent.null_rates[k], [c, t] = state(r); return `<tr><td>${name}</td><td class="num">${pct(r)}</td><td class="num sub">${pct(H.prev.null_rates[k])}</td><td><span class="dot ${c}">${t}</span></td></tr>`; }).join("")
    + `</tbody>`;
  $("t-nulls").insertAdjacentHTML("afterend", `<p class="caveat">20% 以下を正常、20% 超を注意、50% 超を要確認とします。</p>`);
  $("t-recv").innerHTML = `<tbody>
    <tr><td>受信した記録</td><td class="num"><b>${n(H.recent.events)}</b> 件</td><td class="num">${signed(H.recent.events - H.prev.events)}</td></tr>
    <tr><td>CSV との照合率</td><td class="num"><b>${pct(O.reconciliation_rate)}</b></td><td class="num sub">${O.reconciliation_numerator} / ${O.reconciliation_denominator} 人</td></tr></tbody>`;
  $("t-plugver").innerHTML = versionRows(O.plugin_versions);

  function versionRows(list) {
    const total = sum(list, (v) => v.count), max = Math.max(...list.map((v) => v.count));
    return `<tbody>` + list.map((v) => `<tr><td class="code">${v.version}</td><td><span class="bar" style="width:${(v.count / max) * 100}px"></span></td><td class="num">${v.count} 台</td><td class="num sub">${pct((v.count / total) * 100)}</td></tr>`).join("") + `</tbody>`;
  }

  function barChart(data, w, h) {
    const pad = { t: 16, b: 20 }, max = Math.max(...data.map((d) => d.v)), step = w / data.length, bw = step * 0.62;
    const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    const bars = data.map((d, i) => {
      const x = i * step + (step - bw) / 2, fill = d.hi ? "var(--accent)" : "var(--accent-soft)";
      const lbl = i % 2 === 1 || i === data.length - 1 ? `<text x="${x + bw / 2}" y="${h - 4}" text-anchor="middle">${d.label}</text>` : "";
      return `<rect x="${x}" y="${y(d.v)}" width="${bw}" height="${h - pad.b - y(d.v)}" fill="${fill}"/><text x="${x + bw / 2}" y="${y(d.v) - 4}" text-anchor="middle">${d.v}</text>${lbl}`;
    }).join("");
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="日ごとの利用者数">${bars}<line class="ax" x1="0" x2="${w}" y1="${h - pad.b}" y2="${h - pad.b}"/></svg>`;
  }

  function histogram(before, after, bin, w, h) {
    const maxBin = Math.max(...before.concat(after).map((r) => r.bin));
    const bins = []; for (let b = 0; b <= maxBin; b += bin) bins.push(b);
    const share = (list) => { const t = sum(list, (r) => r.count); return new Map(list.map((r) => [r.bin, (r.count / t) * 100])); };
    const sb = share(before), sa = share(after);
    const max = Math.max(...sb.values(), ...sa.values());
    const pad = { t: 18, b: 22, l: 0 }, step = w / bins.length, bw = step * 0.36;
    const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    const base = h - pad.b;
    let g = "";
    bins.forEach((b, i) => {
      const x0 = i * step + step * 0.12;
      for (const [m, fill, dx] of [[sb, "var(--neutral)", 0], [sa, "var(--accent)", bw + 2]]) {
        const v = m.get(b);
        if (v !== undefined) g += `<rect x="${x0 + dx}" y="${y(v)}" width="${bw}" height="${base - y(v)}" fill="${fill}"/>`;
      }
      g += `<text x="${i * step}" y="${h - 4}">${b / 10000}</text>`;
    });
    const xl = (BIG_CONTEXT / bin) * step;
    g += `<line x1="${xl}" x2="${xl}" y1="4" y2="${base}" stroke="var(--ink)" stroke-dasharray="3 3"/><text x="${xl + 6}" y="12" style="fill:var(--ink)">12 万トークン</text>`;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="圧縮直前のコンテキストの大きさの分布">${g}<line class="ax" x1="0" x2="${w}" y1="${base}" y2="${base}"/></svg>`
      + `<div class="legend"><span><i style="background:var(--neutral)"></i>守る前（${n(sum(before, (r) => r.count))} 件）</span><span><i style="background:var(--accent)"></i>守った後（${n(sum(after, (r) => r.count))} 件）</span></div>`;
  }

  function studyChart(rows, w, h) {
    const span = E.span, pad = { t: 16, b: 22, l: 34, r: 8 };
    const max = Math.ceil(Math.max(...rows.map((r) => r.cost)) / 2) * 2;
    const x = (d) => pad.l + ((d + span) / (2 * span)) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    const seg = (list) => list.map((r, i) => `${i ? "L" : "M"}${x(r.relative_day).toFixed(1)},${y(r.cost).toFixed(1)}`).join("");
    const before = rows.filter((r) => r.relative_day < 0), after = rows.filter((r) => r.relative_day > 0);
    const mean = (l) => sum(l, (r) => r.cost) / l.length;
    let g = "";
    for (let v = 0; v <= max; v += max / 2) g += `<line class="ax" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">$${v}</text>`;
    g += `<line x1="${x(0)}" x2="${x(0)}" y1="${pad.t - 6}" y2="${h - pad.b}" stroke="var(--ink)" stroke-dasharray="3 3"/><text x="${x(0)}" y="${pad.t - 8}" text-anchor="middle" style="fill:var(--ink)">守り始めた日</text>`;
    g += `<path d="${seg(before)}" fill="none" stroke="var(--neutral)" stroke-width="1.6"/><path d="${seg(after)}" fill="none" stroke="var(--accent)" stroke-width="1.6"/>`;
    for (const [l, c] of [[before, "var(--neutral)"], [after, "var(--accent)"]]) {
      const m = mean(l), x1 = x(l[0].relative_day), x2 = x(l[l.length - 1].relative_day);
      g += `<line x1="${x1}" x2="${x2}" y1="${y(m)}" y2="${y(m)}" stroke="${c}" stroke-width="3" opacity=".35"/><text x="${(x1 + x2) / 2}" y="${y(m) - 6}" text-anchor="middle" class="halo" style="fill:var(--ink-2)">平均 ${usd(m)}</text>`;
    }
    for (const d of [-14, -7, 7, 14]) g += `<text x="${x(d)}" y="${h - 4}" text-anchor="middle">${d > 0 ? "+" : "−"}${Math.abs(d)} 日</text>`;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="守り始めた日の前後の 1 人あたりコスト">${g}</svg>`;
  }
})();
