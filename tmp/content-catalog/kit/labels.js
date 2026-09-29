"use strict";
// 画面をまたいで使う語と仕様値（サーバの labels.py・constants.py の写し）。案の定義は KIT.L・KIT.C で引く。
(() => {
  const C = {
    POLICY_DAYS: 30, STALE_DAYS: 14, NULL_RATE_ELEVATED: 20, NULL_RATE_HIGH: 50, EVENT_STUDY_SPAN: 14, CONTEXT_BIN: 20000,
    REFERENCE_KEY: "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE", REFERENCE_VALUE: "60", EFFECT_PROVIDER: "aws-bedrock",
    FORECAST_MIN_BUSINESS_DAYS: 3, LONG_MONTHS: 12,
  };
  const LONG_NAME = "12 か月";
  const L = {
    APP: "Claude Code 利用状況",
    ASOF: "{} 時点",
    FOOTER: "端末から送られた値です。コストとトークンは全社の利用明細（CSV）の値を正とします。",
    NAV: "画面", DETAIL: "詳しい一覧", DETAIL_HINT: "タブで切り替え · カードを押すと該当する一覧が開きます",
    OPEN_LIST: "一覧", EXACT: "正確な値",
    SPARK_TIP: "{day:md}（{day:weekday}）  {value}", SPARK_TIP_WEEK: "{day:md}〜{end:md}  {value}",
    SEARCH: "絞り込み", ALL: "すべて", EMPTY: "条件に合う行はありません。", FILTER_GROUP: "区分",
    STATE: { ok: "正常", warn: "注意", ng: "要確認", neutral: "—" },
    RECENT: "直近 {period[days]} 日", PREV: "前の {period[days]} 日",
    PERIOD_NAV: "期間", PERIOD_NAMES: { 7: "7 日", 28: "28 日", "12m": LONG_NAME },
    NOT_LONG: `${LONG_NAME}では出しません`,
    NOT_LONG_CARDS: `{names}は、記録から数えるため ${LONG_NAME}では出しません`,
    NOT_LONG_PANEL: `${LONG_NAME}では出しません。記録から数える項目は 7 日・28 日で見られます。`,
    LONG_SCOPE: "直近 {period[months]} か月",
    LIST_SEP: "・",
    WEEK: "{day:day}〜{end:md}", WEEK_PARTIAL: "{day:day}〜", WEEK_DAYS: "（{days} 日分）", MONTH_PARTIAL: "（途中）",
    COST_SHADE: "濃い地が直近 {period[days]} 日",
    MONTH_SKIPPED: "{day:ym} は {day:md}〜{end:md} の {days} 日分のため行に出しません。",
    MDAY_WEEKDAY: "（{day:weekday}）", MDAY_OFF: " · {off}", BD_FROM: " · {from:md}〜 の合計", BD_TO: " · {to:md} までの合計",
    FC_TIP: "{n} 営業日目 · {day:md}", FC_TIP_N: "{n} 営業日目", FC_FORECAST: "見込み {}", FC_PREV: "{month:mon} 月 {value}",
    FC_UNTIL: "{} まで", FC_NO_CSV: "今月の利用明細はまだありません",
    SIDE: { before: "適用前", after: "適用後" },
    TREND: { up: "増えた", down: "減った", flat: "変わらない" },
    AGENT: { agent: ["サブエージェントの中"], main: ["サブエージェントの外"] },
    SPAN: "{first:day}〜{last:day}",
    STAGE: {
      apply_settings: ["設定の書き込み"], collect: ["記録の収集"], send: ["送信"], identity: ["利用者の特定"],
      notices: ["お知らせの表示"], statusline: ["ステータスラインの設定"], mark_seen: ["表示済みの記録"],
    },
    HEALTH_ITEM: {
      events: ["受信した記録", "再送の重複を除く"], users: ["送信した利用者", ""],
      reconciliation: ["CSV との照合率", "利用明細の最終日までの {period[days]} 日"],
      tool_name: ["ツール名", "ツール実行の記録が分母"], skill_name: ["スキル名", "Skill ツールの実行記録が分母"],
      context_tokens: ["コンテキストのトークン数", "圧縮直前と応答終了の記録が分母"],
      command_source: ["コマンドの定義元", "コマンド展開の記録が分母"],
    },
    HEALTH_GROUP: { recv: "受信", null: "項目の欠け" },
    USAGE_FIELD: { permission_mode: "権限モード", effort_level: "effort（思考量）", source: "セッションの開始" },
    USAGE_VALUE: {
      permission_mode: {
        default: ["通常", "操作ごとに許可を求める"], acceptEdits: ["編集を自動承認", "ファイル編集は確認なし"],
        plan: ["プランモード", "計画だけ立て、変更はしない"], bypassPermissions: ["確認なし", "すべての操作を確認なし"],
      },
      effort_level: { low: ["低"], medium: ["中"], high: ["高"] },
      source: { startup: ["新規起動"], resume: ["再開", "前のセッションを続けた"], clear: ["クリア後"], compact: ["圧縮後"] },
    },
    PROVIDER: { "aws-bedrock": "AWS Bedrock", "google-vertex": "Google Vertex AI" },
    MODEL: { "claude-opus-4-1": "Opus 4.1", "claude-sonnet-4-5": "Sonnet 4.5", "claude-haiku-4-5": "Haiku 4.5" },
    SETTING: {
      "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": ["自動圧縮のしきい値", "しきい値"],
      "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate": ["プラグインの自動更新", "プラグイン更新"],
      autoUpdatesChannel: ["本体の更新チャネル", "更新チャネル"],
      "env.DISABLE_AUTOUPDATER": ["自動更新の無効化を打ち消す", "自動更新"],
      "env.DISABLE_UPDATES": ["更新の無効化を打ち消す", "更新"],
      "env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE": ["パッケージマネージャ経由の自動更新", "パッケージ"],
    },
    USER_STATE: { off: ["ng", "未適用あり"], none: ["warn", "未導入"], stale: ["neutral", "報告停止"], ok: ["ok", "すべて適用"] },
    TERMINAL_STATE: { off: ["ng", "未適用"], stale: ["neutral", "報告停止"], ok: ["ok", "適用"] },
    OFF_ITEMS: "未適用 {} 項目",
    DOT: { true: "適用", false: "未適用", null: "報告なし" },
    DOT_LEGEND: { true: "配布した値", false: "違う値か未設定", null: "報告なし（未導入）" },
    UNSET: "未設定", NO_REPORT: "報告なし", TODAY: "今日", DAYS_AGO: "{} 日前", LATEST: "最新",
    VERSION_KIND: { plugin: "プラグイン", core: "Claude Code 本体" },
    BASIS: {
      csv: `利用明細（CSV）の最終日までの ${C.POLICY_DAYS} 日にコストがある`,
      policy: `直近 ${C.POLICY_DAYS} 日に設定の報告があった`,
    },
    BASIS_NOTE: {
      csv: "",
      policy: "CSV を取り込んでいないため、分母は設定の報告があった利用者だけです。プラグインを入れていない人は含みません。",
    },
    STALE_NOTE: `報告停止 = 最後の報告から ${C.STALE_DAYS} 日以上経った端末。${C.POLICY_DAYS} 日を過ぎると一覧から外れます。`,
    UNIT: { person: "人", item: "件", terminal: "台", pt: "pt", times: "回", day: "日" },
    WEEKDAY_NAMES: { 0: "月", 1: "火", 2: "水", 3: "木", 4: "金", 5: "土", 6: "日" },
  };
  L.PERIOD = { recent: L.RECENT, prev: L.PREV };
  L.PAIR = { prev: L.PREV, recent: L.RECENT };
  window.KIT = Object.assign(window.KIT || {}, { L, C });
})();
