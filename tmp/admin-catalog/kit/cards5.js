"use strict";
// 案 51 だけが読むカードの差し替え（目録のカードを look に合わせて変える。catalog.js の cardAdapters）:
// コストの 4 枚のグラフの型（look.chart。concepts5.md の 4.3）・基準超えの下段の型（look.over。4.4）・月末の見込みの前月の実績（look.forecastPrev）。
(() => {
  const K = window.KIT;
  const SAME = "same";
  // 型ごとの部品。書かないカードは目録のまま（31 の bars・pair・cum）
  const CHARTS = {
    K1: {},
    K2: { per_bd: { part: "bdbars" }, per_user_bd: { part: "bdbars", field: "per_user" }, forecast: { part: "cum", bars: true } },
    K3: { cost_total: { part: "area" }, per_bd: { part: "bdbars" } },
    K4: { cost_total: { part: "area" }, per_bd: { part: "bdbars", avg: true }, per_user_bd: { part: "dist" }, forecast: { part: "cum", prev: true } },
    K5: { cost_total: { part: "grid" }, per_bd: { part: "bdbars", avg: true }, per_user_bd: { part: "dist", strip: true }, forecast: { part: "cum", prev: true } },
    K7: { cost_total: { part: "area", shadow: true }, per_bd: { part: "bdbars", avg: true }, per_user_bd: { part: "dist" }, forecast: { part: "cum", prev: true } },
    K6: { cost_total: { part: "split" }, per_bd: { part: "bdbars", avg: true }, per_user_bd: { part: "line", field: "per_user" }, forecast: { part: "cum", prev: true } },
  };
  // 12 か月でも同じ部品で描くもの（ほかは目録の 12 か月の差し替え＝暦月ごとの棒）
  const LONG_TOO = new Set(["dist", "grid", "cum"]);
  const OVER = /^over_(day|week|month)_duo$/;

  function chart(card) {
    const spec = (CHARTS[K.look.get().chart] || {})[card.ref];
    if (!spec) return card;
    const viz = { kind: "k5", ...spec };
    const long = card.long === SAME || !LONG_TOO.has(spec.part) ? card.long : card.long && { ...card.long, viz, cap: [] };
    return { ...card, viz, cap: [], long };
  }

  function over(card) {
    const form = K.look.get().over;
    if (!form || !OVER.test(card.ref)) return card;
    return { ...card, viz: { ...card.viz, form }, wide: form === "D3" || card.wide };
  }

  // 「8 月の実績 $16,920」をチップの右に同じ行で小さく。添える数字からは外す
  function forecastPrev(card) {
    if (K.look.get().forecastPrev !== "chip" || card.ref !== "forecast") return card;
    return { ...card, sub: "", chipNote: K.L.FC_PREV_CHIP_TPL };
  }

  window.CATALOG.cardAdapters = [...(window.CATALOG.cardAdapters || []), chart, over, forecastPrev];
})();
