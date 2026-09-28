"use strict";
const C = window.CTX, P = C.policy;
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
const TODAY = C.meta.today_epoch_day;

const SETTING = {
  "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": ["自動圧縮のしきい値", "しきい値"],
  "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": ["プラグインの自動更新", "プラグイン更新"],
  autoUpdatesChannel: ["本体の更新チャネル", "更新チャネル"],
  "env.DISABLE_AUTOUPDATER": ["自動更新の無効化を打ち消す", "自動更新"],
  "env.DISABLE_UPDATES": ["更新の無効化を打ち消す", "更新"],
  "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE": ["パッケージマネージャ経由の自動更新", "パッケージ"],
};
const STATUS = { ng1: ["ng", "未導入"], ng2: ["ng", "未適用"], warn: ["warn", "報告停止"], ok: ["ok", "適用済み"] };

/* 列見出しで並べ替えられる表。cols: {key, label, num?, html?(row)} */
function sortableTable(el, cols, init) {
  let rows = [], by = init.key, dir = init.dir;
  function draw() {
    const c = cols.find((x) => x.key === by);
    const val = c.sortVal || ((r) => r[by]);
    const sorted = rows.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    el.innerHTML = `<thead><tr>${cols.map((c) => {
      const on = c.key === by;
      return `<th class="${c.num ? "n" : ""}" aria-sort="${on ? (dir > 0 ? "ascending" : "descending") : "none"}" style="${c.w ? `width:${c.w}` : ""}">
        ${c.label ? `<button type="button" data-k="${c.key}">${c.label}<i aria-hidden="true">${on ? (dir > 0 ? "▲" : "▼") : "▲"}</i></button>` : `<span class="plain"></span>`}</th>`;
    }).join("")}</tr></thead><tbody>${sorted.map((r) =>
      `<tr class="${r._cls || ""}">${cols.map((c) => `<td class="${c.num ? "n" : ""}">${c.html ? c.html(r) : r[c.key]}</td>`).join("")}</tr>`).join("")}</tbody>`;
    el.querySelectorAll("th button").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.k;
      dir = k === by ? -dir : (cols.find((x) => x.key === k).num ? -1 : 1);
      by = k;
      draw();
    }));
  }
  return { set(r) { rows = r; draw(); } };
}

/* 設定ごとの適用率 */
const rateCols = [
  { key: "name", label: "設定", w: "38%", html: (r) => `${r.name}<span class="sub"><code>${r.key}</code></span>` },
  { key: "num", label: "適用済み", num: true, html: (r) => `${r.num}<span class="of"> / ${r.den} 人</span>` },
  { key: "rate", label: "適用率", num: true, html: (r) => `<span class="rate">${fmt(r.rate, 1)}%</span>` },
  { key: "rate_bar", label: "", sortVal: (r) => r.rate, html: (r) => `<div class="meter"><i style="width:${r.rate}%"></i></div>` },
  { key: "nc", label: "未適用の端末", num: true, html: (r) => `${r.nc} 台` },
];
const rates = sortableTable($("t-rates"), rateCols, { key: "rate", dir: 1 });
rates.set(P.items.map((it) => ({ key: it.key_name, name: SETTING[it.key_name][0], num: it.numerator, den: it.denominator, rate: it.rate, rate_bar: it.rate, nc: it.non_compliant.length })));
$("denom").textContent = P.items[0].denominator;

