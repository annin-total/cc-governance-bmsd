"use strict";
// 記録から数えるタブ（使われ方・受信と項目の欠け・プラグインのエラー）。今の画面と同じ表を、選んだ期間の値で描く
window.RecordTabs = (() => {
  const D = window.DATA, F = window.Fmt, U = window.UI;
  const TITLE = { modes: "使われ方", health: "受信と項目の欠け", errors: "プラグインのエラー" };
  const GROUP = { permission_mode: "権限モード", effort_level: "effort（思考量）", source: "セッションの開始" };
  const VALUE = {
    acceptEdits: ["編集を自動承認", "ファイル編集は確認なし"], plan: ["プランモード", "計画だけ立て、変更はしない"],
    bypassPermissions: ["確認なし", "すべての操作を確認なし"], default: ["通常", "操作ごとに許可を求める"],
    low: ["低"], medium: ["中"], high: ["高"],
    resume: ["再開", "前のセッションを続けた"], startup: ["新規起動"], compact: ["圧縮後"], clear: ["クリア後"],
  };
  const NULL_SUB = { tool_name: "ツール実行の記録が分母", skill_name: "Skill ツールの実行記録が分母", context_tokens: "圧縮直前と応答終了の記録が分母", command_source: "コマンド展開の記録が分母" };

  function modes(k, r) {
    const n = Number(k), groups = Object.keys(GROUP);
    const rows = r.modes.map((m) => {
      const [name, sub] = VALUE[m.value] || [F.esc(m.value)];
      return U.tr({ tags: m.group }, U.td("c-tag", m.group, U.sub(GROUP[m.group])) + U.td("c-term", m.value, `${name}${sub ? ` ${U.sub(sub)}` : ""}`)
        + U.td("c-num num", m.count, F.int(m.count)) + U.td("c-pct num", m.share, F.pct(m.share)) + U.hbar(m.share, 100));
    });
    return U.head(TITLE.modes, `直近 ${n} 日 · 記録の件数（開始のしかたはセッション開始の記録）· 割合は区分の中での割合`)
      + U.filters({ chips: [["all", "すべて", rows.length], ...groups.map((g) => [g, GROUP[g], r.modes.filter((m) => m.group === g).length])], total: rows.length, unit: "行" })
      + U.table("modes", [{ label: "区分", cls: "c-tag" }, { label: "値", cls: "c-term" }, { label: "件数", cls: "c-num num" }, { label: "割合", cls: "c-pct num" }, { cls: "c-bar" }], rows);
  }

  function health(k, r) {
    const p = D.periods[k], n = Number(k), L = window.OverviewCards.NULL_LABEL, S = window.OverviewCards.STATE_LABEL;
    const recv = (key, name, sub, now, prev, unit) => U.tr({ tags: "recv" }, U.td("c-tag", "recv", U.sub("受信")) + U.td("c-term", key, `${name}${sub ? ` ${U.sub(sub)}` : ""}`)
      + U.td("c-measure num", now, F.withUnit(F.int(now), unit)) + U.td("c-measure_sub num", prev, U.sub(F.withUnit(F.int(prev), unit)))
      + U.td("c-diff num", now - prev, F.signed(now - prev)) + U.td("c-state", "", U.dash));
    const rc = p.reconciliation;
    const rows = [
      recv("events", "受信した記録", "再送の重複を除く", p.events.recent, p.events.prev, "件"),
      recv("users", "送信した利用者", "", p.users.recent, p.users.prev, "人"),
      U.tr({ tags: "recv" }, U.td("c-tag", "recv", U.sub("受信")) + U.td("c-term", "reconciliation", `CSV との照合率 ${U.sub(`利用明細の最終日までの ${n} 日`)}`)
        + U.td("c-measure num", rc.rate, `${F.pct(rc.rate)} ${U.sub(`${rc.numerator} / ${rc.denominator} 人`)}`) + U.td("c-measure_sub num", "", U.dash)
        + U.td("c-diff num", "", U.dash) + U.td("c-state", "", U.dash)),
      ...r.nulls.map((x) => U.tr({ tags: "null" }, U.td("c-tag", "null", U.sub("項目の欠け")) + U.td("c-term", x.key, `${L[x.key]} ${U.sub(NULL_SUB[x.key])}`)
        + U.td("c-measure num", x.recent, F.pct(x.recent)) + U.td("c-measure_sub num", x.prev, U.sub(F.pct(x.prev)))
        + U.td("c-diff num", (x.recent - x.prev).toFixed(1), F.signed(x.recent - x.prev, 1, " pt")) + U.td("c-state", x.state, U.mark(x.state, S[x.state])))),
    ];
    const cols = ["区分", "項目", `直近 ${n} 日`, `前の ${n} 日`, "差", "状態"].map((label, i) => ({ label, sortable: false, cls: ["c-tag", "c-term", "c-measure num", "c-measure_sub num", "c-diff num", "c-state"][i] }));
    return U.head(TITLE.health, `直近 ${n} 日と前の ${n} 日 · 欠けの分母は、その項目が送られるはずの記録`)
      + U.filters({ chips: [["all", "すべて", rows.length], ["recv", "受信", 3], ["null", "項目の欠け", r.nulls.length]], total: rows.length, unit: "行" })
      + U.table("health", cols, rows)
      + U.note("欠けは 20% 以下を正常、20% 超を注意、50% 超を要確認とします（仮の基準）。100% に跳ねたら上流の仕様変更を疑います。");
  }

  function errors(k, r) {
    const n = Number(k), stages = D.periods[k].errors.stages.map(([s]) => s), STAGE = window.OverviewCards.STAGE;
    const rows = r.errors.map((e) => U.tr({ tags: `k${stages.indexOf(e.stage)}`, q: `${e.kind} ${e.last_version} ${e.stage}` },
      U.td("c-stage", e.stage, `${STAGE[e.stage] || F.esc(e.stage)}<span class="sub code"> ${F.esc(e.stage)}</span>`) + U.td("c-code", F.esc(e.kind), `<span class="code">${F.esc(e.kind)}</span>`)
      + U.td("c-num num", e.count, e.count) + U.td("c-num num", e.terminals, F.withUnit(e.terminals, "台")) + U.td("c-code", F.esc(e.last_version), `<span class="code">${F.esc(e.last_version)}</span>`)));
    const chips = stages.map((s, i) => [`k${i}`, STAGE[s] || F.esc(s), r.errors.filter((e) => e.stage === s).length]);
    return U.head(TITLE.errors, `直近 ${n} 日 · 端末 = 利用者とホスト名の組 · 失った記録は戻りません`)
      + U.filters({ search: "エラーの種類・版", chips: [["all", "すべて", rows.length], ...chips], total: rows.length, unit: "行" })
      + U.table("errors", [{ label: "処理段階", cls: "c-stage" }, { label: "エラーの種類", cls: "c-code" }, { label: "件数", cls: "c-num num", sort: "descending" },
        { label: "端末数", cls: "c-num num" }, { label: "最後に起きた版", cls: "c-code" }], rows);
  }

  return { modes, health, errors, TITLE };
})();
