// 画面ごとの定義。カード 1 枚・タブ 1 枚・列 1 本 = 配列の 1 要素
window.SCREENS = (() => {
  const K = window.KIT, C = window.CTX, O = C.overview, H = O.health, P = C.policy;
  const WEEK = C.meta.constants.RECENT_DAYS, STALE = C.meta.constants.STALE_DAYS, TODAY = C.meta.today_epoch_day;
  const { n, pct, usd, md, sum, dot, delta, hbars, spark, mail, esc } = K;

  // 状態の判定基準（仮の値）
  const RULE = {
    nullRate: (r) => (r > 50 ? "ng" : r > 20 ? "warn" : "ok"),
    recon: (r) => (r >= 95 ? "ok" : r >= 80 ? "warn" : "ng"),
    policyRate: (r) => (r >= 95 ? "ok" : r >= 80 ? "warn" : "ng"),
    count: (v) => (v > 0 ? "warn" : "ok"),
  };

  const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定", notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
  const DIST = [
    ["mode", "権限モード", O.permission_mode_distribution, { default: "通常", acceptEdits: "編集を自動承認", plan: "プランモード", bypassPermissions: "確認なし" }],
    ["effort", "effort（思考量）", O.effort_level_distribution, { low: "低", medium: "中", high: "高" }],
    ["source", "セッションの開始のしかた", O.source_distribution, { startup: "新規起動", resume: "再開", clear: "クリア後", compact: "圧縮後" }],
  ];
  const NULL_ITEMS = [["tool_name", "ツール名"], ["skill_name", "スキル名"], ["context_tokens", "コンテキストのトークン数"], ["command_source", "コマンドの定義元"]];
  const PROVIDERS = [["aws-bedrock", "AWS Bedrock", "var(--accent)"], ["google-vertex", "Google Vertex AI", "var(--accent-2)"]];

  // ---- 概況の集計 ----
  const trend = O.user_session_trend;
  const byDay = new Map();
  for (const r of O.daily_cost) { const d = byDay.get(r.day_label) || {}; d[r.provider] = (d[r.provider] || 0) + r.cost; byDay.set(r.day_label, d); }
  const days = [...byDay.keys()].sort(), total = (d) => sum(Object.values(byDay.get(d)));
  const cNow = sum(days.slice(-WEEK), total), cPrev = sum(days.slice(-2 * WEEK, -WEEK), total);
  const sNow = sum(trend.slice(-WEEK), (t) => t.sessions) / WEEK, sPrev = sum(trend.slice(0, -WEEK), (t) => t.sessions) / WEEK;
  const errTotal = sum(O.error_summary, (e) => e.count);
  const byStage = [...O.error_summary.reduce((m, e) => m.set(e.stage, (m.get(e.stage) || 0) + e.count), new Map())].sort((a, b) => b[1] - a[1]);
  const modes = O.permission_mode_distribution, modeTotal = sum(modes, (r) => r.count);
  const bypass = modes.find((r) => r.value === "bypassPermissions")?.count || 0;
  const nullMax = NULL_ITEMS.map(([k, l]) => [k, l, H.recent.null_rates[k]]).sort((a, b) => b[2] - a[2])[0];
  const cap = (a, mid, b) => `<div class="cap"><span>${a}</span><span>${mid}</span><span>${b}</span></div>`;

  const overview = {
    key: "overview", title: "概況", lead: "全体の利用量と、集計データが正しく届いているか",
    groups: [
      { id: "use", label: "利用", scope: "直近 7 日と、その前の 7 日" },
      { id: "data", label: "データの届き具合", scope: "直近 7 日と、その前の 7 日" },
    ],
    cards: [
      { id: "users", group: "use", to: { tab: "usage" }, label: "送信した利用者", value: H.recent.terminals, unit: "人",
        delta: delta(H.recent.terminals - H.prev.terminals), sub: `前の 7 日 ${H.prev.terminals} 人`,
        viz: spark(trend.map((t) => t.users), WEEK) + cap(md(trend[0].day_label), "日ごとの人数", md(trend.at(-1).day_label)) },
      { id: "sessions", group: "use", to: { tab: "usage" }, label: "1 日あたりのセッション", value: sNow.toFixed(1), unit: "件",
        delta: delta(+(sNow - sPrev).toFixed(1), (v) => v.toFixed(1)), sub: `前の 7 日 ${sPrev.toFixed(1)} 件`,
        viz: spark(trend.map((t) => t.sessions), WEEK) + cap(md(trend[0].day_label), "日ごとの件数", md(trend.at(-1).day_label)) },
      { id: "cost", group: "use", to: { tab: "cost" }, label: "コスト（利用明細）", value: usd(cNow),
        delta: delta(((cNow - cPrev) / cPrev) * 100, (v) => v.toFixed(1) + "%"), sub: `${md(days.at(-WEEK))}〜${md(days.at(-1))} · 前 ${usd(cPrev)}`,
        viz: spark(days.slice(-28).map(total), WEEK) + cap(md(days.at(-28)), "日ごとの合計", md(days.at(-1))) },
      { id: "bypass", group: "use", to: { tab: "modes", facet: "mode" }, label: "確認なしで使われた記録", value: ((bypass / modeTotal) * 100).toFixed(1), unit: "%",
        sub: `${n(bypass)} / ${n(modeTotal)} 件 · 権限モードの内訳`,
        viz: hbars(DIST[0][2].map((r) => ({ label: DIST[0][3][r.value], value: r.count, max: modeTotal, tone: r.value === "bypassPermissions" ? "" : "ghost", text: pct((r.count / modeTotal) * 100) }))) },
      { id: "events", group: "data", to: { tab: "health", facet: "recv" }, label: "受信した記録", value: n(H.recent.events), unit: "件",
        delta: delta(H.recent.events - H.prev.events), sub: `前の 7 日 ${n(H.prev.events)} 件`,
        viz: hbars([{ label: "前の 7 日", value: H.prev.events, max: H.recent.events, tone: "ghost" }, { label: "直近 7 日", value: H.recent.events, max: H.recent.events }]) },
      { id: "recon", group: "data", to: { tab: "health", facet: "recv" }, label: "CSV との照合率", value: O.reconciliation_rate.toFixed(1), unit: "%", state: RULE.recon(O.reconciliation_rate),
        sub: `CSV にもいた ${O.reconciliation_numerator} 人 / 送信した ${O.reconciliation_denominator} 人`,
        viz: hbars([{ value: O.reconciliation_numerator, max: O.reconciliation_denominator }]) + `<div class="cap"><span>利用明細の最終日までの 7 日 · 前との比較なし</span></div>` },
      { id: "nulls", group: "data", to: { tab: "health", facet: "null" }, label: "項目の欠け（最も多い項目）", value: nullMax[2].toFixed(1), unit: "%", state: RULE.nullRate(nullMax[2]),
        sub: `${nullMax[1]} · 前の 7 日 ${pct(H.prev.null_rates[nullMax[0]])}`,
        viz: hbars(NULL_ITEMS.map(([k, l]) => ({ label: l, value: H.recent.null_rates[k], max: 100, text: pct(H.recent.null_rates[k]) }))) },
      { id: "errors", group: "data", to: { tab: "errors" }, label: "プラグインのエラー", value: errTotal, unit: "件", state: RULE.count(errTotal),
        sub: `${O.error_summary.length} 種類 · 前との比較なし`,
        viz: hbars(byStage.map(([s, v]) => ({ label: STAGE[s] || s, value: v, max: byStage[0][1], tone: "warn" }))) },
    ],
    tabs: [
      { id: "usage", label: "利用の推移", count: trend.length, scope: "直近 14 日 · その日に記録を送った利用者とセッションの数",
        list: () => ({
          rows: trend.map((t, i) => ({ ...t, i, span: i >= trend.length - WEEK ? "recent" : "prev" })),
          facet: { label: "期間", of: (r) => r.span, options: [["recent", "直近 7 日"], ["prev", "前の 7 日"]] },
          sort: ["day", "desc"],
          columns: [
            { key: "day", label: "日付", val: (r) => r.day, html: (r) => `${r.day_label} <span class="sub">${"日月火水木金土"[new Date(r.day_label).getDay()]}</span>` },
            { key: "span", label: "期間", html: (r) => `<span class="sub">${r.span === "recent" ? "直近 7 日" : "前の 7 日"}</span>` },
            { key: "users", label: "利用者数", num: true, val: (r) => r.users, html: (r) => `${r.users} 人` },
            { key: "ub", label: "", w: "22%", html: (r) => hbars([{ value: r.users, max: Math.max(...trend.map((t) => t.users)) }]) },
            { key: "sessions", label: "セッション数", num: true, val: (r) => r.sessions, html: (r) => `${r.sessions} 件` },
            { key: "sb", label: "", w: "22%", html: (r) => hbars([{ value: r.sessions, max: Math.max(...trend.map((t) => t.sessions)) }]) },
          ],
        }) },
      { id: "modes", label: "使われ方", count: sum(DIST, (d) => d[2].length), scope: "直近 7 日 · 記録の件数（開始のしかたはセッション開始の記録）",
        list: () => {
          const rows = DIST.flatMap(([kind, kl, list, map], ki) => { const t = sum(list, (r) => r.count); return list.map((r) => ({ kind, kl, ki, label: map[r.value] || r.value, count: r.count, share: (r.count / t) * 100 })); });
          return {
            rows, facet: { label: "区分", of: (r) => r.kind, options: DIST.map(([k, l]) => [k, l]) },
            sort: ["kind", "asc"],
            columns: [
              { key: "kind", label: "区分", val: (r) => r.ki * 1e6 - r.count, html: (r) => `<span class="sub">${r.kl}</span>` },
              { key: "label", label: "値", html: (r) => r.label },
              { key: "count", label: "件数", num: true, val: (r) => r.count, html: (r) => n(r.count) },
              { key: "share", label: "区分の中の割合", num: true, val: (r) => r.share, html: (r) => pct(r.share) },
              { key: "b", label: "", w: "30%", html: (r) => hbars([{ value: r.share, max: 50 }]) },
            ],
          };
        } },
      { id: "cost", label: "日ごとのコスト", count: days.length, scope: "利用明細（CSV）の全期間 · 日 × 提供元（USD）",
        pre: () => costChart(1112, 150) + `<div class="legend">${PROVIDERS.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}<span>濃い地 = 直近 7 日</span></div>`,
        list: () => {
          const span = (i) => (i >= days.length - WEEK ? "w1" : i >= days.length - 2 * WEEK ? "w2" : "old");
          const rows = days.map((d, i) => ({ d, span: span(i), v: byDay.get(d), t: total(d) }));
          const max = Math.max(...rows.map((r) => r.t));
          return {
            rows, search: (r) => r.d, placeholder: "日付で絞り込む（例 09-2）",
            facet: { label: "期間", of: (r) => r.span, options: [["w1", "直近 7 日"], ["w2", "前の 7 日"], ["old", "それより前"]] },
            sort: ["d", "desc"],
            columns: [
              { key: "d", label: "日付", val: (r) => r.d, html: (r) => r.d },
              ...PROVIDERS.map(([k, l]) => ({ key: k, label: l, num: true, val: (r) => r.v[k] || 0, html: (r) => (r.v[k] ? usd(r.v[k]) : `<span class="sub">—</span>`) })),
              { key: "t", label: "合計", num: true, val: (r) => r.t, html: (r) => `<b>${usd(r.t)}</b>` },
              { key: "b", label: "", w: "26%", html: (r) => hbars([{ value: r.t, max }]) },
            ],
          };
        } },
      { id: "health", label: "受信と項目の欠け", count: 3 + NULL_ITEMS.length, scope: "直近 7 日と前の 7 日 · 欠けの分母は、その項目が送られるはずの記録",
        note: "欠けは 20% 以下を正常、20% 超を注意、50% 超を要確認とします。100% に跳ねたら上流の仕様変更を疑います。照合率だけ期間の終わりが利用明細の最終日です。",
        list: () => ({
          rows: [
            { g: "recv", item: "受信した記録", now: `${n(H.recent.events)} 件`, prev: `${n(H.prev.events)} 件`, d: H.recent.events - H.prev.events, v: H.recent.events },
            { g: "recv", item: "送信した利用者", now: `${H.recent.terminals} 人`, prev: `${H.prev.terminals} 人`, d: H.recent.terminals - H.prev.terminals, v: H.recent.terminals },
            { g: "recv", item: "CSV との照合率", now: `${pct(O.reconciliation_rate)} <span class="sub">${O.reconciliation_numerator} / ${O.reconciliation_denominator} 人</span>`, prev: "—", d: null, v: O.reconciliation_rate, st: RULE.recon(O.reconciliation_rate) },
            ...NULL_ITEMS.map(([k, l]) => { const r = H.recent.null_rates[k], p = H.prev.null_rates[k]; return { g: "null", item: l, now: pct(r), prev: pct(p), d: +(r - p).toFixed(1), v: r, st: RULE.nullRate(r), pt: true }; }),
          ],
          facet: { label: "区分", of: (r) => r.g, options: [["recv", "受信"], ["null", "項目の欠け"]] },
          columns: [
            { key: "g", label: "区分", html: (r) => `<span class="sub">${r.g === "recv" ? "受信" : "項目の欠け"}</span>` },
            { key: "item", label: "項目", html: (r) => r.item },
            { key: "now", label: "直近 7 日", num: true, val: (r) => r.v, html: (r) => r.now },
            { key: "prev", label: "前の 7 日", num: true, html: (r) => `<span class="sub">${r.prev}</span>` },
            { key: "d", label: "差", num: true, html: (r) => (r.d == null ? `<span class="sub">—</span>` : `${K.sign(r.d)}${r.pt ? Math.abs(r.d).toFixed(1) + " pt" : n(Math.abs(r.d))}`) },
            { key: "st", label: "状態", html: (r) => (r.st ? dot(r.st) : `<span class="sub">—</span>`) },
          ],
        }) },
      { id: "errors", label: "プラグインのエラー", count: O.error_summary.length, scope: "直近 7 日 · 端末は利用者とホスト名の組 · 失った記録は戻りません",
        list: () => ({
          rows: O.error_summary, search: (r) => `${r.error_type} ${STAGE[r.stage] || r.stage}`, placeholder: "エラーの種類で絞り込む",
          facet: { label: "処理段階", of: (r) => r.stage, options: byStage.map(([s]) => [s, STAGE[s] || s]) },
          sort: ["count", "desc"],
          columns: [
            { key: "stage", label: "処理段階", val: (r) => STAGE[r.stage] || r.stage, html: (r) => STAGE[r.stage] || r.stage },
            { key: "type", label: "エラーの種類", val: (r) => r.error_type, html: (r) => `<span class="code">${esc(r.error_type)}</span>` },
            { key: "count", label: "件数", num: true, val: (r) => r.count, html: (r) => r.count },
            { key: "terminals", label: "端末数", num: true, val: (r) => r.terminals, html: (r) => `${r.terminals} 台` },
            { key: "version", label: "最後に起きた版", num: true, val: (r) => r.version, html: (r) => `<span class="code">${r.version}</span>` },
          ],
        }) },
    ],
  };

  function costChart(w, h) {
    const pad = { t: 8, b: 20, l: 40 }, max = Math.ceil(Math.max(...days.map(total)) / 100) * 100;
    const step = (w - pad.l) / days.length, bw = step * 0.7, y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    let g = "";
    for (let v = 0; v <= max; v += 100) g += `<line x1="${pad.l}" x2="${w}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="${v ? 0.6 : 1}"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">$${v}</text>`;
    g += `<rect x="${pad.l + (days.length - WEEK) * step}" y="${pad.t}" width="${WEEK * step}" height="${h - pad.t - pad.b}" fill="var(--track)"/>`;
    days.forEach((d, i) => {
      const x = pad.l + i * step + (step - bw) / 2; let acc = 0;
      for (const [k, l, c] of PROVIDERS) { const v = byDay.get(d)[k] || 0; if (v) g += `<rect x="${x.toFixed(1)}" y="${y(acc + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(acc) - y(acc + v)).toFixed(1)}" fill="${c}"><title>${d} ${l} ${usd(v)}</title></rect>`; acc += v; }
      if ((days.length - 1 - i) % 14 === 0) g += `<text x="${i === days.length - 1 ? x + bw : x + bw / 2}" y="${h - 4}" text-anchor="${i === days.length - 1 ? "end" : "middle"}">${md(d)}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:auto" role="img" aria-label="日ごとのコスト">${g}</svg>`;
  }

  // ---- 設定の適用状況の集計（利用者 → 端末の入れ子） ----
  const SETTINGS = {
    "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": ["自動圧縮の", "しきい値"],
    "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": ["プラグインの", "自動更新"],
    autoUpdatesChannel: ["本体の", "更新チャネル"],
    "env.DISABLE_AUTOUPDATER": ["自動更新の無効化", "を打ち消す"],
    "env.DISABLE_UPDATES": ["更新の無効化", "を打ち消す"],
    "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE": ["パッケージ", "マネージャ経由"],
  };
  const items = P.items.map((it) => ({ ...it, name: it.key_name === "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE" ? "パッケージマネージャ経由の自動更新" : (SETTINGS[it.key_name] || [it.key_name, ""]).join(""), name2: SETTINGS[it.key_name] || [it.key_name, ""], off: new Set(it.non_compliant.map((r) => r.user_email + "|" + r.host)) }));
  const staleIds = new Set(P.stale.map((r) => r.user_email + "|" + r.host));
  const terminals = P.latest_values.map((r) => {
    const id = r.user_email + "|" + r.host, on = items.map((it) => !it.off.has(id)), off = on.filter((v) => !v).length;
    return { ...r, on, off, stale: staleIds.has(id), ago: TODAY - r.day, status: off ? "off" : staleIds.has(id) ? "stale" : "ok" };
  });
  const users = new Map();
  for (const t of terminals) { if (!users.has(t.user_email)) users.set(t.user_email, { email: t.user_email, ts: [] }); users.get(t.user_email).ts.push(t); }
  for (const r of P.not_introduced) users.set(r.user_email, { email: r.user_email, ts: [], notintro: true });
  const userRows = [...users.values()].map((u) => {
    const on = items.map((_, i) => (u.notintro ? null : u.ts.every((t) => t.on[i])));
    const off = on.filter((v) => v === false).length, last = u.ts.reduce((m, t) => (!m || t.day > m.day ? t : m), null);
    const status = u.notintro ? "notintro" : off ? "noncompliant" : u.ts.some((t) => t.stale) ? "stale" : "ok";
    return { ...u, on, off, last, status };
  });
  const U_ST = { noncompliant: ["ng", "未適用あり"], notintro: ["warn", "未導入"], stale: ["neutral", "報告停止"], ok: ["ok", "すべて適用"] };
  const T_ST = { off: ["ng", "未適用"], stale: ["neutral", "報告停止"], ok: ["ok", "適用"] };
  const U_ORDER = { noncompliant: 0, notintro: 1, stale: 2, ok: 3 };
  const den = P.items[0].denominator, tCount = terminals.length;
  const semver = (v) => v.split(".").map(Number).reduce((s, x) => s * 1000 + x, 0);
  const latest = (list) => list.reduce((m, r) => (semver(r.version) > semver(m.version) ? r : m));
  const VERS = [["plugin", "プラグイン", P.plugin_versions], ["cc", "Claude Code 本体", P.claude_code_versions]];
  const cnt = (s) => userRows.filter((u) => u.status === s).length;
  const lastDay = (t) => (t ? `${t.day_label} <span class="sub">${t.ago ? `${t.ago} 日前` : "今日"}</span>` : `<span class="sub">報告なし</span>`);
  const offTerm = terminals.filter((t) => t.off).length;

  const policy = {
    key: "policy", title: "設定の適用状況", lead: "配布した設定が各端末で有効になっているか",
    groups: [
      { id: "rate", label: "設定ごとの適用率", scope: `対象: 利用明細の最終日までの 30 日にコストがある ${den} 人 · 1 台でも違う値なら未適用`, compact: true },
      { id: "exc", label: "対応が要る利用者・端末と、更新の届き具合", scope: "直近 30 日", compact: true },
    ],
    cards: [
      ...items.map((it) => ({ id: "rate-" + it.key_name, group: "rate", to: { tab: "settings", facet: it.key_name }, label: it.key_name === "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE" ? "パッケージマネージャ<wbr>経由の自動更新" : it.name2.join("<wbr>"), value: it.rate.toFixed(1), unit: "%", state: RULE.policyRate(it.rate),
        sub: `${it.numerator} / ${it.denominator} 人`, viz: hbars([{ value: it.numerator, max: it.denominator }]) })),
      { id: "noncompliant", group: "exc", to: { tab: "users", facet: "noncompliant" }, label: "未適用がある利用者", value: cnt("noncompliant"), unit: "人", state: RULE.count(cnt("noncompliant")),
        sub: `${den} 人のうち · 端末 ${offTerm} 台`, viz: hbars([{ value: cnt("noncompliant"), max: den, tone: "ng" }]) },
      { id: "notintro", group: "exc", to: { tab: "users", facet: "notintro" }, label: "プラグイン未導入の利用者", value: P.not_introduced.length, unit: "人", state: RULE.count(P.not_introduced.length),
        sub: `${den} 人のうち`, viz: hbars([{ value: P.not_introduced.length, max: den, tone: "warn" }]) },
      { id: "stale", group: "exc", to: { tab: "terminals", facet: "stale" }, label: `報告が ${STALE} 日以上止まった端末`, value: P.stale.length, unit: "台", state: RULE.count(P.stale.length),
        sub: `${tCount} 台のうち`, viz: hbars([{ value: P.stale.length, max: tCount, tone: "ghost" }]) },
      ...VERS.map(([k, l, list]) => { const L = latest(list), t = sum(list, (r) => r.count); return { id: "ver-" + k, group: "exc", to: { tab: "versions", facet: k }, label: `${k === "cc" ? "本体" : l}が<wbr>最新版の端末`, value: L.count, unit: "台",
        sub: `${t} 台のうち · <span class="code">${L.version}</span>`, viz: hbars([{ value: L.count, max: t }]) }; }),
    ],
    tabs: [
      { id: "users", label: "利用者ごと", count: userRows.length, scope: `対象: ${den} 人 · 設定の印は、その利用者の全端末が配布した値か`,
        note: `1 台でも違う値の端末があれば、その利用者は未適用と数えます。報告停止 = 最後の報告から ${STALE} 日以上経った端末がある利用者。`,
        list: () => ({
          rows: userRows, search: (r) => r.email, placeholder: "利用者で絞り込む",
          facet: { label: "状態", of: (r) => r.status, options: Object.entries(U_ST).map(([k, [c, l]]) => [k, l, c]) },
          sort: ["status", "asc"],
          legend: `<span><span class="mark on"></span>配布した値</span><span><span class="mark off"></span>違う値・未設定</span><span><span class="mark na"></span>報告なし</span>`,
          columns: [
            { key: "status", label: "状態", val: (r) => U_ORDER[r.status] * 100 - r.off, html: (r) => dot(U_ST[r.status][0], r.status === "noncompliant" ? `未適用 ${r.off} 項目` : U_ST[r.status][1]) },
            { key: "email", label: "利用者", val: (r) => r.email, html: (r) => mail(r.email) },
            { key: "ts", label: "端末", num: true, val: (r) => r.ts.length, html: (r) => (r.ts.length ? `${r.ts.length} 台` : `<span class="sub">—</span>`) },
            ...items.map((it, i) => ({ key: "s" + i, label: `<span class="th2">${it.name2[0]}<br>${it.name2[1]}</span>`, c: true, w: "104px",
              html: (r) => `<span class="mark ${r.on[i] == null ? "na" : r.on[i] ? "on" : "off"}" title="${it.name}"></span>` })),
            { key: "last", label: "最終報告日", val: (r) => r.last?.day ?? -1, html: (r) => lastDay(r.last) },
          ],
        }) },
      { id: "terminals", label: "端末ごと", count: tCount, scope: "対象: 直近 30 日に設定の報告があった端末（端末ごとに最新の報告 1 件）",
        list: () => ({
          rows: terminals, search: (r) => `${r.user_email} ${r.host}`, placeholder: "利用者・端末名で絞り込む",
          facet: { label: "状態", of: (r) => r.status, options: Object.entries(T_ST).map(([k, [c, l]]) => [k, l, c]) },
          sort: ["status", "asc"],
          columns: [
            { key: "status", label: "状態", val: (r) => ({ off: 0, stale: 1, ok: 2 })[r.status] * 100 - r.off, html: (r) => dot(...T_ST[r.status]) },
            { key: "user", label: "利用者", val: (r) => r.user_email, html: (r) => mail(r.user_email) },
            { key: "host", label: "端末名", val: (r) => r.host, html: (r) => `<span class="code">${esc(r.host)}</span>` },
            { key: "value", label: "自動圧縮のしきい値", hs: `配布した値 ${C.meta.constants.REFERENCE_VALUE}`, num: true, val: (r) => r.prev_value ?? "", html: (r) => (r.prev_value == null ? `<span class="sub">未設定</span>` : esc(r.prev_value)) },
            { key: "off", label: "未適用の設定", num: true, val: (r) => r.off, html: (r) => (r.off ? `${r.off} / ${items.length}` : `<span class="sub">0</span>`) },
            { key: "last", label: "最終報告日", val: (r) => r.day, html: (r) => lastDay(r) },
          ],
        }) },
      { id: "settings", label: "設定ごとの未適用", count: sum(items, (it) => it.non_compliant.length), scope: "対象: 直近 30 日に報告があり、最新の値が配布した値と違う端末",
        list: () => ({
          rows: items.flatMap((it) => it.non_compliant.map((r) => ({ ...r, key: it.key_name, name: it.name }))),
          search: (r) => `${r.user_email} ${r.host}`, placeholder: "利用者・端末名で絞り込む",
          facet: { label: "設定", of: (r) => r.key, options: items.map((it) => [it.key_name, it.name]) },
          sort: ["name", "asc"],
          columns: [
            { key: "name", label: "設定", val: (r) => items.findIndex((it) => it.key_name === r.key) * 1e6 + r.user_email.localeCompare(""), html: (r) => r.name },
            { key: "user", label: "利用者", val: (r) => r.user_email, html: (r) => mail(r.user_email) },
            { key: "host", label: "端末名", val: (r) => r.host, html: (r) => `<span class="code">${esc(r.host)}</span>` },
            { key: "value", label: "現在の値", html: (r) => (r.prev_value == null ? `<span class="sub">未設定</span>` : `<span class="code">${esc(r.prev_value)}</span>`) },
            { key: "day", label: "最終報告日", val: (r) => r.day, html: (r) => lastDay({ ...r, ago: TODAY - r.day }) },
          ],
        }) },
      { id: "versions", label: "バージョン", count: sum(VERS, (v) => v[2].length), scope: "対象: 直近 30 日に報告があった端末 · 端末ごとに最新の報告 1 件",
        note: "最新 = この期間に報告があった中で最も新しいバージョン。",
        list: () => ({
          rows: VERS.flatMap(([k, l, list]) => { const t = sum(list, (r) => r.count), L = latest(list); return list.map((r) => ({ k, l, ...r, t, share: (r.count / t) * 100, latest: r === L })); }),
          facet: { label: "種類", of: (r) => r.k, options: VERS.map(([k, l]) => [k, l]) },
          sort: ["ver", "desc"],
          columns: [
            { key: "k", label: "種類", html: (r) => `<span class="sub">${r.l}</span>` },
            { key: "ver", label: "バージョン", val: (r) => (r.k === "cc" ? 1e12 : 0) + semver(r.version), html: (r) => `<span class="code">${r.version}</span>${r.latest ? ` <span class="delta up" style="margin-left:6px;font-size:11px">最新</span>` : ""}` },
            { key: "count", label: "端末数", num: true, val: (r) => r.count, html: (r) => `${r.count} 台 <span class="sub">/ ${r.t}</span>` },
            { key: "share", label: "割合", num: true, val: (r) => r.share, html: (r) => pct(r.share) },
            { key: "b", label: "", w: "34%", html: (r) => hbars([{ value: r.count, max: r.t }]) },
          ],
        }) },
    ],
  };

  return { overview, policy };
})();
