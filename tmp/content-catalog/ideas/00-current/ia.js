"use strict";
// 案 00: 今の構成（server 4555c06 の screens/*.py・words.py・settings.html を定義に写したもの）。
(() => {
  const { L } = window.KIT;
  const SAME = "same";
  const chipsOf = (terms) => Object.entries(terms).map(([id, v]) => (Array.isArray(v) ? { id, label: v[1], tone: v[0] } : { id, label: v }));
  const PERIOD_CHIPS = [{ id: "recent", label: L.RECENT }, { id: "prev", label: L.PREV }];
  const TREND_CAP = ["{trend[start]:md}", "濃い部分が直近 {period[days]} 日", "{trend[end]:md}"];
  const WEEKS_CAP = ["{cost[start]:ym}", "完了した週ごと"];
  const WEEK = { key: "day", kind: "week", label: "週の始まり" };
  const PROVIDERS = { key: "providers", kind: "usd", each: "cost[providers]", terms: L.PROVIDER };
  const COST_SPARK = { kind: "spark", src: "cost[spark]", field: "total", fmt: "usd" };
  const BAR = (key, den) => ({ key, kind: "bar", label: "", sort: null, den });

  const overview = {
    id: "overview", title: "概況", lead: "全体の利用量と、データの届き具合", periods: true,
    groups: [
      {
        id: "use", label: "利用", scope: "直近 {period[days]} 日と、その前の {period[days]} 日",
        longScope: "直近 {period[months]} か月（{cost[start]:day}〜{cost[end]:day}）· 週ごと · 利用明細の項目だけ",
        cards: [
          { label: "送信した利用者", unit: "人", tab: "daily", value: "{users[recent]:num}", delta: "{users[delta]:signed}",
            sub: "前の {period[days]} 日 {users[prev]:num} 人", viz: { kind: "spark", src: "trend[rows]", field: "users" }, cap: TREND_CAP,
            long: { label: "利用明細にいた利用者", unit: "人", tab: "weeks_users", value: "{cost_users[total]:num}",
              sub: "直近の週（{cost_users[last_start]:md}〜{cost_users[last_end]:md}）{cost_users[last_users]:num} 人",
              viz: { kind: "spark", src: "cost_users[spark]", field: "users" }, cap: [...WEEKS_CAP, "{cost_users[last_end]:md}"] } },
          { label: "1 日あたりのセッション", unit: "件", tab: "daily", value: "{sessions[recent]:dec1}", delta: "{sessions[delta]:signed1}",
            sub: "前の {period[days]} 日 {sessions[prev]:dec1} 件", viz: { kind: "spark", src: "trend[rows]", field: "sessions" }, cap: TREND_CAP },
          { label: "コスト（利用明細）", tab: "cost", value: "{cost[recent]:usd}", delta: "{cost[change]:signed_pct}",
            sub: "前の {period[days]} 日 {cost[prev]:usd}", viz: COST_SPARK,
            cap: ["{cost[spark_start]:md}", "{cost[start]:md}〜{cost[end]:md} の合計", "{cost[end]:md}"],
            long: { label: "コスト（利用明細）", tab: "weeks_cost", value: "{cost[recent]:usd}", sub: "月平均 {cost[monthly]:usd} · 前の期間と比べない",
              viz: COST_SPARK, cap: [...WEEKS_CAP, "{cost[last_end]:md}"] } },
          { label: "月末のコスト見込み（{month[month]:mon} 月）", tab: "month", value: "{month[forecast]:usd}",
            viz: { kind: "forecast", src: "month", stats: [["営業日あたり", "per_bd"], ["1 人 1 営業日あたり", "per_user"]] },
            cap: ["実績 {month[actual]:usd} · {month[elapsed]:num} / {month[business_days]:num} 営業日", "{month[as_of]:asof}"],
            empty: "month[as_of]", capEmpty: ["今月（{month[month]:mon} 月）の利用明細はまだありません"], long: SAME },
          { label: "確認なしモードの記録", unit: "%", tab: "modes", value: "{bypass[rate]:dec1}", sub: "{bypass[numerator]:num} 件 / 全 {bypass[denominator]:num} 件",
            viz: { kind: "meter", src: "bypass[numerator]", den: "bypass[denominator]" }, cap: ["権限モード「確認なし」の割合"] },
        ],
      },
      {
        id: "data", label: "データの届き具合", scope: "直近 {period[days]} 日と、その前の {period[days]} 日（照合率は利用明細の最終日までの {period[days]} 日）",
        cards: [
          { label: "受信した記録", unit: "件", tab: "health", value: "{events[recent]:num}", delta: "{events[delta]:signed}",
            sub: "前の {period[days]} 日 {events[prev]:num} 件", viz: { kind: "pair", src: "events", terms: L.PAIR } },
          { label: "CSV との照合率", unit: "%", tab: "health", value: "{reconciliation[rate]:dec1}",
            sub: "CSV にもいた {reconciliation[numerator]:num} 人 / 送信した {reconciliation[denominator]:num} 人",
            viz: { kind: "meter", src: "reconciliation[numerator]", den: "reconciliation[denominator]" }, cap: ["前との比較なし"] },
          { label: "プラグインのエラー", unit: "件", tab: "errors", value: "{errors[total]:num}", state: "errors[state]", sub: "{errors[kinds]:num} 種類 · 前との比較なし",
            viz: { kind: "stack", src: "errors[stages]", tone: "warn", terms: L.STAGE } },
          { label: "項目の欠け（最大）", unit: "%", tab: "health", chip: "null", value: "{nulls[rate]:dec1}", state: "nulls[state]",
            sub: "{nulls[key]:field} · {nulls[ok]:num} / {nulls[total]:num} 項目が正常",
            viz: { kind: "rates", src: "nulls[fields]", field: "rate", terms: L.HEALTH_ITEM, right: ["{rate:pct}"] } },
        ],
      },
    ],
    tabs: [
      { id: "daily", label: "日ごとの利用", hint: "直近 {period[span]} 日", title: "日ごとの利用者数とセッション数", unit: "日",
        scope: "直近 {period[span]} 日 · 日ごと · 濃い色が直近 {period[days]} 日", rows: "trend[rows]", sort: ["day", "desc"],
        cols: [{ key: "day", kind: "date", label: "日付" }, { key: "period", kind: "tag", terms: L.PERIOD, label: "期間" },
          { key: "users", kind: "num", unit: "person", label: "利用者数" }, { key: "sessions", kind: "num", unit: "item", label: "セッション数" },
          { key: "sessions", kind: "bar", label: "セッション数の比較", sort: null }],
        chipsBy: "period", chips: PERIOD_CHIPS,
        chart: { kind: "bars", key: "day", panels: [{ title: "利用者数", field: "users" }, { title: "セッション数", field: "sessions" }] },
        long: { id: "weeks_users", label: "週ごとの利用者", hint: "{cost_users[weeks]:count} 週 · 利用明細", title: "週ごとの利用者数（利用明細）", unit: "週",
          scope: "{cost_users[start]:day}〜{cost_users[end]:day} · 月曜始まりの週 · セッション数は記録から数えるため出しません",
          note: "週の人数は、その週に利用明細にコストがあった人数です。月の人数は週の人数の合計ではありません。",
          rows: "cost_users[weeks]", sort: ["day", "desc"],
          cols: [WEEK, { key: "users", kind: "num", unit: "person", label: "利用者数" }, BAR("users")],
          chart: { kind: "stacked", key: "day", fields: [{ field: "users", label: "利用者数" }], fmt: "num",
            months: { src: "cost_users[months]", value: "users" }, legend: ["軸の下の行は暦月の利用者数（月の中の重複なし）"] } } },
      { id: "cost", label: "日ごとのコスト", hint: "直近 {period[span]} 日 · 利用明細", title: "日ごとのコスト", unit: "日",
        scope: "利用明細（CSV）{cost[spark_start]:md}〜{cost[end]:md} · 日 × 提供元（USD）· 濃い地が直近 {period[days]} 日",
        search: "日付（例: 09-2）", q: "{day:day}", rows: "cost[days]", sort: ["day", "desc"],
        cols: [{ key: "day", kind: "date", label: "日付" }, PROVIDERS, { key: "total", kind: "usd_strong", label: "合計" }, BAR("total")],
        chipsBy: "period", chips: PERIOD_CHIPS,
        chart: { kind: "stacked", key: "day", series: "cost[providers]", seriesField: "providers", terms: L.PROVIDER, shade: true, fmt: "usd", legend: [L.COST_SHADE] },
        long: { id: "weeks_cost", label: "週ごとのコスト", hint: "{cost[weeks]:count} 週 · 利用明細", title: "週ごとのコスト", unit: "週",
          scope: "利用明細（CSV）{cost[start]:day}〜{cost[end]:day} · 週 × 提供元（USD）", note: "月の合計は暦月で数えるため、週の区切りとは合いません。",
          rows: "cost[weeks]", sort: ["day", "desc"], cols: [WEEK, PROVIDERS, { key: "total", kind: "usd_strong", label: "合計" }, BAR("total")],
          chart: { kind: "stacked", key: "day", series: "cost[providers]", seriesField: "providers", terms: L.PROVIDER, fmt: "usd",
            months: { src: "cost[months]", value: "total" }, legend: ["薄い棒は途中の週 · 軸の下の行は暦月の合計"] } } },
      { id: "month", label: "今月のコスト", hint: "{month[month]:mon} 月 · {month[elapsed]:num} / {month[business_days]:num} 営業日",
        title: "今月のコストの累積と月末の見込み", unit: "日", scope: "{month[month]:ym} · 利用明細（CSV）· {month[as_of]:asof}",
        note: "見込みは実績 × 月の営業日数 ÷ 経過した営業日数です（{month[actual]:usd} × {month[business_days]:num} ÷ {month[elapsed]:num}）。"
          + "営業日は平日から国民の祝日と会社の休日を除いた日です。見込みの累積は残りの営業日に置いています。"
          + "1 人 1 営業日あたりは、営業日あたりをその月に利用明細でコストがあった利用者"
          + "（{month[month]:mon} 月 {month[users]:num} 人・{month[prev_month]:mon} 月 {month[prev_users]:num} 人）で割った値です。"
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
      { id: "modes", label: "使われ方", hint: "直近 {period[days]} 日 · 記録", title: "使われ方", unit: "行",
        scope: "直近 {period[days]} 日 · 記録の件数（開始のしかたはセッション開始の記録）· 割合は区分の中での割合", rows: "usage",
        cols: [{ key: "field", kind: "tag", terms: L.USAGE_FIELD, label: "区分" }, { key: "value", kind: "term", terms: L.USAGE_VALUE, by: "field", label: "値" },
          { key: "count", kind: "num", label: "件数" }, { key: "share", kind: "pct", label: "割合" }, BAR("share", "100")],
        chipsBy: "field", chips: chipsOf(L.USAGE_FIELD) },
      { id: "health", label: "受信と項目の欠け", hint: "直近 {period[days]} 日と前の {period[days]} 日", title: "受信と項目の欠け", unit: "行",
        scope: "直近 {period[days]} 日と前の {period[days]} 日 · 欠けの分母は、その項目が送られるはずの記録",
        note: "欠けは {NULL_RATE_ELEVATED}% 以下を正常、{NULL_RATE_ELEVATED}% 超を注意、{NULL_RATE_HIGH}% 超を要確認とします（仮の基準）。100% に跳ねたら上流の仕様変更を疑います。",
        rows: "health",
        cols: [{ key: "group", kind: "tag", terms: L.HEALTH_GROUP, label: "区分", sort: null }, { key: "item", kind: "term", terms: L.HEALTH_ITEM, label: "項目", sort: null },
          { key: "now", kind: "measure", label: L.RECENT, sort: null }, { key: "prev", kind: "measure_sub", label: L.PREV, sort: null },
          { key: "diff", kind: "diff", label: "差", sort: null }, { key: "state", kind: "state", label: "状態", sort: null }],
        chipsBy: "group", chips: chipsOf(L.HEALTH_GROUP) },
      { id: "errors", label: "プラグインのエラー", hint: "直近 {period[days]} 日 · {errors[total]:num} 件", title: "プラグインのエラー", unit: "行",
        scope: "直近 {period[days]} 日 · 端末 = 利用者とホスト名の組 · 失った記録は戻りません", search: "エラーの種類・版", q: "{error_type} {version} {stage}",
        rows: "errors[rows]", sort: ["count", "desc"],
        cols: [{ key: "stage", kind: "stage", terms: L.STAGE, label: "処理段階" }, { key: "error_type", kind: "code", label: "エラーの種類" },
          { key: "count", kind: "num", label: "件数" }, { key: "terminals", kind: "num", unit: "terminal", label: "端末数" }, { key: "version", kind: "code", label: "最後に起きた版" }],
        chipsBy: "stage", chipTerms: L.STAGE },
    ],
  };

  const policy = {
    id: "policy", title: "設定の適用状況", lead: "配布した設定が各端末で有効になっているか", data: "fixed.policy",
    groups: [
      {
        id: "who", label: "利用者", scope: "直近 {POLICY_DAYS} 日 · 対象は{basis:basis} {denominator:num} 人",
        cards: [
          { label: "すべての設定を適用", unit: "人", tab: "users", chip: "ok", value: "{counts[ok]:num}", sub: "対象 {denominator:num} 人のうち {counts[ok_rate]:pct}",
            viz: { kind: "meter", src: "counts[ok]", den: "denominator", tone: "ok" }, cap: ["{counts[items]:num} つの設定がすべて配布した値"] },
          { label: "未適用のある利用者", unit: "人", tab: "users", chip: "off", value: "{counts[off]:num}", state: "states[off]",
            sub: "端末 {counts[off_terminals]:num} 台 · 違う値か未設定", viz: { kind: "meter", src: "counts[off]", den: "denominator", tone: "ng" }, cap: ["対象 {denominator:num} 人のうち"] },
          { label: "プラグイン未導入", unit: "人", tab: "users", chip: "none", value: "{counts[none]:num}", state: "states[none]",
            sub: "コストがあるのに報告が無い", viz: { kind: "meter", src: "counts[none]", den: "denominator", tone: "warn" }, cap: ["対象 {denominator:num} 人のうち"] },
          { label: "報告が止まった端末", unit: "台", tab: "terminals", chip: "stale", value: "{counts[stale_terminals]:num}",
            sub: "{counts[stale_users]:num} 人 · 最後の報告から {STALE_DAYS} 日以上",
            viz: { kind: "meter", src: "counts[stale_terminals]", den: "counts[terminals]", tone: "neutral" }, cap: ["全 {counts[terminals]:num} 台のうち"] },
        ],
      },
      {
        id: "set", label: "設定と更新", scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件",
        cards: [
          { label: "設定ごとの適用率", tab: "settings", wide: true, sub: "最も低いのは {lowest:setting}",
            viz: { kind: "rates", src: "items", field: "rate", terms: L.SETTING, right: ["{numerator:num} / {denominator:num} 人", "{rate:pct}"] } },
          { label: "プラグインが最新版の端末", unit: "台", tab: "versions", chip: "plugin", value: "{plugin[latest_count]:num}",
            sub: "最新 {plugin[latest]} · 全 {plugin[total]:num} 台", viz: { kind: "stack", src: "plugin[parts]", tone: "accent" } },
          { label: "本体が最新版の端末", unit: "台", tab: "versions", chip: "core", value: "{core[latest_count]:num}",
            sub: "最新 {core[latest]} · 全 {core[total]:num} 台", viz: { kind: "stack", src: "core[parts]", tone: "accent" } },
        ],
      },
    ],
    tabs: [
      { id: "users", label: "利用者ごと", hint: "{denominator:num} 人", title: "利用者ごとの適用状況", unit: "人", scope: "対象 {denominator:num} 人",
        search: "利用者で絞り込み", q: "{email}", rows: "users", sort: ["rank", "asc"],
        note: "1 台でも違う値の端末があれば、その利用者は未適用と数えます。このため台数と人数は一致しません。{basis:basis_note}",
        cols: [{ key: "status", kind: "user_state", sort: "rank", label: "状態" }, { key: "email", kind: "user", label: "利用者" },
          { key: "terminals", kind: "dash_num", label: "端末" }, { key: "on", kind: "dot", each: "items", terms: L.SETTING },
          { key: "day", kind: "last_day", label: "最終報告日" }],
        chipsBy: "status", chips: chipsOf(L.USER_STATE) },
      { id: "terminals", label: "端末ごと", hint: "{counts[terminals]:num} 台", title: "端末ごとの現在の値", unit: "台",
        scope: "直近 {POLICY_DAYS} 日に設定の報告があった端末 · 端末ごとに最新の報告 1 件", search: "利用者・端末名で絞り込み", q: "{email} {host}",
        note: L.STALE_NOTE, rows: "terminals", sort: ["rank", "asc"],
        cols: [{ key: "status", kind: "terminal_state", sort: "rank", label: "状態" }, { key: "email", kind: "user", label: "利用者" },
          { key: "host", kind: "code", label: "端末名" }, { key: "value", kind: "value", label: L.SETTING["env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"][0] },
          { key: "off_keys", kind: "off_keys", label: "未適用の設定" }, { key: "day", kind: "last_day", label: "最終報告日" }],
        chipsBy: "tags", chips: chipsOf(L.TERMINAL_STATE) },
      { id: "settings", label: "設定ごと", hint: "{counts[items]:num} 設定", title: "設定ごとの適用率", unit: "行",
        scope: "直近 {POLICY_DAYS} 日 · 分母は{basis:basis}利用者 {denominator:num} 人", search: "設定名・キーで絞り込み", q: "{key:setting} {key}",
        note: "{basis:basis_note}", rows: "items", sort: ["rate", "asc"],
        cols: [{ key: "key", kind: "setting", terms: L.SETTING, label: "設定" }, { key: "numerator", kind: "ratio", label: "適用済み / 対象" },
          { key: "rate", kind: "pct_strong", label: "適用率" }, BAR("rate", "100"), { key: "off_terminals", kind: "num", unit: "terminal", label: "未適用の端末" }] },
      { id: "versions", label: "バージョン", hint: "プラグイン・本体", title: "バージョンの分布", unit: "行",
        scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件 · 古い版が残るのは更新が届いていない端末", rows: "versions",
        cols: [{ key: "kind", kind: "tag", terms: L.VERSION_KIND, label: "種類" }, { key: "version", kind: "version", sort: "order", label: "バージョン" },
          { key: "count", kind: "count_of", label: "端末数" }, BAR("count", "total")],
        chipsBy: "kind", chips: chipsOf(L.VERSION_KIND) },
    ],
  };

  const HIST_SCOPE = " · 前後 {EVENT_STUDY_SPAN} 日 · 区間の幅 {CONTEXT_BIN:tok} トークン · 割合は各期間の中の割合";
  const HIST_NOTE = "両方の期間で 0 件の区間は出しません。しきい値が効いていれば、適用後は小さい区間に寄ります。";
  const HIST_COLS = [{ key: "bin", kind: "bin", label: "トークン数の区間" }, { key: "before", kind: "num", label: "適用前の件数" },
    { key: "before_share", kind: "pct", label: "適用前の割合" }, { key: "after", kind: "num", label: "適用後の件数" },
    { key: "after_share", kind: "pct_strong", label: "適用後の割合" }];
  const HIST_CHART = { kind: "hist", key: "bin", sides: ["before", "after"], terms: L.SIDE };
  const histCard = (id, label) => ({ label, unit: "トークン", tab: id, wide: true, value: `{${id}[median][after]:bin}`,
    sub: `適用前 {${id}[median][before]:bin} · 記録 {${id}[total][before]:num} → {${id}[total][after]:num} 件`,
    viz: { kind: "hist", src: `${id}[rows]`, terms: L.SIDE }, cap: ["区間の幅 {CONTEXT_BIN:tok} トークン · 縦は各期間の中の割合"] });
  const histTab = (id, label, title, scope) => ({ id, label, title, unit: "区間", note: HIST_NOTE, scope: scope + HIST_SCOPE,
    hint: `記録 {${id}[total][before]:num} → {${id}[total][after]:num} 件`, rows: `${id}[rows]`, cols: HIST_COLS, chart: HIST_CHART });

  const effect = {
    id: "effect", title: "設定の効果", lead: "設定を守り始めた前後で、コンテキストの大きさとコストを比べる", data: "fixed.effect",
    groups: [
      { id: "work", label: "設定は働いているか", scope: "{REFERENCE_KEY:setting}を {REFERENCE_VALUE} にした前後 {EVENT_STUDY_SPAN} 日 · 前後の境は各利用者が守り始めた日",
        cards: [histCard("precompact", "圧縮直前のコンテキスト（中央の区間）"), histCard("stop", "応答終了時のコンテキスト（中央の区間）")] },
      { id: "spend", label: "コストの前後差", scope: "1 人 1 日あたり · {EFFECT_PROVIDER:provider} · 時期の変動を含むため、前後差を施策の効果と読まない",
        cards: [
          { label: "設定を守り始めた利用者", unit: "人", tab: "study", value: "{adopters:num}", sub: "日ごとの対象者 {study[people_min]:num}〜{study[people_max]:num} 人",
            cap: ["その日が利用明細の期間に入る人だけを数える"] },
          { label: "1 人 1 日あたりのコスト", tab: "study", value: "{study[after][cost]:usd}",
            sub: "適用前 {study[before][cost]:usd} · のべ {study[before][person_days]:num} → {study[after][person_days]:num} 人日",
            viz: { kind: "pair", src: "study", field: "cost", terms: L.SIDE }, cap: ["0 日目（守り始めた当日）を除く"] },
          { label: "1 人 1 日あたりのトークン", unit: "トークン", tab: "study", value: "{study[after][tokens]:tok}", sub: "適用前 {study[before][tokens]:tok}",
            viz: { kind: "pair", src: "study", field: "tokens", terms: L.SIDE }, cap: ["入力とキャッシュの読み書き（出力は含まない）"] },
        ] },
    ],
    tabs: [
      histTab("precompact", "圧縮直前の分布", "圧縮直前のコンテキストの大きさ", "自動圧縮が走る直前（PreCompact）のトークン数"),
      histTab("stop", "応答終了時の分布", "応答終了時のコンテキストの大きさ", "各応答が終わった時点（Stop）のトークン数"),
      { id: "study", label: "日ごとの 1 人あたり", hint: "守り始めた日の前後 {EVENT_STUDY_SPAN} 日", title: "日ごとの 1 人あたりコストとトークン", unit: "日",
        scope: "守り始めた日を 0 日目とした前後 {EVENT_STUDY_SPAN} 日 · {EFFECT_PROVIDER:provider} · トークンは入力とキャッシュの読み書きの合計",
        note: "0 日目（守り始めた当日）は前後が混ざるため除いています。その日が利用明細（CSV）の期間に入る人だけを数えるため、日ごとに人数が変わります。"
          + "時期による変動（繁忙・モデルの切り替えなど）を差し引いていないため、前後差を施策の効果と読まないでください。",
        rows: "study[rows]",
        cols: [{ key: "day", kind: "rel", label: "守り始めてからの日数" }, { key: "side", kind: "tag", terms: L.SIDE, label: "期間" },
          { key: "people", kind: "num", unit: "person", label: "対象者数" }, { key: "tokens", kind: "tok", label: "1 人あたりトークン" },
          { key: "cost", kind: "usd", label: "1 人あたりコスト" }, BAR("cost")],
        chipsBy: "side", chips: chipsOf(L.SIDE) },
    ],
  };

  const USAGE_NOTE = "差は直近から前の {period[days]} 日を引いた値です。増えた・減ったは呼び出し回数の差で分けます。";
  const CALLS = [{ key: "recent_calls", kind: "num", unit: "times", label: "呼び出し回数" }, BAR("recent_calls"),
    { key: "prev_calls", kind: "num_sub", label: L.PREV }, { key: "calls_diff", kind: "diff", label: "差" },
    { key: "recent_users", kind: "num", unit: "person", label: "利用者数" }, { key: "users_diff", kind: "diff", label: "利用者の差" }];
  const callCard = (id, label, cap) => ({ label, unit: "回", tab: id, wide: true, value: `{${id}[recent]:num}`, delta: `{${id}[delta]:signed}`,
    sub: `前の {period[days]} 日 {${id}[prev]:num} 回 · {${id}[kinds]:num} 種類`, cap: [cap],
    viz: { kind: "rates", src: `${id}[top]`, field: "share", right: ["{calls:num} 回", "{share:pct}"] } });

  const assets = {
    id: "assets", title: "スキル・コマンドの利用", lead: "配布したスキルやコマンドが使われているか", periods: true,
    groups: [
      { id: "calls", label: "呼び出し", scope: "直近 {period[days]} 日と、その前の {period[days]} 日",
        cards: [callCard("skills", "スキルの呼び出し", "呼び出しの多い順 · 割合は直近 {period[days]} 日の全呼び出しのうち"),
          callCard("commands", "コマンドの呼び出し", "呼び出しの多い順（定義元をまたいで合計）· 割合は直近 {period[days]} 日の全呼び出しのうち")] },
      { id: "agent", label: "サブエージェント", scope: "直近 {period[days]} 日 · 分母は全記録",
        cards: [{ label: "サブエージェントの中の記録", unit: "%", tab: "agent", value: "{agent[rate]:dec1}", sub: "{agent[numerator]:num} 件 / 全 {agent[denominator]:num} 件",
          viz: { kind: "meter", src: "agent[numerator]", den: "agent[denominator]" }, cap: ["サブエージェントの中で起きた記録の割合"] }] },
    ],
    tabs: [
      { id: "skills", label: "スキル", hint: "{skills[kinds]:num} 種類 · {skills[recent]:num} 回", title: "スキルごとの呼び出し回数と利用者数", unit: "行",
        scope: "直近 {period[days]} 日と前の {period[days]} 日 · スキルの呼び出しの記録", search: "スキル名で絞り込み", q: "{name}", note: USAGE_NOTE,
        rows: "skills[rows]", sort: ["recent_calls", "desc"], cols: [{ key: "name", kind: "code", label: "スキル" }, ...CALLS],
        chipsBy: "trend", chips: chipsOf(L.TREND) },
      { id: "commands", label: "コマンド", hint: "{commands[kinds]:num} 種類 · {commands[recent]:num} 回", title: "コマンドごとの呼び出し回数と利用者数", unit: "行",
        scope: "直近 {period[days]} 日と前の {period[days]} 日 · コマンドの呼び出しの記録 · 定義元は記録された値のまま",
        search: "コマンド名・定義元で絞り込み", q: "{name} {source}", note: "同じコマンドでも定義元が違えば別の行です。" + USAGE_NOTE,
        rows: "commands[rows]", sort: ["recent_calls", "desc"],
        cols: [{ key: "name", kind: "code", label: "コマンド" }, { key: "source", kind: "code", label: "定義元" }, ...CALLS],
        chipsBy: "trend", chips: chipsOf(L.TREND) },
      { id: "agent", label: "サブエージェント", hint: "直近 {period[days]} 日 · {agent[rate]:pct}", title: "サブエージェントの利用", unit: "行",
        scope: "直近 {period[days]} 日 · 分母は全記録 {agent[denominator]:num} 件", note: "サブエージェントの中で起きた記録にだけ、サブエージェントの識別子が付きます。",
        rows: "agent[rows]",
        cols: [{ key: "kind", kind: "term", terms: L.AGENT, label: "記録" }, { key: "count", kind: "num", unit: "item", label: "件数" },
          { key: "share", kind: "pct_strong", label: "割合" }, BAR("share", "100")] },
    ],
  };

  const settings = {
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

  window.IA = { id: "00-current", name: "案 00 今の構成", pages: [overview, policy, effect, assets, settings] };
})();
