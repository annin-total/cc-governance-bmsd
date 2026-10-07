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
    DF_ALL: "すべて", DF_BUTTON: "部署: {}", DF_MORE: "{} ほか {n}", DF_LINK: "部署で絞り込む", DF_CLEAR: "すべて解除", DF_NAV: "部署の絞り込み",
    FC_PREV_CHIP: "{month:mon} 月の実績 {value:usd}",
    SUM_HEAD: "サマリー", SUM_MORE: "これまでのサマリー", SUM_META: "対象 {from:md}〜{asof:md} · 作成 {created:md}",
    OVER_MOVE: "注意→要確認 {up} · 要確認→注意 {down}", OVER_WORSE: "悪化 {} 人", OVER_BETTER: "改善 {} 人",
    OVER_IN: "新規 {} 人", OVER_OUT: "離脱 {} 人", OVER_DIFF: "{} 人", OVER_TABLE: { head: "前＼今", ok: "正常", warn: "注意", ng: "要確認" },
    CMP_OPEN: "☰ 比較", CMP_TITLE: "比較用の切り替え", CMP_COPY: "この組み合わせの URL をコピー", CMP_COPIED: "コピーしました", CMP_RESET: "既定に戻す",
  });
})();
