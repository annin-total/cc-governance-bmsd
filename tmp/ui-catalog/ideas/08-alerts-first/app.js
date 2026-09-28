"use strict";
const C = window.CTX, O = C.overview, H = O.health;
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n, d = 0) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n), d);

const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定",
  notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
const FIELD = { tool_name: "ツール名", skill_name: "スキル名", context_tokens: "コンテキストのトークン数", command_source: "コマンドの定義元" };
const LABEL = { ng: "要対応", warn: "注意", ok: "正常", info: "" };
const PERM = { default: "通常", acceptEdits: "編集を自動承認", plan: "プランモード", bypassPermissions: "確認なし" };
const EFFORT = { low: "低", medium: "中", high: "高" };
const SOURCE = { startup: "新規起動", resume: "再開", clear: "クリア後", compact: "圧縮後" };
const PROVIDER = { "aws-bedrock": "AWS Bedrock", "google-vertex": "Google Vertex AI" };

function nullStatus(k) {
  const r = H.recent.null_rates[k], d = r - H.prev.null_rates[k];
  if (r > 50) return ["ng", `${fmt(r, 1)}% が空（50% 超）`];
  if (r > 20) return ["warn", `${fmt(r, 1)}% が空（20% 超）`];
  if (d >= 5) return ["warn", `前の 7 日の ${fmt(H.prev.null_rates[k], 1)}% から ${fmt(r, 1)}% へ ${signed(d, 1)} ポイント`];
  return ["ok", ""];
}

/* 異常の一覧を組み立てる */
const alerts = [];
O.error_summary.forEach((e) => alerts.push({
  st: "ng", sec: "s-errors",
  title: `${STAGE[e.stage] || e.stage}で <code>${e.error_type}</code>`,
  fig: `${e.terminals} 端末 · ${e.count} 件`,
  detail: `処理段階 <code>${e.stage}</code> · 最後に起きた版 <code>${e.version}</code>`,
}));
Object.keys(FIELD).forEach((k) => {
  const [st, why] = nullStatus(k);
  if (st !== "ok") alerts.push({ st, sec: "s-nulls", title: `「${FIELD[k]}」の欠けが増えた`, fig: `${fmt(H.recent.null_rates[k], 1)}%`, detail: why });
});
alerts.sort((a, b) => (a.st === b.st ? 0 : a.st === "ng" ? -1 : 1));

function renderAlerts() {
  const n = { ng: alerts.filter((a) => a.st === "ng").length, warn: alerts.filter((a) => a.st === "warn").length };
  if (!alerts.length) {
    $("alerts-title").innerHTML = `<span class="dot ok"></span>異常なし`;
    $("alerts").innerHTML = `<p class="none">直近 7 日のエラー・項目の欠けに、基準を超えたものはありません。</p>`;
    return;
  }
  $("alerts-title").innerHTML = `確認が要る項目 <span class="cnt ng">要対応 ${n.ng}</span><span class="cnt warn">注意 ${n.warn}</span>`;
  $("alerts").innerHTML = `<ol class="alist">${alerts.map((a) => `
    <li class="al ${a.st}">
      <span class="al-st">${LABEL[a.st]}</span>
      <span class="al-t">${a.title}<span class="al-d">${a.detail}</span></span>
      <span class="al-f">${a.fig}</span>
      <a class="al-go" href="#${a.sec}" data-open="${a.sec}">内訳へ</a>
    </li>`).join("")}</ol>`;
  document.querySelectorAll("[data-open]").forEach((l) => l.addEventListener("click", () => { $(l.dataset.open).open = true; }));
}

