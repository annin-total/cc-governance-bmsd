"use strict";
// 基準日（期間の終わり E。`?asof=YYYY-MM-DD`、利用明細の最終日なら付けない）と、帯の期間の表示・利用明細の古さの警告。
// 状態のページ（page.now）は基準日を使わないが、URL の asof を消さずに引き継ぐ。日を選ぶのは calendar.js。
(() => {
  const K = window.KIT;
  const { esc, fill } = K;
  const DAY = 86400000;
  const ASOF_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
  const asked = new URLSearchParams(location.search).get("asof");
  // href に埋め込むので、日付の形でない値は捨てる
  const ASOF = asked && ASOF_FORMAT.test(asked) ? asked : null;
  const meta = () => window.DATA.meta;
  const chosen = () => (ASOF ? Math.min(Math.round(Date.parse(ASOF) / DAY), meta().end) : meta().end);

  // 基準日を引き継いだ URL（`?page=…` の後ろに足す）
  const keep = (href) => (ASOF ? `${href}&asof=${ASOF}` : href);

  function hrefAt(d) {
    const q = new URLSearchParams(location.search);
    if (d >= meta().end) q.delete("asof"); else q.set("asof", K.day(d));
    return `?${q}${location.hash}`;
  }

  // 今日の取り込みの状態（選んだ基準日に依らない）。古さの警告と csv_freshness は同じ判定（csv_stale_days）から出す
  function fresh() {
    const m = meta();
    const age = m.csv_end === null ? null : m.today - m.csv_end;
    return { today: m.today, csv_end: m.csv_end, end: chosen(), age, state: age !== null && age >= m.csv_stale_days ? "warn" : "ok" };
  }

  // 帯の期間の表示: 期間のページは押すとカレンダー（P3）、状態のページは「MM/DD 時点」で押せない
  function display(page) {
    const L = K.L;
    if (page.now) return `<span class="asof-range asof-now" data-period-display>${esc(L.ASOF.replace("{}", K.md(meta().today)))}</span>`;
    const end = chosen(), p = window.DATA.p[K.period].period;
    const text = !page.periods ? L.ASOF.replace("{}", K.md(end)) : `${(p.long ? K.day : K.md)(end - (p.end - p.start))}〜${K.md(end)}`;
    return `<span class="asof-range" data-period-display><button type="button" data-cal-open data-cal-span="${page.periods && !p.long ? p.days : 0}" aria-expanded="false" title="${esc(L.BASE_DATE_PICK)}">${esc(text)}</button></span>`;
  }

  // 利用明細の古さの警告（全ページの帯。押すと収集の状態へ）
  function stale() {
    const s = fresh();
    return s.state === "warn" ? `<a class="stale" href="${esc(keep("?page=collect"))}" data-stale>${esc(fill(K.L.STALE, s))}</a>` : "";
  }

  K.basedate = { display, stale, keep, hrefAt, chosen, fresh, ASOF };
})();
