"""Cache local OSM linework (streets, water, rivers, main rail lines, named trails) and place/lake labels using the screensaver's existing HA configuration.

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
way["railway"~"^(rail|light_rail)$"][!"service"]({box});
way["highway"~"^(cycleway|path|footway|bridleway)$"]["name"~"Trail|Greenway|Interurban|Eastrail",i]({box});
);out geom;'''
# Names for the faint label layer: towns and neighbourhoods, lakes, bays.
label_query = f'''[out:json][timeout:60];(
node["place"~"^(city|town|village|suburb|quarter|neighbourhood)$"]["name"]({box});
nwr["natural"="water"]["water"="lake"]["name"]({box});
node["natural"="bay"]["name"]({box});
);out center bb tags;'''


def overpass(q):
    request = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": q}).encode(),
        headers={"User-Agent": "HomeScreensaver/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def metres(a, b):
    return math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * coslat)


osm = overpass(query)

ways, trails = [], {}
for way in osm["elements"]:
    geometry = way.get("geometry", [])
    if len(geometry) < 2:
        continue
    tags = way.get("tags", {})
    points = [[p["lat"], p["lon"]] for p in geometry]
    if tags.get("highway") in ("cycleway", "path", "footway", "bridleway"):
        trails.setdefault(tags["name"], []).append(points)
        continue
    kind = tags.get("highway") or tags.get("natural") or tags.get("waterway") or tags.get("railway")
    ways.append({"kind": kind, "points": points})
# Only the long regional trails (Burke-Gilman, Interurban, Eastrail...): park loops are clutter.
for name, parts in trails.items():
    if sum(metres(a, b) for pts in parts for a, b in zip(pts, pts[1:])) >= 2000:
        ways += [{"kind": "trail", "points": pts} for pts in parts]

PLACE_RANK = {"city": 1, "town": 1, "village": 2, "suburb": 2, "quarter": 3, "neighbourhood": 3}
labels = []
for e in overpass(label_query)["elements"]:
    tags, b = e.get("tags", {}), e.get("bounds")
    # "out center bb" gives ways/relations only their bounds: label the middle of those.
    where = e.get("center") or ({"lat": (b["minlat"] + b["maxlat"]) / 2, "lon": (b["minlon"] + b["maxlon"]) / 2} if b else e)
    name, la, lo = tags.get("name"), where.get("lat"), where.get("lon")
    if not name or la is None or not (bbox[0] <= la <= bbox[2] and bbox[1] <= lo <= bbox[3]):
        continue
    if tags.get("natural") == "water":
        b = b or {}
        size = max((b.get("maxlat", la) - b.get("minlat", la)) * 111320, (b.get("maxlon", lo) - b.get("minlon", lo)) * 111320 * coslat)
        if size < 300:            # ponds
            continue
        labels.append({"kind": "water", "rank": 2 if size >= 700 else 3, "name": name, "lat": la, "lon": lo})
    elif tags.get("natural") == "bay":
        if "park" not in name.lower():   # "Edmonds Underwater Park" is tagged as a bay
            labels.append({"kind": "water", "rank": 3, "name": name, "lat": la, "lon": lo})
    else:
        labels.append({"kind": "place", "rank": PLACE_RANK[tags["place"]], "name": name, "lat": la, "lon": lo})
# Big water whose OSM centre is off the map (Lake Washington) or has no name point (the Sound).
for name, la, lo in [("Puget Sound", 47.721, -122.431), ("Lake Washington", 47.705, -122.262)]:
    labels = [l for l in labels if l["name"] != name]
    labels.append({"kind": "water", "rank": 1, "name": name, "lat": la, "lon": lo})
output = {"home": [lat, lon], "bbox": bbox, "ways": ways, "labels": labels,
          "attribution": "OpenStreetMap contributors", "source": "https://www.openstreetmap.org/copyright"}
destination = root / "data/local-flight-map.json"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
print(f"Cached {len(ways)} outlines and {len(labels)} labels ({destination.stat().st_size:,} bytes).")
