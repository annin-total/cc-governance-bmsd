"use strict";
// 上段の要点（カード）を期間ごとに組み立てる。定義の配列 → HTML
(() => {
  const D = window.DATA, F = window.Fmt, C = window.Charts;
  const STAGE = { send: "送信", apply_settings: "設定の書き込み", collect: "記録の収集" };
  const NULL_RATES = [["ツール名", 9.2], ["スキル名", 6.4], ["コンテキストのトークン数", 8.6], ["コマンドの定義元", 11.7]];
  const FORECAST_MIN_DAYS = 3;

  const chip = (text, up) => `<span class="change${up ? " up" : ""}">${text}</span>`;
  const card = ({ label, open, mark, value, unit = "", sub, viz }) => `<a class="card" href="#${open.split(":")[0]}" data-open="${open}">
  <span class="k-label"><span>${label}</span>${mark || '<span class="go">一覧</span>'}</span>
  <span class="k-value">${value}<span class="u">${unit}</span></span>
  <span class="k-sub">${sub}</span>
  <span class="k-viz">${viz}</span></a>`;
  const cap = (...xs) => `<span class="cap">${xs.map((x) => `<span>${x}</span>`).join("")}</span>`;
  const meter = (pct, note) => `<span class="meter"><i style="width: ${pct}%"></i></span>${cap(note)}`;

  function costDays(p) {
    const [a] = p.cost_window.prev, [, b] = p.cost_window.recent;
    return D.daily_cost.filter((r) => r.day >= a && r.day <= b);
  }

  function forecast() {
    const m = D.month_forecast, mon = Number(m.month.slice(5)), prevMon = Number(m.prev_month.slice(5));
    const ok = m.elapsed_business_days >= FORECAST_MIN_DAYS;
    const diff = ((m.per_business_day - m.prev_per_business_day) / m.prev_per_business_day) * 100;
    const max = Math.max(m.prev_total, m.forecast);
    const w = (v) => ((v / max) * 100).toFixed(1);
    return card({
      label: `月末のコスト見込み（${mon} 月）`, open: "cost", value: ok ? F.usdWhole(m.forecast) : "—",
      sub: `${chip(F.signed(diff, 1, "%"), diff > 0)}営業日あたり ${F.usdWhole(m.per_business_day)} · 前月 ${F.usdWhole(m.prev_per_business_day)}`,
      viz: `<span class="fc">
  <span class="fc-row" data-tip="${prevMon} 月の合計 ${F.usdWhole(m.prev_total)}\n${m.prev_business_days} 営業日 · 営業日あたり ${F.usdWhole(m.prev_per_business_day)}"><span>${prevMon} 月</span><span class="hbar ghost"><i style="width: ${w(m.prev_total)}%"></i></span><span class="num">${F.usdWhole(m.prev_total)}</span></span>
  <span class="fc-row" data-tip="${mon} 月の見込み ${F.usdWhole(m.forecast)}\n実績 ${F.usdWhole(m.actual)}（${F.md(F.toDay(m.as_of))} まで）\n${m.elapsed_business_days} / ${m.business_days} 営業日が経過"><span>${mon} 月</span><span class="hbar fc-bar"><i style="width: ${w(m.actual)}%"></i><i class="rest" style="width: ${(w(m.forecast) - w(m.actual)).toFixed(1)}%"></i></span><span class="num strong">${F.usdWhole(m.forecast)}</span></span>
</span>${cap(`実績 ${F.usdWhole(m.actual)} · ${m.elapsed_business_days} / ${m.business_days} 営業日`, `${F.md(F.toDay(m.as_of))} まで`)}`,
    });
  }

  function usage(k) {
    const p = D.periods[k], n = Number(k), tr = p.trend, days = costDays(p);
    const trCap = cap(F.md(tr[0].day), `濃い部分が直近 ${n} 日`, F.md(tr[tr.length - 1].day));
    const tips = (key, unit) => tr.map((r) => [`${F.md(r.day)}${F.wd(r.day)} ${r[key]} ${unit}`]);
    const c = p.cost;
    return [
      card({ label: "送信した利用者", open: "daily", value: p.users.recent, unit: "人",
        sub: `${chip(F.signed(p.users.delta), p.users.delta > 0)}前の ${n} 日 ${p.users.prev} 人`,
        viz: C.spark(tr.map((r) => r.users), tips("users", "人"), n) + trCap }),
      card({ label: "1 日あたりのセッション", open: "daily", value: p.sessions_per_day.recent.toFixed(1), unit: "件",
        sub: `${chip(F.signed(p.sessions_per_day.delta, 1), p.sessions_per_day.delta > 0)}前の ${n} 日 ${p.sessions_per_day.prev.toFixed(1)} 件`,
        viz: C.spark(tr.map((r) => r.sessions), tips("sessions", "件"), n) + trCap }),
      card({ label: "コスト（利用明細）", open: "cost", value: F.usd(c.recent),
        sub: `${chip(F.signed(c.change, 1, "%"), c.change > 0)}前の ${n} 日 ${F.usd(c.prev)}`,
        viz: C.spark(days.map((r) => r.total), days.map((r) => [`${F.md(r.day)}${F.wd(r.day)} ${F.usdWhole(r.total)}`]), n)
          + cap(F.md(days[0].day), `${F.md(c.start)}〜${F.md(c.end)} の合計`, F.md(c.end)) }),
      forecast(),
      card({ label: "確認なしモードの記録", open: "modes", value: p.bypass.rate.toFixed(1), unit: "%",
        sub: `${F.int(p.bypass.numerator)} 件 / 全 ${F.int(p.bypass.denominator)} 件`, viz: meter(p.bypass.rate, "権限モード「確認なし」の割合") }),
    ].join("");
  }

  function delivery(k) {
    const p = D.periods[k], n = Number(k), e = p.events, max = Math.max(e.recent, e.prev);
    const pair = (label, v, ghost) => `<span class="pair" data-tip="${label} ${F.int(v)} 件"><span>${label}</span><span class="hbar${ghost ? " ghost" : ""}"><i style="width: ${((v / max) * 100).toFixed(1)}%"></i></span></span>`;
    const st = p.errors.stages;
    return [
      card({ label: "受信した記録", open: "health", value: F.int(e.recent), unit: "件",
        sub: `${chip(F.signed(e.delta), e.delta > 0)}前の ${n} 日 ${F.int(e.prev)} 件`, viz: pair(`前の ${n} 日`, e.prev, true) + pair(`直近 ${n} 日`, e.recent) }),
      card({ label: "CSV との照合率", open: "health", value: p.reconciliation.rate.toFixed(1), unit: "%",
        sub: `CSV にもいた ${p.reconciliation.numerator} 人 / 送信した ${p.reconciliation.denominator} 人`, viz: meter(p.reconciliation.rate, "前との比較なし") }),
      card({ label: "プラグインのエラー", open: "errors", mark: '<span class="mark warn">注意</span>', value: p.errors.total, unit: "件",
        sub: `${p.errors.kinds} 種類 · 前との比較なし`,
        viz: `<span class="stack">${st.map(([s, v], i) => `<i class="warn-${i}" style="flex: ${v}" data-tip="${STAGE[s]} ${v} 件"></i>`).join("")}</span>
<span class="legend">${st.map(([s, v], i) => `<span><i class="warn-${i}"></i>${STAGE[s]} ${v}</span>`).join("")}</span>` }),
      card({ label: "項目の欠け（最大）", open: "health:null", mark: '<span class="mark ok">正常</span>', value: "11.7", unit: "%",
        sub: "コマンドの定義元 · 4 / 4 項目が正常",
        viz: `<span class="rates">${NULL_RATES.map(([l, v]) => `<span class="rate"><span>${l}</span><span class="hbar"><i style="width: ${v}%"></i></span><span class="num strong">${v}%</span></span>`).join("")}</span>` }),
    ].join("");
  }

  function usageLong() {
    const all = D.twelve_months.weeks, full = all.filter((w) => !w.partial), last = full[full.length - 1];
    const total = all.reduce((s, w) => s + w.cost, 0);
    const wtip = (w, v) => [`${F.md(F.toDay(w.start))}〜${F.md(F.toDay(w.end))} の週 ${v}`];
    const span = cap(all[0].start.slice(0, 7).replace("-", "/"), "週ごと", F.md(F.toDay(all[all.length - 1].end)));
    return [
      card({ label: "利用明細にいた利用者", open: "daily", value: last.users, unit: "人",
        sub: `直近の週 ${F.md(F.toDay(last.start))}〜${F.md(F.toDay(last.end))} · 最大 ${Math.max(...all.map((w) => w.users))} 人`,
        viz: C.spark(full.map((w) => w.users), full.map((w) => wtip(w, `${w.users} 人`))) + span }),
      card({ label: "コスト（利用明細）", open: "cost", value: F.usdWhole(total),
        sub: `週あたり ${F.usdWhole(total / (all.length - 1 + all[all.length - 1].days_with_data / 7))} · 前との比較なし`,
        viz: C.spark(full.map((w) => w.cost), full.map((w) => wtip(w, F.usdWhole(w.cost)))) + span }),
      forecast(),
    ].join("");
  }

  window.Cards = { usage, delivery, usageLong };
})();
