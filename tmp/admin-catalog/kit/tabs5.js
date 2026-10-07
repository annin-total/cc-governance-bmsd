"use strict";
// 案 51 だけが読むタブの差し替え（look.org）: 利用者の並ぶタブ（目録の org: true）に「課」の列を利用者の右に足し、
// 行に部署の絞り込みの data-*（deptfilter.js）を付ける。タブ「部署ごと」（depts）は部の行・課の行・不明の行。
(() => {
  const K = window.KIT;
  const { T } = window.CATALOG;
  const UNKNOWN = "unknown";
  const SECTION = { key: "section", kind: "section", label: "課" };
  const secKey = (dept, section) => `${dept}|${section ?? ""}`; // 課は部の中で一意。空の課も部ごとに 1 つ
  const userRow = (r) => ({ dept: r.dept ?? UNKNOWN, sec: r.dept === null || r.dept === undefined ? "" : secKey(r.dept, r.section) });

  function withSection(tab) {
    const at = tab.cols.findIndex((c) => c.kind === "user");
    const cols = [...tab.cols.slice(0, at + 1), SECTION, ...tab.cols.slice(at + 1)];
    return { ...tab, cols, rowData: userRow, ...(tab.long && tab.long !== "same" ? { long: withSection(tab.long) } : {}) };
  }

  const adapt = (tab) => (K.look.get().org && tab.org ? withSection(tab) : tab);
  window.CATALOG.tabAdapters = [...(window.CATALOG.tabAdapters || []), adapt];

  // ---- 部署ごと（コストと利用者）。利用率の列は置かない（名簿の全員が対象者ではない）----
  const NAME = { key: "dept", kind: "dept_name", label: "部署", sort: null };
  const HEAD = [NAME, { key: "users", kind: "num", unit: "person", label: "利用者数", sort: null }, { key: "cost", kind: "usd_strong", label: "コスト", sort: null }];
  const PREV = [{ key: "diff", kind: "usd", label: "前との差", sort: null }, { key: "change", kind: "pct_change", label: "増減率", sort: null }];
  const TAIL = [{ key: "share", kind: "pct", label: "コストに占める割合", sort: null }, { key: "per_user_bd", kind: "usd", label: "1 人 1 営業日あたり", sort: null }];
  const OVER = { key: "over", kind: "num", unit: "person", label: "基準を超えた利用者", sort: null };
  const deptRow = (r) => ({ kind: r.kind, dept: r.dept ?? UNKNOWN, sec: r.kind === "section" ? secKey(r.dept, r.section) : "" });
  const BASE = { id: "depts", label: "部署ごと", hint: "{F[org][depts_n]:num} 部 · {F[org][sections_n]:num} 課 · 利用明細", title: "部署ごとの利用者とコスト", unit: "行", rows: "r5[depts]", rowData: deptRow };
  T.depts = { ...BASE, cols: [...HEAD, ...PREV, ...TAIL, OVER],
    scope: "利用明細 {r3[cost][start]:md}〜{r3[cost][end]:md} と前の {period[days]} 日 · 部の行は部全体の合算、その下に課（コストの多い順）· 名簿に無い人は「不明」",
    note: "基準を超えた利用者は注意以上の人数です（7 日は週次、28 日は月次）。課で絞っても、部の行は部全体の合算のままです。",
    long: { ...BASE, cols: [...HEAD, ...TAIL], scope: "利用明細 {r3[cost][start]:day}〜{r3[cost][end]:day} · 部の行は部全体の合算、その下に課（コストの多い順）· 名簿に無い人は「不明」" } };
})();
