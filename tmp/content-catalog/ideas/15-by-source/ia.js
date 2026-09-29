"use strict";
// 案 15: データの出所で分ける（concepts.md 5 節）。上半分は案 13〜15 で共通の部品の辞書、下半分が案の木。
(() => {
  // ---- 部品の辞書（concepts.md 3 節の id）。案の木はこの下で組む ----
  const { L } = window.KIT;
  const SAME = "same";
  const chipsOf = (terms) => Object.entries(terms).map(([id, v]) => (Array.isArray(v) ? { id, label: v[1], tone: v[0] } : { id, label: v }));
  const BAR = (key, den) => ({ key, kind: "bar", label: "", sort: null, den });
  const PERIOD_CHIPS = [{ id: "recent", label: L.RECENT }, { id: "prev", label: L.PREV }];
  const ALWAYS = " · 期間の切り替えと無関係";
  const NO_PREV_LONG = "12 か月では前の期間と比べないため出しません"; // キットの注記は「記録から数えるため」なので、利用明細のカードは自前で断る

  // 窓の表記（concepts.md 2.2）
  const S = {
    bill: { scope: "利用明細の最終日までの {period[days]} 日（{x[cost][start]:md}〜{x[cost][end]:md}）と前の {period[days]} 日 · 利用明細にコストがあった利用者",
      longScope: "直近 {period[months]} か月（{x[cost][start]:day}〜{x[cost][end]:day}）· 利用明細にコストがあった利用者 · 前の期間と比べない" },
    rec: { scope: "直近 {period[days]} 日（{period[start]:md}〜{period[end]:md}）と前の {period[days]} 日 · 記録を送った利用者" },
    rec7: { data: "p.7", scope: "直近 7 日（{period[start]:md}〜{period[end]:md}）と前の 7 日 · 記録を送った利用者" + ALWAYS },
    recon: { scope: "利用明細の最終日までの {period[days]} 日（{x[cost][start]:md}〜{x[cost][end]:md}）· 記録と利用明細の突き合わせ" },
    recon7: { data: "p.7", scope: "利用明細の最終日までの 7 日（{x[cost][start]:md}〜{x[cost][end]:md}）· 記録と利用明細の突き合わせ" + ALWAYS },
    month: { scope: "{month[month]:ym} · 利用明細（{month[as_of]:asof}）· その月にコストがあった利用者" + ALWAYS },
    policy: { data: "fixed.policy", scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件 · 対象は{basis:basis} {denominator:num} 人" },
    effect: { data: "fixed.effect", scope: "{REFERENCE_KEY:setting}を {REFERENCE_VALUE} にした前後 {EVENT_STUDY_SPAN} 日 · 前後の境は各利用者が守り始めた日" },
    effectCost: { data: "fixed.effect", scope: "守り始めた日の前後 {EVENT_STUDY_SPAN} 日 · 1 人 1 日あたり · {EFFECT_PROVIDER:provider} · 時期の変動を含むため、前後の差を施策の効果と読まない" },
  };
  // 群: 窓の記号から scope・data を引く。期間と無関係の窓は 12 か月でも同じ表記
  function group(id, label, win, cards, extra = {}) {
    const w = S[win];
    const fixed = !w.longScope && win !== "rec" && win !== "recon";
    return { id, label, data: w.data, scope: w.scope, longScope: w.longScope || (fixed ? w.scope : undefined), cards, ...extra };
  }

  const TREND_CAP = ["{x[daily][0][day]:md}", "濃い部分が直近 {period[days]} 日", "{period[end]:md}"];
  const MONTHS_BARS = (field, fmt) => ({ kind: "bars", src: "x[months]", field, fmt, tipLabel: "{day:ym}" });
  const MONTHS_CAP = ["{x[months][0][day]:ym}", "暦月ごと", "{x[cost][end]:md}"];
  const PAIR_PREV = (prev, now) => ({ [prev]: "前の {period[days]} 日", [now]: "直近 {period[days]} 日" });

  const HIST_SCOPE = " · 前後 {EVENT_STUDY_SPAN} 日 · 区間の幅 {CONTEXT_BIN:tok} トークン · 割合は各期間の中の割合";
  const HIST_NOTE = "両方の期間で 0 件の区間は出しません。しきい値が効いていれば、適用後は小さい区間に寄ります。";
  const histCard = (id, label) => ({ label, unit: "トークン", tab: id, wide: true, value: `{${id}[median][after]:bin}`,
    sub: `適用前 {${id}[median][before]:bin} · 記録 {${id}[total][before]:num} → {${id}[total][after]:num} 件`,
    viz: { kind: "hist", src: `${id}[rows]`, terms: L.SIDE }, cap: ["区間の幅 {CONTEXT_BIN:tok} トークン · 縦は各期間の中の割合"], long: SAME });
  const histTab = (id, label, title, scope) => ({ id, label, title, unit: "区間", note: HIST_NOTE, scope: scope + HIST_SCOPE, data: "fixed.effect",
    hint: `記録 {${id}[total][before]:num} → {${id}[total][after]:num} 件`, rows: `${id}[rows]`, long: SAME,
    cols: [{ key: "bin", kind: "bin", label: "トークン数の区間" }, { key: "before", kind: "num", label: "適用前の件数" },
      { key: "before_share", kind: "pct", label: "適用前の割合" }, { key: "after", kind: "num", label: "適用後の件数" },
      { key: "after_share", kind: "pct_strong", label: "適用後の割合" }],
    chart: { kind: "hist", key: "bin", sides: ["before", "after"], terms: L.SIDE } });

  const K = {
    K01: { label: "利用者", unit: "人", tab: "daily", value: "{x[active][users]:num}", sub: "前の {period[days]} 日 {x[active_prev][users]:num} 人",
      viz: { kind: "spark", src: "x[daily]", field: "users" }, cap: TREND_CAP },
    K02: { label: "1 人あたりの利用日数", unit: "日", tab: "days_dist", value: "{x[active][days_per_user]:dec1}",
      sub: "前の {period[days]} 日 {x[active_prev][days_per_user]:dec1} 日", viz: { kind: "hist", src: "x[days_dist]", sides: ["now"] }, cap: ["1 日", "利用した日数ごとの人数", "{period[days]} 日"] },
    K03: { label: "定着度", unit: "%", tab: "daily", value: "{x[active][stickiness]:dec1}",
      sub: "日ごとの利用者 {x[active][dau]:dec1} 人 ÷ 期間の利用者 {x[active][users]:num} 人", viz: { kind: "meter", src: "x[active][stickiness]", den: 100 } },
    K04: { label: "1 人 1 日あたりの指示", unit: "件", tab: "daily", value: "{x[active][prompts_per_person_day]:dec1}",
      sub: "前の {period[days]} 日 {x[active_prev][prompts_per_person_day]:dec1} 件", viz: { kind: "bars", src: "x[daily]", field: "prompts" }, cap: ["日ごとの指示の合計 · 濃い棒が直近"] },
    K08: { label: "時間帯ごとの指示", tab: "hours", wide: true, sub: "時（JST）ごとの指示の数",
      viz: { kind: "bars", src: "x[hours]", field: "prompts", tipLabel: "{key} 時" }, cap: ["0 時", "12 時", "23 時"] },
    K10: { label: "利用明細の利用者", unit: "人", tab: "people_cost", value: "{x[cost][users]:num}", sub: "前の {period[days]} 日 {x[cost][users_prev]:num} 人",
      viz: { kind: "bars", src: "x[daily]", field: "cost_users" }, cap: ["日ごとの人数 · 濃い棒が直近"],
      long: { label: "利用明細の利用者", unit: "人", tab: "people_cost", value: "{x[cost][users]:num}", sub: "棒は暦月ごとの人数（月の中の重複なし）",
        viz: MONTHS_BARS("users"), cap: MONTHS_CAP } },
    K11: { label: "営業日の利用率", unit: "%", value: "{m[active_day_rate]:dec1}", sub: "営業日 {m[business_days]:num} 日のうち、1 人が使った日の割合の平均",
      viz: { kind: "meter", src: "m[active_day_rate]", den: 100 }, long: SAME },
    K12: { label: "使い始めた利用者", unit: "人", value: "{m[new_user_count]:num}", sub: "期間の中で初めて利用明細にコストがあった人",
      long: { label: "使い始めた利用者", unit: "人", value: "{m[new_user_count]:num}", sub: "棒は暦月ごとの使い始めた人",
        viz: MONTHS_BARS("new_users"), cap: MONTHS_CAP } },
    K13: { label: "継続率", unit: "%", value: "{m[retention_rate]:dec1}", sub: "前の {period[days]} 日の利用者のうち · 離れた {m[left_users]:count} 人",
      viz: { kind: "meter", src: "m[retention_rate]", den: 100 }, long: { label: "継続率", sub: NO_PREV_LONG } },
    K20: { label: "コスト", tab: "cost_daily", value: "{x[cost][total]:usd}", delta: "{x[cost][change]:signed_pct}", sub: "前の {period[days]} 日 {x[cost][prev]:usd}",
      viz: { kind: "bars", src: "x[daily]", field: "cost", fmt: "usd" }, cap: ["日ごと · 濃い棒が直近"],
      long: { label: "コスト", tab: "weeks_cost", value: "{x[cost][total]:usd}", sub: "月平均 {cost[monthly]:usd} · 前の期間と比べない",
        viz: MONTHS_BARS("cost", "usd"), cap: MONTHS_CAP } },
    K21: { label: "1 人あたりコスト", tab: "people_cost", value: "{x[cost][per_user]:usd}", delta: "{x[cost][per_user_change]:signed_pct}",
      sub: "利用明細の {x[cost][users]:num} 人で割る", viz: { kind: "pair", src: "x[cost]", terms: PAIR_PREV("per_user_prev", "per_user") },
      long: { label: "1 人あたりコスト", tab: "people_cost", value: "{x[cost][per_user]:usd}", sub: "直近 {period[months]} か月の {x[cost][users]:num} 人で割る" } },
    K23: { label: "コストの多い利用者", tab: "people_cost", wide: true, sub: "上位 5 人 · 割合は期間のコストのうち",
      viz: { kind: "rates", src: "x[people]", field: "cost", den: "max", label: "{email}", limit: 5, right: ["{cost:usd}", "{share:pct}"] }, long: SAME },
    K24: { label: "上位 10% の占める割合", unit: "%", tab: "people_cost", value: "{x[cost][top10_share]:dec1}", sub: "上位 {x[cost][top10_n]:num} 人 / {x[cost][users]:num} 人",
      viz: { kind: "meter", src: "x[cost][top10_share]", den: 100, tone: "warn" }, long: SAME },
    K25: { label: "1 人あたりコストの分布", tab: "cost_dist", wide: true, sub: "区間ごとの人数（縦は割合）",
      viz: { kind: "hist", src: "x[cost_dist]", sides: ["now"] }, cap: ["{x[cost_dist][0][label]}", "", "右端は上限なし"], long: SAME },
    K26: { label: "前の期間から増えた利用者", tab: "people_cost", wide: true, sub: "増えた額の上位 3 人",
      viz: { kind: "rates", src: "x[people_up]", field: "cost_diff", den: "max", label: "{email}", limit: 3, right: ["+{cost_diff:usd}"] }, long: { label: "前の期間から増えた利用者", sub: NO_PREV_LONG } },
    K27: { label: "月末のコスト見込み（{month[month]:mon} 月）", tab: "month", value: "{month[forecast]:usd}",
      viz: { kind: "forecast", src: "month", stats: [] },
      cap: ["実績 {month[actual]:usd} · {month[elapsed]:num} / {month[business_days]:num} 営業日", "{month[as_of]:asof}"],
      empty: "month[as_of]", capEmpty: ["今月（{month[month]:mon} 月）の利用明細はまだありません"], long: SAME },
    K28: { label: "営業日あたりのコスト", tab: "month", value: "{month[per_bd]:usd}", delta: "{month[per_bd_change]:signed_pct}",
      sub: "前月（{month[prev_month]:mon} 月）{month[prev_per_bd]:usd}", viz: { kind: "pair", src: "month", terms: { prev_per_bd: "前月", per_bd: "今月" } }, long: SAME },
    K30: { label: "前月の確定", tab: "month", value: "{month[prev_actual]:usd}", sub: "{month[prev_month]:mon} 月 · {month[prev_users]:num} 人", long: SAME },
    K40: { label: "モデルごとのコスト", tab: "models", value: "{x[models][0][key]:model}", sub: "最も多い · コストの {x[models][0][share]:pct}",
      viz: { kind: "stack", src: "x[models]", field: "cost", tone: "accent", terms: L.MODEL }, long: SAME },
    K41: { label: "キャッシュ読み込みの割合", unit: "%", tab: "models", value: "{x[tokens][cache_read_share]:dec1}", sub: "トークン {x[tokens][total]:tok} のうち",
      viz: { kind: "meter", src: "x[tokens][cache_read_share]", den: 100 }, long: SAME },
    K43: { label: "100 万トークンあたりのコスト", tab: "models", value: "{m[unit_cost]:usd}", sub: "全モデルの平均 · 行はモデルごと",
      viz: { kind: "rates", src: "x[models]", field: "per_mtok", den: "max", terms: L.MODEL, right: ["{per_mtok:usd}"] }, long: SAME },
    K52: { label: "スキルを使った人の割合", unit: "%", tab: "skills", value: "{x[active][skills_reach]:dec1}",
      sub: "{x[active][skills_users]:num} 人 / {x[active][users]:num} 人 · 前の {period[days]} 日 {x[active_prev][skills_reach]:pct}", viz: { kind: "meter", src: "x[active][skills_reach]", den: 100 } },
    K53: { label: "コマンドを使った人の割合", unit: "%", tab: "commands", value: "{x[active][commands_reach]:dec1}",
      sub: "{x[active][commands_users]:num} 人 / {x[active][users]:num} 人 · 前の {period[days]} 日 {x[active_prev][commands_reach]:pct}", viz: { kind: "meter", src: "x[active][commands_reach]", den: 100 } },
    K55: { label: "サブエージェントを使った人の割合", unit: "%", tab: "people_use", value: "{m[subagent_user_rate]:dec1}",
      sub: "{m[subagent_users]:num} 人 · 起動 {m[subagent_runs]:num} 回", viz: { kind: "meter", src: "m[subagent_user_rate]", den: 100 } },
    K63: { label: "確認なしモードを使った利用者", unit: "人", tab: "modes", value: "{x[active][bypass_users]:num}",
      sub: "利用者の {x[active][bypass_reach]:pct} · 前の {period[days]} 日 {x[active_prev][bypass_users]:num} 人", viz: { kind: "meter", src: "x[active][bypass_users]", den: "x[active][users]", tone: "warn" } },
    K80: { label: "すべての設定を適用", unit: "人", tab: "users", chip: "ok", value: "{counts[ok]:num}", sub: "対象 {denominator:num} 人のうち {counts[ok_rate]:pct}",
      viz: { kind: "meter", src: "counts[ok]", den: "denominator", tone: "ok" }, cap: ["{counts[items]:num} つの設定がすべて配布した値"], long: SAME },
    K81: { label: "未適用のある利用者", unit: "人", tab: "users", chip: "off", value: "{counts[off]:num}", state: "states[off]",
      sub: "端末 {counts[off_terminals]:num} 台 · 違う値か未設定", viz: { kind: "meter", src: "counts[off]", den: "denominator", tone: "ng" }, cap: ["対象 {denominator:num} 人のうち"], long: SAME },
    K82: { label: "設定ごとの適用率", tab: "settings", wide: true, sub: "最も低いのは {lowest:setting}",
      viz: { kind: "rates", src: "items", field: "rate", terms: L.SETTING, right: ["{numerator:num} / {denominator:num} 人", "{rate:pct}"] }, long: SAME },
    K83: { label: "適用率の推移", unit: "%", tab: "trend", value: "{F[m][compliance_trend][11][rate]:dec1}", sub: "最新の週 · 各週末までの {POLICY_DAYS} 日で設定の平均",
      viz: { kind: "spark", src: "F[m][compliance_trend]", field: "rate" }, cap: ["{F[m][compliance_trend][0][day]:md}", "週ごと · 12 週", "{F[m][compliance_trend][11][end]:md}"], long: SAME },
    K90: { label: "プラグイン未導入", unit: "人", tab: "users", chip: "none", value: "{counts[none]:num}", state: "states[none]",
      sub: "コストがあるのに報告が無い", viz: { kind: "meter", src: "counts[none]", den: "denominator", tone: "warn" }, cap: ["対象 {denominator:num} 人のうち"], long: SAME },
    K91: { label: "報告が止まった端末", unit: "台", tab: "terminals", chip: "stale", value: "{counts[stale_terminals]:num}",
      sub: "{counts[stale_users]:num} 人 · 最後の報告から {STALE_DAYS} 日以上", viz: { kind: "meter", src: "counts[stale_terminals]", den: "counts[terminals]", tone: "neutral" },
      cap: ["全 {counts[terminals]:num} 台のうち"], long: SAME },
    K92: { label: "プラグインが最新版の端末", unit: "台", tab: "versions", chip: "plugin", value: "{plugin[latest_count]:num}",
      sub: "最新 {plugin[latest]} · 全 {plugin[total]:num} 台", viz: { kind: "stack", src: "plugin[parts]", tone: "accent" }, long: SAME },
    K93: { label: "本体が最新版の端末", unit: "台", tab: "versions", chip: "core", value: "{core[latest_count]:num}",
      sub: "最新 {core[latest]} · 全 {core[total]:num} 台", viz: { kind: "stack", src: "core[parts]", tone: "accent" }, long: SAME },
    K100: { label: "受信した記録", unit: "件", tab: "health", value: "{events[recent]:num}", delta: "{events[delta]:signed}",
      sub: "前の {period[days]} 日 {events[prev]:num} 件", viz: { kind: "pair", src: "events", terms: L.PAIR }, long: SAME },
    K101: { label: "利用明細との照合率", unit: "%", tab: "gaps", value: "{reconciliation[rate]:dec1}",
      sub: "利用明細にもいた {reconciliation[numerator]:num} 人 / 送信した {reconciliation[denominator]:num} 人",
      viz: { kind: "meter", src: "reconciliation[numerator]", den: "reconciliation[denominator]" }, cap: ["前との比較なし"], long: SAME },
    K102: { label: "プラグインのエラー", unit: "件", tab: "errors", value: "{errors[total]:num}", state: "errors[state]", sub: "{errors[kinds]:num} 種類 · 前との比較なし",
      viz: { kind: "stack", src: "errors[stages]", tone: "warn", terms: L.STAGE }, long: SAME },
    K103: { label: "項目の欠け（最大）", unit: "%", tab: "health", chip: "null", value: "{nulls[rate]:dec1}", state: "nulls[state]",
      sub: "{nulls[key]:field} · {nulls[ok]:num} / {nulls[total]:num} 項目が正常",
      viz: { kind: "rates", src: "nulls[fields]", field: "rate", terms: L.HEALTH_ITEM, right: ["{rate:pct}"] }, long: SAME },
    K104: { label: "記録の無い利用明細の利用者", unit: "人", tab: "gaps", chip: "billed_only", value: "{m[uncollected_billed_users]:count}",
      sub: "利用明細にコストがあるのに記録が無い", long: SAME },
    K110: histCard("precompact", "圧縮直前のコンテキスト（中央の区間）"),
    K111: histCard("stop", "応答終了時のコンテキスト（中央の区間）"),
    K112: { label: "しきい値を守り始めた利用者", unit: "人", tab: "study", value: "{adopters:num}", sub: "日ごとの対象者 {study[people_min]:num}〜{study[people_max]:num} 人",
      cap: ["その日が利用明細の期間に入る人だけを数える"], long: SAME },
    K113: { label: "1 人 1 日あたりのコスト", tab: "study", value: "{study[after][cost]:usd}",
      sub: "適用前 {study[before][cost]:usd} · のべ {study[before][person_days]:num} → {study[after][person_days]:num} 人日",
      viz: { kind: "pair", src: "study", field: "cost", terms: L.SIDE }, cap: ["0 日目（守り始めた当日）を除く"], long: SAME },
    K114: { label: "1 人 1 日あたりのトークン", unit: "トークン", tab: "study", value: "{study[after][tokens]:tok}", sub: "適用前 {study[before][tokens]:tok}",
      viz: { kind: "pair", src: "study", field: "tokens", terms: L.SIDE }, cap: ["入力とキャッシュの読み書き（出力は含まない）"], long: SAME },
  };

  const WEEK = { key: "day", kind: "week", label: "週の始まり" };
  const PROVIDERS = { key: "providers", kind: "usd", each: "cost[providers]", terms: L.PROVIDER };
  const GAP_KIND = { billed_only: "利用明細だけ", report_only: "設定の報告だけ", both: "利用明細と設定の報告" };
  const USAGE_NOTE = "差は直近から前の {period[days]} 日を引いた値です。増えた・減ったは呼び出し回数の差で分けます。";
  const CALLS = [{ key: "recent_calls", kind: "num", unit: "times", label: "呼び出し回数" }, BAR("recent_calls"),
    { key: "prev_calls", kind: "num_sub", label: L.PREV }, { key: "calls_diff", kind: "diff", label: "差" },
    { key: "recent_users", kind: "num", unit: "person", label: "利用者数" }, { key: "users_diff", kind: "diff", label: "利用者の差" }];

  const T = {
    T01: { id: "daily", label: "日ごとの利用", hint: "直近 {period[span]} 日 · 記録", title: "日ごとの利用者と指示", unit: "日",
      scope: "直近 {period[span]} 日 · 日ごと · 濃い色が直近 {period[days]} 日 · 記録", rows: "x[daily]", sort: ["day", "desc"],
      cols: [{ key: "day", kind: "date", label: "日付" }, { key: "period", kind: "tag", terms: L.PERIOD, label: "期間" },
        { key: "users", kind: "num", unit: "person", label: "利用者" }, { key: "sessions", kind: "num", unit: "item", label: "セッション" },
        { key: "prompts", kind: "num", unit: "item", label: "指示" }, BAR("prompts")],
      chipsBy: "period", chips: PERIOD_CHIPS,
      chart: { kind: "bars", key: "day", panels: [{ title: "利用者", field: "users" }, { title: "指示", field: "prompts" }] } },
    T02: { id: "cost_daily", label: "日ごとのコスト", hint: "直近 {period[span]} 日 · 利用明細", title: "日ごとのコスト", unit: "日",
      scope: "利用明細 {cost[spark_start]:md}〜{cost[end]:md} · 日 × 提供元（USD）· 濃い地が直近 {period[days]} 日",
      search: "日付（例: 09-2）", q: "{day:day}", rows: "cost[days]", sort: ["day", "desc"],
      cols: [{ key: "day", kind: "date", label: "日付" }, PROVIDERS, { key: "total", kind: "usd_strong", label: "合計" }, BAR("total")],
      chipsBy: "period", chips: PERIOD_CHIPS,
      chart: { kind: "stacked", key: "day", series: "cost[providers]", seriesField: "providers", terms: L.PROVIDER, shade: true, fmt: "usd", legend: [L.COST_SHADE] },
      long: { id: "weeks_cost", label: "週ごとのコスト", hint: "{cost[weeks]:count} 週 · 利用明細", title: "週ごとのコスト", unit: "週",
        scope: "利用明細 {cost[start]:day}〜{cost[end]:day} · 週 × 提供元（USD）", note: "月の合計は暦月で数えるため、週の区切りとは合いません。",
        rows: "cost[weeks]", sort: ["day", "desc"], cols: [WEEK, PROVIDERS, { key: "total", kind: "usd_strong", label: "合計" }, BAR("total")],
        chart: { kind: "stacked", key: "day", series: "cost[providers]", seriesField: "providers", terms: L.PROVIDER, fmt: "usd",
          months: { src: "cost[months]", value: "total" }, legend: ["薄い棒は途中の週 · 軸の下の行は暦月の合計"] } } },
    T03: { id: "month", label: "今月のコスト", hint: "{month[month]:mon} 月 · {month[elapsed]:num} / {month[business_days]:num} 営業日",
      title: "今月のコストの累積と月末の見込み", unit: "日", scope: "{month[month]:ym} · 利用明細 · {month[as_of]:asof}",
      note: "見込みは実績 × 月の営業日数 ÷ 経過した営業日数です（{month[actual]:usd} × {month[business_days]:num} ÷ {month[elapsed]:num}）。"
        + "営業日は平日から国民の祝日と会社の休日を除いた日です。見込みの累積は残りの営業日に置いています。"
        + "経過が {FORECAST_MIN_BUSINESS_DAYS} 営業日未満のあいだは見込みを出しません（仮の基準）。",
      rows: "month[rows]",
      cols: [{ key: "day", kind: "mday", label: "日付", sort: null }, { key: "n", kind: "num", label: "営業日", sort: null },
        { key: "cost", kind: "usd", label: "その日のコスト", sort: null }, BAR("cost", "top"),
        { key: "cum", kind: "cum", label: "今月の累積", sort: null }, { key: "prev", kind: "usd_sub", label: "前月（{month[prev_month]:mon} 月）の累積", sort: null }],
      chipsBy: "mode", chips: [{ id: "bd", label: "営業日" }, { id: "cal", label: "暦日" }], chipsAll: false,
      chart: { kind: "month", key: "link", src: "month",
        legend: ["今月の実績 {month[actual]:usd}", "月末までの見込み {month[forecast]:usd}", "前月（{month[prev_month]:mon} 月）{month[prev_actual]:usd}"],
        axis: { bd: "横軸は営業日（休日の分は次の営業日に含める）", cal: "横軸は暦日（前月は同じ日付に重ねる）" },
        off: "{month[month]:mon} 月の週末・祝日・会社の休日" },
      long: SAME },
    T04: { id: "people_cost", label: "利用者ごとのコスト", hint: "{x[cost][users]:num} 人 · 利用明細", title: "利用者ごとのコスト", unit: "人",
      scope: "利用明細 {x[cost][start]:day}〜{x[cost][end]:day} · コストの多い順 · 前の期間は同じ長さの直前",
      note: "記録だけあって利用明細にコストの無い人は、順位なしで末尾に出ます。12 か月では前の期間と比べません。",
      search: "利用者で絞り込み", q: "{email}", rows: "x[people]", sort: ["cost", "desc"],
      cols: [{ key: "rank", kind: "rank", label: "順位" }, { key: "email", kind: "user", label: "利用者" },
        { key: "cost", kind: "usd_strong", label: "コスト" }, BAR("cost"), { key: "share", kind: "pct", label: "割合" },
        { key: "cum_share", kind: "pct", label: "累積", sort: "rank" }, { key: "cost_prev", kind: "usd_sub", label: "前の期間" },
        { key: "cost_diff", kind: "usd", label: "差" }, { key: "days", kind: "num", unit: "day", label: "日数" },
        { key: "per_day", kind: "usd", label: "1 日あたり" }, { key: "top_model", kind: "model", label: "主なモデル" },
        { key: "cache_share", kind: "pct", label: "キャッシュ読みの割合" }],
      chipsBy: "top_model", chipTerms: L.MODEL, long: SAME },
    T05: { id: "people_use", label: "利用者ごとの使い方", hint: "{x[active][users]:num} 人 · 記録", title: "利用者ごとの使い方", unit: "人",
      scope: "直近 {period[days]} 日（{period[start]:md}〜{period[end]:md}）· 記録 · 利用日数の多い順",
      note: "利用明細にだけいて記録の無い人は、値が「—」で末尾に出ます。サブエージェント・中断・確認なしは、その人の記録の中での割合です。",
      search: "利用者で絞り込み", q: "{email}", rows: "x[people]", sort: ["active_days", "desc"],
      cols: [{ key: "email", kind: "user", label: "利用者" }, { key: "active_days", kind: "num", unit: "day", label: "利用日数" },
        { key: "sessions", kind: "num", label: "セッション" }, { key: "prompts", kind: "num", label: "指示" },
        { key: "prompts_per_session", kind: "dec1", label: "指示／セッション" }, { key: "tool_calls", kind: "num", label: "ツール" },
        { key: "skills", kind: "num", label: "スキル" }, { key: "commands", kind: "num", label: "コマンド" },
        { key: "agent_rate", kind: "pct", label: "サブエージェント" }, { key: "interrupt_rate", kind: "pct", label: "中断" },
        { key: "bypass_rate", kind: "pct", label: "確認なし" }, { key: "compacts", kind: "num", label: "圧縮" },
        { key: "version", kind: "code", label: "本体の版" }, { key: "last_day", kind: "md", label: "最終日" }] },
    T06: { id: "models", label: "モデル", hint: "{x[models]:count} 種類 · 利用明細", title: "モデルごとのコストとトークン", unit: "行",
      scope: "利用明細 {x[cost][start]:day}〜{x[cost][end]:day} · 前は同じ長さの直前の期間", rows: "x[models]", sort: ["cost", "desc"],
      cols: [{ key: "key", kind: "model", label: "モデル" }, { key: "cost", kind: "usd_strong", label: "コスト" }, { key: "share", kind: "pct", label: "割合" },
        BAR("share", "100"), { key: "prev", kind: "usd_sub", label: "前の期間" }, { key: "diff", kind: "usd", label: "差" },
        { key: "users", kind: "num", unit: "person", label: "利用者" }, { key: "tokens", kind: "tok", label: "トークン" },
        { key: "cache_read", kind: "tok", label: "キャッシュ読み" }, { key: "per_mtok", kind: "usd", label: "100 万トークンあたり" }], long: SAME },
    T07: { id: "people_tok", label: "利用者ごとのトークン", hint: "{x[cost][users]:num} 人 · 利用明細", title: "利用者ごとのトークン", unit: "人",
      scope: "利用明細 {x[cost][start]:day}〜{x[cost][end]:day} · トークンの多い順", search: "利用者で絞り込み", q: "{email}",
      rows: "x[people]", sort: ["tokens", "desc"],
      cols: [{ key: "email", kind: "user", label: "利用者" }, { key: "tokens", kind: "tok", label: "トークン" }, BAR("tokens"),
        { key: "input", kind: "tok", label: "入力" }, { key: "output", kind: "tok", label: "出力" }, { key: "cache_read", kind: "tok", label: "キャッシュ読み" },
        { key: "cache_write", kind: "tok", label: "キャッシュ書き" }, { key: "cache_share", kind: "pct", label: "キャッシュ読みの割合" },
        { key: "top_model", kind: "model", label: "主なモデル" }],
      chipsBy: "top_model", chipTerms: L.MODEL, long: SAME },
    T08: { id: "months", label: "月ごとの推移", hint: "{x[months]:count} か月 · 利用明細", title: "月ごとのコストと利用者", unit: "月",
      scope: "利用明細 · 暦月 · 最初と最後の月は途中の月を含む", rows: "x[months]", sort: ["day", "desc"],
      cols: [{ key: "day", kind: "ym", label: "月" }, { key: "cost", kind: "usd_strong", label: "コスト" }, { key: "users", kind: "num", unit: "person", label: "利用者" },
        { key: "per_user", kind: "usd", label: "1 人あたり" }, { key: "new_users", kind: "num", unit: "person", label: "使い始めた人" }],
      chart: { kind: "stacked", key: "day", tick: "{day:ym}", series: "x[model_keys]", seriesField: "models", terms: L.MODEL, fmt: "usd" } },
    T09: { id: "cost_dist", label: "1 人あたりコストの分布", hint: "{x[cost][users]:num} 人 · 利用明細", title: "1 人あたりコストの分布", unit: "区間",
      scope: "利用明細 {x[cost][start]:day}〜{x[cost][end]:day} · 割合は利用者のうち", rows: "x[cost_dist]",
      cols: [{ key: "label", kind: "text", label: "区間" }, { key: "count", kind: "num", unit: "person", label: "人数" }, { key: "now_share", kind: "pct", label: "割合" }, BAR("now_share", "100")],
      chart: { kind: "hist", key: "bin", sides: ["now"], tick: "{label}" }, long: SAME },
    T11: { id: "skills", label: "スキル", hint: "{skills[kinds]:num} 種類 · {skills[recent]:num} 回", title: "スキルごとの呼び出し回数と利用者数", unit: "行",
      scope: "直近 {period[days]} 日と前の {period[days]} 日 · スキルの呼び出しの記録", search: "スキル名で絞り込み", q: "{name}", note: USAGE_NOTE,
      rows: "skills[rows]", sort: ["recent_calls", "desc"], cols: [{ key: "name", kind: "code", label: "スキル" }, ...CALLS],
      chipsBy: "trend", chips: chipsOf(L.TREND) },
    T12: { id: "commands", label: "コマンド", hint: "{commands[kinds]:num} 種類 · {commands[recent]:num} 回", title: "コマンドごとの呼び出し回数と利用者数", unit: "行",
      scope: "直近 {period[days]} 日と前の {period[days]} 日 · コマンドの呼び出しの記録 · 定義元は記録された値のまま",
      search: "コマンド名・定義元で絞り込み", q: "{name} {source}", note: "同じコマンドでも定義元が違えば別の行です。" + USAGE_NOTE,
      rows: "commands[rows]", sort: ["recent_calls", "desc"],
      cols: [{ key: "name", kind: "code", label: "コマンド" }, { key: "source", kind: "code", label: "定義元" }, ...CALLS],
      chipsBy: "trend", chips: chipsOf(L.TREND) },
    T13: { id: "tools", label: "ツール", hint: "{x[tools]:count} 種類 · 記録", title: "ツールごとの呼び出しと失敗", unit: "行",
      scope: "直近 {period[days]} 日 · ツール実行の記録 · 割合は全呼び出しのうち", rows: "x[tools]", sort: ["calls", "desc"],
      cols: [{ key: "key", kind: "code", label: "ツール" }, { key: "calls", kind: "num", unit: "times", label: "回数" }, { key: "share", kind: "pct", label: "割合" },
        BAR("share", "100"), { key: "failures", kind: "num", label: "失敗" }, { key: "fail_rate", kind: "pct_strong", label: "失敗の割合" },
        { key: "users", kind: "num", unit: "person", label: "利用者" }],
      chart: { kind: "bars", key: "key", dayKeys: false, tick: "{key}", panels: [{ title: "呼び出し回数", field: "calls" }] } },
    T14: { id: "modes", label: "使われ方", hint: "直近 {period[days]} 日 · 記録", title: "使われ方", unit: "行",
      scope: "直近 {period[days]} 日 · 記録の件数（開始のしかたはセッション開始の記録）· 割合は区分の中での割合", rows: "usage",
      cols: [{ key: "field", kind: "tag", terms: L.USAGE_FIELD, label: "区分" }, { key: "value", kind: "term", terms: L.USAGE_VALUE, by: "field", label: "値" },
        { key: "count", kind: "num", label: "件数" }, { key: "share", kind: "pct", label: "割合" }, BAR("share", "100")],
      chipsBy: "field", chips: chipsOf(L.USAGE_FIELD) },
    T17: { id: "days_dist", label: "利用日数の分布", hint: "{x[active][users]:num} 人 · 記録", title: "利用した日数ごとの人数", unit: "区間",
      scope: "直近 {period[days]} 日 · 記録を送った利用者 · 割合は利用者のうち", rows: "x[days_dist]",
      cols: [{ key: "label", kind: "text", label: "利用日数" }, { key: "count", kind: "num", unit: "person", label: "人数" }, { key: "now_share", kind: "pct", label: "割合" }, BAR("now_share", "100")],
      chart: { kind: "hist", key: "bin", sides: ["now"], tick: "{label}" } },
    T20: { id: "users", data: "fixed.policy", label: "利用者ごとの適用状況", hint: "{denominator:num} 人 · 直近 {POLICY_DAYS} 日", title: "利用者ごとの適用状況", unit: "人",
      scope: "直近 {POLICY_DAYS} 日 · 対象 {denominator:num} 人" + ALWAYS, search: "利用者で絞り込み", q: "{email}", rows: "users", sort: ["rank", "asc"],
      note: "1 台でも違う値の端末があれば、その利用者は未適用と数えます。このため台数と人数は一致しません。{basis:basis_note}",
      cols: [{ key: "status", kind: "user_state", sort: "rank", label: "状態" }, { key: "email", kind: "user", label: "利用者" },
        { key: "terminals", kind: "dash_num", label: "端末" }, { key: "on", kind: "dot", each: "items", terms: L.SETTING },
        { key: "day", kind: "last_day", label: "最終報告日" }],
      chipsBy: "status", chips: chipsOf(L.USER_STATE), long: SAME },
    T21: { id: "terminals", data: "fixed.policy", label: "端末ごと", hint: "{counts[terminals]:num} 台", title: "端末ごとの現在の値", unit: "台",
      scope: "直近 {POLICY_DAYS} 日に設定の報告があった端末 · 端末ごとに最新の報告 1 件", search: "利用者・端末名で絞り込み", q: "{email} {host}",
      note: L.STALE_NOTE + " 本体の版は、直近 {POLICY_DAYS} 日の記録のうち端末ごとに最新の値です。", rows: "terminals", sort: ["rank", "asc"],
      cols: [{ key: "status", kind: "terminal_state", sort: "rank", label: "状態" }, { key: "email", kind: "user", label: "利用者" },
        { key: "host", kind: "code", label: "端末名" }, { key: "value", kind: "value", label: L.SETTING["env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"][0] },
        { key: "off_keys", kind: "off_keys", label: "未適用の設定" }, { key: "core", kind: "code", label: "本体の版" }, { key: "day", kind: "last_day", label: "最終報告日" }],
      chipsBy: "tags", chips: chipsOf(L.TERMINAL_STATE), long: SAME },
    T22: { id: "settings", data: "fixed.policy", label: "設定ごと", hint: "{counts[items]:num} 設定", title: "設定ごとの適用率", unit: "行",
      scope: "直近 {POLICY_DAYS} 日 · 分母は{basis:basis}利用者 {denominator:num} 人", search: "設定名・キーで絞り込み", q: "{key:setting} {key}",
      note: "{basis:basis_note}", rows: "items", sort: ["rate", "asc"],
      cols: [{ key: "key", kind: "setting", terms: L.SETTING, label: "設定" }, { key: "numerator", kind: "ratio", label: "適用済み / 対象" },
        { key: "rate", kind: "pct_strong", label: "適用率" }, BAR("rate", "100"), { key: "off_terminals", kind: "num", unit: "terminal", label: "未適用の端末" }], long: SAME },
    T23: { id: "versions", data: "fixed.policy", label: "バージョン", hint: "プラグイン・本体", title: "バージョンの分布", unit: "行",
      scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件 · 古い版が残るのは更新が届いていない端末", rows: "versions",
      cols: [{ key: "kind", kind: "tag", terms: L.VERSION_KIND, label: "種類" }, { key: "version", kind: "version", sort: "order", label: "バージョン" },
        { key: "count", kind: "count_of", label: "端末数" }, BAR("count", "total")],
      chipsBy: "kind", chips: chipsOf(L.VERSION_KIND), long: SAME },
    T24: { id: "trend", data: "fixed", label: "適用率の推移", hint: "12 週", title: "週ごとの適用率", unit: "週",
      scope: "各週末までの {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件 · 設定ごとの適用率の平均", rows: "m[compliance_trend]", sort: ["day", "desc"],
      cols: [{ key: "day", kind: "week", label: "週" }, { key: "rate", kind: "pct_strong", label: "適用率" }, BAR("rate", "100")],
      chart: { kind: "bars", key: "day", tick: "{day:md}", panels: [{ title: "適用率（%）", field: "rate" }] }, long: SAME },
    T30: { id: "health", label: "受信と項目の欠け", hint: "直近 {period[days]} 日と前の {period[days]} 日", title: "受信と項目の欠け", unit: "行",
      scope: "直近 {period[days]} 日と前の {period[days]} 日 · 欠けの分母は、その項目が送られるはずの記録",
      note: "欠けは {NULL_RATE_ELEVATED}% 以下を正常、{NULL_RATE_ELEVATED}% 超を注意、{NULL_RATE_HIGH}% 超を要確認とします（仮の基準）。100% に跳ねたら上流の仕様変更を疑います。",
      rows: "health",
      cols: [{ key: "group", kind: "tag", terms: L.HEALTH_GROUP, label: "区分", sort: null }, { key: "item", kind: "term", terms: L.HEALTH_ITEM, label: "項目", sort: null },
        { key: "now", kind: "measure", label: L.RECENT, sort: null }, { key: "prev", kind: "measure_sub", label: L.PREV, sort: null },
        { key: "diff", kind: "diff", label: "差", sort: null }, { key: "state", kind: "state", label: "状態", sort: null }],
      chipsBy: "group", chips: chipsOf(L.HEALTH_GROUP) },
    T31: { id: "errors", label: "プラグインのエラー", hint: "直近 {period[days]} 日 · {errors[total]:num} 件", title: "プラグインのエラー", unit: "行",
      scope: "直近 {period[days]} 日 · 端末 = 利用者とホスト名の組 · 失った記録は戻りません", search: "エラーの種類・版", q: "{error_type} {version} {stage}",
      rows: "errors[rows]", sort: ["count", "desc"],
      cols: [{ key: "stage", kind: "stage", terms: L.STAGE, label: "処理段階" }, { key: "error_type", kind: "code", label: "エラーの種類" },
        { key: "count", kind: "num", label: "件数" }, { key: "terminals", kind: "num", unit: "terminal", label: "端末数" }, { key: "version", kind: "code", label: "最後に起きた版" }],
      chipsBy: "stage", chipTerms: L.STAGE },
    T32: { id: "gaps", label: "記録の無い利用者", hint: "{x[gap_users]:count} 人", title: "記録の無い利用者", unit: "人",
      scope: "記録は直近 {period[days]} 日（{period[start]:md}〜{period[end]:md}）· 利用明細は最終日までの {period[days]} 日 · 設定の報告は記録と同じ窓",
      note: "利用明細だけ = コストがあるのに記録が無い（未導入・収集の無効化・メールの不一致）。設定の報告だけ = 設定の報告はあるのに記録が無い（収集を止めている疑い。推測を含む）。",
      search: "利用者で絞り込み", q: "{email}", rows: "x[gap_users]", sort: ["cost", "desc"],
      cols: [{ key: "email", kind: "user", label: "利用者" }, { key: "kind", kind: "tag", terms: GAP_KIND, label: "区分" },
        { key: "cost", kind: "usd", label: "利用明細のコスト" }, { key: "last_event", kind: "day", label: "最後の記録" }, { key: "last_report", kind: "day", label: "最後の設定の報告" }],
      chipsBy: "kind", chips: chipsOf(GAP_KIND) },
    T40: histTab("precompact", "圧縮直前の分布", "圧縮直前のコンテキストの大きさ", "自動圧縮が走る直前（PreCompact）のトークン数"),
    T41: histTab("stop", "応答終了時の分布", "応答終了時のコンテキストの大きさ", "各応答が終わった時点（Stop）のトークン数"),
    T42: { id: "study", data: "fixed.effect", label: "日ごとの 1 人あたり", hint: "守り始めた日の前後 {EVENT_STUDY_SPAN} 日", title: "日ごとの 1 人あたりコストとトークン", unit: "日",
      scope: "守り始めた日を 0 日目とした前後 {EVENT_STUDY_SPAN} 日 · {EFFECT_PROVIDER:provider} · トークンは入力とキャッシュの読み書きの合計",
      note: "0 日目（守り始めた当日）は前後が混ざるため除いています。その日が利用明細の期間に入る人だけを数えるため、日ごとに人数が変わります。"
        + "時期による変動（繁忙・モデルの切り替えなど）を差し引いていないため、前後の差を施策の効果と読まないでください。",
      rows: "study[rows]",
      cols: [{ key: "day", kind: "rel", label: "守り始めてからの日数" }, { key: "side", kind: "tag", terms: L.SIDE, label: "期間" },
        { key: "people", kind: "num", unit: "person", label: "対象者数" }, { key: "tokens", kind: "tok", label: "1 人あたりトークン" },
        { key: "cost", kind: "usd", label: "1 人あたりコスト" }, BAR("cost")],
      chipsBy: "side", chips: chipsOf(L.SIDE), long: SAME },
  };

  // ページを組む。カードの開くタブがそのページに無ければ、押せないカードにする
  function page(def) {
    const ids = new Set((def.tabs || []).flatMap((t) => [t.id, t.long && t.long.id].filter(Boolean)));
    const fit = (c) => { if (!c || c === SAME || !c.tab || ids.has(c.tab)) return c; const { tab, chip, ...rest } = c; return rest; };
    const cards = (g) => g.cards.map((c) => { const f = fit(c); return f.long && typeof f.long === "object" ? { ...f, long: fit(f.long) } : f; });
    return { ...def, groups: (def.groups || []).map((g) => ({ ...g, cards: cards(g) })) };
  }

  const settingsPage = {
    id: "settings", title: "データと設定", nav: "end", data: "fixed.settings",
    lead: "利用明細（CSV）の取り込み、月ごとの全ログの書き出し、営業日の数え方に使う会社の休日",
    sections: [
      { id: "import", title: "取り込む", lead: "利用明細（CSV）はコストとトークンの正本です",
        blocks: [
          { kind: "form", cls: "upload-form", fields: [{ label: "利用明細の CSV", type: "file", accept: ".csv" }], button: "CSV を取り込む" },
          { kind: "note", text: "同じ名前のファイルは上書きし、前の中身の行を消して取り込み直します。取り込みは日ごとの置き換えで、同じ日を含むファイルは後から取り込んだほうが残ります。1 ファイルには、含む日の全行を入れてください。" },
          { kind: "table", tab: { id: "csv_files", unit: "件", rows: "files[files]", sort: ["last", "desc"], empty: "取り込んだファイルはありません。",
            cols: [{ key: "source_file", kind: "code", label: "取り込んだファイル" }, { key: "first", kind: "span", sort: "last", label: "期間" },
              { key: "bytes", kind: "bytes", label: "大きさ" }, { key: "source_file", kind: "delete_file", label: "", sort: null }] } },
        ] },
      { id: "export", title: "書き出す", lead: "記録・設定の報告・エラー・利用明細の 4 表を、月（JST）ごとに表ごとの CSV の ZIP で · 月を押すと、表ごとの行数と列が開きます",
        blocks: [
          { kind: "months", src: "export", words: { head: ["月", "行数（4 表）", "大きさ（目安）"], unit: "件", download: "ダウンロード",
            from: "（{day:md} から）", to: "（{day:md} まで）", empty: "書き出せる記録はありません。",
            tables: { events: "記録", policy_state: "設定の報告", errors: "エラー", cost_daily: "利用明細" } } },
          { kind: "note", text: "ZIP には表ごとの CSV と列の説明（README.txt）が入ります。利用者名つき・値は加工なし・UTF-8（BOM なし）です。大きさは圧縮後の目安です。Excel で直接開かず、Python などで読んでください。" },
        ] },
      { id: "holidays", title: "会社の休日", lead: "営業日は、平日から国民の祝日と会社の休日を除いた日です。月末のコストの見込みと今月のコストで使います。",
        blocks: [
          { kind: "form", cls: "holiday-form", fields: [{ label: "開始日", type: "date" }, { label: "終了日", type: "date" }, { label: "名前", grow: true }], button: "追加" },
          { kind: "note", text: "国民の祝日は自動で除きます。ここには会社独自の休日だけを入れます。" },
          { kind: "table", tab: { id: "holidays", unit: "日", rows: "holidays[holidays]", sort: ["day", "desc"], empty: "登録された会社の休日はありません。",
            cols: [{ key: "day", kind: "day", label: "日付" }, { key: "day", kind: "weekday", label: "曜日", sort: null },
              { key: "name", kind: "text", label: "名前" }, { key: "day", kind: "delete", label: "", sort: null }] } },
        ] },
    ],
  };
  // ---- ここまで部品の辞書 ----

  // ---- 案 15 データの出所で分ける ----
  const params = new URLSearchParams(location.search);
  const LONG_NOW = params.get("period") === "12m";
  const billing = page({
    id: "billing", title: "利用明細", lead: "誰に、どのモデルで、いくらかかったか", periods: true,
    groups: [
      group("cost", "コスト", "bill", [K.K20, K.K21, K.K24, K.K23]),
      group("users", "利用者", "bill", [K.K10, K.K11, K.K12, K.K13]),
      group("models", "モデルとトークン", "bill", [K.K40, K.K41, K.K43]),
      group("month", "今月", "month", [K.K27, K.K28, K.K30]),
    ],
    // 月ごとの推移は 12 か月だけのタブ（7 日・28 日には月の行が無い）
    tabs: [T.T04, T.T02, T.T06, T.T07, T.T03, ...(LONG_NOW ? [{ ...T.T08, long: SAME }] : [])],
  });
  const records = page({
    id: "records", title: "利用の記録", lead: "どれだけの頻度で、何を使っているか", periods: true, periodChoices: ["7", "28"],
    groups: [
      group("freq", "頻度", "rec", [K.K01, K.K02, K.K03, K.K04]),
      group("assets", "スキルとコマンド", "rec", [K.K52, K.K53, K.K55, K.K63]),
      group("receive", "受信", "rec", [K.K100, K.K102, K.K103]),
      group("recon", "照合", "recon", [K.K101, K.K104]),
    ],
    tabs: [T.T05, T.T11, T.T12, T.T13, T.T14, T.T30, T.T31, T.T32],
  });
  const policy = page({
    id: "policy", title: "設定の報告", lead: "端末に設定が入り、最新か",
    groups: [
      group("apply", "適用", "policy", [K.K80, K.K81, K.K82, K.K83]),
      group("install", "導入と版", "policy", [K.K90, K.K91, K.K92, K.K93]),
    ],
    tabs: [T.T20, T.T21, T.T22, T.T23, T.T24],
  });
  const effect = page({
    id: "effect", title: "設定の効果", lead: "しきい値は働いているか",
    groups: [
      group("context", "コンテキスト", "effect", [K.K110, K.K111]),
      group("spend", "コストの前後", "effectCost", [K.K112, K.K113, K.K114]),
    ],
    tabs: [T.T40, T.T41, T.T42],
  });
  const pages = [billing, records, policy, effect, settingsPage];

  // 期間の選択肢をページごとに変える（キットは meta.periods を全ページで使うため、描く前に今のページの選択肢へ差し替える）
  const here = pages.find((p) => p.id === params.get("page")) || pages[0];
  if (here.periodChoices) window.DATA.meta.periods = here.periodChoices;

  window.IA = { id: "15-by-source", name: "案 15 データの出所で分ける", pages };
})();
