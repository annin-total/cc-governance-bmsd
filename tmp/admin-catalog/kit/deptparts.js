"use strict";
// 案 51 の部署の絞り込みの中の部品（look.dfs。DS1〜DS6）。置き方（F1〜F3）と挙動は deptfilter.js。
// どの型もチェックボックス（data-df-dept・data-df-sec）を持ち、押せない課（選んだ部に入らない課）の決まりは box の 1 か所で決める。
// 部の色は部の並びの順（--dc-0・--dc-1。課はその色を薄く）、不明は灰。
(() => {
  const K = window.KIT;
  const { esc } = K;
  const UNKNOWN = "unknown";
  const opened = new Set(); // DS4 で開いている部

  const units = () => window.DATA.fixed.org.units;
  const colorOf = (dept) => { const i = Object.keys(units()).indexOf(dept); return i < 0 ? "var(--muted)" : `var(--dc-${i})`; };
  const off = (state, dept) => state.dept.size > 0 && !state.dept.has(dept); // 部を選ぶと、選んだ部に入らない課は押せない

  function box(kind, id, label, on, disabled, dept) {
    return `<label class="df-item df-${kind}${disabled ? " is-off" : ""}" style="--dc: ${colorOf(dept)}" title="${esc(label)}" data-df-name="${esc(label)}">`
      + `<input type="checkbox" data-df-${kind}="${esc(id)}"${on ? " checked" : ""}${disabled ? " disabled" : ""}><span class="df-text">${esc(label)}</span></label>`;
  }

  const deptBox = (state, x) => box("dept", x, x === UNKNOWN ? K.L.UNKNOWN : x, state.dept.has(x), false, x);
  const secBox = (state, dept, x) => box("sec", `${dept}|${x}`, x || K.L.DF_NO_SECTION, state.sec.has(`${dept}|${x}`), off(state, dept), dept);
  const clear = () => `<button type="button" class="df-clear" data-df-clear>${esc(K.L.DF_CLEAR)}</button>`;

  // DS1・DS2・DS3・DS6: 部の列と課の列（見た目は CSS の dfs-<型>）
  function columns(state) {
    const L = K.L;
    const d = [...Object.keys(units()), UNKNOWN].map((x) => deptBox(state, x)).join("");
    const s = Object.entries(units()).map(([dept, secs]) => `<span class="df-group">${secs.map((x) => secBox(state, dept, x)).join("")}</span>`).join("");
    return `<div class="df-col"><b>${esc(L.DEPT)}</b><div class="df-items">${d}</div></div><div class="df-col"><b>${esc(L.SECTION)}</b><div class="df-items">${s}</div></div>`;
  }

  // DS4: 木の形。部の行の ▸ で課を開く。部のチェックで課をまとめて切り替える（課を選ばない部は全課）
  function tree(state) {
    const rows = Object.entries(units()).map(([dept, secs]) => {
      const open = opened.has(dept);
      return `<div class="df-node"><button type="button" class="df-open" data-df-open="${esc(dept)}" aria-expanded="${open}">${open ? "▾" : "▸"}</button>${deptBox(state, dept)}`
        + `<div class="df-kids"${open ? "" : " hidden"}>${secs.map((x) => secBox(state, dept, x)).join("")}</div></div>`;
    });
    return `<div class="df-tree">${rows.join("")}<div class="df-node"><span class="df-open"></span>${deptBox(state, UNKNOWN)}</div></div>`;
  }

  // DS5: 検索つきの複数選択。選んだものを上にタグで並べ、× で外す。入力で候補を絞る
  function search(state) {
    const L = K.L, names = [...[...state.dept].map((x) => [`dept`, x, x === UNKNOWN ? L.UNKNOWN : x]), ...[...state.sec].map((x) => ["sec", x, x.split("|")[1] || L.DF_NO_SECTION])];
    const tags = names.map(([kind, id, label]) => `<span class="df-tag" style="--dc: ${colorOf(id.split("|")[0])}">${esc(label)}<button type="button" data-df-remove="${kind}" data-df-id="${esc(id)}" aria-label="${esc(label)}">×</button></span>`).join("");
    return `<div class="df-tags">${tags}<input type="search" class="df-q" placeholder="${esc(L.DF_SEARCH)}" data-df-q></div><div class="df-cands">${columns(state)}</div>`;
  }

  function lists(state) {
    const type = K.look.get().dfs;
    const body = type === "DS4" ? tree(state) : type === "DS5" ? search(state) : columns(state);
    return `<div class="df-lists dfs-${type}">${body}${clear()}</div>`;
  }

  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-df-open]");
    if (open && open.dataset.dfOpen) {
      const d = open.dataset.dfOpen;
      if (opened.has(d)) opened.delete(d); else opened.add(d);
      const kids = open.parentElement.querySelector(".df-kids");
      kids.hidden = !opened.has(d);
      open.setAttribute("aria-expanded", String(opened.has(d)));
      open.textContent = opened.has(d) ? "▾" : "▸";
    }
    const rm = e.target.closest("[data-df-remove]");
    if (rm) { const b = rm.closest(".df-lists").querySelector(`[data-df-${rm.dataset.dfRemove}="${CSS.escape(rm.dataset.dfId)}"]`); if (b) b.click(); }
  });
  document.addEventListener("input", (e) => {
    if (!e.target.matches("[data-df-q]")) return;
    const q = e.target.value.trim().toLowerCase();
    e.target.closest(".df-lists").querySelectorAll(".df-item").forEach((l) => { l.hidden = Boolean(q) && !l.dataset.dfName.toLowerCase().includes(q); });
  });

  K.dfParts = { lists };
})();
