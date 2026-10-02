"use strict";
// 目録のタブの続き（設定の適用状況・設定の効果・収集の状態）。
(() => {
  const { L } = window.KIT;
  const { T, chipsOf, BAR, USER } = window.CATALOG;
  const SIDE_COLS = [{ key: "bin", kind: "bin", label: "トークン数の区間" }, { key: "before", kind: "num", label: "適用前のセッション" },
    { key: "before_share", kind: "pct", label: "適用前の割合" }, { key: "after", kind: "num", label: "適用後のセッション" }, { key: "after_share", kind: "pct_strong", label: "適用後の割合" }];

  Object.assign(T, {
    // ---- 設定の適用状況（30 日・利用者単位）----
    policy_users: { id: "policy_users", label: "利用者ごとの適用状況", hint: "{denominator:num} 人", title: "利用者ごとの適用状況", unit: "人", data: "fixed.r3.policy",
      scope: "対象 {denominator:num} 人 · バージョンと最終報告日は利用者ごとに最も古い・最も遅れたもの", search: "利用者で絞り込み", q: "{email}", rows: "users", sort: ["rank", "asc"],
      note: "端末が複数ある利用者は、1 台でも違う値の端末があれば未適用と数えます。{basis:basis_note}",
      cols: [{ key: "status", kind: "user_state", sort: "rank", label: "状態" }, USER, { key: "on", kind: "dot", each: "items", terms: L.SETTING },
        { key: "core", kind: "code", label: "本体のバージョン" }, { key: "plugin", kind: "code", label: "プラグインのバージョン" }, { key: "day", kind: "last_day", label: "最終報告日" }],
      chipsBy: "tags", chips: chipsOf(L.USER_STATE) },
    policy_settings: { id: "policy_settings", label: "設定ごと", hint: "{items:count} 設定", title: "設定ごとの適用率", unit: "行", data: "fixed.r3.policy",
      scope: "直近 {POLICY_DAYS} 日 · 分母は{basis:basis}利用者 {denominator:num} 人", search: "設定名・キーで絞り込み", q: "{key:setting} {key}",
      note: "{basis:basis_note}", rows: "items", sort: ["rate", "asc"],
      cols: [{ key: "key", kind: "setting", terms: L.SETTING, label: "設定" }, { key: "numerator", kind: "ratio", label: "適用済み / 対象" },
        { key: "rate", kind: "pct_strong", label: "適用率" }, BAR("rate", "100"), { key: "off_users", kind: "num", unit: "person", label: "未適用の利用者" }] },
    versions: { id: "versions", label: "バージョン", hint: "本体・プラグイン", title: "本体とプラグインのバージョンの分布", unit: "行", data: "fixed.r3.policy",
      scope: "直近 {POLICY_DAYS} 日 · 利用者ごとに最も古いバージョン · 最新は窓の中で報告された最も新しいバージョン · 古いバージョンが残るのは更新が届いていない利用者", rows: "versions",
      cols: [{ key: "kind", kind: "tag", terms: L.VERSION_KIND, label: "種類" }, { key: "version", kind: "version", sort: "order", label: "バージョン" },
        { key: "users", kind: "count_of", label: "利用者数" }, { key: "share", kind: "pct", label: "割合" }, BAR("users", "total")],
      chipsBy: "kind", chips: chipsOf(L.VERSION_KIND), chipsAll: false },
    // ---- 設定の効果（前後 14 日）----
    effect_sessions: { id: "effect_sessions", label: "セッションの大きさ（前後）", hint: "{F[effect2][before][sessions]:num} → {F[effect2][after][sessions]:num} セッション",
      title: "適用前後のセッションの大きさ", unit: "区間", data: "fixed.effect", rows: "F[effect2][dist]",
      scope: "守り始めた日の前後 {EVENT_STUDY_SPAN} 日に始まったセッション（当日は除く）· セッションごとの最大 · 区間の幅 {CONTEXT_BIN:tok} トークン · 割合は各期間の中の割合",
      note: "しきい値が効いていれば、適用後は大きい区間が減ります。自動コンパクトに達したセッションは、適用前 {F[effect2][before][auto_share]:pct}、適用後 {F[effect2][after][auto_share]:pct} です。",
      cols: SIDE_COLS, chart: { kind: "hist", key: "bin", sides: ["before", "after"], terms: L.SIDE } },
    effect_daily: { id: "effect_daily", label: "日ごとの 1 人あたり", hint: "守り始めた日の前後 {EVENT_STUDY_SPAN} 日", title: "日ごとの 1 人あたりコストとトークン", unit: "日", data: "fixed.effect",
      scope: "守り始めた日を 0 日目とした前後 {EVENT_STUDY_SPAN} 日 · {EFFECT_PROVIDER:provider} · トークンは入力とキャッシュの読み書きの合計",
      note: "0 日目（守り始めた当日）は前後が混ざるため除いています。時期による変動（繁忙・モデルの切り替えなど）を差し引いていないため、前後差を施策の効果と読まないでください。",
      rows: "study[rows]",
      cols: [{ key: "day", kind: "rel", label: "守り始めてからの日数" }, { key: "side", kind: "tag", terms: L.SIDE, label: "期間" },
        { key: "people", kind: "num", unit: "person", label: "対象者数" }, { key: "tokens", kind: "tok", label: "1 人あたりトークン" },
        { key: "cost", kind: "usd", label: "1 人あたりコスト" }, BAR("cost")],
      chipsBy: "side", chips: chipsOf(L.SIDE) },
    // ---- 収集 ----
    health: { id: "health", label: "受信と項目の欠け", hint: "直近 7 日と前の 7 日", title: "受信と項目の欠け", unit: "行",
      scope: "直近 7 日と前の 7 日 · 欠けの分母は、その項目が送られるはずの記録",
      note: "欠けは {NULL_RATE_ELEVATED}% 以上で注意、{NULL_RATE_HIGH}% 以上で要確認とします（仮の基準）。100% に跳ねたら上流の仕様変更を疑います。",
      rows: "health",
      cols: [{ key: "group", kind: "tag", terms: L.HEALTH_GROUP, label: "区分", sort: null }, { key: "item", kind: "term", terms: L.HEALTH_ITEM, label: "項目", sort: null },
        { key: "now", kind: "measure", label: L.RECENT, sort: null }, { key: "prev", kind: "measure_sub", label: L.PREV, sort: null },
        { key: "diff", kind: "diff", label: "差", sort: null }, { key: "state", kind: "state", label: "状態", sort: null }],
      chipsBy: "group", chips: chipsOf(L.HEALTH_GROUP) },
    errors: { id: "errors", label: "プラグインのエラー", hint: "直近 7 日 · {errors[total]:num} 件", title: "プラグインのエラー", unit: "行",
      scope: "直近 7 日 · 失った記録は戻りません", search: "エラーの種類・バージョン", q: "{error_type} {version} {stage}",
      rows: "r3[errors][rows]", sort: ["count", "desc"],
      cols: [{ key: "stage", kind: "stage", terms: L.STAGE, label: "処理段階" }, { key: "error_type", kind: "code", label: "エラーの種類" },
        { key: "count", kind: "num", label: "件数" }, { key: "users", kind: "num", unit: "person", label: "利用者数" }, { key: "version", kind: "code", label: "最後に起きたバージョン" }],
      chipsBy: "stage", chipTerms: L.STAGE },
    user_delivery: { id: "user_delivery", label: "利用者ごとの届き方", hint: "{r3[silent][rows]:count} 人 · 記録", title: "利用者ごとの届き方", unit: "人",
      scope: "直近 7 日と前の 7 日に記録か設定の報告があった利用者 · 利用明細は最終日までの 7 日", search: "利用者で絞り込み", q: "{email}",
      rows: "r3[silent][rows]",
      note: "途絶えた = 前の 7 日に記録か設定の報告があり、直近の 7 日に無い人。異動・休暇でも途絶えます。「利用明細にいない」は、記録はあるが利用明細にコストが無い人です。",
      cols: [{ key: "status", kind: "delivery", label: "状態" }, USER, { key: "events", kind: "num", unit: "item", label: "記録の件数" },
        { key: "events_prev", kind: "num_sub", label: "前の 7 日" }, { key: "events_diff", kind: "diff", label: "前との差" },
        { key: "per_day", kind: "dec1", label: "1 日あたりの記録" }, { key: "last_day", kind: "day", label: "最後の記録" },
        { key: "billed", kind: "yes_no", terms: ["いた", "いない"], label: "利用明細" }],
      chipsBy: "tags", chips: [...chipsOf(L.DELIVERY), ...chipsOf(L.BILLED)] },
  });

  // ---- 利用者ごとの一覧（案 34）: user_cost・user_use・user_calls を 1 行に並べ、置き換える ----
  const STATE = { key: "state", kind: "state", sort: "state_rank", label: "状態", quiet: true };
  const BILL = [STATE, { key: "rank", kind: "rank", label: "順位" }, { key: "cost", kind: "usd_strong", label: "コスト" }];
  const CHIPS = [{ id: "ng", label: L.STATE.ng, tone: "ng" }, { id: "warn", label: L.STATE.warn, tone: "warn" }, ...chipsOf(L.MODEL)];
  const ALL = { label: "利用者ごとの一覧", unit: "人", search: "利用者で絞り込み", q: "{email}", rows: "x[people]", sort: ["cost", "desc"], chipsBy: "tags", chips: CHIPS };
  T.user_all = { ...ALL, id: "user_all", replaces: ["user_cost", "user_use", "user_calls"], hint: "{x[people]:count} 人 · 利用明細と記録",
    title: "利用者ごとのコスト・頻度・呼び出し",
    scope: "利用明細と記録のどちらかに値のある利用者 · コストの多い順 · 差と増減率は前の {period[days]} 日と比べたコスト · 状態は期間の基準の判定 · セッションの大きさはセッションごとの最大の中央",
    note: "利用明細は今日と前日の分が無いため、基準日が今日なら利用明細の段は記録の段より 2 日早く終わります。片方の段にしか値の無い利用者は、もう片方の段を「—」にします。よく使う呼び出し先は、利用状況の「呼び出し先」で利用者を検索して引きます。",
    bands: [["", 1], ["利用明細（{x[cost][start]:md}〜{x[cost][end]:md}）", 6], ["記録（{period[start]:md}〜{period[end]:md}）", 9]],
    cols: [USER, ...BILL, { key: "cost_diff", kind: "usd", label: "前との差" }, { key: "cost_change", kind: "pct_change", label: "増減率" },
      { key: "top_model", kind: "model", label: "主なモデル" },
      { key: "active_days", kind: "num", unit: "day", label: "利用日数" }, { key: "prompts", kind: "num", label: "指示" }, { key: "sessions", kind: "num", label: "セッション" },
      { key: "session_size", kind: "tok", label: "セッションの大きさ" }, { key: "skill_calls", kind: "num", label: "スキル" }, { key: "command_calls", kind: "num", label: "コマンド" },
      { key: "external_calls", kind: "num", label: "外部ツール" }, { key: "agent_launches", kind: "num", label: "サブエージェントの起動" }, { key: "last_day", kind: "day", label: "最終日" }],
    long: { ...ALL, id: "user_all", hint: "{x[people]:count} 人 · 利用明細", title: "利用者ごとのコスト",
      scope: "利用明細 {x[cost][start]:day}〜{x[cost][end]:day} · コストの多い順",
      note: "12 か月では記録の段を出しません。記録から数える列は 7 日・28 日で見られます。",
      bands: [["", 1], ["利用明細（{x[cost][start]:day}〜{x[cost][end]:day}）", 3]], chips: chipsOf(L.MODEL),
      cols: [USER, ...BILL.slice(1), { key: "top_model", kind: "model", label: "主なモデル" }] } };
})();
