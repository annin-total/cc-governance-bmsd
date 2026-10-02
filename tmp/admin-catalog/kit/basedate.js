"use strict";
// 基準日の指定（全ページ。`?asof=YYYY-MM-DD`、今日なら付けない）。ページを移っても URL で引き継ぐ。
// 置き場は look.asofAt: header（ヘッダーの「時点」を置き換える）・page（ページ内、期間のタブの隣）・range（期間の表示を押して選ぶ）・step（header に前後の送り）。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const DAY = 86400000;
  const ASOF = new URLSearchParams(location.search).get("asof");
  const STEP = { 28: 28 }; // 送りの日数。期間のタブの日数で、ほかは 7 日
  const today = () => window.DATA.meta.asof;
  const first = () => window.DATA.meta.first_day + 27;
  const chosen = () => (ASOF ? Math.round(Date.parse(ASOF) / DAY) : today());
  const at = () => K.look.get().asofAt;

  // 基準日を引き継いだ URL（`?page=…` の後ろに足す）
  const keep = (href) => (ASOF ? `${href}&asof=${ASOF}` : href);

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
  const header = () => (at() === "header" ? asPick() : at() === "step" ? stepper() : asText());

  // ページ見出しの右（page は期間のタブの前、range は後ろに置く）
  function act(page, where) {
    if (where === "before" && at() === "page") return `<label class="asof-pick asof-page">${esc(K.L.BASE_DATE)}${input()}</label>`;
    if (where !== "after" || at() !== "range") return "";
    const p = window.DATA.p[K.period].period, end = chosen();
    const text = !page.periods ? K.L.ASOF.replace("{}", K.md(end)) : `${(p.long ? K.day : K.md)(end - (p.end - p.start))}〜${K.md(end)}`;
    return `<span class="asof-range"><button type="button" data-asof-open title="${esc(K.L.BASE_DATE_PICK)}">${esc(text)}</button>${input("asof-hidden")}</span>`;
  }

  K.basedate = { header, act, keep, hrefAt, ASOF };
})();
