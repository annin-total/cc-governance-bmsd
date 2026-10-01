"use strict";
// グラフの座標（サーバの charts.py・charts_hist.py・charts_cum.py・ticks.py の写し）。描画は viz.js・charts.js。
(() => {
  // Python の round(v, 1) と揃える: 丸めは double の正確な値で行い（toFixed と同じ）、ちょうど半分（.25・.75）だけ偶数へ寄せる
  const r1 = (v) => {
    if (Number.isInteger(v * 4) && Math.abs(v * 4) % 2 === 1) { const f = Math.floor(v * 10); return (f % 2 === 0 ? f : f + 1) / 10; }
    return Number(v.toFixed(1));
  };
  const SPARK_W = 300, SPARK_H = 48, SPARK_PAD = 4;
  const BAR_PAD_TOP = 16, BAR_PAD_BOTTOM = 20, BAR_FILL = 0.62, BAR_VALUE_MIN_PITCH = 24;
  const STACK_PAD_TOP = 8, STACK_PAD_BOTTOM = 22, STACK_PAD_LEFT = 44, STACK_FILL = 0.7;
  const HIST_FILL = 0.76, HIST_GAP = 1;
  const TICK_LABEL_W = 5 * 6.4, TICK_GAP = 8;

  const pct = (v, whole) => (v === null || v === undefined || !whole || whole <= 0 ? 0 : Math.max(0, Math.min(100, (v / whole) * 100)));

  function spark(values, hiLast) {
    if (values.length < 2) return null;
    const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
    const x = (i) => r1((i / (values.length - 1)) * SPARK_W);
    const y = (v) => r1(SPARK_PAD + (SPARK_H - 2 * SPARK_PAD) * (1 - (v - low) / span));
    const points = values.map((v, i) => `${x(i)},${y(v)}`);
    const cut = Math.max(1, values.length - hiLast);
    const edges = [0, ...values.slice(0, -1).map((_, i) => (x(i) + x(i + 1)) / 2), SPARK_W];
    return {
      w: SPARK_W, h: SPARK_H, shade_x: x(cut - 1), old: points.slice(0, cut).join(" "), new: points.slice(cut - 1).join(" "),
      area: `M${x(cut - 1)},${SPARK_H} L` + points.slice(cut - 1).join(" L") + ` L${SPARK_W},${SPARK_H} Z`,
      last: [x(values.length - 1), y(values[values.length - 1])],
      hits: values.map((_, i) => ({ x: edges[i], w: r1(edges[i + 1] - edges[i]), gx: x(i) })),
    };
  }

  const dateOf = (d) => new Date(d * 86400000);
  function fits(picked, pitch) {
    for (let i = 1; i < picked.length; i++) if ((picked[i] - picked[i - 1]) * pitch < TICK_LABEL_W + TICK_GAP) return false;
    return true;
  }
  function dayTicks(days, pitch) {
    const dates = days.map(dateOf);
    const every = days.map((_, i) => i);
    const mondays = every.filter((i) => dates[i].getUTCDay() === 1);
    const anchor = mondays.length ? days[mondays[mondays.length - 1]] : 0;
    for (const picked of [every, every.filter((i) => (days.length - 1 - i) % 2 === 0), mondays,
      mondays.filter((i) => (((anchor - days[i]) % 14) + 14) % 14 === 0)]) if (fits(picked, pitch)) return picked;
    const starts = every.filter((i) => dates[i].getUTCDate() === 1 || (i > 0 && dates[i].getUTCMonth() !== dates[i - 1].getUTCMonth()));
    for (let months = 1; ; months++) {
      const picked = starts.filter((i) => (dates[i].getUTCFullYear() * 12 + dates[i].getUTCMonth() + 1) % months === 0);
      if (fits(picked, pitch)) return picked;
    }
  }

  function bars(values, labels, keys, hi, w, h, dayKeys = true) {
    const top = Math.max(0, ...values) || 1;
    const step = w / Math.max(values.length, 1), bw = step * BAR_FILL, base = h - BAR_PAD_BOTTOM;
    const every = Math.ceil((TICK_LABEL_W + TICK_GAP) / step);
    const labeled = new Set(dayKeys ? dayTicks(keys, step) : values.map((_, i) => i).filter((i) => i % every === 0));
    const result = values.map((v, i) => {
      const y = BAR_PAD_TOP + (base - BAR_PAD_TOP) * (1 - (v || 0) / top);
      return {
        x: r1(i * step + (step - bw) / 2), y: r1(y), w: r1(bw), h: r1(base - y), cx: r1(i * step + step / 2), v,
        hi: hi[i], label: labeled.has(i) ? labels[i] : "", key: keys[i], hit_x: r1(i * step), hit_w: r1(step),
      };
    });
    return { w, h, base, bars: result, values: step >= BAR_VALUE_MIN_PITCH };
  }

  function niceStep(top) {
    if (top <= 0) return 1;
    const raw = top / 5, mag = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  }

  function stacked(columns, w, h, dayLabels = true) {
    const totals = columns.map(([, vals]) => vals.reduce((a, b) => a + (b || 0), 0));
    const peak = Math.max(0, ...totals), stepV = niceStep(peak);
    const top = Math.ceil(peak / stepV) * stepV || stepV, base = h - STACK_PAD_BOTTOM;
    const y = (v) => r1(STACK_PAD_TOP + (base - STACK_PAD_TOP) * (1 - v / top));
    const step = (w - STACK_PAD_LEFT) / Math.max(columns.length, 1), bw = r1(step * STACK_FILL);
    const ticks = Array.from({ length: Math.floor(top / stepV + 1e-9) + 1 }, (_, i) => ({ y: y(i * stepV), v: i * stepV }));
    const labeled = new Set(dayLabels ? dayTicks(columns.map(([k]) => k), step) : []);
    const result = columns.map(([key, vals], i) => {
      let acc = 0;
      const segs = [];
      vals.forEach((v, series) => {
        if (v) segs.push({ y: y(acc + v), h: r1(y(acc) - y(acc + v)), series, v });
        acc += v || 0;
      });
      const x = r1(STACK_PAD_LEFT + i * step + (step - bw) / 2);
      return { x, cx: r1(x + bw / 2), w: bw, key, hit_x: r1(STACK_PAD_LEFT + i * step), hit_w: r1(step), tick: labeled.has(i), segs };
    });
    return { w, h, left: STACK_PAD_LEFT, base, ticks, bars: result, shade_x: null };
  }

  function hist(rows, sides, w, h, left, bottom) {
    const shares = rows.map((r) => sides.map((s) => r[`${s}_share`] || 0));
    const peak = Math.max(0, ...shares.flat()), stepV = niceStep(peak);
    const top = (Math.ceil(peak / stepV) || 1) * stepV, base = h - bottom;
    const y = (v) => r1(STACK_PAD_TOP + (base - STACK_PAD_TOP) * (1 - v / top));
    const step = (w - left) / Math.max(rows.length, 1), bw = r1((step * HIST_FILL) / sides.length);
    const result = rows.map((row, i) => {
      const x0 = left + i * step + (step - bw * sides.length) / 2;
      return {
        key: row.bin, row, cx: r1(x0 + (bw * sides.length) / 2), hit_x: r1(left + i * step), hit_w: r1(step),
        segs: shares[i].map((v, j) => ({ x: r1(x0 + j * bw), y: y(v), h: r1(base - y(v)), v })),
      };
    });
    const ticks = Array.from({ length: Math.floor(top / stepV + 1e-9) + 1 }, (_, i) => ({ y: y(i * stepV), v: i * stepV }));
    return { w, h, left, base, bw: bw - HIST_GAP, ticks, bars: result };
  }

  const CUM_TAB = { w: 1100, h: 232, left: 56, top: 8, bottom: 22 };
  const CUM_MINI = { w: 300, h: 28, left: 0, top: 2, bottom: 2 };
  const join = (pts) => pts.map(([x, y]) => `${x},${y}`).join(" ");
  function cum(rows, size) {
    const { w, h, left, top, bottom } = size;
    const peak = Math.max(0, ...rows.flatMap((r) => [r.cum, r.prev]).filter((v) => v));
    const stepV = niceStep(peak), topV = (Math.ceil(peak / stepV) || 1) * stepV, base = h - bottom;
    const pitch = (w - left) / Math.max(rows.length, 1);
    const x = (i) => r1(left + (i + 0.5) * pitch);
    const y = (v) => r1(top + (base - top) * (1 - v / topV));
    const actual = [], ahead = [], prev = [];
    rows.forEach((r, i) => {
      if (r.actual) actual.push([x(i), y(r.cum)]);
      else if (r.cum !== null) ahead.push([x(i), y(r.cum)]);
      if (r.prev !== null) prev.push([x(i), y(r.prev)]);
    });
    const bands = [];
    let start = null;
    [...rows, {}].forEach((r, i) => {
      const off = r.off !== undefined && r.off !== null;
      if (off && start === null) start = i;
      if (!off && start !== null) { bands.push({ x: r1(left + start * pitch), w: r1((i - start) * pitch) }); start = null; }
    });
    return {
      w, h, left, top, base, bands,
      ticks: Array.from({ length: Math.floor(topV / stepV + 1e-9) + 1 }, (_, i) => ({ y: y(i * stepV), v: i * stepV })),
      now: join(actual), fc: ahead.length ? join([...actual.slice(-1), ...ahead]) : "", prev: join(prev),
      last: actual.length ? actual[actual.length - 1] : null,
      cols: rows.map((r, i) => ({
        key: r.link, hit_x: r1(left + i * pitch), hit_w: r1(pitch), cx: x(i), y: r.cum === null ? null : y(r.cum),
        actual: r.actual, prev_y: r.prev === null ? null : y(r.prev), label: i + 1,
      })),
    };
  }

  window.KIT = Object.assign(window.KIT || {}, {
    geo: { pct, spark, bars, stacked, hist, cum, niceStep, dayTicks, SPARK_W, SPARK_H, STACK_PAD_LEFT, STACK_PAD_BOTTOM, CUM_TAB, CUM_MINI },
  });
})();
