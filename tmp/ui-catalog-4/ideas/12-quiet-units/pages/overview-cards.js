"use strict";
// 概況の上段（群とカード）。7 日・28 日は今の画面と同じカード、12 か月は利用明細のカードだけと群ごとの注記
window.OverviewCards = (() => {
  const D = window.DATA, X = window.DATA_EXTRA, F = window.Fmt, U = window.UI, C = window.Charts, T = window.SparkTip;
  const STAGE = { send: "送信", apply_settings: "設定の書き込み", collect: "記録の収集" };
  const NULL_LABEL = { tool_name: "ツール名", skill_name: "スキル名", context_tokens: "コンテキストのトークン数", command_source: "コマンドの定義元" };
  const STATE_LABEL = { ok: "正常", warn: "注意", ng: "要確認" };
  const ERROR_WARN_FROM = 1; // エラーが 1 件でもあれば注意（今の画面の見た目に合わせた仮の値）

  const range = ([a, b]) => `${F.md(a)}〜${F.md(b)}`;
  const costDays = (p) => D.daily_cost.filter((r) => r.day >= p.cost_window.prev[0] && r.day <= p.cost_window.recent[1]);
  const trendSpark = (k, key, fmt) => {
    const tr = D.periods[k].trend, n = Number(k);
    const tips = T.series({ labels: tr.map((r) => T.dayLabel(r.day)), values: tr.map((r) => r[key]), fmt, prevOffset: n });
    return C.spark(tr.map((r) => r[key]), { from: n, tips }) + U.cap(F.md(tr[0].day), `濃い部分が直近 ${n} 日`, F.md(tr[tr.length - 1].day));
  };

  function usage(k) {
    const p = D.periods[k], n = Number(k), prev = `前の ${n} 日`, days = costDays(p);
    const costTips = T.series({ labels: days.map((r) => T.dayLabel(r.day)), values: days.map((r) => r.total), fmt: F.usdText, prevOffset: n });
    return [
      U.card({ label: "送信した利用者", open: "daily", value: p.users.recent, unit: "人", sub: `${U.change(F.signed(p.users.delta), p.users.delta > 0)}${prev} ${F.withUnit(p.users.prev, "人")}`,
        viz: trendSpark(k, "users", (v) => F.unitText(v, "人")) }),
      U.card({ label: "1 日あたりのセッション", open: "daily", value: F.fixed(p.sessions_per_day.recent, 1), unit: "件",
        sub: `${U.change(F.signed(p.sessions_per_day.delta, 1), p.sessions_per_day.delta > 0)}${prev} ${F.withUnit(F.fixed(p.sessions_per_day.prev, 1), "件")}`,
        viz: trendSpark(k, "sessions", (v) => F.unitText(v, "件")) }),
      U.card({ label: "コスト（利用明細）", open: "cost", value: F.usd(p.cost.recent), sub: `${U.change(F.signed(p.cost.change, 1, "%"), p.cost.change > 0)}${prev} ${F.usd(p.cost.prev)}`,
        viz: C.spark(days.map((r) => r.total), { from: n, tips: costTips }) + U.cap(F.md(days[0].day), `${range(p.cost_window.recent)} の合計`, F.md(days[days.length - 1].day)) }),
      window.ForecastCard.card(),
      U.card({ label: "確認なしモードの記録", open: "modes", value: F.fixed(p.bypass.rate, 1), unit: "%", sub: `${F.int(p.bypass.numerator)} 件 / 全 ${F.int(p.bypass.denominator)} 件`,
        viz: U.meter(p.bypass.rate, "権限モード「確認なし」の割合") }),
    ].join("");
  }

  function delivery(k) {
    const p = D.periods[k], n = Number(k), r = X.records[k], maxEv = Math.max(p.events.recent, p.events.prev);
    const worst = r.nulls.reduce((a, b) => (b.recent > a.recent ? b : a)), okCount = r.nulls.filter((x) => x.state === "ok").length;
    const errState = p.errors.total >= ERROR_WARN_FROM ? "warn" : "ok";
    return [
      U.card({ label: "受信した記録", open: "health", value: F.int(p.events.recent), unit: "件", sub: `${U.change(F.signed(p.events.delta), p.events.delta > 0)}前の ${n} 日 ${F.withUnit(F.int(p.events.prev), "件")}`,
        viz: `<span class="pair"><span>前の ${n} 日</span>${U.hbarSpan((p.events.prev / maxEv) * 100, true)}</span><span class="pair"><span>直近 ${n} 日</span>${U.hbarSpan((p.events.recent / maxEv) * 100)}</span>` }),
      U.card({ label: "CSV との照合率", open: "health", value: F.fixed(p.reconciliation.rate, 1), unit: "%", sub: `CSV にもいた ${p.reconciliation.numerator} 人 / 送信した ${p.reconciliation.denominator} 人`,
        viz: U.meter(p.reconciliation.rate, "前との比較なし") }),
      U.card({ label: "プラグインのエラー", open: "errors", mark: U.mark(errState, STATE_LABEL[errState]), value: p.errors.total, unit: "件", sub: `${p.errors.kinds} 種類 · 前との比較なし`,
        viz: `<span class="stack">${p.errors.stages.map(([, c], i) => `<i class="warn-${i}" style="flex: ${c}"></i>`).join("")}</span>
<span class="legend">${p.errors.stages.map(([s, c], i) => `<span><i class="warn-${i}"></i>${STAGE[s] || F.esc(s)} ${c}</span>`).join("")}</span>` }),
      U.card({ label: "項目の欠け（最大）", open: "health:null", mark: U.mark(worst.state, STATE_LABEL[worst.state]), value: F.fixed(worst.recent, 1), unit: "%",
        sub: `${NULL_LABEL[worst.key]} · ${okCount} / ${r.nulls.length} 項目が正常`,
        viz: `<span class="rates">${r.nulls.map((x) => `<span class="rate"><span>${NULL_LABEL[x.key]}</span>${U.hbarSpan(x.recent)}<span class="num strong">${F.pct(x.recent)}</span></span>`).join("")}</span>` }),
    ].join("");
  }

  // 12 か月: 利用明細から数えるカードだけ
  function usageLong() {
    // 折れ線は途中の週（最後の週）を除く。1 日分の値が落ち込みに見えるため
    const t = X.twelve, w = D.twelve_months.weeks.filter((x) => !x.partial), lastFull = w[w.length - 1];
    const tips = (fmt, key) => T.series({ labels: w.map(T.weekLabel), values: w.map((x) => x[key]), fmt });
    const cap = U.cap(F.slash(t.start.slice(0, 7)), "完了した週ごと", F.md(F.toDay(lastFull.end)));
    return [
      U.card({ label: "利用明細にいた利用者", open: "daily", value: t.users, unit: "人", sub: `直近の週（${F.md(F.toDay(lastFull.start))}〜${F.md(F.toDay(lastFull.end))}）${F.withUnit(lastFull.users, "人")}`,
        viz: C.spark(w.map((x) => x.users), { tips: tips((v) => F.unitText(v, "人"), "users") }) + cap }),
      U.card({ label: "コスト（利用明細）", open: "cost", value: F.usd(t.cost), sub: `月平均 ${F.usd(t.cost / 12)} · 前の期間と比べない`,
        viz: C.spark(w.map((x) => x.cost), { tips: tips(F.usdText, "cost") }) + cap }),
      window.ForecastCard.card(),
    ].join("");
  }

  function groups(k) {
    const Tw = window.Twelve;
    if (k === "12m") {
      return U.group("利用", Tw.scope(), usageLong(), Tw.groupNote(["送信した利用者", "1 日あたりのセッション", "確認なしモードの記録"]))
        + U.group("データの届き具合", "直近 12 か月", "", Tw.groupNote(["受信した記録", "CSV との照合率", "プラグインのエラー", "項目の欠け"]));
    }
    const n = Number(k);
    return U.group("利用", `直近 ${n} 日と、その前の ${n} 日`, usage(k))
      + U.group("データの届き具合", `直近 ${n} 日と、その前の ${n} 日（照合率は利用明細の最終日までの ${n} 日）`, delivery(k));
  }

  return { groups, NULL_LABEL, STATE_LABEL, STAGE };
})();
