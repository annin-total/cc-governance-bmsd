"""UC68: 実 CSV と変形版を本番と同じ経路で取り込み、画面の結果と DB を突き合わせる。CC_E2E_RUN=b-uc68 で実行する。"""

import sys
from pathlib import Path

sys.path[:0] = [
    str(Path(__file__).resolve().parents[3] / "e2e"),
    str(Path(__file__).resolve().parent),
]

import json
import math

from _root import E2ERoot
from _server import DockerServer, build_context
from lab import (
    AUG,
    JULY,
    OUT,
    csv_sum,
    db_summary,
    do_import,
    place,
    read_rows,
    reset,
    to_bytes,
    unplace,
)
from recon import recon_cases

J = read_rows(JULY)
A = read_rows(AUG)
H = J[0]
N, COST = csv_sum(J)
NA, COST_A = csv_sum(A)


def col(name: str) -> int:
    return H.index(name)


def edit(rows: list, name: str, fn, only=None) -> list:
    """列 `name` の値を `fn` で変えた複製。`only` はデータ行の番号の集合（None なら全行）。"""
    i = col(name)
    out = [list(rows[0])]
    for k, r in enumerate(rows[1:]):
        r = list(r)
        if only is None or k in only:
            r[i] = fn(r[i])
        out.append(r)
    return out


def rename(rows: list, old: str, new: str) -> list:
    return [[new if c == old else c for c in rows[0]]] + [list(r) for r in rows[1:]]


def drop_col(rows: list, name: str) -> list:
    i = col(name)
    return [r[:i] + r[i + 1 :] for r in rows]


def day_of(rows: list, k: int) -> str:
    return rows[1 + k][col("Date")]


_NULL_KEYS = {
    "null_cost": "cost",
    "null_email": "user_email",
    "null_tokens": "input_tokens",
}


def check(got: dict, exp: dict) -> list:
    """期待との食い違い（空なら一致）。cost は相対誤差 1e-9 で比べる。"""
    miss = []
    for key, want in exp.items():
        have = got.get(key)
        if key == "cost" and want is not None and have is not None:
            if not math.isclose(have, want, rel_tol=1e-9, abs_tol=1e-9):
                miss.append(f"cost {have} != {want}")
        elif key == "err_has":
            msgs = " ".join(m for _, m in got["err"])
            if not all(s in msgs for s in want):
                miss.append(f"err {got['err']} に {want} が無い")
        elif key in ("null_cost", "null_email", "null_tokens"):
            have = got["nulls"].get(_NULL_KEYS[key])
            if have != want:
                miss.append(f"{key} {have} != {want}")
        elif have != want:
            miss.append(f"{key} {have} != {want}")
    return miss


def run_case(
    srv, name: str, files: dict, exp: dict, fresh: bool = True, pre=None
) -> dict:
    if fresh:
        reset(srv)
    if pre:
        pre(srv)
    place(srv, name, files)
    imp = do_import(srv)
    got = {**imp, **db_summary(srv)}
    got["miss"] = check(got, exp)
    got["name"] = name
    print(
        f"{'OK ' if not got['miss'] else 'NG '}{name}: ok={imp['ok']} err={imp['err']} rows={got['rows']} {got['miss']}"
    )
    return got


def _preimport(srv) -> None:
    place(srv, "pre", {"jul.csv": to_bytes(J)})
    do_import(srv)


