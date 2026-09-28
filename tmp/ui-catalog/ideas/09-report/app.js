(() => {
  const E = window.CTX.effect;
  const META = window.CTX.meta;
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (a, b) => (b ? (a / b) * 100 : 0);
  const man = (n) => (n / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  const THRESHOLD = 120000;
  const BINS = Array.from({ length: 9 }, (_, i) => i * E.context_bin);
  const binLabel = (b) => `${man(b)}–${man(b + E.context_bin)} 万`;

  const _svg = (w, h) => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", `0 0 ${w} ${h}`);
    s.setAttribute("role", "img");
    return s;
  };
  const _el = (parent, tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    parent.appendChild(e);
    return e;
  };

  const _dist = (side) => {
    const m = new Map(side.map((r) => [r.bin, r.count]));
    const total = side.reduce((a, r) => a + r.count, 0);
    const over = side.filter((r) => r.bin >= THRESHOLD).reduce((a, r) => a + r.count, 0);
    return { m, total, over };
  };

  function histogram(target, src, label) {
    const b = _dist(src.before), a = _dist(src.after);
    const W = 820, H = 270, L = 44, R = 12, T = 40, B = 40;
    const s = _svg(W, H);
    s.setAttribute("aria-label", label);
    const maxP = 25;
    const bw = (W - L - R) / BINS.length;
    const y = (p) => T + (H - T - B) * (1 - p / maxP);
    for (let p = 0; p <= maxP; p += 5) {
      _el(s, "line", { class: "grid", x1: L, x2: W - R, y1: y(p), y2: y(p) });
      _el(s, "text", { x: L - 8, y: y(p) + 4, "text-anchor": "end" }, `${p}%`);
    }
    BINS.forEach((bin, i) => {
      const x0 = L + i * bw;
      const pb = pct(b.m.get(bin) || 0, b.total), pa = pct(a.m.get(bin) || 0, a.total);
      const gw = bw * 0.34;
      if (pb > 0) _el(s, "rect", { class: "b-before", x: x0 + bw * 0.14, y: y(pb), width: gw, height: y(0) - y(pb) });
      if (pa > 0) _el(s, "rect", { class: "b-after", x: x0 + bw * 0.14 + gw + 3, y: y(pa), width: gw, height: y(0) - y(pa) });
      _el(s, "text", { x: x0, y: H - B + 18, "text-anchor": "middle" }, man(bin));
    });
    _el(s, "text", { x: W - R, y: H - B + 18, "text-anchor": "middle" }, man(BINS.length * E.context_bin));
    _el(s, "text", { x: W - R, y: H - 2, "text-anchor": "end" }, "万トークン");
    _el(s, "line", { class: "axis", x1: L, x2: W - R, y1: y(0), y2: y(0) });
    const tx = L + (THRESHOLD / E.context_bin) * bw;
    _el(s, "line", { class: "thr", x1: tx, x2: tx, y1: T - 12, y2: y(0) });
    _el(s, "text", { class: "lab-ink", x: tx + 6, y: T - 2 }, "12 万¹");
    const lg = _el(s, "g", { transform: `translate(${L}, 2)` });
    _el(lg, "rect", { class: "b-before", x: 0, y: 0, width: 12, height: 10 });
    _el(lg, "text", { x: 18, y: 9 }, "適用前");
    _el(lg, "rect", { class: "b-after", x: 90, y: 0, width: 12, height: 10 });
    _el(lg, "text", { x: 108, y: 9, class: "lab-acc" }, "適用後");
    target.appendChild(s);
    return { b, a };
  }

  function distTable(target, src, no) {
    const b = _dist(src.before), a = _dist(src.after);
    const cell = (d, bin) => {
      const c = d.m.get(bin);
      return c === undefined
        ? `<td class="none">—</td><td class="none">—</td>`
        : `<td>${fmt(c)}</td><td>${fmt(pct(c, d.total), 1)}%</td>`;
    };
    const rows = BINS.map((bin) => `<tr><td>${binLabel(bin)}</td>${cell(b, bin)}${cell(a, bin).replace("<td", '<td class="sep"')}</tr>`).join("");
    target.innerHTML = `<p class="tcap"><span class="fn">表 ${no}</span>区間ごとの件数と割合（割合の分母は各側の件数）</p>
      <table><thead>
        <tr class="grp"><th></th><th colspan="2">適用前</th><th colspan="2" class="sep">適用後</th></tr>
        <tr><th>トークン数の区間</th><th>件数</th><th>割合</th><th class="sep">件数</th><th>割合</th></tr>
      </thead><tbody>${rows}
        <tr><td>計</td><td>${fmt(b.total)}</td><td>100.0%</td><td class="sep">${fmt(a.total)}</td><td>100.0%</td></tr>
      </tbody></table>`;
  }

  function studyFigure(target) {
    const rows = E.study;
    const W = 820, L = 64, R = 12, PH = 130, GAP = 40, T = 20;
    const H = T + PH * 2 + GAP + 54;
    const s = _svg(W, H);
    s.setAttribute("aria-label", "守り始めてからの日数ごとの 1 人あたりコストとトークン");
    const x = (d) => L + ((d + 14) / 28) * (W - L - R);
    const panels = [
      { key: "cost", top: T, max: 12, step: 3, tick: (v) => `$${v}`, title: "1 人あたりコスト（USD）" },
      { key: "tokens", top: T + PH + GAP, max: 1800000, step: 600000, tick: (v) => `${man(v)} 万`, title: "1 人あたりトークン⁴" },
    ];
    for (const p of panels) {
      const y = (v) => p.top + PH * (1 - v / p.max);
      for (let v = 0; v <= p.max; v += p.step) {
        _el(s, "line", { class: "grid", x1: L, x2: W - R, y1: y(v), y2: y(v) });
        _el(s, "text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, p.tick(v));
      }
      const means = [];
      _el(s, "rect", { class: "zero", x: x(-0.5), y: p.top, width: x(0.5) - x(-0.5), height: PH });
      for (const [side, cls] of [[rows.filter((r) => r.relative_day < 0), "before"], [rows.filter((r) => r.relative_day > 0), "after"]]) {
        const pts = side.map((r) => `${x(r.relative_day)},${y(r[p.key])}`).join(" ");
        _el(s, "polyline", { class: `line-${cls}`, points: pts });
        const mean = side.reduce((a, r) => a + r[p.key], 0) / side.length;
        const x1 = x(side[0].relative_day), x2 = x(side[side.length - 1].relative_day);
        _el(s, "line", { class: `mean line-${cls}`, x1, x2, y1: y(mean), y2: y(mean) });
        means.push(p.key === "cost" ? `$${fmt(mean, 2)}` : `${man(mean)} 万`);
      }
      const t = _el(s, "text", { class: "lab-ink", x: L, y: p.top - 8 }, p.title + "　");
      _el(t, "tspan", {}, `平均 前 ${means[0]} · `);
      _el(t, "tspan", { class: "lab-acc" }, `後 ${means[1]}`);
      _el(s, "line", { class: "axis", x1: L, x2: W - R, y1: y(0), y2: y(0) });
    }
    const base = T + PH * 2 + GAP;
    for (const r of rows) {
      if (r.relative_day % 2 === 0 || Math.abs(r.relative_day) === 1)
        _el(s, "text", { x: x(r.relative_day), y: base + 18, "text-anchor": "middle" }, r.relative_day > 0 ? `+${r.relative_day}` : `−${-r.relative_day}`);
      _el(s, "text", { x: x(r.relative_day), y: base + 40, "text-anchor": "middle", style: "font-size:11px" }, r.denominator);
    }
    _el(s, "text", { class: "lab-ink", x: x(0), y: base + 18, "text-anchor": "middle" }, "0³");
    _el(s, "text", { x: L - 26, y: base + 18, "text-anchor": "end" }, "日");
    _el(s, "text", { x: L - 26, y: base + 40, "text-anchor": "end" }, "人");
    target.appendChild(s);
  }

  function studyTable(target) {
    const half = (side) => side.map((r) => `<tr><td>${r.relative_day_label}</td><td>${r.denominator} 人</td><td>$${fmt(r.cost, 2)}</td><td>${fmt(r.tokens)}</td></tr>`).join("");
    const head = `<thead><tr><th>日</th><th>対象者</th><th>コスト</th><th>トークン</th></tr></thead>`;
    target.innerHTML = `<p class="tcap"><span class="fn">表 3</span>図 3 の値（コスト・トークンは 1 人あたり）。左が守り始める前、右が後。</p>
      <div class="twin"><table>${head}<tbody>${half(E.study.filter((r) => r.relative_day < 0))}</tbody></table>
      <table>${head}<tbody>${half(E.study.filter((r) => r.relative_day > 0))}</tbody></table></div>`;
  }

  const pc = histogram($("fig-pc"), E.context_pre_compact, "圧縮直前のトークン数の分布、適用前と適用後");
  const st = histogram($("fig-st"), E.context_stop, "応答終了時のトークン数の分布、適用前と適用後");
  distTable($("tbl-pc"), E.context_pre_compact, 1);
  distTable($("tbl-st"), E.context_stop, 2);
  studyFigure($("fig-study"));
  studyTable($("tbl-study"));

  const before = E.study.filter((r) => r.relative_day < 0), after = E.study.filter((r) => r.relative_day > 0);
  const avg = (xs, k) => xs.reduce((a, r) => a + r[k], 0) / xs.length;
  const cb = avg(before, "cost"), ca = avg(after, "cost");
  const dens = E.study.map((r) => r.denominator);
  const n = (v) => `<span class="num">${v}</span>`;

  $("gen").textContent = META.today_label;
  $("pc-nb").textContent = fmt(pc.b.total); $("pc-na").textContent = fmt(pc.a.total);
  $("st-nb").textContent = fmt(st.b.total); $("st-na").textContent = fmt(st.a.total);
  $("st-dmin").textContent = Math.min(...dens); $("st-dmax").textContent = Math.max(...dens);

  $("abs-lead").innerHTML = `守り始めた後、圧縮直前のコンテキストが 12 万トークンを超えた記録は ${n(fmt(pc.b.over))} 件（${fmt(pct(pc.b.over, pc.b.total), 1)}%）から ${n(fmt(pc.a.over))} 件になった。設定は端末で働いている。`;
  $("abs-cost").innerHTML = `1 人あたりのコストは前 14 日の平均 ${n("$" + fmt(cb, 2))} から後 14 日の平均 ${n("$" + fmt(ca, 2))}（${fmt(pct(ca - cb, cb), 1).replace("-", "−")}%）に動いたが、時期による変動を差し引いていないため、この差を設定の効果とは読まない。`;

  $("pc-text").innerHTML = `<p>適用前は 12 万トークンを超える区間に ${n(fmt(pc.b.over))} 件（全 ${fmt(pc.b.total)} 件の ${fmt(pct(pc.b.over, pc.b.total), 1)}%）があり、18 万まで平らに広がっていた。</p>
    <p>適用後は最も大きい区間が 10–12 万で、12 万を超えた記録は ${n(fmt(pc.a.over))} 件。分布は小さい側に詰まった。しきい値 60 が圧縮の開始を早めていると読める。</p>`;
  $("st-text").innerHTML = `<p>適用前は 12 万トークンを超える応答が ${n(fmt(st.b.over))} 件（全 ${fmt(st.b.total)} 件の ${fmt(pct(st.b.over, st.b.total), 1)}%）あった。</p>
    <p>適用後は ${n(fmt(st.a.over))} 件（全 ${fmt(st.a.total)} 件の ${fmt(pct(st.a.over, st.a.total), 1)}%）。圧縮直前と同じく、上限側がほぼ消えた。</p>`;
  $("study-text").innerHTML = `<p>前 14 日の平均は ${n("$" + fmt(cb, 2))}、後 14 日の平均は ${n("$" + fmt(ca, 2))}。トークンも同じ向きに動いた。</p>
    <p>ただし対象者は日ごとに入れ替わり、時期による変動も含む。この差は参考にとどめ、設定の働きは 1・2 節の分布で判断する。</p>`;
})();
