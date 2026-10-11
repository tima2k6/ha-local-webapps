"""Exercise the deployed history and rate-limit behavior without HA imports."""
import ast
import asyncio
import threading
import unittest
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(r'\\192.168.2.125\config/custom_components')

def definitions(path, names, namespace):
    tree = ast.parse((ROOT / path).read_text(encoding='utf-8'))
    selected = [node for node in tree.body if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in names]
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(path), 'exec'), namespace)

class LogFixTests(unittest.TestCase):
    def client_namespace(self):
        namespace = dict(FlightRadar24API=object, Flight=object, Logger=object,
                         Lock=threading.Lock, monotonic=lambda: 100, sleep=lambda _: None,
                         datetime=datetime, timezone=timezone, parsedate_to_datetime=parsedate_to_datetime,
                         REQUEST_INTERVAL=0.2, REQUEST_ATTEMPTS=3, RETRY_BASE_DELAY=2)
        definitions('flightradar24/api/client.py', {'RateLimitCooldown', 'retry_after_seconds', 'is_rate_limited', 'FlightRadarClient'}, namespace)
        return namespace

    def test_endpoint_cooldown_backoff_retry_after_and_recovery(self):
        ns = self.client_namespace()
        clock = [100]
        ns['monotonic'] = lambda: clock[0]
        calls = []
        class Limited(Exception):
            code = 429
            headers = {'Retry-After': '900'}
        def details(*args):
            calls.append('details')
            if len(calls) < 3: raise Limited()
            return {'ok': True}
        client = ns['FlightRadarClient'](SimpleNamespace(get_flight_details=details, get_flights=lambda **k: ['live']), SimpleNamespace(warning=lambda *a: None))
        with self.assertRaises(Limited): client.get_flight_details(None)
        self.assertEqual(client.retry_at('get_flight_details'), 1000)
        with self.assertRaises(ns['RateLimitCooldown']): client.get_flight_details(None)
        self.assertEqual(calls, ['details'])
        self.assertEqual(client.get_flights(), ['live'])
        clock[0] = 1000
        with self.assertRaises(Limited): client.get_flight_details(None)
        self.assertEqual(client.retry_at('get_flight_details'), 2800)
        clock[0] = 2800
        self.assertEqual(client.get_flight_details(None), {'ok': True})
        self.assertEqual(client.retry_at('get_flight_details'), 0)
        self.assertNotIn('get_flight_details', client._rate_delay)

    def test_detail_limit_preserves_new_and_existing_live_positions(self):
        tree = ast.parse((ROOT / 'flightradar24/api/flight.py').read_text(encoding='utf-8'))
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'FlightProcessor')
        selected = [n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name in ('_update_flights_data', '_is_valid')]
        ns = self.client_namespace() | dict(Any=object, FlightType=SimpleNamespace(IN_AREA=1), to_int=lambda v: v, is_helicopter=lambda f: False, time=lambda: 100, randint=lambda a,b: 2)
        exec(compile(ast.Module(body=selected, type_ignores=[]), '<flight>', 'exec'), ns)
        def limited(obj): raise ns['RateLimitCooldown']('details paused')
        processor = SimpleNamespace(_client=SimpleNamespace(get_flight_details=limited), _point=None,
            _is_valid=lambda f: False, _append_coordinates=lambda seed,lat,lon: (seed or [])+[[lat,lon]],
            _apply_gate_lifecycle=lambda *a: None, _takeoff_and_landing=lambda *a: None)
        obj = SimpleNamespace(id='flight', latitude=47, longitude=-122, altitude=1000, heading=90,
            ground_speed=200, squawk='1200', vertical_speed=0, on_ground=0, callsign='TEST',
            number='T1', registration='N1', get_distance_from=lambda p: 2)
        new = ns['_update_flights_data'](processor, obj, {}, 1)
        self.assertEqual((new['id'], new['latitude'], new['callsign']), ('flight',47,'TEST'))
        self.assertTrue(new['details_pending'])
        self.assertFalse(ns['_is_valid'](processor, new))
        old = new | {'latitude': 46, 'airport_origin_name': 'Seattle', 'closest_distance': 1}
        updated = ns['_update_flights_data'](processor, obj, old, 1)
        self.assertEqual(updated['airport_origin_name'], 'Seattle')
        self.assertEqual(updated['latitude'],47)
        self.assertEqual(updated['closest_distance'],1)
        def details(obj): return {'ok': True}
        processor._client.get_flight_details=details
        processor._get_flight_data=lambda data: {'id': 'flight','details_updated_at': 100}
        recovered = ns['_update_flights_data'](processor, obj, updated, 1)
        self.assertNotIn('details_pending', recovered)

    def test_rate_limit_is_not_retried_immediately(self):
        namespace = self.client_namespace()
        calls = []
        def get_flights(**kwargs):
            calls.append(kwargs)
            raise RuntimeError('HTTP Error 429:')
        client = namespace['FlightRadarClient'](SimpleNamespace(get_flights=get_flights), SimpleNamespace(warning=lambda *a: None))
        with self.assertRaisesRegex(RuntimeError, '429'): client.get_flights(bounds='test')
        self.assertEqual(len(calls), 1)

    def test_non_rate_limit_errors_retain_existing_retries(self):
        namespace = self.client_namespace()
        calls = []
        def get_flights(**kwargs):
            calls.append(kwargs)
            if len(calls) < 3: raise RuntimeError('temporary connection error')
            return {'flight': 1}
        client = namespace['FlightRadarClient'](SimpleNamespace(get_flights=get_flights), SimpleNamespace(warning=lambda *a: None))
        self.assertEqual(client.get_flights(), {'flight': 1})
        self.assertEqual(len(calls), 3)

    def test_history_preserves_payload_and_replaces_old_attributes(self):
        tree = ast.parse((ROOT / 'hubitat/sensor.py').read_text(encoding='utf-8'))
        cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'HubitatSensor')
        method = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == 'load_state')
        method.decorator_list = []
        namespace = {}
        exec(compile(ast.Module(body=[method], type_ignores=[]), '<history>', 'exec'), namespace)
        history = '\n'.join(f'47.75,-122.35,{n}' for n in range(30))
        sensor = SimpleNamespace(_attribute='history', _get_native_value=lambda: history, _get_native_unit_of_measurement=lambda: None)
        namespace['load_state'](sensor)
        self.assertLessEqual(len(sensor._attr_native_value), 255)
        self.assertEqual(sensor._attr_native_value, history.splitlines()[0])
        self.assertEqual(sensor._attr_extra_state_attributes['history'], history)
        sensor._get_native_value = lambda: ''
        namespace['load_state'](sensor)
        self.assertEqual(sensor._attr_extra_state_attributes['history'], '')
        numeric = SimpleNamespace(_attribute='temperature', _get_native_value=lambda: 70, _get_native_unit_of_measurement=lambda: 'F')
        namespace['load_state'](numeric)
        self.assertEqual(numeric._attr_native_value, 70)
        self.assertFalse(hasattr(numeric, '_attr_extra_state_attributes'))

    def test_area_backoff_skips_network_and_stale_state_publication(self):
        tree = ast.parse((ROOT / 'flightradar24/coordinator.py').read_text(encoding='utf-8'))
        cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and any(isinstance(n, ast.AsyncFunctionDef) and n.name == '_update_area_and_tracked' for n in node.body))
        method = next(node for node in cls.body if isinstance(node, ast.AsyncFunctionDef) and node.name == '_update_area_and_tracked')
        clock = [100]
        namespace = self.client_namespace() | {'monotonic': lambda: clock[0]}
        exec(compile(ast.Module(body=[method], type_ignores=[]), '<backoff>', 'exec'), namespace)
        calls = []
        def update():
            calls.append('request')
            if len(calls) == 1: raise RuntimeError('HTTP Error 429:')
        async def executor(fn): fn()
        flight = SimpleNamespace(update_flights_in_area=update, update_flights_tracked=lambda: None,
                                 client=SimpleNamespace(retry_at=lambda method: 0),
                                 in_area_list=[], entered_list=[], exited_list=[], tracked=[], tracked_list=[])
        published = []
        coordinator = SimpleNamespace(hass=SimpleNamespace(async_add_executor_job=executor), flight=flight,
            logger=SimpleNamespace(warning=lambda *a: None), async_set_updated_data=published.append,
            event_manager=SimpleNamespace(fire_events=lambda *a: None), config_entry=SimpleNamespace(title='test'), _fire=None)
        async def scenario():
            await namespace['_update_area_and_tracked'](coordinator)
            self.assertEqual(coordinator._area_retry_at, 220)
            clock[0] = 219
            await namespace['_update_area_and_tracked'](coordinator)
            self.assertEqual(len(calls), 1)
            self.assertFalse(published)
            clock[0] = 220
            await namespace['_update_area_and_tracked'](coordinator)
            self.assertEqual(len(calls), 2)
            self.assertTrue(published)
        asyncio.run(scenario())

if __name__ == '__main__': unittest.main(verbosity=2)
