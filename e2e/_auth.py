"""要認証のケースに渡す環境変数（許可リスト）。値はその起動にだけ渡し、repr に出さない。"""

import os

# どれか 1 つが在れば要認証のケースを動かす
AUTH_KEYS = ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK")
# Bedrock の認証・リージョン（AWS_PROFILE・AWS_REGION・AWS_BEARER_TOKEN_BEDROCK など）
_PREFIXES = ("AWS_",)
# 別名（haiku・sonnet）の解決先。Bedrock では組織で有効なモデル ID への固定が要りうる
_MODEL_KEYS = ("ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL")


class _Secret(str):
    """値はそのまま使え、repr（assert の表示・ログ）には出ない文字列。"""

    def __repr__(self) -> str:
        return "'***'"


def has_auth() -> bool:
    return any(os.environ.get(k) for k in AUTH_KEYS)


def auth_env() -> dict:
    """許可リストに当たる環境変数を、値を隠した形で返す。"""
    return {
        k: _Secret(v)
        for k, v in os.environ.items()
        if k in AUTH_KEYS + _MODEL_KEYS or k.startswith(_PREFIXES)
    }
