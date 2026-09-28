"use strict";
// 概況のタブで使うグラフ（SVG）
window.OVERVIEW_CHARTS = (() => {
  const { md, sum, usd } = window.UI;
  const PROVIDERS = [["aws-bedrock", "AWS Bedrock", "var(--accent)"], ["google-vertex", "Google Vertex AI", "var(--accent-2)"]];

  function costByDay(rows) {
    const byDay = new Map();
    for (const r of rows) {
      const d = byDay.get(r.day_label) || {};
      d[r.provider] = (d[r.provider] || 0) + r.cost;
      byDay.set(r.day_label, d);
    }
    const days = [...byDay.keys()].sort();
    return { byDay, days, total: (d) => sum(Object.values(byDay.get(d))) };
  }

  function bars(vals, labels, hiLast, w, h) {
    const pad = { t: 16, b: 20 }, max = Math.max(...vals), step = w / vals.length, bw = step * 0.62;
    const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">` + vals.map((v, i) => {
      const x = i * step + (step - bw) / 2, fill = i >= vals.length - hiLast ? "var(--accent)" : "var(--ghost)";
      return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${h - pad.b - y(v)}" rx="1.5" fill="${fill}"/><text x="${x + bw / 2}" y="${y(v) - 4}" text-anchor="middle">${v}</text>`
        + (i % 2 === 1 ? `<text x="${x + bw / 2}" y="${h - 4}" text-anchor="middle">${labels[i]}</text>` : "");
    }).join("") + `<line x1="0" x2="${w}" y1="${h - pad.b}" y2="${h - pad.b}" stroke="var(--rule)"/></svg>`;
  }

  const trendCharts = (trend, week) => {
    const labels = trend.map((t) => md(t.day_label));
    return `<div class="two"><div><h3>利用者数</h3>${bars(trend.map((t) => t.users), labels, week, 540, 132)}</div>`
      + `<div><h3>セッション数</h3>${bars(trend.map((t) => t.sessions), labels, week, 540, 132)}</div></div>`;
  };

  function costChart({ byDay, days, total }) {
    const w = 1100, h = 180, pad = { t: 8, b: 22, l: 44 }, max = Math.ceil(Math.max(...days.map(total)) / 100) * 100;
    const step = (w - pad.l) / days.length, bw = step * 0.7;
    const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    let g = "";
    for (let v = 0; v <= max; v += 100) g += `<line x1="${pad.l}" x2="${w}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">$${v}</text>`;
    days.forEach((d, i) => {
      const x = pad.l + i * step + (step - bw) / 2;
      let acc = 0;
      for (const [k, l, c] of PROVIDERS) {
        const v = byDay.get(d)[k] || 0;
        if (v) g += `<rect x="${x}" y="${y(acc + v)}" width="${bw}" height="${y(acc) - y(acc + v)}" fill="${c}"><title>${d} ${l} ${usd(v)}</title></rect>`;
        acc += v;
      }
      if (i % 7 === 0) g += `<text x="${x + bw / 2}" y="${h - 4}" text-anchor="middle">${md(d)}</text>`;
    });
    const legend = PROVIDERS.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("");
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="日ごとのコスト">${g}</svg><div class="legend">${legend}</div>`;
  }

  return { PROVIDERS, costByDay, trendCharts, costChart };
})();
