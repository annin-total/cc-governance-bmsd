"use strict";
// カードの小さなグラフの札の文言。「09/23（水）  29 人」（2 つの空白の前が見出し、後ろが値。tip.js が組む）。
// prevOffset は同じ位置の前の期間の点までの距離（7 日・28 日は N、12 か月は無し）。基準案では使わない
window.SparkTip = (() => {
  const F = window.Fmt;
  const dayLabel = (day) => `${F.md(day)}${F.wd(day)}`;
  const weekLabel = (w) => `${F.md(F.toDay(w.start))}〜${F.md(F.toDay(w.end))} の週`;

  // labels: 点ごとの見出し、values: 値、fmt: 値 → 文字（単位つき・書式済み）
  function series({ labels, values, fmt }) {
    return values.map((v, i) => `${labels[i]}  ${fmt(v)}`);
  }

  return { series, dayLabel, weekLabel };
})();
