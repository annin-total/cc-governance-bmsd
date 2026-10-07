"use strict";
// 案 51 だけが使う語（index5.html だけが読む）。KIT.L に足す。
(() => {
  Object.assign(window.KIT.L, {
    STALE: "利用明細は {csv_end:md} まで（{age} 日前）",
    CAL_LEGEND: { has: "利用明細あり", wait: "利用明細の取り込み待ち", none: "利用明細なし" },
    CAL_PREV: "前の月", CAL_NEXT: "次の月", CAL_OPEN: "カレンダーを開く", CAL_STEP_BACK: "{} 日前の期間へ", CAL_STEP_NEXT: "{} 日後の期間へ",
    CAL_HEAT: "濃いほどその日のコストが多い",
    CAL_PICKS: { latest: "最新", prev: "1 つ前の期間", month_end: "先月末", month_end2: "前の月末" },
    UNKNOWN: "不明", NO_SECTION: "—", SECTION: "課", DEPT: "部", DEPT_COL: "部署",
    DF_ALL: "すべて", DF_BUTTON: "部署: {}", DF_MORE: "{} ほか {n}", DF_LINK: "部署で絞り込む", DF_CLEAR: "すべて解除", DF_NO_SECTION: "（課なし）", DF_NAV: "部署の絞り込み",
    FC_PREV_CHIP_TPL: "{month[prev_month]:mon} 月の実績 {month[prev_actual]:usd}",
    K5: {
      area: "日ごとのコスト", area_shadow: "日ごと · 薄い線は前の期間（曜日をそろえる）",
      bdbars: "営業日ごと", bdbars_avg: "営業日ごと · 点線は前の 1 営業日あたり · 超えた日 {n} / {m}",
      per_user: "1 人あたり", line: "営業日ごとの揺れ", grid: "曜日（行）× 週（列）· 濃いほど多い",
      dist: "{n:num} 人の分布 · 実線は平均 · 点線は中央値 {median:usd}",
      split_parts: { users: "人数の分", per: "1 人あたりの分" }, split: "前との差 {diff:signed_usd} の内訳",
      cum: [["k5-key-line", "今月"], ["k5-key-fc", "見込み"]],
      cum_prev: [["k5-key-line", "今月"], ["k5-key-fc", "見込み"], ["k5-key-prev", "{month[prev_month]:mon} 月"]],
      cum_cap: "実績 {month[actual]:usd} · {month[elapsed]:num} / {month[business_days]:num} 営業日",
    },
    SUM_HEAD: "サマリー", SUM_MORE: "これまでのサマリー", SUM_META: "対象 {from:md}〜{asof:md} · 作成 {created:md}",
    OVER_MOVE: "注意→要確認 {up} · 要確認→注意 {down}", OVER_WORSE: "悪化 {} 人", OVER_BETTER: "改善 {} 人",
    OVER_IN: "新規 {} 人", OVER_OUT: "離脱 {} 人", OVER_DIFF: "{} 人", OVER_TABLE: { head: "前＼今", ok: "正常", warn: "注意", ng: "要確認" },
    CMP_OPEN: "☰ 比較", CMP_TITLE: "比較用の切り替え", CMP_COPY: "この組み合わせの URL をコピー", CMP_COPIED: "コピーしました", CMP_RESET: "既定に戻す",
  });
})();
