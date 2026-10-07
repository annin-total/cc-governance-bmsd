"use strict";
// 案 51 の部署の絞り込みの部品の続き（look.dfs。DS7〜DS9）。チェックボックスと押せない課の決まりは deptparts.js の deptBox・secBox をそのまま使う。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const P = K.dfParts;
  const opened = new Set(); // DS7・DS9 で開いているプルダウン（描き直しても開いたままにする）

  const dd = (key, summary, body) => `<details class="df-dd" data-df-dd="${key}"${opened.has(key) ? " open" : ""}><summary>${esc(summary)} ▾</summary><div class="df-dd-list">${body}</div></details>`;
  const named = (state, kind) => {
    const L = K.L, ids = [...state[kind]];
    const name = (x) => (kind === "dept" ? (x === P.UNKNOWN ? L.UNKNOWN : x) : x.split("|")[1] || L.DF_NO_SECTION);
    return !ids.length ? L.DF_ALL : ids.length > 1 ? L.DF_MORE.replace("{}", name(ids[0])).replace("{n}", ids.length - 1) : name(ids[0]);
  };

  // DS7: 部→課の 2 段のプルダウン
  function pulldown(state) {
    const L = K.L;
    const depts = [...Object.keys(P.units()), P.UNKNOWN].map((x) => P.deptBox(state, x)).join("");
    const secs = Object.entries(P.units()).map(([d, ss]) => `<span class="df-dd-group"><b>${esc(d)}</b>${ss.map((x) => P.secBox(state, d, x)).join("")}</span>`).join("");
    return `<div class="df-dds">${dd("dept", `${L.DEPT}: ${named(state, "dept")}`, depts)}${dd("sec", `${L.SECTION}: ${named(state, "sec")}`, secs)}</div>`;
  }

  // DS8: 部の色の帯（幅＝期間の利用者数）。部の段の下に課の段。押して絞る
  function band(state) {
    const rows = window.DATA.p[K.period].r5.depts, users = (pick) => Math.max(1, (rows.find(pick) || {}).users || 0);
    const seg = (d) => {
      const secs = d === P.UNKNOWN ? "" : P.units()[d].map((x) => `<span class="df-seg" style="flex: ${users((r) => r.kind === "section" && r.dept === d && (r.section || "") === x)} 1 0">${P.secBox(state, d, x, x ? x.split(" ").pop() : K.L.NO_SECTION)}</span>`).join(""); // 帯は狭いので課の名前の末尾だけ
      const flex = users((r) => (d === P.UNKNOWN ? r.kind === "unknown" : r.kind === "dept" && r.dept === d));
      return `<span class="df-seg-dept" style="flex: ${flex} 1 0"><span class="df-seg">${P.deptBox(state, d)}</span><span class="df-segs">${secs}</span></span>`;
    };
    return `<div class="df-band">${[...Object.keys(P.units()), P.UNKNOWN].map(seg).join("")}</div>`;
  }

  // DS9: 選んだ条件をタグで並べて × で外す。「＋」で部・課の並びを開いて足す
  function tags(state) {
    return `<div class="df-tags df-tags9">${P.tagsOf(state) || `<span class="df-none">${esc(K.L.DF_ALL)}</span>`}${dd("add", K.L.DF_ADD, P.columns(state))}</div>`;
  }

  document.addEventListener("toggle", (e) => {
    const d = e.target.closest && e.target.closest("[data-df-dd]");
    if (!d || d !== e.target) return;
    if (d.open) opened.add(d.dataset.dfDd); else opened.delete(d.dataset.dfDd);
  }, true);

  P.more = { DS7: pulldown, DS8: band, DS9: tags };
})();
