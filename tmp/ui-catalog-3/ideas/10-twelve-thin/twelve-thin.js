"use strict";
// 12 か月でも群とカードとタブの位置を変えない。記録から数えるものは空の札と押せないタブにする
const TWELVE = (() => {
  const { h } = L;
  const OFF = "12 か月では出しません";
  const scope = () => `直近 12 か月（${O.range12()}）· 週ごと · 前の期間と比べない`;

  function _offTabs(detail, keep) {
    for (const t of detail.querySelectorAll("[data-tab]")) {
      if (t.dataset.tab === keep) continue;
      t.setAttribute("aria-disabled", "true");
      t.querySelector("span").textContent = OFF;
    }
  }

  function overview(top, detail) {
    top.replaceChildren(
      P.group("利用", scope(), [O.users12Card(true), P.offCard("1 日あたりのセッション"), O.cost12Card(true), O.forecastCard(), P.offCard("確認なしモードの記録")]),
      P.group("データの届き具合", "記録から数える項目なので、12 か月では出しません",
        ["受信した記録", "CSV との照合率", "プラグインのエラー", "項目の欠け（最大）"].map((k) => P.offCard(k))));
    _offTabs(detail, "cost");
  }

  function assets(top, detail) {
    top.replaceChildren(
      P.group("呼び出し", "記録から数える項目なので、12 か月では出しません", [P.offCard("スキルの呼び出し", true), P.offCard("コマンドの呼び出し", true)]),
      P.group("サブエージェント", "記録から数える項目なので、12 か月では出しません", [P.offCard("サブエージェントの中の記録")]));
    _offTabs(detail, null);
    for (const t of detail.querySelectorAll("[data-tab]")) t.setAttribute("aria-selected", "false");
    for (const p of detail.querySelectorAll("[data-panel]")) p.hidden = true;
    detail.append(h("div", { class: "panel", "data-off": true }, h("p", { class: "empty" }, "スキル・コマンド・サブエージェントは記録から数えるので、12 か月では出しません。7 日・28 日に切り替えると見られます。")));
  }

  return { overview, assets };
})();
