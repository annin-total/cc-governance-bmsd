// 概況: 上段の要点カードと、下段のタブの定義。
(() => {
  const { n, pct, usd, sign, md, dot, rows, stack, meter } = UI;
  const { O, H, WEEK, trend, cost, sessions, nulls, errors, sum, DIST, PROVIDERS } = M;
  // 仮の判定基準（README に記載）
  const nullTone = (r) => (r > 50 ? "ng" : r > 20 ? "warn" : "ok");
  const changeTone = (now, prev) => (Math.abs(now - prev) / prev > 0.2 ? "warn" : "ok");
  const matchTone = (r) => (r < 80 ? "ng" : r < 95 ? "warn" : "ok");
  const ERR_SHADES = ["#8a5a12", "#b0823f", "#d2b186", "#e4d2b4"];

  const errByStage = [...errors.reduce((m, e) => m.set(e.stageLabel, (m.get(e.stageLabel) || 0) + e.count), new Map())].sort((a, b) => b[1] - a[1]);
  const errTotal = sum(errors, (e) => e.count);
  const worstNull = nulls.reduce((a, b) => (b.now > a.now ? b : a));
  const range = `${md(trend[0].day_label)} – ${md(trend.at(-1).day_label)}`;

  const GROUPS = [
    { id: "use", label: "利用", scope: "直近 7 日と、その前の 7 日" },
    { id: "data", label: "データの届き具合", scope: "直近 7 日と、その前の 7 日。照合率だけ利用明細（CSV）の最終日までの 7 日" },
  ];
  const CARDS = [
    { group: "use", tab: "trend", label: "送信した利用者", value: H.recent.terminals, unit: "人",
      delta: { text: sign(H.recent.terminals - H.prev.terminals) + Math.abs(H.recent.terminals - H.prev.terminals) }, sub: `前の 7 日 ${H.prev.terminals} 人`,
      viz: UI.spark(trend.map((t) => t.users), WEEK) + UI.cap(md(trend[0].day_label), "日ごとの人数", md(trend.at(-1).day_label)) },
    { group: "use", tab: "trend", label: "1 日あたりのセッション", value: sessions.now.toFixed(1), unit: "件",
      delta: { text: sign(sessions.now - sessions.prev) + Math.abs(sessions.now - sessions.prev).toFixed(1), up: sessions.now > sessions.prev }, sub: `前の 7 日 ${sessions.prev.toFixed(1)} 件（日ごとの平均）`,
      viz: UI.spark(trend.map((t) => t.sessions), WEEK) + UI.cap(md(trend[0].day_label), "日ごとの件数", md(trend.at(-1).day_label)) },
    { group: "use", tab: "cost", label: "コスト（利用明細）", value: usd(cost.now),
      delta: { text: sign(cost.now - cost.prev) + Math.abs(((cost.now - cost.prev) / cost.prev) * 100).toFixed(1) + "%", up: true }, sub: `${md(cost.days.at(-WEEK))}〜${md(cost.days.at(-1))} · 前の 7 日 ${usd(cost.prev)}`,
      viz: UI.spark(cost.days.slice(-28).map(cost.dayTotal), WEEK) + UI.cap(md(cost.days.at(-28)), "日ごとの合計", md(cost.days.at(-1))) },
    { group: "data", tab: "recv", label: "受信した記録", value: n(H.recent.events), unit: "件", status: changeTone(H.recent.events, H.prev.events),
      delta: { text: sign(H.recent.events - H.prev.events) + n(Math.abs(H.recent.events - H.prev.events)), up: true }, sub: `前の 7 日 ${n(H.prev.events)} 件`,
      viz: rows([["前の 7 日", H.prev.events, H.recent.events, n(H.prev.events), "var(--ghost)"], ["直近 7 日", H.recent.events, H.recent.events, n(H.recent.events)]], "58px") },
    { group: "data", tab: "recv", label: "CSV との照合率", value: O.reconciliation_rate.toFixed(1), unit: "%", status: matchTone(O.reconciliation_rate),
      sub: `CSV にもいた ${O.reconciliation_numerator} 人 / 送信した ${O.reconciliation_denominator} 人`,
      viz: meter(O.reconciliation_numerator, O.reconciliation_denominator) + UI.cap("前との比較なし") },
    { group: "data", tab: "errors", label: "プラグインのエラー", value: errTotal, unit: "件", status: errTotal ? "warn" : "ok",
      sub: `${errors.length} 種類 · 前との比較なし`, viz: stack(errByStage.map(([l, v], i) => [l, v, ERR_SHADES[i]])) },
    { group: "data", tab: "recv", label: "項目の欠け（最大）", value: worstNull.now.toFixed(1), unit: "%", status: nullTone(worstNull.now),
      sub: `${worstNull.label} · 20% を超えると注意`,
      viz: rows(nulls.map((x) => [x.label.replace("コンテキストの", "").replace("コマンドの", ""), x.now, 50, pct(x.now), x.now > 20 ? "var(--warn)" : "var(--accent)"]), "72px") },
  ];

  const TABS = [
    { id: "trend", label: "利用の推移", note: range, render(p, pre) {
      UI.head(p, "日ごとの利用者数とセッション数", "直近 14 日 · 日。濃い棒が直近 7 日");
      p.insertAdjacentHTML("beforeend", `<div class="cols"><div><h4>利用者数</h4>${UI.bars(trend.map((t) => t.users), trend.map((t) => md(t.day_label)), 540, 140, WEEK)}</div>
        <div><h4>セッション数</h4>${UI.bars(trend.map((t) => t.sessions), trend.map((t) => md(t.day_label)), 540, 140, WEEK)}</div></div>`);
      UI.list(p, { rows: trend, unit: "日", sortCol: 0, sortDir: -1, columns: [
        { label: "日付", cell: (r) => r.day_label, sort: (r) => r.day },
        { label: "利用者", num: 1, cell: (r) => `${r.users} 人`, sort: (r) => r.users },
        { label: "セッション", num: 1, cell: (r) => `${r.sessions} 件`, sort: (r) => r.sessions },
        { label: "1 人あたり", num: 1, cell: (r) => (r.sessions / r.users).toFixed(2), sort: (r) => r.sessions / r.users },
      ] }, pre);
    } },
    { id: "cost", label: "コスト", note: `直近 7 日 ${usd(cost.now)}`, render(p, pre) {
      UI.head(p, "日ごとのコスト", `利用明細（CSV）の全期間 ${cost.days[0]} 〜 ${cost.days.at(-1)} · 日 × 提供元（USD）`, `<button type="button" class="btn">CSV を取り込む</button>`);
      p.insertAdjacentHTML("beforeend", `<div style="margin-bottom:18px">${costChart(1150, 200)}<div class="cap" style="justify-content:flex-start;gap:18px;margin-top:8px">${PROVIDERS.map(([, l, c]) => `<span><i class="sw" style="background:${c}"></i>${l}</span>`).join("")}</div></div>`);
      const PV = Object.fromEntries(PROVIDERS.map(([k, l]) => [k, l]));
      UI.list(p, { rows: O.daily_cost, unit: "行", scroll: true, sortCol: 0, sortDir: -1,
        chips: { of: (r) => r.provider, options: PROVIDERS.map(([k, l]) => ({ key: k, label: l })) },
        search: { placeholder: "日付（例: 2026-09）", text: (r) => r.day_label },
        columns: [
          { label: "日付", cell: (r) => r.day_label, sort: (r) => r.day },
          { label: "提供元", cell: (r) => PV[r.provider] || r.provider, sort: (r) => r.provider },
          { label: "コスト", num: 1, cell: (r) => usd(r.cost), sort: (r) => r.cost },
          { label: "", cls: "bar-cell", cell: (r) => meter(r.cost, 400) },
        ] }, pre);
    } },
    { id: "recv", label: "受信と項目の欠け", note: `欠け 最大 ${pct(worstNull.now)}`, render(p, pre) {
      UI.head(p, "項目の欠け", "直近 7 日と前の 7 日 · 分母は、その項目が送られるはずの記録");
      UI.list(p, { rows: nulls, unit: "項目",
        chips: { of: (r) => nullTone(r.now), options: [{ key: "ng", label: "要対応", tone: "ng" }, { key: "warn", label: "注意", tone: "warn" }, { key: "ok", label: "正常", tone: "ok" }] },
        note: "欠け = 値が空だった割合。20% を超えると注意、50% を超えると要対応。100% に跳ねたら上流の仕様変更を疑います。",
        columns: [
          { label: "項目", cell: (r) => `${r.label} <span class="sub">分母: ${r.base}</span>`, sort: (r) => r.label },
          { label: "直近 7 日", num: 1, cell: (r) => pct(r.now), sort: (r) => r.now },
          { label: "前の 7 日", num: 1, cell: (r) => `<span class="sub">${pct(r.prev)}</span>`, sort: (r) => r.prev },
          { label: "差", num: 1, cell: (r) => `${sign(r.now - r.prev)}${Math.abs(r.now - r.prev).toFixed(1)} pt`, sort: (r) => r.now - r.prev },
          { label: "", cls: "bar-cell", cell: (r) => meter(r.now, 100, "var(--accent)") },
          { label: "状態", cell: (r) => dot(nullTone(r.now)), sort: (r) => r.now },
        ] }, pre);
    } },
    { id: "errors", label: "プラグインのエラー", note: `${errTotal} 件 · ${errors.length} 種類`, render(p, pre) {
      UI.head(p, "プラグインのエラー", "直近 7 日 · 端末 = 利用者とホスト名の組。失った記録は戻りません");
      UI.list(p, { rows: errors, unit: "種類", sortCol: 2, sortDir: -1,
        chips: { of: (r) => r.stageLabel, options: [...new Set(errors.map((e) => e.stageLabel))].map((l) => ({ key: l, label: l })) },
        search: { placeholder: "エラーの種類で絞り込む", text: (r) => r.error_type },
        columns: [
          { label: "処理段階", cell: (r) => r.stageLabel, sort: (r) => r.stageLabel },
          { label: "エラーの種類", cell: (r) => `<span class="code">${r.error_type}</span>`, sort: (r) => r.error_type },
          { label: "件数", num: 1, cell: (r) => r.count, sort: (r) => r.count },
          { label: "端末数", num: 1, cell: (r) => `${r.terminals} 台`, sort: (r) => r.terminals },
          { label: "最後に起きた版", num: 1, cell: (r) => `<span class="code">${r.version}</span>`, sort: (r) => r.version },
        ] }, pre);
    } },
    { id: "usage", label: "使われ方", note: `記録 ${n(H.recent.events)} 件`, render(p) {
      UI.head(p, "使われ方", "直近 7 日 · 記録の件数（開始のしかたはセッション開始の記録）");
      p.insertAdjacentHTML("beforeend", `<div class="cols" style="margin:0">${DIST.map(([title, list, map]) => {
        const t = sum(list, (r) => r.count), max = Math.max(...list.map((r) => r.count));
        return `<div><h4>${title} <span class="sub">計 ${n(t)} 件</span></h4><table><tbody>${list.map((r) =>
          `<tr><td>${map[r.value] || r.value}</td><td style="width:36%">${meter(r.count, max)}</td><td class="num">${n(r.count)}</td><td class="num sub">${pct((r.count / t) * 100)}</td></tr>`).join("")}</tbody></table></div>`;
      }).join("")}</div>`);
    } },
  ];

  function costChart(w, h) {
    const pad = { t: 10, b: 22, l: 44 }, max = Math.ceil(Math.max(...cost.days.map(cost.dayTotal)) / 100) * 100;
    const step = (w - pad.l) / cost.days.length, bw = step * 0.72, y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    let g = "";
    for (let v = 0; v <= max; v += 100) g += `<line x1="${pad.l}" x2="${w}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">$${v}</text>`;
    cost.days.forEach((d, i) => {
      const x = pad.l + i * step + (step - bw) / 2;
      let acc = 0;
      for (const [k, l, c] of PROVIDERS) {
        const v = cost.byDay.get(d)[k] || 0;
        if (v) g += `<rect x="${x}" y="${y(acc + v)}" width="${bw}" height="${y(acc) - y(acc + v)}" fill="${c}"><title>${d} ${l} ${usd(v)}</title></rect>`;
        acc += v;
      }
      if (i % 7 === 0) g += `<text x="${x + bw / 2}" y="${h - 4}" text-anchor="middle">${md(d)}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}">${g}</svg>`;
  }

  window.PAGE = { GROUPS, CARDS, TABS };
})();
