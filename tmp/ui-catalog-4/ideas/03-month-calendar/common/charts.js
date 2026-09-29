"use strict";
// SVG のグラフ（カードの折れ線・タブの棒・積み上げ）と、目盛りの間引き。座標は viewBox の単位（≒ 画面の px）
window.Charts = (() => {
  const F = window.Fmt;
  const W_FULL = 1100, W_HALF = 540;
  const CHAR_PX = 6.4;   // 11px の目盛りの 1 字の幅の目安（数字・記号）
  const WIDE_PX = 11;    // 同じく全角 1 字
  const TICK_GAP = 8;    // 目盛りの文字どうしの最小のすき間
  const VALUE_LABEL_MIN_PITCH = 24; // 棒の上に値を書く最小の棒の間隔
  const SPARK_W = 300, SPARK_H = 48, SPARK_PAD = 4;

  const textPx = (s) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 0xff ? WIDE_PX : CHAR_PX), 0);

  // 目盛りの間引き: 候補（毎日 → 1 日おき → 月曜 → 隔週の月曜 → 月初）のうち、文字が重ならない最初のものを使う
  function pickTicks(keys, width, label, levels) {
    const pitch = width / keys.length;
    for (const keep of levels) {
      const idx = keys.map((k, i) => (keep(k, i) ? i : -1)).filter((i) => i >= 0);
      const fits = idx.every((i, j) => j === 0 || (i - idx[j - 1]) * pitch >= (textPx(label(keys[i])) + textPx(label(keys[idx[j - 1]]))) / 2 + TICK_GAP);
      if (fits) return new Map(idx.map((i) => [i, label(keys[i])]));
    }
    return new Map();
  }
  const dayLevels = (days) => {
    const lastMonday = [...days].reverse().find(F.isMonday);
    const last = days.length - 1;
    return [() => true, (d, i) => (last - i) % 2 === 0, F.isMonday, (d) => F.isMonday(d) && (lastMonday - d) % 14 === 0, (d) => F.iso(d).endsWith("-01")];
  };
  const dailyTicks = (days, width) => pickTicks(days, width, F.md, dayLevels(days));

  // 縦軸の切りのよい最大値と刻み
  function nice(max, lines = 4) {
    const raw = max / lines, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    return { top: Math.ceil(max / step) * step, step };
  }

  // タブの棒グラフ（1 系列）。hiFrom より前は薄い色。keys は表の行と結ぶ data-k。foot は (i → x, 軸の y) を受けて軸の下に描く
  function bars(values, { keys, hiFrom = 0, ticks = new Map(), width = W_HALF, h = 112, labels, dim = [], foot = "", footH = 0 }) {
    const n = values.length, pitch = width / n, bw = Math.max(1, pitch * 0.62), max = Math.max(...values) || 1;
    const showLabels = labels ?? pitch >= VALUE_LABEL_MIN_PITCH;
    const top = showLabels ? 16 : 4, H = h + 20 + footH;
    const cols = values.map((v, i) => {
      const x = i * pitch + (pitch - bw) / 2, bh = ((h - top) * v) / max, cx = x + bw / 2;
      const cls = i < hiFrom ? "bar-old" : "bar-hi";
      return `<g class="col${dim.includes(i) ? " is-partial" : ""}" data-k="${keys[i]}"><rect class="hit" x="${(i * pitch).toFixed(1)}" y="0" width="${pitch.toFixed(1)}" height="${h}"/>`
        + `<rect class="${cls}" x="${x.toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"/>`
        + (showLabels ? `<text x="${cx.toFixed(1)}" y="${(h - bh - 4).toFixed(1)}" text-anchor="middle">${v}</text>` : "")
        + (ticks.has(i) ? `<text class="tick" x="${cx.toFixed(1)}" y="${h + 16}" text-anchor="middle">${ticks.get(i)}</text>` : "") + "</g>";
    }).join("");
    const footSvg = typeof foot === "function" ? foot((i) => i * pitch, h) : foot;
    return `<svg class="chart" viewBox="0 0 ${width} ${H}" aria-hidden="true">${cols}<line class="axis" x1="0" x2="${width}" y1="${h}" y2="${h}"/>${footSvg}</svg>`;
  }

  // 積み上げ棒（提供元ごと）と縦軸。shadeFrom 以降に薄い地を敷く
  function stack(items, { keys, ticks = new Map(), width = W_FULL, h = 158, axisW = 44, shadeFrom, dim = [], yLabel = F.usdText, foot = "", footH = 0 }) {
    const n = items.length, plot = width - axisW, pitch = plot / n, bw = Math.max(1, pitch * 0.62);
    const { top, step } = nice(Math.max(...items.map((it) => it.total)));
    const y = (v) => h - ((h - 8) * v) / top;
    let grid = "";
    for (let v = 0; v <= top + 1e-9; v += step) grid += `<line class="gridline" x1="${axisW}" x2="${width}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${axisW - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${yLabel(v, true)}</text>`;
    const shade = shadeFrom != null ? `<rect class="spark-shade" x="${axisW + shadeFrom * pitch}" y="0" width="${(n - shadeFrom) * pitch}" height="${h}"/>` : "";
    const cols = items.map((it, i) => {
      const x = axisW + i * pitch + (pitch - bw) / 2;
      let acc = 0;
      const segs = it.parts.map((v, s) => {
        const y0 = y(acc), y1 = y(acc + v); acc += v;
        return v > 0 ? `<rect class="series-${s}" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${(y0 - y1).toFixed(1)}"/>` : "";
      }).join("");
      return `<g class="col${dim.includes(i) ? " is-partial" : ""}" data-k="${keys[i]}"><rect class="hit" x="${(axisW + i * pitch).toFixed(1)}" y="0" width="${pitch.toFixed(1)}" height="${h}"/>${segs}`
        + (ticks.has(i) ? `<text class="tick" x="${(x + bw / 2).toFixed(1)}" y="${h + 16}" text-anchor="middle">${ticks.get(i)}</text>` : "") + "</g>";
    }).join("");
    const footSvg = typeof foot === "function" ? foot((i) => axisW + i * pitch, h) : foot;
    return `<svg class="chart" viewBox="0 0 ${width} ${h + 22 + footH}" aria-hidden="true">${shade}${grid}${cols}${footSvg}</svg>`;
  }

  // カードの折れ線。from 以降が直近。tips は点ごとの札の文言（tip.js が出す）
  function spark(values, { from = 0, tips = [] }) {
    const n = values.length, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const px = (i) => (i * SPARK_W) / (n - 1), py = (v) => SPARK_PAD + ((max - v) * (SPARK_H - 2 * SPARK_PAD)) / span;
    const pts = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
    const x0 = px(from), last = n - 1;
    const hits = values.map((_, i) => {
      const a = i === 0 ? 0 : (px(i - 1) + px(i)) / 2, b = i === last ? SPARK_W : (px(i) + px(i + 1)) / 2;
      return `<rect class="hit" x="${a.toFixed(1)}" y="0" width="${(b - a).toFixed(1)}" height="${SPARK_H}" data-tip="${F.esc(tips[i] || "")}" data-gx="${px(i).toFixed(1)}"/>`;
    }).join("");
    return `<svg class="spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none" aria-hidden="true">
  <rect class="spark-shade" x="${x0.toFixed(1)}" y="0" width="${(SPARK_W - x0).toFixed(1)}" height="${SPARK_H}"/>
  <path class="spark-area" d="M${x0.toFixed(1)},${SPARK_H} L${pts.slice(from).join(" L")} L${SPARK_W},${SPARK_H} Z"/>
  <polyline class="spark-old" points="${pts.slice(0, from + 1).join(" ")}" vector-effect="non-scaling-stroke"/>
  <polyline class="spark-new" points="${pts.slice(from).join(" ")}" vector-effect="non-scaling-stroke"/>
  <circle class="spark-dot" cx="${px(last).toFixed(1)}" cy="${py(values[last]).toFixed(1)}" r="3"/>
  <line class="spark-guide" x1="0" x2="0" y1="0" y2="${SPARK_H}" vector-effect="non-scaling-stroke"/>${hits}</svg>`;
  }

  return { W_FULL, W_HALF, textPx, pickTicks, dailyTicks, nice, bars, stack, spark };
})();
