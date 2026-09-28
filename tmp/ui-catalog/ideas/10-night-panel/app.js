(() => {
  const C = window.CTX, O = C.overview, P = C.policy;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const signed = (v) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : "±0");
  const STATE = { ok: "正常", warn: "注意", ng: "要確認", neutral: "—" };
  const lamp = (node, state, text) => { node.className = `lamp ${state}`; node.textContent = text || STATE[state]; };

  const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
  const NULL_NAME = { tool_name: "ツール名", skill_name: "スキル名", context_tokens: "コンテキストのトークン数", command_source: "コマンドの定義元" };
  const PERM = { default: ["通常", "操作ごとに許可を求める"], acceptEdits: ["編集を自動承認", "ファイル編集は確認なし"], plan: ["プランモード", "計画だけ立て、変更しない"], bypassPermissions: ["確認なし", "すべての操作を確認なし"] };
  const EFFORT = { low: ["低", ""], medium: ["中", ""], high: ["高", ""] };
  const SOURCE = { startup: ["新規起動", ""], resume: ["再開", "前のセッションを続けた"], clear: ["クリア後", "/clear の後"], compact: ["圧縮後", "圧縮の後に始まった"] };
  const PROVIDERS = [{ key: "aws-bedrock", name: "AWS Bedrock" }, { key: "google-vertex", name: "Google Vertex AI" }];

  const _cmpBars = (prev, now) => {
    const m = Math.max(prev, now) || 1;
    return `<div class="vlist cmp">
      <span>前の 7 日</span><div class="cmp-t"><span class="prev" style="width:${(prev / m) * 100}%"></span></div><span class="mono">${fmt(prev)}</span>
      <span>直近 7 日</span><div class="cmp-t"><span style="width:${(now / m) * 100}%"></span></div><span class="mono">${fmt(now)}</span></div>`;
  };
  const _readout = (id, label, state, big, unit, sub, extra = "") => {
    $(id).innerHTML = `<div class="label">${label}<span class="lamp ${state}">${STATE[state]}</span></div>
      <div class="big">${big}<small>${unit}</small></div><div class="sub">${sub}</div>${extra}`;
  };

  function health() {
    const r = O.health.recent, p = O.health.prev;
    const evState = r.events >= p.events * 0.8 ? "ok" : "warn";
    _readout("r-events", "受信した記録", evState, fmt(r.events), "件",
      `前の 7 日比 <span class="delta">${signed(r.events - p.events)}</span>　再送の重複は除く`, _cmpBars(p.events, r.events));
    _readout("r-users", "送信した利用者", r.terminals >= p.terminals * 0.8 ? "ok" : "warn", fmt(r.terminals), "人",
      `前の 7 日比 <span class="delta">${signed(r.terminals - p.terminals)}</span>`, _cmpBars(p.terminals, r.terminals));
    const rr = O.reconciliation_rate;
    _readout("r-recon", "CSV との照合率", rr >= 95 ? "ok" : "warn", fmt(rr, 1), "%",
      `CSV にもいた <span class="mono">${O.reconciliation_numerator}</span> 人 / 送信した <span class="mono">${O.reconciliation_denominator}</span> 人`,
      `<p class="p-note" style="margin:14px 0 0">下がったら、メールアドレスの不一致を疑う</p>`);

    const vs = [...P.plugin_versions].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    const total = vs.reduce((a, v) => a + v.count, 0);
    const shades = ["var(--accent)", "var(--series-2)", "var(--text-3)"];
    $("r-versions").innerHTML = `<div class="label">プラグインのバージョン</div>
      <div class="big">${esc(vs[0].version)}<small>が最新 · ${vs[0].count} / ${total} 端末</small></div>
      <div class="sub">直近 30 日 · 端末ごとに最新の報告</div>
      <div class="stack" aria-hidden="true">${vs.map((v, i) => `<span style="width:${(v.count / total) * 100}%;background:${shades[i] || shades[2]}"></span>`).join("")}</div>
      <div class="vlist">${vs.map((v, i) => `<i style="background:${shades[i] || shades[2]}"></i><span class="code">${esc(v.version)}</span><span class="mono">${v.count} 端末</span>`).join("")}</div>`;

    const errs = O.error_summary;
    const errTotal = errs.reduce((a, e) => a + e.count, 0);
    lamp($("lamp-err"), errTotal ? "warn" : "ok", errTotal ? `注意 · ${errTotal} 件` : "正常");
    $("t-err").innerHTML = `<thead><tr><th>処理段階</th><th>エラーの種類</th><th class="n">件数</th><th class="n">端末数</th><th class="n">最後に起きた版</th></tr></thead><tbody>${errs
      .map((e) => `<tr><td>${esc(STAGE[e.stage] || e.stage)}</td><td class="code">${esc(e.error_type)}</td><td class="n">${fmt(e.count)}</td><td class="n">${fmt(e.terminals)}</td><td class="n code">${esc(e.version)}</td></tr>`)
      .join("")}</tbody>`;

    const items = Object.keys(NULL_NAME).map((k) => ({ name: NULL_NAME[k], code: k, now: r.null_rates[k], prev: p.null_rates[k] }));
    const worst = Math.max(...items.map((i) => i.now));
    lamp($("lamp-null"), worst > 50 ? "ng" : worst > 20 ? "warn" : "ok");
    const chart = $("null-chart");
    chart.innerHTML = `<div class="legend"><span><svg viewBox="0 0 10 10" style="display:inline;width:10px;margin-right:6px"><circle class="prev" cx="5" cy="5" r="4"/></svg>前の 7 日</span><span><svg viewBox="0 0 10 10" style="display:inline;width:10px;margin-right:6px"><circle class="now" cx="5" cy="5" r="4"/></svg>直近 7 日</span></div>`;
    chart.appendChild(Charts.dumbbells(items));
  }

  function usage() {
    const rows = O.daily_cost;
    const days = [...new Set(rows.map((r) => r.day_label))];
    $("cost-range").textContent = `${days[0]} 〜 ${days[days.length - 1]}`;
    const sum = (k) => rows.filter((r) => r.provider === k).reduce((a, r) => a + r.cost, 0);
    $("cost-legend").innerHTML = PROVIDERS.map((p, i) => `<span><i style="background:var(${i ? "--series-2" : "--accent"})"></i>${p.name}<b>$${fmt(sum(p.key), 0)}</b></span>`).join("") + `<span>期間の合計<b>$${fmt(sum(PROVIDERS[0].key) + sum(PROVIDERS[1].key), 0)}</b></span>`;
    $("cost-chart").appendChild(Charts.stackedCost(rows, PROVIDERS));
    $("cost-rows").textContent = rows.length;
    $("t-cost").innerHTML = `<thead><tr><th>日付</th><th>提供元</th><th class="n">コスト（USD）</th></tr></thead><tbody>${[...rows].reverse()
      .map((r) => `<tr><td class="code">${r.day_label}</td><td>${esc((PROVIDERS.find((p) => p.key === r.provider) || { name: r.provider }).name)}</td><td class="n">$${fmt(r.cost, 2)}</td></tr>`).join("")}</tbody>`;

    const us = O.user_session_trend;
    $("us-legend").innerHTML = `<span><i class="line" style="background:var(--accent)"></i>利用者数</span><span><i class="line" style="background:var(--text-3)"></i>セッション数（破線）</span>`;
    $("us-chart").appendChild(Charts.lines(us, [{ key: "users" }, { key: "sessions" }], 60));
  }

  function dist(id, rows, names) {
    const total = rows.reduce((a, r) => a + r.count, 0);
    const max = Math.max(...rows.map((r) => r.count));
    $(id).className = "dist";
    $(id).innerHTML = rows.map((r) => {
      const [name, desc] = names[r.value] || [r.value, ""];
      return `<div class="row"><div class="name">${esc(name)}${desc ? `<small>${esc(desc)}</small>` : ""}</div>
        <div class="bar-t"><span style="width:${(r.count / max) * 100}%"></span></div>
        <div class="mono">${fmt(r.count)}</div><div class="mono pc">${fmt((r.count / total) * 100, 1)}%</div></div>`;
    }).join("") + `<div class="total">合計 <span class="mono">${fmt(total)}</span> 件</div>`;
  }

  function theme() {
    const root = document.documentElement;
    const apply = (t) => {
      root.dataset.theme = t;
      document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.set === t)));
    };
    let saved = null;
    try { saved = localStorage.getItem("theme"); } catch (e) { saved = null; }
    apply(location.hash === "#light" ? "light" : location.hash === "#dark" ? "dark" : saved || "dark");
    document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
      apply(b.dataset.set);
      try { localStorage.setItem("theme", b.dataset.set); } catch (e) { /* 保存できなくても表示は切り替わる */ }
    }));
  }

  theme();
  $("gen").textContent = C.meta.generated_at.slice(0, 16).replace("T", " ");
  health();
  usage();
  dist("d-perm", O.permission_mode_distribution, PERM);
  dist("d-effort", O.effort_level_distribution, EFFORT);
  dist("d-source", O.source_distribution, SOURCE);
})();
