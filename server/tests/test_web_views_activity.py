"""利用状況のページ（`/activity`）。既知データは `activity_data.py`、7 日の直近は 20022〜20028。"""

import importlib
import re

import pytest
from activity_data import TODAY, html_of, seed
from conftest import ADMIN, admin_client, card, card_value, table_body, table_rows

CARDS = (
    "1 人あたりの利用日数", "1 人 1 日あたりの指示", "1 人 1 日あたりのセッション",
    "スキルの呼び出し", "コマンドの呼び出し", "外部ツールの呼び出し", "サブエージェントの起動",
    "セッションの大きさ（中央）", "自動コンパクトに達した割合", "Bypass 権限モードの使用",
)  # fmt: skip
TABS = ["user_use", "user_calls", "daily_use", "calls", "session_size", "usage_modes"]


@pytest.fixture
def act_client(db_conn, monkeypatch):
    import app as app_module
    from ccgov.web import admin

    seed(db_conn)
    importlib.reload(app_module)
    monkeypatch.setattr(admin.time, "time", lambda: TODAY * 86400)
    return admin_client(app_module.app)


def _chip(fragment: str) -> tuple:
    found = re.search(
        r'<span class="k-sub"><span class="change( \w+)?">([^<]*)</span>', fragment
    )
    return (found.group(1) or "").strip(), found.group(2)


