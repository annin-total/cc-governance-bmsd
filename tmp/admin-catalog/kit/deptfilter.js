"use strict";
// 案 51 の部署の絞り込み（concepts5.md の 4.6。look.df が F1〜F3、look.org のとき）。行の data-dept・data-sec（tabs5.js）で絞る。
// 部の並びの末尾に「不明」。部を選ばなければ全員で、課はすべて押せる。部を選ぶと、選んだ部に入らない課は半透明で押せない。
// 課を選ばなければ選んだ部の課をすべて。部を選ばずに課を選ぶと、その課の部も選んだ扱いにする。
// 選んだ部・課は URL（dept=・sec=）に持ち、ページの中のリンクにも写してタブとページを移っても保つ。部署ごと（depts）の部の行は部全体の合算のまま出す。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const UNKNOWN = "unknown";
  const SEP = ",";
  const q = () => new URLSearchParams(location.search);
  const read = (k) => new Set((q().get(k) || "").split(SEP).filter(Boolean));
  const state = { dept: read("dept"), sec: read("sec") };
  const deptOfSec = (s) => s.split("|")[0];

  // 行を出すか: 部を選んでいなければ出す。部の行は部が選ばれていれば出す。課は、その部で選んだ課があればそれだけ
  function shown(tr) {
    const d = tr.dataset.dept, s = tr.dataset.sec;
    if (!state.dept.size) return true;
    if (!state.dept.has(d)) return false;
    if (tr.dataset.kind === "dept" || !s) return true;
    const picked = [...state.sec].filter((x) => deptOfSec(x) === d);
    return !picked.length || picked.includes(s);
  }

  function apply() {
    document.querySelectorAll("[data-panel]").forEach((p) => {
      p.querySelectorAll("tbody tr[data-dept]").forEach((tr) => tr.toggleAttribute("data-dept-out", !shown(tr)));
      p.dispatchEvent(new CustomEvent("kit:refilter"));
    });
    const next = q();
    [["dept", state.dept], ["sec", state.sec]].forEach(([k, v]) => (v.size ? next.set(k, [...v].join(SEP)) : next.delete(k)));
    history.replaceState(null, "", `?${next}${location.hash}`);
    document.querySelectorAll("a[href^='?']").forEach((a) => { // ページの中のリンク（ヘッダー・カード・期間のタブ）にも写す
      const u = new URLSearchParams(a.getAttribute("href").split("#")[0].slice(1)), hash = a.getAttribute("href").split("#")[1];
      ["dept", "sec"].forEach((k) => (next.get(k) ? u.set(k, next.get(k)) : u.delete(k)));
      a.setAttribute("href", `?${u}${hash ? `#${hash}` : ""}`);
    });
    document.querySelectorAll("[data-df]").forEach(paint);
  }

  const lists = () => K.dfParts.lists(state); // 中の部品の見た目（DS1〜DS6）は deptparts.js

  function buttonText() {
    const L = K.L, names = [...[...state.dept].map((x) => (x === UNKNOWN ? L.UNKNOWN : x)), ...[...state.sec].map((x) => x.split("|")[1] || L.DF_NO_SECTION)];
    if (!names.length) return L.DF_BUTTON.replace("{}", L.DF_ALL);
    return L.DF_BUTTON.replace("{}", names.length > 1 ? L.DF_MORE.replace("{}", names[0]).replace("{n}", names.length - 1) : names[0]);
  }

  // 型ごとの形: F1 は常に並べる、F2 はボタンと下に開くパネル、F3 は文字のリンクと、その場（絞り込みの行の下）に開く並び
  function paint(root) {
    const type = root.dataset.df, open = root.classList.contains("is-open");
    const L = K.L;
    if (type === "F1") root.innerHTML = lists();
    if (type === "F2") root.innerHTML = `<button type="button" class="df-button" data-df-toggle aria-expanded="${open}">${esc(buttonText())} ▾</button>${open ? `<div class="df-pop">${lists()}</div>` : ""}`;
    if (type === "F3") {
      root.innerHTML = `<button type="button" class="df-link" data-df-toggle aria-expanded="${open}">${esc(L.DF_LINK)} ${open ? "▾" : "▸"}</button>`;
      const filters = root.closest(".filters"), below = filters && filters.nextElementSibling;
      if (below && below.classList.contains("df-inline")) below.remove();
      if (open && filters) filters.insertAdjacentHTML("afterend", `<div class="df-inline" data-df-inline>${lists()}</div>`);
    }
  }

  function setup() {
    const type = K.look.get().df;
    if (!K.look.get().org || !type || type === "F0") return;
    document.querySelectorAll("[data-panel]").forEach((p) => {
      const filters = p.querySelector(".filters");
      if (!filters || !p.querySelector("tbody tr[data-dept]")) return;
      const count = filters.querySelector(".count");
      count.insertAdjacentHTML("beforebegin", `<div class="df df-${type}" data-df="${type}" role="group" aria-label="${esc(K.L.DF_NAV)}"></div>`);
    });
    apply();
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.dfDept !== undefined) {
      const d = t.dataset.dfDept;
      if (t.checked) state.dept.add(d); else { state.dept.delete(d); [...state.sec].filter((x) => deptOfSec(x) === d).forEach((x) => state.sec.delete(x)); }
    } else if (t.dataset.dfSec !== undefined) {
      if (t.checked) { state.sec.add(t.dataset.dfSec); state.dept.add(deptOfSec(t.dataset.dfSec)); } else state.sec.delete(t.dataset.dfSec);
    } else return;
    apply();
  });
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-df-toggle]");
    if (toggle) { const root = toggle.closest("[data-df]"); root.classList.toggle("is-open"); paint(root); return; }
    if (e.target.closest("[data-df-clear]")) { state.dept.clear(); state.sec.clear(); apply(); }
  });
  document.addEventListener("DOMContentLoaded", setup);
})();
