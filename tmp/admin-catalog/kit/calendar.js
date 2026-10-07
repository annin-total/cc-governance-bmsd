"use strict";
// 自作のカレンダー（案 51。第 4 弾から移植）。帯の期間の表示を押すと、その下に開く。型は look.cal（CA1〜CA6。CA7 の日の帯は calendar_strip.js）。
// どの型も日の見せ方は 3 つ（meta.days から）: 利用明細あり・利用明細の取り込み待ち（最終日より後で記録がある日。斜線で押せない）・利用明細なし。
// 選べる日は meta.first_pick〜meta.end。選んだ日を枠で、その日で終わる期間を薄い地で示す。「最新」で asof を外す。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const DAY = 86400000;
  const HEAT_STEPS = 4; // CA5 の濃淡の段の数
  let shown = null; // 表示中の月の 1 日（epoch 日）

  const date = (d) => new Date(d * DAY);
  const fromYM = (y, m) => Math.round(Date.UTC(y, m, 1) / DAY);
  const monthOf = (d) => fromYM(date(d).getUTCFullYear(), date(d).getUTCMonth());
  const addMonths = (first, n) => fromYM(date(first).getUTCFullYear(), date(first).getUTCMonth() + n);
  const weekEnd = (d) => d + (6 - ((date(d).getUTCDay() + 6) % 7)); // その週の日曜

  function kindOf(d, info, m) {
    if (info && info.csv) return "has";
    if (info && info.rec && (m.csv_end === null || d > m.csv_end)) return "wait";
    return "none";
  }

  // 選べる日か（どの型も同じ。取り込み待ちと範囲外は押せない）
  const can = (d, ctx) => ctx.m.first_pick !== null && d >= ctx.m.first_pick && d <= ctx.m.end && kindOf(d, ctx.days.get(d), ctx.m) !== "wait";
  // CA4: 日を押すと、その週の最後の選べる日を選ぶ
  const pickOf = (d, ctx) => { if (ctx.type !== "CA4") return d; for (let x = Math.min(weekEnd(d), ctx.m.end); x >= d - 6; x--) if (can(x, ctx)) return x; return null; };

  function heatOf(d, ctx) {
    if (!ctx.heat) return "";
    const v = ctx.heat.get(d);
    return v ? ` heat-${Math.min(HEAT_STEPS, Math.ceil((v / ctx.heatTop) * HEAT_STEPS))}` : "";
  }

  function dayHtml(d, ctx) {
    const { sel, span } = ctx;
    const kind = kindOf(d, ctx.days.get(d), ctx.m);
    const to = kind === "wait" ? null : pickOf(d, ctx);
    const ok = to !== null && can(to, ctx);
    const cls = [`cal-day cal-${kind}`, span && d > sel - span && d <= sel ? "in-range" : "", d === sel ? "is-sel" : "", ok ? "" : "is-off", heatOf(d, ctx).trim()].filter(Boolean).join(" ");
    return `<button type="button" class="${cls}" data-day="${d}"${ok && to !== d ? ` data-pick="${to}"` : ""} aria-label="${esc(K.day(d))}"${d === sel ? ' aria-current="date"' : ""}${ok ? "" : " disabled"}>${date(d).getUTCDate()}</button>`;
  }

  function monthHtml(first, ctx) {
    const next = addMonths(first, 1), lead = (date(first).getUTCDay() + 6) % 7;
    const cells = Array.from({ length: lead }, () => "<span></span>").join("") + Array.from({ length: next - first }, (_, i) => dayHtml(first + i, ctx)).join("");
    return `<div class="cal-month"><b class="cal-name">${esc(K.ym(first))}</b><div class="cal-grid">${Object.values(K.L.WEEKDAY_NAMES).map((w) => `<span class="cal-wd">${esc(w)}</span>`).join("")}${cells}</div></div>`;
  }

  // CA6: よく使う選択肢（最新・1 つ前の期間・先月末・前の月末）
  function picks(ctx) {
    const L = K.L, m = ctx.m, end1 = monthOf(m.end) - 1, end2 = monthOf(end1) - 1;
    const items = [["latest", m.end], ["prev", ctx.sel - (ctx.span || 7)], ["month_end", end1], ["month_end2", end2]];
    return `<div class="cal-picks">${items.map(([k, d]) => `<button type="button" data-cal-go="${d}"${d >= m.first_pick && d <= m.end ? "" : " disabled"}${d === ctx.sel ? ' aria-current="true"' : ""}>`
      + `${esc(L.CAL_PICKS[k])}<span>${esc(K.md(d))}</span></button>`).join("")}</div>`;
  }

  function context(span) {
    const m = window.DATA.meta, type = K.look.get().cal;
    const ctx = { m, days: new Map(m.days.map((x) => [x.day, x])), sel: K.basedate.chosen(), span, type };
    if (type === "CA5") {
      ctx.heat = new Map(window.DATA.p["12m"].r5.series.map((r) => [r.day, r.cost]));
      ctx.heatTop = Math.max(1, ...ctx.heat.values());
    }
    return ctx;
  }

  const legendHtml = (ctx) => `<span class="cal-legend">${Object.entries(K.L.CAL_LEGEND).map(([k, t]) => `<span><i class="cal-key cal-${k}"></i>${esc(t)}</span>`).join("")}`
    + `${ctx.heat ? `<span><i class="cal-key heat-${HEAT_STEPS}"></i>${esc(K.L.CAL_HEAT)}</span>` : ""}</span>`;

  function html(span) {
    const L = K.L, ctx = context(span), m = ctx.m;
    const two = ctx.type === "CA2";
    const firstShown = two ? addMonths(shown, -1) : shown;
    const nav = (dir, off, label) => `<button type="button" class="cal-nav" data-cal-move="${dir}" aria-label="${esc(label)}"${off ? " disabled" : ""}>${dir < 0 ? "‹" : "›"}</button>`;
    const months = (two ? [firstShown, shown] : [shown]).map((f) => monthHtml(f, ctx)).join("");
    const body = `<div class="cal-head">${nav(-1, firstShown <= monthOf(m.days[0].day), L.CAL_PREV)}${nav(1, shown >= monthOf(m.today), L.CAL_NEXT)}</div><div class="cal-months">${months}</div>`
      + `<div class="cal-foot">${legendHtml(ctx)}<button type="button" class="cal-latest" data-cal-latest>${esc(L.LATEST)}</button></div>`;
    return `<div class="cal cal-${ctx.type}" role="dialog" aria-label="${esc(L.BASE_DATE_PICK)}" data-cal>${ctx.type === "CA6" ? `${picks(ctx)}<div class="cal-main">${body}</div>` : body}</div>`;
  }

  function close() {
    document.querySelectorAll(".cal[data-cal]").forEach((c) => c.remove());
    document.querySelectorAll("[data-cal-open]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  }

  function render(button) {
    close();
    button.closest("[data-period-display]").insertAdjacentHTML("beforeend", html(Number(button.dataset.calSpan)));
    button.setAttribute("aria-expanded", "true");
  }

  const go = (d) => { location.href = K.basedate.hrefAt(d); };

  document.addEventListener("click", (e) => {
    const t = e.target;
    const open = t.closest("[data-cal-open]");
    if (open) {
      if (open.getAttribute("aria-expanded") === "true") { close(); return; }
      shown = monthOf(K.basedate.chosen());
      render(open);
      return;
    }
    const day = t.closest("[data-cal] [data-day]");
    if (day && !day.disabled) { go(Number(day.dataset.pick || day.dataset.day)); return; }
    const pick = t.closest("[data-cal-go]");
    if (pick && !pick.disabled) { go(Number(pick.dataset.calGo)); return; }
    if (t.closest("[data-cal-latest]")) { go(window.DATA.meta.end); return; }
    if (!t.closest(".cal[data-cal]")) { close(); return; }
    const move = t.closest("[data-cal-move]");
    if (move && !move.disabled) { shown = addMonths(shown, Number(move.dataset.calMove)); render(document.querySelector("[data-cal-open][aria-expanded=true]")); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  K.calendar = { kindOf, can, context, dayHtml, legendHtml };
})();
