"use strict";
// 目録のタブの続き（設定の適用・設定の効果・収集）と、データと設定のページ（全案で今のまま）。
(() => {
  const { L } = window.KIT;
  const { T, chipsOf, BAR, USER, WEEK } = window.CATALOG;
  const SIDE_COLS = [{ key: "bin", kind: "bin", label: "トークン数の区間" }, { key: "before", kind: "num", label: "適用前のセッション" },
    { key: "before_share", kind: "pct", label: "適用前の割合" }, { key: "after", kind: "num", label: "適用後のセッション" }, { key: "after_share", kind: "pct_strong", label: "適用後の割合" }];

  Object.assign(T, {
    // ---- 設定の適用（30 日）----
    policy_users: { id: "policy_users", label: "利用者ごとの適用状況", hint: "{denominator:num} 人", title: "利用者ごとの適用状況", unit: "人", scope: "対象 {denominator:num} 人", data: "fixed.policy",
      search: "利用者で絞り込み", q: "{email}", rows: "users", sort: ["rank", "asc"],
      note: "1 台でも違う値の端末があれば、その利用者は未適用と数えます。このため台数と人数は一致しません。{basis:basis_note}",
      cols: [{ key: "status", kind: "user_state", sort: "rank", label: "状態" }, USER, { key: "terminals", kind: "dash_num", label: "端末" },
        { key: "on", kind: "dot", each: "items", terms: L.SETTING }, { key: "day", kind: "last_day", label: "最終報告日" }],
      chipsBy: "status", chips: chipsOf(L.USER_STATE) },
    policy_terminals: { id: "policy_terminals", label: "端末ごと", hint: "{counts[terminals]:num} 台", title: "端末ごとの現在の値と版", unit: "台", data: "fixed.policy",
      scope: "直近 {POLICY_DAYS} 日に設定の報告があった端末 · 端末ごとに最新の報告 1 件", search: "利用者・端末名で絞り込み", q: "{email} {host}",
      note: L.STALE_NOTE, rows: "F[x][terminals]", sort: ["rank", "asc"],
      cols: [{ key: "status", kind: "terminal_state", sort: "rank", label: "状態" }, USER, { key: "host", kind: "code", label: "端末名" },
        { key: "value", kind: "value", label: L.SETTING["env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"][0] }, { key: "off_keys", kind: "off_keys", label: "未適用の設定" },
        { key: "core", kind: "code", label: "本体の版" }, { key: "day", kind: "last_day", label: "最終報告日" }],
      chipsBy: "tags", chips: chipsOf(L.TERMINAL_STATE) },
    policy_settings: { id: "policy_settings", label: "設定ごと", hint: "{counts[items]:num} 設定", title: "設定ごとの適用率", unit: "行", data: "fixed.policy",
      scope: "直近 {POLICY_DAYS} 日 · 分母は{basis:basis}利用者 {denominator:num} 人", search: "設定名・キーで絞り込み", q: "{key:setting} {key}",
      note: "{basis:basis_note}", rows: "items", sort: ["rate", "asc"],
      cols: [{ key: "key", kind: "setting", terms: L.SETTING, label: "設定" }, { key: "numerator", kind: "ratio", label: "適用済み / 対象" },
        { key: "rate", kind: "pct_strong", label: "適用率" }, BAR("rate", "100"), { key: "off_terminals", kind: "num", unit: "terminal", label: "未適用の端末" }] },
    policy_versions: { id: "policy_versions", label: "バージョン", hint: "プラグイン・本体", title: "バージョンの分布", unit: "行", data: "fixed.policy",
      scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件 · 古い版が残るのは更新が届いていない端末", rows: "versions",
      cols: [{ key: "kind", kind: "tag", terms: L.VERSION_KIND, label: "種類" }, { key: "version", kind: "version", sort: "order", label: "バージョン" },
        { key: "count", kind: "count_of", label: "端末数" }, BAR("count", "total")],
      chipsBy: "kind", chips: chipsOf(L.VERSION_KIND) },
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
    health: { id: "health", label: "受信と項目の欠け", hint: "直近 {period[days]} 日と前の {period[days]} 日", title: "受信と項目の欠け", unit: "行",
      scope: "直近 {period[days]} 日と前の {period[days]} 日 · 欠けの分母は、その項目が送られるはずの記録",
      note: "欠けは {NULL_RATE_ELEVATED}% 以下を正常、{NULL_RATE_ELEVATED}% 超を注意、{NULL_RATE_HIGH}% 超を要確認とします（仮の基準）。100% に跳ねたら上流の仕様変更を疑います。",
      rows: "health",
      cols: [{ key: "group", kind: "tag", terms: L.HEALTH_GROUP, label: "区分", sort: null }, { key: "item", kind: "term", terms: L.HEALTH_ITEM, label: "項目", sort: null },
        { key: "now", kind: "measure", label: L.RECENT, sort: null }, { key: "prev", kind: "measure_sub", label: L.PREV, sort: null },
        { key: "diff", kind: "diff", label: "差", sort: null }, { key: "state", kind: "state", label: "状態", sort: null }],
      chipsBy: "group", chips: chipsOf(L.HEALTH_GROUP) },
    errors: { id: "errors", label: "プラグインのエラー", hint: "直近 {period[days]} 日 · {errors[total]:num} 件", title: "プラグインのエラー", unit: "行",
      scope: "直近 {period[days]} 日 · 端末 = 利用者とホスト名の組 · 失った記録は戻りません", search: "エラーの種類・版", q: "{error_type} {version} {stage}",
      rows: "errors[rows]", sort: ["count", "desc"],
      cols: [{ key: "stage", kind: "stage", terms: L.STAGE, label: "処理段階" }, { key: "error_type", kind: "code", label: "エラーの種類" },
        { key: "count", kind: "num", label: "件数" }, { key: "terminals", kind: "num", unit: "terminal", label: "端末数" }, { key: "version", kind: "code", label: "最後に起きた版" }],
      chipsBy: "stage", chipTerms: L.STAGE },
    missing: { id: "missing", label: "記録の無い利用者", hint: "{m[uncollected_rows]:count} 人", title: "記録の無い利用者", unit: "人",
      scope: "利用明細の最終日までの {period[days]} 日 · 利用明細と記録の突き合わせ", search: "利用者で絞り込み", q: "{email}", rows: "m[uncollected_rows]",
      note: "「利用明細だけ」は未導入・収集を止めるスイッチ・メールの不一致のどれか。画面からは区別できません。",
      cols: [USER, { key: "reason", kind: "term", terms: { billed_only: ["利用明細だけ", "コストはあるが記録が無い"], stopped: ["記録が途絶えた", "前の期間は記録があった"] }, label: "区分" }],
      chipsBy: "reason", chips: [{ id: "billed_only", label: "利用明細だけ" }, { id: "stopped", label: "記録が途絶えた" }] },
  });

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

  window.CATALOG.settings = settings;
})();