def cases(srv) -> list:
    base = {"ok": [("jul.csv", N, 0)], "rows": N, "cost": COST}
    day0 = day_of(J, 0)
    n_day0 = sum(1 for r in J[1:] if r[col("Date")] == day0)
    fix = [H, list(J[1])]
    ascii_only = all(ord(c) < 128 for r in J for c in "".join(r))
    blanks = to_bytes(J) + b"\r\n\r\n\r\n"
    short_long = [list(r) for r in J]
    short_long[1] = short_long[1][:5]
    short_long[2] = short_long[2] + ["x", "y", "z"]
    nul = edit(J, "Model", lambda v: v + "\x00", only={0})
    sj = edit(J, "User Name", lambda v: "山田", only={0})
    c = [
        (
            "real_july",
            {"jul.csv": to_bytes(J)},
            {**base, "users": 140, "null_cost": 0, "null_email": 0, "null_tokens": 0},
            True,
        ),
        (
            "reimport_same",
            {},
            {"ok": [("jul.csv", N, 0)], "rows": N, "cost": COST},
            False,
        ),
        (
            "july_aug",
            {"aug.csv": to_bytes(A)},
            {"rows": N + NA, "cost": COST + COST_A, "days": 54},
            False,
        ),
        (
            "file_removed",
            {},
            {"ok": [], "rows": N + NA},
            False,
            lambda s: (unplace(s, "jul.csv"), unplace(s, "aug.csv")),
        ),
        (
            "same_file_twice",
            {"aug.csv": to_bytes(A), "aug_copy.csv": to_bytes(A)},
            {"ok": [("aug.csv", NA, 0), ("aug_copy.csv", NA, 0)], "rows": NA},
            True,
        ),
        (
            "partial_fix_after",
            {"jul.csv": to_bytes(J), "zz_fix.csv": to_bytes(fix)},
            {"rows": N - n_day0 + 1},
            True,
        ),
        (
            "partial_fix_before",
            {"jul.csv": to_bytes(J), "aa_fix.csv": to_bytes(fix)},
            {"rows": N},
            True,
        ),
        (
            "header_only_added",
            {"hdr.csv": to_bytes([H])},
            {"ok": [("hdr.csv", 0, 0), ("jul.csv", N, 0)], "rows": N},
            True,
            _preimport,
        ),
        # No.69 書式の変化
        ("reorder", {"jul.csv": to_bytes([r[::-1] for r in J])}, base, True),
        (
            "extra_col",
            {"jul.csv": to_bytes([J[0] + ["Discount"]] + [r + ["0.5"] for r in J[1:]])},
            base,
            True,
        ),
        (
            "missing_cost",
            {"jul.csv": to_bytes(drop_col(J, "Cost"))},
            {"err_has": ["Cost"], "rows": N, "cost": COST},
            True,
            _preimport,
        ),
        (
            "rename_email",
            {"jul.csv": to_bytes(rename(J, "User Email", "Email"))},
            {"err_has": ["User Email"], "rows": 0},
            True,
        ),
        (
            "header_lower",
            {"jul.csv": to_bytes(rename(J, "Cost", "cost"))},
            {"err_has": ["Cost"], "rows": 0},
            True,
        ),
        (
            "header_space",
            {"jul.csv": to_bytes(rename(J, "Cost", "Cost "))},
            {"err_has": ["Cost"], "rows": 0},
            True,
        ),
        (
            "dup_cost_col",
            {"jul.csv": to_bytes([J[0] + ["Cost"]] + [r + ["0"] for r in J[1:]])},
            {"ok": [("jul.csv", N, 0)], "cost": 0.0},
            True,
        ),
        (
            "cost_dollar",
            {"jul.csv": to_bytes(edit(J, "Cost", lambda v: "$" + v))},
            {"ok": [("jul.csv", N, 0)], "null_cost": N},
            True,
        ),
        (
            "tokens_float",
            {"jul.csv": to_bytes(edit(J, "Input Tokens", lambda v: v + ".0"))},
            {"ok": [("jul.csv", N, 0)], "null_tokens": N},
            True,
        ),
        (
            "date_us",
            {
                "jul.csv": to_bytes(
                    edit(J, "Date", lambda v: f"{v[5:7]}/{v[8:10]}/{v[:4]}")
                )
            },
            {"ok": [("jul.csv", 0, N)], "rows": 0},
            True,
        ),
        (
            "date_time",
            {"jul.csv": to_bytes(edit(J, "Date", lambda v: v + " 00:00:00"))},
            {"ok": [("jul.csv", 0, N)], "rows": 0},
            True,
        ),
        (
            "date_jp",
            {
                "jul.csv": to_bytes(
                    edit(
                        J,
                        "Date",
                        lambda v: f"{int(v[:4])}年{int(v[5:7])}月{int(v[8:10])}日",
                    )
                )
            },
            {"ok": [("jul.csv", 0, N)], "rows": 0},
            True,
        ),
        # 壊れやすい値
        (
            "empty_cells",
            {
                "jul.csv": to_bytes(
                    edit(
                        edit(
                            edit(J, "Cost", lambda v: "", set(range(10))),
                            "Date",
                            lambda v: "",
                            set(range(10, 15)),
                        ),
                        "User Email",
                        lambda v: "",
                        set(range(15, 22)),
                    )
                )
            },
            {"ok": [("jul.csv", N - 5, 5)], "null_cost": 10, "null_email": 0},
            True,
        ),
        (
            "quoted_newline",
            {
                "jul.csv": to_bytes(
                    edit(J, "Model", lambda v: v + ',"q"\nnext', only={0, 1, 2})
                )
            },
            {**base, "model_nl": 3},
            True,
        ),
        ("bom_crlf", {"jul.csv": b"\xef\xbb\xbf" + to_bytes(J)}, base, True),
        (
            "bom_lf",
            {"jul.csv": b"\xef\xbb\xbf" + to_bytes(J, newline="\n")},
            base,
            True,
        ),
        ("cr_only", {"jul.csv": to_bytes(J, newline="\r")}, base, True),
        (
            "sjis_ascii",
            {"jul.csv": to_bytes(J, encoding="cp932")},
            base if ascii_only else {"err_has": ["codec"]},
            True,
        ),
        (
            "sjis_japanese",
            {"jul.csv": to_bytes(sj, encoding="cp932")},
            {"err_has": ["codec"], "rows": 0},
            True,
        ),
        ("utf16", {"jul.csv": to_bytes(J, encoding="utf-16")}, {"rows": 0}, True),
        ("nul_byte", {"jul.csv": to_bytes(nul)}, {"err_has": ["NUL"], "rows": 0}, True),
        (
            "trailing_blank",
            {"jul.csv": blanks},
            {"ok": [("jul.csv", N, 3)], "rows": N},
            True,
        ),
        (
            "short_long_row",
            {"jul.csv": to_bytes(short_long)},
            {"ok": [("jul.csv", N, 0)], "null_cost": 1},
            True,
        ),
        ("upper_ext", {"jul.CSV": to_bytes(J)}, {"ok": [], "err": [], "rows": 0}, True),
        (
            "empty_file",
            {"empty.csv": b""},
            {"ok": [("empty.csv", 0, 0)], "rows": 0},
            True,
        ),
        (
            "tsv_as_csv",
            {"jul.csv": "\r\n".join("\t".join(r) for r in J).encode()},
            {"err_has": ["必須列"], "rows": 0},
            True,
        ),
        (
            "upper_email",
            {
                "jul.csv": to_bytes(
                    edit(J, "User Email", str.upper, only=set(range(50)))
                )
            },
            {**base, "upper_left": 0},
            True,
        ),
        (
            "nan_negative",
            {
                "jul.csv": to_bytes(
                    edit(
                        edit(J, "Cost", lambda v: "NaN", {0}),
                        "Cost",
                        lambda v: "-1.5",
                        {1},
                    )
                )
            },
            {"ok": [("jul.csv", N, 0)]},
            True,
        ),
    ]
    out = []
    for name, files, exp, fresh, *pre in c:
        if name == "sjis_ascii":
            print(f"   (実 CSV は ASCII だけか: {ascii_only})")
        extra_keys = {k: exp.pop(k) for k in ("model_nl", "upper_left") if k in exp}
        got = run_case(srv, name, files, exp, fresh, pre[0] if pre else None)
        if extra_keys:
            from lab import query

            got["model_nl"] = query(
                srv,
                "SELECT COUNT(*) FROM cost_daily WHERE model LIKE '%' || char(10) || '%'",
            )[0][0]
            got["upper_left"] = query(
                srv,
                "SELECT COUNT(*) FROM cost_daily WHERE user_email != LOWER(user_email)",
            )[0][0]
            more = check(got, extra_keys)
            got["miss"] += more
            if more:
                print(f"NG {name}: {more}")
        if name in ("empty_cells", "quoted_newline", "nan_negative"):
            st = srv.request("GET", srv.admin_path("/"), auth=True)[0]
            got["overview_status"] = st
            if st != 200:
                got["miss"].append(f"overview {st}")
                print(f"NG {name}: overview {st}")
        if name == "partial_fix_after":
            got["lost_rows_same_day"] = n_day0 - 1
        out.append(got)
    return out


