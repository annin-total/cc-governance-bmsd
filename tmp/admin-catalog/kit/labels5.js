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
    DF_ALL: "すべて", DF_BUTTON: "部署: {}", DF_MORE: "{} ほか {n}", DF_LINK: "部署で絞り込む", DF_CLEAR: "すべて解除", DF_NO_SECTION: "（課なし）", DF_SEARCH: "部・課を探す", DF_ADD: "＋ 部署", DF_NAV: "部署の絞り込み",
    FC_PREV_CHIP_TPL: "{month[prev_month]:mon} 月の実績 {month[prev_actual]:usd}",
    K5: {
      area: "日ごと · 地のある区間が直近", area_shadow: "直近の日ごと · 点線は前の期間（曜日をそろえる）",
      bdbars: "営業日ごと · 濃い棒が直近", bdbars_avg: "営業日ごと · 点線は前の 1 営業日あたり · 直近で超えた日 {n} / {m}",
      months: "暦月ごと · 濃い棒が直近 12 か月、灰が前の 12 か月 · 薄い棒は月の途中まで",
      per_user: "1 人あたり", line: "営業日ごと · 青い線が直近", grid: "曜日（行）× 週（列）· 濃いほど多い", grid_t: "曜日（列）× 週（行）· 濃いほど多い · 薄いマスは前の期間",
      dist: "{n:num} 人の分布 · 実線は平均 · 点線は中央値 {median:usd}",
      split_parts: { users: "人数の分", per: "1 人あたりの分" }, split: "前との差 {diff:signed_usd} の内訳",
      cum: [["k5-key-line", "今月"], ["k5-key-fc", "見込み"]],
      cum_prev: [["k5-key-line", "今月"], ["k5-key-fc", "見込み"], ["k5-key-prev", "{month[prev_month]:mon} 月"]],
      cum_cap: "実績 {month[actual]:usd} · {month[elapsed]:num} / {month[business_days]:num} 営業日",
    },
    CONC: {
      cost: "コスト", people: "人数", users_head: "利用者の集中", depts_head: "部署ごとの人数とコスト",
      cc1: "横は人数、縦はコスト（どちらも多い順に積み上げた割合）· 対角線は全員が同じ額のとき", cc1_prev: " · 薄い線は前の期間",
      cc2: "利用者ごとのコスト（多い順）と、積み上げたコストの割合の線",
      cc3: "期間の基準の状態ごとに、コストと人数の割合を上下にそろえる", cc3_row: "{state} {n:num} 人 · コストの {share:pct}",
      cc3_na: "12 か月は基準で分けないため出しません", cc4: "1 人 1 マス · 多い順 · 濃いほどコストが多い",
      cd1: "左は人数の割合、右はコストの割合（利用明細にコストがあった利用者のうち）",
      cd2: "幅は人数、高さは 1 人あたりのコスト、面積はコスト（課ごと。色は部）",
      cd3: "面積はコスト（部→課。詳細タブは利用者まで）· 色は部", cd4: "課ごと · 横は人数、縦は 1 人あたりのコスト、点の大きさはコスト",
    },
    SUM_HEAD: "サマリー", SUM_MORE: "これまでのサマリー", SUM_META: "対象 {from:md}〜{asof:md} · 作成 {created:md}",
    OVER_MOVE: "注意→要確認 {up} · 要確認→注意 {down}", OVER_WORSE: "悪化 {} 人", OVER_BETTER: "改善 {} 人",
    OVER_IN: "新規 {} 人", OVER_OUT: "離脱 {} 人", OVER_DIFF: "{} 人", OVER_TABLE: { head: "前＼今", ok: "正常", warn: "注意", ng: "要確認" },
    CMP_OPEN: "☰ 比較", CMP_TITLE: "比較用の切り替え", CMP_COPY: "この組み合わせの URL をコピー", CMP_COPIED: "コピーしました", CMP_RESET: "既定に戻す",
  });
})();
