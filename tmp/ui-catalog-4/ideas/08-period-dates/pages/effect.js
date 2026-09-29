"use strict";
// 設定の効果: トークンの値を丸める（本実装ではサーバが描く）。カードは [data-tok]、表の列は [data-tok-col] で列ごとに単位をそろえる
(() => {
  const F = window.Fmt;
  for (const el of document.querySelectorAll("[data-tok]")) el.innerHTML = F.tok(Number(el.dataset.tok));
  const cells = [...document.querySelectorAll("[data-tok-col]")], fmt = F.tokCol(cells.map((c) => Number(c.dataset.v)));
  for (const c of cells) c.innerHTML = fmt(Number(c.dataset.v));
})();