/* 端末ごとの状況: 最新の値・未適用・報告停止・未導入を 1 表にまとめる */
const staleSet = new Set(P.stale.map((s) => s.user_email + "|" + s.host));
const ncBy = {};
P.items.forEach((it) => it.non_compliant.forEach((n) => { (ncBy[n.user_email + "|" + n.host] ||= []).push(SETTING[it.key_name][1]); }));
const terms = P.latest_values.map((v) => {
  const id = v.user_email + "|" + v.host, nc = ncBy[id] || [];
  const st = staleSet.has(id) ? "warn" : nc.length ? "ng2" : "ok";
  return { user: v.user_email, host: v.host, value: v.prev_value, nc, day: v.day, day_label: v.day_label, st };
});
const noPlugin = P.not_introduced.map((u) => ({ user: u.user_email, host: null, value: undefined, nc: [], day: -1, day_label: null, st: "ng1" }));
const ALL = terms.concat(noPlugin);
const RANK = { ng1: 0, ng2: 1, warn: 2, ok: 3 };
const termCols = [
  { key: "st", label: "状態", w: "11%", sortVal: (r) => RANK[r.st], html: (r) => `<span class="st ${STATUS[r.st][0]}">${STATUS[r.st][1]}</span>` },
  { key: "user", label: "利用者", w: "22%", html: (r) => `<span class="mono">${r.user}</span>` },
  { key: "host", label: "端末名", w: "11%", sortVal: (r) => r.host || "", html: (r) => r.host ? `<span class="mono">${r.host}</span>` : `<span class="dim">不明</span>` },
  { key: "nc", label: "未適用の設定", sortVal: (r) => r.nc.length, html: (r) => r.nc.length ? `<b class="ncn">${r.nc.length}</b><span class="ncl">${r.nc.join("、")}</span>` : `<span class="dim">—</span>` },
  { key: "value", label: "しきい値", num: true, w: "9%", sortVal: (r) => r.value || "", html: (r) => r.value === undefined ? `<span class="dim">—</span>` : r.value === null ? `<span class="dim">未設定</span>` : r.value },
  { key: "day", label: "最終報告日", num: true, w: "14%", html: (r) => r.day_label ? `${r.day_label}${TODAY - r.day >= 1 ? `<span class="ago">${TODAY - r.day} 日前</span>` : ""}` : `<span class="dim">報告なし</span>` },
];
const termTable = sortableTable($("t-term"), termCols, { key: "st", dir: 1 });
$("n-term").textContent = terms.length;
$("n-ni").textContent = noPlugin.length;

function applyFilter() {
  const q = $("q").value.trim().toLowerCase();
  const period = document.querySelector('input[name="period"]:checked').value;
  const only = $("only").checked;
  const rows = ALL.filter((r) => {
    if (q && !r.user.toLowerCase().includes(q)) return false;
    if (only && r.st === "ok") return false;
    if (period === "7" && !(r.day >= 0 && TODAY - r.day < 7)) return false;
    if (period === "stale" && !(r.day >= 0 && TODAY - r.day >= 14)) return false;
    return true;
  });
  rows.forEach((r) => { r._cls = r.st === "ok" ? "" : "attn"; });
  termTable.set(rows);
  $("empty").hidden = rows.length > 0;
  $("t-term").hidden = rows.length === 0;
  const need = rows.filter((r) => r.st !== "ok").length;
  $("count").innerHTML = `<b>${rows.length}</b> / ${ALL.length} 行を表示 · うち要対応 <b class="c-ng">${need}</b>`;
}
$("filters").addEventListener("input", applyFilter);
applyFilter();

/* バージョン */
const verCols = [
  { key: "version", label: "バージョン", html: (r) => `<span class="mono">${r.version}</span>${r.latest ? `<span class="tag">最新</span>` : ""}` },
  { key: "count", label: "端末数", num: true, html: (r) => `${r.count} 台` },
  { key: "bar", label: "", sortVal: (r) => r.count, html: (r) => `<div class="meter thin"><i style="width:${(r.count / r.total) * 100}%"></i></div>` },
];
function verRows(list) {
  const total = list.reduce((s, r) => s + r.count, 0);
  const top = list.map((r) => r.version).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).pop();
  return list.map((r) => ({ ...r, total, bar: r.count, latest: r.version === top }));
}
sortableTable($("t-plugin"), verCols, { key: "version", dir: -1 }).set(verRows(P.plugin_versions));
sortableTable($("t-cc"), verCols, { key: "version", dir: -1 }).set(verRows(P.claude_code_versions));

$("asof").textContent = C.meta.generated_at.slice(0, 16).replace("T", " ");
