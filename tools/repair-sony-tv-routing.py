"""Patch only Sony REST commands and the current-input template, keeping secrets local."""
from pathlib import Path
import re

path=Path(r'\\192.168.2.125\config\configuration.yaml')
backup=Path(__file__).resolve().parents[1]/'backups/theater-controller-repair'
backup.mkdir(parents=True,exist_ok=True)
text=path.read_text(encoding='utf-8')
assert 'sony_tv_select_receiver_hdmi:' not in text, 'Routing repair already installed'
(backup/'configuration-before.yaml').write_text(text,encoding='utf-8')
match=re.search(r'(?ms)^  sony_tv_switch_to_apple_tv:\n.*?(?=^  [a-zA-Z_]|\Z)',text[text.index('rest_command:'):])
assert match
base=match.group(0)
def command(name,payload):
    block=base.replace('sony_tv_switch_to_apple_tv:',name+':',1)
    return re.sub(r'(?m)^    payload:.*$',"    payload: '"+payload+"'",block)
add=command('sony_tv_select_receiver_hdmi','{"method":"setPlayContent","params":[{"uri":"extInput:hdmi?port=3"}],"id":1,"version":"1.0"}')
add+=command('sony_tv_get_playing_content','{"method":"getPlayingContentInfo","params":[],"id":1,"version":"1.0"}')
rest_start=text.index('rest_command:')
insert=rest_start+match.end()
text=text[:insert]+add+text[insert:]
for name in ['sony_tv_switch_to_apple_tv','sony_tv_switch_to_xbox']:
    m=re.search(r'(?ms)^  '+name+r':\n.*?(?=^  [a-zA-Z_]|\Z)',text[text.index('rest_command:'):])
    start=text.index('rest_command:')+m.start();end=text.index('rest_command:')+m.end()
    replacement=re.sub(r'(?m)^    payload:.*$',"    payload: '{\"method\":\"setPlayContent\",\"params\":[{\"uri\":\"extInput:hdmi?port=3\"}],\"id\":1,\"version\":\"1.0\"}'",m.group(0))
    text=text[:start]+replacement+text[end:]
lines=text.splitlines(keepends=True)
start=next(i for i,line in enumerate(lines) if 'unique_id: sony_tv_current_input' in line)+1
indent=len(lines[start])-len(lines[start].lstrip())
end=next((i for i in range(start+1,len(lines)) if lines[i].strip() and len(lines[i])-len(lines[i].lstrip())<=indent),len(lines))
template="""{% set result = value_json.get('result') if value_json is mapping else none %}
{% if result and result[0] %}
  {% set uri = result[0].get('uri', '') %}
  {% set title = result[0].get('title', '') %}
  {% if 'hdmi?port=3' in uri %}
    HDMI 3
  {% elif 'extInput:cec?' in uri %}
    {% set ns = namespace(name='CEC input') %}
    {% for device in states('sensor.sony_tv_cec_devices').split(' ;; ') %}
      {% set parts = device.rsplit('=', 1) %}
      {% if parts | length == 2 and 'extInput:' ~ parts[0] == uri %}{% set ns.name = parts[1] %}{% endif %}
    {% endfor %}
    {{ 'Xbox' if 'xbox' in ns.name | lower else 'Apple TV' if 'apple tv' in ns.name | lower else ns.name }}
  {% else %}
    {{ title if title else 'Unknown' }}
  {% endif %}
{% else %}
  {{ 'Off' if is_state('media_player.bravia_4k_ur2_2', 'off') else 'No Signal' }}
{% endif %}
"""
lines[start:end]=['        value_template: >\n']+['          '+line+'\n' for line in template.splitlines()]
updated=''.join(lines)
path.write_text(updated,encoding='utf-8')
print('Saved explicit HDMI 3 commands and URI-based input labeling; private backup saved locally.')
