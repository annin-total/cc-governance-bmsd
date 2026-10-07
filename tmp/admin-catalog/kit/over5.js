"use strict";
// 案 51 の基準超えのカード（要確認と注意の 2 つの大きな数字）の下段の型 D1〜D6（concepts5.md の 4.4。look.over）。
// 数はどれも r3[over][区分].moves（前と直近の状態の組。キーは `前_今`）から数える。新規＝悪化・離脱＝改善の向き、向きの決まらないものは中立の灰。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const STATES = ["ok", "warn", "ng"];
  const TONES = ["ng", "warn"]; // 大きな数字の並び（要確認・注意）
  const L = () => K.L;
  const m = (s, a, b) => s.moves[`${a}_${b}`] || 0;
  const chip = (text, n, tone) => K.look.chipHtml(text, n ? tone : "neutral");
  const ins = (t) => (s) => STATES.filter((x) => x !== t).reduce((n, x) => n + m(s, x, t), 0); // その状態に入った人（隣の状態から移った人を含む）
  const outs = (t) => (s) => STATES.filter((x) => x !== t).reduce((n, x) => n + m(s, t, x), 0);

  // 大きな数字 2 つ。under(t) はそれぞれの真下に置くもの
  const big = (s, under) => `<span class="ov-duo">${TONES.map((t) => `<span class="ov-big"><span class="ov-name">${esc(L().STATE[t])}</span>`
    + `<span class="k-value">${K.num(s[t])}<span class="u">人</span></span><span class="ov-prev">${esc(L().OVER_PREV.replace("{}", K.num(s[`prev_${t}`])))}</span>${under ? `<span class="ov-under">${under(t)}</span>` : ""}</span>`).join("")}</span>`;
  const pair = (a, b) => `<span class="ov-moves">${a}${b}</span>`;

  const FORMS = {
    // D1 状態ごと: その状態に入った人を新規、出た人を離脱（状態の間の移動を含む）。注意の向きは決まらない
    D1: (s) => big(s, (t) => pair(chip(L().OVER_IN.replace("{}", ins(t)(s)), ins(t)(s), t === "ng" ? "worse" : "neutral"),
      chip(L().OVER_OUT.replace("{}", outs(t)(s)), outs(t)(s), t === "ng" ? "better" : "neutral"))),
    // D2 出入りと移動: 新規・離脱は注意以上への出入りだけ（入った・出た時の状態で振り分け）。注意⇄要確認の移動は 1 行で
    D2: (s) => big(s, (t) => pair(chip(L().OVER_IN.replace("{}", m(s, "ok", t)), m(s, "ok", t), "worse"), chip(L().OVER_OUT.replace("{}", m(s, t, "ok")), m(s, t, "ok"), "better")))
      + `<span class="ov-move">${esc(L().OVER_MOVE.replace("{up}", m(s, "warn", "ng")).replace("{down}", m(s, "ng", "warn")))}</span>`,
    // D3 移動の表: 行＝前・列＝直近の 3×3（正常→正常は「—」）
    D3: (s) => big(s) + `<table class="ov-table"><thead><tr><th>${esc(L().OVER_TABLE.head)}</th>${STATES.map((b) => `<th>${esc(L().OVER_TABLE[b])}</th>`).join("")}</tr></thead><tbody>`
      + STATES.map((a) => `<tr><th>${esc(L().OVER_TABLE[a])}</th>${STATES.map((b) => `<td>${a === "ok" && b === "ok" ? "—" : K.num(m(s, a, b))}</td>`).join("")}</tr>`).join("") + "</tbody></table>",
    // D4 悪化と改善: 状態が重くなった人と軽くなった人の 2 つの数
    D4: (s) => {
      const worse = m(s, "ok", "warn") + m(s, "ok", "ng") + m(s, "warn", "ng"), better = m(s, "ng", "warn") + m(s, "ng", "ok") + m(s, "warn", "ok");
      return big(s) + pair(chip(L().OVER_WORSE.replace("{}", worse), worse, "worse"), chip(L().OVER_BETTER.replace("{}", better), better, "better"));
    },
    // D5 1 人 1 つの四角: 状態ごとに 1 行。塗り＝直近の状態、太い枠＝新規（その状態に入った人）、中抜き＝離脱（前の状態の色の枠）
    D5: (s) => big(s) + `<span class="ov-dots">${TONES.map((t) => {
      const kept = m(s, t, t), n = ins(t)(s), out = outs(t)(s);
      const sq = (cls, k) => Array.from({ length: k }, () => `<i class="ov-sq ${cls}"></i>`).join("");
      return `<span class="ov-dot-row"><span class="ov-name">${esc(L().STATE[t])}</span><span class="ov-sqs">${sq(`is-${t}`, kept)}${sq(`is-${t} is-new`, n)}${sq(`is-out-${t}`, out)}</span><b class="num">${K.num(s[t])}</b></span>`;
    }).join("")}</span>`,
    // D6 差だけ: 状態ごとの前との差。新規・離脱は一覧（over_users）で見る
    D6: (s) => big(s, (t) => { const d = s[t] - s[`prev_${t}`]; return chip(L().OVER_DIFF.replace("{}", K.FORMATS.signed(d)), d, d > 0 ? "worse" : "better"); }),
  };

  K.over5 = { render: (s, form) => FORMS[form](s), FORMS };
})();
