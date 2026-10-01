"use strict";
// 比較用の切り替え: 増減のチップの見せ方（案 31 だけ。ia.js の compare: true）。`?chips=A|B|C|D` で選び、押した値はタブを閉じるまで覚える。
(() => {
  const K = window.KIT;
  const PARAM = "chips";
  const KEY = "kit-chips";
  const VARIANTS = {
    A: { name: "今のまま", delta: {} },
    B: { name: "青と赤", delta: { palette: "br" } },
    C: { name: "緑と赤", delta: { palette: "gr" } },
    D: { name: "記号と語", delta: { arrow: true, word: true, palette: "blue" } },
  };

  function remembered() {
    try { return sessionStorage.getItem(KEY); } catch (e) { return null; }
  }

  function chosen() {
    const v = new URLSearchParams(location.search).get(PARAM) || remembered();
    return v in VARIANTS ? v : "A";
  }

  // 案の look に、選んだ見せ方の delta を重ねる
  const look = (base = {}) => ({ ...base, delta: { ...(base.delta || {}), ...VARIANTS[chosen()].delta } });

  function html() {
    const now = chosen();
    const href = (id) => { const q = new URLSearchParams(location.search); q.set(PARAM, id); return `?${q}${location.hash}`; };
    return `<nav class="cmp-bar" aria-label="チップの見せ方（比較用）"><span>チップの見せ方（比較用）</span>${Object.entries(VARIANTS).map(([id, v]) =>
      `<a href="${K.esc(href(id))}" data-chips="${id}"${id === now ? ' aria-current="true"' : ""}>${id} ${K.esc(v.name)}</a>`).join("")}</nav>`;
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("[data-chips]");
    if (!a) return;
    try { sessionStorage.setItem(KEY, a.dataset.chips); } catch (err) { /* 覚えられなくても URL で選べる */ }
  });

  K.compare = { look, html, chosen };
})();
