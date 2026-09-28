"use strict";
const E = window.CTX.effect;
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const INK = "#1a1a1a", GRAY = "#9a9a94", HUE = "#1f5a8c";
const man = (n) => (n / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 1 });

const before = E.study.filter((r) => r.relative_day < 0);
const after = E.study.filter((r) => r.relative_day > 0);

/* 日 → x 座標。0 日目は除外なので、前後の間に小さな隙間を置く */
function xScale(x0, w) {
  const gap = 14, step = (w - gap) / 27;
  return (d) => x0 + (d < 0 ? (d + 14) * step : 13 * step + gap + (d - 1) * step);
}

function sparkline(key) {
  const W = 240, H = 30, P = 3;
  const vals = E.study.map((r) => r[key]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = xScale(P, W - 2 * P), y = (v) => P + (H - 2 * P) * (1 - (v - lo) / (hi - lo || 1));
  const path = (rows) => rows.map((r, i) => `${i ? "L" : "M"}${x(r.relative_day).toFixed(1)},${y(r[key]).toFixed(1)}`).join("");
  const mB = mean(before.map((r) => r[key])), mA = mean(after.map((r) => r[key]));
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <line x1="${x(-14)}" x2="${x(-1)}" y1="${y(mB)}" y2="${y(mB)}" stroke="${GRAY}" stroke-width=".8" stroke-dasharray="2 2"/>
    <line x1="${x(1)}" x2="${x(14)}" y1="${y(mA)}" y2="${y(mA)}" stroke="${HUE}" stroke-width=".8" stroke-dasharray="2 2"/>
    <path d="${path(before)}" fill="none" stroke="${GRAY}" stroke-width="1.1"/>
    <path d="${path(after)}" fill="none" stroke="${HUE}" stroke-width="1.1"/>
    <circle cx="${x(14)}" cy="${y(after[after.length - 1][key])}" r="2" fill="${HUE}"/></svg>`;
}

function renderSpark() {
  const rows = [
    ["1 人あたりコスト", "cost", (v) => "$" + fmt(v, 2)],
    ["1 人あたりトークン", "tokens", (v) => man(v) + " 万", "入力とキャッシュの読み書きの合計。出力は含まない"],
    ["対象者数", "denominator", (v) => fmt(v, 1) + " 人", "その日が CSV の期間に入る利用者。日ごとに変わる"],
  ];
  $("spark").innerHTML = `<thead><tr><th></th><th class="n">守る前</th><th class="c">−14 日 ── 0 ── +14 日</th><th class="n">守った後</th><th class="n">差</th></tr></thead><tbody>` +
    rows.map(([label, key, f, sub]) => {
      const b = mean(before.map((r) => r[key])), a = mean(after.map((r) => r[key]));
      return `<tr><td class="lab">${label}${sub ? `<span class="sub">${sub}</span>` : ""}</td><td class="n g">${f(b)}</td><td class="c">${sparkline(key)}</td>
        <td class="n h">${f(a)}</td><td class="n">${a < b ? "−" : "+"}${fmt(Math.abs((a - b) / b) * 100, 0)}%</td></tr>`;
    }).join("") + "</tbody>";
}

function renderCostFig() {
  const W = 720, H = 250, L = 112, R = 108, T = 16, B = 34;
  const vals = E.study.map((r) => r.cost);
  const lo = Math.floor(Math.min(...vals)), hi = Math.ceil(Math.max(...vals));
  const x = xScale(L, W - L - R), y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const mB = mean(before.map((r) => r.cost)), mA = mean(after.map((r) => r.cost));
  let s = "";
  // 値域だけの縦軸（range frame）
  s += `<line x1="${L - 10}" x2="${L - 10}" y1="${y(hi)}" y2="${y(lo)}" stroke="${INK}" stroke-width=".6"/>`;
  [lo, hi].forEach((v) => { s += `<text x="${L - 14}" y="${y(v) + 4}" text-anchor="end">$${v}</text>`; });
  // 横軸は目盛りの文字だけ
  [-14, -7, 7, 14].forEach((d) => {
    s += `<text x="${x(d)}" y="${H - 10}" text-anchor="middle">${d > 0 ? "+" : "−"}${Math.abs(d)}</text>`;
  });
  s += `<text x="${(x(-1) + x(1)) / 2}" y="${H - 10}" text-anchor="middle" class="zero">0 日目（除外）</text>`;
  s += `<line x1="${(x(-1) + x(1)) / 2}" x2="${(x(-1) + x(1)) / 2}" y1="${T}" y2="${H - B + 4}" stroke="${GRAY}" stroke-width=".6" stroke-dasharray="1 3"/>`;
  s += `<line x1="${x(-14)}" x2="${x(-1)}" y1="${y(mB)}" y2="${y(mB)}" stroke="${GRAY}" stroke-width="1"/>`;
  s += `<line x1="${x(1)}" x2="${x(14)}" y1="${y(mA)}" y2="${y(mA)}" stroke="${HUE}" stroke-width="1"/>`;
  E.study.forEach((r) => {
    const c = r.relative_day < 0 ? GRAY : HUE;
    s += `<circle cx="${x(r.relative_day)}" cy="${y(r.cost)}" r="3" fill="${c}"><title>${r.relative_day_label} $${fmt(r.cost, 2)}（${r.denominator} 人）</title></circle>`;
  });
  s += `<text x="${x(14) + 12}" y="${y(mA) + 4}" class="lab-h">後の平均 $${fmt(mA, 2)}</text>`;
  s += `<text x="${L - 22}" y="${y(mB) + 4}" text-anchor="end" class="lab-g">前の平均 $${fmt(mB, 2)}</text>`;
  s += `<text x="${W - R + 12}" y="${H - 10}" class="axis-note">守り始めてからの日数</text>`;
  $("costfig").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="守る前後の 1 人あたりコストの点グラフ">${s}</svg>`;
}

/* 区間を 0 から最大までそろえ、欠けた区間は 0 とする */
function aligned(side) {
  const max = Math.max(...side.before.map((r) => r.bin), ...side.after.map((r) => r.bin));
  const bins = [];
  for (let b = 0; b <= max; b += E.context_bin) bins.push(b);
  const frac = (list) => {
    const tot = list.reduce((s, r) => s + r.count, 0);
    const m = Object.fromEntries(list.map((r) => [r.bin, r.count]));
    return { tot, share: bins.map((b) => (m[b] || 0) / tot) };
  };
  return { bins, b: frac(side.before), a: frac(side.after) };
}
const medianBin = (bins, share) => { let acc = 0; for (let i = 0; i < bins.length; i++) { acc += share[i]; if (acc >= .5) return bins[i]; } return bins[bins.length - 1]; };

function panel(title, side, ymax) {
  const W = 360, H = 196, L = 34, R = 8, T = 10, B = 36;
  const { bins, b, a } = aligned(side);
  const bw = (W - L - R) / bins.length;
  const x = (i) => L + i * bw, y = (v) => T + (H - T - B) * (1 - v / ymax);
  const step = (share) => share.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}H${x(i + 1)}`).join("");
  let s = `<line x1="${L - 8}" x2="${L - 8}" y1="${y(ymax)}" y2="${y(0)}" stroke="${INK}" stroke-width=".6"/>`;
  [0, ymax].forEach((v) => { s += `<text x="${L - 12}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`; });
  s += `<path d="${step(b.share)}" fill="none" stroke="${GRAY}" stroke-width="1.4"/>`;
  s += `<path d="${step(a.share)}" fill="none" stroke="${HUE}" stroke-width="1.6"/>`;
  bins.forEach((bin, i) => { if (i % 2 === 0) s += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${bin ? man(bin) + "万" : "0"}</text>`; });
  const mb = medianBin(bins, b.share), ma = medianBin(bins, a.share);
  const tri = (bin, c) => { const cx = x(bins.indexOf(bin) + .5); return `<path d="M${cx - 4},${H - B + 10}L${cx + 4},${H - B + 10}L${cx},${H - B + 3}Z" fill="${c}"/>`; };
  s += tri(mb, GRAY) + tri(ma, HUE);
  return `<figure class="mult"><figcaption><b>${title}</b></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}の分布（守る前と後）">${s}</svg>
    <p class="leg"><span class="g">守る前 ${fmt(b.tot)} 件 · 中央 ${man(mb)}〜${man(mb + E.context_bin)} 万</span><span class="h">守った後 ${fmt(a.tot)} 件 · 中央 ${man(ma)}〜${man(ma + E.context_bin)} 万</span></p></figure>`;
}

function renderMultiples() {
  const all = [aligned(E.context_pre_compact), aligned(E.context_stop)];
  const ymax = Math.ceil(Math.max(...all.flatMap((d) => d.b.share.concat(d.a.share))) * 20) / 20;
  $("multiples").innerHTML = panel("圧縮直前", E.context_pre_compact, ymax) + panel("応答終了", E.context_stop, ymax) +
    `<p class="mnote">▲ は記録の半数が入る区間（中央値の区間）。2 つの図の縦軸はそろえてある。</p>`;
  const pc = aligned(E.context_pre_compact);
  const mb = medianBin(pc.bins, pc.b.share), ma = medianBin(pc.bins, pc.a.share);
  const maxB = pc.bins[pc.b.share.map((v) => v > 0).lastIndexOf(true)], maxA = pc.bins[pc.a.share.map((v) => v > 0).lastIndexOf(true)];
  const cB = mean(before.map((r) => r.cost)), cA = mean(after.map((r) => r.cost));
  $("thesis").innerHTML = `守り始めた後、圧縮直前のコンテキストは <b>${man(maxA + E.context_bin)} 万トークン</b>を超えなくなった（前は ${man(maxB + E.context_bin)} 万まで）。` +
    `記録の半数が入る区間も ${man(mb)}〜${man(mb + E.context_bin)} 万から <b>${man(ma)}〜${man(ma + E.context_bin)} 万</b>へ下がった。` +
    `1 人あたりコストも $${fmt(cB, 2)} から $${fmt(cA, 2)} へ下がったが、時期の変動を含むため、この差は効果の大きさとは読めない。`;
}

renderSpark();
renderCostFig();
renderMultiples();
