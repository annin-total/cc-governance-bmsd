"use strict";
// 基準日の指定（全ページ。`?asof=YYYY-MM-DD`、今日なら付けない）。ページを移っても URL で引き継ぐ。
// 置き場は look.asofAt: header（ヘッダーの「時点」を置き換える）・page（ページ内、期間のタブの隣）・range（期間の表示を押して選ぶ）・step（header に前後の送り）。
// look.ends が bill（案 51）のときは、基準日は期間の終わりで既定は利用明細の最終日（meta.end）。帯の期間の表示と古さの警告は period5.js、日を選ぶのは calendar.js。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const DAY = 86400000;
  const ASOF = new URLSearchParams(location.search).get("asof");
  const STEP = { 28: 28 }; // 送りの日数。期間のタブの日数で、ほかは 7 日
  const bill = () => K.look.get().ends === "bill";
  const today = () => (bill() ? window.DATA.meta.end : window.DATA.meta.asof);
  const first = () => (bill() ? window.DATA.meta.first_pick : window.DATA.meta.first_day + 27);
  const chosen = () => (ASOF ? Math.min(Math.round(Date.parse(ASOF) / DAY), today()) : today());
  const at = () => K.look.get().asofAt;

  // 基準日と、選んだ部署（案 51 の dept・sec）を引き継いだ URL（`?page=…` の後ろに足す）
  const KEEP = ["dept", "sec"];
  const kept = () => { const q = new URLSearchParams(location.search); return KEEP.filter((k) => q.get(k)).map((k) => `&${k}=${encodeURIComponent(q.get(k))}`).join(""); };
  const keep = (href) => (ASOF ? `${href}&asof=${ASOF}` : href) + kept();

  function hrefAt(d) {
    const q = new URLSearchParams(location.search);
    if (d >= today()) q.delete("asof"); else q.set("asof", K.day(d));
    return `?${q}${location.hash}`;
  }

  const input = (cls = "") => `<input type="date"${cls ? ` class="${cls}"` : ""} value="${K.day(chosen())}" min="${K.day(first())}" max="${K.day(today())}" aria-label="${K.L.BASE_DATE}" data-asof>`;
  const [before, after] = K.L.ASOF.split("{}");
  const asText = () => `<span class="asof">${esc(K.L.ASOF.replace("{}", K.day(chosen())))}</span>`;
  const asPick = () => `<label class="asof asof-pick">${esc(before)}${input()}${esc(after)}</label>`;

  function stepper() {
    const n = STEP[K.period] || 7, d = chosen();
    const link = (to, text, title) => (!(to > d ? d < today() : to >= first())
      ? `<span class="asof-step" aria-disabled="true">${text}</span>`
      : `<a class="asof-step" href="${esc(hrefAt(Math.min(to, today())))}" title="${esc(title)}" aria-label="${esc(title)}">${text}</a>`);
    return `<span class="asof-steps">${link(d - n, "‹", K.L.STEP_BACK.replace("{}", n))}${asPick()}${link(d + n, "›", K.L.STEP_NEXT.replace("{}", n))}</span>`;
  }

  // ヘッダーの右端
  const header = () => (bill() ? "" : at() === "header" ? asPick() : at() === "step" ? stepper() : asText());

  // ページ見出しの右（page は期間のタブの前、range は後ろに置く）
  function act(page, where) {
    if (bill()) return where === "after" ? K.basedate.display(page) + K.basedate.stale() : "";
    if (where === "before" && at() === "page") return `<label class="asof-pick asof-page">${esc(K.L.BASE_DATE)}${input()}</label>`;
    if (where !== "after" || at() !== "range") return "";
    const p = window.DATA.p[K.period].period, end = chosen();
    const text = !page.periods ? K.L.ASOF.replace("{}", K.md(end)) : `${(p.long ? K.day : K.md)(end - (p.end - p.start))}〜${K.md(end)}`;
    return `<span class="asof-range"><button type="button" data-asof-open title="${esc(K.L.BASE_DATE_PICK)}">${esc(text)}</button>${input("asof-hidden")}</span>`;
  }

  K.basedate = { header, act, keep, hrefAt, chosen, today, first, ASOF };
})();
