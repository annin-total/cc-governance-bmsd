"""カードの小さなグラフのツールチップと、下段のグラフと表の連動の対応を、描画した画面で確かめる。"""

import re

from conftest import ADMIN, card, table_body
from known_data import insert_session_event, seed_effect_data
from test_web_views_effect import _html as effect_html


def _html(client, path: str = "/cost") -> str:
    return client.get(ADMIN + path).get_data(as_text=True)


def test_spark_points_carry_day_and_value(today_client):
    """カードの折れ線の点ごとに、日付と値のツールチップの文言がある（JS が無ければ SVG の title が同じ文言を出す）。"""
    fragment = card(_html(today_client), "コスト（利用明細）")
    hits = re.findall(
        r'<rect class="hit"[^>]*data-tip="([^"]*)"[^>]*><title>([^<]*)</title>',
        fragment,
    )
    assert hits and all(tip == title for tip, title in hits)
    assert all(re.fullmatch(r"\d\d/\d\d（.）  \S+", t) for t, _ in hits)
    assert re.findall(r'data-tip="([^"]*)"', fragment)[-1] == "10/08（火）  $5.50"


def _keys(fragment: str, tag: str) -> list:
    return re.findall(rf'<{tag}\b[^>]*data-link="([^"]*)"', fragment)


def _panel(html: str, tab: str) -> str:
    return html.split(f'data-panel="{tab}"')[1].split('<div class="panel"')[0]


def _tips(chart: str) -> list:
    """グラフの列ごとの `(data-tip, title)`。棒の上でも出るよう、列のまとまり（g）に持つ。"""
    return re.findall(
        r'<g class="col[^"]*"[^>]*data-tip="([^"]*)"><title>([^<]*)</title>', chart
    )


def test_tab_charts_and_rows_share_keys(today_client):
    """下段のグラフの棒と表の行が同じ data-link を持つ（連動の対応）。data-key は表を見分ける属性にだけ使う。"""
    for path, tab in (("/activity", "daily_use"), ("/cost", "cost")):
        html = _html(today_client, path)
        panel = _panel(html, tab)
        chart = panel.split('<div class="tscroll"')[0]
        rows = _keys(table_body(html, tab), "tr")
        assert rows and sorted(set(_keys(chart, "g"))) == sorted(rows), tab
        assert "data-key" not in panel
    assert (
        _keys(table_body(_html(today_client, "/activity"), "usage_modes"), "tr") == []
    )


def test_tab_charts_carry_a_tip_on_every_column(today_client):
    """下段のグラフも列ごとにツールチップを持ち（JS が無ければ同じ文言の title）、文言は見出しと 1〜3 個の値。"""
    shapes = {
        (
            "/activity",
            "daily_use",
        ): r"\d\d/\d\d（.）  利用者 \S+ 人 · セッション \S+ 件 · 指示 \S+ 件",
        ("/cost", "cost"): r"\d\d/\d\d（.）  合計 \$\S+( · [^·]+ \$\S+){1,2}",
    }
    for (path, tab), shape in shapes.items():
        chart = _panel(_html(today_client, path), tab).split('<div class="tscroll"')[0]
        cols = re.findall(r'<g class="col', chart)
        tips = _tips(chart)
        assert cols and len(tips) == len(cols), tab
        assert all(tip == title for tip, title in tips), tab
        assert all(re.fullmatch(shape, tip) for tip, _ in tips), (tab, tips[:2])


def test_month_tab_chart_carries_tips_in_both_modes(today_client):
    """今月のコストのタブは、営業日と暦日の 2 枚とも点ごとにツールチップを持つ。"""
    chart = _panel(_html(today_client, "/cost"), "month").split('<div class="tscroll"')[
        0
    ]
    for mode in chart.split("data-when=")[1:]:
        tips = _tips(mode)
        assert tips and len(tips) == len(re.findall(r'<g class="col', mode))
        assert all(re.fullmatch(r"\S.*  \S.*", t) for t, _ in tips)


def test_effect_hist_links_bins(db_conn):
    """セッションの大きさの前後の棒と行が区間で結ばれる。"""
    seed_effect_data(db_conn)
    insert_session_event(db_conn, "ce1", 20008, "s1", "Stop", 30000)
    insert_session_event(db_conn, "ce2", 20011, "s2", "Stop", 120000)
    html = effect_html()
    chart = _panel(html, "effect_sessions").split('<div class="tscroll">')[0]
    rows = _keys(table_body(html, "effect_sessions"), "tr")
    assert rows == ["20000", "120000"] and sorted(_keys(chart, "g")) == sorted(rows)
    tips = [t for t, _ in _tips(chart)]
    assert len(tips) == 2
    assert all(re.fullmatch(r"\S+  適用前 \S+% · 適用後 \S+%", t) for t in tips), tips
