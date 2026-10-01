"use strict";
// 表のセル（サーバの components/cells.html・marks.html の写しと、足した種類）。
(() => {
  const K = window.KIT;
  const { esc, fill, term, termDesc, exact } = K;
  const L = () => K.L;
  const sub = (t) => `<span class="sub">${esc(t)}</span>`;
  const mark = (tone, label) => `<span class="mark ${tone}">${esc(label)}</span>`;
  const dot = (v) => {
    const cls = v === null || v === undefined ? "none" : v ? "yes" : "no";
    return `<span class="on ${cls}" role="img" aria-label="${esc(L().DOT[String(v ?? null)])}"></span>`;
  };
  const isNone = (v) => v === null || v === undefined;

  function measure(v, row) {
    if (isNone(v)) return sub("—");
    if (row.unit === "rate") return esc(K.pct(v));
    return `${esc(K.num(v))} ${esc(L().UNIT[row.unit])}`;
  }
  function user(v) {
    if (isNone(v)) return sub("—");
    const at = v.indexOf("@");
    return at < 0 ? `<b class="u-id">${esc(v)}</b>` : `<b class="u-id">${esc(v.slice(0, at))}</b><span class="sub">@${esc(v.slice(at + 1))}</span>`;
  }
  const usdCell = (v, col) => exact(K.usd(v, col.scale), K.usdFull(v));

  // 値が None でも描く種類
  const ANY = {
    measure: (v, row) => measure(v, row) + (row.ratio ? " " + sub(`${K.num(row.ratio.numerator)} / ${K.num(row.ratio.denominator)} ${L().UNIT.person}`) : ""),
    measure_sub: (v, row) => `<span class="sub">${measure(v, row)}</span>`,
    last_day: (v, row) => (isNone(v) ? sub(L().NO_REPORT)
      : `${esc(K.day(v))}<span class="sub${row.late ? " late" : ""}"> ${esc(row.ago === 0 ? L().TODAY : L().DAYS_AGO.replace("{}", row.ago))}</span>`),
    user,
    dot,
    bar: (v) => K.viz.hbar(v),
    state: (v, row, col) => (!v ? sub("—") : v === "ok" && col.quiet ? sub(L().STATE.ok) : mark(v, L().STATE[v])),
    user_state: (v, row) => mark(L().USER_STATE[v][0], row.off ? L().OFF_ITEMS.replace("{}", row.off) : L().USER_STATE[v][1])
      + (row.old ? " " + mark(...L().USER_STATE.old) : ""),
    delivery: (v) => (v === "ok" ? sub(L().DELIVERY.ok[1]) : mark(...L().DELIVERY[v])),
    delete: (v, row) => `<form data-confirm="${esc(fill("{day:day}（{day:weekday}）の休日「{name}」を削除します。よろしいですか。", row))}" onsubmit="return false"><button type="submit" class="btn-quiet">削除</button></form>`,
    delete_file: (v, row) => `<form data-confirm="${esc(fill(isNone(row.first) ? "{source_file} を削除します。よろしいですか。" : "{source_file} を削除します。取り込んだ {first:day}〜{last:day} の利用明細の行も消えます。よろしいですか。", row))}" onsubmit="return false"><button type="submit" class="btn-quiet">削除</button></form>`,
    span: (v, row) => esc(fill(L().SPAN, row)),
    rank: (v) => (isNone(v) ? sub("—") : `<b>${esc(K.num(v))}</b>`),
  };
  // 値が None なら「—」（value の列は「未設定」）
  const SOME = {
    num: (v, row, col) => esc(K.num(v)) + (col.unit ? ` ${esc(col.unit)}` : ""),
    day: (v) => esc(K.day(v)),
    ym: (v) => esc(K.ym(v)),
    md: (v) => esc(K.md(v)),
    weekday: (v) => esc(K.weekday(v)),
    week: (v, row) => (row.partial ? esc(fill(L().WEEK_PARTIAL, row)) + sub(fill(L().WEEK_DAYS, row)) : esc(fill(L().WEEK, row))),
    mday: (v, row) => esc(K.md(v)) + sub(fill(L().MDAY_WEEKDAY, row)) + (row.from ? sub(fill(L().BD_FROM, row)) : "")
      + (row.to ? sub(fill(L().BD_TO, row)) : "") + (row.off ? sub(fill(L().MDAY_OFF, row)) : ""),
    cum: (v, row, col) => (row.actual ? `<b>${usdCell(v, col)}</b>` : sub(L().FC_FORECAST.replace("{}", K.usd(v, col.scale)))),
    usd_sub: (v, row, col) => `<span class="sub">${usdCell(v, col)}</span>`,
    bytes: (v) => esc(K.size(v)),
    bin: (v) => esc(K.binRange(v)),
    rel: (v) => esc(K.rel(v)),
    num_sub: (v) => sub(K.num(v)),
    date: (v) => esc(K.day(v)) + sub(`（${K.weekday(v)}）`),
    tag: (v, row, col) => sub(term(col.terms, v)),
    term: (v, row, col) => {
      const [name, desc] = termDesc(col.by ? (col.terms || {})[row[col.by]] : col.terms, v);
      return esc(name) + (desc ? " " + sub(desc) : "");
    },
    stage: (v, row, col) => esc(term(col.terms, v)) + (v in (col.terms || {}) ? `<span class="sub code"> ${esc(v)}</span>` : ""),
    usd: (v, row, col) => usdCell(v, col),
    usd_strong: (v, row, col) => `<b>${usdCell(v, col)}</b>`,
    tok: (v, row, col) => exact(K.tok(v, col.scale), K.num(v)),
    pct: (v) => esc(K.pct(v)),
    pct_strong: (v) => `<b>${esc(K.pct(v))}</b>`,
    diff: (v, row) => (row.unit === "rate" ? `${esc(K.signed(v, 1))} ${L().UNIT.pt}` : esc(K.signed(v))),
    code: (v) => `<span class="code">${esc(v)}</span>`,
    setting: (v, row, col) => `${esc(term(col.terms, v))} <span class="sub code key">${esc(v)}</span>`,
    ratio: (v, row) => `${esc(K.num(v))} ${sub(`/ ${K.num(row.denominator)} ${L().UNIT.person}`)}`,
    version: (v, row) => `<span class="code">${esc(v)}</span>` + (row.latest ? " " + mark("ok", L().LATEST) : ""),
    count_of: (v, row) => `${esc(K.num(v))} ${sub(`/ ${K.num(row.total)} ${L().UNIT.person}`)}`,
    usd_day: (v, row, col) => `${usdCell(v, col)} ${sub(K.md(row[col.at]))}`,
    pct_change: (v) => esc(K.FORMATS.signed_pct(v)),
    yes_no: (v, row, col) => (v ? esc(col.terms[0]) : sub(col.terms[1])),
    dec1: (v, row, col) => esc(K.dec1(v)) + (col.unit ? ` ${esc(col.unit)}` : ""),
    model: (v) => esc(term(L().MODEL, v)),
    text: (v) => esc(v),
    tops: (v) => (v.length ? v.map((r) => `${esc(r.key)} ${sub(K.num(r.calls))}`).join("<br>") : sub("—")),
  };

  function cell(c) {
    const { v, row, col } = c;
    const k = col.kind;
    if (ANY[k]) return ANY[k](v, row, col);
    if (isNone(v)) return sub("—");
    if (SOME[k]) return SOME[k](v, row, col);
    console.error(`kit: 知らないセルの種類: ${k}`);
    return esc(v);
  }

  window.KIT = Object.assign(window.KIT || {}, { cells: { cell, mark, dot } });
})();
