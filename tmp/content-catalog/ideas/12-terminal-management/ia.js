"use strict";
// 12-terminal-management: concepts.md の案 12 の全ページ。上半分は部品の辞書（concepts.md 3 節の id）、下半分がページの木。
(() => {
  // ---- 部品の辞書（concepts.md の 3 節。カード K・タブ T。窓 W は群の見出しの横に出す） ----
  const { L } = window.KIT;
  const SAME = "same";
  const chipsOf = (terms) => Object.entries(terms).map(([id, v]) => (Array.isArray(v) ? { id, label: v[1], tone: v[0] } : { id, label: v }));
  const PERIOD_CHIPS = [{ id: "recent", label: L.RECENT }, { id: "prev", label: L.PREV }];
  const BAR = (key, den) => ({ key, kind: "bar", label: "", sort: null, den });
  const TREND_CAP = ["{x[daily][0][day]:md}", "濃い部分が直近 {period[days]} 日", "{period[end]:md}"];
  const MONTHS_TIP = "{day:ym}";
  const PREV_PAIR = (key, prev) => ({ [prev]: "前の {period[days]} 日", [key]: "直近 {period[days]} 日" });
  const STATE_NAMES = { ok: "すべて適用", off: "未適用あり", none: "未導入", stale: "報告停止" };
  const TOKEN_KIND = { input: "入力", output: "出力", cache_read: "キャッシュ読み込み", cache_write: "キャッシュ書き込み" };

  const W = {
    rec: { scope: "直近 {period[days]} 日（{period[start]:md}〜{period[end]:md}）と前の {period[days]} 日 · 記録を送った利用者" },
    rec7: { scope: "直近 7 日（{period[start]:md}〜{period[end]:md}）と前の 7 日 · 記録を送った利用者 · 期間の切り替えに依らない", data: "p.7" },
    bill: { scope: "利用明細 {x[cost][start]:md}〜{x[cost][end]:md} と前の {period[days]} 日 · 利用明細にコストがあった利用者",
      longScope: "利用明細 直近 {period[months]} か月（{x[cost][start]:day}〜{x[cost][end]:day}）· 前の期間と比べない" },
    match: { scope: "利用明細の最終日（{x[cost][end]:md}）までの {period[days]} 日 · 記録と利用明細の突き合わせ" },
    match7: { scope: "利用明細の最終日（{x[cost][end]:md}）までの 7 日 · 記録と利用明細の突き合わせ · 期間の切り替えに依らない", data: "p.7" },
    month: { scope: "{month[month]:ym} · 利用明細の最終日（{month[as_of]:md}）まで · 各月にコストがあった利用者",
      longScope: "{month[month]:ym} · 利用明細の最終日（{month[as_of]:md}）まで · 各月にコストがあった利用者 · 期間の切り替えに依らない" },
    p30: { scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件 · 対象は{basis:basis} {denominator:num} 人", data: "fixed.policy" },
    ba: { scope: "{REFERENCE_KEY:setting}を {REFERENCE_VALUE} にした前後 {EVENT_STUDY_SPAN} 日 · 前後の境は各利用者が守り始めた日", data: "fixed.effect" },
    baCost: { scope: "前後 {EVENT_STUDY_SPAN} 日の 1 人 1 日あたり · {EFFECT_PROVIDER:provider} · 時期の変動を含むため、前後差を施策の効果と読まない", data: "fixed.effect" },
    now: { scope: "現時点", data: "p.7" },
  };

  // ---- カード ----
  const K = {
    K01: { label: "利用者", unit: "人", tab: "daily", value: "{x[active][users]:num}", delta: "{users[delta]:signed}",
      sub: "前の {period[days]} 日 {x[active_prev][users]:num} 人", viz: { kind: "spark", src: "x[daily]", field: "users" }, cap: TREND_CAP },
    K02: { label: "1 人あたりの利用日数", unit: "日", tab: "days_dist", value: "{x[active][days_per_user]:dec1}",
      sub: "前の {period[days]} 日 {x[active_prev][days_per_user]:dec1} 日", viz: { kind: "hist", src: "x[days_dist]", sides: ["now"] }, cap: ["利用した日数ごとの人数"] },
    K03: { label: "定着度", unit: "%", tab: "daily", value: "{x[active][stickiness]:dec1}",
      sub: "日ごとの利用者 {x[active][dau]:dec1} 人 ÷ 期間の利用者 {x[active][users]:num} 人",
      viz: { kind: "meter", src: "x[active][stickiness]", den: 100 }, cap: ["前の {period[days]} 日 {x[active_prev][stickiness]:pct}"] },
    K04: { label: "1 人 1 日あたりの指示", unit: "件", tab: "daily", value: "{x[active][prompts_per_person_day]:dec1}",
      sub: "前の {period[days]} 日 {x[active_prev][prompts_per_person_day]:dec1} 件", viz: { kind: "bars", src: "x[daily]", field: "prompts" }, cap: ["日ごとの指示の合計 · 濃い棒が直近"] },
    K05: { label: "1 人 1 日あたりのセッション", unit: "件", tab: "daily", value: "{x[active][sessions_per_person_day]:dec1}",
      sub: "前の {period[days]} 日 {x[active_prev][sessions_per_person_day]:dec1} 件 · 期間のセッション {x[active][sessions]:num} 件",
      viz: { kind: "bars", src: "x[daily]", field: "sessions" }, cap: ["日ごとのセッションの合計 · 濃い棒が直近"] },
    K06: { label: "1 指示あたりのツール呼び出し", unit: "回", tab: "tools", value: "{m[tool_calls_per_prompt]:dec1}", sub: "1 人 1 日あたり {m[tool_calls_per_person_day]:dec1} 回" },
    K10: { label: "利用明細の利用者", unit: "人", tab: "people", value: "{x[cost][users]:num}", sub: "前の {period[days]} 日 {x[cost][users_prev]:num} 人",
      viz: { kind: "bars", src: "x[daily]", field: "cost_users" }, cap: ["日ごとの人数 · 濃い棒が直近"],
      long: { label: "利用明細の利用者", unit: "人", tab: "people", value: "{x[cost][users]:num}", sub: "{period[months]} か月のうち 1 日でもコストがあった人",
        viz: { kind: "bars", src: "x[months]", field: "users", tipLabel: MONTHS_TIP }, cap: ["暦月ごとの人数"] } },
    K11: { label: "営業日の利用率", unit: "%", tab: "people", value: "{m[active_day_rate]:dec1}", sub: "営業日 {m[business_days]:num} 日のうち、1 人が使った日の割合",
      viz: { kind: "meter", src: "m[active_day_rate]", den: 100 }, long: SAME },
    K12: { label: "使い始めた利用者", unit: "人", tab: "people", value: "{m[new_user_count]:num}", sub: "初めてコストが出た日が期間の中にある人",
      long: { label: "使い始めた利用者", unit: "人", tab: "people", value: "{m[new_user_count]:num}", sub: "初めてコストが出た日が {period[months]} か月の中にある人",
        viz: { kind: "bars", src: "x[months]", field: "new_users", tipLabel: MONTHS_TIP }, cap: ["暦月ごとの人数"] } },
    K13: { label: "継続率", unit: "%", tab: "people", value: "{m[retention_rate]:dec1}", sub: "前の {period[days]} 日にいた人のうち · 離れた {m[left_users]:count} 人",
      viz: { kind: "meter", src: "m[retention_rate]", den: 100 },
      long: { label: "継続率", unit: "%", tab: "people", value: "{m[retention_rate]:dec1}", sub: "直近の完了した月 · {m[retention_month]:ym} にいた人のうち翌月も使った人 · 離れた {m[left_users]:count} 人",
        viz: { kind: "meter", src: "m[retention_rate]", den: 100 } } },
    K20: { label: "コスト", tab: "cost", value: "{x[cost][total]:usd}", delta: "{x[cost][change]:signed_pct}", sub: "前の {period[days]} 日 {x[cost][prev]:usd}",
      viz: { kind: "spark", src: "cost[spark]", field: "total", fmt: "usd" }, cap: ["{cost[spark_start]:md}", "濃い部分が直近 {period[days]} 日", "{cost[end]:md}"],
      long: { label: "コスト", tab: "weeks_cost", value: "{x[cost][total]:usd}", sub: "月平均 {cost[monthly]:usd} · 前の期間と比べない",
        viz: { kind: "bars", src: "x[months]", field: "cost", fmt: "usd", tipLabel: MONTHS_TIP }, cap: ["暦月ごと"] } },
    K21: { label: "1 人あたりコスト", tab: "people", value: "{x[cost][per_user]:usd}", delta: "{x[cost][per_user_change]:signed_pct}",
      sub: "前の {period[days]} 日 {x[cost][per_user_prev]:usd}", viz: { kind: "pair", src: "x[cost]", terms: PREV_PAIR("per_user", "per_user_prev") },
      long: { label: "1 人あたりコスト", tab: "people", value: "{x[cost][per_user]:usd}", sub: "利用明細の {x[cost][users]:num} 人で割る" } },
    K22: { label: "1 人 1 日あたりのコスト", tab: "people", value: "{x[cost][per_person_day]:usd}", sub: "コストのあった日（人日）で割る", long: SAME },
    K23: { label: "コストの多い利用者", tab: "people", wide: true, sub: "上位 5 人",
      viz: { kind: "rates", src: "x[people]", field: "cost", den: "max", label: "{email}", limit: 5, right: ["{cost:usd}", "{share:pct}"] }, long: SAME },
    K24: { label: "上位 10% の占める割合", unit: "%", tab: "people", value: "{x[cost][top10_share]:dec1}", sub: "上位 {x[cost][top10_n]:num} 人 · 上位 5 人は {x[cost][top5_share]:pct}",
      viz: { kind: "meter", src: "x[cost][top10_share]", den: 100, tone: "warn" }, long: SAME },
    K25: { label: "1 人あたりコストの分布", tab: "dist", wide: true, sub: "人数の割合（区間は 1 人あたりのコスト）",
      viz: { kind: "hist", src: "x[cost_dist]", sides: ["now"] }, cap: ["左端 {x[cost_dist][0][label]} · 縦は人数の割合"], long: SAME },
    K27: { label: "月末のコスト見込み（{month[month]:mon} 月）", tab: "month", value: "{month[forecast]:usd}",
      viz: { kind: "forecast", src: "month", stats: [["営業日あたり", "per_bd"], ["1 人 1 営業日あたり", "per_user"]] },
      cap: ["実績 {month[actual]:usd} · {month[elapsed]:num} / {month[business_days]:num} 営業日", "{month[as_of]:asof}"],
      empty: "month[as_of]", capEmpty: ["今月（{month[month]:mon} 月）の利用明細はまだありません"], long: SAME },
    K28: { label: "営業日あたりのコスト", tab: "month", value: "{month[per_bd]:usd}", delta: "{month[per_bd_change]:signed_pct}",
      sub: "前月 {month[prev_per_bd]:usd}", viz: { kind: "pair", src: "month", terms: { prev_per_bd: "{month[prev_month]:mon} 月", per_bd: "{month[month]:mon} 月" } }, long: SAME },
    K29: { label: "1 人 1 営業日あたり", tab: "month", value: "{month[per_user]:usd}", delta: "{month[per_user_change]:signed_pct}",
      sub: "前月 {month[prev_per_user]:usd} · {month[users]:num} 人で割る", viz: { kind: "pair", src: "month", terms: { prev_per_user: "{month[prev_month]:mon} 月", per_user: "{month[month]:mon} 月" } }, long: SAME },
    K30: { label: "前月の確定（{month[prev_month]:mon} 月）", tab: "month", value: "{month[prev_actual]:usd}", sub: "{month[prev_users]:num} 人", long: SAME },
    K31: { label: "1 セッションあたりのコスト", value: "{m[cost_per_session]:usd}", sub: "コストは利用明細、回数は記録の窓" },
    K32: { label: "1 指示あたりのコスト", value: "{m[cost_per_prompt]:usd}", sub: "コストは利用明細、回数は記録の窓" },
    K40: { label: "モデルごとのコスト", tab: "models", value: "{x[models][0][key]:model}", sub: "最もコストの多いモデル · {x[models][0][share]:pct}",
      viz: { kind: "stack", src: "x[models]", field: "cost", tone: "accent", terms: L.MODEL }, long: SAME },
    K41: { label: "キャッシュ読み込みの割合", unit: "%", tab: "tokens", value: "{x[tokens][cache_read_share]:dec1}", sub: "入力側のトークン（入力・キャッシュ読み書き）のうち",
      viz: { kind: "meter", src: "x[tokens][cache_read_share]", den: 100 }, long: SAME },
    K42: { label: "キャッシュ書き込みの割合", unit: "%", tab: "tokens", value: "{m[cache_write_share]:dec1}", sub: "入力側のトークンのうち",
      viz: { kind: "meter", src: "m[cache_write_share]", den: 100 }, long: SAME },
    K43: { label: "100 万トークンあたりのコスト", tab: "models", value: "{m[unit_cost]:usd}", sub: "全モデル · モデルごとは下",
      viz: { kind: "rates", src: "x[models]", field: "per_mtok", den: "max", terms: L.MODEL, right: ["{per_mtok:usd}"] }, long: SAME },
    K44: { label: "トークンの内訳", unit: "トークン", tab: "tokens", value: "{x[tokens][total]:tok}", sub: "入力・出力・キャッシュの読み書きの合計",
      viz: { kind: "stack", src: "x[token_parts]", tone: "accent", terms: TOKEN_KIND }, long: SAME },
    K45: { label: "出力の割合", unit: "%", tab: "tokens", value: "{x[tokens][output_share]:dec1}", sub: "全トークンのうち出力",
      viz: { kind: "meter", src: "x[tokens][output_share]", den: 100 }, long: SAME },
    K46: { label: "モデルごとの利用者数", tab: "models", sub: "利用明細の {x[cost][users]:num} 人のうち（1 人が複数のモデルを使う）",
      viz: { kind: "rates", src: "x[models]", field: "users", den: "x[cost][users]", terms: L.MODEL, right: ["{users:num} 人"] }, long: SAME },
    K52: { label: "スキルを使った人の割合", unit: "%", tab: "skills", value: "{x[active][skills_reach]:dec1}", sub: "{x[active][skills_users]:num} 人 / {x[active][users]:num} 人",
      viz: { kind: "meter", src: "x[active][skills_reach]", den: 100 }, cap: ["前の {period[days]} 日 {x[active_prev][skills_reach]:pct}"] },
    K53: { label: "コマンドを使った人の割合", unit: "%", tab: "commands", value: "{x[active][commands_reach]:dec1}", sub: "{x[active][commands_users]:num} 人 / {x[active][users]:num} 人",
      viz: { kind: "meter", src: "x[active][commands_reach]", den: 100 }, cap: ["前の {period[days]} 日 {x[active_prev][commands_reach]:pct}"] },
    K55: { label: "サブエージェントを使った人の割合", unit: "%", tab: "activity", value: "{m[subagent_user_rate]:dec1}", sub: "{m[subagent_users]:num} 人 · 起動 {m[subagent_runs]:num} 回",
      viz: { kind: "meter", src: "m[subagent_user_rate]", den: 100 } },
    K60: { label: "ツールの呼び出し", tab: "tools", wide: true, value: "{x[tools][0][key]}", sub: "最も多いツール · 割合は全呼び出しのうち",
      viz: { kind: "rates", src: "x[tools]", field: "share", label: "{key}", limit: 4, right: ["{calls:num} 回", "{share:pct}"] } },
    K63: { label: "確認なしモードを使った利用者", unit: "人", tab: "activity", value: "{x[active][bypass_users]:num}", sub: "利用者の {x[active][bypass_reach]:pct}",
      viz: { kind: "meter", src: "x[active][bypass_users]", den: "x[active][users]", tone: "warn" }, cap: ["期間に 1 回でも権限モード「確認なし」を使った人"] },
    K67: { label: "応答終了時のコンテキスト（中央）", unit: "トークン", tab: "context", wide: true, value: "{x[active][stop_median]:tok}", sub: "p90 {x[active][stop_p90]:tok}",
      viz: { kind: "hist", src: "x[context]", sides: ["prev", "recent"], terms: L.PERIOD }, cap: ["区間の幅 {CONTEXT_BIN:tok} トークン · 縦は各期間の中の割合"] },
    K68: { label: "大きなコンテキストの割合", unit: "%", tab: "context", value: "{m[large_context_share]:dec1}", sub: "応答終了時に 10 万トークン以上の記録",
      viz: { kind: "meter", src: "m[large_context_share]", den: 100, tone: "warn" } },
    K69: { label: "自動圧縮", unit: "回", tab: "context", value: "{x[active][auto_compacts]:num}", sub: "1 セッションあたり {x[active][compacts_per_session]:dec1} 回（手動を含む）",
      viz: { kind: "pair", src: "x", field: "auto_compacts", terms: { active_prev: "前の {period[days]} 日", active: "直近 {period[days]} 日" } } },
    K80: { label: "すべての設定を適用", unit: "人", tab: "users", chip: "ok", value: "{counts[ok]:num}", sub: "対象 {denominator:num} 人のうち {counts[ok_rate]:pct}",
      viz: { kind: "meter", src: "counts[ok]", den: "denominator", tone: "ok" }, cap: ["{counts[items]:num} つの設定がすべて配布した値"] },
    K81: { label: "未適用のある利用者", unit: "人", tab: "users", chip: "off", value: "{counts[off]:num}", state: "states[off]",
      sub: "端末 {counts[off_terminals]:num} 台 · 違う値か未設定", viz: { kind: "meter", src: "counts[off]", den: "denominator", tone: "ng" }, cap: ["対象 {denominator:num} 人のうち"] },
    K82: { label: "設定ごとの適用率", tab: "settings", wide: true, sub: "最も低いのは {lowest:setting}",
      viz: { kind: "rates", src: "items", field: "rate", terms: L.SETTING, right: ["{numerator:num} / {denominator:num} 人", "{rate:pct}"] } },
    K86: { label: "適用の状態ごとのコスト", tab: "users", wide: true, sub: "状態は {POLICY_DAYS} 日の報告、コストは利用明細の最終日までの {POLICY_DAYS} 日（USD）",
      viz: { kind: "rates", src: "F[x][policy_cost]", field: "share", terms: STATE_NAMES, right: ["{users:num} 人", "{share:pct}"] }, cap: ["割合はコストの合計のうち（状態ごとの人数と割合）"] },
    K90: { label: "プラグイン未導入", unit: "人", tab: "users", chip: "none", value: "{counts[none]:num}", state: "states[none]",
      sub: "コストがあるのに報告が無い", viz: { kind: "meter", src: "counts[none]", den: "denominator", tone: "warn" }, cap: ["対象 {denominator:num} 人のうち"] },
    K91: { label: "報告が止まった端末", unit: "台", tab: "terminals", chip: "stale", value: "{counts[stale_terminals]:num}",
      sub: "{counts[stale_users]:num} 人 · 最後の報告から {STALE_DAYS} 日以上",
      viz: { kind: "meter", src: "counts[stale_terminals]", den: "counts[terminals]", tone: "neutral" }, cap: ["全 {counts[terminals]:num} 台のうち"] },
    K92: { label: "プラグインが最新版の端末", unit: "台", tab: "versions", chip: "plugin", value: "{plugin[latest_count]:num}",
      sub: "最新 {plugin[latest]} · 全 {plugin[total]:num} 台", viz: { kind: "stack", src: "plugin[parts]", tone: "accent" } },
    K93: { label: "本体が最新版の端末", unit: "台", tab: "versions", chip: "core", value: "{core[latest_count]:num}",
      sub: "最新 {core[latest]} · 全 {core[total]:num} 台", viz: { kind: "stack", src: "core[parts]", tone: "accent" } },
    K100: { label: "受信した記録", unit: "件", tab: "health", value: "{events[recent]:num}", delta: "{events[delta]:signed}",
      sub: "前の {period[days]} 日 {events[prev]:num} 件", viz: { kind: "pair", src: "events", terms: L.PAIR } },
    K101: { label: "利用明細との照合率", unit: "%", tab: "health", value: "{reconciliation[rate]:dec1}",
      sub: "利用明細にもいた {reconciliation[numerator]:num} 人 / 送信した {reconciliation[denominator]:num} 人",
      viz: { kind: "meter", src: "reconciliation[numerator]", den: "reconciliation[denominator]" } },
    K102: { label: "プラグインのエラー", unit: "件", tab: "errors", value: "{errors[total]:num}", state: "errors[state]", sub: "{errors[kinds]:num} 種類",
      viz: { kind: "stack", src: "errors[stages]", tone: "warn", terms: L.STAGE } },
    K103: { label: "項目の欠け（最大）", unit: "%", tab: "health", chip: "null", value: "{nulls[rate]:dec1}", state: "nulls[state]",
      sub: "{nulls[key]:field} · {nulls[ok]:num} / {nulls[total]:num} 項目が正常",
      viz: { kind: "rates", src: "nulls[fields]", field: "rate", terms: L.HEALTH_ITEM, right: ["{rate:pct}"] } },
    K104: { label: "記録の無い利用明細の利用者", unit: "人", tab: "uncollected", value: "{m[uncollected_billed_users]:count}", sub: "コストはあるが記録を送っていない人" },
    K108: { label: "利用明細の鮮度", unit: "日前", tab: "health", value: "{F[m][csv_freshness_days]:num}", sub: "最終日 {F[m][csv_end]:day}" },
  };
  const histCard = (id, label) => ({ label, unit: "トークン", tab: id, wide: true, value: `{${id}[median][after]:bin}`,
    sub: `適用前 {${id}[median][before]:bin} · 記録 {${id}[total][before]:num} → {${id}[total][after]:num} 件`,
    viz: { kind: "hist", src: `${id}[rows]`, terms: L.SIDE }, cap: ["区間の幅 {CONTEXT_BIN:tok} トークン · 縦は各期間の中の割合"] });
  K.K110 = histCard("precompact", "圧縮直前のコンテキスト（中央の区間）");
  K.K111 = histCard("stop", "応答終了時のコンテキスト（中央の区間）");
  K.K112 = { label: "しきい値を守り始めた利用者", unit: "人", tab: "study", value: "{adopters:num}", sub: "日ごとの対象者 {study[people_min]:num}〜{study[people_max]:num} 人",
    cap: ["その日が利用明細の期間に入る人だけを数える"] };
  K.K113 = { label: "1 人 1 日あたりのコスト", tab: "study", value: "{study[after][cost]:usd}",
    sub: "適用前 {study[before][cost]:usd} · のべ {study[before][person_days]:num} → {study[after][person_days]:num} 人日",
    viz: { kind: "pair", src: "study", field: "cost", terms: L.SIDE }, cap: ["0 日目（守り始めた当日）を除く"] };
  K.K114 = { label: "1 人 1 日あたりのトークン", unit: "トークン", tab: "study", value: "{study[after][tokens]:tok}", sub: "適用前 {study[before][tokens]:tok}",
    viz: { kind: "pair", src: "study", field: "tokens", terms: L.SIDE }, cap: ["入力とキャッシュの読み書き（出力は含まない）"] };
  const callCard = (id, label) => ({ label, unit: "回", tab: id, wide: true, value: `{${id}[recent]:num}`, delta: `{${id}[delta]:signed}`,
    sub: `前の {period[days]} 日 {${id}[prev]:num} 回 · {${id}[kinds]:num} 種類`, cap: ["呼び出しの多い順 · 割合は直近 {period[days]} 日の全呼び出しのうち"],
    viz: { kind: "rates", src: `${id}[top]`, field: "share", right: ["{calls:num} 回", "{share:pct}"] } });
  K.K50 = callCard("skills", "スキルの呼び出し");
  K.K51 = callCard("commands", "コマンドの呼び出し");

  // ---- タブ ----
  const WEEK = { key: "day", kind: "week", label: "週の始まり" };
  const PROVIDERS = { key: "providers", kind: "usd", each: "cost[providers]", terms: L.PROVIDER };
  const DIST_COLS = (unit) => [{ key: "label", kind: "text", label: "区間", sort: "bin" }, { key: "count", kind: "num", unit, label: "人数" },
    { key: "now_share", kind: "pct", label: "割合" }, BAR("now_share", "100")];
  const USAGE_NOTE = "差は直近から前の {period[days]} 日を引いた値です。増えた・減ったは呼び出し回数の差で分けます。";
  const CALLS = [{ key: "recent_calls", kind: "num", unit: "times", label: "呼び出し回数" }, BAR("recent_calls"),
    { key: "prev_calls", kind: "num_sub", label: L.PREV }, { key: "calls_diff", kind: "diff", label: "差" },
    { key: "recent_users", kind: "num", unit: "person", label: "利用者数" }, { key: "users_diff", kind: "diff", label: "利用者の差" }];
  const HIST_SCOPE = " · 前後 {EVENT_STUDY_SPAN} 日 · 区間の幅 {CONTEXT_BIN:tok} トークン · 割合は各期間の中の割合";
  const HIST_COLS = [{ key: "bin", kind: "bin", label: "トークン数の区間" }, { key: "before", kind: "num", label: "適用前の件数" },
    { key: "before_share", kind: "pct", label: "適用前の割合" }, { key: "after", kind: "num", label: "適用後の件数" }, { key: "after_share", kind: "pct_strong", label: "適用後の割合" }];
  const histTab = (id, label, title, scope) => ({ id, label, title, unit: "区間", data: "fixed.effect", scope: scope + HIST_SCOPE,
    note: "両方の期間で 0 件の区間は出しません。しきい値が効いていれば、適用後は小さい区間に寄ります。",
    hint: `記録 {${id}[total][before]:num} → {${id}[total][after]:num} 件`, rows: `${id}[rows]`, cols: HIST_COLS, chart: { kind: "hist", key: "bin", sides: ["before", "after"], terms: L.SIDE } });
  const PEOPLE_COST = [
    { key: "rank", kind: "rank", label: "順位" }, { key: "email", kind: "user", label: "利用者" },
    { key: "cost", kind: "usd_strong", label: "コスト" }, BAR("cost"), { key: "share", kind: "pct", label: "割合" }, { key: "cum_share", kind: "pct", label: "累積" },
    { key: "cost_prev", kind: "usd_sub", label: "前の期間" }, { key: "cost_diff", kind: "diff", label: "差" },
    { key: "days", kind: "num", unit: "day", label: "日数" }, { key: "per_day", kind: "usd", label: "1 日あたり" },
    { key: "top_model", kind: "model", label: "主なモデル" }, { key: "cache_share", kind: "pct", label: "キャッシュ読み" }];
  const PEOPLE_USE = [
    { key: "email", kind: "user", label: "利用者" }, { key: "active_days", kind: "num", unit: "day", label: "利用日数" },
    { key: "sessions", kind: "num", label: "セッション" }, { key: "prompts", kind: "num", label: "指示" },
    { key: "tool_calls", kind: "num", label: "ツール" },
    { key: "skills", kind: "num", label: "スキル" }, { key: "commands", kind: "num", label: "コマンド" },
    { key: "agent_rate", kind: "pct", label: "サブエージェント" }, { key: "interrupt_rate", kind: "pct", label: "中断" },
    { key: "bypass_rate", kind: "pct", label: "確認なし" }, { key: "compacts", kind: "num", label: "圧縮" },
    { key: "version", kind: "code", label: "本体の版" }];

  const T = {
    T01: { id: "daily", label: "日ごとの利用", hint: "直近 {period[span]} 日 · 記録", title: "日ごとの利用者・セッション・指示", unit: "日",
      scope: "直近 {period[span]} 日 · 日ごと · 濃い色が直近 {period[days]} 日", rows: "x[daily]", sort: ["day", "desc"],
      cols: [{ key: "day", kind: "date", label: "日付" }, { key: "period", kind: "tag", terms: L.PERIOD, label: "期間" },
        { key: "users", kind: "num", unit: "person", label: "利用者" }, { key: "sessions", kind: "num", unit: "item", label: "セッション" },
        { key: "prompts", kind: "num", unit: "item", label: "指示" }, BAR("prompts")],
      chipsBy: "period", chips: PERIOD_CHIPS,
      chart: { kind: "bars", key: "day", panels: [{ title: "利用者", field: "users" }, { title: "指示", field: "prompts" }] } },
    T02: { id: "cost", label: "日ごとのコスト", hint: "直近 {period[span]} 日 · 利用明細", title: "日ごとのコスト", unit: "日",
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
        + "営業日は平日から国民の祝日と会社の休日を除いた日です。経過が {FORECAST_MIN_BUSINESS_DAYS} 営業日未満のあいだは見込みを出しません（仮の基準）。",
      rows: "month[rows]",
      cols: [{ key: "day", kind: "mday", label: "日付", sort: null }, { key: "n", kind: "num", label: "営業日", sort: null },
        { key: "cost", kind: "usd", label: "その日のコスト", sort: null }, BAR("cost", "top"),
        { key: "cum", kind: "cum", label: "今月の累積", sort: null }, { key: "prev", kind: "usd_sub", label: "前月（{month[prev_month]:mon} 月）の累積", sort: null }],
      chipsBy: "mode", chips: [{ id: "bd", label: "営業日" }, { id: "cal", label: "暦日" }], chipsAll: false,
      chart: { kind: "month", key: "link", src: "month",
        legend: ["今月の実績 {month[actual]:usd}", "月末までの見込み {month[forecast]:usd}", "前月（{month[prev_month]:mon} 月）{month[prev_actual]:usd}"],
        axis: { bd: "横軸は営業日（休日の分は次の営業日に含める）", cal: "横軸は暦日（前月は同じ日付に重ねる）" },
        off: "{month[month]:mon} 月の週末・祝日・会社の休日" }, long: SAME },
    T04: { id: "people", label: "利用者ごとのコスト", hint: "{x[cost][users]:num} 人 · 利用明細", title: "利用者ごとのコスト", unit: "人",
      scope: "利用明細 {x[cost][start]:md}〜{x[cost][end]:md} · コストの多い順 · 前の期間は同じ長さの直前の期間",
      search: "利用者で絞り込み", q: "{email}", rows: "x[people]", sort: ["cost", "desc"], cols: PEOPLE_COST,
      chipsBy: "top_model", chipTerms: L.MODEL,
      long: { id: "people", label: "利用者ごとのコスト", hint: "{x[cost][users]:num} 人 · 利用明細", title: "利用者ごとのコスト", unit: "人",
        scope: "利用明細 {x[cost][start]:day}〜{x[cost][end]:day} · コストの多い順 · 前の期間と比べない",
        search: "利用者で絞り込み", q: "{email}", rows: "x[people]", sort: ["cost", "desc"], cols: PEOPLE_COST, chipsBy: "top_model", chipTerms: L.MODEL } },
    T05: { id: "activity", label: "利用者ごとの使い方", hint: "直近 {period[days]} 日 · 記録", title: "利用者ごとの使い方", unit: "人",
      scope: "直近 {period[days]} 日 · 記録 · 割合はその人の記録の中の割合", search: "利用者で絞り込み", q: "{email}",
      rows: "x[people]", sort: ["prompts", "desc"], cols: PEOPLE_USE,
      note: "記録を送っていない人（利用明細だけにいる人）は値が「—」になります。" },
    T06: { id: "models", label: "モデル", hint: "{x[models]:count} 種類 · 利用明細", title: "モデルごとのコストとトークン", unit: "行",
      scope: "利用明細 {x[cost][start]:md}〜{x[cost][end]:md} と前の {period[days]} 日", rows: "x[models]", sort: ["cost", "desc"],
      cols: [{ key: "key", kind: "model", label: "モデル" }, { key: "cost", kind: "usd_strong", label: "コスト" }, { key: "share", kind: "pct", label: "割合" }, BAR("share", "100"),
        { key: "prev", kind: "usd_sub", label: "前の期間" }, { key: "diff", kind: "diff", label: "差" }, { key: "users", kind: "num", unit: "person", label: "利用者" },
        { key: "tokens", kind: "tok", label: "トークン" }, { key: "cache_read", kind: "tok", label: "キャッシュ読み" }, { key: "per_mtok", kind: "usd", label: "100 万トークンあたり" }],
      long: SAME },
    T07: { id: "tokens", label: "利用者ごとのトークン", hint: "{x[cost][users]:num} 人 · 利用明細", title: "利用者ごとのトークン", unit: "人",
      scope: "利用明細 {x[cost][start]:md}〜{x[cost][end]:md} · キャッシュ読みの割合は入力側のトークンのうち", search: "利用者で絞り込み", q: "{email}",
      rows: "x[people]", sort: ["tokens", "desc"],
      cols: [{ key: "email", kind: "user", label: "利用者" }, { key: "tokens", kind: "tok", label: "トークン" }, BAR("tokens"),
        { key: "input", kind: "tok", label: "入力" }, { key: "output", kind: "tok", label: "出力" }, { key: "cache_read", kind: "tok", label: "キャッシュ読み" },
        { key: "cache_write", kind: "tok", label: "キャッシュ書き" }, { key: "cache_share", kind: "pct_strong", label: "キャッシュ読みの割合" }, { key: "top_model", kind: "model", label: "主なモデル" }],
      chipsBy: "top_model", chipTerms: L.MODEL, long: SAME },
    T09: { id: "dist", label: "1 人あたりコストの分布", hint: "利用明細", title: "1 人あたりコストの分布", unit: "区間",
      scope: "利用明細 {x[cost][start]:md}〜{x[cost][end]:md} · 利用者ごとの期間の合計", rows: "x[cost_dist]", cols: DIST_COLS("person"),
      chart: { kind: "hist", key: "bin", sides: ["now"], tick: "{label}" }, long: SAME },
    T11: { id: "skills", label: "スキル", hint: "{skills[kinds]:num} 種類 · {skills[recent]:num} 回", title: "スキルごとの呼び出し回数と利用者数", unit: "行",
      scope: "直近 {period[days]} 日と前の {period[days]} 日 · スキルの呼び出しの記録", search: "スキル名で絞り込み", q: "{name}", note: USAGE_NOTE,
      rows: "skills[rows]", sort: ["recent_calls", "desc"], cols: [{ key: "name", kind: "code", label: "スキル" }, ...CALLS],
      chipsBy: "trend", chips: chipsOf(L.TREND) },
    T12: { id: "commands", label: "コマンド", hint: "{commands[kinds]:num} 種類 · {commands[recent]:num} 回", title: "コマンドごとの呼び出し回数と利用者数", unit: "行",
      scope: "直近 {period[days]} 日と前の {period[days]} 日 · コマンドの呼び出しの記録 · 定義元は記録された値のまま",
      search: "コマンド名・定義元で絞り込み", q: "{name} {source}", note: "同じコマンドでも定義元が違えば別の行です。" + USAGE_NOTE,
      rows: "commands[rows]", sort: ["recent_calls", "desc"], cols: [{ key: "name", kind: "code", label: "コマンド" }, { key: "source", kind: "code", label: "定義元" }, ...CALLS],
      chipsBy: "trend", chips: chipsOf(L.TREND) },
    T13: { id: "tools", label: "ツール", hint: "{x[tools]:count} 種類 · 記録", title: "ツールごとの呼び出しと失敗", unit: "行",
      scope: "直近 {period[days]} 日 · ツール実行の記録 · 失敗は失敗の記録の数", rows: "x[tools]", sort: ["calls", "desc"],
      cols: [{ key: "key", kind: "code", label: "ツール" }, { key: "calls", kind: "num", unit: "times", label: "回数" }, { key: "share", kind: "pct", label: "割合" }, BAR("share", "100"),
        { key: "failures", kind: "num", label: "失敗" }, { key: "fail_rate", kind: "pct_strong", label: "失敗の割合" }, { key: "users", kind: "num", unit: "person", label: "利用者" }],
      chart: { kind: "bars", key: "key", dayKeys: false, tick: "{key}", panels: [{ title: "呼び出し回数", field: "calls" }] } },
    T14: { id: "usage", label: "使われ方", hint: "直近 {period[days]} 日 · 記録", title: "使われ方", unit: "行",
      scope: "直近 {period[days]} 日 · 記録の件数（開始のしかたはセッション開始の記録）· 割合は区分の中での割合", rows: "usage",
      cols: [{ key: "field", kind: "tag", terms: L.USAGE_FIELD, label: "区分" }, { key: "value", kind: "term", terms: L.USAGE_VALUE, by: "field", label: "値" },
        { key: "count", kind: "num", label: "件数" }, { key: "share", kind: "pct", label: "割合" }, BAR("share", "100")],
      chipsBy: "field", chips: chipsOf(L.USAGE_FIELD) },
    T15: { id: "context", label: "コンテキストの大きさ", hint: "応答終了時 · 記録", title: "応答終了時のコンテキストの大きさ", unit: "区間",
      scope: "直近 {period[days]} 日と前の {period[days]} 日 · 応答終了（Stop）の記録 · 区間の幅 {CONTEXT_BIN:tok} トークン", rows: "x[context]",
      cols: [{ key: "bin", kind: "bin", label: "トークン数の区間" }, { key: "prev", kind: "num", label: "前の件数" }, { key: "prev_share", kind: "pct", label: "前の割合" },
        { key: "recent", kind: "num", label: "直近の件数" }, { key: "recent_share", kind: "pct_strong", label: "直近の割合" }],
      chart: { kind: "hist", key: "bin", sides: ["prev", "recent"], terms: L.PERIOD } },
    T17: { id: "days_dist", label: "利用日数の分布", hint: "記録", title: "利用した日数ごとの人数", unit: "区間",
      scope: "直近 {period[days]} 日 · 記録を送った日の数", rows: "x[days_dist]", cols: DIST_COLS("person"),
      chart: { kind: "hist", key: "bin", sides: ["now"], tick: "{label}" } },
    T20: { id: "users", label: "利用者ごとの適用状況", hint: "{denominator:num} 人", title: "利用者ごとの適用状況", unit: "人", data: "fixed.policy",
      scope: "直近 {POLICY_DAYS} 日 · 対象 {denominator:num} 人", search: "利用者で絞り込み", q: "{email}", rows: "users", sort: ["rank", "asc"],
      note: "1 台でも違う値の端末があれば、その利用者は未適用と数えます。このため台数と人数は一致しません。{basis:basis_note}",
      cols: [{ key: "status", kind: "user_state", sort: "rank", label: "状態" }, { key: "email", kind: "user", label: "利用者" },
        { key: "terminals", kind: "dash_num", label: "端末" }, { key: "on", kind: "dot", each: "items", terms: L.SETTING }, { key: "day", kind: "last_day", label: "最終報告日" }],
      chipsBy: "status", chips: chipsOf(L.USER_STATE) },
    T21: { id: "terminals", label: "端末ごと", hint: "{counts[terminals]:num} 台", title: "端末ごとの設定・版・最終報告日", unit: "台", data: "fixed.policy",
      scope: "直近 {POLICY_DAYS} 日に設定の報告があった端末 · 端末ごとに最新の報告 1 件", search: "利用者・端末名・版で絞り込み", q: "{email} {host} {core}",
      note: L.STALE_NOTE, rows: "terminals", sort: ["rank", "asc"],
      cols: [{ key: "status", kind: "terminal_state", sort: "rank", label: "状態" }, { key: "email", kind: "user", label: "利用者" },
        { key: "host", kind: "code", label: "端末名" }, { key: "value", kind: "value", label: L.SETTING["env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"][0] },
        { key: "off_keys", kind: "off_keys", label: "未適用の設定" }, { key: "core", kind: "code", label: "本体の版" }, { key: "day", kind: "last_day", label: "最終報告日" }],
      chipsBy: "tags", chips: chipsOf(L.TERMINAL_STATE) },
    T22: { id: "settings", label: "設定ごと", hint: "{counts[items]:num} 設定", title: "設定ごとの適用率", unit: "行", data: "fixed.policy",
      scope: "直近 {POLICY_DAYS} 日 · 分母は{basis:basis}利用者 {denominator:num} 人", search: "設定名・キーで絞り込み", q: "{key:setting} {key}",
      note: "{basis:basis_note}", rows: "items", sort: ["rate", "asc"],
      cols: [{ key: "key", kind: "setting", terms: L.SETTING, label: "設定" }, { key: "numerator", kind: "ratio", label: "適用済み / 対象" },
        { key: "rate", kind: "pct_strong", label: "適用率" }, BAR("rate", "100"), { key: "off_terminals", kind: "num", unit: "terminal", label: "未適用の端末" }] },
    T23: { id: "versions", label: "バージョン", hint: "プラグイン・本体", title: "バージョンの分布", unit: "行", data: "fixed.policy",
      scope: "直近 {POLICY_DAYS} 日 · 端末ごとに最新の報告 1 件 · 古い版が残るのは更新が届いていない端末", rows: "versions",
      cols: [{ key: "kind", kind: "tag", terms: L.VERSION_KIND, label: "種類" }, { key: "version", kind: "version", sort: "order", label: "バージョン" },
        { key: "count", kind: "count_of", label: "端末数" }, BAR("count", "total")],
      chipsBy: "kind", chips: chipsOf(L.VERSION_KIND) },
    T30: { id: "health", label: "受信と項目の欠け", hint: "直近 7 日と前の 7 日", title: "受信と項目の欠け", unit: "行", data: "p.7",
      scope: "直近 7 日と前の 7 日 · 欠けの分母は、その項目が送られるはずの記録",
      note: "欠けは {NULL_RATE_ELEVATED}% 以下を正常、{NULL_RATE_ELEVATED}% 超を注意、{NULL_RATE_HIGH}% 超を要確認とします（仮の基準）。100% に跳ねたら上流の仕様変更を疑います。",
      rows: "health",
      cols: [{ key: "group", kind: "tag", terms: L.HEALTH_GROUP, label: "区分", sort: null }, { key: "item", kind: "term", terms: L.HEALTH_ITEM, label: "項目", sort: null },
        { key: "now", kind: "measure", label: L.RECENT, sort: null }, { key: "prev", kind: "measure_sub", label: L.PREV, sort: null },
        { key: "diff", kind: "diff", label: "差", sort: null }, { key: "state", kind: "state", label: "状態", sort: null }],
      chipsBy: "group", chips: chipsOf(L.HEALTH_GROUP) },
    T31: { id: "errors", label: "プラグインのエラー", hint: "直近 7 日 · {errors[total]:num} 件", title: "プラグインのエラー", unit: "行", data: "p.7",
      scope: "直近 7 日 · 端末 = 利用者とホスト名の組 · 失った記録は戻りません", search: "エラーの種類・版", q: "{error_type} {version} {stage}",
      rows: "errors[rows]", sort: ["count", "desc"],
      cols: [{ key: "stage", kind: "stage", terms: L.STAGE, label: "処理段階" }, { key: "error_type", kind: "code", label: "エラーの種類" },
        { key: "count", kind: "num", label: "件数" }, { key: "terminals", kind: "num", unit: "terminal", label: "端末数" }, { key: "version", kind: "code", label: "最後に起きた版" }],
      chipsBy: "stage", chipTerms: L.STAGE },
    T32: { id: "uncollected", label: "記録の無い利用者", hint: "{m[uncollected_rows]:count} 人", title: "記録の無い利用者", unit: "人", data: "p.7",
      scope: "利用明細の最終日までの 7 日 · 利用明細にコストがあるのに記録が無い人と、収集を止めた人", search: "利用者で絞り込み", q: "{email}",
      rows: "m[uncollected_rows]", sort: ["email", "asc"],
      cols: [{ key: "email", kind: "user", label: "利用者" }, { key: "reason", kind: "term", terms: { billed_only: ["利用明細だけ", "プラグイン未導入か送信の失敗"], stopped: ["収集を止めた", "報告はあるが記録が無い"] }, label: "理由" }],
      chipsBy: "reason", chips: [{ id: "billed_only", label: "利用明細だけ" }, { id: "stopped", label: "収集を止めた" }] },
    T40: histTab("precompact", "圧縮直前の分布", "圧縮直前のコンテキストの大きさ", "自動圧縮が走る直前（PreCompact）のトークン数"),
    T41: histTab("stop", "応答終了時の分布", "応答終了時のコンテキストの大きさ", "各応答が終わった時点（Stop）のトークン数"),
    T42: { id: "study", label: "日ごとの 1 人あたり", hint: "守り始めた日の前後 {EVENT_STUDY_SPAN} 日", title: "日ごとの 1 人あたりコストとトークン", unit: "日", data: "fixed.effect",
      scope: "守り始めた日を 0 日目とした前後 {EVENT_STUDY_SPAN} 日 · {EFFECT_PROVIDER:provider} · トークンは入力とキャッシュの読み書きの合計",
      note: "0 日目（守り始めた当日）は前後が混ざるため除いています。その日が利用明細の期間に入る人だけを数えるため、日ごとに人数が変わります。"
        + "時期による変動（繁忙・モデルの切り替えなど）を差し引いていないため、前後差を施策の効果と読まないでください。",
      rows: "study[rows]",
      cols: [{ key: "day", kind: "rel", label: "守り始めてからの日数" }, { key: "side", kind: "tag", terms: L.SIDE, label: "期間" },
        { key: "people", kind: "num", unit: "person", label: "対象者数" }, { key: "tokens", kind: "tok", label: "1 人あたりトークン" },
        { key: "cost", kind: "usd", label: "1 人あたりコスト" }, BAR("cost")],
      chipsBy: "side", chips: chipsOf(L.SIDE) },
  };

  T.T06.long = { ...T.T06, scope: "利用明細 {x[cost][start]:day}〜{x[cost][end]:day} · 前の期間と比べない", long: undefined };

  // ---- 組み立て ----
  // 群: 窓（W）の scope・longScope・data を継ぐ。カードの tab がページに無いタブなら、押せないカードにする（page で外す）
  const group = (id, label, w, cards, extra = {}) => ({ id, label, ...w, ...extra, cards });
  const tabIds = (tabs) => new Set(tabs.flatMap((t) => [t.id, t.long && t.long !== SAME ? t.long.id : null]).filter(Boolean));
  const unlink = (card, ids) => {
    if (!card || card === SAME) return card;
    const c = { ...card };
    if (c.tab && !ids.has(c.tab)) { delete c.tab; delete c.chip; }
    if (c.long && c.long !== SAME) c.long = unlink(c.long, ids);
    return c;
  };
  const page = (p) => {
    const ids = tabIds(p.tabs || []);
    return { ...p, groups: p.groups.map((g) => ({ ...g, cards: g.cards.map((c) => unlink(c, ids)) })) };
  };

  // データと設定（今の構成のまま）
  const SETTINGS = {
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

  // ---- 案 12 端末の管理にまとめる ----
  const use = page({
    id: "use", title: "利用", lead: "誰がどれだけの頻度で使っているか", periods: true,
    groups: [
      group("rec", "記録", W.rec, [K.K01, K.K02, K.K03, K.K04]),
      group("bill", "利用明細", W.bill, [K.K10, K.K11, K.K12, K.K13]),
    ],
    tabs: [T.T05, T.T01, T.T17, T.T14],
  });
  const cost = page({
    id: "cost", title: "コスト", lead: "いくらかかり、誰とどのモデルに集まっているか", periods: true,
    groups: [
      group("span", "期間", W.bill, [K.K20, K.K21, K.K24, K.K23, K.K40, K.K41]),
      group("month", "今月", W.month, [K.K27, K.K28, K.K29, K.K30]),
    ],
    tabs: [T.T04, T.T02, T.T03, T.T06, T.T07],
  });
  const assets = page({
    id: "assets", title: "スキルとコマンド", lead: "どの機能が誰に使われているか", periods: true,
    groups: [
      group("calls", "呼び出し", W.rec, [K.K50, K.K51, K.K52, K.K53]),
      group("delegate", "任せ方", W.rec, [K.K55, K.K60, K.K63]),
    ],
    tabs: [T.T11, T.T12, T.T13],
  });
  const terminal = page({
    id: "terminal", title: "端末", lead: "端末に設定が入り、最新で、記録を送っているか",
    groups: [
      group("settings", "設定", W.p30, [K.K80, K.K81, K.K82]),
      group("install", "導入と版", W.p30, [K.K90, K.K91, K.K92, K.K93]),
      group("recv", "受信", W.rec7, [K.K100, K.K102, K.K103]),
      group("match", "照合", W.match7, [K.K101, K.K104, K.K108]),
    ],
    tabs: [T.T20, T.T21, T.T22, T.T23, T.T30, T.T31, T.T32],
  });
  const effect = page({
    id: "effect", title: "設定の効果", lead: "しきい値は働いているか",
    groups: [
      group("context", "コンテキスト", W.ba, [K.K110, K.K111]),
      group("spend", "コストの前後", W.baCost, [K.K112, K.K113, K.K114]),
    ],
    tabs: [T.T40, T.T41, T.T42],
  });
  window.IA = { id: "12-terminal-management", name: "案 12 端末の管理にまとめる", pages: [use, cost, assets, terminal, effect, SETTINGS] };
})();
