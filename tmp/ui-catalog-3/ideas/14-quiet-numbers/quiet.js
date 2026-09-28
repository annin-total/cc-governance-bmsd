"use strict";
// 案 14: サーバが描いた数値（静的な部分）にも、JS で描いた値と同じ「数字＋小さく薄い単位」の形を当てる
(() => {
  const { h, fmt, val } = UI;
  const NUM = /(\$)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(k|M|%| ?pt| (?:人日|人|件|回|行|トークン))?/g;
  const SCOPE = "td.num, .k-value, .k-sub, .rate .num";

  // テキストの中の「数字＋単位」を部品に分ける。日付や「7 日」は単位の一覧に無いので数字だけが揃う
  function wrap(node) {
    const s = node.textContent;
    if (!/\d/.test(s)) return;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const m of s.matchAll(NUM)) {
      frag.append(s.slice(at, m.index));
      const unit = (m[4] || "").trim();
      frag.append(val({ pre: m[1], n: m[2] + (m[3] || ""), unit, gap: /^ /.test(m[4] || "") }));
      at = m.index + m[0].length;
    }
    frag.append(s.slice(at));
    node.replaceWith(frag);
  }

  function walk(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest(".nv, .change, .u, svg") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(wrap);
  }

  // トークンの値: カードは k / M に丸め、表の列は列ごとに 1 つの単位（最大値で決める）にそろえる
  function tokens() {
    for (const card of document.querySelectorAll(".card")) {
      if (!/トークン/.test(card.querySelector(".k-label").textContent)) continue;
      for (const n of card.querySelectorAll(".k-value, .k-sub")) {
        for (const t of [...n.childNodes].filter((x) => x.nodeType === 3)) {
          const m = t.textContent.match(/^(.*?)(\d{1,3}(?:,\d{3})+)(.*)$/);
          if (!m || Number(m[2].replace(/,/g, "")) < 10000) continue;
          const p = fmt.tok(Number(m[2].replace(/,/g, "")));
          t.replaceWith(m[1], val(p, false), m[3]);
        }
      }
    }
    for (const table of document.querySelectorAll("table")) {
      const heads = [...table.querySelectorAll("thead th")];
      heads.forEach((th, i) => {
        if (!/トークン/.test(th.textContent) || /区間/.test(th.textContent)) return;
        const cells = [...table.querySelectorAll(`tbody tr > td:nth-child(${i + 1})`)];
        const max = Math.max(...cells.map((c) => Number(c.dataset.v)));
        const [div, unit, d] = max >= 1e6 ? [1e6, "M", 2] : [1e3, "k", 0];
        for (const c of cells) {
          const v = Number(c.dataset.v);
          c.replaceChildren(val({ n: UI.nf(v / div, d), unit, exact: `${UI.nf(v)} トークン` }));
        }
      });
    }
  }

  tokens();
  document.querySelectorAll(SCOPE).forEach(walk);
  UI.tooltips();
})();
