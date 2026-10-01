"""カナリア非漏洩と scan サブコマンドのテスト。"""

import json
import unittest
from unittest import mock

from helpers import ConfigDir, assistant, cost_state, run, tool_result, user

SID = "22222222-aaaa-bbbb-cccc-000000000001"
TS = "2026-09-12T09:00:00.000Z"
CANARY_CWD = "/home/canaryuser/canaryproj"
MARKERS = [
    "CANARYBODY", "AKIAFAKECANARY", "sk-canary", "カナリア本文", "canaryuser", "canaryproj",
    "canarycmd", "CANARYTHINK", "CANARYRESULT", "CANARYBROKEN", "CANARYERR", "CANARYTITLE", "CANARYARN",
]


def canary_rows():  # type: ignore[no-untyped-def]
    tools = [
        {"type": "tool_use", "id": "tc1", "name": "Bash",
         "input": {"command": "canarycmd --token sk-canaryABCDEFGHIJKLMNOP"}},
        {"type": "tool_use", "id": "tc2", "name": "Read", "input": {"file_path": CANARY_CWD + "/CANARYBODY.secret"}},
    ]
    content = [{"type": "thinking", "thinking": "CANARYTHINK"}, {"type": "text", "text": "CANARYBODY カナリア本文"}] + tools
    return [
        user(SID, TS, "CANARYBODY カナリア本文 AKIAFAKECANARY1234567", cwd=CANARY_CWD, uuid="cu1"),
        user(SID, TS, "<command-name>/allowed-cmd</command-name><command-args>CANARYBODY</command-args>",
             cwd=CANARY_CWD, uuid="cu2"),
        assistant("m1", SID, TS, content=content, cwd=CANARY_CWD,
                  model="arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/CANARYARN"),
        tool_result(SID, TS, "tc1", "CANARYRESULT AKIAFAKECANARY1234567 " + CANARY_CWD),
        {"type": "ai-title", "sessionId": SID, "aiTitle": "CANARYTITLE"},
        {"type": "last-prompt", "sessionId": SID, "lastPrompt": "CANARYBODY"},
        '{"type":"assistant","message":{"content":"CANARYBROKEN CANARYERR \\ud800',
        '{"type":"user","message":{"content":"CANARYBROKEN ' + CANARY_CWD,
        "\x00\x01CANARYBROKEN",
        '[1, "CANARYERR"]',
        '{"type":"assistant","message":"CANARYERR","timestamp":5,"sessionId":["CANARYERR"]}',
        cost_state(SID, {"arn:aws:bedrock:us-east-1:123456789012:foundation-model/anthropic.claude-haiku-4-5": {"input": 1}}),
    ]


class CanaryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.cfg = ConfigDir()

    def tearDown(self) -> None:
        self.cfg.cleanup()

    def test_no_marker_leaks_from_collect(self) -> None:
        self.cfg.write("-home-canaryuser-canaryproj/%s.jsonl" % SID, canary_rows())
        self.cfg.write("-home-canaryuser-canaryproj/%s/subagents/agent-x.jsonl" % SID,
                       [assistant("m2", SID, TS, side=True, agent="x", cwd=CANARY_CWD)])
        (self.cfg.root / "settings.json").write_text(json.dumps({
            "model": "arn:aws:bedrock:us-east-1:123456789012:inference-profile/CANARYARN",
            "env": {"SECRET": "CANARYBODY"}, "mcpServers": {"canarycmd": {"token": "sk-canaryXXXXXXXXXXXX"}},
            "effortLevel": "CANARYBODY with spaces"}))
        sk = self.cfg.root / "skills" / "s1"
        sk.mkdir(parents=True)
        (sk / "SKILL.md").write_text("---\nname: s1\ndescription: CANARYBODY desc\n---\n", encoding="utf-8")
        for extra in ([], ["--local-tz"], ["--max-line-bytes", "300"]):
            rc, so, se, d, text = self.cfg.collect(*extra)
            self.assertEqual(rc, 0, se)
            blob = text + so + se
            for m in MARKERS:
                self.assertNotIn(m, blob, m)
            self.assertNotIn("123456789012", blob)
            self.assertNotIn("/home/", blob)
            self.assertGreater(sum(d["coverage"]["lines_unreadable"].values()), 0)
        rc, so, se, d, text = self.cfg.collect(env={"PYTHONIOENCODING": "cp932"})
        self.assertEqual(rc, 0)
        for m in MARKERS:
            self.assertNotIn(m, text + so + se)

    def test_project_label_is_opaque_and_stable(self) -> None:
        self.cfg.write("-home-canaryuser-canaryproj/%s.jsonl" % SID, canary_rows())
        _rc, _so, _se, d1, _t = self.cfg.collect()
        _rc, _so, _se, d2, _t = self.cfg.collect()
        labels = [p["label"] for p in d1["projects"]["top_by_output"]]
        self.assertEqual(labels, [p["label"] for p in d2["projects"]["top_by_output"]])
        self.assertRegex(labels[0], r"^P-[0-9a-f]{8}$")


