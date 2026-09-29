"use strict";
// 案 11 の値の足し（seed の DB と data.js から計算。作り方は README）。window.DATA に足す。
(() => {
  const E = {"terminal_core": ["2.1.281", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.281", "2.1.282", "2.1.283", "2.1.281", "2.1.282", "2.1.283", "2.1.283"], "tokens": {"7": [["input", 41150127], ["output", 7194360], ["cache_read", 228354810], ["cache_write", 35952074]], "28": [["input", 183143898], ["output", 28847183], ["cache_read", 942188451], ["cache_write", 141038480]], "12m": [["input", 1831884877], ["output", 272208191], ["cache_read", 9122546229], ["cache_write", 1379218980]]}, "model_keys": ["claude-haiku-4-5", "claude-opus-4-1", "claude-sonnet-4-5"], "retention": [{"day": 20361, "retention": null, "left": 0}, {"day": 20362, "retention": 100.0, "left": 0}, {"day": 20393, "retention": 100.0, "left": 0}, {"day": 20423, "retention": 100.0, "left": 0}, {"day": 20454, "retention": 100.0, "left": 0}, {"day": 20485, "retention": 100.0, "left": 0}, {"day": 20513, "retention": 100.0, "left": 0}, {"day": 20544, "retention": 100.0, "left": 0}, {"day": 20574, "retention": 100.0, "left": 0}, {"day": 20605, "retention": 100.0, "left": 0}, {"day": 20635, "retention": 100.0, "left": 0}, {"day": 20666, "retention": 100.0, "left": 0}, {"day": 20697, "retention": 100.0, "left": 0}]};
  const D = window.DATA;
  D.fixed.policy.terminals.forEach((t, i) => { t.core = E.terminal_core[i]; });
  const last = E.retention[E.retention.length - 2];
  D.p["12m"].m.retention_rate = last.retention; D.p["12m"].m.left_users = new Array(last.left).fill(""); D.p["12m"].m.retention_month = last.day;
  Object.entries(E.tokens).forEach(([k, v]) => { D.p[k].x.token_parts = v; });
  D.p["12m"].x.model_keys = E.model_keys;
  ["7", "28"].forEach((k) => { D.p[k].x.months = []; });
})();
