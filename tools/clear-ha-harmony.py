"""Remove active Harmony references, preserving useful camera and music flows."""
import json
import shutil
from pathlib import Path
import yaml

ROOT = Path(r'\\192.168.2.125\config')
BACKUP = sorted((ROOT / 'backups_manual').glob('log-cleanup-*'))[-1]
path = ROOT / 'automations.yaml'
text = path.read_text(encoding='utf-8')
parsed = yaml.safe_load(text)
nodes = yaml.compose(text).value
edits = []
removed_ids = {'1722295614758', 'b7632aa0e68d460b8c9663fc4c096a5b', '84e6c1d5b05e4bc6aff56729497e69d4'}
for index, (automation, node) in enumerate(zip(parsed, nodes)):
    if automation.get('id') in removed_ids:
        end = nodes[index + 1].start_mark.index - 2 if index + 1 < len(nodes) else len(text)
        edits.append((node.start_mark.index - 2, end, ''))
        continue
    if 'harmony' not in str(automation).lower(): continue
    fields = {k.value: v for k, v in node.value}
    actions = fields.get('actions', fields.get('action'))
    if actions:
        action_values = automation.get('actions', automation.get('action'))
        for i, (action, action_node) in enumerate(zip(action_values, actions.value)):
            if 'harmony' not in str(action).lower(): continue
            start = action_node.start_mark.index - action_node.start_mark.column
            end = actions.value[i + 1].start_mark.index - actions.value[i + 1].start_mark.column if i + 1 < len(actions.value) else actions.end_mark.index - actions.end_mark.column
            if action.get('enabled') is False:
                edits.append((start, end, ''))
            elif action.get('service') == 'remote.send_command' and action.get('data', {}).get('command') == 'Home':
                indent = ' ' * (action_node.start_mark.column - 2)
                replacement = (indent + '- service: remote.send_command\n' + indent + '  data:\n'
                               + indent + '    command: HOME\n' + indent + '  target:\n'
                               + indent + '    entity_id: remote.bravia_4k_ur2\n')
                edits.append((start, end, replacement))
            elif action.get('service') == 'remote.send_command' and action.get('data', {}).get('command') == 'Mute':
                indent = ' ' * (action_node.start_mark.column - 2)
                replacement = (indent + '- action: script.av_receiver_remote\n' + indent + '  data:\n'
                               + indent + '    command: mute\n')
                edits.append((start, end, replacement))
            else: raise AssertionError('Unexpected active Harmony action')
for start, end, replacement in sorted(edits, reverse=True): text = text[:start] + replacement + text[end:]
text = text.replace('switch.harmony_device_listen_to_music', 'input_boolean.record_player')
text = text.replace('based on Harmony Music switch', 'based on Record Player activity')
new = yaml.safe_load(text)
assert len(new) == len(parsed) - 3
assert 'harmony' not in text.lower()
shutil.copy2(path, BACKUP / 'automations-before-harmony-cleanup.yaml')
path.write_text(text, encoding='utf-8')

path = ROOT / 'configuration.yaml'
text = path.read_text(encoding='utf-8')
fragment = '  last_harmony_activity:\n    name: Last Harmony Activity\n    initial: ""\n'
assert text.count(fragment) == 1
shutil.copy2(path, BACKUP / 'configuration-before-harmony-cleanup.yaml')
text = text.replace(fragment, '')
yaml.compose(text)
path.write_text(text, encoding='utf-8')
print('Removed three obsolete automations and the activity helper.')
print('Camera HOME commands now use Android TV; music uses Record Player activity.')
print('No active Harmony references remain in configuration or automations.')
