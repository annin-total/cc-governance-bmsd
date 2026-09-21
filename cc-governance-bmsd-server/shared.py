"""契約 (`governance/hooks/contract.py`) を import 可能にするシム。"""

import os
import sys

sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), os.pardir, "governance", "hooks"
    ),
)
from contract import (  # noqa: F401
    CSV_COLUMNS,
    EXTRA_COLUMNS,
    HOOK_FIELDS,
    POLICY,
    POLICY_COLUMNS,
    coerce,
    ddl,
    dig,
    to_day,
)
