"""Static reference tables shared by the API routers.

Kept dependency-free so both the metadata router and the legacy app surface
can import the same GOES flare scale and India regional grid without a
circular import on ``api.main``.
"""

from __future__ import annotations

# GOES soft X-ray background-to-X scale. ``peak_flux_min`` is the lower bound
# (W/m^2) that a flare must reach to be classified at that letter.
FLARE_CLASS_REFERENCE: list[dict] = [
    {"class": "A", "peakFluxMin": 1e-8, "description": "Background-level, no radio impact"},
    {"class": "B", "peakFluxMin": 1e-7, "description": "Minor brightening, no radio impact"},
    {"class": "C", "peakFluxMin": 1e-6, "description": "Small flares, R1 blackout possible"},
    {"class": "M", "peakFluxMin": 1e-5, "description": "Moderate flares, R1-R2 blackouts"},
    {"class": "X", "peakFluxMin": 1e-4, "description": "Major flares, R3+ blackouts"},
]

# India states/UTs with approximate centroids, used for the GIC / GPS grid.
INDIA_REGIONS: list[dict] = [
    # Northern region (highest GIC risk)
    {"id": "jk", "name": "Jammu & Kashmir", "lat": 34.0, "lng": 76.5, "zone": "north"},
    {"id": "hp", "name": "Himachal Pradesh", "lat": 31.5, "lng": 77.0, "zone": "north"},
    {"id": "uk", "name": "Uttarakhand", "lat": 30.0, "lng": 79.0, "zone": "north"},
    {"id": "pb", "name": "Punjab", "lat": 31.0, "lng": 75.5, "zone": "north"},
    {"id": "hr", "name": "Haryana", "lat": 29.5, "lng": 76.5, "zone": "north"},
    {"id": "dl", "name": "Delhi", "lat": 28.6, "lng": 77.2, "zone": "north"},
    {"id": "rj", "name": "Rajasthan", "lat": 27.0, "lng": 74.0, "zone": "northwest"},
    {"id": "up", "name": "Uttar Pradesh", "lat": 27.0, "lng": 80.5, "zone": "north"},
    # Central / East
    {"id": "br", "name": "Bihar", "lat": 25.5, "lng": 85.5, "zone": "east"},
    {"id": "jh", "name": "Jharkhand", "lat": 23.5, "lng": 85.5, "zone": "east"},
    {"id": "wb", "name": "West Bengal", "lat": 23.0, "lng": 88.0, "zone": "east"},
    {"id": "sk", "name": "Sikkim", "lat": 27.5, "lng": 88.5, "zone": "north"},
    {"id": "as", "name": "Assam", "lat": 26.5, "lng": 92.5, "zone": "northeast"},
    {"id": "ar", "name": "Arunachal Pradesh", "lat": 28.0, "lng": 94.0, "zone": "northeast"},
    {"id": "nl", "name": "Nagaland", "lat": 26.0, "lng": 94.5, "zone": "northeast"},
    {"id": "mn", "name": "Manipur", "lat": 24.5, "lng": 93.5, "zone": "northeast"},
    {"id": "mz", "name": "Mizoram", "lat": 23.5, "lng": 92.8, "zone": "northeast"},
    {"id": "tr", "name": "Tripura", "lat": 23.5, "lng": 91.5, "zone": "northeast"},
    {"id": "ml", "name": "Meghalaya", "lat": 25.5, "lng": 91.5, "zone": "northeast"},
    # West / Central
    {"id": "gj", "name": "Gujarat", "lat": 22.5, "lng": 71.0, "zone": "west"},
    {"id": "mp", "name": "Madhya Pradesh", "lat": 23.0, "lng": 78.5, "zone": "central"},
    {"id": "cg", "name": "Chhattisgarh", "lat": 21.5, "lng": 82.0, "zone": "central"},
    {"id": "od", "name": "Odisha", "lat": 20.5, "lng": 84.5, "zone": "east"},
    # South
    {"id": "mh", "name": "Maharashtra", "lat": 19.0, "lng": 76.0, "zone": "west"},
    {"id": "ts", "name": "Telangana", "lat": 17.5, "lng": 79.5, "zone": "south"},
    {"id": "ap", "name": "Andhra Pradesh", "lat": 15.5, "lng": 79.5, "zone": "south"},
    {"id": "ka", "name": "Karnataka", "lat": 14.5, "lng": 76.0, "zone": "south"},
    {"id": "ga", "name": "Goa", "lat": 15.3, "lng": 74.0, "zone": "west"},
    {"id": "kl", "name": "Kerala", "lat": 10.5, "lng": 76.5, "zone": "south"},
    {"id": "tn", "name": "Tamil Nadu", "lat": 11.0, "lng": 78.5, "zone": "south"},
    {"id": "py", "name": "Puducherry", "lat": 11.9, "lng": 79.8, "zone": "south"},
    # Islands
    {"id": "an", "name": "Andaman & Nicobar", "lat": 11.5, "lng": 92.7, "zone": "islands"},
    {"id": "ld", "name": "Lakshadweep", "lat": 10.5, "lng": 72.5, "zone": "islands"},
]

INDIA_ZONES: list[str] = sorted({region["zone"] for region in INDIA_REGIONS})


def regions_in_zone(zone: str | None = None) -> list[dict]:
    """Return India regions, optionally filtered to a single zone."""
    if not zone:
        return list(INDIA_REGIONS)
    wanted = zone.strip().lower()
    return [region for region in INDIA_REGIONS if region["zone"] == wanted]
