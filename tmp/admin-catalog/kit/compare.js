"use strict";
// 比較用の切り替え（案 31 だけ。ia.js の compare: true）: 増減のチップの見せ方・文字の大きさの段・基準日の置き場。
// `?chips=A|B|C|D&fs=F5|F6|F7&base=P1|P2|P3|P4` で選び、押した値はタブを閉じるまで覚える。
(() => {
  const K = window.KIT;
  const SWITCHES = {
    chips: { label: "チップの見せ方", def: "A", variants: {
      A: { name: "今のまま", look: { delta: {} } },
      B: { name: "青と赤", look: { delta: { palette: "br" } } },
      C: { name: "緑と赤", look: { delta: { palette: "gr" } } },
      D: { name: "記号と語", look: { delta: { arrow: true, word: true, palette: "blue" } } },
    } },
    fs: { label: "文字の大きさ", def: "F5", variants: {
      F5: { name: "5 段", look: { fs: "F5" } },
      F6: { name: "6 段", look: { fs: "F6" } },
      F7: { name: "7 段", look: { fs: "F7" } },
    } },
    base: { label: "基準日の置き場", def: "P2", variants: {
      P1: { name: "ページ内", look: { asofAt: "page" } },
      P2: { name: "ヘッダー", look: { asofAt: "header" } },
      P3: { name: "期間の表示", look: { asofAt: "range" } },
      P4: { name: "ヘッダーと送り", look: { asofAt: "step" } },
    } },
  };
  const KEY = (param) => `kit-${param}`;

  function remembered(param) {
    try { return sessionStorage.getItem(KEY(param)); } catch (e) { return null; }
  }

  // 選んだ値（URL・覚えた値・既定の順）
  function chosen(param) {
    const v = new URLSearchParams(location.search).get(param) || remembered(param);
    return v in SWITCHES[param].variants ? v : SWITCHES[param].def;
  }

  // 案の look に、選んだ見せ方を重ねる
  function look(base = {}) {
    let out = { ...base };
    for (const param of Object.keys(SWITCHES)) {
      const over = SWITCHES[param].variants[chosen(param)].look;
      out = { ...out, ...over, delta: { ...(out.delta || {}), ...(over.delta || {}) } };
    }
    return out;
  }

  function html() {
    const href = (param, id) => { const q = new URLSearchParams(location.search); q.set(param, id); return `?${q}${location.hash}`; };
    const group = ([param, s]) => `<span class="cmp-group"><span>${K.esc(s.label)}</span>${Object.entries(s.variants).map(([id, v]) =>
      `<a href="${K.esc(href(param, id))}" data-cmp="${param}" data-cmp-id="${id}"${id === chosen(param) ? ' aria-current="true"' : ""}>${id} ${K.esc(v.name)}</a>`).join("")}</span>`;
    return `<nav class="cmp-bar" aria-label="比較用の切り替え"><span class="cmp-tag">比較用</span>${Object.entries(SWITCHES).map(group).join("")}</nav>`;
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("[data-cmp]");
    if (!a) return;
    try { sessionStorage.setItem(KEY(a.dataset.cmp), a.dataset.cmpId); } catch (err) { /* 覚えられなくても URL で選べる */ }
  });

  K.compare = { look, html, chosen };
})();
