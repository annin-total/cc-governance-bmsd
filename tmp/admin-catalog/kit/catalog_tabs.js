"use strict";
// 目録のタブ（concepts.md の 2.3）。id はそのまま DOM の id とカードの開く先になる。
// long: 12 か月の扱い（未指定は「出しません」・"same"・差し替え）。longOnly: 12 か月だけに出す。
(() => {
  const { L } = window.KIT;
  const { SAME } = window.CATALOG;
  const chipsOf = (terms) => Object.entries(terms).map(([id, v]) => (Array.isArray(v) ? { id, label: v[1], tone: v[0] } : { id, label: v }));
  const BAR = (key, den) => ({ key, kind: "bar", label: "", sort: null, den });
  const PERIOD_CHIPS = [{ id: "recent", label: L.RECENT }, { id: "prev", label: L.PREV }];
  const USER = { key: "email", kind: "user", label: "利用者" };
  const SECTION = { key: "section", kind: "section", label: "課" }; // 利用者ごとのタブは課の列と部の絞り込み（dept: true）を持つ
  const WEEK = { key: "day", kind: "week", label: "週の始まり" };
  const PROVIDERS = { key: "providers", kind: "usd", each: "cost[providers]", terms: L.PROVIDER };
  const STATE_CHIPS = [{ id: "ng", label: L.STATE.ng, tone: "ng" }, { id: "warn", label: L.STATE.warn, tone: "warn" }];
  const STATE = { key: "state", kind: "state", sort: "state_rank", label: "状態", quiet: true };
  const BIN = { key: "bin", kind: "bin", label: "トークン数の区間" };
  const SIZE_NOTE = "セッションごとに、応答終了（Stop）の記録のコンテキストのトークン数の最大を 1 つ数えます。応答終了の記録が無いセッションは数えません。";

  const T = {
    // ---- 利用（記録）----
    daily_use: { id: "daily_use", label: "日ごとの利用", hint: "直近 {period[span]} 日 · 記録", title: "日ごとの利用者・セッション・指示", unit: "日",
      scope: "直近 {period[span]} 日 · 日ごと · 濃い色が直近 {period[days]} 日 · 全員の合計", rows: "x[daily]", sort: ["day", "desc"],
      cols: [{ key: "day", kind: "date", label: "日付" }, { key: "period", kind: "tag", terms: L.PERIOD, label: "期間" },
        { key: "users", kind: "num", unit: "person", label: "利用者" }, { key: "sessions", kind: "num", unit: "item", label: "セッション" },
        { key: "prompts", kind: "num", unit: "item", label: "指示" }, BAR("prompts")],
      chipsBy: "period", chips: PERIOD_CHIPS, chart: { kind: "bars", key: "day", panels: [{ title: "利用者", field: "users" }, { title: "指示", field: "prompts" }] } },
    user_use: { id: "user_use", label: "利用者ごとの頻度", hint: "{x[active][users]:num} 人 · 記録", title: "利用者ごとの頻度とセッション", unit: "人",
      scope: "直近 {period[days]} 日 · 記録を送った利用者 · 利用日数の多い順 · 差と増減率は前の {period[days]} 日と比べた指示 · セッションの大きさはセッションごとの最大の中央",
      dept: true, search: "利用者で絞り込み", q: "{email}", rows: "x[activity]", sort: ["active_days", "desc"],
      cols: [USER, SECTION, { key: "active_days", kind: "num", unit: "day", label: "利用日数" }, { key: "sessions", kind: "num", label: "セッション" },
        { key: "prompts", kind: "num", label: "指示" }, { key: "prompts_diff", kind: "diff", label: "前との差" }, { key: "prompts_change", kind: "pct_change", label: "増減率" },
        { key: "session_size", kind: "tok", label: "セッションの大きさ" }, { key: "auto_share", kind: "pct", label: "自動コンパクトに達した割合" },
        { key: "bypass_rate", kind: "pct", label: "確認なしの記録" }, { key: "last_day", kind: "day", label: "最終日" }] },
    // ---- 呼び出し（記録）----
    user_calls: { id: "user_calls", label: "利用者ごとの呼び出し", hint: "{x[active][users]:num} 人 · 記録", title: "利用者ごとの呼び出し", unit: "人",
      scope: "直近 {period[days]} 日 · 記録を送った利用者 · よく使うものは回数の多い 3 つ", dept: true, search: "利用者・名前で絞り込み",
      q: "{email} {skills_top_text} {commands_top_text} {externals_top_text}", rows: "x[activity]", sort: ["skill_calls", "desc"],
      cols: [USER, SECTION, { key: "skill_calls", kind: "num", label: "スキル" }, { key: "skills_top", kind: "tops", label: "よく使うスキル", sort: null },
        { key: "command_calls", kind: "num", label: "コマンド" }, { key: "commands_top", kind: "tops", label: "よく使うコマンド", sort: null },
        { key: "external_calls", kind: "num", label: "外部ツール" }, { key: "externals_top", kind: "tops", label: "よく使う外部ツール", sort: null },
        { key: "agent_launches", kind: "num", label: "サブエージェントの起動" }] },
    calls: { id: "calls", label: "呼び出し先", hint: "{r3[calls]:count} 行 · 記録", title: "呼び出し先ごとの回数と利用者数", unit: "行",
      scope: "直近 {period[days]} 日と前の {period[days]} 日 · コマンドは定義元ごと · MCP はサーバごと · WebSearch・WebFetch はそのまま",
      search: "名前で絞り込み", q: "{name} {source}", rows: "r3[calls]", sort: ["recent_calls", "desc"],
      note: "組み込みのツール（Read・Edit・Bash など）とサブエージェントの起動は含みません。差は直近から前の {period[days]} 日を引いた値です。",
      cols: [{ key: "kind", kind: "tag", terms: L.CALL_KIND, label: "種類" }, { key: "name", kind: "code", label: "名前" }, { key: "source", kind: "code", label: "定義元" },
        { key: "recent_calls", kind: "num", unit: "times", label: "呼び出し回数" }, BAR("recent_calls"), { key: "prev_calls", kind: "num_sub", label: L.PREV },
        { key: "calls_diff", kind: "diff", label: "差" }, { key: "recent_users", kind: "num", unit: "person", label: "利用者数" }, { key: "users_diff", kind: "diff", label: "利用者の差" }],
      chipsBy: "tags", chips: [...chipsOf(L.CALL_KIND), { id: "up", label: L.TREND.up }, { id: "down", label: L.TREND.down }] },
    // ---- セッション（記録）----
    session_size: { id: "session_size", label: "セッションの大きさ", hint: "{size[sessions]:num} セッション · 記録", title: "セッションの大きさの分布", unit: "区間",
      scope: "直近 {period[days]} 日と前の {period[days]} 日 · セッションごとの最大 · 区間の幅 {CONTEXT_BIN:tok} トークン · 割合は各期間のセッションのうち",
      note: SIZE_NOTE + "自動コンパクトのしきい値の近くに山があれば、溜めてから自動コンパクトに頼る使い方が多いことを示します。", rows: "size[dist]",
      cols: [BIN, { key: "prev", kind: "num", label: "前のセッション" }, { key: "prev_share", kind: "pct", label: "前の割合" },
        { key: "recent", kind: "num", label: "直近のセッション" }, { key: "recent_share", kind: "pct_strong", label: "直近の割合" }],
      chart: { kind: "hist", key: "bin", sides: ["prev", "recent"], terms: L.PERIOD } },
    usage_modes: { id: "usage_modes", label: "使われ方", hint: "直近 {period[days]} 日 · 記録", title: "権限モード・effort・セッションの開始", unit: "行",
      scope: "直近 {period[days]} 日 · 記録の件数（開始のしかたはセッション開始の記録）· 割合は区分の中での割合", rows: "usage",
      cols: [{ key: "field", kind: "tag", terms: L.USAGE_FIELD, label: "区分" }, { key: "value", kind: "term", terms: L.USAGE_VALUE, by: "field", label: "値" },
        { key: "count", kind: "num", label: "件数" }, { key: "share", kind: "pct", label: "割合" }, BAR("share", "100")],
      chipsBy: "field", chips: chipsOf(L.USAGE_FIELD) },
    // ---- コスト（利用明細）----
    user_cost: { id: "user_cost", label: "利用者ごとのコスト", hint: "{x[cost][users]:num} 人 · 利用明細", title: "利用者ごとのコストと順位", unit: "人",
      scope: "利用明細 {x[cost][start]:md}〜{x[cost][end]:md} と前の {period[days]} 日 · コストの多い順 · 割合と累積は期間のコストのうち · 状態は期間の基準の判定（基準を超えた利用者と同じ）",
      dept: true, search: "利用者で絞り込み", q: "{email}", rows: "x[billed]", sort: ["cost", "desc"],
      cols: [STATE, { key: "rank", kind: "rank", label: "順位" }, USER, SECTION, { key: "cost", kind: "usd_strong", label: "コスト" },
        { key: "cost_prev", kind: "usd_sub", label: "前の期間" }, { key: "cost_diff", kind: "usd", label: "前との差" }, { key: "cost_change", kind: "pct_change", label: "増減率" },
        { key: "share", kind: "pct", label: "コストに占める割合" }, { key: "cum_share", kind: "pct", label: "累積" },
        { key: "days", kind: "num", unit: "day", label: "コストのあった日数" }, { key: "per_day", kind: "usd", label: "1 日あたり" },
        { key: "top_model", kind: "model", label: "主なモデル" }, { key: "cache_share", kind: "pct", label: "キャッシュ読み" }],
      chipsBy: "tags", chips: [...STATE_CHIPS, ...chipsOf(L.MODEL)],
      long: { id: "user_cost", label: "利用者ごとのコスト", hint: "{x[cost][users]:num} 人 · 利用明細", title: "利用者ごとのコストと順位", unit: "人",
        scope: "利用明細 {x[cost][start]:day}〜{x[cost][end]:day} · コストの多い順 · 割合と累積は期間のコストのうち",
        dept: true, search: "利用者で絞り込み", q: "{email}", rows: "x[billed]", sort: ["cost", "desc"],
        cols: [{ key: "rank", kind: "rank", label: "順位" }, USER, SECTION, { key: "cost", kind: "usd_strong", label: "コスト" },
          { key: "share", kind: "pct", label: "コストに占める割合" }, { key: "cum_share", kind: "pct", label: "累積" },
          { key: "days", kind: "num", unit: "day", label: "コストのあった日数" }, { key: "per_day", kind: "usd", label: "1 日あたり" },
          { key: "top_model", kind: "model", label: "主なモデル" }, { key: "cache_share", kind: "pct", label: "キャッシュ読み" }],
        chipsBy: "tags", chips: chipsOf(L.MODEL) } },
    // 行は利用者 × 基準（7 日＝日次・週次、28 日＝月次）。基準で絞ると、その基準のカードの人数と合う
    over_users: { id: "over_users", label: "基準を超えた利用者", hint: "{r3[over][row_users]:num} 人 · 利用明細", title: "基準を超えた利用者", unit: "行",
      scope: "利用明細 {r3[cost][start]:md}〜{r3[cost][end]:md} と前の {period[days]} 日（{r3[cost][prev_start]:md}〜{r3[cost][prev_end]:md}）· 今か前に注意以上だった人 · 基準ごとに 1 行",
      dept: true, search: "利用者で絞り込み", q: "{email}", rows: "r3[over][rows]", sort: ["span_rank", "asc"],
      note: "日次は期間のいずれかの 1 日（金額はその日の値と日付）、週次は 7 日の合計、月次は 28 日の合計で判定します。基準は 日次 ${USER_COST_ELEVATED[day]}・${USER_COST_HIGH[day]}、"
        + "週次 ${USER_COST_ELEVATED[week]}・${USER_COST_HIGH[week]}、月次 ${USER_COST_ELEVATED[month]}・${USER_COST_HIGH[month]}（注意・要確認、USD）。ちょうどの金額は該当します。",
      cols: [{ key: "span", kind: "tag", terms: L.OVER_SPAN, sort: "span_rank", label: "基準" },
        { key: "prev_state", kind: "state", sort: null, label: "前の状態", quiet: true }, { key: "state", kind: "state", sort: "rank", label: "今の状態", quiet: true },
        { key: "kind", kind: "tag", terms: L.OVER_KIND, label: "区分" }, USER, SECTION, { key: "value", kind: "usd_day", at: "value_at", label: "金額" }],
      chipsBy: "tags", chips: [...Object.entries(L.OVER_SPAN).map(([id, label]) => ({ id, label, only: [id === "month" ? "28" : "7"] })), ...STATE_CHIPS, ...chipsOf(L.OVER_KIND)] },
    cost_daily: { id: "cost_daily", label: "日ごとのコスト", hint: "直近 {period[span]} 日 · 利用明細", title: "日ごとのコスト", unit: "日",
      scope: "利用明細 {cost[spark_start]:md}〜{cost[end]:md} · 日 × 提供元（USD）· 濃い地が直近 {period[days]} 日",
      search: "日付（例: 09-2）", q: "{day:day}", rows: "cost[days]", sort: ["day", "desc"],
      cols: [{ key: "day", kind: "date", label: "日付" }, PROVIDERS, { key: "total", kind: "usd_strong", label: "合計" }, BAR("total")],
      chipsBy: "period", chips: PERIOD_CHIPS,
      chart: { kind: "stacked", key: "day", series: "cost[providers]", seriesField: "providers", terms: L.PROVIDER, shade: true, fmt: "usd", legend: [L.COST_SHADE] },
      long: { id: "cost_weeks", label: "週ごとのコスト", hint: "{cost[weeks]:count} 週 · 利用明細", title: "週ごとのコスト", unit: "週",
        scope: "利用明細 {cost[start]:day}〜{cost[end]:day} · 週 × 提供元（USD）", note: "月の合計は暦月で数えるため、週の区切りとは合いません。",
        rows: "cost[weeks]", sort: ["day", "desc"], cols: [WEEK, PROVIDERS, { key: "total", kind: "usd_strong", label: "合計" }, BAR("total")],
        chart: { kind: "stacked", key: "day", series: "cost[providers]", seriesField: "providers", terms: L.PROVIDER, fmt: "usd",
          months: { src: "cost[months]", value: "total" }, legend: ["薄い棒は途中の週 · 軸の下の行は暦月の合計"] } } },
    models: { id: "models", label: "モデル", hint: "{x[models]:count} 種類 · 利用明細", title: "モデルごとのコストとトークン", unit: "行",
      scope: "利用明細 {x[cost][start]:day}〜{x[cost][end]:day} · 割合は期間のコストのうち", rows: "x[models]", sort: ["cost", "desc"],
      cols: [{ key: "key", kind: "model", label: "モデル" }, { key: "cost", kind: "usd_strong", label: "コスト" }, { key: "share", kind: "pct", label: "割合" }, BAR("share", "100"),
        { key: "prev", kind: "usd_sub", label: "前の期間" }, { key: "diff", kind: "usd", label: "差" }, { key: "users", kind: "num", unit: "person", label: "利用者" },
        { key: "tokens", kind: "tok", label: "トークン" }, { key: "cache_read", kind: "tok", label: "キャッシュ読み" }, { key: "per_mtok", kind: "usd", label: "100 万トークンあたり" }],
      long: SAME },
    months: { id: "months", label: "月ごとの推移", hint: "暦月 · 利用明細", title: "月ごとのコストと利用者", unit: "月", longOnly: true,
      scope: "利用明細 · 暦月 · モデルごとに積み上げ", rows: "x[months]", sort: ["day", "desc"],
      cols: [{ key: "day", kind: "ym", label: "月" }, { key: "cost", kind: "usd_strong", label: "コスト" }, BAR("cost"), { key: "users", kind: "num", unit: "person", label: "利用者" },
        { key: "per_user", kind: "usd", label: "1 人あたり" }, { key: "new_users", kind: "num", unit: "person", label: "使い始めた人" }],
      chart: { kind: "stacked", key: "day", tick: "{day:ym}", series: "x[model_keys]", seriesField: "models", terms: L.MODEL, fmt: "usd" }, long: SAME },
    month: { id: "month", label: "今月のコスト", hint: "{month[month]:mon} 月 · {month[elapsed]:num} / {month[business_days]:num} 営業日",
      title: "今月のコストの累積と月末の見込み", unit: "日", scope: "{month[month]:ym} · 利用明細 · {month[as_of]:asof}",
      note: "見込みは実績 × 月の営業日数 ÷ 経過した営業日数です（{month[actual]:usd} × {month[business_days]:num} ÷ {month[elapsed]:num}）。"
        + "営業日は平日から国民の祝日と会社の休日を除いた日です。経過が {FORECAST_MIN_BUSINESS_DAYS} 営業日未満のあいだは見込みを出しません（仮の基準）。",
      rows: "month[rows]",
      cols: [{ key: "day", kind: "mday", label: "日付", sort: null }, { key: "n", kind: "num", label: "営業日", sort: null },
        { key: "cost", kind: "usd", label: "その日のコスト", sort: null }, BAR("cost", "top"),
        { key: "cum", kind: "cum", label: "今月の累積", sort: null }, { key: "prev", kind: "usd_sub", label: "前月（{month[prev_month]:mon} 月）の累積", sort: null }],
      chipsBy: "mode", chips: [{ id: "bd", label: "営業日" }, { id: "cal", label: "暦日" }], chipsAll: false,
      chart: { kind: "month", key: "link", src: "month",
        legend: ["今月の実績 {month[actual]:usd}", "月末までの見込み {month[forecast]:usd}", "前月（{month[prev_month]:mon} 月）{month[prev_actual]:usd}"],
        axis: { bd: "横軸は営業日（休日の分は次の営業日に含める）", cal: "横軸は暦日（前月は同じ日付に重ねる）" }, off: "{month[month]:mon} 月の週末・祝日・会社の休日" },
      long: SAME },
  };

  window.CATALOG = Object.assign(window.CATALOG || {}, { T, chipsOf, BAR, USER, SECTION });
})();