function renderSections() {
  const errs = O.error_summary;
  $("k-errors").textContent = `${errs.length} 種類 · ${errs.reduce((s, e) => s + e.count, 0)} 件`;
  $("t-errors").innerHTML = `<thead><tr><th>処理段階</th><th>エラーの種類</th><th class="n">件数</th><th class="n">端末数</th><th class="n">最後に起きた版</th></tr></thead><tbody>` +
    errs.map((e) => `<tr><td>${STAGE[e.stage]} <span class="dim"><code>${e.stage}</code></span></td><td><code>${e.error_type}</code></td><td class="n">${e.count}</td><td class="n">${e.terminals}</td><td class="n"><code>${e.version}</code></td></tr>`).join("") + "</tbody>";

  const warnN = Object.keys(FIELD).filter((k) => nullStatus(k)[0] !== "ok").length;
  $("k-nulls").textContent = `4 項目中 ${warnN} 項目が基準超え · 最大 ${fmt(Math.max(...Object.values(H.recent.null_rates)), 1)}%`;
  $("t-nulls").innerHTML = `<thead><tr><th>項目</th><th class="n">直近 7 日</th><th class="n">前の 7 日</th><th class="n">差</th><th>状態</th></tr></thead><tbody>` +
    Object.keys(FIELD).map((k) => {
      const [st] = nullStatus(k), r = H.recent.null_rates[k], p = H.prev.null_rates[k];
      return `<tr class="${st}"><td>${FIELD[k]}</td><td class="n">${fmt(r, 1)}%</td><td class="n">${fmt(p, 1)}%</td><td class="n">${signed(r - p, 1)} pt</td><td><span class="pill ${st}">${LABEL[st]}</span></td></tr>`;
    }).join("") + "</tbody>";

  $("k-recv").textContent = `${fmt(H.recent.events)} 件（${signed(H.recent.events - H.prev.events)}）· ${H.recent.terminals} 人 · 照合 ${O.reconciliation_numerator} / ${O.reconciliation_denominator} 人`;
  $("t-recv").innerHTML = `<thead><tr><th>指標</th><th class="n">直近 7 日</th><th class="n">前の 7 日</th><th class="n">差</th></tr></thead><tbody>
    <tr><td>受信した記録<span class="dim">再送の重複は除く</span></td><td class="n">${fmt(H.recent.events)} 件</td><td class="n">${fmt(H.prev.events)} 件</td><td class="n">${signed(H.recent.events - H.prev.events)}</td></tr>
    <tr><td>送信した利用者</td><td class="n">${H.recent.terminals} 人</td><td class="n">${H.prev.terminals} 人</td><td class="n">${signed(H.recent.terminals - H.prev.terminals)}</td></tr>
    <tr><td>CSV との照合率<span class="dim">送信した利用者のうち、利用明細にも名前がある人</span></td><td class="n">${fmt(O.reconciliation_rate, 1)}%<span class="dim">${O.reconciliation_numerator} / ${O.reconciliation_denominator} 人</span></td><td class="n dim">—</td><td class="n dim">—</td></tr></tbody>`;

  renderCost();
  const t = O.user_session_trend, last = t[t.length - 1];
  $("k-trend").textContent = `今日 ${last.users} 人 · ${last.sessions} セッション`;
  $("t-trend").innerHTML = `<thead><tr><th>日付</th><th class="n">利用者数</th><th class="n">セッション数</th></tr></thead><tbody>` +
    t.slice().reverse().map((r) => `<tr><td class="num">${r.day_label}</td><td class="n">${r.users}</td><td class="n">${r.sessions}</td></tr>`).join("") + "</tbody>";

  const dist = (title, rows, dict) => {
    const tot = rows.reduce((s, r) => s + r.count, 0);
    return `<div><h4>${title}</h4><table class="tbl"><tbody>${rows.map((r) => `<tr><td>${dict[r.value] || r.value}</td><td class="n">${fmt(r.count)}</td><td class="n dim">${fmt((r.count / tot) * 100, 1)}%</td></tr>`).join("")}</tbody></table></div>`;
  };
  $("b-dist").innerHTML = dist("権限モード", O.permission_mode_distribution, PERM) + dist("effort（思考量）", O.effort_level_distribution, EFFORT) + dist("セッションの開始のしかた", O.source_distribution, SOURCE);

  document.querySelectorAll(".sec").forEach((d) => {
    const st = d.dataset.st;
    d.querySelector(".st").innerHTML = st === "info" ? `<span class="dot info"></span>` : `<span class="dot ${st}"></span>${LABEL[st]}`;
    d.classList.add(st);
  });
}

function renderCost() {
  const dc = O.daily_cost, days = [...new Set(dc.map((r) => r.day))].sort((a, b) => a - b);
  const last = days[days.length - 1], lab = Object.fromEntries(dc.map((r) => [r.day, r.day_label]));
  const sum = (from, to) => dc.filter((r) => r.day > from && r.day <= to).reduce((s, r) => s + r.cost, 0);
  const wk = sum(last - 7, last), pw = sum(last - 14, last - 7);
  $("csv-last").textContent = lab[last];
  $("k-cost").textContent = `CSV の最終日までの 7 日 $${fmt(wk, 2)}（前の 7 日 $${fmt(pw, 2)}）`;
  const by = {};
  dc.forEach((r) => { (by[r.day] ||= {})[r.provider] = r.cost; });
  $("b-cost").innerHTML = `<p class="note">全期間 ${lab[days[0]]}〜${lab[last]}（${days.length} 日）。新しい日から表示。</p><div class="scroll"><table class="tbl"><thead><tr><th>日付</th>${Object.values(PROVIDER).map((p) => `<th class="n">${p}</th>`).join("")}<th class="n">合計</th></tr></thead><tbody>` +
    days.slice().reverse().map((d) => {
      const v = Object.keys(PROVIDER).map((p) => by[d][p]);
      return `<tr><td class="num">${lab[d]}</td>${v.map((x) => `<td class="n">${x == null ? "—" : "$" + fmt(x, 2)}</td>`).join("")}<td class="n">$${fmt(v.reduce((s, x) => s + (x || 0), 0), 2)}</td></tr>`;
    }).join("") + "</tbody></table></div>";
}

$("asof").textContent = C.meta.generated_at.slice(0, 16).replace("T", " ");
$("wk").textContent = "2026-09-22〜09-28";
renderAlerts();
renderSections();
