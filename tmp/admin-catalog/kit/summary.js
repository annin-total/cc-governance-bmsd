"use strict";
// サマリーの部品: 概況の先頭の最新 1 件（見出しはタイトル）・一覧（データと設定の書き出すと同じ形のアコーディオン）・作成と編集のフォーム・下書き。
// 下書きは概況のカードのうち注意・要確認のものを 1 行ずつ並べる（期間は 7 日）。本文が null の見本は、この下書きを本文にする。
(() => {
  const K = window.KIT;
  const { esc, fill } = K;
  const WEEK = 7;
  const W = {
    list: "一覧へ", asofNote: "基準日 {asof:md} の値 · 作成 {created:day}", edit: "編集",
    head: ["作成日", "タイトル", "基準日", "更新日", ""], empty: "サマリーはまだありません。",
    fields: { asof: "基準日", title: "タイトル", body: "本文" }, draft: "下書きを作る", save: "保存", back: "一覧に戻る",
    title: "週次サマリー（{from:md}〜{asof:md}）", bullet: "・",
    note: "下書きを作ると、本文を基準日の概況の注意・要確認のカードで置き換えます。指示やセッションの数などの規模の数字は入りません。要るときは手で書いてください。",
  };

  function draft() {
    const home = window.IA.pages.find((p) => p.home);
    const lines = [];
    for (const g of home ? home.groups : []) {
      const ctx = K.contextOf(g.data || "p.{period}", "7");
      for (const c of g.cards.filter((x) => !x.only || x.only.includes("7"))) {
        const t = K.card.stateOf(c, ctx);
        if (t !== "warn" && t !== "ng") continue;
        const value = c.value ? ` ${fill(c.value, ctx)}${c.unit ? ` ${c.unit}` : ""}` : "";
        const why = c.why ? K.L.DRAFT_WHY.replace("{}", fill(c.why, ctx)) : "";
        lines.push(W.bullet + fill(K.L.DRAFT_LINE, { state: K.L.STATE[t], label: fill(c.label, ctx), value, why }));
      }
    }
    return lines.join("\n");
  }

  const bodyOf = (s) => (s.body ?? draft()) + (s.note ? `\n\n${s.note}` : "");
  const titleOf = (asof) => fill(W.title, { from: asof - WEEK + 1, asof });
  const all = () => window.DATA.fixed.r3.summaries;

  // 要確認・注意の数（作った時点のカードの枚数。本文が無い見本は下書きの行から数える）
  function counts(s) {
    if (s.ng !== null && s.ng !== undefined) return { ng: s.ng, warn: s.warn };
    const lines = draft().split("\n");
    const n = (t) => lines.filter((x) => x.startsWith(`${W.bullet}${K.L.STATE[t]} `)).length;
    return { ng: n("ng"), warn: n("warn") };
  }

  // 案 51 の S2: 枠の外の見出しを出さず、枠の中の 1 行目に「サマリー」と要確認・注意の数、2 行目にタイトル、3 行目に対象と作成日
  function framed(s) {
    const L = K.L, c = counts(s);
    const tally = ["ng", "warn"].map((t) => `<span class="sum-tally"><i class="dot ${t}"></i>${esc(L.STATE[t])}<b>${K.num(c[t])}</b></span>`).join("");
    return `<section class="summary-latest sum-s2" aria-label="${esc(s.title)}"><div class="panel sum-panel"><div class="sum-top"><b class="sum-head">${esc(L.SUM_HEAD)}</b>${tally}`
      + `<a class="glink" href="${esc(K.basedate.keep("?page=summary"))}">${esc(L.SUM_MORE)}</a></div><b class="sum-title">${esc(s.title)}</b>`
      + `<span class="sum-meta">${esc(fill(L.SUM_META, { ...s, from: s.asof - WEEK + 1 }))}</span><p class="sum-body">${esc(bodyOf(s))}</p></div></section>`;
  }

  function latest() {
    const s = all()[0];
    if (!s) return "";
    if (K.look.get().sum === "S2") return framed(s);
    return `<section class="group summary-latest" aria-label="${esc(s.title)}"><h2 class="glabel">${esc(s.title)}<span>${esc(fill(W.asofNote, s))}</span>`
      + `<a class="glink" href="${esc(K.basedate.keep("?page=summary"))}">${W.list}</a></h2><div class="panel sum-panel"><p class="sum-body">${esc(bodyOf(s))}</p></div></section>`;
  }

  function list() {
    const rows = all().map((s) => `<details class="m-item"><summary class="m-row"><span class="m-month">${esc(K.day(s.created))}</span><span class="sum-name">${esc(s.title)}</span>`
      + `<span class="num">${esc(K.md(s.asof))}</span><span class="num">${esc(K.day(s.updated))}</span><a class="btn-sub" href="${esc(K.basedate.keep(`?page=summary_edit&id=${s.id}`))}">${W.edit}</a></summary>`
      + `<p class="sum-body sum-open">${esc(bodyOf(s))}</p></details>`).join("");
    return `<div class="months sum-list" data-testid="summaries"><div class="m-row m-head">${W.head.map((h, i) => `<span${i > 1 && i < 4 ? ' class="num"' : ""}>${esc(h)}</span>`).join("")}</div>${rows}</div>`
      + (all().length ? "" : `<p class="empty">${W.empty}</p>`);
  }

  function form() {
    const bill = K.look.get().ends === "bill", m = window.DATA.meta;
    const today = bill ? m.end : m.asof, first = bill ? m.first_pick : m.first_day + 27; // 案 51 の基準日は利用明細の最終日まで
    const s = all().find((x) => x.id === new URLSearchParams(location.search).get("id"));
    const asof = s ? s.asof : today;
    const body = s ? bodyOf(s) : draft();
    return `<form class="sum-form" onsubmit="return false" data-summary-form>`
      + `<label>${W.fields.asof}<input type="date" value="${K.day(asof)}" min="${K.day(first)}" max="${K.day(today)}" data-sum-asof></label>`
      + `<label class="grow">${W.fields.title}<input type="text" value="${esc(s ? s.title : titleOf(asof))}" data-sum-title></label>`
      + `<label class="full">${W.fields.body}<textarea rows="12" data-sum-body>${esc(body)}</textarea></label>`
      + `<div class="sum-actions"><button type="button" class="btn-sub" data-sum-draft>${W.draft}</button><button type="submit" class="btn">${W.save}</button><a class="sum-back" href="${esc(K.basedate.keep("?page=summary"))}">${W.back}</a></div>`
      + `</form><p class="note">${esc(W.note)}</p>`;
  }

  K.blocks = Object.assign(K.blocks || {}, { summary_latest: latest, summaries: list, summary_form: form });
  K.summary = { draft, titleOf };
})();
