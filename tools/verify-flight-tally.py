"""Exercise the actual tally template using HA's template engine; no state writes."""
import ast
import json
import re
import textwrap
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
config = (root / 'js/ha-config.js').read_text()
url = re.search(r"HA_URL\s*=\s*['\"]([^'\"]+)", config)[1]
token = re.search(r"HA_TOKEN\s*=\s*['\"]([^'\"]+)", config)[1]
yaml = (root / 'ha/flight-daily-tally.yaml').read_text()
code = textwrap.dedent(yaml.split('tally_ids: >-\n')[1].split('\n      state:')[0])
# Substitute inputs only; run the same deduplication, freshness and geometry.
code = code.replace('states.sensor.flightradar24_current_in_area', 'fixture.source')
code = code.replace("state_attr('zone.home', 'latitude')", '47.5')
code = code.replace("state_attr('zone.home', 'longitude')", '-122.3')
code = code.replace("is_state('switch.flightradar24_api_data_fetching', 'on')", 'fixture.fetching')
code = code.replace('as_timestamp(source.last_updated, 0)', '(as_timestamp(now()) - fixture.age)')
code = code.replace("state_attr('sensor.flightradar24_planes_today', 'flight_ids')", "this.attributes.get('flight_ids')")
code = code.replace("state_attr('sensor.flightradar24_planes_today', 'day')", "this.attributes.get('day')")

def check(name, flights, expected, previous=None, day='today', age=10, fetching=True):
    fixture = dict(source=dict(state='1', attributes=dict(flights=flights)), age=age, fetching=fetching)
    attrs = dict(day=day, flight_ids=previous or [])
    prefix = "{% set tally_day = 'today' %}"
    prefix += "{% set this = {'attributes': " + repr(attrs) + "} %}"
    prefix += "{% set fixture = '" + json.dumps(fixture) + "' | from_json %}"
    request = urllib.request.Request(url + '/api/template', data=json.dumps({'template': prefix + code}).encode(),
                                    headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    result = ast.literal_eval(urllib.request.urlopen(request, timeout=20).read().decode().strip())
    assert result == expected, (name, result, expected)
    print('PASS:', name)

plane = dict(id='journey-1', latitude=47.5, longitude=-122.3)
check('first airborne flight inside radius', [plane], ['journey-1'])
check('repeated sightings and re-entry counted once', [plane, plane], ['journey-1'], previous=['journey-1'])
check('another journey by the same aircraft counts', [dict(plane, id='journey-2')], ['journey-1', 'journey-2'], previous=['journey-1'])
check('square corners outside the radius excluded', [dict(plane, latitude=47.57, longitude=-122.20)], [])
check('grounded and invalid positions excluded', [dict(plane, on_ground=True), dict(plane, latitude=None)], [])
check('midnight resets IDs, including aircraft still overhead', [plane], ['journey-1'], previous=['yesterday'], day='yesterday')
check('paused feed retains total', [plane], ['earlier'], previous=['earlier'], fetching=False)
check('stale feed retains total', [plane], ['earlier'], previous=['earlier'], age=200)
check('new day resets even when tracking is paused', [plane], [], previous=['yesterday'], day='yesterday', fetching=False)
