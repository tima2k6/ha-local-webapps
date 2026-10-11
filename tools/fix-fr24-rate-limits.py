"""Apply backed-up local fixes to FR24's optional detail rate-limit handling."""
from pathlib import Path
from datetime import datetime
import ast
import shutil

ROOT = Path(r"\\192.168.2.125\config")
PACKAGE = ROOT / "custom_components/flightradar24"
BACKUP = ROOT / "backups_manual" / ("fr24-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
prepared = {}

def replace(file, old, new):
    source = prepared.get(file, (PACKAGE / file).read_text(encoding="utf-8"))
    assert source.count(old) == 1, (file, old)
    prepared[file] = source.replace(old, new)

replace("api/client.py", "from FlightRadarAPI import FlightRadar24API, Flight\n", '''from FlightRadarAPI import FlightRadar24API, Flight
from importlib import import_module

# An empty small tracking area is normal. FlightRadarAPI 1.6.1 otherwise
# requests the same feed five times in a burst when global full_count > 0.
# HA's scheduled polling and session guard handle retries without this burst.
import_module(FlightRadar24API.__module__).FEED_EMPTY_RETRIES = 0
''')
replace("api/client.py", "from logging import Logger", "from logging import Logger\nfrom email.utils import parsedate_to_datetime\nfrom datetime import datetime, timezone")
replace("api/client.py", "def is_rate_limited(error) -> bool:", '''class RateLimitCooldown(Exception):
    """A local pause; no request was sent to FR24."""


def retry_after_seconds(error) -> float:
    response = getattr(error, "response", None)
    headers = getattr(error, "headers", None) or getattr(response, "headers", {})
    value = headers.get("Retry-After") if headers else None
    if value is None:
        return 0
    try:
        return max(0, float(value))
    except (TypeError, ValueError):
        try:
            return max(0, (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return 0


def is_rate_limited(error) -> bool:''')
replace("api/client.py", 'return (getattr(error, "code", None) == 429', 'return (isinstance(error, RateLimitCooldown)\n            or getattr(error, "code", None) == 429')
replace("api/client.py", "('_client', '_logger', '_last_request', '_lock')", "('_client', '_logger', '_last_request', '_lock', '_retry_at', '_rate_delay')")
replace("api/client.py", "self._lock = Lock()", "self._lock = Lock()\n        self._retry_at = {}\n        self._rate_delay = {}")
replace("api/client.py", "    def get_airport_details", '''    def retry_at(self, method_name: str) -> float:
        with self._lock:
            return self._retry_at.get(method_name, 0)

    def get_airport_details''')
replace("api/client.py", "            with self._lock:\n                elapsed", '''            with self._lock:
                if monotonic() < self._retry_at.get(method_name, 0):
                    raise RateLimitCooldown(f"{method_name} is waiting after HTTP 429")
                elapsed''')
replace("api/client.py", "                return method(*args, **kwargs)", '''                result = method(*args, **kwargs)
                with self._lock:
                    self._rate_delay.pop(method_name, None)
                    self._retry_at.pop(method_name, None)
                return result''')
replace("api/client.py", "                if is_rate_limited(e):\n                    raise", '''                if is_rate_limited(e):
                    with self._lock:
                        delay = max(retry_after_seconds(e), min(1800, self._rate_delay.get(method_name, 150) * 2))
                        self._rate_delay[method_name] = delay
                        self._retry_at[method_name] = monotonic() + delay
                    self._logger.warning('FlightRadar24: %s received HTTP 429; waiting %s seconds before retrying', method_name, delay)
                    raise''')
replace("api/flight.py", "from .client import FlightRadarClient", "from .client import FlightRadarClient, is_rate_limited")
replace("api/flight.py", "            data = self._client.get_flight_details(obj)\n            flight = self._get_flight_data(data)", '''            try:
                data = self._client.get_flight_details(obj)
                flight = self._get_flight_data(data)
            except Exception as error:
                if not is_rate_limited(error):
                    raise
                # The live feed already supplies position and aircraft identity.
                # Missing optional details must not freeze the entire area feed.
                flight = dict(previous) if is_same_flight else {
                    'id': obj.id,
                    'flight_number': getattr(obj, 'number', None),
                    'callsign': getattr(obj, 'callsign', None),
                    'aircraft_registration': getattr(obj, 'registration', None),
                    'aircraft_code': getattr(obj, 'aircraft_code', None),
                    'airport_origin_code_iata': getattr(obj, 'origin_airport_iata', None),
                    'airport_destination_code_iata': getattr(obj, 'destination_airport_iata', None),
                    'airline_iata': getattr(obj, 'airline_iata', None),
                }
                flight['details_pending'] = True''')
replace("api/flight.py", "    def _is_valid(self, flight: dict) -> bool:\n", "    def _is_valid(self, flight: dict) -> bool:\n        if flight.get('details_pending'):\n            return False\n")
replace("coordinator.py", '''            self._area_retry_at = monotonic() + 120
            self.logger.warning("FlightRadar24: area feed rate limited; pausing area requests for 120 seconds")''', '''            self._area_retry_at = max(monotonic() + 120, self.flight.client.retry_at("get_flights"))''')
replace("coordinator.py", "        now = monotonic()\n        if self.flight.raw_in_area_count", "        now = monotonic()\n        if now < self.flight.client.retry_at('get_flights'):\n            return\n        if self.flight.raw_in_area_count")

for name, source in prepared.items():
    ast.parse(source)
BACKUP.mkdir(parents=True)
for name, source in prepared.items():
    path = PACKAGE / name
    target = BACKUP / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)
    path.write_text(source, encoding="utf-8")
print("Patched files:", ", ".join(prepared))
print("Backups:", BACKUP)