def _text(fragment: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", fragment).split())


def _plain(fragment: str) -> str:
    """タグを詰めて読む（丸めた値の正確な値の包みを越えて 1 行で読む）。"""
    return " ".join(re.sub(r"<[^>]+>", "", fragment).split())


def test_groups_and_cards_in_order(act_client):
    html = html_of(act_client)
    assert re.findall(r'<h2 class="glabel">([^<]+)<span>', html)[:3] == [
        "頻度",
        "呼び出し",
        "セッション",
    ]
    labels = re.findall(r'<span class="k-label"><span>([^<]+)</span>', html)
    assert tuple(labels) == CARDS
    assert "記録 10/26〜11/01 と前の 7 日 · 記録を送った利用者" in html


@pytest.mark.parametrize(
    ("label", "value", "chip", "sub"),
    [
        (
            "1 人あたりの利用日数",
            "1.3",
            ("better", "+33.3%"),
            "前 1.0 日 · 記録を送った 3 人",
        ),
        ("1 人 1 日あたりの指示", "1.5", ("", "±0.0%"), "前 1.5 件"),
        (
            "1 人 1 日あたりのセッション",
            "1.0",
            ("", "±0.0%"),
            "期間のセッション 4 件 · 前 1.0 件",
        ),
        (
            "スキルの呼び出し",
            "3",
            ("better", "+200.0%"),
            "前 1 回 · 使った人 2 / 全 3 人",
        ),
        ("コマンドの呼び出し", "1", ("", "±0.0%"), "前 1 回 · 使った人 1 / 全 3 人"),
        (
            "セッションの大きさ（中央）",
            "90k",
            ("worse", "+63.6%"),
            "四分位 60k〜150k · 前 55k · 3 セッション",
        ),
        (
            "自動コンパクトに達した割合",
            "33.3",
            ("", "−16.7 pt"),
            "1 / 3 セッション · 前 50.0%",
        ),
    ],
)
def test_card_values_chips_and_lines(act_client, label, value, chip, sub):
    html = html_of(act_client)
    assert _text(card_value(html, label)) == value
    assert _chip(card(html, label)) == chip
    assert sub in _plain(card(html, label))


def test_direction_of_chips_on_decrease(act_client, db_conn):
    """利用が減ったら悪化、セッションが小さくなったら改善の色。"""
    from known_data import insert_event

    for i in range(6):
        insert_event(
            db_conn,
            event_id=f"p{i}",
            ts=1,
            day=20016,
            user_email="d@example.com",
            host="h",
            hook_event="UserPromptSubmit",
            session_id="sd1",
        )
    insert_event(
        db_conn,
        event_id="big",
        ts=1,
        day=20016,
        user_email="d@example.com",
        host="h",
        hook_event="Stop",
        session_id="sd1",
        context_tokens=900000,
    )
    html = html_of(act_client)
    assert _chip(card(html, "1 人 1 日あたりの指示"))[0] == "worse"
    assert _chip(card(html, "セッションの大きさ（中央）"))[0] == "better"


def test_cards_without_previous_have_no_chip(act_client):
    html = html_of(act_client)
    for label in ("外部ツールの呼び出し", "サブエージェントの起動"):
        assert '<span class="change' not in card(html, label)
    assert "前 0 回 · 使った人 2 / 全 3 人" in _text(
        card(html, "サブエージェントの起動")
    )


def test_top_calls_of_the_cards(act_client):
    html = html_of(act_client)
    assert "pdf 2 回 2 人 xlsx 1 回 1 人" in _text(card(html, "スキルの呼び出し"))
    external = _text(card(html, "外部ツールの呼び出し"))
    assert external.startswith("外部ツールの呼び出し 一覧 4 回")
    assert "github（MCP） 2 回 1 人" in external
    assert re.search(r'data-open="calls:external"', card(html, "外部ツールの呼び出し"))


def test_built_in_tools_are_not_shown_anywhere(act_client):
    for query in ("", "?period=28"):
        html = html_of(act_client, query)
        for tool in ("Read", "Bash", "Grep", "Agent", "Task"):
            assert f">{tool}<" not in html and f"{tool} " not in _text(html), tool


def test_tabs_in_order(act_client):
    assert re.findall(r'data-tab="([^"]+)"', html_of(act_client)) == TABS


def test_user_use_rows(act_client):
    rows = {
        r["cells"][0].split()[0]: r["cells"][1:]
        for r in table_rows(html_of(act_client), "user_use")
    }
    assert rows["a@example.com"] == [
        "2 日",
        "2",
        "3",
        "+2",
        "+200.0%",
        "60k",
        "50.0%",
        "33.3%",
        "2024-10-27",
    ]
    assert rows["b@example.com"] == [
        "1 日",
        "1",
        "3",
        "+3",
        "—",
        "210k",
        "0.0%",
        "0.0%",
        "2024-11-01",
    ]
    assert rows["c@example.com"] == [
        "1 日",
        "1",
        "0",
        "±0",
        "—",
        "—",
        "—",
        "0.0%",
        "2024-10-29",
    ]
    assert len(rows) == 3


def test_user_calls_rows(act_client):
    rows = {
        r["cells"][0].split()[0]: r["cells"][1:]
        for r in table_rows(html_of(act_client), "user_calls")
    }
    assert rows["a@example.com"] == [
        "1",
        "pdf 1",
        "1",
        "/review 1",
        "3",
        "github（MCP） 2 WebSearch 1",
        "1",
    ]
    assert rows["b@example.com"] == [
        "2",
        "pdf 1 xlsx 1",
        "0",
        "—",
        "1",
        "WebFetch 1",
        "1",
    ]
    assert rows["c@example.com"] == ["0", "—", "0", "—", "0", "—", "0"]


def test_calls_rows_and_chips(act_client):
    html = html_of(act_client)
    rows = {
        (r["cells"][0], r["cells"][1], r["cells"][2]): (r["cells"][3:], r["tags"])
        for r in table_rows(html, "calls")
    }
    assert rows[("スキル", "pdf", "—")] == (
        ["2 回", "", "1", "+1", "2 人", "+1"],
        ["skill", "up"],
    )
    assert rows[("コマンド", "/review", "user")] == (
        ["0 回", "", "1", "−1", "0 人", "−1"],
        ["command", "down"],
    )
    assert rows[("外部ツール", "github（MCP）", "—")][1] == ["external", "up"]
    assert len(rows) == 7
    chips = re.findall(
        r'data-chip="([^"]+)"',
        table_body(html, "calls")
        + html.split('data-panel="calls"')[1].split("</table>")[0],
    )
    assert {"skill", "command", "external", "up", "down"} <= set(chips)


def test_daily_use_covers_both_windows(act_client):
    rows = table_rows(html_of(act_client), "daily_use")
    assert len(rows) == 14
    by_day = {r["cells"][0][:10]: r["cells"] for r in rows}
    assert by_day["2024-11-01"][2:5] == ["1 人", "1 件", "3 件"]
    assert by_day["2024-10-24"][2:5] == ["0 人", "0 件", "0 件"]
    assert by_day["2024-10-19"][1] == "前の 7 日"


def test_session_size_tab_bins(act_client):
    rows = {
        r["cells"][0]: r["cells"][1:]
        for r in table_rows(html_of(act_client), "session_size")
    }
    assert rows["200k–220k"] == ["0", "0.0%", "1", "33.3%"]
    assert rows["40k–60k"] == ["1", "50.0%", "0", "0.0%"]
    assert len(rows) == 5


def test_usage_modes_tab(act_client):
    rows = table_rows(html_of(act_client), "usage_modes")
    modes = {
        r["cells"][1]: r["cells"][2] for r in rows if r["cells"][0] == "権限モード"
    }
    assert modes == {
        "manual 操作ごとに許可を求める": "6",
        "bypass permissions すべての操作を確認なし": "1",
    }


def test_28_days_reach_further_back(act_client):
    html = html_of(act_client, "?period=28")
    assert card_value(html, "スキルの呼び出し") == "5"
    assert "前の 28 日" in html


def test_asof_cuts_the_window(act_client):
    html = html_of(act_client, "?asof=2024-10-29")
    assert card_value(html, "1 人 1 日あたりの指示") == "1.0"
    assert "b@example.com" not in html


def test_twelve_months_shows_notes_and_no_tables(act_client):
    html = html_of(act_client, "?period=12m")
    assert "<table" not in html and '<a class="card' not in html
    assert html.count('<p class="na">') == len(TABS)
    notes = re.findall(r'<p class="gnote">([^<]*)</p>', html)
    assert notes[1] == (
        "スキルの呼び出し・コマンドの呼び出し・外部ツールの呼び出し・サブエージェントの起動は、記録から数えるため 12 か月では出しません"
    )
    assert '<span class="change' not in html


def test_old_url_moves_to_the_new_page(act_client):
    response = act_client.get(ADMIN + "/assets?period=28&asof=2024-10-29&x=1")
    assert response.status_code == 301
    assert response.headers["Location"].endswith(
        f"{ADMIN}/activity?period=28&asof=2024-10-29"
    )
    assert (
        act_client.get(ADMIN + "/assets")
        .headers["Location"]
        .endswith(f"{ADMIN}/activity")
    )


def test_navigation_names_the_page(act_client):
    html = html_of(act_client, "?period=28")
    nav = html.split('<nav aria-label="画面">')[1].split("</nav>")[0]
    assert re.findall(r">([^<]+)</a>", nav)[:3] == [
        "概況",
        "コストと利用者",
        "利用状況",
    ]
    assert f'href="{ADMIN}/activity?period=28" aria-current="page"' in nav
    assert "<h1>利用状況</h1>" in html


def test_command_without_source_is_shown_as_dash(act_client, db_conn):
    from known_data import insert_event

    insert_event(
        db_conn,
        event_id="n1",
        ts=1,
        day=20027,
        user_email="a@example.com",
        host="h",
        hook_event="UserPromptExpansion",
        command_name="commit",
    )
    rows = [
        r["cells"][:4]
        for r in table_rows(html_of(act_client), "calls")
        if r["cells"][1] == "commit"
    ]
    assert rows == [["コマンド", "commit", "—", "1 回"]]


def _bars(fragment: str) -> list:
    return re.findall(
        r'<span class="rate"><span>([^<]+)</span><span class="hbar ?([^"]*)">.*?<span class="num strong">([^<]+)</span>',
        fragment,
    )


def _mode(db_conn, event_id, mode, session="sc1"):
    from known_data import insert_event

    insert_event(
        db_conn,
        event_id=event_id,
        ts=1,
        day=20026,
        user_email="c@example.com",
        host="h",
        hook_event="UserPromptSubmit",
        session_id=session,
        permission_mode=mode,
    )


def test_bypass_card_shows_the_bypass_share_and_counts(act_client):
    html = html_of(act_client)
    block = card(html, "Bypass 権限モードの使用")
    assert _text(card_value(html, "Bypass 権限モードの使用")) == "14.3"
    assert "1 / 7 件 · 権限モードの内訳" in _plain(block)
    assert not re.search(r'class="change', block)
    assert 'data-open="usage_modes:permission_mode"' in block
    assert not re.search(r'class="cap"', block)
    tab = {
        r["cells"][1].split(" ")[0]: r["cells"][3]
        for r in table_rows(html, "usage_modes")
        if r["cells"][0] == "権限モード"
    }
    assert tab == {"manual": "85.7%", "bypass": "14.3%"}


def test_bypass_card_bars_are_in_the_fixed_order_with_only_bypass_dark(act_client):
    block = card(html_of(act_client), "Bypass 権限モードの使用")
    assert _bars(block) == [
        ("manual", "ghost", "85.7%"),
        ("plan", "ghost", "0.0%"),
        ("accept edits", "ghost", "0.0%"),
        ("auto", "ghost", "0.0%"),
        ("bypass permissions", "", "14.3%"),
    ]


def test_bypass_card_order_ignores_counts_and_leaves_dont_ask_out(act_client, db_conn):
    for i, mode in enumerate(
        ["auto"] * 9 + ["plan"] * 3 + ["acceptEdits"] * 2 + ["dontAsk"]
    ):
        _mode(db_conn, f"m{i}", mode)
    html = html_of(act_client)
    block = card(html, "Bypass 権限モードの使用")
    assert _text(card_value(html, "Bypass 権限モードの使用")) == "4.5"
    assert "1 / 22 件" in _plain(block)
    assert _bars(block) == [
        ("manual", "ghost", "27.3%"),
        ("plan", "ghost", "13.6%"),
        ("accept edits", "ghost", "9.1%"),
        ("auto", "ghost", "40.9%"),
        ("bypass permissions", "", "4.5%"),
    ]
    assert "don't ask" not in block


def test_bypass_card_without_records(act_client, db_conn):
    db_conn.cursor().execute("UPDATE events SET permission_mode = NULL")
    db_conn.commit()
    html = html_of(act_client)
    block = card(html, "Bypass 権限モードの使用")
    assert _text(card_value(html, "Bypass 権限モードの使用")) == "—"
    assert "0 / 0 件" in _plain(block)
    assert not _bars(block)


def test_user_use_column_and_note_say_lowercase_bypass_permissions(act_client):
    html = html_of(act_client)
    assert "bypass permissions 使用率" in html
    assert "Bypass Permissions" not in html
    assert "確認なしの記録" not in html


def test_usage_values_have_english_names_and_japanese_descriptions():
    from ccgov.web import labels

    names = {
        field: {k: v[0] for k, v in terms.items()}
        for field, terms in labels.USAGE_VALUE.items()
    }
    assert names == {
        "permission_mode": {
            "default": "manual", "auto": "auto", "plan": "plan", "acceptEdits": "accept edits",
            "bypassPermissions": "bypass permissions", "dontAsk": "don't ask",
        },
        "effort_level": {
            "low": "low", "medium": "medium", "high": "high", "xhigh": "xhigh", "max": "max",
        },
        "source": {"startup": "startup", "resume": "resume", "clear": "clear", "compact": "compact"},
    }  # fmt: skip
    assert all(
        len(v) == 2 and v[1] for t in labels.USAGE_VALUE.values() for v in t.values()
    )
