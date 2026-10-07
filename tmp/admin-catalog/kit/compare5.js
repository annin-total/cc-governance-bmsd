"use strict";
// 比較用の切り替え（案 51 だけ。ia.js の compare: "r5"）。切り替えは SWITCHES の表だけで定義し、表に足せばパネルに行が増える。
// 画面の右下の「☰ 比較」から開くパネル。選んだ値は URL と sessionStorage（タブを閉じるまで）、開いているかは localStorage に覚える。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const PERIOD_PAGES = ["home", "cost", "activity", "effect"];
  const USER_PAGES = ["cost", "activity", "policy", "collect"];
  const ALL = null; // 全ページで効く
  // キー（問い合わせ）: 名前・既定・効くページ・値（id: [短い名前, look])
  const SWITCHES = {
    g: { label: "群", def: "G31", pages: ["cost"], variants: { G31: ["31 のまま", { groups: "G31" }], G3: ["基準超えを利用者に", { groups: "G3" }] } },
    hv: { label: "ヘッダーの高さ", def: "HV1", pages: ALL, variants: { HV1: ["31 のまま", { hv: "HV1" }], HV2: ["1 段小さく", { hv: "HV2" }], HV3: ["1 行の最小", { hv: "HV3" }], HV4: ["スクロールで縮む", { hv: "HV4" }] } },
    chart: { label: "コストのグラフ", def: "K4", pages: ["home", "cost"], variants: {
      K1: ["31 のまま", { chart: "K1" }], K2: ["棒で揃える", { chart: "K2" }], K3: ["面と棒", { chart: "K3" }],
      K4: ["影と基準線", { chart: "K4" }], K5: ["マス目", { chart: "K5" }], K6: ["内訳", { chart: "K6" }], K7: ["影を重ねる", { chart: "K7" }] } },
    over: { label: "基準超えの新規と離脱", def: "D2", pages: ["home", "cost"], variants: {
      D1: ["状態ごと", { over: "D1" }], D2: ["出入りと移動", { over: "D2" }], D3: ["移動の表", { over: "D3" }],
      D4: ["悪化と改善", { over: "D4" }], D5: ["1 人 1 つの四角", { over: "D5" }], D6: ["差だけ", { over: "D6" }] } },
    sum: { label: "サマリー", def: "S1", pages: ["home"], variants: { S1: ["31 のまま", { sum: "S1" }], S2: ["枠の中に見出し", { sum: "S2" }] } },
    df: { label: "部署の絞り込み", def: "F2", pages: USER_PAGES, variants: { F0: ["置かない", { df: "F0" }], F1: ["常に並べる", { df: "F1" }], F2: ["ボタンとパネル", { df: "F2" }], F3: ["その場に開く", { df: "F3" }] } },
    cal: { label: "カレンダー", def: "CA1", pages: PERIOD_PAGES, variants: {
      CA1: ["月の格子", { cal: "CA1" }], CA2: ["2 か月", { cal: "CA2" }], CA3: ["前後の送り", { cal: "CA3" }], CA4: ["週ごと", { cal: "CA4" }],
      CA5: ["濃淡", { cal: "CA5" }], CA6: ["よく使う選択肢", { cal: "CA6" }], CA7: ["日の帯", { cal: "CA7" }] } },
    chip: { label: "増減のチップの色", def: "CH1", pages: ALL, variants: {
      CH1: ["緑と独自の赤", { chip: "CH1" }], CH2: ["要確認の赤", { chip: "CH2" }], CH3: ["悪化だけ色", { chip: "CH3" }], CH4: ["文字の色だけ", { chip: "CH4" }],
      CH5: ["枠線だけ", { chip: "CH5" }], CH6: ["青と橙", { chip: "CH6" }], CH7: ["色の点", { chip: "CH7" }] } },
    dfs: { label: "部署の絞り込みの部品", def: "DS1", pages: USER_PAGES, variants: {
      DS1: ["チェックボックス", { dfs: "DS1" }], DS2: ["色分けのチェック", { dfs: "DS2" }], DS3: ["塗られるチップ", { dfs: "DS3" }],
      DS4: ["木の形", { dfs: "DS4" }], DS5: ["検索とタグ", { dfs: "DS5" }], DS6: ["色の四角だけ", { dfs: "DS6" }],
      DS7: ["2 段のプルダウン", { dfs: "DS7" }], DS8: ["部の色の帯", { dfs: "DS8" }], DS9: ["条件のタグ", { dfs: "DS9" }] } },
    conc: { label: "利用者の集中", def: "CC1", pages: ["cost"], variants: {
      CC1: ["累積の曲線", { conc: "CC1" }], CC2: ["パレート図", { conc: "CC2" }], CC3: ["状態の階級の帯", { conc: "CC3" }], CC4: ["1 人 1 マス", { conc: "CC4" }] } },
    concd: { label: "部署と割合", def: "CD5", pages: ["cost"], variants: {
      CD5: ["コストの多い課", { concd: "CD5" }], CD1: ["2 本の横棒", { concd: "CD1" }], CD2: ["マリメッコ", { concd: "CD2" }], CD3: ["ツリーマップ", { concd: "CD3" }], CD4: ["散布図", { concd: "CD4" }] } },
    concAt: { label: "集中の置き場", def: "card", pages: ["cost"], variants: { card: ["カード", { concAt: "card" }], tab: ["詳細タブ", { concAt: "tab" }] } },
    y12: { label: "12 か月の前の年", def: "none", pages: ["home", "cost"], variants: { none: ["比べない", { y12: "" }], prev: ["前の 12 か月を並べる", { y12: "prev" }] } },
    oi: { label: "組織 CSV の取り込み", def: "OI1", pages: ["settings"], variants: {
      OI1: ["明細と同じ形", { oi: "OI1" }], OI2: ["要約の欄", { oi: "OI2" }], OI3: ["月の帯", { oi: "OI3" }], OI4: ["全月の表", { oi: "OI4" }], OI5: ["名前から年月", { oi: "OI5" }] } },
    rows: { label: "一覧の行の見本", def: "normal", pages: ["settings", "summary"], variants: { normal: ["通常", { rows: "" }], many: ["行の多い見本", { rows: "many" }] } },
    stale: { label: "利用明細の古さの警告", def: "W1", pages: ALL, variants: { W0: ["なし", { stale: "W0" }], W1: ["あり", { stale: "W1" }] } },
    lag: { label: "明細の遅れの見本", def: "normal", pages: ALL, variants: { normal: ["通常", { lag: "" }], lag: ["遅れ", { lag: "lag" }] } },
  };
  const NO_ID = ["normal", "lag", "card", "tab", "none", "prev", "many"]; // 値の名前だけで分かるもの（記号を前に付けない）
  const KEY = (param) => `kit5-${param}`;
  const OPEN_KEY = "kit5-compare-open";
  const store = (s, fn) => { try { return fn(s()); } catch (e) { return null; } }; // 覚えられなくても動く（読めなければ null）

  function chosen(param) {
    const v = new URLSearchParams(location.search).get(param) || store(() => sessionStorage, (s) => s.getItem(KEY(param)));
    return v in SWITCHES[param].variants ? v : SWITCHES[param].def;
  }

  // 案の look に、選んだ値を重ねる
  function look(base = {}) {
    return Object.keys(SWITCHES).reduce((out, p) => ({ ...out, ...SWITCHES[p].variants[chosen(p)][1] }), { ...base });
  }

  const hrefWith = (over) => { const q = new URLSearchParams(location.search); Object.entries(over).forEach(([k, v]) => (v === null ? q.delete(k) : q.set(k, v))); return `?${q}${location.hash}`; };
  const here = () => new URLSearchParams(location.search).get("page") || "home";

  function row([param, s]) {
    const off = s.pages && !s.pages.includes(here());
    return `<div class="cmp-row${off ? " is-off" : ""}" data-cmp-row="${param}"><span class="cmp-name">${esc(s.label)}</span><span class="cmp-vals">${Object.entries(s.variants).map(([id, [name]]) =>
      `<a href="${esc(hrefWith({ [param]: id }))}" data-cmp="${param}" data-cmp-id="${id}"${id === chosen(param) ? ' aria-current="true"' : ""}>${NO_ID.includes(id) ? "" : `${id} `}${esc(name)}</a>`).join("")}</span></div>`;
  }

  // 「☰ 比較」のボタンとパネル（閉じた状態で描き、開いているかは localStorage から）
  function html() {
    const L = K.L, changed = Object.keys(SWITCHES).filter((p) => chosen(p) !== SWITCHES[p].def).length;
    const open = store(() => localStorage, (s) => s.getItem(OPEN_KEY)) === "1";
    return `<div class="cmp5" data-cmp5><div class="cmp-panel" id="cmp-panel" role="dialog" aria-label="${esc(L.CMP_TITLE)}"${open ? "" : " hidden"}>`
      + `<div class="cmp-rows">${Object.entries(SWITCHES).map(row).join("")}</div>`
      + `<div class="cmp-foot"><button type="button" data-cmp-copy>${esc(L.CMP_COPY)}</button><a href="${esc(hrefWith(Object.fromEntries(Object.keys(SWITCHES).map((k) => [k, null]))))}" data-cmp-reset>${esc(L.CMP_RESET)}</a></div></div>`
      + `<button type="button" class="cmp-open" data-cmp-toggle aria-controls="cmp-panel" aria-expanded="${open}">${esc(L.CMP_OPEN)}${changed ? ` · ${changed}` : ""}</button></div>`;
  }

  // 全切り替えの今の値を入れた URL（コピー用）
  const fullUrl = () => location.href.split("?")[0] + hrefWith(Object.fromEntries(Object.keys(SWITCHES).map((p) => [p, chosen(p)])));

  function setOpen(open) {
    const root = document.querySelector("[data-cmp5]");
    if (!root) return;
    root.querySelector(".cmp-panel").hidden = !open;
    root.querySelector("[data-cmp-toggle]").setAttribute("aria-expanded", String(open));
    store(() => localStorage, (s) => s.setItem(OPEN_KEY, open ? "1" : "0"));
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-cmp-toggle]")) { setOpen(document.querySelector(".cmp-panel").hidden); return; }
    const a = t.closest("[data-cmp]");
    if (a) store(() => sessionStorage, (s) => s.setItem(KEY(a.dataset.cmp), a.dataset.cmpId));
    if (t.closest("[data-cmp-reset]")) store(() => sessionStorage, (s) => Object.keys(SWITCHES).forEach((p) => s.removeItem(KEY(p))));
    const copy = t.closest("[data-cmp-copy]");
    if (copy) {
      copy.dataset.url = fullUrl();
      Promise.resolve().then(() => navigator.clipboard.writeText(copy.dataset.url)).then(() => { copy.textContent = K.L.CMP_COPIED; }, (err) => console.warn(`compare5: URL をコピーできない（${err}）`));
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

  K.compare5 = { look, html, chosen, fullUrl, SWITCHES };
})();
