"use strict";
// 区画（sections）で組むページ: サマリーの一覧・作成と編集、データと設定（全案で今のまま）。区画の部品は boot.js と summary.js。
(() => {
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

  const summary = {
    id: "summary", title: "サマリー", nav: "end", data: "fixed.r3",
    lead: "週ごとのまとめ · 作成日の新しい順 · 行を押すと本文が開きます",
    sections: [
      { id: "summaries", title: "サマリー", lead: "本文はプレーンテキストです。作成日と更新日は保存したときに付きます。",
        action: { label: "作成", href: "?page=summary_edit" }, blocks: [{ kind: "summaries" }] },
    ],
  };
  const summaryEdit = {
    id: "summary_edit", title: "サマリーの作成と編集", nav: "none", navAs: "summary", data: "fixed.r3",
    lead: "基準日の概況のうち、注意・要確認のカードを下書きにできます",
    sections: [{ id: "summary-form", title: "サマリー", lead: "基準日は今日まで · 下書きは概況のカードだけから作ります", blocks: [{ kind: "summary_form" }] }],
  };

  window.CATALOG.sectionPages = [summary, summaryEdit, settings];
})();
