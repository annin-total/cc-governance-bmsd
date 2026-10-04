"""`seed_org_csv.py` の、組織 CSV の列名から合成値の作り方への対応表。"""

import random

from seed_dashboard_columns import Ctx

# 組織 CSV の値の語彙と割合は実物に寄せる。部署の下の階層ほど空が多く、上が空で下が埋まる行は無い
EMPLOYEE_TYPES = {
    "Contractor/Subcontractor": 55,
    "Regular Employee": 32,
    "Contractor/Subcontractor(RTS Regular Employee)": 8,
    "Temporary Staff": 4,
    "Fixed-term Employee (Fixed Term)": 1,
}
ORG_LEVELS = (("Section", 0.99), ("Group", 0.86), ("Team", 0.7))
ORG_BRANCHES = 4
WORKER_ACTIVE_RATE = 0.45
NOT_COUNTED_RATE = 0.09


def org_unit(rng: random.Random) -> tuple:
    """(Department, Section, Group, Team)。途中で切れた下の階層は空にする。"""
    code = rng.choice("AB")
    path = [f"Department {code}"]
    for name, fill in ORG_LEVELS:
        if rng.random() >= fill:
            break
        code += str(rng.randint(1, ORG_BRANCHES))
        path.append(f"{name} {code}")
    return tuple(path) + ("",) * (1 + len(ORG_LEVELS) - len(path))


def _flag(c: Ctx, rate: float) -> str:
    return "1" if c.rng.random() < rate else ""


# 組織 CSV のヘッダ名で引く。実物の列の順に書き出す
ORG_RULES: dict = {
    "Worker Active": lambda c: _flag(c, WORKER_ACTIVE_RATE),
    "Not Counted in HC": lambda c: _flag(c, NOT_COUNTED_RATE),
    "Preferred Full Name in Local Language 1": lambda c: c.user.split("@")[0],
    "(Primary Position) Worker & Employee Type": lambda c: c.rng.choices(
        list(EMPLOYEE_TYPES), weights=list(EMPLOYEE_TYPES.values())
    )[0],
    "Department": lambda c: c.org[0],
    "Section": lambda c: c.org[1],
    "Group": lambda c: c.org[2],
    "Team": lambda c: c.org[3],
    "Email - Primary Work": lambda c: c.user,
}
