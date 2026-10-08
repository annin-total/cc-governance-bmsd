"""管理画面のモック（案 51）に合わせた見た目と文言の検査。CSS は文字列として読む。"""

import importlib
import re
from pathlib import Path

import pytest
from activity_data import TODAY as ACT_TODAY
from activity_data import seed as act_seed
from conftest import ADMIN, admin_client, card, table_body, table_rows
from cost_data import html_of as cost_html

STATIC = Path(__file__).resolve().parent.parent / "ccgov" / "web" / "static"


def _decls(sheet: str, selector: str) -> str:
    css = re.sub(r"/\*.*?\*/", "", (STATIC / sheet).read_text(), flags=re.DOTALL)
    return " ".join(
        body
        for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css)
        if sel.strip() == selector
    )


def _get(client, path: str) -> str:
    return client.get(ADMIN + path).get_data(as_text=True)


@pytest.fixture
def act_client(db_conn, monkeypatch):
    import app as app_module
    from ccgov.web import admin

    act_seed(db_conn)
    importlib.reload(app_module)
    monkeypatch.setattr(admin.time, "time", lambda: ACT_TODAY * 86400)
    return admin_client(app_module.app)


def test_card_titles_wrap_at_word_breaks():
    body = _decls("components.css", ".k-label > span:first-child")
    assert "word-break: auto-phrase" in body
    assert "text-wrap: balance" in body


def test_users_group_note_in_7_and_28_days_not_in_12_months(cost_client):
    for query in ("", "?period=28"):
        html = cost_html(cost_client, query)
        assert (
            '<p class="gnote">基準超えは区分ごとの注意以上の人数（基準の金額はカードの中）'
            "· 使い始めた利用者は利用明細に初めてコストが出た人</p>"
        ) in html
    assert "基準超えは区分ごと" not in cost_html(cost_client, "?period=12m")


@pytest.mark.parametrize("query", ["", "?period=28"])
def test_user_cost_has_model_chips_beside_state_chips(cost_client, query):
    html = cost_html(cost_client, query)
    bars = html.split('data-testid="user_cost"')[0].rsplit('<div class="filters"', 1)[1]
    assert 'aria-label="モデル"' in bars
    for model in ("opus", "sonnet", "haiku"):
        assert re.search(rf">{model}<b>", bars)
    assert 'placeholder="氏名・メールで絞り込み"' in bars
    rows = table_rows(cost_html(cost_client, query), "user_cost")
    assert all(len(r["tags"]) == 2 for r in rows)


def test_user_cost_search_does_not_match_model_names(cost_client):
    html = cost_html(cost_client)
    assert not re.search(r'data-q="[^"]*opus', html)


def test_top_names_are_one_per_line_and_searchable(act_client):
    html = _get(act_client, "/activity")
    rows = {
        r["cells"][0].split()[0]: r["cells"] for r in table_rows(html, "user_calls")
    }
    assert rows["b@example.com"][2] == "pdf 1 xlsx 1"
    assert re.search(r"pdf <span class=\"sub\">1</span><br>\s*xlsx", html)
    body = table_body(html, "user_calls")
    row = re.search(r'<tr [^>]*data-q="([^"]*b@example.com[^"]*)"', body)
    assert row and "pdf" in row.group(1) and "xlsx" in row.group(1)
    assert 'placeholder="氏名・メール・名前で絞り込み"' in html


def test_versions_tab_has_no_all_chip_and_names_core_and_plugin(today_client):
    html = _get(today_client, "/policy")
    panel = html.split('data-panel="versions"')[1].split('data-testid="versions"')[0]
    bar = re.search(r'<div class="chipbar"[^>]*>(.*?)</div>', panel, re.DOTALL).group(1)
    assert re.findall(r'data-chip="([^"]*)"', bar) == ["core", "plugin"]
    assert "すべて" not in bar and ">本体<" in bar
    assert "本体とプラグインのバージョンの分布" in panel
    assert "Claude Code 本体" not in html


def test_policy_cards_say_recent_days_and_targets(today_client):
    html = _get(today_client, "/policy")
    assert "直近 30 日の対象 5 人のうち" in card(html, "すべての設定を適用")
    assert "直近 30 日の対象 5 人のうち" in card(html, "未適用のある利用者")
    assert "直近 30 日の対象 5 人のうち" in card(html, "プラグイン未導入")


def test_more_button_looks_like_a_button():
    body = _decls("components.css", ".fold-more")
    for want in ("background: var(--card)", "border-radius: var(--r-m)", "color: var(--accent)",
                 "padding: var(--sp-2xs) var(--sp-l)"):  # fmt: skip
        assert want in body


def test_draft_button_is_as_tall_as_save():
    assert "padding: var(--sp-s) var(--sp-l)" in _decls(
        "summary.css", ".sm-buttons .btn-sub"
    )


def test_received_records_chip_is_a_rate(today_client):
    sub = card(_get(today_client, "/collect"), "受信した記録")
    assert '<span class="change">+333.3%</span>' in sub


def test_forecast_legend_lines_are_2px():
    assert "border-top-width: 2px" in _decls("charts.css", ".cum-card-legend .ln")
    assert not _decls("charts.css", ".cum-card-legend .ln.prev")


def test_org_month_input_is_on_card_color():
    body = _decls("components.css", '.upload-form input[type="month"]')
    assert "background: var(--card)" in body