REPORT = """# 調書
対象者: alice-subject
- パス /opt/canaryproj/src/main.py を参照
- 鍵 AKIAABCDEFGHIJKLMNOP と sk-abcdefghijklmnop と ghp_abcdefghijklmnopqrstuvwxyz
- 連絡 someone@example.com / https://example.com/x
- 口座 123456789012 / arn:aws:bedrock:us-east-1:1:foo
- Windows C:\\Users\\bob\\work と ~/secret/dir
- 実行 `git push origin main` と `Read` と `/clear`
- 未記入 ＜氏名＞
- 日付 2026-10-01、比率 1/2、観測／推定、Read/Bash/Edit/Task、N/A
- プロジェクト canaryproj の作業
"""


class ScanTest(unittest.TestCase):
    def setUp(self) -> None:
        self.cfg = ConfigDir()
        self.cfg.write("-home-canaryuser-canaryproj/%s.jsonl" % SID, canary_rows())
        self.target = self.cfg.work / "report"
        self.target.mkdir()
        self.report = self.target / "claude-code-hearing_20261001.md"
        self.report.write_text(REPORT, encoding="utf-8")
        self.out = self.cfg.work / "scan.json"

    def tearDown(self) -> None:
        self.cfg.cleanup()

    def scan(self, *extra: str):  # type: ignore[no-untyped-def]
        rc, so, se = run(["scan", "--targets", str(self.target), "--out", str(self.out),
                          "--config-dir", str(self.cfg.root), "--subject-name", "alice-subject"] + list(extra))
        self.assertEqual(rc, 0, se)
        text = self.out.read_text(encoding="utf-8")
        return json.loads(text), text, so + se

    def test_detects_kinds_without_writing_strings(self) -> None:
        d, text, std = self.scan()
        kinds = d["by_kind"]
        for k in ("path_unix", "aws_access_key", "api_key_like", "github_token", "email", "url", "digits_12",
                  "arn", "path_windows", "path_home", "backtick_command", "unfilled_placeholder", "forbidden_word"):
            self.assertIn(k, kinds, k)
        lines = {(v["kind"], v["line"]) for v in d["violations"]}
        self.assertNotIn(("path_unix", 10), lines)
        self.assertFalse(any(v["line"] == 10 for v in d["violations"]), d["violations"])
        self.assertFalse(any(v["line"] == 2 for v in d["violations"]))
        for s in ("canaryproj", "AKIAABCDEFGHIJKLMNOP", "example.com", "123456789012", "git push", "bob"):
            self.assertNotIn(s, text + std)
        self.assertEqual(self.report.read_text(encoding="utf-8"), REPORT)

    def test_redact(self) -> None:
        d, _text, _std = self.scan("--redact")
        self.assertGreater(d["redacted_hits"], 0)
        after = self.report.read_text(encoding="utf-8")
        for s in ("canaryproj", "AKIAABCDEFGHIJKLMNOP", "example.com", "123456789012", "git push", "C:\\Users"):
            self.assertNotIn(s, after)
        self.assertIn("［伏せ字］", after)
        self.assertIn("＜氏名＞", after)
        self.assertIn("alice-subject", after)
        self.assertIn("2026-10-01", after)
        d2, _t, _s = self.scan()
        self.assertEqual(set(d2["by_kind"]), {"unfilled_placeholder"})

    def test_single_file_target_and_cp932(self) -> None:
        rc, so, se = run(["scan", "--targets", str(self.report), "--out", str(self.out)],
                         env={"PYTHONIOENCODING": "cp932"})
        self.assertEqual(rc, 0, se)
        d = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertEqual(d["files_scanned"], 1)
        self.assertTrue(all(v["file"] == self.report.name for v in d["violations"]))

    def test_forward_slash_and_single_element_paths(self) -> None:
        self.report.write_text("A C:/Users/bob/x\nB /Users\nC /home.\nD /tmp と /etc\n"
                               "E 1/2 2026/10/01 Read/Bash N/A /clear and/etc\nF https://example.org/x\n",
                               encoding="utf-8")
        d, _t, _s = self.scan()
        by_line = {}
        for v in d["violations"]:
            by_line.setdefault(v["line"], set()).add(v["kind"])
        self.assertEqual(by_line[1], {"path_windows"})
        self.assertEqual(by_line[2], {"path_unix"})
        self.assertEqual(by_line[3], {"path_unix"})
        self.assertEqual(sum(v["count"] for v in d["violations"] if v["line"] == 4), 2)
        self.assertNotIn(5, by_line)
        self.assertEqual(by_line[6], {"url"})

    def test_file_names_with_forbidden_words_are_masked(self) -> None:
        bad = self.target / "canaryproj-notes.md"
        bad.write_text("/opt/x/y\n", encoding="utf-8")
        d, text, std = self.scan()
        self.assertNotIn("canaryproj-notes", text + std)
        self.assertIn("file-1", {v["file"] for v in d["violations"]})

    def test_redact_failure_keeps_original_and_leaves_no_temp(self) -> None:

        import scan as scan_mod

        with mock.patch("os.replace", side_effect=OSError("boom")):
            with self.assertRaises(OSError):
                scan_mod._write_atomic(str(self.report), "changed")
        self.assertEqual(self.report.read_text(encoding="utf-8"), REPORT)
        self.assertEqual([p.name for p in self.target.iterdir()], [self.report.name])

    def test_missing_target_exit_2(self) -> None:
        rc, _so, _se = run(["scan", "--targets", str(self.target / "nope"), "--out", str(self.out)])
        self.assertEqual(rc, 2)


if __name__ == "__main__":
    unittest.main()
