"""T_05 - Generate and Display Flare Warning.

Subsystem ........ Alert Engine & Dashboard
Designed by ...... Hitanshi Antil (28 Oct 2026)
Executed by ...... Aditya Kumar (09 Nov 2026)
Description ...... Verify nowcast and forecast results are aggregated, a
                   warning is issued only for moderate or high risk, and the
                   alert is logged and shown.
Pre-conditions ... Nowcast and forecast outputs available (T_03, T_04 passed).
                   User logged in to dashboard.

Warnings are driven by the deterministic risk engine in ``pipeline.impact``;
the dashboard renders whatever the status feed publishes.
"""

from api.store import store
from pipeline.impact import domain_risks, RISK_ORDER


def test_T05_step01_high_risk_predictions_aggregated(client):
    """Step 1 - High-risk predictions aggregated as high risk."""
    rows = domain_risks("X5.0", 30)
    levels = {row["risk"] for row in rows}
    assert RISK_ORDER[-1] in levels  # at least one 'red' domain


def test_T05_step02_alert_logged_with_time_severity_confidence(client, restore_state, tick_factory, warning_alert):
    """Step 2 - Alert logged with time, severity and confidence."""
    assert client.post(
        "/api/update",
        json=tick_factory(state="ACTIVE", flare_class="X2.7", alerts=[warning_alert]),
    ).status_code == 200

    alerts = client.get("/api/alerts").json()
    assert len(alerts) == 1
    assert {"ts", "type", "level", "msg"} <= alerts[0].keys()
    assert alerts[0]["level"] == "RED"
    assert alerts[0]["prob"] == 92


def test_T05_step03_warning_visible_with_severity_lead_confidence(client, restore_state, tick_factory, warning_alert):
    """Step 3 - Warning displayed with severity, lead time and confidence."""
    client.post(
        "/api/update",
        json=tick_factory(state="ACTIVE", flare_class="X2.7", alerts=[warning_alert]),
    )
    status = client.get("/api/status").json()
    assert status["systemStatus"]["state"] == "ACTIVE"
    assert status["nowcast"]["class"] == "X2.7"
    assert status["forecast"]["leadTime"] >= 15
    assert status["forecast"]["probability"] >= 50
    assert status["hardnessRatio"]["preFlareSignal"] is True


def test_T05_step04_low_risk_shows_normal_status_no_warning(client, restore_state, tick_factory):
    """Step 4 - Low-risk input: normal status, no warning issued."""
    client.post("/api/update", json=tick_factory(state="QUIET", flare_class="B1.0", alerts=[]))
    status = client.get("/api/status").json()
    assert status["systemStatus"]["state"] == "QUIET"
    assert status["alerts"] == []
    assert client.get("/api/alerts").json() == []


def test_T05_step05_no_new_alert_record_created(client, restore_state, tick_factory, warning_alert):
    """Step 5 - Normal status shown; no new alert record exists for low risk."""
    client.post(
        "/api/update",
        json=tick_factory(state="ACTIVE", flare_class="X2.7", alerts=[warning_alert]),
    )
    assert len(client.get("/api/alerts").json()) == 1

    client.post("/api/update", json=tick_factory(state="QUIET", flare_class="B1.0", alerts=[]))
    assert client.get("/api/alerts").json() == []
    assert store.get("latest")["alerts"] == []
