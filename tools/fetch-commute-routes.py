"""Cache the driving routes the screensaver map draws for commutes (js/commute-layer.js).

Run from the project root. For each commute zone, asks the OSRM demo router (OpenStreetMap data, no
traffic: only the route's shape is used; live minutes come from the Waze sensors in HA) for
home -> zone and zone -> home (through the stop on the way, if any), and writes data/commute-routes.json (gitignored: home coordinates).
"""
import json
import re
import urllib.request
from pathlib import Path

# Commute zone -> stop on the way (both directions): King's drop-off in the morning, pickup on the
# way home (the user, 2026-10-24). Add Tim's work zone here once it exists.
ZONES = {"zone.emily_s_hotel": "zone.king_s"}

root = Path(__file__).resolve().parent.parent
config = (root / "js/ha-config.js").read_text(encoding="utf-8")
ha_url = re.search(r"HA_URL\s*=\s*['\"]([^'\"]+)", config)[1]
token = re.search(r"HA_TOKEN\s*=\s*['\"]([^'\"]+)", config)[1]


def get(url, headers=None):
    request = urllib.request.Request(url, headers={"User-Agent": "HomeScreensaver/1.0", **(headers or {})})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def where(entity):
    a = get(f"{ha_url}/api/states/{entity}", {"Authorization": f"Bearer {token}"})["attributes"]
    return a["latitude"], a["longitude"]


def route(*stops):
    path = ";".join(f"{lon},{lat}" for lat, lon in stops)
    url = f"https://router.project-osrm.org/route/v1/driving/{path}?overview=full&geometries=geojson"
    r = get(url)["routes"][0]
    return [[round(lat, 5), round(lon, 5)] for lon, lat in r["geometry"]["coordinates"]]


home = where("zone.home")
routes = {}
for zone, via in ZONES.items():
    spot, stop = where(zone), where(via) if via else None
    routes[f"zone.home>{zone}"] = route(home, *([stop] if stop else []), spot)
    routes[f"{zone}>zone.home"] = route(spot, *([stop] if stop else []), home)
destination = root / "data/commute-routes.json"
destination.write_text(json.dumps({"routes": routes, "source": "OSRM (OpenStreetMap contributors)"}, separators=(",", ":")), encoding="utf-8")
print(f"Cached {len(routes)} routes ({destination.stat().st_size:,} bytes).")
