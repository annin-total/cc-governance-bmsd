"use strict";
// 案ごとに変える小さな見せ方（KIT.look）と、増減のチップ・状態の札の部品。案の ia.js は build({ look: {...} }) で既定を上書きする。
(() => {
  const K = window.KIT;
  const { esc, lookup, fill } = K;

  const DEFAULTS = {
    delta: {
      color: "tone", // tone: 改善＝青・悪化＝濃い灰の太字・中立＝薄い灰 / better: 改善だけ青 / none: 色を付けない
      arrow: false, // ▲▼ を付ける
      word: false, // 値の後ろに「改善」「悪化」を添える
      worseOnly: false, // 悪化だけチップにし、改善と中立は地の文字にする
      prev: false, // 前の値を添える（「+12.3%（前 $1,040）」）
    },
    okMark: false, // 正常にも灰の「正常」の札を出す
    filter: "dim", // 絞り込みで該当しないカードを dim（薄くする）か hide（隠す）
    groupTitle: "group", // 概況の群の見出し: group（群の名前）か window（窓の名前）
    pageLink: true, // 概況の群の見出しの右に専用ページへの入口
    pack: true, // 窓の違う小さな群（2 列以下）が続くとき 1 行に並べる。false で 1 群 1 行を出す
  };

  let current = DEFAULTS;
  function set(over) {
    current = { ...DEFAULTS, ...(over || {}), delta: { ...DEFAULTS.delta, ...((over || {}).delta || {}) } };
    return current;
  }

  // 増減の向き: better は "up"（増えたら改善）・"down"（増えたら悪化）・""（中立）
  function tone(v, better) {
    if (v === null || v === undefined || Number(v) === 0 || !better) return "neutral";
    return (v > 0) === (better === "up") ? "better" : "worse";
  }

  function deltaHtml(card, ctx) {
    const d = card.delta;
    if (!d) return "";
    const v = lookup(ctx, d.v);
    if (v === null || v === undefined) return "";
    const L = K.L, o = current.delta;
    const t = tone(v, card.better);
    const dir = Number(v) > 0 ? "up" : Number(v) < 0 ? "down" : "flat";
    let text = K.FORMATS[d.fmt || "signed_pct"](v) + (d.unit ? ` ${d.unit}` : "");
    if (o.arrow && L.DELTA_ARROW[dir]) text = `${L.DELTA_ARROW[dir]} ${text}`;
    if (o.word && L.DELTA_WORD[t]) text += ` ${L.DELTA_WORD[t]}`;
    if (o.prev && d.prev) text += L.DELTA_PREV.replace("{}", fill(d.prev, ctx));
    const cls = o.worseOnly && t !== "worse" ? "plain" : o.color === "none" ? "neutral" : o.color === "better" && t === "worse" ? "neutral" : t;
    return `<span class="change ${cls}" data-tone="${t}">${esc(text)}</span>`;
  }

  // 見出しの右の札。正常は既定で出さない（okMark で灰の「正常」）
  function stateHtml(state) {
    if (state === "warn" || state === "ng") return K.cells.mark(state, K.L.STATE[state]);
    if (state === "ok" && current.okMark) return K.cells.mark("neutral", K.L.STATE.ok);
    return "";
  }

  window.KIT = Object.assign(window.KIT || {}, { look: { set, get: () => current, tone, deltaHtml, stateHtml, DEFAULTS } });
})();
