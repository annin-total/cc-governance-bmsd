"use strict";
const C = window.CTX;
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n, d = 0) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n), d);

const STAGE = { apply_settings: "設定の書き込み", collect: "記録の収集", send: "送信", identity: "利用者の特定",
  notices: "お知らせの表示", statusline: "ステータスラインの設定", mark_seen: "表示済みの記録" };
const FIELD = {
  tool_name: ["ツール名", "ツール実行の記録が分母"],
  skill_name: ["スキル名", "Skill ツールの実行記録が分母"],
  context_tokens: ["コンテキストのトークン数", "圧縮直前と応答終了の記録が分母"],
  command_source: ["コマンドの定義元", "コマンド展開の記録が分母"],
};
const PERM = { default: ["通常", "操作ごとに許可を求める"], acceptEdits: ["編集を自動承認", "ファイル編集は確認なし"],
  plan: ["プランモード", "計画だけ立て、変更はしない"], bypassPermissions: ["確認なし", "すべての操作を確認なし"] };
const EFFORT = { low: ["低"], medium: ["中"], high: ["高"] };
const SOURCE = { startup: ["新規起動"], resume: ["再開", "前のセッションを続けた"], clear: ["クリア後"], compact: ["圧縮後"] };
const PROVIDER = { "aws-bedrock": "AWS Bedrock", "google-vertex": "Google Vertex AI" };

const nullStatus = (r) => (r > 50 ? ["ng", "要確認"] : r > 20 ? ["warn", "注意"] : ["ok", "正常"]);

function renderHealth() {
  const h = C.overview.health, o = C.overview;
  const kpi = (label, val, unit, meta) =>
    `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-val">${val}<small>${unit}</small></div><div class="kpi-meta">${meta}</div></div>`;
  $("kpis").innerHTML =
    kpi("受信した記録", fmt(h.recent.events), "件", `前の 7 日 ${fmt(h.prev.events)} 件 · <b>${signed(h.recent.events - h.prev.events)}</b>`) +
    kpi("送信した利用者", fmt(h.recent.terminals), "人", `前の 7 日 ${fmt(h.prev.terminals)} 人 · <b>${signed(h.recent.terminals - h.prev.terminals)}</b>`) +
    kpi("CSV との照合率", fmt(o.reconciliation_rate, 1), "%", `CSV にもいた <b>${o.reconciliation_numerator}</b> 人 / 送信した ${o.reconciliation_denominator} 人`);

  $("errors").innerHTML = `<thead><tr><th>処理段階</th><th>エラーの種類</th><th class="n">件数</th><th class="n">端末数</th><th class="n">最後に起きた版</th></tr></thead><tbody>` +
    o.error_summary.map((e) => `<tr><td>${STAGE[e.stage] || e.stage}<span class="sub"><code>${e.stage}</code></span></td><td><code>${e.error_type}</code></td>
      <td class="n">${fmt(e.count)}</td><td class="n">${fmt(e.terminals)}</td><td class="n"><code>${e.version}</code></td></tr>`).join("") + "</tbody>";

  $("nulls").innerHTML = `<thead><tr><th>項目</th><th class="n">直近 7 日</th><th class="n">前の 7 日</th><th class="n">差</th><th>状態</th></tr></thead><tbody>` +
    Object.keys(h.recent.null_rates).map((k) => {
      const r = h.recent.null_rates[k], p = h.prev.null_rates[k], [cls, lab] = nullStatus(r);
      return `<tr><td>${FIELD[k][0]}<span class="sub">${FIELD[k][1]}</span></td><td class="n">${fmt(r, 1)}%</td><td class="n">${fmt(p, 1)}%</td>
        <td class="n delta">${signed(r - p, 1)} pt</td><td><span class="status ${cls}">${lab}</span></td></tr>`;
    }).join("") + "</tbody>";

  const errs = o.error_summary.reduce((s, e) => s + e.count, 0);
  $("sub-health").innerHTML = `<span class="dot" style="background:var(--ng)"></span>エラー ${errs} 件`;
}

function distTable(title, rows, dict) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(...rows.map((r) => r.count));
  return `<div class="dist"><h3>${title}</h3><table class="tbl"><tbody>` +
    rows.map((r) => {
      const [name, sub] = dict[r.value] || [r.value];
      return `<tr><td>${name}${sub ? `<span class="sub">${sub}</span>` : ""}</td><td class="n">${fmt(r.count)}</td>
        <td class="n delta">${fmt((r.count / total) * 100, 1)}%</td><td class="share"><div class="bar"><i style="width:${(r.count / max) * 100}%"></i></div></td></tr>`;
    }).join("") + `</tbody><tfoot><tr><td>計</td><td class="n">${fmt(total)}</td><td></td><td></td></tr></tfoot></table></div>`;
}

function renderUsage() {
  const t = C.overview.user_session_trend;
  const maxS = Math.max(...t.map((r) => r.sessions));
  $("trend").innerHTML = `<thead><tr><th>日付</th><th class="n">利用者数</th><th class="n">セッション数</th><th style="padding-left:32px"><span class="sr">セッション数の棒</span></th></tr></thead><tbody>` +
    t.slice().reverse().map((r) => {
      const d = new Date(r.day_label + "T00:00:00+09:00");
      const wd = "日月火水木金土"[d.getDay()];
      return `<tr><td class="num" style="text-align:left">${r.day_label} <span class="delta">(${wd})</span></td><td class="n">${r.users}</td><td class="n">${r.sessions}</td>
        <td><div class="bar"><i style="width:${(r.sessions / maxS) * 100}%"></i></div></td></tr>`;
    }).join("") + "</tbody>";
  $("dists").innerHTML =
    distTable("権限モード", C.overview.permission_mode_distribution, PERM) +
    distTable("effort（思考量）", C.overview.effort_level_distribution, EFFORT) +
    distTable("セッションの開始のしかた", C.overview.source_distribution, SOURCE);
  const last = t[t.length - 1];
  $("sub-usage").textContent = `今日 ${last.users} 人 · ${last.sessions} セッション`;
}

