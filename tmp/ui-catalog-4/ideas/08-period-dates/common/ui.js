"use strict";
// 本物の画面と同じ部品の HTML（カード・群・タブ・パネル・絞り込み・表）。本実装では Jinja のマクロに当たる
window.UI = (() => {
  const F = window.Fmt;

  // 指標カード
  const change = (text, up) => `<span class="change${up ? " up" : ""}">${text}</span>`;
  const mark = (state, label) => `<span class="mark ${state}">${label}</span>`;
  const cap = (...xs) => `<span class="cap">${xs.map((x) => `<span>${x}</span>`).join("")}</span>`;
  const meter = (pct, note) => `<span class="meter"><i style="width: ${pct}%"></i></span>${cap(note)}`;
  const hbarSpan = (pct, ghost) => `<span class="hbar${ghost ? " ghost" : ""}"><i style="width: ${Math.min(100, pct).toFixed(1)}%"></i></span>`;
  const card = ({ label, open, mark: m, value, unit = "", sub = "", viz = "", cls = "" }) => `<a class="card${cls ? ` ${cls}` : ""}" href="#${open.split(":")[0]}" data-open="${open}">
  <span class="k-label"><span>${label}</span>${m || '<span class="go">一覧</span>'}</span>
  <span class="k-value">${value}<span class="u">${unit}</span></span>
  ${sub ? `<span class="k-sub">${sub}</span>` : ""}
  <span class="k-viz">${viz}</span></a>`;
  // 群: 見出し・カード・注記。body はカードの代わりに置く中身（エクスポートのページなど）
  const group = (label, scope, cards, note = "", body = "") => `<section class="group" aria-label="${label}">
  <h2 class="glabel">${label}<span>${scope}</span></h2>
  ${cards ? `<div class="cards">${cards}</div>` : ""}${note ? `<p class="gnote">${note}</p>` : ""}${body}</section>`;

  // 分段タブと中身の枠
  const tabs = (list) => `<div class="tabs" role="tablist">${list.map(({ id, title, sub }) =>
    `<a role="tab" id="tab-${id}" href="#${id}" aria-controls="${id}" data-tab="${id}"><b>${title}</b><span>${sub}</span></a>`).join("")}</div>`;
  const panel = (id, body) => `<div class="panel" role="tabpanel" id="${id}" aria-labelledby="tab-${id}" data-panel="${id}">${body}</div>`;
  const detail = (tabList, bodies) => `<section class="detail" id="detail" aria-label="詳しい一覧" data-tabs>
  <h2 class="glabel">詳しい一覧<span>タブで切り替え · カードを押すと該当する一覧が開きます</span></h2>
  ${tabs(tabList)}${tabList.map(({ id }) => panel(id, bodies[id])).join("")}</section>`;
  const head = (h2, scope) => `<header class="p-head"><h2>${h2}</h2><p class="scope">${scope}</p></header>`;
  const note = (text) => `<p class="note">${text}</p>`;

  // 絞り込みと並べ替えつきの表（app.js が data-* を見て動かす）
  const filters = ({ search, chips = [], total, unit }) => `<div class="filters" data-filter>
  ${search ? `<label class="search"><span class="sr">絞り込み</span><input type="search" placeholder="${search}" data-search></label>` : ""}
  ${chips.length ? `<div class="chipbar" role="group" aria-label="区分">${chips.map(([id, l, c], i) =>
    `<button type="button" data-chip="${id}" aria-pressed="${i === 0}">${l}<b>${c}</b></button>`).join("")}</div>` : ""}
  <span class="count"><b data-shown>${total}</b> / ${total} ${unit}</span></div>`;
  // cols: [{ label, cls, sort: "ascending"|"descending", sortable: false }]
  const th = ({ label = "", cls = "", sort, sortable = true }, i) => (label && sortable
    ? `<th scope="col" class="${cls}"${sort ? ` aria-sort="${sort}"` : ""}><button type="button" data-sort="${i}">${label}<i class="arrow"></i></button></th>`
    : `<th scope="col" class="${cls}">${label}</th>`);
  const td = (cls, v, content) => `<td class="${cls}" data-v="${v ?? ""}">${content}</td>`;
  const hbar = (v, max, ghost) => td("c-bar", v, hbarSpan((v / max) * 100, ghost));
  const tr = ({ tags = "", q = "", k, cls = "" }, cells) => `<tr data-tags="${tags}" data-q="${F.esc(q)}"${k != null ? ` data-k="${k}"` : ""}${cls ? ` class="${cls}"` : ""}>${cells}</tr>`;
  const table = (id, cols, rows) => `<div class="tscroll"><table data-testid="${id}"><thead><tr>${cols.map(th).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>
  <p class="empty" data-empty hidden>条件に合う行はありません。</p></div>`;
  const sub = (text) => `<span class="sub">${text}</span>`;
  const dash = sub("—");

  return { change, mark, cap, meter, hbarSpan, card, group, tabs, panel, detail, head, note, filters, th, td, hbar, tr, table, sub, dash };
})();
