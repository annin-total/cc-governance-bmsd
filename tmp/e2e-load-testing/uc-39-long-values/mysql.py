"""UC39 補足: 本物のサーバ（pymysql 経由）で、DB の文字コードごとに特殊な値の行が同じリクエストを巻き込むかを見る。"""

import json
import secrets
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[2] / "e2e"), str(HERE)]

from _root import E2ERoot
from _server import (
    _PORT,
    _SECRET_REL,
    BASE_PATH,
    CSV_DIR,
    LABEL,
    DockerServer,
    build_context,
    docker,
)
from cases import ev, line, raw
from run import OUT, send

MYSQL_IMAGE = "mysql:8.4"
PW = secrets.token_hex(8)
CHARSETS = ("utf8mb4", "utf8mb3", "latin1")
CASES = [
    ("my_ascii_255", line(ev("my_ascii_255", skill_name="a" * 255))),
    ("my_kana_255", line(ev("my_kana_255", skill_name="あ" * 255))),
    ("my_emoji", line(ev("my_emoji", skill_name="🧪 test"))),
    ("my_lone_surrogate", raw("my_lone_surrogate", '"x\\ud83dy"')),
    ("my_controls", line(ev("my_controls", skill_name="a\u0000b\u001b[31mc\n"))),
    ("my_xss", line(ev("my_xss", skill_name="<script>alert(1)</script>"))),
]
_DUMP = (
    "import json,sys,pymysql;c=pymysql.connect(host='{h}',user='root',password=sys.argv[1],database='{d}');"
    "cur=c.cursor();cur.execute('SELECT event_id,session_id,skill_name FROM events');"
    "print(json.dumps(cur.fetchall()))"
)


def wait_mysql(name: str) -> None:
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        # 初期化中の一時サーバはソケットだけで応答するため、TCP で確かめる
        if (
            docker(
                "exec",
                name,
                "mysql",
                "-h127.0.0.1",
                "-uroot",
                f"-p{PW}",
                "-e",
                "SELECT 1",
                check=False,
            ).returncode
            == 0
        ):
            return
        time.sleep(3)
    raise TimeoutError("MySQL が起動しない")


def start(srv: DockerServer, image: str, dsn: str, net: str) -> None:
    env = {
        "DB_DSN": dsn,
        "INGEST_TOKEN": srv.token,
        "CSV_DIR": CSV_DIR,
        "PKG_PROXY": "",
        "ADMIN_PATH": srv._admin,
        "ADMIN_PASSWORD": srv._password,
        "BASE_PATH": BASE_PATH,
    }
    secret = srv._secret_dir / _SECRET_REL
    secret.parent.mkdir(parents=True)
    secret.write_text("".join(f"{k}={v}\n" for k, v in env.items()), "utf-8")
    docker(
        "create",
        "--name",
        srv.name,
        "--label",
        LABEL,
        "--network",
        net,
        "-p",
        f"127.0.0.1::{_PORT}",
        image,
    )
    docker("cp", str(srv._secret_dir / "data"), f"{srv.name}:/mnt")
    docker("start", srv.name)


def main() -> None:
    root = E2ERoot()
    net, my = f"{root.path.name}-net", f"{root.path.name}-mysql"
    image = f"{root.path.name}-img"
    servers = []
    out = {}
    try:
        docker("network", "create", "--label", LABEL, net)
        docker(
            "run",
            "-d",
            "--name",
            my,
            "--label",
            LABEL,
            "--network",
            net,
            "-e",
            f"MYSQL_ROOT_PASSWORD={PW}",
            MYSQL_IMAGE,
            timeout=900,
        )
        docker(
            "build",
            "-q",
            "--label",
            LABEL,
            "-t",
            image,
            str(build_context(root, "m")),
            timeout=600,
        )
        wait_mysql(my)
        for cs in CHARSETS:
            db = f"d_{cs}"
            docker(
                "exec",
                my,
                "mysql",
                "-uroot",
                f"-p{PW}",
                "-e",
                f"CREATE DATABASE {db} CHARACTER SET {cs}",
            )
            srv = DockerServer(root, f"s-{cs}")
            servers.append(srv)
            start(srv, image, f"mysql://root:{PW}@{my}:3306/{db}", net)
            srv.wait_ready()
            results = [send(srv, tag, bad) for tag, bad in CASES]
            rows = json.loads(
                docker(
                    "exec", srv.name, "python3", "-c", _DUMP.format(h=my, d=db), PW
                ).stdout
            )
            by_eid = {r[0] for r in rows}
            for r in results:
                r["normals_kept"] = sum(e in by_eid for e in r.pop("normals"))
                got = [r2[2] for r2 in rows if r2[1] == f"uc39-{r['tag']}"]
                r["stored_value"] = ascii(got[0][:40]) if got else None
                r.pop("body_head", None)
            out[cs] = results
            (OUT / f"mysql-{cs}-logs.txt").write_text(
                srv.logs().replace(PW, "***"), "utf-8"
            )
            srv.close()
    finally:
        for srv in servers:
            srv.close()
        docker("rm", "-f", "-v", my, check=False)
        docker("network", "rm", net, check=False)
        docker("image", "rm", image, check=False)
        root.cleanup()
    (OUT / "mysql-report.json").write_text(json.dumps(out, indent=1), "utf-8")
    for cs, results in out.items():
        for r in results:
            print(
                cs,
                r["tag"],
                r["status"],
                r.get("stored"),
                r.get("dropped"),
                f"normals={r['normals_kept']}/2",
                r["stored_value"],
                r["sec"],
            )


if __name__ == "__main__":
    main()
