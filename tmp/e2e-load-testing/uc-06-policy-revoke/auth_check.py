"""認証ありの `claude -p` 1 回でも、REMOVE と SET の None が同じく効くかを見る（未ログインとの差の確認）。"""

from uc06_lib import (
    edit_settings,
    env,
    install,
    new_rows,
    ov,
    policy_src,
    real_leaks,
    settings,
    version,
)

# isort: split
from _flow import ask  # uc06_lib が e2e/ を sys.path に足す

R1 = "Read(./cc-e2e-r1)"
with env() as (root, srv):
    install(root, srv, version(1), ov(policy_src(set_={"env.CC_E2E_REVOKE": None}, remove={"permissions.deny": [R1]})))

    def user(d: dict) -> None:
        d["permissions"] = {"deny": ["Bash(cc-e2e-user:*)", R1]}
        d["env"] = {"CC_E2E_REVOKE": "1", "CC_E2E_USER": "keep"}

    edit_settings(root, user)
    ask(root, "Reply with just: ok", model="haiku")
    s = settings(root)
    print("deny:", s["permissions"]["deny"], "env:", s["env"])
    print("rows:", [(r["key_name"], r["apply_result"]) for r in new_rows(root, set())])
    assert s["permissions"]["deny"] == ["Bash(cc-e2e-user:*)"] and s["env"] == {"CC_E2E_USER": "keep"}
print("leaks:", real_leaks())
