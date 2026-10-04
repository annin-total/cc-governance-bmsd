"use strict";
// 値の書式と文言の雛形（サーバの filters.py・text.py の写し）。`{名前[キー]:書式}` を ctx の値で埋める。
(() => {
  const EM = "—";
  const WHOLE_FROM = 1000;
  const K = 1000, M = 1000000, M_WHOLE_FROM = 10000000;
  const CONTEXT_BIN = 20000;
  const isNum = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));
  const halfUp = (v) => Math.sign(v) * Math.floor(Math.abs(v) + 0.5);
  const grouped = (v, d) => Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const date = (d) => new Date(Number(d) * 86400000);
  const day = (v) => (isNum(v) ? date(Math.trunc(v)).toISOString().slice(0, 10) : EM);
  const num = (v) => (isNum(v) ? grouped(Math.trunc(Number(v)), 0) : EM);
  function scaled(v, digits, whole) {
    if (whole === undefined || whole === null) whole = Math.abs(Number(v.toFixed(digits))) >= WHOLE_FROM;
    return whole ? grouped(halfUp(v), 0) : grouped(v, digits);
  }
  const MINUS = "−"; // 負の符号は増減率（signed）と同じマイナス記号（U+2212）
  const usd = (v, whole) => (isNum(v) ? (Number(v) < 0 ? MINUS + "$" : "$") + scaled(Math.abs(Number(v)), 2, whole) : EM);
  const usdFull = (v) => usd(v, false);
  const usd0 = (v) => (isNum(v) ? (Number(v) < 0 ? MINUS + "$" : "$") + grouped(Math.abs(Number(v)), 0) : EM);
  const dec1 = (v, whole) => (isNum(v) ? scaled(Number(v), 1, whole) : EM);
  const tokUnit = (top) => (halfUp(top / K) >= K ? "M" : top >= K ? "k" : "");
  function tok(v, unit) {
    if (!isNum(v)) return EM;
    const n = Number(v);
    if (unit === undefined || unit === null) {
      if (n < K) return tok(n, "");
      if (halfUp(n / K) < K) return tok(n, "k");
      return grouped(n / M, Number((n / M).toFixed(1)) >= M_WHOLE_FROM / M ? 0 : 1) + "M";
    }
    if (unit === "M") { const t = grouped(n / M, 2); return n && !Number(t.replace(/,/g, "")) ? "<0.01M" : t + "M"; }
    if (unit === "k") return n && !halfUp(n / K) ? "<1k" : grouped(halfUp(n / K), 0) + "k";
    return grouped(halfUp(n), 0);
  }
  function signed(v, digits = 0) {
    if (!isNum(v)) return EM;
    const n = Number(v);
    const body = grouped(Math.abs(n), digits);
    if (Number(n.toFixed(digits)) === 0) return "±" + body;
    return (n > 0 ? "+" : MINUS) + body;
  }
  const md = (v) => { const t = day(v); return t === EM ? t : t.slice(5).replace("-", "/"); };
  const ym = (v) => { const t = day(v); return t === EM ? t : t.slice(0, 7); };
  const mon = (v) => { const t = day(v); return t === EM ? t : String(Number(t.slice(5, 7))); };
  const weekday = (v) => (isNum(v) ? "月火水木金土日"[(date(v).getUTCDay() + 6) % 7] : EM);
  const pct = (v) => (isNum(v) ? Number(v).toFixed(1) + "%" : EM);
  function binRange(v, size = CONTEXT_BIN) {
    if (!isNum(v)) return EM;
    const lo = Math.floor(v / 1000), hi = Math.floor((Number(v) + size) / 1000);
    return `${lo === 0 ? "0" : lo + "k"}–${hi}k`;
  }
  const rel = (v) => (!isNum(v) ? EM : v < 0 ? `${MINUS}${-v} 日` : v > 0 ? `+${v} 日` : "0 日");
  function size(v) {
    if (!isNum(v)) return EM;
    if (halfUp(v / 1000) >= 1000) return grouped(v / 1e6, 1) + " MB";
    return v >= 1000 ? grouped(halfUp(v / 1000), 0) + " KB" : "1 KB 未満";
  }

  function termDesc(terms, key) {
    if (key === null || key === undefined) return [EM, ""];
    const found = (terms || {})[key];
    if (found === undefined || found === null) return [String(key), ""];
    if (typeof found === "string") return [found, ""];
    return [found[0], found.length > 1 ? found[1] : ""];
  }
  const term = (terms, key) => termDesc(terms, key)[0];

  const L = () => window.KIT.L;
  const FORMATS = {
    num, dec1, usd, usd0, tok, pct, day, md, ym, mon, weekday, signed, bin: (v) => binRange(v), rel, size,
    count: (v) => num((v || []).length),
    asof: (v) => (v === null || v === undefined ? L().FC_NO_CSV : L().FC_UNTIL.replace("{}", md(v))),
    signed1: (v) => signed(v, 1),
    signed_pct: (v) => (isNum(v) ? signed(v, 1) + "%" : EM),
    signed_pt: (v) => (isNum(v) ? signed(v, 1) + " pt" : EM),
    signed_usd: (v) => (isNum(v) ? (Number(v) > 0 ? "+" : "") + usd(v) : EM),
    field: (v) => term(L().HEALTH_ITEM, v),
    setting: (v) => term(L().SETTING, v),
    provider: (v) => term(L().PROVIDER, v),
    model: (v) => term(L().MODEL, v),
    stage: (v) => term(L().STAGE, v),
    basis: (v) => L().BASIS[v],
    basis_note: (v) => L().BASIS_NOTE[v],
  };
  const EXACT = { usd: usdFull, dec1: (v) => dec1(v, false), tok: num };

  // `users[recent]`・`users.recent` の形の場所。キーが無ければ定義の誤りとしてコンソールに出す（撮影で数える）
  function lookup(ctx, path, quiet) {
    const keys = String(path).replace(/\[([^\]]*)\]/g, ".$1").split(".").filter(Boolean);
    let v = ctx;
    for (const k of keys) {
      if (v === null || v === undefined || !(k in Object(v))) {
        if (!quiet) console.error(`kit: 値が無い: ${path}`);
        return undefined;
      }
      v = v[k];
    }
    return v;
  }
  const FIELD = /\{([^{}:]+)(?::([^{}]*))?\}/g;
  function formatField(value, spec) {
    if (spec && FORMATS[spec]) return FORMATS[spec](value);
    if (value === null || value === undefined) return EM;
    return String(value);
  }
  const fill = (template, ctx) => String(template ?? "").replace(FIELD, (_, name, spec) => formatField(lookup(ctx, name), spec));
  function parts(template, ctx) {
    const out = [];
    let last = 0;
    String(template ?? "").replace(FIELD, (m, name, spec, at) => {
      if (at > last) out.push([template.slice(last, at), ""]);
      const value = lookup(ctx, name);
      const shown = formatField(value, spec);
      const full = spec in EXACT && value !== null && value !== undefined ? EXACT[spec](value) : shown;
      out.push([shown, full === shown ? "" : full]);
      last = at + m.length;
      return m;
    });
    if (last < String(template ?? "").length) out.push([template.slice(last), ""]);
    return out;
  }
  const exact = (shown, full) => (full && full !== shown
    ? `<span class="exact" data-tip="${esc(L().EXACT + "  " + full)}" title="${esc(full)}">${esc(shown)}</span>` : esc(shown));
  const partsHtml = (ps) => ps.map(([s, f]) => exact(s, f)).join("");

  window.KIT = Object.assign(window.KIT || {}, {
    EM, esc, day, num, usd, usdFull, usd0, dec1, tok, tokUnit, signed, md, ym, mon, weekday, pct, binRange, rel, size,
    term, termDesc, FORMATS, lookup, fill, parts, exact, partsHtml, WHOLE_FROM,
  });
})();