def selftest() -> None:
    """判定が壊した期待で落ちること。"""
    got = {
        "ok": [("a.csv", 3, 0)],
        "err": [("b.csv", "必須列が欠けている: Cost")],
        "rows": 3,
        "cost": 1.5,
        "nulls": {"cost": 0},
    }
    assert (
        check(
            got,
            {
                "ok": [("a.csv", 3, 0)],
                "rows": 3,
                "cost": 1.5,
                "err_has": ["Cost"],
                "null_cost": 0,
            },
        )
        == []
    )
    for bad in (
        {"rows": 4},
        {"cost": 1.6},
        {"ok": [("a.csv", 3, 1)]},
        {"err_has": ["User Email"]},
        {"null_cost": 1},
    ):
        assert check(got, bad), bad
    print("selftest: OK")


def main() -> None:
    selftest()
    root = E2ERoot()
    srv = DockerServer(root, "uc68")
    try:
        srv.start(build_context(root, "uc68"))
        srv.wait_ready()
        results = cases(srv) + recon_cases(srv)
        (OUT / "report.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=1, default=str)
        )
        (OUT / "server-logs.txt").write_text(srv.logs())
        bad = [r["name"] for r in results if r["miss"]]
        print(
            f"== {len(results) - len(bad)}/{len(results)} 期待どおり。食い違い: {bad}"
        )
    finally:
        srv.close()
        root.cleanup()


if __name__ == "__main__":
    main()
