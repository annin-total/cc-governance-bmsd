(() => {
  const C = window.CTX, P = C.policy;
  const { mount, esc } = window.DenseTable;
  const $ = (id) => document.getElementById(id);
  const TODAY = C.meta.today_epoch_day;

  const SETTINGS = {
    "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": { name: "自動圧縮のしきい値", value: "60" },
    "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": { name: "プラグインの自動更新", value: "true" },
    autoUpdatesChannel: { name: "本体の更新チャネル", value: "latest" },
    "env.DISABLE_AUTOUPDATER": { name: "自動更新の無効化を打ち消す", value: "0" },
    "env.DISABLE_UPDATES": { name: "更新の無効化を打ち消す", value: "0" },
    "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE": { name: "パッケージマネージャ経由の自動更新", value: "1" },
  };
  const nameOf = (k) => SETTINGS[k]?.name ?? k;
  const user = (r) => esc(r.user_email.replace("@example.com", ""));
  const valueCell = (v) => (v === null || v === undefined ? `<span class="tag ng">未設定</span>` : `<span class="val-code">${esc(v)}</span>`);
  const rateState = (r) => (r >= 90 ? "ok" : r >= 75 ? "warn" : "ng");

  $("gen").textContent = C.meta.generated_at.slice(0, 16).replace("T", " ");
  $("csv").textContent = P.csv_imported ? "取り込み済み" : "未取り込み";

  const rateRows = P.items.map((it) => ({ ...it, name: nameOf(it.key_name), dist: SETTINGS[it.key_name]?.value ?? "", terms: it.non_compliant.length, users: new Set(it.non_compliant.map((r) => r.user_email)).size }));
  mount($("t-rate"), {
    rows: rateRows, unit: "設定",
    search: { placeholder: "設定名で絞り込み", keys: ["name", "key_name"] },
    sort: { key: 3, dir: 1 },
    rowClass: (r) => (rateState(r.rate) === "ng" ? "is-ng" : rateState(r.rate) === "warn" ? "is-warn" : ""),
    columns: [
      { key: "name", label: "設定", cls: "two", render: (r) => `${esc(r.name)}<span class="key" title="${esc(r.key_name)}">${esc(r.key_name)}</span>` },
      { key: "dist", label: "配布値", render: (r) => `<span class="val-code">${esc(r.dist)}</span>` },
      { key: "numerator", label: "適用 / 対象", num: true, render: (r) => `${r.numerator} / ${r.denominator} 人` },
      { key: "rate", label: "適用率", num: true, render: (r) => `<span class="meter"><span class="trk"><span style="width:${r.rate}%"></span></span>${r.rate.toFixed(1)}%</span>` },
      { key: "terms", label: "未適用", num: true, render: (r) => `${r.users} 人 / ${r.terms} 台` },
    ],
  });

  mount($("t-noplug"), {
    rows: P.not_introduced, unit: "人",
    search: { placeholder: "利用者で絞り込み", keys: ["user_email"] },
    rowClass: () => "is-ng",
    columns: [
      { key: "user_email", label: "利用者", render: user },
      { key: "state", label: "状態", render: () => `<span class="tag ng">未導入</span>` },
    ],
  });

  const stale = P.stale.map((r) => ({ ...r, ago: TODAY - r.last_day }));
  mount($("t-stale"), {
    rows: stale, unit: "台",
    search: { placeholder: "利用者・端末名で絞り込み", keys: ["user_email", "host"] },
    sort: { key: 3, dir: -1 },
    rowClass: () => "is-warn",
    columns: [
      { key: "user_email", label: "利用者", render: user },
      { key: "host", label: "端末名", cls: "mono" },
      { key: "last_day_label", label: "最終報告日", cls: "mono" },
      { key: "ago", label: "経過", num: true, render: (r) => `${r.ago} 日` },
    ],
  });

  const nc = P.items.flatMap((it) => it.non_compliant.map((r) => ({ ...r, key_name: it.key_name, name: nameOf(it.key_name) })));
  mount($("t-nc"), {
    rows: nc, unit: "行",
    search: { placeholder: "利用者・端末名で絞り込み", keys: ["user_email", "host", "name"] },
    select: { label: "設定で絞り込み", all: "すべての設定", options: P.items.map((it) => ({ value: it.key_name, label: nameOf(it.key_name) })), match: (r, v) => r.key_name === v },
    rowClass: () => "is-ng",
    columns: [
      { key: "name", label: "設定", cls: "clip", render: (r) => `<span title="${esc(r.name)}">${esc(r.name)}</span>` },
      { key: "user_email", label: "利用者", render: user },
      { key: "host", label: "端末名", cls: "mono" },
      { key: "prev_value", label: "現在の値", render: (r) => valueCell(r.prev_value) },
      { key: "day", label: "最終報告日", num: true, render: (r) => r.day_label.slice(5) },
    ],
  });

  mount($("t-latest"), {
    rows: P.latest_values, unit: "台",
    search: { placeholder: "利用者・端末名で絞り込み", keys: ["user_email", "host"] },
    select: { label: "値で絞り込み", all: "すべての値", options: [{ value: "ok", label: "配布値（60）" }, { value: "ng", label: "違う値・未設定" }], match: (r, v) => (r.prev_value === "60") === (v === "ok") },
    sort: { key: 2, dir: 1 },
    rowClass: (r) => (r.prev_value === "60" ? "" : "is-ng"),
    columns: [
      { key: "user_email", label: "利用者", render: user },
      { key: "host", label: "端末名", cls: "mono" },
      { key: "prev_value", label: "現在の値", sortVal: (r) => r.prev_value ?? "", render: (r) => valueCell(r.prev_value) },
      { key: "ts", label: "最終報告", num: true, render: (r) => r.ts_label.slice(0, 16).replace("T", " ") },
    ],
  });

  const ver = (id, rows) => mount($(id), {
    rows, unit: "版", search: { placeholder: "", keys: ["version"] },
    sort: { key: 0, dir: -1 },
    columns: [
      { key: "version", label: "バージョン", cls: "mono", sortVal: (r) => r.version.split(".").map((n) => n.padStart(5, "0")).join(".") },
      { key: "count", label: "端末数", num: true, render: (r) => `${r.count} 台` },
    ],
  });
  ver("t-pv", P.plugin_versions);
  ver("t-cv", P.claude_code_versions);
})();
