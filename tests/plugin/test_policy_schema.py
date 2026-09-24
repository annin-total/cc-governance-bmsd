"""policy.py と policy_sample.py を適用した結果が、settings.json のスキーマに通ることを検証する。

スキーマは https://json.schemastore.org/claude-code-settings.json を 2026-09-25 に取得した
`tests/fixtures/claude-code-settings.schema.json`（ネットに依存しない）。上流が更新されたら取り直す。
"""

import json
from pathlib import Path

import _settings
import jsonschema
import policy
import policy_sample
import pytest

SCHEMA = json.loads(
    (Path(__file__).resolve().parents[1] / "fixtures" / "claude-code-settings.schema.json")
    .read_text(encoding="utf-8")
)  # fmt: skip
VALIDATOR = jsonschema.Draft7Validator(SCHEMA)

EXISTING = {
    # 利用者の設定らしい既存値。サンプルが書くキーと重なるものを含める
    "model": "sonnet",
    "env": {"HTTP_PROXY": "http://proxy.example:8080"},
    "permissions": {"allow": ["Bash(ls:*)", "Bash(curl:*)"], "deny": ["Read(./.env)"]},
    "statusLine": {"type": "command", "command": "bash ~/.claude/statusline.sh"},
    "extraKnownMarketplaces": {
        "cc-marketplace-governance-bmsd": {
            "source": {"source": "github", "repo": "example/cc-marketplace"}
        }
    },
}

MODULES = {"policy": policy, "policy_sample": policy_sample}
BASES = {"empty": {}, "existing": EXISTING}


def _errors(data: dict) -> list:
    return [e.message for e in VALIDATOR.iter_errors(data)]


def test_スキーマが不正な設定を拒否する():
    """検証が素通りでないことの確認。前提となる既存値は通り、壊した値は落ちる。"""
    assert _errors(EXISTING) == []
    assert _errors({"statusLine": {"type": "command"}}) != []
    assert _errors({"effortLevel": "max"}) != []


@pytest.mark.parametrize("module_name", MODULES)
@pytest.mark.parametrize("base_name", BASES)
def test_適用結果がスキーマに通る(tmp_path, module_name, base_name):
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(BASES[base_name]), encoding="utf-8")

    rows = _settings.apply_settings(path, MODULES[module_name], tmp_path / "governance")

    results = {result for _key, _value, _prev, result in rows}
    assert "applied" in results, "何も書いていない（検証が空振りする）"
    assert results <= {"applied", "already_ok", "skipped_missing"}
    written = json.loads(path.read_text(encoding="utf-8"))
    assert _errors(written) == []


def test_サンプルのONCEがステータスラインを絶対パスで書く(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(EXISTING), encoding="utf-8")
    gov = tmp_path / "governance"

    _settings.apply_settings(path, policy_sample, gov)

    command = json.loads(path.read_text(encoding="utf-8"))["statusLine"]["command"]
    assert command == f'node "{gov.as_posix()}/statusline.js"'


@pytest.mark.parametrize("module_name", MODULES)
def test_定義の形(module_name):
    """パスに空の段が無く、ADD / REMOVE の値が list である（文字列だと 1 文字ずつ足される）。"""
    module = MODULES[module_name]
    for table in (module.SET, module.ADD, module.REMOVE, module.ONCE):
        assert all(all(key.split(".")) for key in table)
    for table in (module.ADD, module.REMOVE):
        assert all(isinstance(items, list) for items in table.values())
