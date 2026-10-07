"use strict";
// 案ごとに変える小さな見せ方（KIT.look）と、増減のチップ・状態の札の部品。案の ia.js は build({ look: {...} }) で既定を上書きする。
(() => {
  const K = window.KIT;
  const { esc, lookup } = K;

  const DEFAULTS = {
    delta: {
      color: "tone", // tone: 改善＝青・悪化＝濃い灰の太字・中立＝薄い灰 / better: 改善だけ青 / none: 色を付けない
      arrow: false, // ▲▼ を付ける
      word: false, // 値の後ろに「改善」「悪化」を添える
      palette: "", // 比較用の色の組（compare.js）。"" は tone の色のまま
    },
    pack: true, // 窓の違う小さな群（2 列以下）が続くとき 1 行に並べる。false で 1 群 1 行を出す
    asofAt: "header", // 基準日の置き場: header（ヘッダーの「時点」）・page（ページ内）・range（期間の表示を押す）・step（ヘッダーに前後の送り）
    fs: "F5", // 文字の大きさの段の組（F5 のほかは compare.css）
    // 案 51 で足したキー（既定は案 31 の挙動。README の表）
    ends: "asof", // asof: 期間の終わりは基準日（今日）/ bill: 期間のページは利用明細の最終日、状態のページは今日の時点
    sticky: "", // header: ヘッダーだけを固定する
    hv: "HV1", // ヘッダーの高さの型（HV1〜HV4）
    brief: true, // 「主な指標」の横に窓の期間を出す
    forecastPrev: "", // chip: 月末の見込みの前月の実績をチップの行に
    org: false, // 組織 CSV（課の列・部署ごと・取り込みの欄）
    groups: "G31", // コストと利用者の群の型（G31・G3）
    chart: "K1", // コストのカードのグラフの型（K1〜K6）
    over: "", // 基準超えの 2 つの数字の型の下段（D1〜D6。"" は案 32 のまま）
    sum: "S1", // サマリーの型（S1・S2）
    df: "F0", // 部署の絞り込みの型（F0〜F3）
    cal: "CA1", // カレンダーの型（CA1〜CA7）
    stale: "W0", // 利用明細の古さの警告（W0 なし・W1 あり）
    lag: "", // 明細の遅れの見本（lag: 最終日を数日前に見せる）
    chip: "", // 増減のチップの色の型（CH1〜CH7。"" は案 31 のまま）
    dfs: "DS1", // 部署の絞り込みの中の部品の見た目（DS1〜DS6）
    conc: "CC1", concd: "CD5", concAt: "",
    y12: "", // 12 か月の暦月の棒（"" は直近 12 か月だけ・prev は前の 12 か月を並べる。どちらも比べる札とチップは出さない）
    oi: "OI1",
    rows: "", // 行の多い見本（many。データと設定・サマリーの一覧の折りたたみを見るため） // 組織 CSV の取り込みの見せ方（OI1〜OI5。look.org のときだけ） // 人数とコストの割合（利用者の集中・部署・置き場 card か tab。"" はどちらも出さない）
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
    if (o.arrow && t !== "neutral" && L.DELTA_ARROW[dir]) text = `${L.DELTA_ARROW[dir]} ${text}`; // 中立は向きを示さない
    if (o.word && L.DELTA_WORD[t]) text += ` ${L.DELTA_WORD[t]}`;
    return chipHtml(text, t);
  }

  // 増減のチップの部品。t は better・worse・neutral（基準を超えた利用者の「新規」「離脱」も使う）
  function chipHtml(text, t) {
    const o = current.delta;
    const cls = o.color === "none" ? "neutral" : o.color === "better" && t === "worse" ? "neutral" : t;
    return `<span class="change ${cls}${o.palette ? ` p-${o.palette}` : ""}" data-tone="${t}">${esc(text)}</span>`;
  }

  // 見出しの右の札。正常は出さない
  function stateHtml(state) {
    return state === "warn" || state === "ng" ? K.cells.mark(state, K.L.STATE[state]) : "";
  }

  window.KIT = Object.assign(window.KIT || {}, { look: { set, get: () => current, tone, deltaHtml, chipHtml, stateHtml, DEFAULTS } });
})();
