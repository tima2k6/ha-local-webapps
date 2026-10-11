"""Back up and apply the confirmed October 2026 HA log fixes."""
import ast
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

import yaml

ROOT = Path(r'\\192.168.2.125\config')
BACKUP = ROOT / 'backups_manual' / ('log-cleanup-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
changes = {}

def read(name):
    return (ROOT / name).read_text(encoding='utf-8')

def replace_once(text, old, new):
    assert text.count(old) == 1, 'Expected exactly one matching configuration fragment'
    return text.replace(old, new, 1)

config = read('configuration.yaml')
config = replace_once(config, 'recorder:\n  purge_keep_days: 15', '''recorder:
  purge_keep_days: 15
  exclude:
    entities:
      # Raw feed attributes exceed the recorder limit; summary sensors stay recorded.
      - sensor.brightwheel_a2096536_45d9_4eaf_aa19_38c985d5e450_feed''')
config = replace_once(config, '''      https://nominatim.openstreetmap.org/reverse?format=json
      &lat={{ states('sensor.emily_latitude') if states('sensor.emily_latitude') not in ['unknown', 'unavailable', 'none'] else '0' }}
      &lon={{ states('sensor.emily_longitude') if states('sensor.emily_longitude') not in ['unknown', 'unavailable', 'none'] else '0' }}
      &zoom=18&addressdetails=1''', '''      {{ 'https://nominatim.openstreetmap.org/reverse?format=json&lat='
         ~ state_attr('person.emily', 'latitude')
         ~ '&lon=' ~ state_attr('person.emily', 'longitude')
         ~ '&zoom=18&addressdetails=1' }}''')
yaml.compose(config)
changes['configuration.yaml'] = config

autos = read('automations.yaml')
registry = json.loads(read('.storage/core.entity_registry'))['data']['entities']
entity_entries = {e['entity_id']: e['config_entry_id'] for e in registry}
devices = json.loads(read('.storage/core.device_registry'))['data']['devices']
device_entries = {d['id']: d.get('config_entries', [d.get('config_entry_id')]) for d in devices}
edits = []

def mapping(node):
    return {k.value: v for k, v in node.value}

def walk(node):
    if isinstance(node, yaml.MappingNode):
        fields = mapping(node)
        action = fields.get('action', fields.get('service'))
        if action and action.value == 'homeassistant.reload_config_entry' and 'target' in fields:
            target = mapping(fields['target'])
            entries = set()
            for key, value in target.items():
                values = [v.value for v in value.value] if isinstance(value, yaml.SequenceNode) else [value.value]
                for item in values:
                    if key == 'entity_id': entries.add(entity_entries[item])
                    elif key == 'device_id': entries.update(device_entries[item])
                    else: raise AssertionError('Unsupported reload target')
            assert len(entries) == 1 and None not in entries
            entry = entries.pop()
            target_key = next(k for k, v in node.value if k.value == 'target')
            indent = target_key.start_mark.column
            start = target_key.start_mark.index - indent
            end = fields['target'].end_mark.index - fields['target'].end_mark.column
            data = fields.get('data')
            if data is not None:
                assert isinstance(data, yaml.MappingNode) and not data.value
                edits.append((data.start_mark.index, data.end_mark.index, '{entry_id: "' + entry + '"}'))
                edits.append((start, end, ''))
            else:
                edits.append((start, end,
                              ' ' * indent + 'data:\n' + ' ' * (indent + 2) + 'entry_id: "' + entry + '"\n'))
        template = fields.get('value_template')
        if template and "strptime(last_command, '%Y-%m-%d %H:%M:%S')" in template.value:
            edits.append((template.start_mark.index, template.end_mark.index,
                          ">-\n          {% set command_time = state_attr('input_datetime.last_tv_command_time', 'timestamp') %}\n          {{ command_time is number and (as_timestamp(now()) - command_time) > 30 }}"))
        for _, value in node.value: walk(value)
    elif isinstance(node, yaml.SequenceNode):
        for value in node.value: walk(value)

walk(yaml.compose(autos))
assert len(edits) == 8, f'Unexpected automation edit count: {len(edits)}'
for start, end, replacement in sorted(edits, reverse=True):
    autos = autos[:start] + replacement + autos[end:]
yaml.safe_load(autos)
changes['automations.yaml'] = autos

sensor = read('custom_components/hubitat/sensor.py')
sensor = replace_once(sensor, '''        self._attr_native_value: StateType | date | datetime | Decimal = (
            self._get_native_value()
        )
        self._attr_native_unit_of_measurement = self._get_native_unit_of_measurement()''', '''        value = self._get_native_value()
        if self._attribute == "history" and isinstance(value, str):
            # Keep OwnTracks history intact in attributes; HA states are limited to 255 characters.
            self._attr_extra_state_attributes = {"history": value}
            value = value.splitlines()[0][:255] if value else ""
        self._attr_native_value: StateType | date | datetime | Decimal = value
        self._attr_native_unit_of_measurement = self._get_native_unit_of_measurement()''')
ast.parse(sensor)
changes['custom_components/hubitat/sensor.py'] = sensor

client = read('custom_components/flightradar24/api/client.py')
client = replace_once(client, '\n\nclass FlightRadarClient:', '''

def is_rate_limited(error) -> bool:
    """Recognize rate limits from urllib, requests, and FlightRadarAPI errors."""
    response = getattr(error, "response", None)
    return (getattr(error, "code", None) == 429
            or getattr(response, "status_code", None) == 429
            or "HTTP Error 429" in str(error))


class FlightRadarClient:''')
client = replace_once(client, '            except Exception as e:\n                if attempt == REQUEST_ATTEMPTS - 1:', '''            except Exception as e:
                # A rate limit needs a cooldown, not retries after two and four seconds.
                if is_rate_limited(e):
                    raise
                if attempt == REQUEST_ATTEMPTS - 1:''')
ast.parse(client)
changes['custom_components/flightradar24/api/client.py'] = client

coordinator = read('custom_components/flightradar24/coordinator.py')
coordinator = replace_once(coordinator, 'import FlightRadarClient\n', 'import FlightRadarClient, is_rate_limited\n')
coordinator = replace_once(coordinator, '''    async def _update_area_and_tracked(self) -> None:
        await self.hass.async_add_executor_job(self.flight.update_flights_in_area)''', '''    async def _update_area_and_tracked(self) -> None:
        if monotonic() < getattr(self, "_area_retry_at", 0):
            return
        try:
            await self.hass.async_add_executor_job(self.flight.update_flights_in_area)
        except Exception as error:
            if not is_rate_limited(error):
                raise
            self._area_retry_at = monotonic() + 120
            self.logger.warning("FlightRadar24: area feed rate limited; pausing area requests for 120 seconds")
            return''')
ast.parse(coordinator)
changes['custom_components/flightradar24/coordinator.py'] = coordinator

BACKUP.mkdir(parents=True)
shutil.copy2(ROOT / '.storage/core.config_entries', BACKUP / 'core.config_entries.json')
for name, content in changes.items():
    path = ROOT / name
    backup = BACKUP / name
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, backup)
    newline = '\r\n' if b'\r\n' in path.read_bytes() else '\n'
    path.write_bytes(content.replace('\n', newline).encode('utf-8'))
    print('Updated:', name)
print('Backup:', BACKUP)
