"use strict";
// カードの小さなグラフの札の文言。「09/23（水）  29 人 · 前 31 人」（2 つの空白の前が見出し、後ろが値。tip.js が組む）。
// prevOffset は同じ位置の前の期間の点までの距離（7 日・28 日は N、12 か月は無し）。前の期間の点には前が無いので値だけ
window.SparkTip = (() => {
  const F = window.Fmt;
  const dayLabel = (day) => `${F.md(day)}${F.wd(day)}`;
  const weekLabel = (w) => `${F.md(F.toDay(w.start))}〜${F.md(F.toDay(w.end))} の週`;

  // labels: 点ごとの見出し、values: 値、fmt: 値 → 文字（単位つき・書式済み）
  function series({ labels, values, fmt, prevOffset }) {
    return values.map((v, i) => {
      const prev = prevOffset && i >= prevOffset ? ` · 前 ${fmt(values[i - prevOffset])}` : "";
      return `${labels[i]}  ${fmt(v)}${prev}`;
    });
  }

  return { series, dayLabel, weekLabel };
})();
