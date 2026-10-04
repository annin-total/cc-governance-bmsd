"use strict";
// 目録の窓と、コストと利用者のカード（concepts.md の 1.2・2.1）。カードの中身はここと catalog_cards2.js・catalog_over.js にだけ書き、案の ia.js は id で呼ぶ。
// win: 窓。tabs: 押したときに開くタブの候補（ページにある最初のタブ）。long: 12 か月の差し替え（"same" はそのまま。無ければ出さない）。
// state: 状態の場所。delta: 増減のチップ { v: 値の場所, fmt, unit }。better: "up"（増えたら改善）・"down"・""（中立）。
// span: 帯と期間の違うカードが添える期間（無ければ窓の span）。why: サマリーの下書きの括弧の中（判定に使った率や人数）。
(() => {
  const SAME = "same";
  const PREV = "前の {period[days]} 日";
  const RECENT = "直近 {period[days]} 日";

  // 窓。data はカードの値の根（無ければページの p.{period}）、fixed は期間に依らない窓（12 か月でも同じに出す）、
  // now は今日の時点の窓（概況では添える期間の前に「MM/DD 時点」を付ける）、span はカードに添える期間（homeSpan は概況でだけ添える）
  const W = {
    bill: {}, month: { fixed: true }, rec: {},
    rec7: { data: "fixed.now", fixed: true, now: true, homeSpan: "直近 7 日" },
    match7: { data: "fixed.now", fixed: true, span: "{S[match_start]:md}〜{S[csv_end]:md}" },
    p30: { data: "fixed.r3.policy", fixed: true, now: true, span: "直近 {POLICY_DAYS} 日 · 対象 {denominator:num} 人" },
    study: { data: "fixed.effect", fixed: true },
    now: { fixed: true, now: true },
  };

  const DAILY_CAP = "日ごと · 濃い棒が直近 {period[days]} 日";
  const MONTHS_BARS = (field, fmt) => ({ kind: "bars", src: "x[months]", field, fmt, tipLabel: "{day:ym}" });
  const C3 = (k) => `r3[cost][${k}]`;
  const NO_PREV = " · 前の期間と比べない";

  const K = {
    cost: { win: "bill", label: "コスト（利用明細）", tabs: ["cost_daily", "user_cost"], wide: true, better: "down", value: `{${C3("total")}:usd}`, state: C3("state"),
      value2: { label: "1 営業日あたり", value: `{${C3("per_bd")}:usd}` }, delta: { v: C3("per_bd_change") }, why: `1 営業日あたり {${C3("per_bd_change")}:signed_pct}`,
      sub: `1 営業日あたり 前 {${C3("prev_per_bd")}:usd} · 合計は前の {${C3("prev_total")}:usd} から {${C3("total_change")}:signed_pct} · 営業日 {${C3("prev_bd")}} → {${C3("bd")}} 日`,
      viz: { kind: "bars", src: "cost[days]", field: "total", fmt: "usd" }, cap: [DAILY_CAP],
      long: { label: "コスト（利用明細）", tabs: ["cost_weeks", "months"], wide: true, value: `{${C3("total")}:usd}`, value2: { label: "1 営業日あたり", value: `{${C3("per_bd")}:usd}` },
        sub: `営業日 {${C3("bd")}} 日` + NO_PREV, viz: MONTHS_BARS("cost", "usd"), cap: ["暦月ごと"] } },
    per_user_bd: { win: "bill", label: "1 人 1 営業日あたり", tabs: ["user_cost"], better: "down", value: `{${C3("per_user_bd")}:usd}`, state: C3("per_user_state"),
      delta: { v: C3("per_user_bd_change") }, why: `前との率 {${C3("per_user_bd_change")}:signed_pct}`,
      sub: `前 {${C3("prev_per_user_bd")}:usd} · {${C3("users")}:num} 人 · {${C3("bd")}} 営業日`,
      viz: { kind: "pair", src: "r3[cost]", terms: { prev_per_user_bd: PREV, per_user_bd: RECENT } },
      long: { label: "1 人 1 営業日あたり", tabs: ["user_cost"], value: `{${C3("per_user_bd")}:usd}`, sub: `{${C3("users")}:num} 人 · {${C3("bd")}} 営業日` + NO_PREV,
        viz: { kind: "bars", src: C3("months"), field: "per_user_bd", fmt: "usd", tipLabel: "{day:ym}" }, cap: ["暦月ごと"] } },
    model_mix: { win: "bill", label: "モデル別の内訳", unit: "%", tabs: ["models"], wide: true, better: "", value: "{x[models][0][share]:dec1}",
      delta: { v: "r3[model_pt]", fmt: "signed_pt" }, sub: "最も多いのは {x[models][0][key]:model} · 使った人 {x[models][0][users]:num} 人",
      viz: { kind: "rates", src: "x[models]", field: "share", label: "{key:model}", right: ["{cost:usd}", "{share:pct}"] }, cap: ["割合は期間のコストのうち"],
      long: { label: "モデル別の内訳", unit: "%", tabs: ["models"], wide: true, value: "{x[models][0][share]:dec1}", sub: "最も多いのは {x[models][0][key]:model} · 使った人 {x[models][0][users]:num} 人",
        viz: { kind: "rates", src: "x[models]", field: "share", label: "{key:model}", right: ["{cost:usd}", "{share:pct}"] }, cap: ["割合は期間のコストのうち"] } },
    cache_read_share: { win: "bill", label: "キャッシュ読み込みの割合", unit: "%", tabs: ["models"], value: "{x[tokens][cache_read_share]:dec1}", sub: "全 {x[tokens][total]:tok} トークンのうち",
      viz: { kind: "meter", src: "x[tokens][cache_read_share]", den: 100, tone: "ok" }, long: SAME },
    forecast: { win: "month", label: "月末のコスト見込み（{month[month]:mon} 月）", tabs: ["month"], better: "down", value: "{month[forecast]:usd}", state: "F[r3][forecast][state]",
      delta: { v: "F[r3][forecast][change]" }, why: "前月の実績との率 {F[r3][forecast][change]:signed_pct}",
      sub: "前月（{month[prev_month]:mon} 月）の実績 {month[prev_actual]:usd}", viz: { kind: "forecast", src: "month", stats: [] },
      cap: ["実績 {month[actual]:usd} · {month[elapsed]:num} / {month[business_days]:num} 営業日", "{month[as_of]:asof}"],
      empty: "month[as_of]", capEmpty: ["今月（{month[month]:mon} 月）の利用明細はまだありません"] },
    billed_users: { win: "bill", label: "利用者数", unit: "人", tabs: ["user_cost"], better: "up", value: `{${C3("users")}:num}`, state: C3("users_state"),
      delta: { v: C3("users_change") }, why: `前との率 {${C3("users_change")}:signed_pct}`,
      sub: `前 {${C3("prev_users")}:num} 人（{${C3("users_diff")}:signed} 人）· 利用明細にコストがあった人`, viz: { kind: "bars", src: C3("daily"), field: "users" }, cap: ["日ごとの人数 · 濃い棒が直近 {period[days]} 日"],
      long: { label: "利用者数", unit: "人", tabs: ["months", "user_cost"], value: `{${C3("users")}:num}`, sub: "期間にコストがあった人", viz: MONTHS_BARS("users"), cap: ["暦月ごとの人数"] } },
    retention: { win: "bill", label: "継続率", unit: "%", tabs: ["user_cost"], value: "{m[retention_rate]:dec1}", sub: "前の {period[days]} 日からの離脱 {m[left_users]:count} 人",
      viz: { kind: "meter", src: "m[retention_rate]", den: 100, tone: "ok" }, cap: ["前の期間の利用者のうち、今も使った割合"],
      long: { label: "継続率", unit: "%", tabs: ["months", "user_cost"], value: "{m[retention_rate]:dec1}", sub: "{m[retention_month]:ym} · 前の月からの離脱 {m[left_users]:count} 人",
        viz: { kind: "bars", src: "m[retention_rows]", field: "rate", fmt: "dec1", tipLabel: "{day:ym}" }, cap: ["暦月ごと · 前の月の利用者のうち、その月も使った割合"] } },

    // ---- コストのカードの型 C32（合計と 1 営業日あたりを別のカードに。look.cost）----
    cost_total: { win: "bill", label: "コスト（利用明細）", tabs: ["cost_daily", "user_cost"], better: "down", value: `{${C3("total")}:usd}`,
      delta: { v: C3("total_change") }, sub: `前 {${C3("prev_total")}:usd} · 営業日 {${C3("prev_bd")}} → {${C3("bd")}} 日`,
      viz: { kind: "bars", src: "cost[days]", field: "total", fmt: "usd" }, cap: [DAILY_CAP],
      long: { label: "コスト（利用明細）", tabs: ["cost_weeks", "months"], value: `{${C3("total")}:usd}`, sub: "月平均 {cost[monthly]:usd}" + NO_PREV, viz: MONTHS_BARS("cost", "usd"), cap: ["暦月ごと"] } },
    per_bd: { win: "bill", label: "1 営業日あたりのコスト", tabs: ["cost_daily"], better: "down", value: `{${C3("per_bd")}:usd}`, state: C3("state"),
      delta: { v: C3("per_bd_change") }, why: `前との率 {${C3("per_bd_change")}:signed_pct}`,
      sub: `前 {${C3("prev_per_bd")}:usd} · {${C3("prev_bd")}} → {${C3("bd")}} 営業日`, viz: { kind: "pair", src: "r3[cost]", terms: { prev_per_bd: PREV, per_bd: RECENT } },
      long: { label: "1 営業日あたりのコスト", tabs: ["cost_weeks"], value: `{${C3("per_bd")}:usd}`, sub: `営業日 {${C3("bd")}} 日` + NO_PREV,
        viz: { kind: "bars", src: C3("months"), field: "per_bd", fmt: "usd", tipLabel: "{day:ym}" }, cap: ["暦月ごと"] } },
  };

  window.CATALOG = Object.assign(window.CATALOG || {}, { K, W, SAME });
})();
