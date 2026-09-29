"use strict";
// data.js の値の並べ替え・結合（新しい集計はしない）
(() => {
  const D = window.DATA;
  const trend = D.fixed.m.compliance_trend;
  D.fixed.m.compliance_latest = trend[trend.length - 1];
  const core = new Map(D.fixed.m.core_by_terminal.map((t) => [`${t.email} ${t.host}`, t.version]));
  D.fixed.policy.terminals.forEach((t) => { t.core = core.get(`${t.email} ${t.host}`) ?? null; });
  for (const k of D.meta.periods) {
    const x = D.p[k].x;
    x.model_keys = x.models.map((r) => r.key);
    if (k === "12m") continue;
    x.people_up = x.people.filter((u) => u.cost_diff > 0).sort((a, b) => b.cost_diff - a.cost_diff);
    const m = D.p[k].m;
    m.missing_users = m.uncollected_billed_users.map((email) => ({ email, kind: "billed" }))
      .concat(m.collection_stopped_users.map((email) => ({ email, kind: "stopped" })));
  }
})();
// この案は期間の切り替えに 12 か月を持たない（12 か月は別のページが受け持つ）
window.DATA.meta.periods = ["7", "28"];
