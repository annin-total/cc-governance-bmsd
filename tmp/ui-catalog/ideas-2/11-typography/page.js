"use strict";
// 画面の組み立て: 上段の要点カード（群ごと）と、下段のタブ＋一覧。URL の # で開くタブと区分を保持する
window.UI.page = ({ groups, cards, tabs }) => {
  const { $, card } = window.UI;
  $("asof").textContent = `${window.CTX.meta.today_label} 時点`;
  mountVariant();

  $("cards").innerHTML = groups.map((g) => `
    <section class="group" aria-label="${g.label}">
      <h2 class="glabel">${g.label}<span>${g.scope}</span></h2>
      <div class="cards">${cards.filter((c) => c.group === g.id).map(card).join("")}</div>
    </section>`).join("");

  $("tabs").innerHTML = tabs.map((t) =>
    `<button type="button" role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-controls="panel"><b>${t.label}</b><span>${t.hint}</span></button>`).join("");

  function open(id, chip, fromCard) {
    const t = tabs.find((x) => x.id === id) || tabs[0];
    document.querySelectorAll("#tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t.id)));
    document.querySelectorAll("#cards .card").forEach((c) => c.classList.toggle("is-open", fromCard && c.dataset.tab === t.id));
    const p = $("panel");
    p.setAttribute("aria-labelledby", `tab-${t.id}`);
    p.innerHTML = `<header class="p-head"><h2>${t.title}</h2><p class="scope">${t.scope}</p></header>
      ${t.chart ? `<div class="p-chart">${t.chart()}</div>` : ""}<div class="p-table"></div>${t.note ? `<p class="note">${t.note}</p>` : ""}`;
    window.UI.table(p.querySelector(".p-table"), t.table(), chip);
  }

  const fromHash = (fromCard) => { const [id, chip] = location.hash.slice(1).split(":"); open(id, chip, fromCard); };
  document.addEventListener("click", (e) => {
    if (e.target.closest("#panel [data-chip]")) document.querySelectorAll("#cards .card.is-open").forEach((c) => c.classList.remove("is-open"));
    const a = e.target.closest("#cards .card, #tabs [role=tab]");
    if (!a) return;
    e.preventDefault();
    const hash = a.matches(".card") ? a.getAttribute("href") : `#${a.dataset.tab}`;
    history.replaceState(null, "", hash);
    fromHash(a.matches(".card"));
    if (a.matches(".card")) $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  fromHash(location.hash.includes(":"));
};

// 表示の変奏（配色・文字組み）の切り替え。定義は variant.js の window.VARIANT。?v= で指定でき、画面をまたいで引き継ぐ
function mountVariant() {
  const V = window.VARIANT, host = document.getElementById("variant");
  if (!V || !host) return;
  const KEY = `variant:${V.attr}`;
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* 保存できない環境では URL だけで引き継ぐ */ } };
  const ids = V.options.map((o) => o[0]);
  const fromUrl = new URLSearchParams(location.search).get("v");
  let cur = ids.includes(fromUrl) ? fromUrl : ids.includes(read()) ? read() : ids[0];

  host.innerHTML = `<span class="v-label">${V.label}</span><div class="v-seg" role="group" aria-label="${V.label}">${V.options.map(([id, label, sw]) =>
    `<button type="button" data-v="${id}">${sw ? `<i class="sw" style="background:${sw}"></i>` : ""}${label}</button>`).join("")}</div>`;

  function apply(v) {
    cur = v;
    document.documentElement.setAttribute(V.attr, v);
    host.querySelectorAll("[data-v]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    document.querySelectorAll("nav a[href$='.html']").forEach((a) => { a.search = `?v=${v}`; });
    const url = new URL(location.href); url.searchParams.set("v", v); history.replaceState(null, "", url);
    write(v);
  }
  host.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) apply(b.dataset.v); });
  apply(cur);
}
