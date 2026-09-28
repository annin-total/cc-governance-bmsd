// 全体: 4 画面それぞれの要点カードを 1〜2 枚ずつ並べる。カードは各画面の該当タブへ移る。
(() => {
  const { n, usd, sign, md, dot, rows, stack, meter, waffle, spark, cap } = UI;
  const { C, O, H, WEEK, trend, cost, roster, terminals, count, userDenominator, items, sum, avg } = M;
  const E = C.effect, A = C.assets;
  const TONE_COLOR = { ng: "var(--ng)", warn: "#c89a52", neutral: "var(--ghost)", ok: "var(--accent)" };
  const USER_ST = { ok: "すべて適用", ng: "未適用あり", warn: "未導入", neutral: "報告停止" };
  const isOurs = (name) => name.startsWith("governance:");

  // 設定の効果: 圧縮直前のコンテキストの中央の区間と、1 人 1 日あたりのコスト
  const medianBin = (bins) => {
    const half = sum(bins, (b) => b.count) / 2;
    let acc = 0;
    return bins.find((b) => (acc += b.count) >= half).bin_label;
  };
  const ctx = E.context_pre_compact;
  const before = E.study.filter((r) => r.relative_day < 0), after = E.study.filter((r) => r.relative_day > 0);
  const costB = avg(before.map((r) => r.cost)), costA = avg(after.map((r) => r.cost));

  // スキル・コマンド: 配布物（governance: で始まる名前）
  const ourSkills = A.skills.filter((s) => isOurs(s.skill_name));
  const ourCmds = A.commands.filter((c) => isOurs(c.command_name));
  const ourNow = sum([...ourSkills, ...ourCmds], (x) => x.recent_calls), ourPrev = sum([...ourSkills, ...ourCmds], (x) => x.prev_calls);
  const ourRows = [
    ...ourSkills.map((s) => [`${s.skill_name.replace("governance:", "")}（スキル）`, s.recent_calls]),
    ...Object.entries(ourCmds.reduce((m, c) => ((m[c.command_name] = (m[c.command_name] || 0) + c.recent_calls), m), {})).map(([k, v]) => [`${k.replace("governance:", "")}（コマンド）`, v]),
  ];
  const ourMax = Math.max(...ourRows.map((r) => r[1]));

  const need = count(roster, "ng") + count(roster, "warn");
  const errTotal = sum(O.error_summary, (e) => e.count);
  const staleN = terminals.filter((t) => t.stale).length;
  const decor = `<span class="decor">未作成</span>`;
  const bins = (list) => { const m = new Map(list.map((b) => [b.bin, b.count])); return m; };
  const allBins = [...new Set([...ctx.before, ...ctx.after].map((b) => b.bin))].sort((a, b) => a - b);

  const GROUPS = [
    { id: "ov", label: `<span class="gt"><a href="index.html">概況</a></span>`, scope: "全体でいくらかかり、誰が使っているか",
      foot: `${dot(errTotal ? "warn" : "ok", errTotal ? "注意" : "正常")} データの届き具合: エラー ${errTotal} 件<br><a href="index.html">概況の詳しい一覧へ →</a>` },
    { id: "pol", label: `<span class="gt"><a href="policy.html">設定の適用状況</a></span>`, scope: "配布した設定は各端末で有効か",
      foot: `報告が止まった端末 ${staleN} 台 · 版の分布は画面内<br><a href="policy.html">設定の適用状況の詳しい一覧へ →</a>` },
    { id: "eff", label: `<span class="gt">設定の効果${decor}</span>`, scope: "自動圧縮のしきい値の強制は効いたか",
      foot: `コストの前後差には時期の違いも含まれるため、効果とは読めません。設定の働きはコンテキストの大きさで見ます。` },
    { id: "ast", label: `<span class="gt">スキル・コマンドの利用${decor}</span>`, scope: "配布したスキルやコマンドは使われているか",
      foot: `直近 7 日に使われたスキル ${A.skills.length} 種・コマンド ${new Set(A.commands.map((c) => c.command_name)).size} 種` },
  ];
  const CARDS = [
    { group: "ov", href: "index.html#trend", label: "送信した利用者", value: H.recent.terminals, unit: "人",
      delta: { text: sign(H.recent.terminals - H.prev.terminals) + Math.abs(H.recent.terminals - H.prev.terminals) }, sub: `直近 7 日 · 前の 7 日 ${H.prev.terminals} 人`,
      viz: spark(trend.map((t) => t.users), WEEK) + cap(md(trend[0].day_label), "日ごとの人数", md(trend.at(-1).day_label)) },
    { group: "ov", href: "index.html#cost", label: "コスト（利用明細）", value: usd(cost.now),
      delta: { text: sign(cost.now - cost.prev) + Math.abs(((cost.now - cost.prev) / cost.prev) * 100).toFixed(1) + "%", up: true }, sub: `直近 7 日 · 前の 7 日 ${usd(cost.prev)}`,
      viz: spark(cost.days.slice(-28).map(cost.dayTotal), WEEK) + cap(md(cost.days.at(-28)), "日ごとの合計", md(cost.days.at(-1))) },
    { group: "pol", href: "policy.html#users:ok", label: "すべての設定を適用した利用者", value: roster.filter((r) => r.status === "ok").length, unit: `/ ${userDenominator} 人`,
      status: "warn", sub: `${items.length} つの設定 · 直近 30 日`,
      viz: waffle(roster.map((r) => TONE_COLOR[r.status])) + `<div class="legend">${Object.entries(USER_ST).map(([k, l]) => `<span><i class="sw" style="background:${TONE_COLOR[k]}"></i>${l}</span>`).join("")}</div>` },
    { group: "pol", href: "policy.html#users:ng", label: "対応が要る利用者", value: need, unit: "人", status: need ? "ng" : "ok", statusText: need ? "要対応" : "正常",
      sub: "設定の未適用と、プラグインの未導入",
      viz: stack([["未適用あり", count(roster, "ng"), "var(--ng)", `${count(roster, "ng")} 人`], ["未導入", count(roster, "warn"), "#c89a52", `${count(roster, "warn")} 人`]]) },
    { group: "eff", href: "#", label: "圧縮直前のコンテキスト（中央）", value: medianBin(ctx.after), unit: "トークン",
      sub: `適用前 ${medianBin(ctx.before)} · 前後 ${E.span} 日`, viz: hist(allBins, bins(ctx.before), bins(ctx.after)) },
    { group: "eff", href: "#", label: "1 人 1 日あたりのコスト", value: usd(costA),
      delta: { text: sign(costA - costB) + Math.abs(((costA - costB) / costB) * 100).toFixed(1) + "%" }, sub: `適用前 ${usd(costB)} · 前後 ${E.span} 日`,
      viz: spark(E.study.map((r) => r.cost), after.length) + cap(`前 ${E.span} 日`, "0 日目を除く", `後 ${E.span} 日`) },
    { group: "ast", href: "#", label: "配布物の呼び出し", value: n(ourNow), unit: "回",
      delta: { text: sign(ourNow - ourPrev) + Math.abs(((ourNow - ourPrev) / ourPrev) * 100).toFixed(1) + "%" }, sub: `直近 7 日 · 前の 7 日 ${n(ourPrev)} 回`,
      viz: rows(ourRows.map(([l, v]) => [l, v, ourMax, `${v} 回`]), "128px") },
    { group: "ast", href: "#", label: "サブエージェントを使った記録", value: A.subagent_rate.toFixed(1), unit: "%",
      sub: `${n(A.subagent_numerator)} 件 / 全記録 ${n(A.subagent_denominator)} 件 · 直近 7 日`, viz: meter(A.subagent_numerator, A.subagent_denominator) + cap("全記録に対する割合") },
  ];

  function hist(keys, b, a) {
    const w = 300, h = 50, max = Math.max(...b.values(), ...a.values()), step = w / keys.length;
    const bar = (m, color, dx) => keys.map((k, i) => { const v = m.get(k) || 0, bh = (v / max) * (h - 4);
      return `<rect x="${i * step + dx}" y="${h - bh}" width="${step / 2 - 2}" height="${bh}" fill="${color}"/>`; }).join("");
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" style="height:50px">${bar(b, "var(--ghost)", 1)}${bar(a, "var(--accent)", step / 2)}</svg>` +
      `<div class="legend"><span><i class="sw" style="background:var(--ghost)"></i>適用前</span><span><i class="sw" style="background:var(--accent)"></i>適用後</span><span>20k ごとの区間</span></div>`;
  }

  UI.nav(document.getElementById("nav"), "全体", C.meta.today_label);
  UI.cardGroups(document.getElementById("cards"), GROUPS, CARDS, () => {});
})();
