"use strict";
// 数値と日付の書式。丸めた値は .exact[data-exact] で包み、当てると正確な値を出す（tip.js）
window.Fmt = (() => {
  const EPOCH = Date.UTC(1970, 0, 1), DAY = 86400000;
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const PROVIDER = { "aws-bedrock": "AWS Bedrock", "google-vertex": "Google Vertex AI" };
  const USD_WHOLE_FROM = 1000;
  const TOKEN_K_FROM = 1000, TOKEN_M_FROM = 1e6, TOKEN_M_INT_FROM = 1e7;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const int = (n) => Math.round(n).toLocaleString("en-US");
  const fixed = (n, d) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // 日付（epoch 日 ⇔ 表示）
  const toDay = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - EPOCH) / DAY);
  const iso = (day) => new Date(EPOCH + day * DAY).toISOString().slice(0, 10);
  const ymd = (day) => iso(day);
  const md = (day) => iso(day).slice(5).replace("-", "/");
  const wd = (day) => `（${WD[new Date(EPOCH + day * DAY).getUTCDay()]}）`;
  const isMonday = (day) => new Date(EPOCH + day * DAY).getUTCDay() === 1;
  const slash = (isoText) => isoText.replaceAll("-", "/");

  // 丸めた表示と正確な値を組にする。丸めで何も失わないときは包まない。html は shown を部品に分けた表示
  const exact = (shown, full, html = shown) => (shown === full ? html : `<span class="exact" data-exact="${esc(full)}">${html}</span>`);
  // 数字と単位を分ける（単位は小さく薄く、数字は数字用の書体の等幅）
  const numHtml = (numText, unit = "", pre = "") => `<span class="nv">${pre ? `<span class="unit pre">${pre}</span>` : ""}<span class="n">${numText}</span>${unit ? `<span class="unit">${unit}</span>` : ""}</span>`;
  const usdHtml = (text) => numHtml(text.slice(1), "", "$");
  const tokHtml = (text) => { const m = text.match(/^(.*?)([kM]?)$/); return numHtml(m[1], m[2]); };

  // 金額: 1,000 以上は整数、未満はセント 2 桁
  const usdText = (v, whole = Math.abs(v) >= USD_WHOLE_FROM) => `$${whole ? int(v) : fixed(v, 2)}`;
  const usd = (v) => exact(usdText(v), usdText(v, false), usdHtml(usdText(v)));
  // 列の中で書式をそろえる（列の最大が 1,000 以上なら全行を整数）
  const usdCol = (values) => {
    const whole = Math.max(...values.map(Math.abs)) >= USD_WHOLE_FROM;
    return (v) => exact(usdText(v, whole), usdText(v, false), usdHtml(usdText(v, whole)));
  };

  // トークン: 100 万未満は k、以上は M（1,000 万未満は小数 1 桁）
  const tokText = (n) => {
    if (n < TOKEN_K_FROM) return int(n);
    if (Math.round(n / TOKEN_K_FROM) < TOKEN_K_FROM) return `${int(n / TOKEN_K_FROM)}k`;
    return n < TOKEN_M_INT_FROM ? `${fixed(n / TOKEN_M_FROM, 1)}M` : `${int(n / TOKEN_M_FROM)}M`;
  };
  const tok = (n) => exact(tokText(n), int(n), tokHtml(tokText(n)));
  // 列の単位は最大値で 1 つに決める（M の列は小数 2 桁）
  const tokCol = (values) => {
    const max = Math.max(...values);
    if (max >= TOKEN_M_FROM) return (n) => exact(`${fixed(n / TOKEN_M_FROM, 2)}M`, int(n), numHtml(fixed(n / TOKEN_M_FROM, 2), "M"));
    if (max >= TOKEN_K_FROM) return (n) => exact(`${int(n / TOKEN_K_FROM)}k`, int(n), numHtml(int(n / TOKEN_K_FROM), "k"));
    return (n) => numHtml(int(n));
  };

  // 増減・割合・値と単位
  const signed = (v, digits = 0, unit = "") => (Math.abs(v) < 10 ** -digits / 2 ? `±0${unit}` : `${v > 0 ? "+" : "−"}${fixed(Math.abs(v), digits)}${unit}`);
  const pct = (v, d = 1) => `${fixed(v, d)}%`;
  // withUnit は HTML（表・カード）、unitText は文字だけの所（札の文言・知らせ）に使う
  const withUnit = (numText, unit) => numHtml(numText, unit);
  const unitText = (numText, unit) => (unit ? `${numText} ${unit}` : numText);
  const bytes = (b) => `${fixed(b / 1e6, 2)} MB`;

  return { PROVIDER, esc, int, fixed, toDay, iso, ymd, md, wd, isMonday, slash, exact, usd, usdText, usdCol, tok, tokText, tokCol, signed, pct, withUnit, unitText, bytes };
})();
