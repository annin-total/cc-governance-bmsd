"use strict";
// 共通の部品: 書式・状態の印・指標カード・小さなグラフ
window.UI = (() => {
  const $ = (id) => document.getElementById(id);
  const n = (v, d = 0) => v.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v) => n(v, 1) + "%";
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (v, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "±") + n(Math.abs(v), d);
  const md = (s) => s.slice(5).replace("-", "/");
  const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
  const WEEKDAY = "日月火水木金土";
  const weekday = (label) => WEEKDAY[new Date(label + "T00:00:00+09:00").getDay()];

  const mark = (tone, label) => `<span class="mark ${tone}">${label}</span>`;
  const chip = (text, tone = "") => `<span class="chip ${tone}">${text}</span>`;
  const hbar = (v, max, tone = "") => `<span class="hbar ${tone}"><i style="width:${max ? (v / max) * 100 : 0}%"></i></span>`;

  // カード 1 枚。定義: { label, value, unit, delta:[text,tone], sub, viz, state:[tone,label], tab, chip, wide }
  const card = (c) => `
    <a class="card${c.wide ? " wide" : ""}" href="#${c.tab}${c.chip ? ":" + c.chip : ""}" data-tab="${c.tab}">
      <span class="k-label"><span>${c.label}</span>${c.state ? mark(...c.state) : `<span class="go">一覧</span>`}</span>
      ${c.value != null ? `<span class="k-value">${c.value}<span class="u">${c.unit || ""}</span></span>` : ""}
      <span class="k-sub">${c.delta ? chip(...c.delta) : ""}${c.sub || ""}</span>
      <span class="k-viz">${c.viz || ""}</span>
    </a>`;

  const cap = (...parts) => `<span class="cap">${parts.map((p) => `<span>${p}</span>`).join("")}</span>`;

  // 折れ線。末尾 hiLast 点を直近として強調する
  function spark(vals, hiLast) {
    const w = 300, h = 48, pad = 4, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const x = (i) => (i / (vals.length - 1)) * w, y = (v) => pad + (h - 2 * pad) * (1 - (v - min) / span);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const cut = vals.length - hiLast, last = vals.length - 1;
    const area = `M${x(cut - 1)},${h} L${pts.slice(cut - 1).join(" L")} L${w},${h} Z`;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="${x(cut - 1)}" y="0" width="${w - x(cut - 1)}" height="${h}" fill="var(--track)"/>
      <path d="${area}" fill="var(--accent-2)" opacity=".4"/>
      <polyline points="${pts.slice(0, cut).join(" ")}" fill="none" stroke="var(--muted)" stroke-width="1.3" vector-effect="non-scaling-stroke"/>
      <polyline points="${pts.slice(cut - 1).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(last)}" cy="${y(vals[last])}" r="3" fill="var(--accent)"/></svg>`;
  }

  // 割合の帯。tone は状態色（省略時はアクセント）
  const meter = (num, den, tone = "") => `<span class="meter ${tone}"><i style="width:${(num / den) * 100}%"></i></span>`;

  // 積み上げの帯と凡例。parts: [[値, ラベル, 色]]
  function stack(parts) {
    const seg = parts.map(([v, , c]) => `<i style="flex:${v};background:${c}"></i>`).join("");
    const legend = parts.map(([v, l, c]) => `<span><i style="background:${c}"></i>${l} ${n(v)}</span>`).join("");
    return `<span class="stack">${seg}</span><span class="legend">${legend}</span>`;
  }

  // 名前・棒・値の行の並び。rows: [[名前, 値, 最大, 右端の表示]]
  const rows = (list) => `<span class="rates">${list.map(([l, v, max, right]) =>
    `<span class="rate"><span>${l}</span>${hbar(v, max)}${right}</span>`).join("")}</span>`;

  // 前後 2 本の横棒
  const pair = (rows) => rows.map(([l, v, max, tone]) =>
    `<span class="pair"><span>${l}</span>${hbar(v, max, tone)}</span>`).join("");

  return { $, n, pct, usd, signed, md, sum, weekday, mark, chip, hbar, card, cap, spark, meter, stack, pair, rows };
})();
