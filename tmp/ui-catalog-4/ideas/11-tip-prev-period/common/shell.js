"use strict";
// 全画面に共通の枠: 見出し帯（ナビ・時点・右端のエクスポート）と足もと。<body data-page="…"> で今の画面を示す
window.Shell = (() => {
  const NAV = [["index", "index.html", "概況"], ["policy", "policy.html", "設定の適用状況"], ["effect", "effect.html", "設定の効果"], ["assets", "assets.html", "スキル・コマンドの利用"]];
  const KEEPS_PERIOD = ["index", "assets"];
  const FOOT = "端末から送られた値です。コストとトークンは全社の利用明細（CSV）の値を正とします。";

  function header(page, asOf, period) {
    const q = period ? `?period=${period}` : "";
    const link = ([id, href, label]) => `<a href="${href}${KEEPS_PERIOD.includes(id) ? q : ""}"${id === page ? ' aria-current="page"' : ""}>${label}</a>`;
    return `<div class="wrap bar">
  <a class="brand" href="index.html${q}">Claude Code 利用状況</a>
  <nav aria-label="画面">${NAV.map(link).join("")}</nav>
  <span class="bar-end"><span class="asof">${asOf} 時点</span><a href="export.html"${page === "export" ? ' aria-current="page"' : ""}>エクスポート</a></span>
</div>`;
  }

  // 期間の選択を持ち回る（7 日のときは URL に付けない）
  function mount(period) {
    const page = document.body.dataset.page;
    const top = document.querySelector("header.top"), foot = document.querySelector("footer.foot");
    if (top) top.innerHTML = header(page, window.DATA.meta.today, period && period !== "7" ? period : "");
    if (foot) foot.textContent = FOOT;
  }

  return { mount };
})();
