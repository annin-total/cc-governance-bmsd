(() => {
  const { list, groups, csvLast } = window.METRICS;
  const rail = document.getElementById("rail");
  const detail = document.getElementById("detail");
  const STATE_LABEL = { ok: "正常", warn: "注意", ng: "要確認", neutral: "状態の判定なし" };
  document.getElementById("csv-last").textContent = csvLast;
  document.getElementById("asof").textContent = `集計 ${window.CTX.meta.today_label}`;

  for (const [g, label] of Object.entries(groups)) {
    const items = list.filter((m) => m.group === g);
    rail.insertAdjacentHTML("beforeend", `<div class="grp">${label}<span>${items.length}</span></div>`);
    for (const m of items) {
      const b = document.createElement("button");
      b.className = "item";
      b.dataset.id = m.id;
      b.setAttribute("role", "option");
      b.innerHTML = `<span class="dot ${m.state}" title="${STATE_LABEL[m.state]}"></span><span class="nm">${m.name}</span><span class="v">${m.list}</span>`;
      b.addEventListener("click", () => select(m.id));
      rail.append(b);
    }
  }

  rail.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = list.findIndex((m) => m.id === current);
    const next = list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length];
    select(next.id);
    rail.querySelector(`[data-id="${next.id}"]`).focus();
  });

  let current = null;
  function select(id) {
    const m = list.find((x) => x.id === id) || list[0];
    current = m.id;
    history.replaceState(null, "", "#" + m.id);
    rail.querySelectorAll(".item").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === m.id)));
    render(m);
  }

  function render(m) {
    const d = m.detail();
    const h = d.hero;
    const stateTag = h.state ? `<span class="state ${h.state[0]}">${h.state[1]}</span>` : "";
    detail.innerHTML = `
      <div class="eyebrow">${groups[m.group]}</div>
      <h1>${m.name}</h1>
      <p class="q">${d.q}</p>
      <div class="scope">${d.scope.map(([k, v]) => `<span><b>${k}</b>${v}</span>`).join("")}</div>
      <div class="hero">
        <div class="big${h.word ? " word" : ""}">${h.big}<small>${h.unit || ""}</small></div>
        ${h.cmp ? `<div class="cmp">${h.cmp}<span class="d">${h.d || ""}</span></div>` : ""}
        ${h.frac ? `<div class="frac">${h.frac}</div>` : ""}
        ${stateTag}
      </div>`;
    for (const b of d.blocks) {
      const sec = document.createElement("section");
      sec.className = "block";
      sec.innerHTML = `<h2>${b.h}${b.sub ? `<span>${b.sub}</span>` : ""}</h2>` +
        (b.legend ? `<div class="legend">${b.legend.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>` : "");
      sec.append(b.node);
      detail.append(sec);
    }
    detail.insertAdjacentHTML("beforeend", `<div class="explain"><div class="k">説明</div>${d.explain.map((p) => `<p>${p}</p>`).join("")}</div>`);
  }

  select(location.hash.slice(1) || list[0].id);
})();
