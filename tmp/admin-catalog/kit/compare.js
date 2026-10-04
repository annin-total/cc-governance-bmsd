"use strict";
// 比較用の切り替え（ia.js の compare: true）: 基準超えのカード・コストのカード・バージョンのカード・ヘッダー。
// `?over=O1..O5&cost=C31|C32&ver=V1..V3&head=H1|H2` で選び、押した値はタブを閉じるまで覚える。既定は案の look（推奨）。
(() => {
  const K = window.KIT;
  const SWITCHES = {
    over: { label: "基準超え", variants: { O1: "注意以上", O2: "要確認", O3: "2 つの数字", O4: "金額の見出し", O5: "概況は O4" } },
    cost: { label: "コスト", variants: { C31: "1 枚", C32: "2 枚" } },
    ver: { label: "バージョン", variants: { V1: "段階の色", V2: "2 区分", V3: "エラーは行" } },
    head: { label: "ヘッダー", variants: { H1: "右端に 2 つ", H2: "右端に 1 つ" } },
  };
  const KEY = (param) => `kit-${param}`;

  function remembered(param) {
    try { return sessionStorage.getItem(KEY(param)); } catch (e) { return null; }
  }

  // 選んだ値（URL・覚えた値・案の既定の順）
  function chosen(param, def) {
    const v = new URLSearchParams(location.search).get(param) || remembered(param);
    return v in SWITCHES[param].variants ? v : def;
  }

  // 案の look に、選んだ見せ方を重ねる
  const look = (base = {}) => {
    const defs = { ...K.look.DEFAULTS, ...base };
    return Object.fromEntries(Object.keys(defs).map((p) => [p, p in SWITCHES ? chosen(p, defs[p]) : defs[p]]));
  };

  function html() {
    const now = K.look.get();
    const href = (param, id) => { const q = new URLSearchParams(location.search); q.set(param, id); return `?${q}${location.hash}`; };
    const group = ([param, s]) => `<span class="cmp-group"><span>${K.esc(s.label)}</span>${Object.entries(s.variants).map(([id, name]) =>
      `<a href="${K.esc(href(param, id))}" data-cmp="${param}" data-cmp-id="${id}"${id === now[param] ? ' aria-current="true"' : ""}>${id} ${K.esc(name)}</a>`).join("")}</span>`;
    return `<nav class="cmp-bar" aria-label="比較用の切り替え"><span class="cmp-tag">比較用</span>${Object.entries(SWITCHES).map(group).join("")}</nav>`;
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("[data-cmp]");
    if (!a) return;
    try { sessionStorage.setItem(KEY(a.dataset.cmp), a.dataset.cmpId); } catch (err) { /* 覚えられなくても URL で選べる */ }
  });

  K.compare = { look, html };
})();
