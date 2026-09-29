"use strict";
// 案 09 の値の足し（seed の DB と data.js から計算。作り方は README）。window.DATA に足す。
(() => {
  const E = {"terminal_core": ["2.1.281", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.283"], "T32": {"7": [{"email": "user000@example.com", "reason": "billed_only"}, {"email": "user001@example.com", "reason": "billed_only"}, {"email": "user002@example.com", "reason": "billed_only"}, {"email": "user003@example.com", "reason": "billed_only"}], "28": [{"email": "user000@example.com", "reason": "billed_only"}, {"email": "user001@example.com", "reason": "billed_only"}, {"email": "user002@example.com", "reason": "billed_only"}, {"email": "user003@example.com", "reason": "billed_only"}]}};
  const D = window.DATA;
  D.fixed.policy.terminals.forEach((t, i) => { t.core = E.terminal_core[i]; });
  ["7", "28"].forEach((k) => { D.p[k].m.uncollected_rows = E.T32[k]; });
})();
