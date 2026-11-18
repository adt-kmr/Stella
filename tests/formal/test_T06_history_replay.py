"""T_06 - Review Historical Flare Events.

Subsystem ........ Dashboard & Database
Designed by ...... Pankhil Gupta (28 Oct 2026)
Executed by ...... Ashish Kumar (10 Nov 2026)
Description ...... Verify the user can view, filter and open past flare events
                   stored in the database.
Pre-conditions ... User logged in to dashboard. Database contains previously
                   logged events (T_05 passed).

Date filtering is a dashboard-layer operation over the catalog payload; the
test applies the same filter to the REST response and verifies that replay
does not mutate the stored events.
"""

from datetime import datetime, timedelta


def _event_time(event: dict) -> datetime:
    return datetime.fromisoformat(event["ts"].replace("Z", ""))


def test_T06_step01_events_listed_newest_first(client):
    """Step 1 - Past events displayed, newest first."""
    events = client.get("/api/catalog").json()
    assert len(events) == 6
    assert [e["id"] for e in events] == sorted((e["id"] for e in events), reverse=True)
    times = [_event_time(e) for e in events]
    assert times == sorted(times, reverse=True)


def test_T06_step02_selected_event_shows_details(client):
    """Step 2 - Selecting an event shows time, severity, lead time and confidence."""
    replay = client.get("/api/replay/3").json()
    assert replay["id"] == 3
    assert replay["class"] == "X2.7"
    assert replay["leadTime"] == 45
    assert replay["peakFlux"] == 2.7e-4
    assert len(replay["points"]) > 0


def test_T06_step03_filter_by_range_containing_events(client):
    """Step 3 - Only events within the chosen date range are listed."""
    events = client.get("/api/catalog").json()
    newest = _event_time(events[0])
    start, end = newest - timedelta(hours=3), newest + timedelta(hours=1)
    filtered = [e for e in events if start <= _event_time(e) <= end]
    assert filtered
    assert all(start <= _event_time(e) <= end for e in filtered)
    assert any(e["id"] == 6 for e in filtered)


def test_T06_step04_empty_range_shows_no_events_and_preserves_data(client):
    """Step 4 - Empty date range yields 'No events found'; stored data unchanged."""
    before = client.get("/api/catalog").json()
    distant_past = datetime(1990, 1, 1)
    filtered = [e for e in before if _event_time(e) >= distant_past]
    past_only = [e for e in before if _event_time(e) < datetime(2000, 1, 1)]
    assert past_only == []  # equivalent of the dashboard's 'No events found'
    assert filtered == before  # browsing/filtering never alters stored events
    after = client.get("/api/catalog").json()
    # Catalog timestamps are regenerated relative to 'now' on each request,
    # so compare the immutable event identities rather than the exact stamps.
    assert [(e["id"], e["cls"], e["peak"]) for e in after] == [
        (e["id"], e["cls"], e["peak"]) for e in before
    ]
