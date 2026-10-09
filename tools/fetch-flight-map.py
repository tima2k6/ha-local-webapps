"""Cache local OSM linework using the screensaver's existing HA configuration.

Run from the project root. No credentials are included in the output.
"""
import json
import math
import re
import urllib.parse
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
config = (root / "js/ha-config.js").read_text(encoding="utf-8")
ha_url = re.search(r"HA_URL\s*=\s*['\"]([^'\"]+)", config)[1]
token = re.search(r"HA_TOKEN\s*=\s*['\"]([^'\"]+)", config)[1]


def state(entity):
    request = urllib.request.Request(
        f"{ha_url}/api/states/{entity}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


home = state("zone.home")["attributes"]
lat, lon = home["latitude"], home["longitude"]
area = state("sensor.flightradar24_current_in_area")
north, south, west, east = map(float, area["attributes"]["bounds"].split(","))
coslat = math.cos(math.radians(lat))
# Match the screen's 16:10 aspect ratio, while retaining the whole monitored area.
half_height = max(abs(north-lat), abs(south-lat),
                  abs(west-lon)*coslat/1.6, abs(east-lon)*coslat/1.6) * 1.4
half_width = half_height * 1.6 / coslat
bbox = (lat-half_height*.8, lon-half_width, lat+half_height*1.2, lon+half_width)
box = ",".join(map(str, bbox))
query = f'''[out:json][timeout:45];(
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)(_link)?$"]({box});
way["natural"~"^(water|coastline)$"]({box});
way["waterway"~"^(river|canal)$"]({box});
);out geom;'''
request = urllib.request.Request(
    "https://overpass-api.de/api/interpreter",
    data=urllib.parse.urlencode({"data": query}).encode(),
    headers={"User-Agent": "HomeScreensaver/1.0"},
)
with urllib.request.urlopen(request, timeout=60) as response:
    osm = json.load(response)

ways = []
for way in osm["elements"]:
    geometry = way.get("geometry", [])
    if len(geometry) < 2:
        continue
    tags = way.get("tags", {})
    kind = tags.get("highway") or tags.get("natural") or tags.get("waterway")
    ways.append({"kind": kind, "points": [[p["lat"], p["lon"]] for p in geometry]})
output = {"home": [lat, lon], "bbox": bbox, "ways": ways,
          "attribution": "OpenStreetMap contributors", "source": "https://www.openstreetmap.org/copyright"}
destination = root / "data/local-flight-map.json"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
print(f"Cached {len(ways)} road/water outlines ({destination.stat().st_size:,} bytes).")