function renderCost() {
  const dc = C.overview.daily_cost;
  const days = [...new Set(dc.map((r) => r.day))].sort((a, b) => a - b);
  const label = Object.fromEntries(dc.map((r) => [r.day, r.day_label]));
  const provs = Object.keys(PROVIDER);
  const by = {};
  dc.forEach((r) => { (by[r.day] ||= {})[r.provider] = r.cost; });
  const last = days[days.length - 1];
  const sum = (p, from, to) => dc.filter((r) => r.provider === p && r.day > from && r.day <= to).reduce((s, r) => s + r.cost, 0);

  $("csv-last").textContent = label[last];
  $("wk-range").textContent = `${label[last - 6]}〜${label[last].slice(5)}`;
  $("all-range").textContent = `${label[days[0]]}〜${label[last]}`;
  $("days-n").textContent = days.length;

  let tr = 0, tp = 0;
  const rows = provs.map((p) => {
    const r = sum(p, last - 7, last), q = sum(p, last - 14, last - 7);
    tr += r; tp += q;
    return `<tr><td><span class="legend-i" style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;background:var(--prov-${p === "aws-bedrock" ? "a" : "b"})"></span>${PROVIDER[p]}</td>
      <td class="n">$${fmt(r, 2)}</td><td class="n">$${fmt(q, 2)}</td><td class="n delta">${signed(r - q, 2)}</td><td class="n delta">${signed(((r - q) / q) * 100, 1)}%</td></tr>`;
  });
  $("provider").innerHTML = `<thead><tr><th>提供元</th><th class="n">直近 7 日</th><th class="n">前の 7 日</th><th class="n">差（USD）</th><th class="n">増減率</th></tr></thead><tbody>${rows.join("")}</tbody>
    <tfoot><tr><td>合計</td><td class="n">$${fmt(tr, 2)}</td><td class="n">$${fmt(tp, 2)}</td><td class="n">${signed(tr - tp, 2)}</td><td class="n">${signed(((tr - tp) / tp) * 100, 1)}%</td></tr></tfoot>`;
  $("sub-cost").textContent = `直近 7 日 $${fmt(tr, 0)}`;

  renderCostChart(days, by, label, provs);

  $("daily").innerHTML = `<thead><tr><th>日付</th>${provs.map((p) => `<th class="n">${PROVIDER[p]}</th>`).join("")}<th class="n">合計</th></tr></thead><tbody>` +
    days.slice().reverse().map((d) => {
      const v = provs.map((p) => by[d][p]);
      const t = v.reduce((s, x) => s + (x || 0), 0);
      return `<tr><td class="num" style="text-align:left">${label[d]}</td>${v.map((x) => `<td class="n">${x == null ? "—" : fmt(x, 2)}</td>`).join("")}<td class="n"><b>${fmt(t, 2)}</b></td></tr>`;
    }).join("") + "</tbody>";
}

function renderCostChart(days, by, label, provs) {
  const W = 1060, H = 220, L = 44, R = 8, T = 10, B = 26;
  const totals = days.map((d) => provs.reduce((s, p) => s + (by[d][p] || 0), 0));
  const max = Math.ceil(Math.max(...totals) / 100) * 100;
  const bw = (W - L - R) / days.length;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let s = "";
  for (let v = 0; v <= max; v += 100) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? "#eceef1" : "#c9ced5"}"/>`;
    s += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v ? "$" + v : "0"}</text>`;
  }
  days.forEach((d, i) => {
    let acc = 0;
    provs.forEach((p, j) => {
      const v = by[d][p] || 0;
      if (!v) return;
      s += `<rect x="${L + i * bw + 1}" y="${y(acc + v)}" width="${bw - 2}" height="${y(acc) - y(acc + v)}" fill="var(--prov-${j ? "b" : "a"})"><title>${label[d]} ${PROVIDER[p]} $${fmt(v, 2)}</title></rect>`;
      acc += v;
    });
    if (label[d].endsWith("-01") || i === 0 || i === days.length - 1) {
      s += `<line x1="${L + i * bw + bw / 2}" x2="${L + i * bw + bw / 2}" y1="${H - B}" y2="${H - B + 4}" stroke="#9aa3ad"/>`;
      s += `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="${i === days.length - 1 ? "end" : i === 0 ? "start" : "middle"}">${label[d].slice(5).replace("-", "/")}</text>`;
    }
  });
  const legend = provs.map((p, j) => `<span><i style="background:var(--prov-${j ? "b" : "a"})"></i>${PROVIDER[p]}</span>`).join("");
  $("costchart").innerHTML = `<div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="日ごとのコストの積み上げ棒グラフ">${s}</svg>`;
}

/* タブ。選択は URL の # に保持する */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function select(hash, focus) {
  const cur = tabs.find((t) => t.dataset.hash === hash) || tabs[0];
  tabs.forEach((t) => {
    const on = t === cur;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute("aria-controls")).hidden = !on;
  });
  if (focus) cur.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => { location.hash = t.dataset.hash; });
  t.addEventListener("keydown", (e) => {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!k) return;
    const n = tabs[(i + k + tabs.length) % tabs.length];
    location.hash = n.dataset.hash;
    n.focus();
  });
});
window.addEventListener("hashchange", () => select(location.hash.slice(1)));

$("asof").textContent = C.meta.generated_at.slice(0, 16).replace("T", " ");
renderHealth();
renderUsage();
renderCost();
select(location.hash.slice(1));
