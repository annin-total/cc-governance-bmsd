"use strict";
// 目録の窓と、コストと利用者のカード（concepts.md の 1.2・2.2）。カードの中身はここと catalog_cards2.js にだけ書き、案の ia.js は id で呼ぶ。
// win: 群の窓。tabs: 押したときに開くタブの候補（ページにある最初のタブ）。long: 12 か月の差し替え（"same" はそのまま）。
// state: 状態の場所。delta: 増減のチップ { v: 値の場所, fmt, unit, prev: 前の値の雛形 }。better: "up"（増えたら改善）・"down"・""（中立）。
// why: サマリーの下書きの括弧の中（判定に使った率や人数）。
(() => {
  const SAME = "same";
  const PREV = "前の {period[days]} 日";
  const RECENT = "直近 {period[days]} 日";

  // 窓。data は群の値の根、fixed は期間に依らない窓（12 か月でも同じに出す）、base は同じ種類の窓（期間を固定した写し）
  const W = {
    bill: { name: "利用明細", scope: "利用明細 {r3[cost][start]:md}〜{r3[cost][end]:md} と前の {period[days]} 日 · 利用明細にコストがあった利用者",
      longScope: "利用明細 直近 {period[months]} か月（{r3[cost][start]:day}〜{r3[cost][end]:day}）· 週と暦月 · 前の期間と比べない" },
    month: { name: "今月", fixed: true, scope: "{month[month]:ym} · 利用明細の最終日（{month[as_of]:md}）まで · 前月の実績と比べる" },
    limit: { name: "目安", data: "fixed.r3.limit", fixed: true,
      scope: "利用明細の最終日（{end:md}）までの 7 日・28 日 · 前は 7 日前（{prev_end:md}）までの同じ判定 · 期間は選べません" },
    rec: { name: "記録", scope: "直近 {period[days]} 日（{period[start]:md}〜{period[end]:md}）と前の {period[days]} 日 · 記録を送った利用者", longScope: "記録" },
    rec7: { name: "受信", base: "rec", data: "p.7", fixed: true, scope: "直近 7 日（{period[start]:md}〜{period[end]:md}）と前の 7 日 · 記録を送った利用者 · 期間は選べません" },
    match7: { name: "照合", data: "p.7", fixed: true, scope: "利用明細の最終日までの 7 日 · 記録と利用明細の突き合わせ · 期間は選べません" },
    p30: { name: "設定の報告", data: "fixed.r3.policy", fixed: true,
      scope: "直近 {POLICY_DAYS} 日 · 利用者ごとに最新の報告（端末が複数なら最も遅れた値）· 対象は{basis:basis} {denominator:num} 人" },
    study: { name: "しきい値の前後", data: "fixed.effect", fixed: true, scope: "{REFERENCE_KEY:setting}を {REFERENCE_VALUE} にした前後 {EVENT_STUDY_SPAN} 日 · しきい値を守り始めた利用者 · 前後の境は各利用者が守り始めた日" },
    now: { name: "利用明細の鮮度", fixed: true, scope: "現時点 · 取り込んだ利用明細" },
  };

  const DAILY_CAP = "日ごと · 濃い棒が直近 {period[days]} 日";
  const MONTHS_BARS = (field, fmt) => ({ kind: "bars", src: "x[months]", field, fmt, tipLabel: "{day:ym}" });
  const C3 = (k) => `r3[cost][${k}]`;
  const NO_PREV = " · 前の期間と比べない";

  const K = {
    cost: { win: "bill", label: "コスト（利用明細）", tabs: ["cost_daily", "user_cost"], wide: true, better: "down", value: `{${C3("total")}:usd}`, state: C3("state"),
      delta: { v: C3("per_bd_change"), prev: `{${C3("prev_per_bd")}:usd}` }, why: `1 営業日あたり {${C3("per_bd_change")}:signed_pct}`,
      sub: `1 営業日あたり {${C3("per_bd")}:usd}（前 {${C3("prev_per_bd")}:usd}）· 合計は前の {${C3("prev_total")}:usd} から {${C3("total_change")}:signed_pct} · 営業日 {${C3("prev_bd")}} → {${C3("bd")}} 日`,
      viz: { kind: "bars", src: "cost[days]", field: "total", fmt: "usd" }, cap: [DAILY_CAP],
      long: { label: "コスト（利用明細）", tabs: ["cost_weeks", "months"], wide: true, value: `{${C3("total")}:usd}`,
        sub: `1 営業日あたり {${C3("per_bd")}:usd} · 営業日 {${C3("bd")}} 日` + NO_PREV, viz: MONTHS_BARS("cost", "usd"), cap: ["暦月ごと"] } },
    per_user_bd: { win: "bill", label: "1 人 1 営業日あたり", tabs: ["user_cost"], better: "down", value: `{${C3("per_user_bd")}:usd}`, state: C3("per_user_state"),
      delta: { v: C3("per_user_bd_change"), prev: `{${C3("prev_per_user_bd")}:usd}` }, why: `前との率 {${C3("per_user_bd_change")}:signed_pct}`,
      sub: `前 {${C3("prev_per_user_bd")}:usd} · {${C3("users")}:num} 人 · {${C3("bd")}} 営業日`,
      viz: { kind: "pair", src: "r3[cost]", terms: { prev_per_user_bd: PREV, per_user_bd: RECENT } },
      long: { label: "1 人 1 営業日あたり", tabs: ["user_cost"], value: `{${C3("per_user_bd")}:usd}`, sub: `{${C3("users")}:num} 人 · {${C3("bd")}} 営業日` + NO_PREV } },
    top_spenders: { win: "bill", label: "コストの多い利用者", tabs: ["user_cost"], wide: true, sub: "上位 10%（{x[cost][top10_n]:num} 人）が {x[cost][top10_share]:pct} · 割合は期間のコストのうち",
      viz: { kind: "rates", src: "x[billed]", field: "cost", den: "max", label: "{email}", limit: 5, mark: "state", right: ["{cost:usd}", "{share:pct}"] }, long: SAME },
    top_spenders_diff: { win: "bill", label: "コストの多い利用者", tabs: ["user_cost"], wide: true, sub: "上位 10%（{x[cost][top10_n]:num} 人）が {x[cost][top10_share]:pct} · 割合は期間のコストのうち",
      viz: { kind: "rates", src: "x[billed]", field: "cost", den: "max", label: "{email}", limit: 5, mark: "state", cls: "diffs", right: ["{cost_diff:signed_usd}", "{cost:usd}", "{share:pct}"] },
      cap: ["前との差 · コスト · 割合"],
      long: { label: "コストの多い利用者", tabs: ["user_cost"], wide: true, sub: "上位 10%（{x[cost][top10_n]:num} 人）が {x[cost][top10_share]:pct} · 割合は期間のコストのうち",
        viz: { kind: "rates", src: "x[billed]", field: "cost", den: "max", label: "{email}", limit: 5, mark: "state", right: ["{cost:usd}", "{share:pct}"] } } },
    model_mix: { win: "bill", label: "モデル別の内訳", unit: "%", tabs: ["models"], wide: true, better: "", value: "{x[models][0][share]:dec1}",
      delta: { v: "r3[model_pt]", fmt: "signed_pt" }, sub: "最も多いのは {x[models][0][key]:model} · 使った人 {x[models][0][users]:num} 人",
      viz: { kind: "rates", src: "x[models]", field: "share", label: "{key:model}", right: ["{cost:usd}", "{share:pct}"] }, cap: ["割合は期間のコストのうち"],
      long: { label: "モデル別の内訳", unit: "%", tabs: ["models"], wide: true, value: "{x[models][0][share]:dec1}", sub: "最も多いのは {x[models][0][key]:model} · 使った人 {x[models][0][users]:num} 人",
        viz: { kind: "rates", src: "x[models]", field: "share", label: "{key:model}", right: ["{cost:usd}", "{share:pct}"] }, cap: ["割合は期間のコストのうち"] } },
    cache_read_share: { win: "bill", label: "キャッシュ読み込みの割合", unit: "%", tabs: ["models"], value: "{x[tokens][cache_read_share]:dec1}", sub: "全 {x[tokens][total]:tok} トークンのうち",
      viz: { kind: "meter", src: "x[tokens][cache_read_share]", den: 100, tone: "ok" }, long: SAME },
    forecast: { win: "month", label: "月末のコスト見込み（{month[month]:mon} 月）", tabs: ["month"], better: "down", value: "{month[forecast]:usd}", state: "F[r3][forecast][state]",
      delta: { v: "F[r3][forecast][change]", prev: "{month[prev_actual]:usd}" }, why: "前月の実績との率 {F[r3][forecast][change]:signed_pct}",
      sub: "前月（{month[prev_month]:mon} 月）の実績 {month[prev_actual]:usd}", viz: { kind: "forecast", src: "month", stats: [] },
      cap: ["実績 {month[actual]:usd} · {month[elapsed]:num} / {month[business_days]:num} 営業日", "{month[as_of]:asof}"],
      empty: "month[as_of]", capEmpty: ["今月（{month[month]:mon} 月）の利用明細はまだありません"] },
    over_limit: { win: "limit", label: "コストが目安を超えた利用者", unit: "人", tabs: ["over_users"], wide: true, better: "down", value: "{users:num}", state: "state",
      delta: { v: "delta", fmt: "signed", unit: "人", prev: "{prev_users:num} 人" }, why: "要確認 {ng:num} 人・注意 {warn:num} 人",
      sub: "新たに該当 {new:num} 人 · 該当から外れた {left:num} 人", viz: { kind: "limit", src: "grid", rule: "${e} / ${h}" },
      cap: ["目安の金額は 注意 / 要確認（USD）· 1 日は 7 日のいずれかの日"] },
    billed_users: { win: "bill", label: "利用明細にいた利用者", unit: "人", tabs: ["user_cost"], better: "up", value: `{${C3("users")}:num}`, state: C3("users_state"),
      delta: { v: C3("users_change"), prev: `{${C3("prev_users")}:num} 人` }, why: `前との率 {${C3("users_change")}:signed_pct}`,
      sub: `前 {${C3("prev_users")}:num} 人（{${C3("users_diff")}:signed} 人）`, viz: { kind: "bars", src: C3("daily"), field: "users" }, cap: ["日ごとの人数 · 濃い棒が直近 {period[days]} 日"],
      long: { label: "利用明細にいた利用者", unit: "人", tabs: ["months", "user_cost"], value: `{${C3("users")}:num}`, sub: "期間にコストがあった人", viz: MONTHS_BARS("users"), cap: ["暦月ごとの人数"] } },
    new_users: { win: "bill", label: "使い始めた利用者", unit: "人", tabs: ["user_cost"], value: "{m[new_user_count]:num}", sub: "利用明細に初めてコストが出た人",
      long: { label: "使い始めた利用者", unit: "人", tabs: ["months", "user_cost"], value: "{m[new_user_count]:num}", sub: "利用明細に初めてコストが出た人", viz: MONTHS_BARS("new_users"), cap: ["暦月ごとの人数"] } },
    retention: { win: "bill", label: "継続率", unit: "%", tabs: ["user_cost"], value: "{m[retention_rate]:dec1}", sub: "前の {period[days]} 日から離れた {m[left_users]:count} 人",
      viz: { kind: "meter", src: "m[retention_rate]", den: 100, tone: "ok" }, cap: ["前の期間の利用者のうち、今も使った割合"],
      long: { label: "継続率", unit: "%", tabs: ["months", "user_cost"], value: "{m[retention_rate]:dec1}", sub: "{m[retention_month]:ym} · 前の月から離れた {m[left_users]:count} 人",
        viz: { kind: "bars", src: "m[retention_rows]", field: "rate", fmt: "dec1", tipLabel: "{day:ym}" }, cap: ["暦月ごと · 前の月の利用者のうち、その月も使った割合"] } },

    // ---- 案ごとの分け方（案 32: 合計と 1 営業日あたり、上位と集中度を別のカードに）----
    cost_total: { win: "bill", label: "コスト（利用明細）", tabs: ["cost_daily", "user_cost"], better: "down", value: `{${C3("total")}:usd}`,
      delta: { v: C3("total_change"), prev: `{${C3("prev_total")}:usd}` }, sub: `前 {${C3("prev_total")}:usd}`,
      viz: { kind: "bars", src: "cost[days]", field: "total", fmt: "usd" }, cap: [DAILY_CAP],
      long: { label: "コスト（利用明細）", tabs: ["cost_weeks", "months"], value: `{${C3("total")}:usd}`, sub: "月平均 {cost[monthly]:usd}" + NO_PREV, viz: MONTHS_BARS("cost", "usd"), cap: ["暦月ごと"] } },
    per_bd: { win: "bill", label: "1 営業日あたりのコスト", tabs: ["cost_daily"], better: "down", value: `{${C3("per_bd")}:usd}`, state: C3("state"),
      delta: { v: C3("per_bd_change"), prev: `{${C3("prev_per_bd")}:usd}` }, why: `前との率 {${C3("per_bd_change")}:signed_pct}`,
      sub: `前 {${C3("prev_per_bd")}:usd} · 営業日 {${C3("prev_bd")}} → {${C3("bd")}} 日`, viz: { kind: "pair", src: "r3[cost]", terms: { prev_per_bd: PREV, per_bd: RECENT } },
      long: { label: "1 営業日あたりのコスト", tabs: ["cost_weeks"], value: `{${C3("per_bd")}:usd}`, sub: `営業日 {${C3("bd")}} 日` + NO_PREV } },
    top10_share: { win: "bill", label: "上位 10% の占める割合", unit: "%", tabs: ["user_cost"], value: "{x[cost][top10_share]:dec1}", sub: "上位 {x[cost][top10_n]:num} 人 · 上位 5 人は {x[cost][top5_share]:pct}",
      viz: { kind: "meter", src: "x[cost][top10_share]", den: 100 }, long: SAME },
  };

  window.CATALOG = Object.assign(window.CATALOG || {}, { K, W, SAME });
})();
