"use strict";
// 書式・DOM の組み立て・期間の状態・ツールチップ・タブと絞り込みと並べ替え。値は textContent と属性だけで入れる
const L = (() => {
  const D = window.DATA;
  const DAY = 86400000;
  const WEEK = "日月火水木金土";
  const PROVIDERS = { "aws-bedrock": "AWS Bedrock", "google-vertex": "Google Vertex AI" };
  const PERIODS = [["7", "7 日"], ["28", "28 日"], ["12m", "12 か月"]];

  const utc = (ep) => new Date(ep * DAY);
  const iso = (ep) => utc(ep).toISOString().slice(0, 10);
  const epoch = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / DAY);
  const md = (ep) => iso(ep).slice(5).replace("-", "/");
  const wd = (ep) => `（${WEEK[utc(ep).getUTCDay()]}）`;
  const int = (n) => Math.round(n).toLocaleString("ja-JP");
  const usd = (n, whole = n >= 1000) => `$${whole ? int(n) : n.toFixed(2)}`;
  const signed = (n, f = int) => (n > 0 ? `+${f(n)}` : n < 0 ? `−${f(-n)}` : "±0");
  const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

  function _fill(el, attrs, kids) {
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const h = (tag, attrs, ...kids) => _fill(document.createElement(tag), attrs, kids);
  const s = (tag, attrs, ...kids) => _fill(document.createElementNS("http://www.w3.org/2000/svg", tag), attrs, kids);

  function period() {
    const p = new URLSearchParams(location.search).get("p");
    return PERIODS.some(([id]) => id === p) ? p : "7";
  }

  function _keepPeriod(p) {
    for (const a of document.querySelectorAll("[data-keep-period]")) a.search = `?p=${p}`;
  }

  // 見出しの右の分段。押すと URL の ?p= を書き換えて描き直す
  function switcher(mount, onChange) {
    const bar = h("div", { class: "chipbar", role: "group", "aria-label": "期間" });
    const paint = (p) => {
      for (const b of bar.children) b.setAttribute("aria-pressed", String(b.dataset.period === p));
      _keepPeriod(p);
    };
    for (const [id, label] of PERIODS) bar.append(h("button", { type: "button", "data-period": id }, label));
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-period]");
      if (!b) return;
      history.replaceState(null, "", `?p=${b.dataset.period}${location.hash}`);
      paint(b.dataset.period);
      onChange(b.dataset.period);
    });
    mount.replaceChildren(bar);
    paint(period());
  }

  function _tooltip() {
    const tip = h("div", { class: "tip", "aria-hidden": "true", hidden: true });
    document.body.append(tip);
    let hot = [];
    const clear = () => { hot.forEach((el) => el.classList.remove("is-hot")); hot = []; };
    document.addEventListener("mousemove", (e) => {
      const t = e.target.closest ? e.target.closest("[data-tip]") : null;
      clear();
      if (!t) { tip.hidden = true; return; }
      tip.replaceChildren(h("b", {}, t.dataset.tipHead), " ", t.dataset.tip);
      tip.hidden = false;
      const svg = t.closest("svg");
      if (t.dataset.i && svg) hot = [...svg.querySelectorAll(`[data-i="${t.dataset.i}"]:not([data-tip])`)];
      hot.forEach((el) => el.classList.add("is-hot"));
      const pad = 12;
      const x = Math.min(e.clientX + pad, innerWidth - tip.offsetWidth - pad);
      const y = e.clientY - tip.offsetHeight - pad;
      tip.style.left = `${x}px`;
      tip.style.top = `${y < pad ? e.clientY + pad * 2 : y}px`;
    });
  }

  // 静的な図の <title>（「2026-09-28 AWS Bedrock $213.86」）を浮いた札の値に移す
  function adoptTitles(root) {
    for (const t of root.querySelectorAll("svg title")) {
      const [date, ...rest] = t.textContent.split(" ");
      const ep = epoch(date);
      const el = t.parentNode;
      el.dataset.tipHead = `${md(ep)}${wd(ep)}`;
      el.dataset.tip = rest.join(" ");
      t.remove();
    }
  }

  function _filter(panel) {
    const chip = panel.dataset.chip || "all";
    const input = panel.querySelector("[data-search]");
    const q = input ? input.value.trim().toLowerCase() : "";
    let shown = 0;
    for (const tr of panel.querySelectorAll("tbody tr")) {
      const hit = (chip === "all" || (tr.dataset.tags || "").split(" ").includes(chip))
        && (!q || (tr.dataset.q || "").toLowerCase().includes(q));
      tr.hidden = !hit;
      if (hit) shown += 1;
    }
    const counter = panel.querySelector("[data-shown]");
    if (counter) counter.textContent = int(shown);
    const empty = panel.querySelector("[data-empty]");
    if (empty) empty.hidden = shown > 0;
    for (const b of panel.querySelectorAll("[data-chip]")) b.setAttribute("aria-pressed", String(b.dataset.chip === chip));
  }

  function _sort(button) {
    const th = button.closest("th");
    const index = Number(button.dataset.sort);
    const dir = th.getAttribute("aria-sort") === "descending" ? 1 : -1;
    for (const other of th.parentNode.children) other.removeAttribute("aria-sort");
    th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
    const tbody = th.closest("table").querySelector("tbody");
    const val = (tr) => tr.children[index].dataset.v || "";
    const cmp = (a, b) => {
      const x = a === "" ? -Infinity : Number(a);
      const y = b === "" ? -Infinity : Number(b);
      return Number.isNaN(x) || Number.isNaN(y) ? a.localeCompare(b, "ja") : x - y;
    };
    [...tbody.children].sort((a, b) => cmp(val(a), val(b)) * dir).forEach((tr) => tbody.append(tr));
  }

  const _usable = (t) => t.getAttribute("aria-disabled") !== "true";

  function openTab(section, id, fromCard) {
    const tabs = [...section.querySelectorAll("[data-tab]")];
    const first = tabs.find(_usable) || tabs[0];
    const target = (tabs.find((t) => t.dataset.tab === id && _usable(t)) || first).dataset.tab;
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.tab === target));
    for (const p of section.querySelectorAll("[data-panel]")) {
      p.hidden = p.dataset.panel !== target;
      if (!p.hidden) _filter(p);
    }
    for (const c of document.querySelectorAll("[data-open]")) c.classList.toggle("is-open", Boolean(fromCard) && c.dataset.open === target);
  }

  function _bind() {
    document.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-tab]");
      const card = e.target.closest("[data-open]");
      const chip = e.target.closest("[data-chip]");
      const sorter = e.target.closest("[data-sort]");
      if (tab) {
        e.preventDefault();
        if (!_usable(tab)) return;
        history.replaceState(null, "", `${location.search}#${tab.dataset.tab}`);
        openTab(tab.closest("[data-tabs]"), tab.dataset.tab, false);
      } else if (card) {
        e.preventDefault();
        const section = document.querySelector("[data-tabs]");
        history.replaceState(null, "", `${location.search}#${card.dataset.open}`);
        openTab(section, card.dataset.open, true);
        section.scrollIntoView({ block: "start" });
      } else if (chip) {
        const panel = chip.closest("[data-panel]");
        panel.dataset.chip = chip.dataset.chip;
        _filter(panel);
      } else if (sorter) _sort(sorter);
    });
    document.addEventListener("input", (e) => {
      if (e.target.matches("[data-search]")) _filter(e.target.closest("[data-panel]"));
    });
  }

  document.documentElement.classList.add("js");
  document.addEventListener("DOMContentLoaded", () => { _tooltip(); _bind(); });

  return { D, PROVIDERS, iso, epoch, md, wd, int, usd, signed, mb, h, s, period, switcher, adoptTitles, openTab };
})();
