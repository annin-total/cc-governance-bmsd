"use strict";
// 部品の見本。キットのカード・グラフ・表の種類を 1 回ずつ使う（案ではない。定義の書き方の手本と、キットの動作確認に使う）。
(() => {
  const { L } = window.KIT;
  const SAME = "same";
  const PEOPLE_COLS = [
    { key: "rank", kind: "rank", label: "順位" }, { key: "email", kind: "user", label: "利用者" },
    { key: "cost", kind: "usd_strong", label: "コスト" }, { key: "cost", kind: "bar", label: "", sort: null },
    { key: "share", kind: "pct", label: "割合" }, { key: "cum_share", kind: "pct", label: "累積" },
    { key: "top_model", kind: "model", label: "主なモデル" }, { key: "tokens", kind: "tok", label: "トークン" },
    { key: "days", kind: "num", unit: "day", label: "利用明細の日数" },
  ];

  const cost = {
    id: "cost", title: "コスト", lead: "部品の見本: 値・比較・帯・順位・分布・モデル", periods: true,
    groups: [
      { id: "total", label: "合計", scope: "利用明細 {x[cost][start]:md}〜{x[cost][end]:md}",
        longScope: "直近 {period[months]} か月 · 月ごと",
        cards: [
          { label: "コスト", tab: "people", value: "{x[cost][total]:usd}", delta: "{x[cost][change]:signed_pct}", sub: "前の期間 {x[cost][prev]:usd}",
            viz: { kind: "bars", src: "x[daily]", field: "cost", fmt: "usd" }, cap: ["日ごと · 濃い棒が直近"],
            long: { label: "コスト", tab: "people", value: "{x[cost][total]:usd}", sub: "月平均 {cost[monthly]:usd}",
              viz: { kind: "bars", src: "x[months]", field: "cost", fmt: "usd", tipLabel: "{day:ym}" }, cap: ["月ごと"] } },
          { label: "1 人あたりコスト", tab: "people", value: "{x[cost][per_user]:usd}", delta: "{x[cost][per_user_change]:signed_pct}",
            sub: "利用明細の {x[cost][users]:num} 人で割る", viz: { kind: "pair", src: "x[cost]", terms: { per_user_prev: "前", per_user: "今" } }, long: SAME },
          { label: "上位 10% の占める割合", unit: "%", tab: "people", value: "{x[cost][top10_share]:dec1}", sub: "上位 {x[cost][top10_n]:num} 人",
            viz: { kind: "meter", src: "x[cost][top10_share]", den: 100, tone: "warn" }, long: SAME },
          { label: "コストの多い利用者", tab: "people", wide: true, sub: "上位 5 人",
            viz: { kind: "rates", src: "x[people]", field: "cost", den: "max", label: "{email}", limit: 5, right: ["{cost:usd}", "{share:pct}"] }, long: SAME },
          { label: "モデルごとのコスト", tab: "models", sub: "割合",
            viz: { kind: "stack", src: "x[models]", field: "cost", tone: "accent", terms: L.MODEL }, long: SAME },
          { label: "1 人あたりコストの分布", tab: "dist", wide: true, sub: "利用者の数（縦は割合）",
            viz: { kind: "hist", src: "x[cost_dist]", sides: ["now"] }, long: SAME },
          { label: "セッションの長さ（中央）", unit: "分", tab: "span", value: "{m[session_span_median_min]:dec1}", sub: "記録から" },
        ] },
    ],
    tabs: [
      { id: "people", label: "利用者ごと", hint: "{x[cost][users]:num} 人", title: "利用者ごとのコスト", unit: "人", scope: "コストの多い順",
        search: "利用者で絞り込み", q: "{email}", rows: "x[people]", sort: ["cost", "desc"], cols: PEOPLE_COLS,
        chipsBy: "top_model", chipTerms: L.MODEL, long: SAME },
      { id: "models", label: "モデル", hint: "{x[models]:count} 種類", title: "モデルごとのコストとトークン", unit: "行", scope: "利用明細",
        rows: "x[models]", sort: ["cost", "desc"],
        cols: [{ key: "key", kind: "model", label: "モデル" }, { key: "cost", kind: "usd_strong", label: "コスト" }, { key: "share", kind: "pct", label: "割合" },
          { key: "share", kind: "bar", label: "", sort: null, den: "100" }, { key: "tokens", kind: "tok", label: "トークン" },
          { key: "per_mtok", kind: "usd", label: "100 万トークンあたり" }, { key: "users", kind: "num", unit: "person", label: "利用者" }], long: SAME },
      { id: "daily", label: "日ごと", hint: "直近 {period[span]} 日", title: "日ごとのコストと利用者", unit: "日", scope: "濃い色が直近 {period[days]} 日",
        rows: "x[daily]", sort: ["day", "desc"],
        cols: [{ key: "day", kind: "date", label: "日付" }, { key: "cost", kind: "usd", label: "コスト" }, { key: "cost_users", kind: "num", unit: "person", label: "利用明細の利用者" },
          { key: "prompts", kind: "num", label: "指示" }],
        chart: { kind: "bars", key: "day", panels: [{ title: "コスト", field: "cost" }, { title: "指示", field: "prompts" }] },
        long: { id: "months", label: "月ごと", hint: "{x[months]:count} か月", title: "月ごとのコストと利用者", unit: "月", scope: "暦月",
          rows: "x[months]", sort: ["day", "desc"],
          cols: [{ key: "day", kind: "ym", label: "月" }, { key: "cost", kind: "usd_strong", label: "コスト" }, { key: "users", kind: "num", unit: "person", label: "利用者" },
            { key: "per_user", kind: "usd", label: "1 人あたり" }, { key: "new_users", kind: "num", unit: "person", label: "使い始めた人" }],
          chart: { kind: "stacked", key: "day", tick: "{day:ym}", fields: [{ field: "cost", label: "コスト" }], fmt: "usd" } } },
      { id: "hours", label: "時間帯", hint: "指示の数", title: "時間帯ごとの指示", unit: "時", scope: "JST",
        rows: "x[hours]", cols: [{ key: "key", kind: "num", label: "時" }, { key: "prompts", kind: "num", label: "指示" }, { key: "share", kind: "pct", label: "割合" }],
        chart: { kind: "bars", key: "key", dayKeys: false, tick: "{key} 時", panels: [{ title: "指示", field: "prompts" }] } },
      { id: "dist", label: "分布", hint: "1 人あたりコスト", title: "1 人あたりコストの分布", unit: "区間", scope: "利用明細",
        rows: "x[cost_dist]", cols: [{ key: "label", kind: "text", label: "区間" }, { key: "count", kind: "num", unit: "person", label: "人数" }, { key: "now_share", kind: "pct", label: "割合" }],
        chart: { kind: "hist", key: "bin", sides: ["now"], tick: "{label}" }, long: SAME },
      { id: "span", label: "セッションの長さ", hint: "分布", title: "セッションの長さ", unit: "区間", scope: "直近 {period[days]} 日",
        rows: "m[session_span_dist]", cols: [{ key: "label", kind: "text", label: "区間" }, { key: "count", kind: "num", label: "セッション" }, { key: "now_share", kind: "pct", label: "割合" }],
        chart: { kind: "hist", key: "bin", sides: ["now"], tick: "{label}" } },
    ],
  };

  window.IA = { id: "sample", name: "部品の見本", pages: [cost] };
})();
